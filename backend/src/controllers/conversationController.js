import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { io } from "../socket/index.js";
import mongoose from "mongoose";
import { destroyImageFromUrl } from "../utils/cloudinaryHelper.js";

const DEFAULT_MESSAGE_PAGE_LIMIT = 50;
const MAX_MESSAGE_PAGE_LIMIT = 100;

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
      conversation.participants.forEach((p) => {
        const participantId = p.userId._id || p.userId;
        if (participantId.toString() !== userId.toString()) {
          io.to(participantId.toString()).emit("new-group", formatted);
        }
      });
    } else if (type === "direct") {
      conversation.participants.forEach((p) => {
        const participantId = p.userId._id || p.userId;
        if (participantId.toString() !== userId.toString()) {
          io.to(participantId.toString()).emit("new-conversation", formatted);
        }
      });
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

    const formatted = conversations.map((convo) => {
      const participants = (convo.participants || []).map((p) => ({
        _id: p.userId?._id?.toString?.() || p.userId?.toString?.() || "",
        displayName: p.userId?.displayName,
        avatarUrl: p.userId?.avatarUrl ?? null,
        joinedAt: p.joinedAt,
      }));

      const normalizedUnreadCounts =
        convo.unreadCounts instanceof Map
          ? Object.fromEntries(convo.unreadCounts)
          : convo.unreadCounts || {};

      const normalizedSeenBy = (convo.seenBy || []).map((seenUser) => ({
        _id: seenUser?._id?.toString?.() || seenUser?.toString?.() || "",
        displayName: seenUser?.displayName,
        avatarUrl: seenUser?.avatarUrl ?? null,
      }));

      return {
        ...convo,
        unreadCounts: normalizedUnreadCounts,
        seenBy: normalizedSeenBy,
        participants,
      };
    });

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

          const messagesWithImages = await Message.find({
            conversationId,
            imgUrl: { $ne: null },
          }).select("imgUrl").session(session);

          imageUrlsToDestroy = messagesWithImages.map(msg => msg.imgUrl).filter(Boolean);

          await Message.deleteMany({ conversationId }).session(session);
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

      const conversationSnapshot = conversation.toObject({
        depopulate: true,
      });

      const deletedConversation = await Conversation.findOneAndDelete({
        _id: conversation._id,
      });

      if (!deletedConversation) {
        return res.status(404).json({ message: "Conversation không tồn tại" });
      }

      try {
        const messagesWithImages = await Message.find({
          conversationId,
          imgUrl: { $ne: null },
        }).select("imgUrl");
        imageUrlsToDestroy = messagesWithImages.map(msg => msg.imgUrl).filter(Boolean);

        await Message.deleteMany({ conversationId });
      } catch (messageDeleteError) {
        try {
          await Conversation.create(conversationSnapshot);
        } catch (restoreError) {
          console.error(
            "Failed to restore conversation after message deletion error",
            restoreError,
          );
        }

        throw messageDeleteError;
      }
    }

    // 4. Emit to all participants that conversation was deleted
    conversation.participants.forEach((p) => {
      io.to(p.userId.toString()).emit("conversation-deleted", {
        conversationId,
      });
    });

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
