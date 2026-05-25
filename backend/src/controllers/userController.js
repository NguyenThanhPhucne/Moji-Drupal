import { uploadImageFromBuffer } from "../middlewares/uploadMiddleware.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { broadcastOnlineUsers } from "../socket/index.js";
import { destroyImageFromUrl } from "../utils/cloudinaryHelper.js";
import { invalidateCache } from "../libs/redis.js";

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

const SOCIAL_BOOLEAN_KEYS = new Set([
  "muted",
  "follow",
  "like",
  "comment",
  "mention",
  "friendAccepted",
  "system",
  "digestEnabled",
]);

const SOCIAL_ARRAY_KEYS = new Set(["mutedUserIds", "mutedConversationIds"]);
const SOCIAL_NUMBER_KEYS = new Set(["digestWindowHours"]);

const PRIVATE_PIN_MIN_LENGTH = 4;
const PRIVATE_PIN_MAX_LENGTH = 8;
const PRIVATE_PIN_REGEX = /^\d+$/;

const PERSONALIZATION_LOCALE_VALUES = new Set(["en", "vi"]);
const PERSONALIZATION_START_PAGE_VALUES = new Set([
  "chat",
  "feed",
  "explore",
  "saved",
]);
const PERSONALIZATION_TIMESTAMP_VALUES = new Set(["relative", "absolute"]);
const PERSONALIZATION_GROUPING_VALUES = new Set(["auto", "priority", "time"]);
const PERSONALIZATION_DENSITY_VALUES = new Set(["comfortable", "compact"]);

const parseSocialPreferenceEntry = (key, value) => {
  if (SOCIAL_BOOLEAN_KEYS.has(key)) {
    if (typeof value !== "boolean") {
      return {
        error: `social.${key} phải là kiểu boolean`,
      };
    }

    return {
      path: `notificationPreferences.social.${key}`,
      value,
    };
  }

  if (SOCIAL_ARRAY_KEYS.has(key)) {
    if (!Array.isArray(value)) {
      return {
        error: `social.${key} phải là array`,
      };
    }

    const normalizedIds = [
      ...new Set(
        value
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    ];

    const invalidId = normalizedIds.find(
      (id) => !mongoose.Types.ObjectId.isValid(id),
    );

    if (invalidId) {
      return {
        error: `social.${key} chứa id không hợp lệ`,
      };
    }

    return {
      path: `notificationPreferences.social.${key}`,
      value: normalizedIds,
    };
  }

  if (SOCIAL_NUMBER_KEYS.has(key)) {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 24) {
      return {
        error: `social.${key} phải là số nguyên từ 1 đến 24`,
      };
    }

    return {
      path: `notificationPreferences.social.${key}`,
      value: numericValue,
    };
  }

  return {
    error: `social.${key} không được hỗ trợ`,
  };
};

const buildSocialPreferenceUpdates = (social) => {
  if (!social || typeof social !== "object" || Array.isArray(social)) {
    return {
      error: "social phải là object",
    };
  }

  const updates = {};

  for (const key of Object.keys(social)) {
    const parsed = parseSocialPreferenceEntry(key, social[key]);
    if (parsed.error) {
      return {
        error: parsed.error,
      };
    }

    updates[parsed.path] = parsed.value;
  }

  return { updates };
};

const parsePersonalizationPreferenceEntry = (key, value) => {
  if (key === "locale") {
    const normalizedValue = String(value || "").trim();
    if (!PERSONALIZATION_LOCALE_VALUES.has(normalizedValue)) {
      return {
        error: "personalizationPreferences.locale không hợp lệ",
      };
    }

    return {
      path: "personalizationPreferences.locale",
      value: normalizedValue,
    };
  }

  if (key === "startPagePreference") {
    const normalizedValue = String(value || "").trim();
    if (!PERSONALIZATION_START_PAGE_VALUES.has(normalizedValue)) {
      return {
        error: "personalizationPreferences.startPagePreference không hợp lệ",
      };
    }

    return {
      path: "personalizationPreferences.startPagePreference",
      value: normalizedValue,
    };
  }

  if (key === "timestampStylePreference") {
    const normalizedValue = String(value || "").trim();
    if (!PERSONALIZATION_TIMESTAMP_VALUES.has(normalizedValue)) {
      return {
        error: "personalizationPreferences.timestampStylePreference không hợp lệ",
      };
    }

    return {
      path: "personalizationPreferences.timestampStylePreference",
      value: normalizedValue,
    };
  }

  if (key === "notificationGroupingPreference") {
    const normalizedValue = String(value || "").trim();
    if (!PERSONALIZATION_GROUPING_VALUES.has(normalizedValue)) {
      return {
        error: "personalizationPreferences.notificationGroupingPreference không hợp lệ",
      };
    }

    return {
      path: "personalizationPreferences.notificationGroupingPreference",
      value: normalizedValue,
    };
  }

  if (key === "notificationDensityPreference") {
    const normalizedValue = String(value || "").trim();
    if (!PERSONALIZATION_DENSITY_VALUES.has(normalizedValue)) {
      return {
        error: "personalizationPreferences.notificationDensityPreference không hợp lệ",
      };
    }

    return {
      path: "personalizationPreferences.notificationDensityPreference",
      value: normalizedValue,
    };
  }

  return {
    error: `personalizationPreferences.${key} không được hỗ trợ`,
  };
};

const buildPersonalizationPreferenceUpdates = (preferences) => {
  if (
    !preferences ||
    typeof preferences !== "object" ||
    Array.isArray(preferences)
  ) {
    return {
      error: "personalizationPreferences phải là object",
    };
  }

  const updates = {};

  for (const key of Object.keys(preferences)) {
    const parsed = parsePersonalizationPreferenceEntry(key, preferences[key]);
    if (parsed.error) {
      return {
        error: parsed.error,
      };
    }

    updates[parsed.path] = parsed.value;
  }

  return { updates };
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

const escapeRegex = (value) => {
  const rawValue = String(value || "");
  const escapeTargets = new Set([
    "^",
    "$",
    ".",
    "*",
    "+",
    "?",
    "(",
    ")",
    "[",
    "]",
    "{",
    "}",
    "|",
    String.fromCodePoint(92),
  ]);
  let escaped = "";

  for (const char of rawValue) {
    if (escapeTargets.has(char)) {
      escaped += `\\${char}`;
    } else {
      escaped += char;
    }
  }

  return escaped;
};

export const searchUserByUsername = async (req, res) => {
  try {
    const { username } = req.query;
    const normalizedUsername = String(username || "").trim();

    if (!normalizedUsername) {
      return res
        .status(400)
        .json({ message: "Cần cung cấp username trong query." });
    }

    const escapedUsername = escapeRegex(normalizedUsername);
    const usernamePattern = new RegExp(`^${escapedUsername}$`, "i");

    const user = await User.findOne({ username: usernamePattern }).select(
      "_id displayName username avatarUrl",
    );

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng." });
    }

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

    // Xóa avatar cũ trên Cloudinary để tránh rác
    const currentUser = await User.findById(userId).select("avatarUrl avatarId");
    if (currentUser?.avatarId) {
      // Logic cũ có lưu avatarId
      await cloudinary.uploader.destroy(currentUser.avatarId);
    } else if (currentUser?.avatarUrl) {
      // Xoá qua URL parser
      await destroyImageFromUrl(currentUser.avatarUrl);
    }

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

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (!updatedUser.avatarUrl) {
      return res.status(400).json({ message: "Avatar trả về null" });
    }

    await invalidateCache(`auth_profile:${userId}`);

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
      .select("_id displayName username avatarUrl bio lastActiveAt updatedAt role isBanned isVerified")
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
        role: user.role || "member",
        isBanned: Boolean(user.isBanned),
        isVerified: Boolean(user.isVerified),
        lastActiveAt: user.lastActiveAt || latestMessage?.createdAt || user.updatedAt || null,
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
    await invalidateCache(`auth_profile:${userId}`);

    return res.status(200).json({
      message: "Cập nhật trạng thái hoạt động thành công",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật showOnlineStatus", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { message, sound, desktop, social } = req.body || {};

    const updates = {};

    if (message !== undefined) {
      if (typeof message !== "boolean") {
        return res
          .status(400)
          .json({ message: "message phải là kiểu boolean" });
      }
      updates["notificationPreferences.message"] = message;
    }

    if (sound !== undefined) {
      if (typeof sound !== "boolean") {
        return res.status(400).json({ message: "sound phải là kiểu boolean" });
      }
      updates["notificationPreferences.sound"] = sound;
    }

    if (desktop !== undefined) {
      if (typeof desktop !== "boolean") {
        return res
          .status(400)
          .json({ message: "desktop phải là kiểu boolean" });
      }
      updates["notificationPreferences.desktop"] = desktop;
    }

    if (social !== undefined) {
      const socialUpdateResult = buildSocialPreferenceUpdates(social);
      if (socialUpdateResult.error) {
        return res.status(400).json({ message: socialUpdateResult.error });
      }

      Object.assign(updates, socialUpdateResult.updates || {});
    }

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ message: "Không có thay đổi notificationPreferences" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true },
    ).select("-hashedPassword");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    await invalidateCache(`auth_profile:${userId}`);

    return res.status(200).json({
      message: "Cập nhật thông báo thành công",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật notificationPreferences", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updatePersonalizationPreferences = async (req, res) => {
  try {
    const userId = req.user?._id;
    const usesInlinePayload =
      req.body?.personalizationPreferences === undefined;
    const payload = usesInlinePayload
      ? req.body
      : req.body.personalizationPreferences;

    const personalizationUpdateResult =
      buildPersonalizationPreferenceUpdates(payload);

    if (personalizationUpdateResult.error) {
      return res.status(400).json({
        message: personalizationUpdateResult.error,
      });
    }

    const updates = personalizationUpdateResult.updates || {};

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "Không có thay đổi personalizationPreferences",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true },
    ).select("-hashedPassword");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    await invalidateCache(`auth_profile:${userId}`);

    return res.status(200).json({
      message: "Cập nhật personalization thành công",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật personalizationPreferences", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { displayName, bio, phone, personalizationPreferences } = req.body || {};

    const allowedUpdates = {};

    if (displayName !== undefined) {
      const trimmed = String(displayName).trim();
      if (!trimmed || trimmed.length > 60) {
        return res.status(400).json({ message: "Display name phải từ 1–60 ký tự" });
      }
      allowedUpdates.displayName = trimmed;
    }

    if (bio !== undefined) {
      allowedUpdates.bio = String(bio).trim().slice(0, 240);
    }

    if (phone !== undefined) {
      allowedUpdates.phone = String(phone).trim().slice(0, 20);
    }

    if (personalizationPreferences !== undefined) {
      const personalizationUpdateResult =
        buildPersonalizationPreferenceUpdates(personalizationPreferences);

      if (personalizationUpdateResult.error) {
        return res.status(400).json({
          message: personalizationUpdateResult.error,
        });
      }

      Object.assign(allowedUpdates, personalizationUpdateResult.updates || {});
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({ message: "Không có trường nào cần cập nhật" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: allowedUpdates },
      { new: true },
    ).select("-hashedPassword");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    await invalidateCache(`auth_profile:${userId}`);

    return res.status(200).json({
      message: "Cập nhật profile thành công",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Lỗi khi updateProfile", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const uploadCoverPhoto = async (req, res) => {
  try {
    const userId = req.user?._id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await cloudinary.uploader.upload(
      `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
      {
        folder: "moji/covers",
        resource_type: "image",
        transformation: [{ width: 1200, height: 400, crop: "fill", gravity: "auto" }],
      },
    );

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { coverPhotoUrl: result.secure_url, coverPhotoId: result.public_id },
      { new: true },
    ).select("coverPhotoUrl");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    await invalidateCache(`auth_profile:${userId}`);

    return res.status(200).json({ coverPhotoUrl: updatedUser.coverPhotoUrl });
  } catch (error) {
    console.error("Lỗi khi uploadCoverPhoto", error);
    return res.status(500).json({ message: "Upload failed" });
  }
};

export const removeCoverPhoto = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("coverPhotoId");

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (user?.coverPhotoId) {
      await cloudinary.uploader.destroy(user.coverPhotoId);
    }

    const updatedUser = await User.findByIdAndUpdate(userId, {
      $unset: { coverPhotoUrl: "", coverPhotoId: "" },
    });

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    await invalidateCache(`auth_profile:${userId}`);

    return res.status(200).json({ message: "Cover photo removed" });
  } catch (error) {
    console.error("Lỗi khi removeCoverPhoto", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const setPrivatePin = async (req, res) => {
  try {
    const userId = req.user?._id;
    const rawPin = String(req.body?.pin || "").trim();
    const rawCurrentPin = String(req.body?.currentPin || "").trim();

    if (!rawPin) {
      return res.status(400).json({ message: "PIN không được để trống" });
    }

    if (
      !PRIVATE_PIN_REGEX.test(rawPin) ||
      rawPin.length < PRIVATE_PIN_MIN_LENGTH ||
      rawPin.length > PRIVATE_PIN_MAX_LENGTH
    ) {
      return res.status(400).json({
        message: `PIN phải là số ${PRIVATE_PIN_MIN_LENGTH}-${PRIVATE_PIN_MAX_LENGTH} chữ số`,
      });
    }

    const user = await User.findById(userId).select("privatePinHash");
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (user.privatePinHash) {
      if (!rawCurrentPin) {
        return res.status(400).json({ message: "Cần nhập PIN hiện tại" });
      }

      const isCurrentValid = await bcrypt.compare(rawCurrentPin, user.privatePinHash);
      if (!isCurrentValid) {
        return res.status(403).json({ message: "PIN hiện tại không đúng" });
      }
    }

    const hashedPin = await bcrypt.hash(rawPin, 10);
    user.privatePinHash = hashedPin;
    user.privatePinUpdatedAt = new Date();
    await user.save();

    await invalidateCache(`auth_profile:${userId}`);

    return res.status(200).json({ message: "Private PIN đã được cập nhật" });
  } catch (error) {
    console.error("Lỗi khi setPrivatePin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const verifyPrivatePin = async (req, res) => {
  try {
    const userId = req.user?._id;
    const rawPin = String(req.body?.pin || "").trim();

    if (!rawPin) {
      return res.status(400).json({ message: "PIN không được để trống" });
    }

    const user = await User.findById(userId).select("privatePinHash");
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (!user.privatePinHash) {
      return res.status(400).json({ message: "Private PIN chưa được thiết lập" });
    }

    const isValid = await bcrypt.compare(rawPin, user.privatePinHash);
    if (!isValid) {
      return res.status(403).json({ message: "PIN không đúng" });
    }

    return res.status(200).json({ allowed: true });
  } catch (error) {
    console.error("Lỗi khi verifyPrivatePin", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// --- ADMIN CONTROLLERS ---

export const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!["admin", "moderator", "member", "guest"].includes(role)) {
      return res.status(400).json({ message: "Role không hợp lệ" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select("-hashedPassword");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    await invalidateCache(`auth_profile:${id}`);
    return res.status(200).json({ message: "Cập nhật quyền thành công", user: updatedUser });
  } catch (error) {
    console.error("Lỗi khi updateUserRole:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const toggleUserBan = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBanned } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { isBanned: Boolean(isBanned) },
      { new: true }
    ).select("-hashedPassword");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    await invalidateCache(`auth_profile:${id}`);
    return res.status(200).json({ message: `Đã ${isBanned ? 'khóa' : 'mở khóa'} tài khoản`, user: updatedUser });
  } catch (error) {
    console.error("Lỗi khi toggleUserBan:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const toggleUserVerify = async (req, res) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { isVerified: Boolean(isVerified) },
      { new: true }
    ).select("-hashedPassword");

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    await invalidateCache(`auth_profile:${id}`);
    return res.status(200).json({ message: `Đã ${isVerified ? 'cấp' : 'thu hồi'} tích xanh`, user: updatedUser });
  } catch (error) {
    console.error("Lỗi khi toggleUserVerify:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// ─── Custom Status ───────────────────────────────────────────────────────────
export const updateCustomStatus = async (req, res) => {
  try {
    const { statusEmoji, statusText, statusClearAt } = req.body;
    const userId = req.user._id;

    const update = {
      statusEmoji: statusEmoji ?? "",
      statusText: statusText ?? "",
      statusClearAt: statusClearAt ? new Date(statusClearAt) : null,
    };

    const updatedUser = await User.findByIdAndUpdate(userId, update, { new: true }).select("-hashedPassword");

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    await invalidateCache(`auth_profile:${userId}`);
    return res.status(200).json({ message: "Status updated", user: updatedUser });
  } catch (error) {
    console.error("updateCustomStatus error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ─── Delete Account ──────────────────────────────────────────────────────────
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    await User.findByIdAndDelete(userId);
    await invalidateCache(`auth_profile:${userId}`);
    // Clear auth cookie
    res.clearCookie("refreshToken", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("deleteAccount error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// ─── Sessions ────────────────────────────────────────────────────────────────
export const getUserSessions = async (req, res) => {
  try {
    const userId = req.user._id;
    const sessions = await Session.find({ userId })
      .sort({ lastUsedAt: -1 })
      .select("_id lastUsedAt createdAt expiresAt userAgentHash ipAddress deviceLabel")
      .lean();

    // Get current session token from cookie to mark it
    const currentToken = req.cookies?.refreshToken;

    const mapped = sessions.map((s) => ({
      id: String(s._id),
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      deviceLabel: s.deviceLabel || "Unknown device",
      ipAddress: s.ipAddress || null,
      isCurrent: currentToken
        ? s.userAgentHash === crypto.createHash("sha256").update(currentToken).digest("hex").slice(0, 12)
        : false,
    }));

    return res.status(200).json({ sessions: mapped });
  } catch (error) {
    console.error("getUserSessions error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const revokeSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;
    const session = await Session.findOneAndDelete({ _id: sessionId, userId });
    if (!session) return res.status(404).json({ message: "Session not found" });
    return res.status(200).json({ message: "Session revoked" });
  } catch (error) {
    console.error("revokeSession error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const revokeAllOtherSessions = async (req, res) => {
  try {
    const userId = req.user._id;
    const currentToken = req.cookies?.refreshToken;

    // Delete all sessions for user except those matching the current refresh token
    const currentSession = currentToken
      ? await Session.findOne({ userId, refreshToken: currentToken })
      : null;

    const query = currentSession
      ? { userId, _id: { $ne: currentSession._id } }
      : { userId };

    const result = await Session.deleteMany(query);
    return res.status(200).json({
      message: "All other sessions revoked",
      count: result.deletedCount,
    });
  } catch (error) {
    console.error("revokeAllOtherSessions error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

