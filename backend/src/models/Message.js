import mongoose from "mongoose";
import { updateMessageCountInDrupal } from "../libs/drupalSync.js";

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
  },
  {
    timestamps: true,
  },
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

// Update message count in Drupal after new message
messageSchema.post("save", async function (doc) {
  try {
    const conversationId = doc.conversationId.toString();
    const messageCount = await Message.countDocuments({
      conversationId: doc.conversationId,
    });
    await updateMessageCountInDrupal(conversationId, messageCount);
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
      const messageCount = await Message.countDocuments({
        conversationId: query.conversationId,
      });
      await updateMessageCountInDrupal(conversationId, messageCount);
    }
  } catch (error) {
    console.error("Failed to update message count in Drupal:", error);
  }
});

const Message = mongoose.model("Message", messageSchema);

export default Message;
