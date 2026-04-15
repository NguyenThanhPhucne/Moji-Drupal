import mongoose from "mongoose";
import { adjustMessageCountInDrupal } from "../libs/drupalSync.js";

const normalizeObjectIdValue = (value) => value?.toString?.() || String(value || "");

const cleanupMessageDependents = async (messageIds, options = {}) => {
  if (options?.skipDependentCleanup) {
    return;
  }

  const normalizedIds = [...new Set(
    (Array.isArray(messageIds) ? messageIds : [])
      .map((messageId) => normalizeObjectIdValue(messageId))
      .filter(Boolean),
  )];

  if (normalizedIds.length === 0) {
    return;
  }

  try {
    const [{ default: Bookmark }, { default: ContentReport }] = await Promise.all([
      import("./Bookmark.js"),
      import("./ContentReport.js"),
    ]);

    await Promise.all([
      Bookmark.deleteMany({ messageId: { $in: normalizedIds } }),
      ContentReport.deleteMany({
        targetType: "message",
        targetId: { $in: normalizedIds },
      }),
    ]);
  } catch (error) {
    console.error("[Message.cleanup] Failed to cleanup dependent documents:", error);
  }
};

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    groupChannelId: {
      type: String,
      default: null,
      trim: true,
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
    forwardedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isForwardable: {
      type: Boolean,
      default: true,
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
messageSchema.index({ conversationId: 1, groupChannelId: 1, createdAt: -1 });
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

// Update message count in Drupal + MongoDB after new message.
messageSchema.post("save", async function (doc) {
  try {
    if (!doc._wasNew) {
      return;
    }

    const conversationId = doc.conversationId.toString();

    // Fire-and-forget: Update MongoDB Conversation.messageCount atomically
    import("./Conversation.js").then(({ default: Conversation }) => {
      Conversation.updateOne(
        { _id: doc.conversationId },
        { $inc: { messageCount: 1 } },
      ).catch((err) =>
        console.error("[Message.post.save] Failed to increment messageCount in MongoDB:", err),
      );
    }).catch(() => {/* Circular import guard */});

    await adjustMessageCountInDrupal(conversationId, 1);
  } catch (error) {
    console.error("Failed to update message count in Drupal:", error);
  }
});

// Update message count in Drupal after message deletion
messageSchema.pre("deleteOne", { document: false, query: true }, async function () {
  const filter = this.getFilter() || {};
  const targetMessage = await this.model
    .findOne(filter)
    .select("_id conversationId")
    .lean();

  this._deletedMessageIds = targetMessage?._id ? [targetMessage._id] : [];
  this._conversationIdForSingleDelete =
    normalizeObjectIdValue(targetMessage?.conversationId) ||
    normalizeObjectIdValue(filter?.conversationId) ||
    null;
});

messageSchema.post("deleteOne", async function () {
  try {
    const query = this.getQuery();
    const options = this.getOptions?.() || {};
    const conversationId =
      this._conversationIdForSingleDelete ||
      normalizeObjectIdValue(query?.conversationId) ||
      null;

    if (conversationId && !options.skipCounterSync) {

      // Fire-and-forget: Decrement MongoDB Conversation.messageCount
      import("./Conversation.js").then(({ default: Conversation }) => {
        Conversation.updateOne(
          { _id: conversationId },
          { $inc: { messageCount: -1 } },
        ).catch((err) =>
          console.error("[Message.post.deleteOne] Failed to decrement messageCount in MongoDB:", err),
        );
      }).catch(() => {/* Circular import guard */});

      await adjustMessageCountInDrupal(conversationId, -1);
    }

    await cleanupMessageDependents(this._deletedMessageIds, options);
  } catch (error) {
    console.error("Failed to update message count in Drupal:", error);
  }
});

messageSchema.pre("findOneAndDelete", async function () {
  const filter = this.getFilter() || {};
  const targetMessage = await this.model
    .findOne(filter)
    .select("_id conversationId")
    .lean();

  this._deletedMessageIds = targetMessage?._id ? [targetMessage._id] : [];
  this._conversationIdForSingleDelete =
    normalizeObjectIdValue(targetMessage?.conversationId) ||
    normalizeObjectIdValue(filter?.conversationId) ||
    null;
});

messageSchema.post("findOneAndDelete", async function (doc) {
  try {
    const options = this.getOptions?.() || {};
    const conversationId =
      normalizeObjectIdValue(doc?.conversationId) ||
      this._conversationIdForSingleDelete ||
      null;

    if (conversationId && !options.skipCounterSync) {
      import("./Conversation.js").then(({ default: Conversation }) => {
        Conversation.updateOne(
          { _id: conversationId },
          { $inc: { messageCount: -1 } },
        ).catch((err) =>
          console.error("[Message.post.findOneAndDelete] Failed to decrement messageCount in MongoDB:", err),
        );
      }).catch(() => {/* Circular import guard */});

      await adjustMessageCountInDrupal(conversationId, -1);
    }

    const deletedMessageIds = doc?._id ? [doc._id] : this._deletedMessageIds;
    await cleanupMessageDependents(deletedMessageIds, options);
  } catch (error) {
    console.error("Failed to update message count in Drupal (findOneAndDelete):", error);
  }
});

messageSchema.pre("deleteMany", async function () {
  const filter = this.getFilter() || {};
  const options = this.getOptions?.() || {};
  const conversationId = filter.conversationId;

  if (!options.skipDependentCleanup) {
    const messageIdDocs = await this.model.find(filter).select("_id").lean();
    this._deletedMessageIdsForBulkDelete = messageIdDocs
      .map((messageDoc) => messageDoc?._id)
      .filter(Boolean);

    if (!options.skipCounterSync && conversationId) {
      this._bulkDeleteMessageCount = this._deletedMessageIdsForBulkDelete.length;
    }
  }

  if (conversationId && !options.skipCounterSync) {
    this._conversationIdForBulkDelete = normalizeObjectIdValue(conversationId);

    if (typeof this._bulkDeleteMessageCount !== "number") {
      this._bulkDeleteMessageCount = await this.model.countDocuments(filter);
    }
  }
});

messageSchema.post("deleteMany", async function (result) {
  try {
    const options = this.getOptions?.() || {};
    const conversationId = this._conversationIdForBulkDelete;

    if (conversationId && !options.skipCounterSync) {
      const deletedCount =
        typeof result?.deletedCount === "number"
          ? result.deletedCount
          : this._bulkDeleteMessageCount || 0;

      if (deletedCount > 0) {
        // Fire-and-forget: Bulk decrement MongoDB Conversation.messageCount
        import("./Conversation.js").then(({ default: Conversation }) => {
          Conversation.updateOne(
            { _id: conversationId },
            { $inc: { messageCount: -deletedCount } },
          ).catch((err) =>
            console.error("[Message.post.deleteMany] Failed to bulk-decrement messageCount in MongoDB:", err),
          );
        }).catch(() => {/* Circular import guard */});

        await adjustMessageCountInDrupal(conversationId, -deletedCount);
      }
    }

    await cleanupMessageDependents(this._deletedMessageIdsForBulkDelete, options);
  } catch (error) {
    console.error("Failed to update message count in Drupal (deleteMany):", error);
  }
});

const Message = mongoose.model("Message", messageSchema);

export default Message;
