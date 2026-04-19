import { MAX_MESSAGE_LENGTH } from "@/hooks/useMessageInput";
import { cn } from "@/lib/utils";
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
}: MessageComposerActionsProps) => {
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
        title="Send image"
        aria-label="Attach image"
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
          "chat-composer-input-surface chat-composer-input-surface--command",
          focused
            ? "chat-composer-input-surface--focused"
            : "chat-composer-input-surface--idle",
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => onFocusedChange(true)}
          onBlur={() => onFocusedChange(false)}
          placeholder={composerPlaceholder}
          aria-label="Message input"
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
      </div>

      <CharRingSlot show={showRing} charsUsed={charsUsed} />

      <Button
        onClick={onSend}
        size="icon"
        disabled={sendDisabled}
        aria-label={hasSendableMessage ? "Send message" : "Like"}
        className={cn(
          "chat-composer-action-btn chat-composer-action-btn--command chat-composer-action-btn--send",
          isSendBursting && hasSendableMessage && "send-burst",
          sendButtonToneClass,
        )}
        title={hasSendableMessage ? "Send (Enter)" : "Like"}
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