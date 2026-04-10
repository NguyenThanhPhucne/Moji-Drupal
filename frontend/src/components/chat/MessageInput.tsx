import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { Button } from "../ui/button";
import { ImagePlus, Send, X } from "lucide-react";
import EmojiPicker from "./EmojiPicker";
import { cn } from "@/lib/utils";
import { useMessageInput } from "@/hooks/useMessageInput";

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

  if (!user) return null;

  return (
    <div className="flex flex-col bg-background relative z-10 w-full shrink-0 border-t border-border/30">
      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/25 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex-1 border-l-2 border-primary/70 pl-2.5 py-0.5">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-[0.04em] leading-none mb-0.5">
              Reply
            </p>
            <p className="text-[12px] text-muted-foreground/75 truncate max-w-[260px] leading-snug">
              {replyingTo.content || "(image)"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={() => setReplyingTo(null)}
            className="flex-shrink-0 p-1 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="relative w-fit mx-4 mt-3 animate-in fade-in duration-200">
          <img
            src={imagePreview}
            alt="preview"
            className="h-28 w-28 object-cover rounded-xl border border-border shadow-sm"
          />
          <button
            type="button"
            onClick={() => setImagePreview(null)}
            className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-0.5 shadow hover:bg-muted/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            aria-label="Remove selected image"
          >
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Char counter */}
      {charsLeft < 120 && (
        <div className="flex justify-end px-4 pt-1.5">
          <span
            className={cn(
              "text-[10px] tabular-nums",
              charsLeft < 50 ? "chat-counter-warning" : "text-muted-foreground/50",
            )}
          >
            {charsLeft}
          </span>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "mb-0.5 flex-shrink-0 size-9 rounded-full transition-colors duration-150",
            "text-muted-foreground/70 hover:bg-primary/10 hover:text-primary",
            imagePreview && "text-primary bg-primary/10"
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
            placeholder="Aa"
            aria-label="Message input"
            className={cn(
              "w-full resize-none overflow-hidden bg-transparent",
              "px-3.5 py-2.5 pr-10 text-[14px] leading-relaxed text-foreground",
              "focus:outline-none focus:ring-0",
              "transition-all duration-200 max-h-[140px]",
              "placeholder:text-muted-foreground/45 placeholder:font-normal",
            )}
          />
          <div className="absolute right-1.5 bottom-1.5 flex items-center">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg hover:bg-muted/70 text-muted-foreground hover:text-foreground"
            >
              <div>
                <EmojiPicker onChange={appendEmoji} />
              </div>
            </Button>
          </div>
        </div>

        <Button
          onClick={() => void sendMessage()}
          size="icon"
          disabled={!hasSendable}
          aria-label={hasSendable ? "Send message" : "Like"}
          className={cn(
            "flex-shrink-0 mb-0.5 size-9 rounded-full transition-all duration-150",
            hasSendable
              ? "bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:shadow-md hover:scale-110 active:scale-95"
              : "bg-transparent text-primary hover:bg-primary/10 opacity-80 hover:opacity-100",
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
    </div>
  );
};

export default MessageInput;
