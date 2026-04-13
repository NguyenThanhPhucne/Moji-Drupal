import mongoose from "mongoose";

const contentReportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reportedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["message", "post", "comment"],
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ["spam", "harassment", "hate", "nudity", "violence", "misinformation", "other"],
      default: "other",
      index: true,
    },
    details: {
      type: String,
      trim: true,
      maxlength: 600,
      default: "",
    },
    context: {
      conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        default: null,
      },
      postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
        default: null,
      },
      snapshot: {
        type: String,
        trim: true,
        maxlength: 500,
        default: "",
      },
    },
    status: {
      type: String,
      enum: ["open", "reviewing", "resolved", "dismissed"],
      default: "open",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    moderationNote: {
      type: String,
      trim: true,
      maxlength: 600,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

contentReportSchema.index({ targetType: 1, targetId: 1, status: 1, createdAt: -1 });
contentReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1, createdAt: -1 });
contentReportSchema.index({ "context.conversationId": 1, createdAt: -1 });

const ContentReport = mongoose.model("ContentReport", contentReportSchema);

export default ContentReport;
