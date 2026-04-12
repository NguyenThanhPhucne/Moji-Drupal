import express from "express";
import {
  createContentReport,
  getModerationReports,
  updateContentReportStatus,
} from "../controllers/safetyController.js";

const router = express.Router();

router.post("/reports", createContentReport);
router.get("/reports/moderation", getModerationReports);
router.patch("/reports/:reportId/status", updateContentReportStatus);

export default router;
