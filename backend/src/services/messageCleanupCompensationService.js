import mongoose from "mongoose";
import Bookmark from "../models/Bookmark.js";
import ContentReport from "../models/ContentReport.js";

export const MESSAGE_CLEANUP_COMPENSATION_COLLECTION =
  "message_cleanup_compensations";

const MESSAGE_CLEANUP_COMPENSATION_SCOPE = "message-dependents";
const RETRYABLE_STATUSES = ["pending", "failed"];
const PROCESSING_STATUS = "processing";
const FAILED_STATUS = "failed";
const COMPLETED_STATUS = "completed";
const EXHAUSTED_STATUS = "dead-letter";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_WORKER_INTERVAL_MS = 30_000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BACKOFF_BASE_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

let workerTimer = null;
let workerTickPromise = null;
let indexesEnsured = false;

const parsePositiveInteger = (value, fallback, { min = 1, max = 500 } = {}) => {
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

const normalizeObjectIdList = (values) => {
  const normalizedIds = [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )];

  const objectIds = normalizedIds
    .filter((value) => mongoose.isValidObjectId(value))
    .map((value) => mongoose.Types.ObjectId.createFromHexString(value));

  return { normalizedIds, objectIds };
};

const getCollection = () => {
  const collection = mongoose?.connection?.db?.collection?.(
    MESSAGE_CLEANUP_COMPENSATION_COLLECTION,
  );

  if (!collection) {
    throw new Error("MongoDB connection is not ready for compensation queue");
  }

  return collection;
};

const resolveBatchSize = (value) => {
  return parsePositiveInteger(
    value ?? process.env.MESSAGE_CLEANUP_COMPENSATION_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    { min: 1, max: 200 },
  );
};

const resolveMaxRetries = (value) => {
  return parsePositiveInteger(
    value ?? process.env.MESSAGE_CLEANUP_COMPENSATION_MAX_RETRIES,
    DEFAULT_MAX_RETRIES,
    { min: 1, max: 50 },
  );
};

const resolveBackoffBaseMs = (value) => {
  return parsePositiveInteger(
    value ?? process.env.MESSAGE_CLEANUP_COMPENSATION_BACKOFF_BASE_MS,
    DEFAULT_BACKOFF_BASE_MS,
    { min: 100, max: MAX_BACKOFF_MS },
  );
};

const resolveWorkerIntervalMs = (value) => {
  return parsePositiveInteger(
    value ?? process.env.MESSAGE_CLEANUP_COMPENSATION_WORKER_INTERVAL_MS,
    DEFAULT_WORKER_INTERVAL_MS,
    { min: 500, max: 15 * 60 * 1000 },
  );
};

const isWorkerEnabled = () => {
  return parseBoolean(
    process.env.MESSAGE_CLEANUP_COMPENSATION_WORKER_ENABLED,
    true,
  );
};

const computeBackoffMs = ({ retryCount, baseBackoffMs }) => {
  const exponent = Math.max(0, Number(retryCount || 1) - 1);
  const proposed = baseBackoffMs * 2 ** exponent;
  return Math.min(MAX_BACKOFF_MS, proposed);
};

const claimOneCompensationRecord = async ({ collection, workerId, maxRetries }) => {
  const now = new Date();

  return collection.findOneAndUpdate(
    {
      scope: MESSAGE_CLEANUP_COMPENSATION_SCOPE,
      status: { $in: RETRYABLE_STATUSES },
      retryCount: { $lt: maxRetries },
      $or: [
        { nextRetryAt: { $exists: false } },
        { nextRetryAt: null },
        { nextRetryAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: PROCESSING_STATUS,
        processingWorkerId: workerId,
        lastAttemptAt: now,
        lockedAt: now,
        updatedAt: now,
      },
    },
    {
      sort: { updatedAt: 1, createdAt: 1 },
      returnDocument: "after",
      includeResultMetadata: false,
    },
  );
};

const executeDependentCleanup = async ({ messageIds }) => {
  const { normalizedIds, objectIds } = normalizeObjectIdList(messageIds);

  if (objectIds.length === 0) {
    throw new Error("Compensation payload has no valid messageIds");
  }

  const [bookmarkDeleteResult, contentReportDeleteResult] = await Promise.all([
    Bookmark.deleteMany({ messageId: { $in: objectIds } }),
    ContentReport.deleteMany({
      targetType: "message",
      targetId: { $in: objectIds },
    }),
  ]);

  return {
    requestedMessageIds: normalizedIds.length,
    validMessageIds: objectIds.length,
    deletedBookmarks: Number(bookmarkDeleteResult?.deletedCount || 0),
    deletedContentReports: Number(contentReportDeleteResult?.deletedCount || 0),
  };
};

const markCompensationRecordCompleted = async ({ collection, recordId, result }) => {
  const now = new Date();

  await collection.updateOne(
    { _id: recordId, status: PROCESSING_STATUS },
    {
      $set: {
        status: COMPLETED_STATUS,
        completedAt: now,
        updatedAt: now,
        processingWorkerId: null,
        lockedAt: null,
        nextRetryAt: null,
        cleanupResult: result,
      },
    },
  );
};

const markCompensationRecordFailed = async ({
  collection,
  record,
  error,
  maxRetries,
  baseBackoffMs,
}) => {
  const nextRetryCount = Number(record?.retryCount || 0) + 1;
  const exhausted = nextRetryCount >= maxRetries;
  const now = new Date();

  const nextRetryAt = exhausted
    ? null
    : new Date(
        now.getTime() +
          computeBackoffMs({ retryCount: nextRetryCount, baseBackoffMs }),
      );

  return collection.findOneAndUpdate(
    { _id: record._id, status: PROCESSING_STATUS },
    {
      $set: {
        status: exhausted ? EXHAUSTED_STATUS : FAILED_STATUS,
        errorName: String(error?.name || "Error"),
        errorMessage: String(error?.message || error),
        lastFailureAt: now,
        updatedAt: now,
        processingWorkerId: null,
        lockedAt: null,
        nextRetryAt,
      },
      $inc: {
        retryCount: 1,
      },
    },
    {
      returnDocument: "after",
      includeResultMetadata: false,
    },
  );
};

const processSingleCompensationRecord = async ({
  collection,
  workerId,
  maxRetries,
  baseBackoffMs,
}) => {
  const record = await claimOneCompensationRecord({
    collection,
    workerId,
    maxRetries,
  });

  if (!record) {
    return null;
  }

  try {
    const cleanupResult = await executeDependentCleanup({
      messageIds: record?.messageIds,
    });

    await markCompensationRecordCompleted({
      collection,
      recordId: record._id,
      result: cleanupResult,
    });

    return {
      taskId: String(record._id),
      status: COMPLETED_STATUS,
      cleanupResult,
    };
  } catch (error) {
    const failedRecord = await markCompensationRecordFailed({
      collection,
      record,
      error,
      maxRetries,
      baseBackoffMs,
    });

    return {
      taskId: String(record._id),
      status: failedRecord?.status || FAILED_STATUS,
      retryCount: Number(failedRecord?.retryCount || Number(record.retryCount || 0) + 1),
      errorMessage: String(error?.message || error),
    };
  }
};

export const ensureMessageCleanupCompensationIndexes = async () => {
  if (indexesEnsured) {
    return;
  }

  const collection = getCollection();

  await Promise.all([
    collection.createIndex({ scope: 1, status: 1, retryCount: 1, nextRetryAt: 1 }),
    collection.createIndex({ scope: 1, createdAt: 1 }),
  ]);

  indexesEnsured = true;
};

export const processMessageCleanupCompensationBatch = async ({
  limit,
  workerId = `manual:${process.pid}`,
  maxRetries,
  baseBackoffMs,
} = {}) => {
  const batchLimit = resolveBatchSize(limit);
  const resolvedMaxRetries = resolveMaxRetries(maxRetries);
  const resolvedBackoffBaseMs = resolveBackoffBaseMs(baseBackoffMs);
  const collection = getCollection();

  const summary = {
    limit: batchLimit,
    claimed: 0,
    completed: 0,
    failed: 0,
    deadLettered: 0,
    items: [],
  };

  for (let index = 0; index < batchLimit; index += 1) {
    const itemResult = await processSingleCompensationRecord({
      collection,
      workerId,
      maxRetries: resolvedMaxRetries,
      baseBackoffMs: resolvedBackoffBaseMs,
    });

    if (!itemResult) {
      break;
    }

    summary.claimed += 1;
    summary.items.push(itemResult);

    if (itemResult.status === COMPLETED_STATUS) {
      summary.completed += 1;
      continue;
    }

    summary.failed += 1;
    if (itemResult.status === EXHAUSTED_STATUS) {
      summary.deadLettered += 1;
    }
  }

  summary.hasMore = summary.claimed === batchLimit;
  return summary;
};

export const getMessageCleanupCompensationStats = async () => {
  const collection = getCollection();

  const grouped = await collection
    .aggregate([
      { $match: { scope: MESSAGE_CLEANUP_COMPENSATION_SCOPE } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const counts = grouped.reduce(
    (next, entry) => {
      next[String(entry?._id || "unknown")] = Number(entry?.count || 0);
      return next;
    },
    {
      pending: 0,
      failed: 0,
      processing: 0,
      completed: 0,
      "dead-letter": 0,
      unknown: 0,
    },
  );

  const oldestRetryableRecord = await collection
    .find({
      scope: MESSAGE_CLEANUP_COMPENSATION_SCOPE,
      status: { $in: RETRYABLE_STATUSES },
    })
    .sort({ createdAt: 1 })
    .limit(1)
    .project({
      _id: 1,
      status: 1,
      retryCount: 1,
      createdAt: 1,
      nextRetryAt: 1,
    })
    .toArray();

  const total = Object.values(counts).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );

  return {
    counts,
    total,
    retryable: counts.pending + counts.failed,
    oldestRetryableRecord:
      oldestRetryableRecord.length > 0 ? oldestRetryableRecord[0] : null,
  };
};

const runWorkerTick = async ({ workerId, limit, maxRetries, baseBackoffMs }) => {
  if (workerTickPromise) {
    return workerTickPromise;
  }

  workerTickPromise = processMessageCleanupCompensationBatch({
    limit,
    workerId,
    maxRetries,
    baseBackoffMs,
  })
    .then((summary) => {
      if (summary.claimed > 0) {
        console.log("[compensation-worker] batch processed", {
          claimed: summary.claimed,
          completed: summary.completed,
          failed: summary.failed,
          deadLettered: summary.deadLettered,
        });
      }

      return summary;
    })
    .catch((error) => {
      console.error("[compensation-worker] batch failed", error);
      return null;
    })
    .finally(() => {
      workerTickPromise = null;
    });

  return workerTickPromise;
};

export const startMessageCleanupCompensationWorker = async () => {
  if (workerTimer) {
    return true;
  }

  if (!isWorkerEnabled()) {
    console.log("[compensation-worker] disabled by env configuration");
    return false;
  }

  try {
    await ensureMessageCleanupCompensationIndexes();
  } catch (error) {
    console.error("[compensation-worker] failed to prepare indexes", error);
  }

  const intervalMs = resolveWorkerIntervalMs();
  const batchSize = resolveBatchSize();
  const maxRetries = resolveMaxRetries();
  const baseBackoffMs = resolveBackoffBaseMs();
  const workerId = `worker:${process.pid}`;

  workerTimer = setInterval(() => {
    void runWorkerTick({
      workerId,
      limit: batchSize,
      maxRetries,
      baseBackoffMs,
    });
  }, intervalMs);

  workerTimer.unref?.();

  console.log("[compensation-worker] started", {
    intervalMs,
    batchSize,
    maxRetries,
  });

  void runWorkerTick({
    workerId,
    limit: batchSize,
    maxRetries,
    baseBackoffMs,
  });

  return true;
};

export const stopMessageCleanupCompensationWorker = async () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }

  if (workerTickPromise) {
    await workerTickPromise;
  }
};
