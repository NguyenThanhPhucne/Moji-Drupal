import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";
import {
  emitNewMessage,
  updateConversationAfterCreateMessage,
  invalidateConversationParticipantsCache
} from "../utils/messageHelper.js";
import { destroyImageFromUrl } from "../utils/cloudinaryHelper.js";
import { io } from "../socket/index.js";
import { registerRateLimitHit } from "../utils/antiSpam.js";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

import { buildDirectConversationKey } from "../services/conversationService.js";

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const ensureDirectConversationForSend = async ({
  conversationId,
  senderId,
  recipientId,
}) => {
  let conversation = null;
  let isNewConversation = false;

  if (conversationId && mongoose.isValidObjectId(conversationId)) {
    conversation = await Conversation.findById(conversationId);

    const isMember = conversation?.participants?.some(
      (participant) => participant.userId.toString() === senderId.toString(),
    );

    if (conversation && !isMember) {
      throw createHttpError(403, "Không có quyền gửi tin nhắn");
    }
  }

  if (conversation) {
    return { conversation, isNewConversation };
  }

  const directKey = buildDirectConversationKey(senderId, recipientId);

  conversation = await Conversation.findOne({
    type: "direct",
    directKey,
  });

  if (conversation) {
    return { conversation, isNewConversation };
  }

  try {
    conversation = await Conversation.create({
      type: "direct",
      directKey,
      participants: [
        { userId: senderId, joinedAt: new Date() },
        { userId: recipientId, joinedAt: new Date() },
      ],
      lastMessageAt: new Date(),
      unreadCounts: new Map(),
    });

    isNewConversation = true;
  } catch (createError) {
    if (createError?.code !== 11000) {
      throw createError;
    }

    conversation = await Conversation.findOne({
      type: "direct",
      directKey,
    });
  }

  if (!conversation) {
    throw createHttpError(500, "Không thể tạo cuộc trò chuyện trực tiếp");
  }

  return { conversation, isNewConversation };
};

const emitDirectConversationCreated = async ({
  conversation,
  senderId,
}) => {
  await conversation.populate([
    { path: "participants.userId", select: "displayName avatarUrl" },
    { path: "seenBy", select: "displayName avatarUrl" },
    { path: "lastMessage.senderId", select: "displayName avatarUrl" },
  ]);

  const participants = (conversation.participants || []).map((p) => ({
    _id: p.userId?._id,
    displayName: p.userId?.displayName,
    avatarUrl: p.userId?.avatarUrl ?? null,
    joinedAt: p.joinedAt,
  }));

  const formattedConversation = {
    ...conversation.toObject(),
    participants,
    unreadCounts: conversation.unreadCounts || {},
  };

  conversation.participants.forEach((participant) => {
    const participantId = participant.userId?._id || participant.userId;
    if (participantId && participantId.toString() !== senderId.toString()) {
      io.to(participantId.toString()).emit("new-conversation", formattedConversation);
    }
  });
};

const ensureConversationMembership = async (conversationId, userId) => {
  const membership = await Conversation.exists({
    _id: conversationId,
    "participants.userId": userId,
  });

  return Boolean(membership);
};

const toStringId = (value) => value?.toString?.() || String(value || "");

const isJoinLinkActive = (joinLink) => {
  const expiresAt = joinLink?.expiresAt ? new Date(joinLink.expiresAt) : null;
  return Boolean(expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.now());
};

const toJoinLinkMeta = (joinLink) => {
  if (!joinLink?.expiresAt) {
    return null;
  }

  return {
    expiresAt: joinLink.expiresAt,
    createdAt: joinLink.createdAt || null,
    createdBy: toStringId(joinLink.createdBy),
    isActive: isJoinLinkActive(joinLink),
  };
};

const isGroupConversationAdmin = (conversation, userId) => {
  const normalizedUserId = toStringId(userId);
  const creatorId = toStringId(conversation?.group?.createdBy);
  if (creatorId && creatorId === normalizedUserId) {
    return true;
  }

  return (conversation?.group?.adminIds || []).some(
    (adminId) => toStringId(adminId) === normalizedUserId,
  );
};

const toGroupConversationUpdatePayload = (conversation) => {
  const group = conversation?.group?.toObject
    ? conversation.group.toObject()
    : conversation?.group || {};
  const pinnedMessage = conversation?.pinnedMessage?.toObject
    ? conversation.pinnedMessage.toObject()
    : conversation?.pinnedMessage || null;

  return {
    _id: toStringId(conversation?._id),
    group: {
      ...group,
      createdBy: toStringId(group.createdBy),
      adminIds: (group.adminIds || []).map((adminId) => toStringId(adminId)),
      announcementOnly: Boolean(group.announcementOnly),
      joinLink: toJoinLinkMeta(group.joinLink),
    },
    pinnedMessage: pinnedMessage
      ? {
          ...pinnedMessage,
          senderId: toStringId(pinnedMessage.senderId),
          pinnedBy: toStringId(pinnedMessage.pinnedBy),
        }
      : null,
    updatedAt: conversation?.updatedAt || null,
  };
};

const formatConversationSyncPayload = (conversation) => {
  if (!conversation) {
    return null;
  }

  return {
    _id: conversation._id,
    lastMessage: {
      _id: conversation.lastMessage?._id,
      content: conversation.lastMessage?.content,
      createdAt: conversation.lastMessage?.createdAt,
      sender: {
        _id:
          conversation.lastMessage?.senderId?.toString?.() ||
          conversation.lastMessage?.senderId,
        displayName: "",
        avatarUrl: null,
      },
    },
    lastMessageAt: conversation.lastMessageAt,
    unreadCounts:
      conversation.unreadCounts instanceof Map
        ? Object.fromEntries(conversation.unreadCounts)
        : conversation.unreadCounts || {},
    seenBy: (conversation.seenBy || []).map((id) => id?.toString?.() || id),
  };
};

const REMOVED_MESSAGE_CONTENT = "This message was removed";

const normalizeReplyToId = (replyTo) => {
  const normalized = String(replyTo || "").trim();
  return normalized || null;
};

const resolveValidatedReplyTo = async ({
  replyTo,
  conversationId,
}) => {
  const normalizedReplyTo = normalizeReplyToId(replyTo);
  if (!normalizedReplyTo) {
    return null;
  }

  const replyTarget = await Message.findById(normalizedReplyTo)
    .select("_id conversationId")
    .lean();

  if (!replyTarget) {
    throw createHttpError(404, "Không tìm thấy tin nhắn trả lời");
  }

  if (String(replyTarget.conversationId) !== String(conversationId)) {
    throw createHttpError(
      400,
      "Tin nhắn trả lời phải thuộc cùng cuộc trò chuyện",
    );
  }

  return replyTarget._id;
};

const uploadMessageImage = async (rawImgUrl) => {
  const normalized = String(rawImgUrl || "").trim();
  if (!normalized) {
    return null;
  }

  // If already an http(s) URL, trust and keep it as-is.
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  if (!normalized.startsWith("data:image/")) {
    throw createHttpError(400, "Unsupported image format");
  }

  let result;
  try {
    result = await cloudinary.uploader.upload(normalized, {
      folder: "coming_chat/messages",
      resource_type: "image",
    });
  } catch (error) {
    const rawMessage = String(error?.message || error?.error?.message || "");
    const normalizedMessage = rawMessage.toLowerCase();
    const cloudinaryHttpCode = Number(
      error?.http_code || error?.error?.http_code || 0,
    );

    const isCredentialError =
      normalizedMessage.includes("invalid signature") ||
      normalizedMessage.includes("api_secret mismatch") ||
      normalizedMessage.includes("api key") ||
      normalizedMessage.includes("cloud name") ||
      cloudinaryHttpCode === 401;

    if (isCredentialError) {
      throw createHttpError(
        500,
        "Cloudinary credentials mismatch. Please verify CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
      );
    }

    throw createHttpError(502, "Image upload provider is temporarily unavailable");
  }

  return result.secure_url;
};

const sanitizeMetaValue = (input) => {
  return String(input || "")
    .replaceAll(/\s+/g, " ")
    .trim();
};

const extractMetaContent = (html, matcher) => {
  const match = html.match(matcher);
  return sanitizeMetaValue(match?.[1] || "");
};

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const LINK_PREVIEW_TIMEOUT_MS = toPositiveNumber(
  process.env.LINK_PREVIEW_TIMEOUT_MS,
  5000,
);
const LINK_PREVIEW_MAX_REDIRECTS = Math.min(
  toPositiveNumber(process.env.LINK_PREVIEW_MAX_REDIRECTS, 3),
  5,
);
const LINK_PREVIEW_MAX_HTML_BYTES = Math.max(
  toPositiveNumber(process.env.LINK_PREVIEW_MAX_HTML_BYTES, 512 * 1024),
  128 * 1024,
);
const LINK_PREVIEW_BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.azure.internal",
  "169.254.169.254",
]);

const isPrivateOrReservedIPv4 = (ipAddress) => {
  const segments = ipAddress.split(".").map(Number);
  if (segments.length !== 4 || segments.some((segment) => !Number.isInteger(segment))) {
    return true;
  }

  const [a, b] = segments;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;

  return false;
};

const isPrivateOrReservedIPv6 = (ipAddress) => {
  const normalized = ipAddress.toLowerCase();

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.replace("::ffff:", "");
    if (net.isIP(mapped) === 4 && isPrivateOrReservedIPv4(mapped)) {
      return true;
    }
  }

  return false;
};

const assertPublicAddress = (ipAddress) => {
  const ipVersion = net.isIP(ipAddress);
  if (ipVersion === 0) {
    throw createHttpError(400, "Invalid URL host address");
  }

  if (
    (ipVersion === 4 && isPrivateOrReservedIPv4(ipAddress)) ||
    (ipVersion === 6 && isPrivateOrReservedIPv6(ipAddress))
  ) {
    throw createHttpError(400, "Blocked URL host");
  }
};

const assertSafePreviewTarget = async (targetUrl) => {
  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw createHttpError(400, "Only http/https URLs are supported");
  }

  if (targetUrl.username || targetUrl.password) {
    throw createHttpError(400, "Credentials in URL are not allowed");
  }

  const normalizedHostname = String(targetUrl.hostname || "").toLowerCase();
  if (
    !normalizedHostname ||
    normalizedHostname.endsWith(".localhost") ||
    LINK_PREVIEW_BLOCKED_HOSTNAMES.has(normalizedHostname)
  ) {
    throw createHttpError(400, "Blocked URL host");
  }

  if (targetUrl.port && !["80", "443"].includes(targetUrl.port)) {
    throw createHttpError(400, "Only ports 80 and 443 are allowed for preview");
  }

  const hostnameIpVersion = net.isIP(normalizedHostname);
  if (hostnameIpVersion > 0) {
    assertPublicAddress(normalizedHostname);
    return;
  }

  let resolvedRecords = [];
  try {
    resolvedRecords = await dnsLookup(normalizedHostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw createHttpError(400, "Cannot resolve URL host");
  }

  if (!resolvedRecords.length) {
    throw createHttpError(400, "Cannot resolve URL host");
  }

  for (const record of resolvedRecords) {
    assertPublicAddress(record.address);
  }
};

const isRedirectStatusCode = (statusCode) =>
  [301, 302, 303, 307, 308].includes(Number(statusCode));

const fetchWithTimeout = async (targetUrl) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LINK_PREVIEW_TIMEOUT_MS,
  );

  try {
    return await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": "OpenCRM-LinkPreview/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createHttpError(504, "Preview request timed out");
    }

    throw createHttpError(502, "Failed to fetch target URL");
  } finally {
    clearTimeout(timeout);
  }
};

const fetchLinkPreviewResponse = async (initialUrl) => {
  let currentUrl = new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= LINK_PREVIEW_MAX_REDIRECTS; redirectCount += 1) {
    await assertSafePreviewTarget(currentUrl);

    const response = await fetchWithTimeout(currentUrl);
    if (!isRedirectStatusCode(response.status)) {
      return {
        response,
        finalUrl: currentUrl,
      };
    }

    const location = String(response.headers.get("location") || "").trim();
    if (response.body) {
      try {
        await response.body.cancel();
      } catch {
        // ignore body cancellation issues for redirect responses
      }
    }

    if (!location) {
      throw createHttpError(502, "Invalid redirect response");
    }

    try {
      currentUrl = new URL(location, currentUrl);
    } catch {
      throw createHttpError(502, "Invalid redirect URL");
    }
  }

  throw createHttpError(502, "Too many redirects");
};

const readResponseTextWithLimit = async (response) => {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > LINK_PREVIEW_MAX_HTML_BYTES) {
      throw createHttpError(413, "Preview content is too large");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > LINK_PREVIEW_MAX_HTML_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // ignore stream cancel errors
      }
      throw createHttpError(413, "Preview content is too large");
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
};

const toAbsoluteUrl = (rawValue, baseUrl) => {
  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    const absolute = new URL(normalized, baseUrl);
    if (!["http:", "https:"].includes(absolute.protocol)) {
      return "";
    }

    return absolute.toString();
  } catch {
    return "";
  }
};

const resolveLinkMetadata = async (rawUrl) => {
  const normalized = String(rawUrl || "").trim();
  if (!normalized) {
    throw createHttpError(400, "Missing url query param");
  }

  let targetUrl;
  try {
    targetUrl = new URL(normalized);
  } catch {
    throw createHttpError(400, "Invalid URL");
  }

  const { response, finalUrl } = await fetchLinkPreviewResponse(targetUrl);

  if (!response.ok) {
    throw createHttpError(502, "Failed to fetch target URL");
  }

  const contentType = String(response.headers.get("content-type") || "");
  if (!contentType.includes("text/html")) {
    return {
      url: finalUrl.toString(),
      siteName: finalUrl.hostname,
      title: finalUrl.hostname,
      description: "Preview is available for HTML pages only.",
      image: "",
    };
  }

  const html = await readResponseTextWithLimit(response);
  const title =
    extractMetaContent(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    extractMetaContent(html, /<title[^>]*>([^<]+)<\/title>/i) ||
    finalUrl.hostname;

  const description =
    extractMetaContent(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    extractMetaContent(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);

  const rawImage =
    extractMetaContent(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    "";
  const image = toAbsoluteUrl(rawImage, finalUrl);

  const siteName =
    extractMetaContent(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
    finalUrl.hostname;

  return {
    url: finalUrl.toString(),
    siteName,
    title,
    description,
    image,
  };
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export const sendDirectMessage = async (req, res) => {
  try {
    const { recipientId, content, imgUrl, conversationId, replyTo } = req.body;
    const senderId = req.user._id;
    const normalizedContent = String(content || "").trim();
    const hasImagePayload = Boolean(String(imgUrl || "").trim());

    if (!conversationId && !recipientId) {
      return res
        .status(400)
        .json({ message: "Thiếu recipientId cho cuộc trò chuyện trực tiếp mới" });
    }

    if (!normalizedContent && !hasImagePayload) {
      return res.status(400).json({ message: "Thiếu nội dung hoặc hình ảnh" });
    }

    if (String(recipientId) === String(senderId)) {
      return res.status(400).json({ message: "Không thể tự nhắn cho chính mình" });
    }

    const { conversation, isNewConversation } =
      await ensureDirectConversationForSend({
        conversationId,
        senderId,
        recipientId,
      });

    const antiSpamResult = registerRateLimitHit({
      userId: senderId,
      scope: "message:direct",
      conversationId: conversation._id,
    });

    if (!antiSpamResult.allowed) {
      return res.status(429).json({
        message: `You're sending messages too fast. Try again in ${antiSpamResult.retryAfterSeconds}s.`,
      });
    }

    const uploadedImgUrl = await uploadMessageImage(imgUrl);

    const validatedReplyTo = await resolveValidatedReplyTo({
      replyTo,
      conversationId: conversation._id,
    });

    let message = await Message.create({
      conversationId: conversation._id,
      senderId,
      content: normalizedContent,
      imgUrl: uploadedImgUrl,
      replyTo: validatedReplyTo,
    });

    if (validatedReplyTo) {
      message = await message.populate("replyTo", "content senderId");
    }

    updateConversationAfterCreateMessage(conversation, message, senderId);

    await conversation.save();

    // Người nhận chưa chắc đã join room của conversation mới,
    // nên cần gửi sự kiện new-conversation vào user room trước.
    if (isNewConversation) {
      await emitDirectConversationCreated({ conversation, senderId });
    }

    emitNewMessage(io, conversation, message);

    return res.status(201).json({ message });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error("Lỗi xảy ra khi gửi tin nhắn trực tiếp", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { conversationId, content, imgUrl, replyTo } = req.body;
    const senderId = req.user._id;
    const conversation = req.conversation;
    const normalizedContent = String(content || "").trim();
    const hasImagePayload = Boolean(String(imgUrl || "").trim());

    const isAnnouncementOnly = Boolean(conversation?.group?.announcementOnly);
    if (isAnnouncementOnly && !isGroupConversationAdmin(conversation, senderId)) {
      return res.status(403).json({
        message: "Only admins can send messages while announcement mode is enabled",
      });
    }

    if (!normalizedContent && !hasImagePayload) {
      return res.status(400).json({ message: "Thiếu nội dung hoặc hình ảnh" });
    }

    const antiSpamResult = registerRateLimitHit({
      userId: senderId,
      scope: "message:group",
      conversationId,
    });

    if (!antiSpamResult.allowed) {
      return res.status(429).json({
        message: `You're sending messages too fast. Try again in ${antiSpamResult.retryAfterSeconds}s.`,
      });
    }

    const uploadedImgUrl = await uploadMessageImage(imgUrl);
    const validatedReplyTo = await resolveValidatedReplyTo({
      replyTo,
      conversationId,
    });

    let message = await Message.create({
      conversationId,
      senderId,
      content: normalizedContent,
      imgUrl: uploadedImgUrl,
      replyTo: validatedReplyTo,
    });

    if (validatedReplyTo) {
      message = await message.populate("replyTo", "content senderId");
    }

    updateConversationAfterCreateMessage(conversation, message, senderId);

    await conversation.save();
    emitNewMessage(io, conversation, message);

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Lỗi xảy ra khi gửi tin nhắn nhóm", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const reactToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;
    const normalizedEmoji = String(emoji || "").trim();

    if (!normalizedEmoji || normalizedEmoji.length > 16) {
      return res.status(400).json({ message: "Biểu cảm không hợp lệ" });
    }

    const message = await Message.findById(messageId).select(
      "_id conversationId isDeleted",
    );
    if (!message)
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });

    if (message.isDeleted) {
      return res
        .status(400)
        .json({ message: "Không thể thả cảm xúc cho tin nhắn đã gỡ" });
    }

    const isMember = await ensureConversationMembership(
      message.conversationId,
      userId,
    );
    if (!isMember) {
      return res.status(403).json({ message: "Không có quyền thao tác" });
    }

    const removeResult = await Message.updateOne(
      {
        _id: messageId,
        isDeleted: { $ne: true },
        reactions: { $elemMatch: { userId, emoji: normalizedEmoji } },
      },
      {
        $pull: {
          reactions: { userId, emoji: normalizedEmoji },
        },
      },
    );

    if (!removeResult.modifiedCount) {
      await Message.updateOne(
        {
          _id: messageId,
          isDeleted: { $ne: true },
        },
        [
          {
            $set: {
              reactions: {
                $filter: {
                  input: "$reactions",
                  as: "reaction",
                  cond: {
                    $ne: ["$$reaction.userId", userId],
                  },
                },
              },
            },
          },
          {
            $set: {
              reactions: {
                $concatArrays: ["$reactions", [{ userId, emoji: normalizedEmoji }]],
              },
            },
          },
        ],
      );
    }

    const updatedMessage = await Message.findById(messageId).select(
      "_id conversationId reactions isDeleted updatedAt",
    );
    if (!updatedMessage) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
    }

    if (updatedMessage.isDeleted) {
      return res
        .status(409)
        .json({ message: "Tin nhắn đã bị gỡ trong lúc cập nhật biểu cảm" });
    }

    io.to(updatedMessage.conversationId.toString()).emit("message-reacted", {
      conversationId: updatedMessage.conversationId,
      messageId: updatedMessage._id,
      reactions: updatedMessage.reactions,
      updatedAt: updatedMessage.updatedAt,
    });

    return res.status(200).json(updatedMessage);
  } catch (error) {
    console.error("Lỗi khi phản hồi tin nhắn:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const unsendMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message)
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });

    const isMember = await ensureConversationMembership(
      message.conversationId,
      userId,
    );
    if (!isMember) {
      return res.status(403).json({ message: "Không có quyền thao tác" });
    }

    if (message.senderId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Không có quyền gỡ tin nhắn này" });
    }

    const shouldNormalizeDeletedPayload =
      !message.isDeleted ||
      message.content !== REMOVED_MESSAGE_CONTENT ||
      message.imgUrl !== null ||
      message.reactions.length > 0 ||
      message.readBy.length > 0 ||
      Boolean(message.replyTo);

    if (!shouldNormalizeDeletedPayload) {
      return res.status(200).json({
        message,
        conversation: null,
      });
    }

    const deletedMessage = await Message.findOneAndUpdate(
      {
        _id: messageId,
        senderId: userId,
        isDeleted: { $ne: true },
      },
      {
        $set: {
          isDeleted: true,
          content: REMOVED_MESSAGE_CONTENT,
          imgUrl: null,
          replyTo: null,
          reactions: [],
          readBy: [],
          editedAt: new Date(),
        },
      },
      { new: true },
    );

    // Another request may have already deleted this message concurrently.
    // In that case, return idempotent success with the canonical latest state.
    if (!deletedMessage) {
      const latestMessage = await Message.findById(messageId);
      if (!latestMessage) {
        return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
      }

      return res.status(200).json({
        message: latestMessage,
        conversation: null,
      });
    }

    if (message.imgUrl) {
      destroyImageFromUrl(message.imgUrl).catch((cleanupError) => {
        console.error(
          "[unsendMessage] Image cleanup failed after successful message delete",
          cleanupError,
        );
      });
    }

    // Update conversation preview independently — message deletion succeeds even if
    // this step fails, avoiding partial-rollback confusion. Log discrepancy clearly.
    let updatedConversation = null;
    try {
      updatedConversation = await Conversation.findOneAndUpdate(
        {
          _id: deletedMessage.conversationId,
          "lastMessage._id": deletedMessage._id.toString(),
        },
        {
          $set: {
            "lastMessage.content": REMOVED_MESSAGE_CONTENT,
            "lastMessage.createdAt": deletedMessage.createdAt,
          },
        },
        { new: true },
      );

      const clearedPinnedConversation = await Conversation.findOneAndUpdate(
        {
          _id: deletedMessage.conversationId,
          "pinnedMessage._id": deletedMessage._id.toString(),
        },
        {
          $set: {
            pinnedMessage: null,
          },
        },
        { new: true },
      );

      if (clearedPinnedConversation) {
        io.to(deletedMessage.conversationId.toString()).emit("group-conversation-updated", {
          conversation: toGroupConversationUpdatePayload(clearedPinnedConversation),
        });
      }
    } catch (convUpdateError) {
      console.error(
        "[unsendMessage] Conversation preview update failed after message deletion. " +
          "Message is deleted in DB but lastMessage preview may be stale.",
        convUpdateError,
      );
    }

    io.to(deletedMessage.conversationId.toString()).emit("message-deleted", {
      conversationId: deletedMessage.conversationId,
      messageId: deletedMessage._id,
      content: deletedMessage.content,
      editedAt: deletedMessage.editedAt,
      reactions: deletedMessage.reactions,
      readBy: deletedMessage.readBy,
      replyTo: deletedMessage.replyTo,
      conversation: formatConversationSyncPayload(updatedConversation),
    });

    const conversationToInvalidate = await Conversation.findById(deletedMessage.conversationId).select("participants");
    invalidateConversationParticipantsCache(conversationToInvalidate).catch(console.error);

    return res.status(200).json({
      message: deletedMessage,
      conversation: formatConversationSyncPayload(updatedConversation),
    });
  } catch (error) {
    console.error("Lỗi khi gỡ tin nhắn:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const removeMessageForMe = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
    }

    const isMember = await ensureConversationMembership(
      message.conversationId,
      userId,
    );
    if (!isMember) {
      return res.status(403).json({ message: "Không có quyền thao tác" });
    }

    const userIdStr = userId.toString();

    const hideResult = await Message.updateOne(
      {
        _id: messageId,
        hiddenFor: { $ne: userId },
      },
      {
        $addToSet: { hiddenFor: userId },
      },
    );

    if (hideResult.modifiedCount) {
      io.to(userIdStr).emit("message-hidden-for-user", {
        conversationId: message.conversationId,
        messageId: message._id,
      });
    }

    return res.status(200).json({
      success: true,
      alreadyHidden: !hideResult.modifiedCount,
    });
  } catch (error) {
    console.error("Lỗi khi gỡ tin nhắn ở phía bạn:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Edit message — sender can edit own non-deleted message
export const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    if (!content?.trim()) {
      return res.status(400).json({ message: "Nội dung không được trống" });
    }

    const message = await Message.findById(messageId);
    if (!message)
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });

    const isMember = await ensureConversationMembership(
      message.conversationId,
      userId,
    );
    if (!isMember) {
      return res.status(403).json({ message: "Không có quyền thao tác" });
    }

    if (message.senderId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Không có quyền sửa tin nhắn này" });
    }
    if (message.isDeleted) {
      return res
        .status(400)
        .json({ message: "Không thể sửa tin nhắn đã bị gỡ" });
    }

    const normalizedContent = content.trim();

    if (normalizedContent === message.content) {
      return res.status(200).json(message);
    }

    const editedAt = new Date();
    const updatedMessage = await Message.findOneAndUpdate(
      {
        _id: messageId,
        senderId: userId,
        isDeleted: { $ne: true },
      },
      {
        $set: {
          content: normalizedContent,
          editedAt,
        },
      },
      { new: true },
    );

    if (!updatedMessage) {
      return res.status(409).json({
        message: "Tin nhắn đã bị gỡ hoặc thay đổi trước khi hoàn tất chỉnh sửa",
      });
    }

    const updatedConversation = await Conversation.findOneAndUpdate(
      {
        _id: updatedMessage.conversationId,
        "lastMessage._id": updatedMessage._id.toString(),
      },
      {
        $set: {
          "lastMessage.content": updatedMessage.content,
          "lastMessage.createdAt": updatedMessage.createdAt,
        },
      },
      { new: true },
    );

    io.to(updatedMessage.conversationId.toString()).emit("message-edited", {
      conversationId: updatedMessage.conversationId,
      messageId: updatedMessage._id,
      content: updatedMessage.content,
      editedAt: updatedMessage.editedAt,
      conversation: formatConversationSyncPayload(updatedConversation),
    });

    return res.status(200).json({
      message: updatedMessage,
      conversation: formatConversationSyncPayload(updatedConversation),
    });
  } catch (error) {
    console.error("Lỗi khi sửa tin nhắn:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Mark message as read
export const markMessageRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const existingMessage =
      await Message.findById(messageId).select("conversationId isDeleted");

    if (!existingMessage)
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });

    if (existingMessage.isDeleted) {
      return res
        .status(400)
        .json({ message: "Không thể đánh dấu đã đọc cho tin nhắn đã gỡ" });
    }

    const isMember = await ensureConversationMembership(
      existingMessage.conversationId,
      userId,
    );
    if (!isMember) {
      return res.status(403).json({ message: "Không có quyền thao tác" });
    }

    const updateResult = await Message.updateOne(
      {
        _id: messageId,
        isDeleted: { $ne: true },
        readBy: { $ne: userId },
      },
      { $addToSet: { readBy: userId } },
    );

    if (!updateResult.modifiedCount) {
      return res.status(200).json({ ok: true, alreadyRead: true });
    }

    const message = await Message.findById(messageId).select(
      "_id conversationId readBy",
    );

    if (!message) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
    }

    io.to(message.conversationId.toString()).emit("message-read", {
      conversationId: message.conversationId,
      messageId: message._id,
      readBy: message.readBy,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Lỗi khi đánh dấu đã đọc:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getLinkPreview = async (req, res) => {
  try {
    const preview = await resolveLinkMetadata(req.query.url);
    return res.status(200).json({ preview });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error("Link preview error:", error);
    return res.status(500).json({ message: "System error" });
  }
};

const normalizeForwardTargets = ({ recipientIds, groupIds } = {}) => {
  return {
    recipientIds: Array.isArray(recipientIds) ? recipientIds : [],
    groupIds: Array.isArray(groupIds) ? groupIds : [],
  };
};

const buildForwardDeniedResponse = ({ originalMessage, senderId }) => {
  if (originalMessage.isDeleted) {
    return {
      status: 400,
      message: "Không thể forward tin nhắn đã thu hồi",
    };
  }

  if (
    originalMessage.isForwardable === false &&
    String(originalMessage.senderId) !== String(senderId)
  ) {
    return {
      status: 403,
      message: "Chủ sở hữu tin nhắn không cho phép forward",
    };
  }

  return null;
};

const forwardToDirectRecipient = async ({ recipientId, senderId, originalMessage }) => {
  try {
    const { conversation, isNewConversation } = await ensureDirectConversationForSend({
      conversationId: null,
      senderId,
      recipientId,
    });

    let message = await Message.create({
      conversationId: conversation._id,
      senderId,
      content: originalMessage.content,
      imgUrl: originalMessage.imgUrl,
      forwardedFrom: originalMessage.senderId,
    });

    message = await message.populate("forwardedFrom", "displayName avatarUrl");

    updateConversationAfterCreateMessage(conversation, message, senderId);
    await conversation.save();

    if (isNewConversation) {
      await emitDirectConversationCreated({ conversation, senderId });
    }

    emitNewMessage(io, conversation, message);
    return message;
  } catch (error) {
    console.error(`Error forwarding to user ${recipientId}:`, error);
    return null;
  }
};

const forwardToGroupConversation = async ({ groupId, senderId, originalMessage }) => {
  try {
    const conversation = await Conversation.findById(groupId);
    if (!conversation) {
      return null;
    }

    const isMember = conversation.participants.some(
      (participant) => String(participant.userId) === String(senderId),
    );
    if (!isMember) {
      return null;
    }

    let message = await Message.create({
      conversationId: conversation._id,
      senderId,
      content: originalMessage.content,
      imgUrl: originalMessage.imgUrl,
      forwardedFrom: originalMessage.senderId,
    });

    message = await message.populate("forwardedFrom", "displayName avatarUrl");

    updateConversationAfterCreateMessage(conversation, message, senderId);
    await conversation.save();

    emitNewMessage(io, conversation, message);
    return message;
  } catch (error) {
    console.error(`Error forwarding to group ${groupId}:`, error);
    return null;
  }
};

export const forwardMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { recipientIds, groupIds } = normalizeForwardTargets(req.body || {});
    const senderId = req.user._id;

    if (!recipientIds.length && !groupIds.length) {
      return res.status(400).json({ message: "Thiếu danh sách người nhận đích" });
    }

    const originalMessage = await Message.findById(messageId);
    if (!originalMessage) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn gốc" });
    }

    const deniedResponse = buildForwardDeniedResponse({
      originalMessage,
      senderId,
    });
    if (deniedResponse) {
      return res.status(deniedResponse.status).json({ message: deniedResponse.message });
    }

    const [directMessages, groupMessages] = await Promise.all([
      Promise.all(
        recipientIds.map((recipientId) =>
          forwardToDirectRecipient({ recipientId, senderId, originalMessage }),
        ),
      ),
      Promise.all(
        groupIds.map((groupId) =>
          forwardToGroupConversation({ groupId, senderId, originalMessage }),
        ),
      ),
    ]);

    const forwardedCount = [...directMessages, ...groupMessages].filter(Boolean).length;

    return res.status(201).json({ message: "Chuyển tiếp thành công", count: forwardedCount });
  } catch (error) {
    console.error("Lỗi khi forward tin nhắn:", error);
    return res.status(500).json({ message: "Lỗi hệ thống khi forward" });
  }
};

export const toggleForwardable = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { isForwardable } = req.body;
    const senderId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });
    }

    if (String(message.senderId) !== String(senderId)) {
      return res.status(403).json({ message: "Chỉ người gửi mới có quyền thay đổi bảo mật của tin nhắn" });
    }

    message.isForwardable = isForwardable;
    await message.save();

    // Inform clients via socket that the message was updated (optional, or just rely on state)
    io.to(message.conversationId.toString()).emit("message-updated", {
      conversationId: message.conversationId,
      message,
    });

    return res.status(200).json({ message: "Đã cập nhật quyền privacy của tin nhắn", isForwardable: message.isForwardable });
  } catch (error) {
    console.error("Lỗi khi toggle privacy tin nhắn:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
