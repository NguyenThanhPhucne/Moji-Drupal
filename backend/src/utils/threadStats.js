import mongoose from "mongoose";
import Message from "../models/Message.js";

const toStringId = (value) => value?.toString?.() || String(value || "");

const normalizeObjectId = (value) => {
  const normalized = String(value || "").trim();
  if (!mongoose.isValidObjectId(normalized)) {
    return null;
  }

  return normalized;
};

const buildThreadReplyCountQuery = ({
  conversationId,
  threadRootId,
  userId = null,
  groupChannelId = null,
}) => {
  const normalizedConversationId = normalizeObjectId(conversationId);
  const normalizedThreadRootId = normalizeObjectId(threadRootId);
  const normalizedUserId = userId ? normalizeObjectId(userId) : null;

  if (!normalizedConversationId || !normalizedThreadRootId) {
    return null;
  }

  const query = {
    conversationId: normalizedConversationId,
    threadRootId: normalizedThreadRootId,
    isDeleted: { $ne: true },
  };

  if (normalizedUserId) {
    query.hiddenFor = { $ne: normalizedUserId };
  }

  const normalizedChannelId = String(groupChannelId || "").trim().toLowerCase();
  if (normalizedChannelId) {
    query.groupChannelId = normalizedChannelId;
  }

  return query;
};

export const countThreadReplies = async ({
  conversationId,
  threadRootId,
  userId,
  groupChannelId = null,
}) => {
  const query = buildThreadReplyCountQuery({
    conversationId,
    threadRootId,
    userId,
    groupChannelId,
  });

  if (!query) {
    return 0;
  }

  const replyCount = await Message.countDocuments(query);
  return Math.max(0, Math.floor(Number(replyCount) || 0));
};

export const buildThreadReplyCountsForRoots = async ({
  conversationId,
  rootIds = [],
  userId,
  groupChannelId = null,
}) => {
  const normalizedConversationId = normalizeObjectId(conversationId);
  const normalizedUserId = normalizeObjectId(userId);

  const uniqueRootIds = [
    ...new Set(
      (Array.isArray(rootIds) ? rootIds : [])
        .map((rootId) => normalizeObjectId(rootId))
        .filter(Boolean),
    ),
  ];

  if (!normalizedConversationId || !normalizedUserId || uniqueRootIds.length === 0) {
    return {};
  }

  const matchQuery = {
    conversationId: new mongoose.Types.ObjectId(normalizedConversationId),
    threadRootId: { $in: uniqueRootIds.map((id) => new mongoose.Types.ObjectId(id)) },
    isDeleted: { $ne: true },
    hiddenFor: { $ne: new mongoose.Types.ObjectId(normalizedUserId) },
  };

  const normalizedChannelId = String(groupChannelId || "").trim().toLowerCase();
  if (normalizedChannelId) {
    matchQuery.groupChannelId = normalizedChannelId;
  }

  const groupedCounts = await Message.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$threadRootId",
        replyCount: { $sum: 1 },
      },
    },
  ]);

  const replyCountsByRootId = {};
  uniqueRootIds.forEach((rootId) => {
    replyCountsByRootId[rootId] = 0;
  });

  groupedCounts.forEach((entry) => {
    const rootId = toStringId(entry?._id);
    if (!rootId) {
      return;
    }

    replyCountsByRootId[rootId] = Math.max(
      0,
      Math.floor(Number(entry?.replyCount) || 0),
    );
  });

  return replyCountsByRootId;
};

export const buildThreadStatsPayload = async ({
  conversationId,
  threadRootId,
  userId = null,
  groupChannelId = null,
}) => {
  const normalizedThreadRootId = normalizeObjectId(threadRootId);
  if (!normalizedThreadRootId) {
    return null;
  }

  const replyCount = await countThreadReplies({
    conversationId,
    threadRootId: normalizedThreadRootId,
    userId,
    groupChannelId,
  });

  return {
    threadRootId: normalizedThreadRootId,
    replyCount,
  };
};

export const buildThreadStatsPayloadForRoom = async ({
  conversationId,
  threadRootId,
  groupChannelId = null,
}) => {
  return buildThreadStatsPayload({
    conversationId,
    threadRootId,
    userId: null,
    groupChannelId,
  });
};

const MAX_CONVERSATION_THREAD_ROOTS = 300;

export const buildAllThreadReplyCountsForConversation = async ({
  conversationId,
  userId,
  groupChannelId = null,
  limit = MAX_CONVERSATION_THREAD_ROOTS,
}) => {
  const normalizedConversationId = normalizeObjectId(conversationId);
  const normalizedUserId = normalizeObjectId(userId);
  const safeLimit = Math.min(
    Math.max(Math.floor(Number(limit) || 0), 1),
    MAX_CONVERSATION_THREAD_ROOTS,
  );

  if (!normalizedConversationId || !normalizedUserId) {
    return {};
  }

  const matchQuery = {
    conversationId: new mongoose.Types.ObjectId(normalizedConversationId),
    threadRootId: { $ne: null },
    isDeleted: { $ne: true },
    hiddenFor: { $ne: new mongoose.Types.ObjectId(normalizedUserId) },
  };

  const normalizedChannelId = String(groupChannelId || "").trim().toLowerCase();
  if (normalizedChannelId) {
    matchQuery.groupChannelId = normalizedChannelId;
  }

  const groupedCounts = await Message.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$threadRootId",
        replyCount: { $sum: 1 },
      },
    },
    { $sort: { replyCount: -1, _id: -1 } },
    { $limit: safeLimit },
  ]);

  const replyCountsByRootId = {};
  groupedCounts.forEach((entry) => {
    const rootId = toStringId(entry?._id);
    if (!rootId) {
      return;
    }

    replyCountsByRootId[rootId] = Math.max(
      0,
      Math.floor(Number(entry?.replyCount) || 0),
    );
  });

  return replyCountsByRootId;
};
