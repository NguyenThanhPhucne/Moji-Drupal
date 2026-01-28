import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { io } from "../socket/index.js";

// 🔥 HYBRID: Helper to get MongoDB user ID from Drupal ID
const getMongoUserIdFromDrupalId = async (drupalId) => {
  // If it's already a valid MongoDB ObjectId, return as-is
  if (/^[0-9a-fA-F]{24}$/.test(drupalId)) {
    return drupalId;
  }

  // Convert to integer for Drupal ID lookup
  const drupalIdInt = parseInt(drupalId);

  try {
    // 1. Tìm user theo drupalId field (RECOMMENDED)
    let user = await User.findOne({ drupalId: drupalIdInt });

    if (user) {
      console.log(`✅ Found user by drupalId: ${drupalId} -> ${user._id}`);
      return user._id.toString();
    }

    // 2. Tìm theo pattern cũ (fallback)
    user = await User.findOne({
      $or: [
        { username: `drupal_${drupalId}` },
        { email: `drupal_${drupalId}@temp.local` },
      ],
    });

    if (user) {
      console.log(`✅ Found user by pattern: ${drupalId} -> ${user._id}`);
      return user._id.toString();
    }

    // 3. Nếu không tìm thấy, tạo placeholder (KHÔNG NÊN XẢY RA nếu auth đúng)
    console.log(`⚠️ Creating placeholder for Drupal ID: ${drupalId}`);
    user = await User.create({
      username: `drupal_${drupalId}`,
      email: `drupal_${drupalId}@temp.local`,
      displayName: `User ${drupalId}`,
      drupalId: drupalIdInt,
      hashedPassword: "linked_with_drupal",
    });

    return user._id.toString();
  } catch (error) {
    console.error("❌ Error mapping Drupal ID to MongoDB:", error);
    throw new Error(`Cannot map Drupal ID ${drupalId} to MongoDB user`);
  }
};

export const createConversation = async (req, res) => {
  try {
    const { type, name, memberIds } = req.body;
    const userId = req.user._id;

    console.log("📝 [createConversation] Request:", {
      type,
      name,
      memberIds,
      userId,
    });

    // ✅ Validation
    if (
      !type ||
      !memberIds ||
      !Array.isArray(memberIds) ||
      memberIds.length === 0
    ) {
      console.log(
        "❌ [createConversation] Validation failed: missing type or memberIds",
      );
      return res.status(400).json({
        message: "Loại cuộc trò chuyện và danh sách thành viên là bắt buộc",
      });
    }

    if (type === "group" && !name) {
      console.log(
        "❌ [createConversation] Validation failed: group without name",
      );
      return res.status(400).json({ message: "Tên nhóm là bắt buộc" });
    }

    let conversation;

    if (type === "direct") {
      const participantId = memberIds[0];

      // 🔥 Convert Drupal ID to MongoDB ObjectId
      const mongoParticipantId =
        await getMongoUserIdFromDrupalId(participantId);
      console.log(
        `🔄 Mapped participant: ${participantId} -> ${mongoParticipantId}`,
      );

      conversation = await Conversation.findOne({
        type: "direct",
        "participants.userId": { $all: [userId, mongoParticipantId] },
      });

      if (!conversation) {
        conversation = new Conversation({
          type: "direct",
          participants: [{ userId }, { userId: mongoParticipantId }],
          lastMessageAt: new Date(),
        });

        await conversation.save();
      }
    }

    if (type === "group") {
      // 🔥 Convert all Drupal IDs to MongoDB ObjectIds
      const mongoMemberIds = await Promise.all(
        memberIds.map((id) => getMongoUserIdFromDrupalId(id)),
      );
      console.log(`🔄 Mapped group members:`, memberIds, "->", mongoMemberIds);

      conversation = new Conversation({
        type: "group",
        participants: [
          { userId },
          ...mongoMemberIds.map((id) => ({ userId: id })),
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

    // 🔥 Emit to participants using MongoDB user IDs (NOT Drupal IDs)
    if (type === "group") {
      // Emit to all invited members (NOT creator)
      console.log(
        `🔍 [createConversation] Participants:`,
        conversation.participants.map((p) => ({
          userId: p.userId._id || p.userId,
          displayName: p.userId.displayName,
        })),
      );

      conversation.participants.forEach((p) => {
        const participantId = p.userId._id || p.userId;
        if (participantId.toString() !== userId.toString()) {
          io.to(participantId.toString()).emit("new-group", formatted);
          console.log(`📢 Emitted new-group to user ${participantId}`);
        }
      });
    } else if (type === "direct") {
      // Direct chat: emit to the other participant
      conversation.participants.forEach((p) => {
        const participantId = p.userId._id || p.userId;
        if (participantId.toString() !== userId.toString()) {
          io.to(participantId.toString()).emit("new-conversation", formatted);
          console.log(`📢 Emitted new-conversation to user ${participantId}`);
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
      });

    const formatted = conversations.map((convo) => {
      const participants = (convo.participants || []).map((p) => ({
        _id: p.userId?._id,
        displayName: p.userId?.displayName,
        avatarUrl: p.userId?.avatarUrl ?? null,
        joinedAt: p.joinedAt,
      }));

      return {
        ...convo.toObject(),
        unreadCounts: convo.unreadCounts || {},
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
    const { limit = 50, cursor } = req.query;

    const query = { conversationId };

    if (cursor) {
      query.createdAt = { $lt: new Date(cursor) };
    }

    let messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit) + 1);

    let nextCursor = null;

    if (messages.length > Number(limit)) {
      const nextMessage = messages[messages.length - 1];
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

    const last = conversation.lastMessage;

    if (!last) {
      return res
        .status(200)
        .json({ message: "Không có tin nhắn để mark as seen" });
    }

    if (last.senderId.toString() === userId) {
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
      conversation: updated,
      lastMessage: {
        _id: updated?.lastMessage._id,
        content: updated?.lastMessage.content,
        createdAt: updated?.lastMessage.createdAt,
        sender: {
          _id: updated?.lastMessage.senderId,
        },
      },
    });

    return res.status(200).json({
      message: "Marked as seen",
      seenBy: updated?.sennBy || [],
      myUnreadCount: updated?.unreadCounts[userId] || 0,
    });
  } catch (error) {
    console.error("Lỗi khi mark as seen", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
export const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    console.log(
      `🗑️ [deleteConversation] Request: conversationId=${conversationId}, userId=${userId}`,
    );

    // 1. Check if user is member of conversation
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ message: "Conversation không tồn tại" });
    }

    const isMember = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString(),
    );

    if (!isMember) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xoá conversation này" });
    }

    // 2. Delete all messages in conversation
    await Message.deleteMany({ conversationId });
    console.log(`  ✅ Deleted all messages for conversation ${conversationId}`);

    // 3. Delete conversation
    await Conversation.findByIdAndDelete(conversationId);
    console.log(`  ✅ Deleted conversation ${conversationId}`);

    // 4. Emit to all participants that conversation was deleted
    conversation.participants.forEach((p) => {
      io.to(p.userId.toString()).emit("conversation-deleted", {
        conversationId,
      });
      console.log(`  📢 Emitted conversation-deleted to user ${p.userId}`);
    });

    return res.status(200).json({
      message: "Xoá conversation thành công",
      conversationId,
    });
  } catch (error) {
    console.error("Lỗi khi xoá conversation", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
// 🔥 ADMIN API: Lấy tất cả conversations với dữ liệu thật từ MongoDB (cho Drupal admin)
export const getAdminConversations = async (req, res) => {
  try {
    console.log("📊 [getAdminConversations] Fetching real data from MongoDB");

    // Lấy tất cả conversations với populated data
    const conversations = await Conversation.find()
      .populate({
        path: "participants.userId",
        select: "_id displayName avatarUrl drupalId",
      })
      .populate({
        path: "lastMessage.senderId",
        select: "_id displayName",
      })
      .sort({ lastMessageAt: -1 })
      .lean();

    console.log(
      `📊 [getAdminConversations] Found ${conversations.length} conversations`,
    );
    if (conversations.length > 0) {
      console.log(
        `🔍 Sample conversation:`,
        JSON.stringify(conversations[0], null, 2),
      );
    }

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
        .filter((p) => p && p.userId)
        .map((p) => ({
          userId: p.userId?._id || p.userId,
          displayName: p.userId?.displayName || "Unknown User",
          drupalId: p.userId?.drupalId || "N/A",
        }));

      console.log(
        `🔍 Conversation ${conv._id}: ${validParticipants.length} valid participants out of ${(conv.participants || []).length}`,
      );

      return {
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

    // Statistics
    const stats = {
      totalConversations: enriched.length,
      privateConversations: enriched.filter((c) => c.type === "direct").length,
      groupConversations: enriched.filter((c) => c.type === "group").length,
      activeTodayCount: enriched.filter(
        (c) =>
          c.lastMessageAt &&
          c.lastMessageAt > new Date(Date.now() - 24 * 60 * 60 * 1000),
      ).length,
      totalMessages: enriched.reduce((sum, c) => sum + c.messageCount, 0),
      avgParticipants:
        Math.round(
          (enriched.reduce((sum, c) => sum + c.participantCount, 0) /
            enriched.length) *
            100,
        ) / 100,
    };

    console.log(
      `✅ [getAdminConversations] Found ${enriched.length} conversations`,
    );
    return res.status(200).json({
      success: true,
      data: enriched,
      stats,
      lastUpdated: new Date(),
    });
  } catch (error) {
    console.error("❌ [getAdminConversations] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể lấy dữ liệu conversations",
      error: error.message,
    });
  }
};
