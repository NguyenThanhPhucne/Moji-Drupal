import {
  getMessageCleanupCompensationStats,
  processMessageCleanupCompensationBatch,
} from "../services/messageCleanupCompensationService.js";

const canManageCompensations = (roles) => {
  const normalizedRoles = Array.isArray(roles) ? roles : [];
  return (
    normalizedRoles.includes("administrator") ||
    normalizedRoles.includes("sales_manager")
  );
};

const parsePositiveInteger = (value, fallback, { min = 1, max = 200 } = {}) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return Math.min(max, parsed);
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
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

const mergeBatchSummary = (target, source) => {
  target.batches += 1;
  target.claimed += Number(source?.claimed || 0);
  target.completed += Number(source?.completed || 0);
  target.failed += Number(source?.failed || 0);
  target.deadLettered += Number(source?.deadLettered || 0);
};

export const getMessageCleanupCompensationQueueStats = async (req, res) => {
  try {
    if (!canManageCompensations(req.authRoles)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const queue = await getMessageCleanupCompensationStats();
    return res.status(200).json({ queue });
  } catch (error) {
    console.error("[maintenance] getMessageCleanupCompensationQueueStats", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const retryMessageCleanupCompensations = async (req, res) => {
  try {
    if (!canManageCompensations(req.authRoles)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const limit = parsePositiveInteger(req.body?.limit, 25, {
      min: 1,
      max: 200,
    });
    const maxBatches = parsePositiveInteger(req.body?.maxBatches, 10, {
      min: 1,
      max: 50,
    });
    const drain = parseBoolean(req.body?.drain, true);

    const manualWorkerId = `manual:${req.user?._id || "unknown"}`;
    const summary = {
      batches: 0,
      claimed: 0,
      completed: 0,
      failed: 0,
      deadLettered: 0,
    };

    for (let index = 0; index < maxBatches; index += 1) {
      const batchSummary = await processMessageCleanupCompensationBatch({
        limit,
        workerId: manualWorkerId,
      });

      mergeBatchSummary(summary, batchSummary);

      const noMoreWork =
        Number(batchSummary?.claimed || 0) === 0 || !batchSummary?.hasMore;

      if (!drain || noMoreWork) {
        break;
      }
    }

    const queue = await getMessageCleanupCompensationStats();

    return res.status(200).json({
      summary,
      queue,
      options: {
        limit,
        maxBatches,
        drain,
      },
    });
  } catch (error) {
    console.error("[maintenance] retryMessageCleanupCompensations", error);
    return res.status(500).json({ message: "System error" });
  }
};
