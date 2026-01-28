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
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

conversationSchema.index({
  "participant.userId": 1,
  lastMessageAt: -1,
});

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
