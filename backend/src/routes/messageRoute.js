import express from "express";

import {
  sendDirectMessage,
  sendGroupMessage,
  reactToMessage,
  unsendMessage,
  removeMessageForMe,
  editMessage,
  markMessageRead,
  getLinkPreview,
} from "../controllers/messageController.js";
import {
  checkFriendship,
  checkGroupMembership,
} from "../middlewares/friendMiddleware.js";

const router = express.Router();

router.post("/direct", checkFriendship, sendDirectMessage);
router.post("/group", checkGroupMembership, sendGroupMessage);
router.post("/:messageId/react", reactToMessage);
router.delete("/:messageId/unsend", unsendMessage);
router.delete("/:messageId/remove-for-me", removeMessageForMe);
router.put("/:messageId/edit", editMessage);
router.post("/:messageId/read", markMessageRead);
router.get("/link-preview/meta", getLinkPreview);

export default router;
