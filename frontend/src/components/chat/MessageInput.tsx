import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { Button } from "../ui/button";
import { ImagePlus, Send, X, Reply } from "lucide-react";
import EmojiPicker from "./EmojiPicker";
import { cn } from "@/lib/utils";
import { useMessageInput, MAX_MESSAGE_LENGTH } from "@/hooks/useMessageInput";
import { useState, useRef, useCallback } from "react";

// Circular SVG progress ring for character count
const CharRing = ({ value, max }: { value: number; max: number }) => {
  const RADIUS = 10;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const progress = Math.min(1, value / max);
  const offset = CIRCUMFERENCE * (1 - progress);
  const isWarning = value > max * 0.85;
  const isDanger = value > max * 0.95;
  let progressStrokeClass = "stroke-primary";
  if (isDanger) {
    progressStrokeClass = "stroke-destructive";
  } else if (isWarning) {
    progressStrokeClass = "stroke-warning";
  }

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0">
      {/* Track */}
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-muted/60"
      />
      {/* Progress */}
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        className={cn(
          "char-progress-ring transition-all duration-200",
          progressStrokeClass,
        )}
      />
      {/* Inner number only in danger zone */}
      {isDanger && (
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontSize="7"
          className={cn(
            "fill-current font-bold",
            isDanger ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {max - value}
        </text>
      )}
    </svg>
  );
};

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
  } = useMessageInput(selectedConvo);

  // Drag & drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSendBursting, setIsSendBursting] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file?.type.startsWith("image/")) {
        const mockEvent = {
          target: { files: e.dataTransfer.files },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        handleFileChange(mockEvent);
      }
    },
    [handleFileChange],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  if (!user) return null;

  const myUserId = String(user._id || "");
  const isGroupConversation = selectedConvo.type === "group";
  const isGroupCreator =
    isGroupConversation &&
    String(selectedConvo.group?.createdBy || "") === myUserId;
  const isGroupAdmin =
    isGroupConversation &&
    ((selectedConvo.group?.adminIds || []).map(String).includes(myUserId) ||
      isGroupCreator);
  const announcementOnly =
    isGroupConversation && Boolean(selectedConvo.group?.announcementOnly);
  const canSendInCurrentMode = !announcementOnly || isGroupAdmin;
  const sendDisabled = !hasSendable || !canSendInCurrentMode;
  const sendButtonToneClass = (() => {
    if (canSendInCurrentMode && hasSendable) {
      return "bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:shadow-md hover:scale-110 active:scale-95 animate-in zoom-in-75 duration-200";
    }

    if (canSendInCurrentMode) {
      return "bg-transparent text-primary hover:bg-primary/10 opacity-80 hover:opacity-100";
    }

    return "bg-muted text-muted-foreground";
  })();

  const charsUsed = value.length;
  const showRing = charsLeft < 120;

  return (
    <section
      className={cn(
        "flex flex-col bg-background relative z-10 w-full shrink-0 border-t border-border/30 transition-all duration-200",
        isDragOver && "drop-zone-active",
      )}
      aria-label="Message input area"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay label */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl pointer-events-none animate-in fade-in duration-150">
          <p className="text-[13px] font-semibold text-primary">Drop image to attach</p>
        </div>
      )}

      {/* Reply preview — now shows sender name */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border/20 bg-muted/10 animate-in fade-in slide-in-from-bottom-1 duration-150">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-[2.5px] self-stretch rounded-full bg-primary/80 flex-shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-[0.05em] leading-none mb-0.5">
                <Reply className="size-2.5" />
                {replyingTo.senderDisplayName ?? "Reply"}
              </span>
              <p className="text-[12px] text-muted-foreground/70 truncate leading-snug">
                {replyingTo.content || "📷 Photo"}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={() => setReplyingTo(null)}
            className="flex-shrink-0 p-1 rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Image preview — polished */}
      {imagePreview && (
        <div className="relative w-fit mx-4 mt-3 animate-in fade-in zoom-in-95 duration-200">
          <img
            src={imagePreview}
            alt="preview"
            className="h-24 w-24 object-cover rounded-xl border border-border/60 shadow-sm"
          />
          <button
            type="button"
            onClick={() => setImagePreview(null)}
            className="absolute -top-1.5 -right-1.5 size-5 flex items-center justify-center bg-foreground/80 hover:bg-foreground rounded-full shadow-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            aria-label="Remove selected image"
          >
            <X className="size-3 text-background" />
          </button>
          <div className="absolute bottom-1 left-1 bg-background/80 backdrop-blur-sm rounded px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
            Image
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          disabled={!canSendInCurrentMode}
          className={cn(
            "mb-0.5 flex-shrink-0 size-9 rounded-full transition-colors duration-150",
            "text-muted-foreground/70 hover:bg-primary/10 hover:text-primary",
            imagePreview && "text-primary bg-primary/10",
            !canSendInCurrentMode && "opacity-45 hover:bg-transparent hover:text-muted-foreground/70",
          )}
          onClick={() => fileInputRef.current?.click()}
          title="Send image"
          aria-label="Attach image"
        >
          <ImagePlus className="size-[18px]" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={!canSendInCurrentMode}
          onChange={handleFileChange}
        />

        <div
          className={cn(
            "flex-1 relative rounded-[22px] transition-all duration-150",
            "border bg-muted/25",
            focused
              ? "border-primary/40 shadow-[0_0_0_2.5px_hsl(var(--primary)/0.14)]"
              : "border-border/60 hover:border-border/90",
          )}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              canSendInCurrentMode
                ? "Aa"
                : "Only admins can send messages in announcement mode"
            }
            aria-label="Message input"
            disabled={!canSendInCurrentMode}
            className={cn(
              "w-full resize-none overflow-hidden bg-transparent",
              "px-3.5 py-2.5 pr-10 text-[14px] leading-relaxed text-foreground",
              "focus:outline-none focus:ring-0",
              "transition-all duration-200 max-h-[140px]",
              "placeholder:text-muted-foreground/45 placeholder:font-normal",
              !canSendInCurrentMode && "cursor-not-allowed opacity-70",
            )}
          />
          <div className="absolute right-1.5 bottom-1.5 flex items-center">
            <Button
              asChild
              variant="ghost"
              size="icon"
              disabled={!canSendInCurrentMode}
              className={cn(
                "size-7 rounded-lg hover:bg-muted/70 text-muted-foreground hover:text-foreground",
                !canSendInCurrentMode && "opacity-45 hover:bg-transparent",
              )}
            >
              <div>
                <EmojiPicker onChange={appendEmoji} />
              </div>
            </Button>
          </div>
        </div>

        {/* Char progress ring */}
        {showRing && (
          <div className="mb-0.5 flex-shrink-0 animate-in fade-in duration-200">
            <CharRing value={charsUsed} max={MAX_MESSAGE_LENGTH} />
          </div>
        )}

        <Button
          onClick={() => {
            if (!canSendInCurrentMode) {
              return;
            }
            setIsSendBursting(true);
            setTimeout(() => setIsSendBursting(false), 500);
            void sendMessage();
          }}
          size="icon"
          disabled={sendDisabled}
          aria-label={hasSendable ? "Send message" : "Like"}
          className={cn(
            "flex-shrink-0 mb-0.5 size-9 rounded-full transition-all duration-200",
            isSendBursting && hasSendable && "send-burst",
            sendButtonToneClass,
          )}
          title={hasSendable ? "Send (Enter)" : "Like"}
        >
          {hasSendable ? (
            <Send className="size-4" />
          ) : (
            <span className="text-[18px] leading-none select-none">👍</span>
          )}
        </Button>
      </div>

      {announcementOnly && !isGroupAdmin && (
        <p className="px-3.5 pb-2 text-[11px] font-medium text-muted-foreground">
          Announcement mode is enabled. Only group admins can post new messages.
        </p>
      )}
    </section>
  );
};

export default MessageInput;
