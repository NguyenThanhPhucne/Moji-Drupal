import { io } from "../socket/index.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import {
  acceptFriendRequest as acceptFriendRequestService,
  createFriendRequest,
  declineFriendRequest as declineFriendRequestService,
  listFriends,
  listFriendRequests,
  removeFriendship,
} from "../services/friendService.js";

export const sendFriendRequest = asyncHandler(async (req, res) => {
  const { to, message } = req.body;
  const { request, populatedRequest } = await createFriendRequest({
    fromId: req.user._id,
    toId: to,
    message,
  });

  if (populatedRequest?.from) {
    io.to(String(to)).emit("friend-request-received", {
      request: populatedRequest,
      message: `${populatedRequest.from.displayName} đã gửi lời mời kết bạn`,
    });
  }

  res.status(201).json({ message: "Gửi lời mời kết bạn thành công", request });
});

export const acceptFriendRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const result = await acceptFriendRequestService({
    requestId,
    userId: req.user._id,
  });

  const receiver = result.receiverUser;
  const message = `${receiver?.displayName} đã chấp nhận lời mời kết bạn của bạn`;

  io.to(String(result.requestFromId)).emit("friend-request-accepted", {
    from: receiver,
    message,
    notification: result.notification,
  });

  res.status(200).json({
    message: "Chấp nhận lời mời kết bạn thành công",
    newFriend: {
      _id: result.fromUser?._id,
      displayName: result.fromUser?.displayName,
      avatarUrl: result.fromUser?.avatarUrl,
    },
  });
});

export const declineFriendRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  await declineFriendRequestService({
    requestId,
    userId: req.user._id,
  });

  res.sendStatus(204);
});

export const getAllFriends = asyncHandler(async (req, res) => {
  const { friends } = await listFriends({ userId: req.user._id });
  res.status(200).json({ friends });
});

export const getFriendRequests = asyncHandler(async (req, res) => {
  const { sent, received } = await listFriendRequests({
    userId: req.user._id,
  });
  res.status(200).json({ sent, received });
});

export const removeFriend = asyncHandler(async (req, res) => {
  const { friendId } = req.params;
  const { removed } = await removeFriendship({
    userId: req.user._id,
    friendId,
  });

  if (!removed) {
    res.status(200).json({
      message: "Người này không còn trong danh sách bạn bè",
    });
    return;
  }

  io.to(String(friendId)).emit("friend-removed", {
    removedBy: String(req.user._id),
  });

  res.status(200).json({ message: "Đã xoá bạn thành công" });
});
