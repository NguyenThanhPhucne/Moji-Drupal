import express from "express";
import {
  authMe,
  changePassword,
  getUserProfileLite,
  searchUserByUsername,
  updateNotificationPreferences,
  updatePersonalizationPreferences,
  updateOnlineStatusVisibility,
  updateProfile,
  uploadAvatar,
  uploadCoverPhoto,
  removeCoverPhoto,
  updateUserRole,
  toggleUserBan,
  toggleUserVerify,
} from "../controllers/userController.js";
import { upload } from "../middlewares/uploadMiddleware.js";
import { protectedRoute, requireRole } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/me", protectedRoute, authMe);
router.patch("/me", protectedRoute, updateProfile);
router.post("/change-password", protectedRoute, changePassword);
router.patch(
  "/online-status-visibility",
  protectedRoute,
  updateOnlineStatusVisibility,
);
router.patch(
  "/notification-preferences",
  protectedRoute,
  updateNotificationPreferences,
);
router.patch(
  "/personalization-preferences",
  protectedRoute,
  updatePersonalizationPreferences,
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

// --- Admin Routes ---
router.patch("/admin/users/:id/role", protectedRoute, requireRole("admin"), updateUserRole);
router.patch("/admin/users/:id/ban", protectedRoute, requireRole("admin", "moderator"), toggleUserBan);
router.patch("/admin/users/:id/verify", protectedRoute, requireRole("admin"), toggleUserVerify);

export default router;
