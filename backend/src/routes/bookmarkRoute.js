import express from "express";
import {
  bulkBookmarkAction,
  getBookmarks,
  toggleBookmark,
  updateBookmarkMeta,
} from "../controllers/bookmarkController.js";

const router = express.Router();

router.get("/", getBookmarks);
router.post("/:messageId/toggle", toggleBookmark);
router.patch("/:bookmarkId/meta", updateBookmarkMeta);
router.post("/bulk", bulkBookmarkAction);

export default router;
