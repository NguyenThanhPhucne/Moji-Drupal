import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { broadcastOnlineUsers } from "../socket/index.js";

const isBcryptHash = (hash) => /^\$2[aby]\$\d{2}\$/.test(String(hash || ""));
const isSha256Hex = (hash) => /^[a-f0-9]{64}$/i.test(String(hash || ""));

const verifyPasswordWithFallback = async (plainPassword, storedHash) => {
  const hash = String(storedHash || "");
  if (!hash) {
    return false;
  }

  if (isBcryptHash(hash)) {
    return bcrypt.compare(plainPassword, hash);
  }

  if (isSha256Hex(hash)) {
    const digest = crypto
      .createHash("sha256")
      .update(plainPassword)
      .digest("hex");
    return digest.toLowerCase() === hash.toLowerCase();
  }

  return false;
};

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

    const result = await uploadImageFromBuffer(file.buffer);

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

export const changePassword = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Thiếu currentPassword hoặc newPassword" });
    }

    if (String(newPassword).length < 5) {
      return res
        .status(400)
        .json({ message: "Mật khẩu mới phải có ít nhất 5 ký tự" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (!user.hashedPassword) {
      return res.status(400).json({
        message:
          "Tài khoản này không dùng mật khẩu cục bộ. Hãy đăng nhập bằng phương thức liên kết.",
      });
    }

    const currentPasswordMatched = await verifyPasswordWithFallback(
      currentPassword,
      user.hashedPassword,
    );

    if (!currentPasswordMatched) {
      return res.status(401).json({ message: "Mật khẩu hiện tại không đúng" });
    }

    if (String(currentPassword) === String(newPassword)) {
      return res.status(400).json({
        message: "Mật khẩu mới phải khác mật khẩu hiện tại",
      });
    }

    user.hashedPassword = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    return res.status(200).json({ message: "Đổi mật khẩu thành công" });
  } catch (error) {
    console.error("Lỗi khi đổi mật khẩu", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateOnlineStatusVisibility = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { showOnlineStatus } = req.body || {};

    if (typeof showOnlineStatus !== "boolean") {
      return res
        .status(400)
        .json({ message: "showOnlineStatus phải là kiểu boolean" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { showOnlineStatus },
      { new: true },
    ).select("-hashedPassword");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    await broadcastOnlineUsers();

    return res.status(200).json({
      message: "Cập nhật trạng thái hoạt động thành công",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật showOnlineStatus", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
