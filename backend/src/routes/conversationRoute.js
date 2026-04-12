import express from "express";
import {
  createConversation,
  getConversations,
  getMessages,
  markAsSeen,
  deleteConversation,
  updateGroupAnnouncementMode,
  updateGroupAdminRole,
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
router.patch("/:conversationId/pin-message", updateGroupPinnedMessage);
router.post("/:conversationId/join-link", createGroupJoinLink);
router.delete("/:conversationId/join-link", revokeGroupJoinLink);
router.post("/:conversationId/join-by-link", joinGroupByLink);
router.delete("/:conversationId", protectedRoute, deleteConversation);

export default router;
