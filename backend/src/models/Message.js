import mongoose from "mongoose";
import { adjustMessageCountInDrupal } from "../libs/drupalSync.js";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      trim: true,
    },
    imgUrl: {
      type: String,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        emoji: String,
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    hiddenFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  },
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index(
  { content: "text" },
  {
    name: "message_content_text_index",
    partialFilterExpression: {
      isDeleted: { $ne: true },
      content: { $type: "string" },
    },
  },
);

// Keep track of create vs update so we only adjust counts for new documents.
messageSchema.pre("save", function (next) {
  this._wasNew = this.isNew;
  next();
});

// Update message count in Drupal after new message.
messageSchema.post("save", async function (doc) {
  try {
    if (!doc._wasNew) {
      return;
    }

    const conversationId = doc.conversationId.toString();
    await adjustMessageCountInDrupal(conversationId, 1);
  } catch (error) {
    console.error("Failed to update message count in Drupal:", error);
  }
});

// Update message count in Drupal after message deletion
messageSchema.post("deleteOne", async function () {
  try {
    const query = this.getQuery();
    if (query.conversationId) {
      const conversationId = query.conversationId.toString();
      await adjustMessageCountInDrupal(conversationId, -1);
    }
  } catch (error) {
    console.error("Failed to update message count in Drupal:", error);
  }
});

const Message = mongoose.model("Message", messageSchema);

export default Message;
