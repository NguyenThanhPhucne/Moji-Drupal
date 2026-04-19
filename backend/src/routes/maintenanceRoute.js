import express from "express";
import {
  getMessageCleanupCompensationQueueStats,
  retryMessageCleanupCompensations,
} from "../controllers/maintenanceController.js";

const router = express.Router();

router.get(
  "/message-cleanup-compensations/stats",
  getMessageCleanupCompensationQueueStats,
);
router.post(
  "/message-cleanup-compensations/retry",
  retryMessageCleanupCompensations,
);

export default router;
