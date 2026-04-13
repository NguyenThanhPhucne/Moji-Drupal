import mongoose from "mongoose";
import {
  syncConversationToDrupal,
  deleteConversationFromDrupal,
} from "../libs/drupalSync.js";

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    adminIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    announcementOnly: {
      type: Boolean,
      default: false,
    },
    joinLink: {
      tokenHash: {
        type: String,
        default: null,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
      createdAt: {
        type: Date,
        default: null,
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
  },
  {
    _id: false,
  },
);

const lastMessageSchema = new mongoose.Schema(
  {
    _id: { type: String },
    content: {
      type: String,
      default: null,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const pinnedMessageSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
    },
    content: {
      type: String,
      default: null,
    },
    imgUrl: {
      type: String,
      default: null,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdAt: {
      type: Date,
      default: null,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    _id: false,
  },
);

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
    },
    group: {
      type: groupSchema,
    },
    lastMessageAt: {
      type: Date,
    },
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    lastMessage: {
      type: lastMessageSchema,
      default: null,
    },
    pinnedMessage: {
      type: pinnedMessageSchema,
      default: null,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    // Deterministic key for one-to-one chat pairs to prevent duplicate direct rooms.
    directKey: {
      type: String,
      default: null,
      trim: true,
    },
    // Denormalized counter — kept in sync by Message schema post-hooks via adjustMessageCountInDrupal.
    // Used by the admin API to avoid expensive JOIN aggregations on every page load.
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

  },
  {
    timestamps: true,
  },
);

conversationSchema.pre("validate", function (next) {
  if (this.type !== "direct") {
    this.directKey = null;
    return next();
  }

  const participantIds = (this.participants || [])
    .map((participant) => participant?.userId?.toString?.())
    .filter(Boolean)
    .sort((leftId, rightId) => leftId.localeCompare(rightId));

  if (participantIds.length === 2 && participantIds[0] !== participantIds[1]) {
    this.directKey = `${participantIds[0]}:${participantIds[1]}`;
  }

  next();
});

conversationSchema.index({
  "participants.userId": 1,
  lastMessageAt: -1,
});

conversationSchema.index(
  { directKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "direct",
      directKey: { $type: "string" },
    },
  },
);

// Real-time sync to Drupal after save/update
conversationSchema.post("save", async function (doc) {
  try {
    await syncConversationToDrupal(doc);
  } catch (error) {
    console.error("Failed to sync conversation to Drupal:", error);
  }
});

conversationSchema.post("findOneAndUpdate", async function (doc) {
  if (doc) {
    try {
      await syncConversationToDrupal(doc);
    } catch (error) {
      console.error("Failed to sync updated conversation to Drupal:", error);
    }
  }
});

// Real-time delete from Drupal
conversationSchema.post("findOneAndDelete", async function (doc) {
  if (doc) {
    try {
      await deleteConversationFromDrupal(doc._id.toString());
    } catch (error) {
      console.error("Failed to delete conversation from Drupal:", error);
    }
  }
});

conversationSchema.post("deleteOne", async function () {
  try {
    const conversationId = this.getQuery()._id?.toString();
    if (conversationId) {
      await deleteConversationFromDrupal(conversationId);
    }
  } catch (error) {
    console.error("Failed to delete conversation from Drupal:", error);
  }
});

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
