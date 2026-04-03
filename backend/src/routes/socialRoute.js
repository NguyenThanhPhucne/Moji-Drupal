import express from "express";
import {
  createPost,
  getPostById,
  getHomeFeed,
  getExploreFeed,
  getProfile,
  getUserPosts,
  toggleLikePost,
  getPostEngagement,
  addComment,
  getCommentsByPost,
  toggleFollowUser,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/socialController.js";

const router = express.Router();

router.post("/posts", createPost);
router.get("/posts/:postId", getPostById);
router.get("/feed/home", getHomeFeed);
router.get("/feed/explore", getExploreFeed);
router.get("/profiles/:userId", getProfile);
router.get("/profiles/:userId/posts", getUserPosts);
router.post("/posts/:postId/like", toggleLikePost);
router.get("/posts/:postId/engagement", getPostEngagement);
router.get("/post/:postId/engagement", getPostEngagement);
router.get("/posts/:postId/comments", getCommentsByPost);
router.post("/posts/:postId/comments", addComment);
router.post("/follows/:userId/toggle", toggleFollowUser);
router.get("/notifications", getNotifications);
router.patch("/notifications/read-all", markAllNotificationsRead);
router.patch("/notifications/:notificationId/read", markNotificationRead);

export default router;
