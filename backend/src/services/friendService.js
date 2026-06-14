import mongoose from "mongoose";
import Friend from "../models/Friend.js";
import FriendRequest from "../models/FriendRequest.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { createHttpError } from "../utils/httpErrors.js";
import { runWithMongoSession } from "../utils/mongoTransaction.js";

const FRIEND_REQUEST_POPULATE_FIELDS =
  "username displayName avatarUrl _id";

const ensureObjectId = (value, message, status = 400) => {
  if (!value || !mongoose.isValidObjectId(value)) {
    throw createHttpError(status, message);
  }

  return String(value);
};

const normalizeFriendPair = (left, right) => {
  let userA = String(left || "");
  let userB = String(right || "");

  if (userA > userB) {
    [userA, userB] = [userB, userA];
  }

  return { userA, userB };
};

const withSession = (query, session) =>
  session ? query.session(session) : query;

const createWithSession = async (Model, doc, session) => {
  if (session) {
    const [created] = await Model.create([doc], { session });
    return created;
  }

  return Model.create(doc);
};

const shouldSendFriendAcceptedNotification = (
  rawSocialPreferences,
  actorId,
) => {
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

export const createFriendRequest = async ({ fromId, toId, message }) => {
  const from = ensureObjectId(fromId, "Phiên đăng nhập không hợp lệ", 401);
  const to = ensureObjectId(toId, "Người nhận không hợp lệ");

  if (from === to) {
    throw createHttpError(400, "Không thể gửi lời mời kết bạn cho chính mình");
  }

  const userExists = await User.exists({ _id: to });
  if (!userExists) {
    throw createHttpError(404, "Người dùng không tồn tại");
  }

  const { userA, userB } = normalizeFriendPair(from, to);

  const [alreadyFriends, existingRequest] = await Promise.all([
    Friend.findOne({ userA, userB }).lean(),
    FriendRequest.findOne({
      $or: [
        { from, to },
        { from: to, to: from },
      ],
    }).lean(),
  ]);

  if (alreadyFriends) {
    throw createHttpError(400, "Hai người đã là bạn bè");
  }

  if (existingRequest) {
    throw createHttpError(400, "Đã có lời mời kết bạn đang chờ");
  }

  const request = await FriendRequest.create({
    from,
    to,
    message,
  });

  const populatedRequest = await FriendRequest.findById(request._id)
    .populate("from", FRIEND_REQUEST_POPULATE_FIELDS)
    .lean();

  return { request, populatedRequest };
};

export const acceptFriendRequest = async ({ requestId, userId }) => {
  const resolvedRequestId = ensureObjectId(
    requestId,
    "ID lời mời không hợp lệ",
  );
  const resolvedUserId = ensureObjectId(
    userId,
    "Phiên đăng nhập không hợp lệ",
    401,
  );

  return runWithMongoSession(
    async (session) => {
      const request = await withSession(
        FriendRequest.findById(resolvedRequestId),
        session,
      );

      if (!request) {
        throw createHttpError(404, "Không tìm thấy lời mời kết bạn");
      }

      if (String(request.to) !== resolvedUserId) {
        throw createHttpError(403, "Bạn không có quyền chấp nhận lời mời này");
      }

      const { userA, userB } = normalizeFriendPair(
        request.from,
        request.to,
      );

      const existingFriend = await withSession(
        Friend.findOne({ userA, userB }).lean(),
        session,
      );

      if (!existingFriend) {
        await createWithSession(
          Friend,
          {
            userA,
            userB,
          },
          session,
        );
      }

      await withSession(
        FriendRequest.deleteOne({ _id: request._id }),
        session,
      );

      const [fromUser, receiverUser, recipientPreferences] =
        await Promise.all([
          withSession(
            User.findById(request.from)
              .select("_id displayName avatarUrl")
              .lean(),
            session,
          ),
          withSession(
            User.findById(request.to)
              .select("_id displayName avatarUrl")
              .lean(),
            session,
          ),
          withSession(
            User.findById(request.from)
              .select("notificationPreferences.social")
              .lean(),
            session,
          ),
        ]);

      const message = `${receiverUser?.displayName} đã chấp nhận lời mời kết bạn của bạn`;
      const canNotify = shouldSendFriendAcceptedNotification(
        recipientPreferences?.notificationPreferences?.social,
        request.to,
      );

      let populatedNotification = null;

      if (canNotify) {
        const notification = await createWithSession(
          Notification,
          {
            recipientId: request.from,
            actorId: request.to,
            type: "friend_accepted",
            message,
          },
          session,
        );

        populatedNotification = await withSession(
          Notification.findById(notification._id)
            .populate("actorId", "_id displayName username avatarUrl")
            .lean(),
          session,
        );
      }

      return {
        requestFromId: request.from,
        requestToId: request.to,
        fromUser,
        receiverUser,
        notification: populatedNotification,
      };
    },
    { label: "accept-friend-request" },
  );
};

export const declineFriendRequest = async ({ requestId, userId }) => {
  const resolvedRequestId = ensureObjectId(
    requestId,
    "ID lời mời không hợp lệ",
  );
  const resolvedUserId = ensureObjectId(
    userId,
    "Phiên đăng nhập không hợp lệ",
    401,
  );

  return runWithMongoSession(
    async (session) => {
      const request = await withSession(
        FriendRequest.findById(resolvedRequestId),
        session,
      );

      if (!request) {
        throw createHttpError(404, "Không tìm thấy lời mời kết bạn");
      }

      if (String(request.to) !== resolvedUserId) {
        throw createHttpError(403, "Bạn không có quyền từ chối lời mời này");
      }

      await withSession(
        FriendRequest.deleteOne({ _id: request._id }),
        session,
      );

      await withSession(
        Notification.deleteMany({
          type: { $in: ["friend_accepted"] },
          $or: [
            { recipientId: resolvedUserId, actorId: request.from },
            { recipientId: request.from, actorId: resolvedUserId },
          ],
        }),
        session,
      );
    },
    { label: "decline-friend-request" },
  );
};

export const listFriends = async ({ userId }) => {
  const resolvedUserId = ensureObjectId(
    userId,
    "Phiên đăng nhập không hợp lệ",
    401,
  );

  const friendships = await Friend.find({
    $or: [
      { userA: resolvedUserId },
      { userB: resolvedUserId },
    ],
  })
    .populate("userA", "_id displayName avatarUrl username")
    .populate("userB", "_id displayName avatarUrl username")
    .lean();

  if (!friendships.length) {
    return { friends: [] };
  }

  const friends = friendships.map((friendship) =>
    friendship.userA._id.toString() === resolvedUserId.toString()
      ? friendship.userB
      : friendship.userA,
  );

  return { friends };
};

export const listFriendRequests = async ({ userId }) => {
  const resolvedUserId = ensureObjectId(
    userId,
    "Phiên đăng nhập không hợp lệ",
    401,
  );

  const [sent, received] = await Promise.all([
    FriendRequest.find({ from: resolvedUserId }).populate(
      "to",
      FRIEND_REQUEST_POPULATE_FIELDS,
    ),
    FriendRequest.find({ to: resolvedUserId }).populate(
      "from",
      FRIEND_REQUEST_POPULATE_FIELDS,
    ),
  ]);

  return { sent, received };
};

export const removeFriendship = async ({ userId, friendId }) => {
  const resolvedUserId = ensureObjectId(
    userId,
    "Phiên đăng nhập không hợp lệ",
    401,
  );
  const resolvedFriendId = ensureObjectId(
    friendId,
    "Thiếu thông tin bạn bè hoặc ID không hợp lệ",
  );

  if (resolvedUserId === resolvedFriendId) {
    throw createHttpError(400, "Không thể xoá chính mình");
  }

  const { userA, userB } = normalizeFriendPair(
    resolvedUserId,
    resolvedFriendId,
  );

  return runWithMongoSession(
    async (session) => {
      const deleted = await withSession(
        Friend.findOneAndDelete({ userA, userB }),
        session,
      );

      if (!deleted) {
        return { removed: false };
      }

      await withSession(
        Notification.deleteMany({
          type: { $in: ["friend_accepted"] },
          $or: [
            { recipientId: resolvedUserId, actorId: resolvedFriendId },
            { recipientId: resolvedFriendId, actorId: resolvedUserId },
          ],
        }),
        session,
      );

      return { removed: true };
    },
    { label: "remove-friend" },
  );
};
