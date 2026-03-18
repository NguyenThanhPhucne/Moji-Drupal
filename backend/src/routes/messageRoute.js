import express from "express";

import {
  sendDirectMessage,
  sendGroupMessage,
  reactToMessage,
  unsendMessage,
  editMessage,
  markMessageRead,
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
router.put("/:messageId/edit", editMessage);
router.post("/:messageId/read", markMessageRead);

export default router;
