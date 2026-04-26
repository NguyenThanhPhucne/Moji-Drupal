import { MAX_MESSAGE_LENGTH } from "@/hooks/useMessageInput";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ImagePlus, Send, ThumbsUp } from "lucide-react";
import type {
  ChangeEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import EmojiPicker from "../EmojiPicker";
import { Button } from "../../ui/button";

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
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onCancelRecording?: () => void;
}

const MessageComposerActions = ({
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
  onStartRecording,
  onStopRecording,
  onCancelRecording,
}: MessageComposerActionsProps) => {
  const { t } = useI18n();

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

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
        <div className="flex flex-1 items-center gap-3 px-3 animate-in fade-in duration-200">
            {/* Recording waveform */}
            <div className="flex items-center gap-[3px] h-5 flex-shrink-0" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="voice-bar" />
              ))}
            </div>
            <span className="font-mono text-sm font-semibold tabular-nums text-destructive">
              {formatDuration(recordingDuration)}
            </span>
            <span className="text-[11.5px] text-muted-foreground/70 hidden sm:inline">Recording…</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onCancelRecording}
              className="px-2.5 h-7 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onStopRecording}
              className="px-3 h-7 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold shadow-sm hover:bg-primary/90 active:scale-[0.97] transition-all"
            >
              Done
            </button>
          </div>
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
            "chat-composer-action-btn chat-composer-action-btn--command text-muted-foreground hover:text-primary",
            !canSendInCurrentMode && "chat-composer-action-btn--disabled",
          )}
          onClick={onStartRecording}
          title={t("chatComposer.record_audio") || "Record voice memo"}
          aria-label="Record voice memo"
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

export default MessageComposerActions;