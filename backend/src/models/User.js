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
    showOnlineStatus: {
      type: Boolean,
      default: true,
    },
    notificationPreferences: {
      message: {
        type: Boolean,
        default: true,
      },
      sound: {
        type: Boolean,
        default: true,
      },
      desktop: {
        type: Boolean,
        default: false,
      },
      social: {
        muted: {
          type: Boolean,
          default: false,
        },
        follow: {
          type: Boolean,
          default: true,
        },
        like: {
          type: Boolean,
          default: true,
        },
        comment: {
          type: Boolean,
          default: true,
        },
        mention: {
          type: Boolean,
          default: true,
        },
        friendAccepted: {
          type: Boolean,
          default: true,
        },
        system: {
          type: Boolean,
          default: true,
        },
        mutedUserIds: {
          type: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
          ],
          default: [],
        },
        mutedConversationIds: {
          type: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Conversation",
            },
          ],
          default: [],
        },
        digestEnabled: {
          type: Boolean,
          default: false,
        },
        digestWindowHours: {
          type: Number,
          default: 6,
          min: 1,
          max: 24,
        },
      },
    },
    personalizationPreferences: {
      locale: {
        type: String,
        enum: ["en", "vi"],
        default: "en",
      },
      startPagePreference: {
        type: String,
        enum: ["chat", "feed", "explore", "saved"],
        default: "chat",
      },
      timestampStylePreference: {
        type: String,
        enum: ["relative", "absolute"],
        default: "relative",
      },
      notificationGroupingPreference: {
        type: String,
        enum: ["auto", "priority", "time"],
        default: "auto",
      },
      notificationDensityPreference: {
        type: String,
        enum: ["comfortable", "compact"],
        default: "comfortable",
      },
    },
    lastActiveAt: {
      type: Date,
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
