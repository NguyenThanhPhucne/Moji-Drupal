export const PHOTO_MESSAGE_PREVIEW_CONTENT = "📷 Photo";
export const AUDIO_MESSAGE_PREVIEW_CONTENT = "🎤 Voice message";

export const buildMessagePreviewContent = (message) => {
  const normalizedContent = String(message?.content || "").trim();
  if (normalizedContent) {
    return normalizedContent;
  }

  if (message?.imgUrl) {
    return PHOTO_MESSAGE_PREVIEW_CONTENT;
  }

  if (message?.audioUrl) {
    return AUDIO_MESSAGE_PREVIEW_CONTENT;
  }

  return "";
};
