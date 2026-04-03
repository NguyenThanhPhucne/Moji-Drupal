import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { v2 as cloudinary } from "cloudinary";
import {
  emitNewMessage,
  updateConversationAfterCreateMessage,
} from "../utils/messageHelper.js";
import { io } from "../socket/index.js";

const buildDirectConversationKey = (userA, userB) => {
  return [String(userA), String(userB)]
    .sort((left, right) => left.localeCompare(right))
    .join(":");
};

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

  if (conversationId) {
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

  if (!["http:", "https:"].includes(targetUrl.protocol)) {
    throw createHttpError(400, "Only http/https URLs are supported");
  }

  const response = await fetch(targetUrl.toString(), {
    method: "GET",
    redirect: "follow",
    headers: {
      "user-agent": "OpenCRM-LinkPreview/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw createHttpError(502, "Failed to fetch target URL");
  }

  const contentType = String(response.headers.get("content-type") || "");
  if (!contentType.includes("text/html")) {
    return {
      url: targetUrl.toString(),
      siteName: targetUrl.hostname,
      title: targetUrl.hostname,
      description: "Preview is available for HTML pages only.",
      image: "",
    };
  }

  const html = await response.text();
  const title =
    extractMetaContent(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    extractMetaContent(html, /<title[^>]*>([^<]+)<\/title>/i) ||
    targetUrl.hostname;

  const description =
    extractMetaContent(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    extractMetaContent(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);

  const image =
    extractMetaContent(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    "";

  const siteName =
    extractMetaContent(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
    targetUrl.hostname;

  return {
    url: targetUrl.toString(),
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
    const uploadedImgUrl = await uploadMessageImage(imgUrl);

    if (!normalizedContent && !uploadedImgUrl) {
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

    let message = await Message.create({
      conversationId: conversation._id,
      senderId,
      content: normalizedContent,
      imgUrl: uploadedImgUrl,
      replyTo: replyTo || null,
    });

    if (replyTo) {
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
    const uploadedImgUrl = await uploadMessageImage(imgUrl);

    if (!normalizedContent && !uploadedImgUrl) {
      return res.status(400).json({ message: "Thiếu nội dung hoặc hình ảnh" });
    }

    let message = await Message.create({
      conversationId,
      senderId,
      content: normalizedContent,
      imgUrl: uploadedImgUrl,
      replyTo: replyTo || null,
    });

    if (replyTo) {
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

    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString() && r.emoji === emoji,
    );

    if (existingReactionIndex > -1) {
      message.reactions.splice(existingReactionIndex, 1);
    } else {
      message.reactions = message.reactions.filter(
        (r) => r.userId.toString() !== userId.toString(),
      );
      message.reactions.push({ userId, emoji });
    }

    await message.save();

    io.to(message.conversationId.toString()).emit("message-reacted", {
      conversationId: message.conversationId,
      messageId: message._id,
      reactions: message.reactions,
    });

    return res.status(200).json(message);
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

    message.isDeleted = true;
    message.content = "";
    message.imgUrl = null;
    await message.save();

    const updatedConversation = await Conversation.findOneAndUpdate(
      {
        _id: message.conversationId,
        "lastMessage._id": message._id.toString(),
      },
      {
        $set: {
          "lastMessage.content": "This message was removed",
          "lastMessage.createdAt": message.createdAt,
        },
      },
      { new: true },
    );

    io.to(message.conversationId.toString()).emit("message-deleted", {
      conversationId: message.conversationId,
      messageId: message._id,
      content: message.content,
      conversation: updatedConversation
        ? {
            _id: updatedConversation._id,
            lastMessage: {
              _id: updatedConversation.lastMessage?._id,
              content: updatedConversation.lastMessage?.content,
              createdAt: updatedConversation.lastMessage?.createdAt,
              sender: {
                _id:
                  updatedConversation.lastMessage?.senderId?.toString?.() ||
                  updatedConversation.lastMessage?.senderId,
                displayName: "",
                avatarUrl: null,
              },
            },
            lastMessageAt: updatedConversation.lastMessageAt,
            unreadCounts:
              updatedConversation.unreadCounts instanceof Map
                ? Object.fromEntries(updatedConversation.unreadCounts)
                : updatedConversation.unreadCounts || {},
            seenBy: (updatedConversation.seenBy || []).map(
              (id) => id?.toString?.() || id,
            ),
          }
        : null,
    });

    return res.status(200).json({ message, conversation: updatedConversation });
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
    const alreadyHidden = message.hiddenFor.some(
      (hiddenUserId) => hiddenUserId.toString() === userIdStr,
    );

    if (!alreadyHidden) {
      message.hiddenFor.push(userId);
      await message.save();
    }

    io.to(userIdStr).emit("message-hidden-for-user", {
      conversationId: message.conversationId,
      messageId: message._id,
    });

    return res.status(200).json({ success: true });
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

    message.content = content.trim();
    message.editedAt = new Date();
    await message.save();

    io.to(message.conversationId.toString()).emit("message-edited", {
      conversationId: message.conversationId,
      messageId: message._id,
      content: message.content,
      editedAt: message.editedAt,
    });

    return res.status(200).json(message);
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
      await Message.findById(messageId).select("conversationId");

    if (!existingMessage)
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });

    const isMember = await ensureConversationMembership(
      existingMessage.conversationId,
      userId,
    );
    if (!isMember) {
      return res.status(403).json({ message: "Không có quyền thao tác" });
    }

    const message = await Message.findByIdAndUpdate(
      messageId,
      { $addToSet: { readBy: userId } },
      { new: true },
    );

    if (!message)
      return res.status(404).json({ message: "Không tìm thấy tin nhắn" });

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
