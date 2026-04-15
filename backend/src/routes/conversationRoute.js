import express from "express";
import {
  createConversation,
  getConversations,
  getMessages,
  markAsSeen,
  deleteConversation,
  updateGroupAnnouncementMode,
  updateGroupAdminRole,
  createGroupChannel,
  setGroupActiveChannel,
  updateGroupChannel,
  deleteGroupChannel,
  reorderGroupChannels,
  createGroupChannelCategory,
  updateGroupChannelCategory,
  deleteGroupChannelCategory,
  reorderGroupChannelCategories,
  getGroupChannelAnalytics,
  updateGroupPinnedMessage,
  createGroupJoinLink,
  revokeGroupJoinLink,
  joinGroupByLink,
} from "../controllers/conversationController.js";
import { checkFriendship } from "../middlewares/friendMiddleware.js";
import { protectedRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

// User routes (with auth)
router.post("/", checkFriendship, createConversation);
router.get("/", getConversations);
router.get("/:conversationId/messages", getMessages);
router.patch("/:conversationId/seen", markAsSeen);
router.patch("/:conversationId/announcement-mode", updateGroupAnnouncementMode);
router.patch("/:conversationId/admin-role", updateGroupAdminRole);
router.post("/:conversationId/channels", createGroupChannel);
router.patch("/:conversationId/channels/reorder", reorderGroupChannels);
router.patch("/:conversationId/channels/:channelId", updateGroupChannel);
router.delete("/:conversationId/channels/:channelId", deleteGroupChannel);
router.patch("/:conversationId/active-channel", setGroupActiveChannel);
router.post("/:conversationId/channel-categories", createGroupChannelCategory);
router.patch("/:conversationId/channel-categories/reorder", reorderGroupChannelCategories);
router.patch("/:conversationId/channel-categories/:categoryId", updateGroupChannelCategory);
router.delete("/:conversationId/channel-categories/:categoryId", deleteGroupChannelCategory);
router.get("/:conversationId/channel-analytics", getGroupChannelAnalytics);
router.patch("/:conversationId/pin-message", updateGroupPinnedMessage);
router.post("/:conversationId/join-link", createGroupJoinLink);
router.delete("/:conversationId/join-link", revokeGroupJoinLink);
router.post("/:conversationId/join-by-link", joinGroupByLink);
router.delete("/:conversationId", protectedRoute, deleteConversation);

export default router;
