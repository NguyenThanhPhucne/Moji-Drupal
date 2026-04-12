import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import ContentReport from "../models/ContentReport.js";

const ALLOWED_REPORT_REASONS = new Set([
  "spam",
  "harassment",
  "hate",
  "nudity",
  "violence",
  "misinformation",
  "other",
]);

const ALLOWED_REPORT_STATUSES = new Set([
  "open",
  "reviewing",
  "resolved",
  "dismissed",
]);

const canModerateReports = (roles) => {
  const normalizedRoles = Array.isArray(roles) ? roles : [];
  return (
    normalizedRoles.includes("administrator") ||
    normalizedRoles.includes("sales_manager")
  );
};

const sanitizeReportReason = (value) => {
  const normalized = String(value || "other").trim().toLowerCase();
  return ALLOWED_REPORT_REASONS.has(normalized) ? normalized : "other";
};

const sanitizeReportDetails = (value) => {
  return String(value || "").replaceAll(/\s+/g, " ").trim().slice(0, 600);
};

const buildSnapshot = (value) => {
  return String(value || "").replaceAll(/\s+/g, " ").trim().slice(0, 500);
};

const resolveTargetPayload = async ({ targetType, targetId, reporterId }) => {
  if (targetType === "message") {
    const message = await Message.findById(targetId)
      .select("_id senderId content conversationId isDeleted")
      .lean();

    if (!message || message.isDeleted) {
      return null;
    }

    const isParticipant = await Conversation.exists({
      _id: message.conversationId,
      "participants.userId": reporterId,
    });

    if (!isParticipant) {
      return { denied: true };
    }

    return {
      reportedUserId: message.senderId,
      context: {
        conversationId: message.conversationId,
        postId: null,
        snapshot: buildSnapshot(message.content),
      },
    };
  }

  if (targetType === "post") {
    const post = await Post.findById(targetId)
      .select("_id authorId caption isDeleted")
      .lean();

    if (!post || post.isDeleted) {
      return null;
    }

    return {
      reportedUserId: post.authorId,
      context: {
        conversationId: null,
        postId: post._id,
        snapshot: buildSnapshot(post.caption),
      },
    };
  }

  if (targetType === "comment") {
    const comment = await Comment.findById(targetId)
      .select("_id authorId content postId isDeleted")
      .lean();

    if (!comment || comment.isDeleted) {
      return null;
    }

    return {
      reportedUserId: comment.authorId,
      context: {
        conversationId: null,
        postId: comment.postId,
        snapshot: buildSnapshot(comment.content),
      },
    };
  }

  return null;
};

export const createContentReport = async (req, res) => {
  try {
    const reporterId = req.user._id;
    const {
      targetType = "",
      targetId = "",
      reason = "other",
      details = "",
    } = req.body || {};

    const normalizedTargetType = String(targetType || "").trim().toLowerCase();
    const normalizedTargetId = String(targetId || "").trim();

    if (!["message", "post", "comment"].includes(normalizedTargetType)) {
      return res.status(400).json({
        message: "targetType must be message, post, or comment",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(normalizedTargetId)) {
      return res.status(400).json({ message: "Invalid target id" });
    }

    const targetPayload = await resolveTargetPayload({
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      reporterId,
    });

    if (!targetPayload) {
      return res.status(404).json({ message: "Target content not found" });
    }

    if (targetPayload.denied) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (String(targetPayload.reportedUserId) === String(reporterId)) {
      return res.status(400).json({ message: "You cannot report your own content" });
    }

    const existing = await ContentReport.findOne({
      reporterId,
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      status: { $in: ["open", "reviewing"] },
    }).lean();

    if (existing) {
      return res.status(200).json({
        report: existing,
        duplicate: true,
      });
    }

    const report = await ContentReport.create({
      reporterId,
      reportedUserId: targetPayload.reportedUserId,
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      reason: sanitizeReportReason(reason),
      details: sanitizeReportDetails(details),
      context: targetPayload.context,
      status: "open",
    });

    return res.status(201).json({ report });
  } catch (error) {
    console.error("[safety] createContentReport error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const getModerationReports = async (req, res) => {
  try {
    if (!canModerateReports(req.authRoles)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const statusQuery = String(req.query.status || "").trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = {};
    if (statusQuery) {
      if (!ALLOWED_REPORT_STATUSES.has(statusQuery)) {
        return res.status(400).json({ message: "Invalid report status" });
      }

      query.status = statusQuery;
    }

    const [reports, total] = await Promise.all([
      ContentReport.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("reporterId", "displayName username avatarUrl")
        .populate("reportedUserId", "displayName username avatarUrl")
        .populate("reviewedBy", "displayName username avatarUrl")
        .lean(),
      ContentReport.countDocuments(query),
    ]);

    return res.status(200).json({
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + reports.length < total,
      },
    });
  } catch (error) {
    console.error("[safety] getModerationReports error", error);
    return res.status(500).json({ message: "System error" });
  }
};

export const updateContentReportStatus = async (req, res) => {
  try {
    if (!canModerateReports(req.authRoles)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { reportId } = req.params;
    const nextStatus = String(req.body?.status || "").trim().toLowerCase();
    const moderationNote = sanitizeReportDetails(req.body?.moderationNote || "");

    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ message: "Invalid report id" });
    }

    if (!ALLOWED_REPORT_STATUSES.has(nextStatus)) {
      return res.status(400).json({ message: "Invalid report status" });
    }

    const report = await ContentReport.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    report.status = nextStatus;
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();
    report.moderationNote = moderationNote;
    await report.save();

    await report.populate("reporterId", "displayName username avatarUrl");
    await report.populate("reportedUserId", "displayName username avatarUrl");
    await report.populate("reviewedBy", "displayName username avatarUrl");

    return res.status(200).json({ report });
  } catch (error) {
    console.error("[safety] updateContentReportStatus error", error);
    return res.status(500).json({ message: "System error" });
  }
};
