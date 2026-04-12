import Friend from "../models/Friend.js";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import Notification from "../models/Notification.js";
import { io } from "../socket/index.js";

const shouldSendFriendAcceptedNotification = (rawSocialPreferences, actorId) => {
  const preferences = rawSocialPreferences || {};

  if (preferences.muted === true) {
    return false;
  }

  if (preferences.friendAccepted === false) {
    return false;
  }

  const mutedUserIds = Array.isArray(preferences.mutedUserIds)
    ? preferences.mutedUserIds.map(String)
    : [];

  return !mutedUserIds.includes(String(actorId));
};

export const sendFriendRequest = async (req, res) => {
  try {
    const { to, message } = req.body;

    const from = req.user._id;

    if (from === to) {
      return res
        .status(400)
        .json({ message: "Không thể gửi lời mời kết bạn cho chính mình" });
    }

    const userExists = await User.exists({ _id: to });

    if (!userExists) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    let userA = from.toString();
    let userB = to.toString();

    if (userA > userB) {
      [userA, userB] = [userB, userA];
    }

    const [alreadyFriends, existingRequest] = await Promise.all([
      Friend.findOne({ userA, userB }),
      FriendRequest.findOne({
        $or: [
          { from, to },
          { from: to, to: from },
        ],
      }),
    ]);

    if (alreadyFriends) {
      return res.status(400).json({ message: "Hai người đã là bạn bè" });
    }

    if (existingRequest) {
      return res
        .status(400)
        .json({ message: "Đã có lời mời kết bạn đang chờ" });
    }

    const request = await FriendRequest.create({
      from,
      to,
      message,
    });

    // Populate thông tin người gửi để gửi qua socket
    const populatedRequest = await FriendRequest.findById(request._id).populate(
      "from",
      "username displayName avatarUrl _id",
    );

    // Emit socket event tới người nhận
    io.to(to.toString()).emit("friend-request-received", {
      request: populatedRequest,
      message: `${populatedRequest.from.displayName} đã gửi lời mời kết bạn`,
    });

    return res
      .status(201)
      .json({ message: "Gửi lời mời kết bạn thành công", request });
  } catch (error) {
    console.error("Lỗi khi gửi yêu cầu kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy lời mời kết bạn" });
    }

    if (request.to.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền chấp nhận lời mời này" });
    }

    await Friend.create({
      userA: request.from,
      userB: request.to,
    });

    await FriendRequest.findByIdAndDelete(requestId);

    const from = await User.findById(request.from)
      .select("_id displayName avatarUrl")
      .lean();

    const receiver = await User.findById(request.to)
      .select("_id displayName avatarUrl")
      .lean();

    const notificationRecipient = await User.findById(request.from)
      .select("notificationPreferences.social")
      .lean();

    const message = `${receiver?.displayName} đã chấp nhận lời mời kết bạn của bạn`;

    const canNotify = shouldSendFriendAcceptedNotification(
      notificationRecipient?.notificationPreferences?.social,
      request.to,
    );

    let populatedNotification = null;

    if (canNotify) {
      const notification = await Notification.create({
        recipientId: request.from,
        actorId: request.to,
        type: "friend_accepted",
        message,
      });

      populatedNotification = await Notification.findById(notification._id)
        .populate("actorId", "_id displayName username avatarUrl")
        .lean();
    }

    // Emit realtime event to the original requester
    io.to(request.from.toString()).emit("friend-request-accepted", {
      from: receiver,
      message,
      notification: populatedNotification,
    });

    return res.status(200).json({
      message: "Chấp nhận lời mời kết bạn thành công",
      newFriend: {
        _id: from?._id,
        displayName: from?.displayName,
        avatarUrl: from?.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Ài khi chấp nhận lời mời kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const declineFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy lời mời kết bạn" });
    }

    if (request.to.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền từ chối lời mời này" });
    }

    await FriendRequest.findByIdAndDelete(requestId);

    // Clean up any stale friend-request or friend-accepted notifications
    // between these two users so they don't linger as zombie entries.
    await Notification.deleteMany({
      type: { $in: ["friend_accepted"] },
      $or: [
        { recipientId: userId, actorId: request.from },
        { recipientId: request.from, actorId: userId },
      ],
    });

    return res.sendStatus(204);
  } catch (error) {
    console.error("Lỗi khi từ chối lời mời kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getAllFriends = async (req, res) => {
  try {
    const userId = req.user._id;

    const friendships = await Friend.find({
      $or: [
        {
          userA: userId,
        },
        {
          userB: userId,
        },
      ],
    })
      .populate("userA", "_id displayName avatarUrl username")
      .populate("userB", "_id displayName avatarUrl username")
      .lean();

    if (!friendships.length) {
      return res.status(200).json({ friends: [] });
    }

    const friends = friendships.map((f) =>
      f.userA._id.toString() === userId.toString() ? f.userB : f.userA,
    );

    return res.status(200).json({ friends });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách bạn bè", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getFriendRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const populateFields = "_id username displayName avatarUrl";

    const [sent, received] = await Promise.all([
      FriendRequest.find({ from: userId }).populate("to", populateFields),
      FriendRequest.find({ to: userId }).populate("from", populateFields),
    ]);

    res.status(200).json({ sent, received });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách yêu cầu kết bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const removeFriend = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const friendId = String(req.params.friendId || "").trim();

    if (!friendId) {
      return res.status(400).json({ message: "Thiếu thông tin bạn bè" });
    }

    if (userId === friendId) {
      return res.status(400).json({ message: "Không thể xoá chính mình" });
    }

    let userA = userId;
    let userB = friendId;

    if (userA > userB) {
      [userA, userB] = [userB, userA];
    }

    const deleted = await Friend.findOneAndDelete({ userA, userB });

    if (!deleted) {
      return res.status(200).json({
        message: "Người này không còn trong danh sách bạn bè",
      });
    }

    // Purge all friend-related notifications between these two users so
    // they don't leave behind zombie notification entries.
    await Notification.deleteMany({
      type: { $in: ["friend_accepted"] },
      $or: [
        { recipientId: userId, actorId: friendId },
        { recipientId: friendId, actorId: userId },
      ],
    });

    return res.status(200).json({ message: "Đã xoá bạn thành công" });
  } catch (error) {
    console.error("Lỗi khi xoá bạn", error);
    return res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
