import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    hashedPassword: {
      type: String,
      required: false, // Cho phép null khi đăng nhập bằng Google
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    googleId: {
      type: String,
      sparse: true, // Chỉ có khi đăng nhập bằng Google
      unique: true,
    },
    drupalId: {
      type: Number,
      sparse: true, // Chỉ có khi sync từ Drupal
      unique: true,
    },
    avatarUrl: {
      type: String, // link CDN để hiển thị hình
    },
    avatarId: {
      type: String, // Cloudinary public_id để xoá hình
    },
    bio: {
      type: String,
      maxlength: 500, // tuỳ
    },
    phone: {
      type: String,
      sparse: true, // cho phép null, nhưng không được trùng
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for search workloads.
userSchema.index({ displayName: 1 });
userSchema.index(
  { displayName: "text", username: "text" },
  {
    weights: {
      displayName: 8,
      username: 6,
    },
    name: "user_search_text_index",
  },
);

const User = mongoose.model("User", userSchema);
export default User;
