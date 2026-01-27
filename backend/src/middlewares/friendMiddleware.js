import Conversation from "../models/Conversation.js";
import Friend from "../models/Friend.js";
import axios from "axios";

const pair = (a, b) => (a < b ? [a, b] : [b, a]);

// 🔥 HYBRID: Check friendship từ cả MongoDB (legacy) và Drupal
const checkFriendshipStatus = async (userA, userB) => {
  // 🔓 Development mode: Skip all friend checks
  if (process.env.NODE_ENV === "development") {
    console.log("🔓 Development mode: Skipping friend check");
    return true;
  }

  // 1. Kiểm tra MongoDB trước (cho user cũ)
  try {
    const friend = await Friend.findOne({ userA, userB });
    if (friend) {
      console.log("✅ Found friendship in MongoDB");
      return true;
    }
  } catch (error) {
    console.log("⚠️ MongoDB friend check failed:", error.message);
  }

  // 2. Kiểm tra Drupal (cho user mới)
  try {
    const drupalApiUrl =
      process.env.DRUPAL_API_URL || "http://localhost:8000/api";
    const response = await axios.get(`${drupalApiUrl}/friends/check`, {
      params: { userA, userB },
      timeout: 3000,
    });

    if (response.data?.isFriend) {
      console.log("✅ Found friendship in Drupal");
      return true;
    }
  } catch (error) {
    console.log("⚠️ Drupal friend check failed:", error.message);
  }

  return false;
};

export const checkFriendship = async (req, res, next) => {
  try {
    const me = req.user._id.toString();
    const recipientId = req.body?.recipientId ?? null;
    const memberIds = req.body?.memberIds ?? [];
    const type = req.body?.type;

    console.log("🔍 [checkFriendship] Request body:", {
      type,
      memberIds,
      recipientId,
      userId: me,
    });

    // Nếu là direct chat và chỉ có 1 member, kiểm tra friendship với member đó
    if (type === "direct" && memberIds.length === 1) {
      const [userA, userB] = pair(me, memberIds[0]);
      console.log("🔍 [checkFriendship] Checking direct chat friendship:", {
        userA,
        userB,
      });

      const isFriend = await checkFriendshipStatus(userA, userB);
      console.log(
        "🔍 [checkFriendship] Friend found:",
        isFriend ? "Yes" : "No",
      );

      if (!isFriend) {
        return res
          .status(403)
          .json({ message: "Bạn chưa kết bạn với người này" });
      }

      console.log("✅ [checkFriendship] Friendship verified, proceeding...");
      return next();
    }

    if (!recipientId && memberIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Cần cung cấp recipientId hoặc memberIds" });
    }

    if (recipientId) {
      const [userA, userB] = pair(me, recipientId);

      const isFriend = await checkFriendshipStatus(userA, userB);

      if (!isFriend) {
        return res
          .status(403)
          .json({ message: "Bạn chưa kết bạn với người này" });
      }

      return next();
    }

    const friendChecks = memberIds.map(async (memberId) => {
      const [userA, userB] = pair(me, memberId);
      const isFriend = await checkFriendshipStatus(userA, userB);
      return isFriend ? null : memberId;
    });

    const results = await Promise.all(friendChecks);
    const notFriends = results.filter(Boolean);

    if (notFriends.length > 0) {
      return res
        .status(403)
        .json({ message: "Bạn chỉ có thể thêm bạn bè vào nhóm.", notFriends });
    }

    next();
  } catch (error) {
    console.error("Lỗi xảy ra khi checkFriendship:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const checkGroupMembership = async (req, res, next) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy cuộc trò chuyện" });
    }

    const isMember = conversation.participants.some(
      (p) => p.userId.toString() === userId.toString(),
    );

    if (!isMember) {
      return res.status(403).json({ message: "Bạn không ở trong group này." });
    }

    req.conversation = conversation;

    next();
  } catch (error) {
    console.error("Lỗi checkGroupMembership:", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
