import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { buildMessagePreviewContent } from "../utils/messagePreview.js";

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_MAX_BATCHES_PER_TICK = 3;

let workerTimer = null;
let workerTickPromise = null;

const parsePositiveInteger = (value, fallback, { min = 1, max = 2000 } = {}) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return Math.min(max, parsed);
};

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const toStringId = (value) => value?.toString?.() || String(value || "");

const resolveBatchSize = () => {
  return parsePositiveInteger(
    process.env.MESSAGE_EXPIRY_CLEANUP_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    { min: 10, max: 2000 },
  );
};

const resolveIntervalMs = () => {
  return parsePositiveInteger(
    process.env.MESSAGE_EXPIRY_CLEANUP_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    { min: 5000, max: 10 * 60_000 },
  );
};

const resolveMaxBatchesPerTick = () => {
  return parsePositiveInteger(
    process.env.MESSAGE_EXPIRY_CLEANUP_MAX_BATCHES,
    DEFAULT_MAX_BATCHES_PER_TICK,
    { min: 1, max: 20 },
  );
};

const isWorkerEnabled = () => {
  return parseBoolean(
    process.env.MESSAGE_EXPIRY_CLEANUP_WORKER_ENABLED,
    true,
  );
};

const fetchExpiredMessageBatch = async (limit) => {
  const now = new Date();
  return Message.find({
    expiresAt: { $ne: null, $lte: now },
  })
    .select("_id conversationId expiresAt")
    .sort({ expiresAt: 1, _id: 1 })
    .limit(limit)
    .lean();
};

const groupExpiredMessagesByConversation = (rows) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const conversationId = toStringId(row?.conversationId).trim();
    if (!conversationId) {
      return;
    }

    const list = grouped.get(conversationId) || [];
    list.push(row?._id);
    grouped.set(conversationId, list);
  });

  return grouped;
};

const resolveLatestConversationMessage = async (conversationId) => {
  const latestMessage = await Message.findOne({
    conversationId,
    isDeleted: { $ne: true },
  })
    .select("_id content imgUrl audioUrl senderId createdAt groupChannelId")
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  if (!latestMessage) {
    return null;
  }

  return {
    _id: toStringId(latestMessage._id),
    content: buildMessagePreviewContent(latestMessage),
    senderId: latestMessage.senderId,
    createdAt: latestMessage.createdAt,
    groupChannelId: latestMessage.groupChannelId || null,
  };
};

const updateConversationPreviewIfNeeded = async ({
  conversationId,
  deletedIds,
}) => {
  const conversation = await Conversation.findById(conversationId)
    .select("lastMessage lastMessageAt createdAt pinnedMessage")
    .lean();

  if (!conversation) {
    return;
  }

  const deletedIdSet = new Set(deletedIds.map((id) => toStringId(id)));
  const lastMessageId = String(conversation?.lastMessage?._id || "").trim();
  const pinnedMessageId = String(conversation?.pinnedMessage?._id || "").trim();

  const shouldUpdateLastMessage =
    Boolean(lastMessageId) && deletedIdSet.has(lastMessageId);
  const shouldClearPinned =
    Boolean(pinnedMessageId) && deletedIdSet.has(pinnedMessageId);

  if (!shouldUpdateLastMessage && !shouldClearPinned) {
    return;
  }

  const updatePatch = {};

  if (shouldUpdateLastMessage) {
    const latestPreview = await resolveLatestConversationMessage(conversationId);
    updatePatch.lastMessage = latestPreview;
    updatePatch.lastMessageAt = latestPreview
      ? latestPreview.createdAt
      : conversation?.createdAt || null;
  }

  if (shouldClearPinned) {
    updatePatch.pinnedMessage = null;
  }

  await Conversation.findOneAndUpdate(
    { _id: conversationId },
    { $set: updatePatch },
  );
};

const processExpiredMessagesBatch = async (batchSize) => {
  const expiredRows = await fetchExpiredMessageBatch(batchSize);
  if (expiredRows.length === 0) {
    return 0;
  }

  const grouped = groupExpiredMessagesByConversation(expiredRows);
  let processed = 0;

  for (const [conversationId, messageIds] of grouped.entries()) {
    if (!messageIds.length) {
      continue;
    }

    try {
      await Message.deleteMany({
        _id: { $in: messageIds },
        conversationId,
      });
      processed += messageIds.length;
    } catch (error) {
      console.error(
        "[message-expiry] Failed to delete expired messages",
        error,
      );
      continue;
    }

    try {
      await updateConversationPreviewIfNeeded({
        conversationId,
        deletedIds: messageIds,
      });
    } catch (error) {
      console.error(
        "[message-expiry] Failed to update conversation preview",
        error,
      );
    }
  }

  return processed;
};

const runCleanupTick = async () => {
  if (workerTickPromise) {
    return workerTickPromise;
  }

  const batchSize = resolveBatchSize();
  const maxBatches = resolveMaxBatchesPerTick();

  workerTickPromise = (async () => {
    let totalProcessed = 0;

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const processed = await processExpiredMessagesBatch(batchSize);
      totalProcessed += processed;
      if (processed === 0) {
        break;
      }
    }

    if (totalProcessed > 0) {
      console.info(
        `[message-expiry] Cleaned ${totalProcessed} expired messages`,
      );
    }
  })();

  try {
    await workerTickPromise;
  } finally {
    workerTickPromise = null;
  }
};

export const startMessageExpiryCleanupWorker = async () => {
  if (!isWorkerEnabled()) {
    console.info("[message-expiry] Worker disabled by config");
    return;
  }

  if (workerTimer) {
    return;
  }

  const intervalMs = resolveIntervalMs();

  workerTimer = setInterval(() => {
    runCleanupTick().catch((error) => {
      console.error("[message-expiry] Worker tick failed", error);
    });
  }, intervalMs);

  await runCleanupTick();
  console.info(`[message-expiry] Worker started (interval=${intervalMs}ms)`);
};

export const stopMessageExpiryCleanupWorker = async () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }

  if (workerTickPromise) {
    try {
      await workerTickPromise;
    } catch {
      // ignore
    }
  }
};
