import express from "express";
import {
  authMe,
  changePassword,
  getUserProfileLite,
  searchUserByUsername,
  updateOnlineStatusVisibility,
  updateProfile,
  uploadAvatar,
  uploadCoverPhoto,
  removeCoverPhoto,
} from "../controllers/userController.js";
import { upload } from "../middlewares/uploadMiddleware.js";
import { protectedRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/me", protectedRoute, authMe);
router.patch("/me", protectedRoute, updateProfile);
router.post("/change-password", protectedRoute, changePassword);
router.patch(
  "/online-status-visibility",
  protectedRoute,
  updateOnlineStatusVisibility,
);
router.get("/search", protectedRoute, searchUserByUsername);
router.get("/:userId/profile-lite", protectedRoute, getUserProfileLite);
router.post(
  "/uploadAvatar",
  protectedRoute,
  upload.single("file"),
  uploadAvatar,
);
router.post(
  "/cover-photo",
  protectedRoute,
  upload.single("file"),
  uploadCoverPhoto,
);
router.delete("/cover-photo", protectedRoute, removeCoverPhoto);

export default router;
