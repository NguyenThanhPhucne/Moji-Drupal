import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

export const authMe = async (req, res) => {
  try {
    const user = req.user; // lấy từ authMiddleware

    return res.status(200).json({
      user,
    });
  } catch (error) {
    console.error("Lỗi khi gọi authMe", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const searchUserByUsername = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username || username.trim() === "") {
      return res
        .status(400)
        .json({ message: "Cần cung cấp username trong query." });
    }

    const user = await User.findOne({ username }).select(
      "_id displayName username avatarUrl",
    );

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Lỗi xảy ra khi searchUserByUsername", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user._id;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    console.log("Uploading file to Cloudinary:", {
      fieldname: file.fieldname,
      mimetype: file.mimetype,
      size: file.size,
      userId,
    });

    const result = await uploadImageFromBuffer(file.buffer);

    console.log("Cloudinary upload successful:", {
      secure_url: result.secure_url,
      public_id: result.public_id,
    });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        avatarUrl: result.secure_url,
        avatarId: result.public_id,
      },
      {
        new: true,
      },
    ).select("avatarUrl");

    if (!updatedUser.avatarUrl) {
      return res.status(400).json({ message: "Avatar trả về null" });
    }

    return res.status(200).json({ avatarUrl: updatedUser.avatarUrl });
  } catch (error) {
    console.error("Lỗi xảy ra khi upload avatar:", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      message: "Upload failed",
      error: error.message,
    });
  }
};

export const getUserProfileLite = async (req, res) => {
  try {
    const viewerId = req.user._id;
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select("_id displayName username avatarUrl bio updatedAt")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const [mutualGroups, latestMessage] = await Promise.all([
      Conversation.find({
        type: "group",
        "participants.userId": { $all: [viewerId, userId] },
      })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select("_id group.name")
        .lean(),
      Message.findOne({ senderId: userId }).sort({ createdAt: -1 }).lean(),
    ]);

    return res.status(200).json({
      profile: {
        _id: String(user._id),
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        bio: user.bio || "",
        lastActiveAt: latestMessage?.createdAt || user.updatedAt || null,
        mutualGroupsCount: mutualGroups.length,
        mutualGroups: mutualGroups.map((groupItem) => ({
          _id: String(groupItem._id),
          name: groupItem.group?.name || "Untitled group",
        })),
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy profile-lite", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
