import express from "express";

import {
  sendDirectMessage,
  sendGroupMessage,
  reactToMessage,
  undoSendMessage,
  unsendMessage,
  removeMessageForMe,
  editMessage,
  markMessageRead,
  getLinkPreview,
  forwardMessage,
  toggleForwardable,
  uploadAudio,
} from "../controllers/messageController.js";
import {
  checkFriendship,
  checkGroupMembership,
} from "../middlewares/friendMiddleware.js";

const router = express.Router();

router.post("/audio/upload", uploadAudio);
router.post("/direct", checkFriendship, sendDirectMessage);
router.post("/group", checkGroupMembership, sendGroupMessage);
router.post("/:messageId/react", reactToMessage);
router.delete("/:messageId/undo", undoSendMessage);
router.delete("/:messageId/unsend", unsendMessage);
router.delete("/:messageId/remove-for-me", removeMessageForMe);
router.put("/:messageId/edit", editMessage);
router.post("/:messageId/read", markMessageRead);
router.post("/:messageId/forward", forwardMessage);
router.put("/:messageId/toggle-forward", toggleForwardable);
router.get("/link-preview/meta", getLinkPreview);

export default router;
