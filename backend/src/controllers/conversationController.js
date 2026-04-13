import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Bookmark from "../models/Bookmark.js";
import Notification from "../models/Notification.js";
import ContentReport from "../models/ContentReport.js";
import User from "../models/User.js";
import { io } from "../socket/index.js";
import mongoose from "mongoose";
import { createHash, randomBytes } from "node:crypto";
import { destroyImageFromUrl } from "../utils/cloudinaryHelper.js";
import { getCachedData, setCachedData, invalidateCache } from "../libs/redis.js";

const DEFAULT_MESSAGE_PAGE_LIMIT = 50;
const MAX_MESSAGE_PAGE_LIMIT = 100;
const JOIN_LINK_DEFAULT_EXPIRY_HOURS = 24;
const JOIN_LINK_MIN_EXPIRY_HOURS = 1;
const JOIN_LINK_MAX_EXPIRY_HOURS = 168;

const toStringId = (value) => value?.toString?.() || String(value || "");

const normalizeUnreadCounts = (unreadCounts) => {
  return unreadCounts instanceof Map
    ? Object.fromEntries(unreadCounts)
    : unreadCounts || {};
};

const normalizeSeenBy = (seenBy) => {
  return (seenBy || []).map((seenUser) => ({
    _id: seenUser?._id?.toString?.() || seenUser?.toString?.() || "",
    displayName: seenUser?.displayName,
    avatarUrl: seenUser?.avatarUrl ?? null,
  }));
};

const normalizeParticipants = (participants) => {
  return (participants || []).map((participant) => ({
    _id:
      participant?.userId?._id?.toString?.() ||
      participant?.userId?.toString?.() ||
      "",
    displayName: participant?.userId?.displayName,
    avatarUrl: participant?.userId?.avatarUrl ?? null,
    joinedAt: participant?.joinedAt,
  }));
};

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

const normalizeGroup = (group) => {
  if (!group) {
    return group;
  }

  return {
    ...group,
    createdBy: toStringId(group.createdBy),
    adminIds: (group.adminIds || []).map((adminId) => toStringId(adminId)),
    announcementOnly: Boolean(group.announcementOnly),
    joinLink: toJoinLinkMeta(group.joinLink),
  };
};

const normalizePinnedMessage = (pinnedMessage) => {
  if (!pinnedMessage) {
    return null;
  }

  return {
    ...pinnedMessage,
    senderId: toStringId(pinnedMessage.senderId),
    pinnedBy: toStringId(pinnedMessage.pinnedBy),
  };
};

const formatConversationForClient = (conversation) => {
  const conversationObject = conversation?.toObject
    ? conversation.toObject()
    : conversation;

  return {
    ...conversationObject,
    group: normalizeGroup(conversationObject?.group),
    pinnedMessage: normalizePinnedMessage(conversationObject?.pinnedMessage),
    unreadCounts: normalizeUnreadCounts(conversationObject?.unreadCounts),
    seenBy: normalizeSeenBy(conversationObject?.seenBy),
    participants: normalizeParticipants(conversationObject?.participants),
  };
};

const hashJoinLinkToken = (token) => {
  return createHash("sha256").update(String(token || "")).digest("hex");
};

const generateJoinLinkToken = () => {
  return randomBytes(24).toString("base64url");
};

const resolveClientBaseUrl = () => {
  const fromSingle = String(process.env.CLIENT_URL || "").trim();
  if (fromSingle) {
    return fromSingle.replace(/\/$/, "");
  }

  const fromList = [];
  String(process.env.CLIENT_URLS || "")
    .split(",")
    .forEach((item) => {
      const normalizedItem = item.trim();
      if (normalizedItem) {
        fromList.push(normalizedItem);
      }
    });

  return String(fromList[0] || "").replace(/\/$/, "");
};

const buildGroupJoinLinkUrl = ({ conversationId, token }) => {
  const relativePath = `/join/group/${conversationId}?token=${encodeURIComponent(token)}`;
  const baseUrl = resolveClientBaseUrl();

  if (!baseUrl) {
    return relativePath;
  }

  return `${baseUrl}${relativePath}`;
};

const resolveAtomicJoinLinkFailure = ({
  joinedConversation,
  conversation,
  userId,
  token,
}) => {
  if (joinedConversation) {
    return null;
  }

  if (isGroupParticipant(conversation, userId)) {
    return null;
  }

  const latestJoinLink = conversation.group?.joinLink;
  if (!latestJoinLink?.tokenHash || !latestJoinLink?.expiresAt) {
    return { status: 404, message: "Join link is not available" };
  }

  if (!isJoinLinkActive(latestJoinLink)) {
    return { status: 410, message: "Join link has expired" };
  }

  if (hashJoinLinkToken(token) !== String(latestJoinLink.tokenHash)) {
    return { status: 400, message: "Invalid join link token" };
  }

  return { status: 409, message: "Unable to join group right now" };
};

const isGroupParticipant = (conversation, userId) => {
  const normalizedUserId = toStringId(userId);
  return (conversation?.participants || []).some(
    (participant) => toStringId(participant?.userId) === normalizedUserId,
  );
};

const isGroupCreator = (conversation, userId) => {
  return toStringId(conversation?.group?.createdBy) === toStringId(userId);
};

const isGroupAdmin = (conversation, userId) => {
  if (isGroupCreator(conversation, userId)) {
    return true;
  }

  const normalizedUserId = toStringId(userId);
  return (conversation?.group?.adminIds || []).some(
    (adminId) => toStringId(adminId) === normalizedUserId,
  );
};

const validateGroupAdminRoleRequest = ({
  conversationId,
  memberId,
  makeAdmin,
}) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return { status: 400, message: "Invalid conversation id" };
  }

  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    return { status: 400, message: "Invalid member id" };
  }

  if (typeof makeAdmin !== "boolean") {
    return { status: 400, message: "makeAdmin must be boolean" };
  }

  return null;
};

const getGroupAdminRoleContextError = ({ conversation, userId, memberId }) => {
  if (conversation.type !== "group") {
    return {
      status: 400,
      message: "Only group conversations support admin roles",
    };
  }

  if (!isGroupParticipant(conversation, userId)) {
    return { status: 403, message: "Access denied" };
  }

  if (!isGroupCreator(conversation, userId)) {
    return {
      status: 403,
      message: "Only group owner can update admin roles",
    };
  }

  if (!isGroupParticipant(conversation, memberId)) {
    return {
      status: 400,
      message: "Target member is not in this group",
    };
  }

  if (isGroupCreator(conversation, memberId)) {
    return { status: 400, message: "Cannot change owner role" };
  }

  if (!conversation.group) {
    return { status: 400, message: "Group metadata is missing" };
  }

  return null;
};

const applyGroupAdminRoleUpdate = ({ conversation, memberId, makeAdmin }) => {
  const creatorId = toStringId(conversation.group.createdBy);
  const targetMemberId = toStringId(memberId);
  const adminIds = new Set(
    (conversation.group.adminIds || []).map((adminId) => toStringId(adminId)),
  );

  if (creatorId) {
    adminIds.add(creatorId);
  }

  if (makeAdmin) {
    adminIds.add(targetMemberId);
  } else {
    adminIds.delete(targetMemberId);
  }

  conversation.group.adminIds = Array.from(adminIds);
};

const toGroupConversationPayload = (conversation) => {
  const group = conversation?.group?.toObject
    ? conversation.group.toObject()
    : conversation?.group || {};
  const pinnedMessage = conversation?.pinnedMessage?.toObject
    ? conversation.pinnedMessage.toObject()
    : conversation?.pinnedMessage || null;

  return {
    _id: toStringId(conversation?._id),
    group: normalizeGroup(group),
    pinnedMessage: normalizePinnedMessage(pinnedMessage),
    updatedAt: conversation?.updatedAt || null,
  };
};

const broadcastGroupConversationUpdated = async (conversation) => {
  const payload = toGroupConversationPayload(conversation);

  io.to(toStringId(conversation?._id)).emit("group-conversation-updated", {
    conversation: payload,
  });

  await Promise.all(
    (conversation?.participants || []).map(async (participant) => {
      const participantId = toStringId(participant?.userId);
      if (participantId) {
        await invalidateCache(`conversations:${participantId}`);
      }
    }),
  );

  return payload;
};

import {
  buildDirectConversationKey,
  getMongoUserIdFromDrupalId,
} from "../services/conversationService.js";

// eslint-disable-next-line sonarjs/cognitive-complexity
export const createConversation = async (req, res) => {
  try {
    const { type, name, memberIds } = req.body;
    const userId = req.user._id;

    // Validation
    if (
      !type ||
      !memberIds ||
      !Array.isArray(memberIds) ||
      memberIds.length === 0
    ) {
      return res.status(400).json({
        message: "Loại cuộc trò chuyện và danh sách thành viên là bắt buộc",
      });
    }

    if (type === "group" && !name) {
      return res.status(400).json({ message: "Tên nhóm là bắt buộc" });
    }

    let conversation;

    if (type === "direct") {
      const participantId = memberIds[0];

      // Convert Drupal ID to MongoDB ObjectId
      const mongoParticipantId =
        await getMongoUserIdFromDrupalId(participantId);

      if (String(mongoParticipantId) === String(userId)) {
        return res
          .status(400)
          .json({ message: "Không thể tạo cuộc trò chuyện với chính mình" });
      }

      const directKey = buildDirectConversationKey(userId, mongoParticipantId);

      conversation = await Conversation.findOne({
        type: "direct",
        directKey,
      });

      if (!conversation) {
        try {
          conversation = await Conversation.create({
            type: "direct",
            directKey,
            participants: [{ userId }, { userId: mongoParticipantId }],
            lastMessageAt: new Date(),
            unreadCounts: new Map(),
          });
        } catch (createError) {
          if (createError?.code === 11000) {
            conversation = await Conversation.findOne({
              type: "direct",
              directKey,
            });
          } else {
            throw createError;
          }
        }
      }
    }

    if (type === "group") {
      // Convert all Drupal IDs to MongoDB ObjectIds
      const mongoMemberIdsRaw = await Promise.all(
        memberIds.map((id) => getMongoUserIdFromDrupalId(id)),
      );

      const uniqueMemberIds = [...new Set(mongoMemberIdsRaw.map(String))].filter(
        (id) => id !== String(userId),
      );

      conversation = new Conversation({
        type: "group",
        participants: [
          { userId },
          ...uniqueMemberIds.map((id) => ({ userId: id })),
        ],
        group: {
          name,
          createdBy: userId,
          adminIds: [userId],
          announcementOnly: false,
        },
        lastMessageAt: new Date(),
      });

      await conversation.save();
    }

    if (!conversation) {
      return res
        .status(400)
        .json({ message: "Conversation type không hợp lệ" });
    }

    await conversation.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      {
        path: "seenBy",
        select: "displayName avatarUrl",
      },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
    ]);

    const participants = (conversation.participants || []).map((p) => ({
      _id: p.userId?._id,
      displayName: p.userId?.displayName,
      avatarUrl: p.userId?.avatarUrl ?? null,
      joinedAt: p.joinedAt,
    }));

    const formatted = { ...conversation.toObject(), participants };

    // Emit to participants using MongoDB user IDs (NOT Drupal IDs)
    if (type === "group") {
      await Promise.all(conversation.participants.map(async (p) => {
        const participantId = p.userId._id || p.userId;
        const participantIdStr = participantId.toString();
        await invalidateCache(`conversations:${participantIdStr}`);
        
        if (participantIdStr !== userId.toString()) {
          io.to(participantIdStr).emit("new-group", formatted);
        }
      }));
    } else if (type === "direct") {
      await Promise.all(conversation.participants.map(async (p) => {
        const participantId = p.userId._id || p.userId;
        const participantIdStr = participantId.toString();
        await invalidateCache(`conversations:${participantIdStr}`);

        if (participantIdStr !== userId.toString()) {
          io.to(participantIdStr).emit("new-conversation", formatted);
        }
      }));
    }

    return res.status(201).json({ conversation: formatted });
  } catch (error) {
    console.error("Lỗi khi tạo conversation", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = `conversations:${userId}`;
    const cached = await getCachedData(cacheKey);

    if (cached) {
      return res.status(200).json({ conversations: cached });
    }

    const conversations = await Conversation.find({
      "participants.userId": userId,
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate({
        path: "participants.userId",
        select: "displayName avatarUrl",
      })
      .populate({
        path: "lastMessage.senderId",
        select: "displayName avatarUrl",
      })
      .populate({
        path: "seenBy",
        select: "displayName avatarUrl",
      })
      .lean();

    const formatted = conversations.map((convo) => formatConversationForClient(convo));

    await setCachedData(cacheKey, formatted, 600); // 10 minutes cache

    return res.status(200).json({ conversations: formatted });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy conversations", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = DEFAULT_MESSAGE_PAGE_LIMIT, cursor } = req.query;
    const userId = req.user._id;
    const parsedLimit = Number(limit);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_MESSAGE_PAGE_LIMIT)
      : DEFAULT_MESSAGE_PAGE_LIMIT;

    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canAccessAll =
      roles.includes("administrator") || roles.includes("sales_manager");

    if (!canAccessAll) {
      const isParticipant = await Conversation.exists({
        _id: conversationId,
        "participants.userId": userId,
      });

      if (!isParticipant) {
        const conversationExists = await Conversation.exists({ _id: conversationId });
        if (!conversationExists) {
          return res.status(404).json({ message: "Conversation not found" });
        }

        return res.status(403).json({ message: "Access denied" });
      }
    }

    const query = {
      conversationId,
      hiddenFor: { $ne: userId },
    };

    if (cursor) {
      const cursorDate = new Date(cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        return res.status(400).json({ message: "Invalid cursor" });
      }

      query.createdAt = { $lt: cursorDate };
    }

    let messages = await Message.find(query)
      .select(
        "_id conversationId senderId content imgUrl replyTo reactions isDeleted editedAt readBy createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .limit(safeLimit + 1)
      .lean();

    let nextCursor = null;

    if (messages.length > safeLimit) {
      const nextMessage = messages.at(-1);
      nextCursor = nextMessage.createdAt.toISOString();
      messages.pop();
    }

    messages = messages.reverse();

    return res.status(200).json({
      messages,
      nextCursor,
    });
  } catch (error) {
    console.error("Lỗi xảy ra khi lấy messages", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getUserConversationsForSocketIO = async (userId) => {
  try {
    const conversations = await Conversation.find(
      { "participants.userId": userId },
      { _id: 1 },
    );

    return conversations.map((c) => c._id.toString());
  } catch (error) {
    console.error("Lỗi khi fetch conversations: ", error);
    return [];
  }
};

export const markAsSeen = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id.toString();

    const conversation = await Conversation.findById(conversationId).lean();

    if (!conversation) {
      return res.status(404).json({ message: "Conversation không tồn tại" });
    }

    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canAccessAll =
      roles.includes("administrator") || roles.includes("sales_manager");
    if (!canAccessAll) {
      const isParticipant = (conversation.participants || []).some(
        (p) => p.userId?.toString?.() === userId,
      );
      if (!isParticipant) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const last = conversation.lastMessage;

    if (!last) {
      return res
        .status(200)
        .json({ message: "Không có tin nhắn để mark as seen" });
    }

    if (last.senderId?.toString?.() === userId) {
      return res.status(200).json({ message: "Sender không cần mark as seen" });
    }

    const updated = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $addToSet: { seenBy: userId },
        $set: { [`unreadCounts.${userId}`]: 0 },
      },
      {
        new: true,
      },
    );

    io.to(conversationId).emit("read-message", {
      conversation: {
        _id: updated?._id?.toString?.() || updated?._id,
        lastMessageAt: updated?.lastMessageAt,
        unreadCounts:
          updated?.unreadCounts instanceof Map
            ? Object.fromEntries(updated.unreadCounts)
            : updated?.unreadCounts || {},
        seenBy: (updated?.seenBy || []).map((id) => id?.toString?.() || id),
      },
      lastMessage: {
        _id: updated?.lastMessage._id,
        content: updated?.lastMessage.content,
        createdAt: updated?.lastMessage.createdAt,
        sender: {
          _id:
            updated?.lastMessage?.senderId?.toString?.() ||
            updated?.lastMessage?.senderId,
        },
      },
    });

    await invalidateCache(`conversations:${userId}`);

    return res.status(200).json({
      message: "Marked as seen",
      seenBy: updated?.seenBy || [],
      myUnreadCount: updated?.unreadCounts[userId] || 0,
    });
  } catch (error) {
    console.error("Lỗi khi mark as seen", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupAnnouncementMode = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { enabled } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be boolean" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support this setting" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only admins can update announcement mode" });
    }

    if (conversation.group) {
      conversation.group.announcementOnly = enabled;
      const creatorId = toStringId(conversation.group.createdBy);
      const adminIds = new Set(
        (conversation.group.adminIds || []).map((adminId) => toStringId(adminId)),
      );
      if (creatorId) {
        adminIds.add(creatorId);
      }
      conversation.group.adminIds = Array.from(adminIds);
    } else {
      conversation.group = {
        name: "",
        createdBy: userId,
        adminIds: [userId],
        announcementOnly: enabled,
      };
    }

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi cập nhật announcement mode", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupAdminRole = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { memberId, makeAdmin } = req.body || {};
    const userId = req.user._id;

    const payloadError = validateGroupAdminRoleRequest({
      conversationId,
      memberId,
      makeAdmin,
    });
    if (payloadError) {
      return res.status(payloadError.status).json({ message: payloadError.message });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const contextError = getGroupAdminRoleContextError({
      conversation,
      userId,
      memberId,
    });
    if (contextError) {
      return res.status(contextError.status).json({ message: contextError.message });
    }

    applyGroupAdminRoleUpdate({ conversation, memberId, makeAdmin });

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi cập nhật vai trò admin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateGroupPinnedMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageId } = req.body || {};
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Only group conversations support pinned messages" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only admins can pin or unpin messages" });
    }

    const normalizedMessageId = String(messageId || "").trim();

    if (!normalizedMessageId) {
      conversation.pinnedMessage = null;
      await conversation.save();
      const payload = await broadcastGroupConversationUpdated(conversation);
      return res.status(200).json({ conversation: payload });
    }

    if (!mongoose.Types.ObjectId.isValid(normalizedMessageId)) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    const targetMessage = await Message.findOne({
      _id: normalizedMessageId,
      conversationId,
      isDeleted: { $ne: true },
    })
      .select("_id content imgUrl senderId createdAt")
      .lean();

    if (!targetMessage) {
      return res.status(404).json({ message: "Message not found in this conversation" });
    }

    conversation.pinnedMessage = {
      _id: toStringId(targetMessage._id),
      content: targetMessage.content || "",
      imgUrl: targetMessage.imgUrl || null,
      senderId: targetMessage.senderId,
      createdAt: targetMessage.createdAt,
      pinnedAt: new Date(),
      pinnedBy: userId,
    };

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi pin tin nhắn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const createGroupJoinLink = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const rawExpiryHours = req.body?.expiresInHours;
    const expiresInHours =
      rawExpiryHours === undefined
        ? JOIN_LINK_DEFAULT_EXPIRY_HOURS
        : Number(rawExpiryHours);

    if (!Number.isInteger(expiresInHours)) {
      return res.status(400).json({ message: "expiresInHours must be an integer" });
    }

    if (
      expiresInHours < JOIN_LINK_MIN_EXPIRY_HOURS ||
      expiresInHours > JOIN_LINK_MAX_EXPIRY_HOURS
    ) {
      return res.status(400).json({
        message: `expiresInHours must be between ${JOIN_LINK_MIN_EXPIRY_HOURS} and ${JOIN_LINK_MAX_EXPIRY_HOURS}`,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Join link is available for group conversations only" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can create join links" });
    }

    const token = generateJoinLinkToken();
    const tokenHash = hashJoinLinkToken(token);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    if (!conversation.group) {
      conversation.group = {
        name: "",
        createdBy: userId,
        adminIds: [userId],
        announcementOnly: false,
      };
    }

    conversation.group.joinLink = {
      tokenHash,
      expiresAt,
      createdAt: new Date(),
      createdBy: userId,
    };

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);

    return res.status(200).json({
      conversation: payload,
      joinLink: {
        token,
        url: buildGroupJoinLinkUrl({ conversationId, token }),
        expiresAt,
        expiresInHours,
      },
    });
  } catch (error) {
    console.error("Lỗi khi tạo join link", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const revokeGroupJoinLink = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Join link is available for group conversations only" });
    }

    if (!isGroupParticipant(conversation, userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isGroupAdmin(conversation, userId)) {
      return res.status(403).json({ message: "Only group admins can revoke join links" });
    }

    if (!conversation.group) {
      conversation.group = {
        name: "",
        createdBy: userId,
        adminIds: [userId],
        announcementOnly: false,
      };
    }

    conversation.group.joinLink = {
      tokenHash: null,
      expiresAt: null,
      createdAt: null,
      createdBy: null,
    };

    await conversation.save();
    const payload = await broadcastGroupConversationUpdated(conversation);
    return res.status(200).json({ conversation: payload });
  } catch (error) {
    console.error("Lỗi khi thu hồi join link", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const joinGroupByLink = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const token = String(req.body?.token || "").trim();

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation id" });
    }

    if (!token) {
      return res.status(400).json({ message: "Join token is required" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Join link is available for group conversations only" });
    }

    const joinLink = conversation.group?.joinLink;
    if (!joinLink?.tokenHash || !joinLink?.expiresAt) {
      return res.status(404).json({ message: "Join link is not available" });
    }

    if (!isJoinLinkActive(joinLink)) {
      conversation.group.joinLink = {
        tokenHash: null,
        expiresAt: null,
        createdAt: null,
        createdBy: null,
      };
      await conversation.save();
      await broadcastGroupConversationUpdated(conversation);
      return res.status(410).json({ message: "Join link has expired" });
    }

    if (hashJoinLinkToken(token) !== String(joinLink.tokenHash)) {
      return res.status(400).json({ message: "Invalid join link token" });
    }

    // Atomic join guard: only add participant when the user is not in this group yet.
    const joinedConversation = await Conversation.findOneAndUpdate(
      {
        _id: conversationId,
        "participants.userId": { $ne: userId },
        "group.joinLink.tokenHash": String(joinLink.tokenHash),
        "group.joinLink.expiresAt": { $gt: new Date() },
      },
      {
        $push: { participants: { userId, joinedAt: new Date() } },
        $set: { [`unreadCounts.${toStringId(userId)}`]: 0 },
      },
      { new: true },
    );

    const conversationForResponse =
      joinedConversation || (await Conversation.findById(conversationId));

    if (!conversationForResponse) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const joinFailure = resolveAtomicJoinLinkFailure({
      joinedConversation,
      conversation: conversationForResponse,
      userId,
      token,
    });

    if (joinFailure) {
      return res.status(joinFailure.status).json({ message: joinFailure.message });
    }

    const joinedInThisRequest = Boolean(joinedConversation);
    const alreadyJoined = !joinedInThisRequest;

    await conversationForResponse.populate([
      { path: "participants.userId", select: "displayName avatarUrl" },
      { path: "lastMessage.senderId", select: "displayName avatarUrl" },
      { path: "seenBy", select: "displayName avatarUrl" },
    ]);

    const formattedConversation = formatConversationForClient(conversationForResponse);

    await Promise.all(
      (formattedConversation.participants || []).map(async (participant) => {
        const participantId = String(participant?._id || "").trim();
        if (participantId) {
          await invalidateCache(`conversations:${participantId}`);
        }
      }),
    );

    if (joinedInThisRequest) {
      io.to(String(userId)).emit("new-group", formattedConversation);
      io.to(String(conversationForResponse._id)).emit("group-conversation-updated", {
        conversation: {
          _id: formattedConversation._id,
          group: formattedConversation.group,
          participants: formattedConversation.participants,
          updatedAt: formattedConversation.updatedAt,
        },
      });
    }

    return res.status(200).json({
      conversation: formattedConversation,
      alreadyJoined,
    });
  } catch (error) {
    console.error("Lỗi khi tham gia group bằng join link", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canDeleteAnyConversation =
      roles.includes("administrator") || roles.includes("sales_manager");

    const canUseTransactions =
      typeof mongoose?.connection?.startSession === "function";

    const verifyPermission = (conversationDoc) => {
      if (!canDeleteAnyConversation) {
        const isMember = conversationDoc.participants.some(
          (participant) => participant.userId.toString() === userId.toString(),
        );

        if (!isMember) {
          return false;
        }
      }

      return true;
    };

    let conversation;
    let deletedWithTransaction = false;
    let imageUrlsToDestroy = [];

    if (canUseTransactions) {
      const session = await mongoose.connection.startSession();

      try {
        await session.withTransaction(async () => {
          const scopedConversation = await Conversation.findById(
            conversationId,
          ).session(session);

          if (!scopedConversation) {
            throw new Error("NOT_FOUND");
          }

          if (!verifyPermission(scopedConversation)) {
            throw new Error("FORBIDDEN");
          }

          const [messagesWithImages, messageIdDocs] = await Promise.all([
            Message.find({
              conversationId,
              imgUrl: { $ne: null },
            }).select("imgUrl").session(session),
            Message.find({ conversationId }).select("_id").session(session),
          ]);

          imageUrlsToDestroy = messagesWithImages.map(msg => msg.imgUrl).filter(Boolean);
          const messageIds = messageIdDocs.map((msg) => msg._id).filter(Boolean);

          await Promise.all([
            Message.deleteMany({ conversationId })
              .setOptions({
                skipDependentCleanup: true,
                skipCounterSync: true,
              })
              .session(session),
            Bookmark.deleteMany({ conversationId }).session(session),
            Notification.deleteMany({ conversationId }).session(session),
            ContentReport.deleteMany({
              $or: [
                {
                  targetType: "message",
                  targetId: { $in: messageIds },
                },
                {
                  "context.conversationId": conversationId,
                },
              ],
            }).session(session),
          ]);
          await Conversation.findOneAndDelete(
            { _id: scopedConversation._id },
          ).session(session);

          conversation = scopedConversation;
        });

        deletedWithTransaction = true;
      } catch (transactionError) {
        if (transactionError?.message === "NOT_FOUND") {
          return res.status(404).json({ message: "Conversation không tồn tại" });
        }

        if (transactionError?.message === "FORBIDDEN") {
          return res
            .status(403)
            .json({ message: "Bạn không có quyền xoá conversation này" });
        }

        const message = String(transactionError?.message || "").toLowerCase();
        const shouldFallbackToNonTx =
          message.includes("transaction numbers are only allowed") ||
          message.includes("replica set") ||
          message.includes("not supported");

        if (!shouldFallbackToNonTx) {
          throw transactionError;
        }
      } finally {
        await session.endSession();
      }
    }

    if (!deletedWithTransaction) {
      conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return res.status(404).json({ message: "Conversation không tồn tại" });
      }

      if (!verifyPermission(conversation)) {
        return res
          .status(403)
          .json({ message: "Bạn không có quyền xoá conversation này" });
      }

      try {
        const [messagesWithImages, messageIdDocs] = await Promise.all([
          Message.find({
            conversationId,
            imgUrl: { $ne: null },
          }).select("imgUrl"),
          Message.find({ conversationId }).select("_id"),
        ]);
        imageUrlsToDestroy = messagesWithImages.map(msg => msg.imgUrl).filter(Boolean);
        const messageIds = messageIdDocs.map((msg) => msg._id).filter(Boolean);

        // Cleanup dependent collections before deleting the conversation document.
        await Promise.all([
          Message.deleteMany({ conversationId }).setOptions({
            skipDependentCleanup: true,
            skipCounterSync: true,
          }),
          Bookmark.deleteMany({ conversationId }),
          Notification.deleteMany({ conversationId }),
          ContentReport.deleteMany({
            $or: [
              {
                targetType: "message",
                targetId: { $in: messageIds },
              },
              {
                "context.conversationId": conversationId,
              },
            ],
          }),
        ]);
      } catch (messageDeleteError) {
        console.error("[deleteConversation] Related cleanup failed — aborting to prevent orphan data", messageDeleteError);
        throw messageDeleteError;
      }

      const deletedConversation = await Conversation.findOneAndDelete({
        _id: conversation._id,
      });

      if (!deletedConversation) {
        return res.status(404).json({ message: "Conversation không tồn tại" });
      }
    } // end if (!deletedWithTransaction)

    // 4. Emit to all participants that conversation was deleted
    await Promise.all(conversation.participants.map(async (p) => {
      const participantIdStr = p.userId.toString();
      await invalidateCache(`conversations:${participantIdStr}`);
      io.in(participantIdStr).socketsLeave(conversationId);
      io.to(participantIdStr).emit("conversation-deleted", {
        conversationId,
      });
    }));

    // 5. Enterprise Fire-and-Forget: Dọn rác Cloudinary chạy nền
    if (imageUrlsToDestroy.length > 0) {
      Promise.allSettled(imageUrlsToDestroy.map(url => destroyImageFromUrl(url)))
        .catch(err => console.error("[conversation] Bulk Cloudinary destroy error during deleteConversation", err));
    }

    return res.status(200).json({
      message: "Xoá conversation thành công",
      conversationId,
    });
  } catch (error) {
    console.error("Lỗi khi xoá conversation", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
// ADMIN API: Get all conversations with real data from MongoDB (for Drupal admin)
export const getAdminConversations = async (req, res) => {
  try {
    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canAccessAdminConversations =
      roles.includes("administrator") || roles.includes("sales_manager");

    if (!canAccessAdminConversations) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { normalizePaging } = await import("../utils/pagingHelper.js").catch(
      () => ({ normalizePaging: (p, l) => ({ page: Number(p)||1, limit: Number(l)||50, skip: ((Number(p)||1)-1)*(Number(l)||50) }) })
    );

    const { page, limit, skip } = normalizePaging(req.query.page, req.query.limit);

    // Bounding Enterprise: Không còn query mù quáng kéo toàn bộ CSDL
    const [conversations, totalCount] = await Promise.all([
      Conversation.find()
        .populate({
          path: "participants.userId",
          select: "_id displayName avatarUrl drupalId",
        })
        .populate({
          path: "lastMessage.senderId",
          select: "_id displayName",
        })
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Conversation.countDocuments(),
    ]);

    // Enrich data
    const enriched = conversations.map((conv) => {
      const lastActivity = conv.lastMessageAt
        ? new Date(conv.lastMessageAt)
        : null;
      const now = new Date();
      const diffMs = lastActivity ? now - lastActivity : null;

      let timeAgo = "Never";
      if (diffMs) {
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) timeAgo = "Just now";
        else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
        else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
        else if (diffDays < 7) timeAgo = `${diffDays}d ago`;
        else timeAgo = lastActivity.toLocaleDateString();
      }

      // Filter out null/undefined participants
      const validParticipants = (conv.participants || [])
        .filter((p) => Boolean(p?.userId))
        .map((p) => ({
          userId: p.userId?._id || p.userId,
          displayName: p.userId?.displayName || "Unknown User",
          drupalId: p.userId?.drupalId || "N/A",
        }));

      return {
        id: conv._id?.toString?.() || conv._id,
        _id: conv._id,
        type: conv.type,
        name: conv.group?.name || "Direct Chat",
        messageCount: conv.messageCount || 0,
        participantCount: validParticipants.length,
        participants: validParticipants,
        lastMessage: conv.lastMessage?.content || "No messages",
        lastMessageAt: lastActivity,
        timeAgo,
        createdAt: conv.createdAt,
      };
    });

    // Enterprise Statistics via Aggregation / countDocuments to prevent Memory Leaks
    const [
      directCount,
      groupCount,
      activeTodayCount,
      aggStats
    ] = await Promise.all([
      Conversation.countDocuments({ type: "direct" }),
      Conversation.countDocuments({ type: "group" }),
      Conversation.countDocuments({
        lastMessageAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      Conversation.aggregate([
        {
          $group: {
            _id: null,
            totalMessages: { $sum: "$messageCount" },
            avgParticipants: { $avg: { $size: { $ifNull: ["$participants", []] } } }
          }
        }
      ]),
    ]);

    const stats = {
      totalConversations: totalCount,
      privateConversations: directCount,
      groupConversations: groupCount,
      activeTodayCount: activeTodayCount,
      totalMessages: aggStats[0]?.totalMessages || 0,
      avgParticipants: Math.round((aggStats[0]?.avgParticipants || 0) * 100) / 100,
    };

    return res.status(200).json({
      success: true,
      data: enriched,
      stats,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      lastUpdated: new Date(),
    });
  } catch (error) {
    console.error("[getAdminConversations] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu conversations",
      error: error.message,
    });
  }
};

// ADMIN API: Get a single conversation + latest messages (for Drupal admin)
export const getAdminConversation = async (req, res) => {
  try {
    const roles = Array.isArray(req.authRoles) ? req.authRoles : [];
    const canAccessAdminConversations =
      roles.includes("administrator") || roles.includes("sales_manager");

    if (!canAccessAdminConversations) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { conversationId } = req.params;

    const conversationDoc = await Conversation.findById(conversationId)
      .populate({
        path: "participants.userId",
        select: "_id displayName email avatarUrl drupalId",
      })
      .populate({
        path: "lastMessage.senderId",
        select: "_id displayName email avatarUrl drupalId",
      })
      .lean();

    if (!conversationDoc) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const participants = (conversationDoc.participants || [])
      .filter((p) => Boolean(p?.userId))
      .map((p) => ({
        userId: p.userId?._id || p.userId,
        displayName: p.userId?.displayName || "Unknown User",
        email: p.userId?.email || null,
        avatarUrl: p.userId?.avatarUrl ?? null,
        drupalId: p.userId?.drupalId || "N/A",
        joinedAt: p.joinedAt,
      }));

    const conversation = {
      id: conversationDoc._id?.toString?.() || conversationDoc._id,
      _id: conversationDoc._id,
      type: conversationDoc.type,
      name: conversationDoc.group?.name || "Direct Chat",
      messageCount: conversationDoc.messageCount || 0,
      participantCount: participants.length,
      participants,
      createdAt: conversationDoc.createdAt,
      lastMessageAt: conversationDoc.lastMessageAt || null,
      lastMessage: conversationDoc.lastMessage?.content || "No messages",
    };

    const messages = await Message.find({
      conversationId,
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate({
        path: "senderId",
        select: "_id displayName email avatarUrl drupalId",
      });

    const formattedMessages = messages
      .slice()
      .reverse()
      .map((m) => ({
        _id: m._id,
        senderId: m.senderId
          ? {
              _id: m.senderId._id,
              displayName: m.senderId.displayName,
              email: m.senderId.email,
              avatarUrl: m.senderId.avatarUrl ?? null,
              drupalId: m.senderId.drupalId ?? null,
            }
          : null,
        content: m.content || "",
        createdAt: m.createdAt,
        attachments: m.imgUrl
          ? [{ filename: "Attachment", url: m.imgUrl }]
          : [],
      }));

    return res.status(200).json({
      success: true,
      data: {
        conversation,
        messages: formattedMessages,
      },
    });
  } catch (error) {
    console.error("[getAdminConversation] Error:", error);
    return res.status(500).json({
      message: "Unable to fetch admin conversation",
      error: error.message,
    });
  }
};
