import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { useMessageInput } from "@/hooks/useMessageInput";
import { useState } from "react";
import MessageComposerActions from "./message-input/MessageComposerActions";
import MessageComposerShell from "./message-input/MessageComposerShell";
import MessagePreviewBlocks from "./message-input/MessagePreviewBlocks";
import { useMessageComposerMode } from "./message-input/useMessageComposerMode";
import { useImageDropZone } from "./message-input/useImageDropZone";

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
  const { user } = useAuthStore();
  const {
    value,
    focused,
    setFocused,
    imagePreview,
    setImagePreview,
    replyingTo,
    setReplyingTo,
    textareaRef,
    fileInputRef,
    handleChange,
    handleFileChange,
    handleKeyDown,
    sendMessage,
    appendEmoji,
    hasSendable,
    charsLeft,
    audioPreview,
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    removeAudioPreview,
  } = useMessageInput(selectedConvo);

  const {
    isDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragOver,
  } = useImageDropZone(handleFileChange);
  const [isSendBursting, setIsSendBursting] = useState(false);

  const currentUserId = String(user?._id || "");
  const hasSendableMessage = Boolean(hasSendable);
  const {
    isGroupAdmin,
    announcementOnly,
    canSendInCurrentMode,
    composerPlaceholder,
    composerContextLabel,
    composerModeLabel,
    sendDisabled,
    sendButtonToneClass,
  } = useMessageComposerMode({
    selectedConvo,
    currentUserId,
    hasSendableMessage,
  });

  if (!user) return null;

  const charsUsed = value.length;
  const showRing = charsLeft < 120;

  const handleSendClick = () => {
    if (!canSendInCurrentMode) {
      return;
    }

    setIsSendBursting(true);
    setTimeout(() => setIsSendBursting(false), 500);
    sendMessage().catch((error) => {
      console.error("Failed to send message", error);
    });
  };

  return (
    <MessageComposerShell
      isDragOver={isDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <MessagePreviewBlocks
        composerContextLabel={composerContextLabel}
        composerModeLabel={composerModeLabel}
        replyingTo={replyingTo}
        onClearReply={() => setReplyingTo(null)}
        imagePreview={imagePreview}
        onClearImage={() => setImagePreview(null)}
        audioPreview={audioPreview}
        onClearAudio={removeAudioPreview}
        announcementOnly={announcementOnly}
        isGroupAdmin={isGroupAdmin}
      />

      <MessageComposerActions
        canSendInCurrentMode={canSendInCurrentMode}
        imagePreview={imagePreview}
        fileInputRef={fileInputRef}
        onFileChange={handleFileChange}
        value={value}
        focused={focused}
        onFocusedChange={setFocused}
        textareaRef={textareaRef}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        composerPlaceholder={composerPlaceholder}
        onAppendEmoji={appendEmoji}
        showRing={showRing}
        charsUsed={charsUsed}
        sendDisabled={sendDisabled}
        hasSendableMessage={hasSendableMessage}
        isSendBursting={isSendBursting}
        sendButtonToneClass={sendButtonToneClass}
        onSend={handleSendClick}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onCancelRecording={cancelRecording}
      />
    </MessageComposerShell>
  );
};

export default MessageInput;
