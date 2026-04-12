import mongoose from "mongoose";

// ── Post cascade cleanup ──────────────────────────────────────────────────────
// Registered lazily so circular imports are avoided.
const cascadeDeletePostRelated = async (postId) => {
  if (!postId) return;
  const idStr = String(postId);
  try {
    const [Comment, Notification, Bookmark] = await Promise.all([
      import("./Comment.js").then((m) => m.default),
      import("./Notification.js").then((m) => m.default),
      import("./Bookmark.js").then((m) => m.default),
    ]);
    await Promise.all([
      // Soft-delete all Comments belonging to the post
      Comment.updateMany(
        { postId: idStr, isDeleted: false },
        { $set: { isDeleted: true } },
      ),
      // Hard-delete Notifications referencing this post (prevent zombie notifications)
      Notification.deleteMany({ postId: idStr }),
      // Hard-delete any Bookmarks on comments of this post is done per-comment.
      // Hard-delete Bookmarks that reference this post directly (postId field if present)
      Bookmark.deleteMany({ postId: idStr }),
    ]);
  } catch (err) {
    console.error("[Post] cascade cleanup failed for post", idStr, err);
  }
};

const postSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 2200,
      default: "",
    },
    mediaUrls: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    privacy: {
      type: String,
      enum: ["public", "followers"],
      default: "public",
      index: true,
    },
    likes: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    reactions: {
      type: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          type: {
            type: String,
            enum: ["like", "love", "haha", "wow", "sad", "angry"],
            default: "like",
          },
        },
      ],
      default: [],
    },
    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ privacy: 1, createdAt: -1 });
postSchema.index({ likesCount: -1, createdAt: -1 });
postSchema.index(
  { caption: "text", tags: "text" },
  {
    weights: {
      caption: 8,
      tags: 6,
    },
    name: "post_search_text_index",
  },
);

// ── Cascade on hard delete (findOneAndDelete path) ────────────────────────────
postSchema.post("findOneAndDelete", async (doc) => {
  if (doc?._id) await cascadeDeletePostRelated(doc._id);
});

// ── Cascade on soft delete (updateOne / updateMany path via socialController) ─
// The socialController uses updateOne with $set isDeleted:true. We detect it here.
postSchema.post("updateOne", async function () {
  const update = this.getUpdate?.();
  const isSettingDeleted = update?.$set?.isDeleted === true;
  if (!isSettingDeleted) return;

  const filter = this.getFilter?.();
  const postId = filter?._id;
  if (postId) await cascadeDeletePostRelated(postId);
});

const Post = mongoose.model("Post", postSchema);
export default Post;
