import express from "express";
import {
  createConversation,
  getConversations,
  getMessages,
  markAsSeen,
  deleteConversation,
} from "../controllers/conversationController.js";
import { checkFriendship } from "../middlewares/friendMiddleware.js";
import { protectedRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

// User routes (with auth)
router.post("/", checkFriendship, createConversation);
router.get("/", getConversations);
router.get("/:conversationId/messages", getMessages);
router.patch("/:conversationId/seen", markAsSeen);
router.delete("/:conversationId", protectedRoute, deleteConversation);

export default router;
