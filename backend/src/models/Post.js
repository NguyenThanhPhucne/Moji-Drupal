import mongoose from "mongoose";

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

const Post = mongoose.model("Post", postSchema);
export default Post;
