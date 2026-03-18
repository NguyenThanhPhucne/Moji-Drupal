import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import {
  emitNewMessage,
  updateConversationAfterCreateMessage,
} from "../utils/messageHelper.js";
import { io } from "../socket/index.js";

const ensureConversationMembership = async (conversationId, userId) => {
  const membership = await Conversation.exists({
    _id: conversationId,
    "participants.userId": userId,
  });

  return Boolean(membership);
};

export const sendDirectMessage = async (req, res) => {
  try {
    const { recipientId, content, conversationId, replyTo } = req.body;
    const senderId = req.user._id;

    let conversation;
    let isNewConversation = false;

    if (!content) {
      return res.status(400).json({ message: "Thiếu nội dung" });
    }

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
    }

    if (!conversation) {
      conversation = await Conversation.create({
        type: "direct",
        participants: [
          { userId: senderId, joinedAt: new Date() },
          { userId: recipientId, joinedAt: new Date() },
        ],
        lastMessageAt: new Date(),
        unreadCounts: new Map(),
      });
      isNewConversation = true;
    }

    let message = await Message.create({
      conversationId: conversation._id,
      senderId,
      content,
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
          io.to(participantId.toString()).emit(
            "new-conversation",
            formattedConversation,
          );
        }
      });
    }

    emitNewMessage(io, conversation, message);

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Lỗi xảy ra khi gửi tin nhắn trực tiếp", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sendGroupMessage = async (req, res) => {
  try {
    const { conversationId, content, replyTo } = req.body;
    const senderId = req.user._id;
    const conversation = req.conversation;

    if (!content) {
      return res.status(400).json("Thiếu nội dung");
    }

    let message = await Message.create({
      conversationId,
      senderId,
      content,
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
    message.content = "Tin nhắn đã bị gỡ";
    message.imgUrl = null;
    await message.save();

    io.to(message.conversationId.toString()).emit("message-deleted", {
      conversationId: message.conversationId,
      messageId: message._id,
      content: message.content,
    });

    return res.status(200).json(message);
  } catch (error) {
    console.error("Lỗi khi gỡ tin nhắn:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Edit message — only within 15 minutes of sending
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

    const fifteenMinutes = 15 * 60 * 1000;
    if (Date.now() - new Date(message.createdAt).getTime() > fifteenMinutes) {
      return res
        .status(400)
        .json({ message: "Chỉ có thể sửa tin nhắn trong vòng 15 phút" });
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
