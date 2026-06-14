import { asyncHandler } from "../middlewares/asyncHandler.js";
import {
  editMessage as editMessageService,
  forwardMessage as forwardMessageService,
  getLinkPreview as getLinkPreviewService,
  getMessageThread as getMessageThreadService,
  markMessageRead as markMessageReadService,
  reactToMessage as reactToMessageService,
  removeMessageForMe as removeMessageForMeService,
  sendDirectMessage as sendDirectMessageService,
  sendGroupMessage as sendGroupMessageService,
  toggleForwardable as toggleForwardableService,
  undoSendMessage as undoSendMessageService,
  unsendMessage as unsendMessageService,
  uploadAudio as uploadAudioService,
} from "../services/messageService.js";

export const uploadAudio = asyncHandler(uploadAudioService);
export const sendDirectMessage = asyncHandler(sendDirectMessageService);
export const sendGroupMessage = asyncHandler(sendGroupMessageService);
export const reactToMessage = asyncHandler(reactToMessageService);
export const unsendMessage = asyncHandler(unsendMessageService);
export const undoSendMessage = asyncHandler(undoSendMessageService);
export const removeMessageForMe = asyncHandler(removeMessageForMeService);
export const editMessage = asyncHandler(editMessageService);
export const markMessageRead = asyncHandler(markMessageReadService);
export const getMessageThread = asyncHandler(getMessageThreadService);
export const getLinkPreview = asyncHandler(getLinkPreviewService);
export const forwardMessage = asyncHandler(forwardMessageService);
export const toggleForwardable = asyncHandler(toggleForwardableService);
