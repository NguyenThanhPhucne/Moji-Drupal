import express from "express";
import {
  authMe,
  getUserProfileLite,
  searchUserByUsername,
  uploadAvatar,
} from "../controllers/userController.js";
import { upload } from "../middlewares/uploadMiddleware.js";
import { protectedRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/me", protectedRoute, authMe);
router.get("/search", protectedRoute, searchUserByUsername);
router.get("/:userId/profile-lite", protectedRoute, getUserProfileLite);
router.post(
  "/uploadAvatar",
  protectedRoute,
  upload.single("file"),
  uploadAvatar,
);

export default router;
