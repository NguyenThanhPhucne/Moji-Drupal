import { invalidateCache } from "../libs/redis.js";

export const updateConversationAfterCreateMessage = (
  conversation,
  message,
  senderId,
) => {
  const previewContent =
    String(message.content || "").trim() ||
    (message.imgUrl ? "📷 Photo" : "");

  conversation.set({
    seenBy: [],
    lastMessageAt: message.createdAt,
    lastMessage: {
      _id: message._id,
      content: previewContent,
      senderId,
      createdAt: message.createdAt,
    },
  });

  conversation.participants.forEach((p) => {
    const memberId = p.userId.toString();
    const isSender = memberId === senderId.toString();
    const prevCount = conversation.unreadCounts.get(memberId) || 0;
    conversation.unreadCounts.set(memberId, isSender ? 0 : prevCount + 1);
  });
};

export const emitNewMessage = (io, conversation, message) => {
  const normalizedUnreadCounts =
    conversation.unreadCounts instanceof Map
      ? Object.fromEntries(conversation.unreadCounts)
      : conversation.unreadCounts || {};

  io.to(conversation._id.toString()).emit("new-message", {
    message,
    conversation: {
      _id: conversation._id,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
    },
    unreadCounts: normalizedUnreadCounts,
  });
  
  // Fire and forget cache invalidation
  invalidateConversationParticipantsCache(conversation).catch(console.error);
};

export const invalidateConversationParticipantsCache = async (conversation) => {
  if (!conversation || !Array.isArray(conversation.participants)) return;
  await Promise.all(
    conversation.participants.map(async (p) => {
      if (p && p.userId) {
        await invalidateCache(`conversations:${p.userId.toString()}`);
      }
    })
  );
};
