import { invalidateCache } from "../libs/redis.js";

const DEFAULT_GROUP_CHANNEL_ID = "general";

const normalizeGroupChannelId = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return normalized || DEFAULT_GROUP_CHANNEL_ID;
};

const toStringId = (value) => value?.toString?.() || String(value || "");

const sumUnreadChannelCounts = (channelUnreadCounts) => {
  return Object.values(channelUnreadCounts || {}).reduce((sum, count) => {
    const parsedCount = Number(count);
    if (!Number.isFinite(parsedCount) || parsedCount <= 0) {
      return sum;
    }

    return sum + Math.floor(parsedCount);
  }, 0);
};

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
      groupChannelId: message.groupChannelId || null,
    },
  });

  if (conversation?.type === "group") {
    const conversationGroup = conversation.group || {};
    const effectiveChannelId = normalizeGroupChannelId(message.groupChannelId);
    const rawGroupChannelUnreadCounts =
      conversationGroup.channelUnreadCounts &&
      typeof conversationGroup.channelUnreadCounts === "object" &&
      !Array.isArray(conversationGroup.channelUnreadCounts)
        ? conversationGroup.channelUnreadCounts
        : {};

    const nextGroupChannelUnreadCounts = {
      ...rawGroupChannelUnreadCounts,
    };

    conversation.participants.forEach((participant) => {
      const memberId = toStringId(participant?.userId);
      if (!memberId) {
        return;
      }

      const isSender = memberId === senderId.toString();
      const existingMemberUnread = nextGroupChannelUnreadCounts[memberId];
      const memberChannelUnread =
        existingMemberUnread &&
        typeof existingMemberUnread === "object" &&
        !Array.isArray(existingMemberUnread)
          ? { ...existingMemberUnread }
          : {};

      if (isSender) {
        delete memberChannelUnread[effectiveChannelId];
      } else {
        const prevCount = Number(memberChannelUnread[effectiveChannelId]) || 0;
        memberChannelUnread[effectiveChannelId] = Math.max(
          0,
          Math.floor(prevCount) + 1,
        );
      }

      if (Object.keys(memberChannelUnread).length > 0) {
        nextGroupChannelUnreadCounts[memberId] = memberChannelUnread;
      } else {
        delete nextGroupChannelUnreadCounts[memberId];
      }

      conversation.unreadCounts.set(memberId, sumUnreadChannelCounts(memberChannelUnread));
    });

    if (conversation.group) {
      conversation.group.channelUnreadCounts = nextGroupChannelUnreadCounts;
    } else {
      conversation.group = {
        channelUnreadCounts: nextGroupChannelUnreadCounts,
      };
    }

    return;
  }

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
      ...(conversation?.type === "group"
        ? {
            group: {
              activeChannelId:
                conversation?.group?.activeChannelId || DEFAULT_GROUP_CHANNEL_ID,
              channels: Array.isArray(conversation?.group?.channels)
                ? conversation.group.channels
                : [],
              channelCategories: Array.isArray(conversation?.group?.channelCategories)
                ? conversation.group.channelCategories
                : [],
              channelUnreadCounts:
                conversation?.group?.channelUnreadCounts || {},
            },
          }
        : {}),
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
      if (p?.userId) {
        await invalidateCache(`conversations:${p.userId.toString()}`);
      }
    })
  );
};
