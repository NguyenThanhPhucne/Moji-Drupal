import { MAX_MESSAGE_LENGTH } from "@/hooks/useMessageInput";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ImagePlus, Send, ThumbsUp } from "lucide-react";
import type {
  ChangeEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import { memo } from "react";
import EmojiPicker from "../EmojiPicker";
import { Button } from "../../ui/button";
import { VoiceRecordingVisualizer } from "./VoiceRecordingVisualizer";
import {
  RecordingDurationDisplay,
  RecordingStatusLiveRegion,
  OfflineRecordingIndicator,
} from "../VoiceUIComponents";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  recordingRevealClass,
  recordingIndicatorClass,
  buttonPressClass,
  focusRingAnimationClass,
} from "@/lib/voiceAnimations";

const CharRing = ({ value, max }: { value: number; max: number }) => {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, value / max);
  const offset = circumference * (1 - progress);
  const isWarning = value > max * 0.85;
  const isDanger = value > max * 0.95;

  let progressStrokeClass = "stroke-primary";
  if (isDanger) {
    progressStrokeClass = "stroke-destructive";
  } else if (isWarning) {
    progressStrokeClass = "stroke-warning";
  }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="chat-composer-char-ring">
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="chat-composer-char-ring-track"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={cn("char-progress-ring chat-composer-char-ring-progress", progressStrokeClass)}
      />
      {isDanger && (
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="7"
          className="chat-composer-char-ring-danger-text"
        >
          {max - value}
        </text>
      )}
    </svg>
  );
};

const CharRingSlot = ({
  show,
  charsUsed,
}: {
  show: boolean;
  charsUsed: number;
}) => {
  if (!show) {
    return (
      <div
        className="chat-composer-char-slot chat-composer-char-slot--command chat-composer-char-slot--empty"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="chat-composer-char-slot chat-composer-char-slot--command chat-composer-char-slot--visible">
      <CharRing value={charsUsed} max={MAX_MESSAGE_LENGTH} />
    </div>
  );
};

interface MessageComposerActionsProps {
  canSendInCurrentMode: boolean;
  imagePreview: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  value: string;
  focused: boolean;
  onFocusedChange: (nextFocused: boolean) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  composerPlaceholder: string;
  onAppendEmoji: (emoji: string) => void;
  showRing: boolean;
  charsUsed: number;
  sendDisabled: boolean;
  hasSendableMessage: boolean;
  isSendBursting: boolean;
  sendButtonToneClass: string;
  onSend: () => void;
  // Audio state
  isRecording?: boolean;
  recordingDuration?: number;
  recordingStream?: MediaStream | null;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onCancelRecording?: () => void;
}

const MessageComposerActionsComponent = ({
  canSendInCurrentMode,
  imagePreview,
  fileInputRef,
  onFileChange,
  value,
  focused,
  onFocusedChange,
  textareaRef,
  onChange,
  onKeyDown,
  composerPlaceholder,
  onAppendEmoji,
  showRing,
  charsUsed,
  sendDisabled,
  hasSendableMessage,
  isSendBursting,
  sendButtonToneClass,
  onSend,
  isRecording,
  recordingDuration,
  recordingStream,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
}: MessageComposerActionsProps) => {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const MAX_RECORDING_DURATION = 180; // 3 minutes

  return (
    <div className="chat-composer-actions-row chat-composer-actions-row--command">
      <Button
        variant="ghost"
        size="icon"
        disabled={!canSendInCurrentMode}
        className={cn(
          "chat-composer-action-btn chat-composer-action-btn--command chat-composer-action-btn--attach",
          imagePreview && "chat-composer-action-btn--active",
          !canSendInCurrentMode && "chat-composer-action-btn--disabled",
        )}
        onClick={() => fileInputRef.current?.click()}
        title={t("chatComposer.send_image")}
        aria-label={t("chatComposer.attach_image")}
      >
        <ImagePlus className="chat-composer-action-icon chat-composer-action-icon--attach" />
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="chat-composer-file-input"
        disabled={!canSendInCurrentMode}
        onChange={onFileChange}
      />

      <div
        className={cn(
          "chat-composer-input-surface chat-composer-input-surface--command flex-1 flex items-center min-w-0 transition-colors",
          focused
            ? "chat-composer-input-surface--focused"
            : "chat-composer-input-surface--idle",
        )}
      >
        {isRecording ? (
          <>
            {/* Recording status announcement for screen readers */}
            <RecordingStatusLiveRegion 
              isRecording={isRecording} 
              duration={recordingDuration || 0}
              maxDuration={MAX_RECORDING_DURATION}
            />

            {/* Recording UI Container - smooth reveal with animations */}
            <div className={cn(
              "flex flex-1 flex-col sm:flex-row items-center gap-2 sm:gap-3 px-3 py-2",
              recordingRevealClass,
              "rounded-lg border border-destructive/30",
              "dark:bg-slate-800/50 bg-red-50/50",
              "dark:border-destructive/20 border-destructive/30",
              !isOnline && "border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20"
            )}>
              {/* Animated recording indicator dot */}
              <div className={cn(
                "relative flex items-center justify-center w-2 h-2 flex-shrink-0",
                recordingIndicatorClass
              )}>
                <div className="absolute w-2 h-2 rounded-full bg-destructive dark:bg-red-400" />
              </div>

              {/* Recording waveform - Enterprise size: 32px height, responsive width */}
              <VoiceRecordingVisualizer 
                stream={recordingStream || null} 
                barCount={16}
                className="h-8 flex-1 sm:flex-none sm:w-32"
              />

              {/* Recording duration with max context */}
              <RecordingDurationDisplay
                current={recordingDuration || 0}
                max={MAX_RECORDING_DURATION}
              />

              {/* Status label - hidden on very small screens */}
              <span className="text-xs text-muted-foreground hidden sm:inline font-medium">
                Recording…
              </span>

              {/* Offline indicator */}
              {!isOnline && <OfflineRecordingIndicator />}

              <div className="flex-1 hidden sm:block" />

              {/* Action buttons - responsive layout */}
              <div className={cn(
                "flex w-full sm:w-auto gap-2 sm:ml-auto",
                "flex-row justify-end"
              )}>
                {/* Cancel button - Enterprise size: 40px height, responsive width */}
                <button
                  type="button"
                  onClick={onCancelRecording}
                  aria-label="Cancel voice recording"
                  className={cn(
                    "px-3 h-10 rounded-lg text-sm font-medium transition-all",
                    buttonPressClass,
                    focusRingAnimationClass,
                    "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                    "dark:hover:bg-destructive/20"
                  )}
                >
                  Cancel
                </button>

                {/* Done button - Enterprise size: 40px height, responds to recording state */}
                <button
                  type="button"
                  onClick={onStopRecording}
                  aria-label={`Stop recording and save voice memo (${formatDuration(recordingDuration)} recorded)`}
                  className={cn(
                    "px-4 h-10 rounded-lg text-sm font-semibold shadow-sm transition-all",
                    buttonPressClass,
                    focusRingAnimationClass,
                    "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:scale-105",
                    "dark:bg-primary dark:hover:bg-primary/80"
                  )}
                >
                  Done
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => onFocusedChange(true)}
          onBlur={() => onFocusedChange(false)}
          placeholder={composerPlaceholder}
          aria-label={t("chatComposer.message_input")}
          disabled={!canSendInCurrentMode}
          className={cn(
            "chat-composer-textarea chat-composer-textarea--command",
            !canSendInCurrentMode && "chat-composer-textarea--disabled",
          )}
        />

        <div className="chat-composer-emoji-anchor chat-composer-emoji-anchor--command">
          <Button
            asChild
            variant="ghost"
            size="icon"
            disabled={!canSendInCurrentMode}
            className={cn(
              "chat-composer-emoji-btn chat-composer-emoji-btn--command",
              !canSendInCurrentMode && "chat-composer-emoji-btn--disabled",
            )}
          >
            <div>
              <EmojiPicker onChange={onAppendEmoji} />
            </div>
          </Button>
        </div>
        </>
      )}
      </div>

      {!isRecording && !hasSendableMessage && !value.trim() && (
        <Button
          variant="ghost"
          size="icon"
          disabled={!canSendInCurrentMode}
          className={cn(
            "chat-composer-action-btn chat-composer-action-btn--command text-muted-foreground hover:text-primary focus:ring-2 focus:ring-primary/50 focus:outline-none",
            !canSendInCurrentMode && "chat-composer-action-btn--disabled",
          )}
          onClick={onStartRecording}
          title={t("chatComposer.record_audio") || "Record voice memo"}
          aria-label="Record voice memo (maximum 3 minutes)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </Button>
      )}

      <CharRingSlot show={showRing} charsUsed={charsUsed} />

      <Button
        onClick={onSend}
        size="icon"
        disabled={sendDisabled}
        aria-label={
          hasSendableMessage
            ? t("chatComposer.send_message")
            : t("chatComposer.like")
        }
        className={cn(
          "chat-composer-action-btn chat-composer-action-btn--command chat-composer-action-btn--send",
          isSendBursting && hasSendableMessage && "send-burst",
          sendButtonToneClass,
        )}
        title={
          hasSendableMessage
            ? t("chatComposer.send_enter")
            : t("chatComposer.like")
        }
      >
        {hasSendableMessage ? (
          <Send className="chat-composer-action-icon chat-composer-action-icon--send" />
        ) : (
          <ThumbsUp className="chat-composer-action-icon chat-composer-action-icon--send" />
        )}
      </Button>
    </div>
  );
};

// Memoize to prevent re-renders from scroll events
const MessageComposerActions = memo(MessageComposerActionsComponent);

export default MessageComposerActions;