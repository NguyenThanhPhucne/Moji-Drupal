import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { ImagePlus, Send, X } from "lucide-react";
import EmojiPicker from "./EmojiPicker";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE_MB = 5;
const MAX_MESSAGE_LENGTH = 1200;
const TYPING_EMIT_INTERVAL_MS = 350;

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
  const { user } = useAuthStore();
  const { sendDirectMessage, sendGroupMessage, replyingTo, setReplyingTo } =
    useChatStore();
  const { socket } = useSocketStore();
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitAtRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);

  const stopTyping = () => {
    if (typing && socket?.connected) {
      socket.emit("stop_typing", selectedConvo._id);
      setTyping(false);
      lastTypingEmitAtRef.current = 0;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, MAX_MESSAGE_LENGTH);
    setValue(newValue);

    // Auto-resize textarea
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }

    const now = Date.now();
    const hasText = newValue.trim().length > 0;

    if (!hasText) {
      stopTyping();
    } else if (
      socket?.connected &&
      (!typing || now - lastTypingEmitAtRef.current >= TYPING_EMIT_INTERVAL_MS)
    ) {
      setTyping(true);
      lastTypingEmitAtRef.current = now;
      socket.emit("typing", selectedConvo._id);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      lastTypingEmitAtRef.current = 0;

      if (socket?.connected) {
        socket.emit("stop_typing", selectedConvo._id);
      }
    };
  }, [socket, selectedConvo._id]);

  // ── Reset draft when user switches conversation ──────────────────────────
  // Prevents carrying typed text, image, or reply context to a different chat.
  useEffect(() => {
    setValue("");
    setImagePreview(null);
    setReplyingTo(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    // Reset typing state for the previous conversation
    lastTypingEmitAtRef.current = 0;
    setTyping(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConvo._id]);

  if (!user) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`Image is too large. Max ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const sendMessage = async () => {
    if (isSendingRef.current) return;
    const trimmed = value.trim();
    if (!trimmed && !imagePreview) return;

    isSendingRef.current = true;

    const currValue = trimmed;
    const currImage = imagePreview;
    setValue("");
    setImagePreview(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      if (selectedConvo.type === "direct") {
        const otherUser = selectedConvo.participants.find(
          (p) => String(p._id) !== String(user._id),
        );
        if (!otherUser) return;
        await sendDirectMessage(
          otherUser._id,
          currValue,
          currImage ?? undefined,
          selectedConvo._id, // explicit: avoid stale activeConversationId race
          replyingTo?._id,
        );
      } else {
        await sendGroupMessage(
          selectedConvo._id,
          currValue,
          currImage ?? undefined,
          replyingTo?._id,
        );
      }
      setReplyingTo(null);
      stopTyping();
    } catch {
      toast.error("An error occurred while sending the message.");
    } finally {
      isSendingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const hasSendable = value.trim() || imagePreview;
  const charsLeft = MAX_MESSAGE_LENGTH - value.length;

  return (
    <div className="flex flex-col bg-background relative z-10 w-full shrink-0 border-t border-border/30">
      {/* Reply preview — Messenger minimal top-border style */}
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

      {/* Char counter — show only when approaching limit */}
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
        {/* Attach image */}
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

        {/* Textarea wrapper with focus ring */}
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
          {/* Emoji picker inside the box */}
          <div className="absolute right-1.5 bottom-1.5 flex items-center">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg hover:bg-muted/70 text-muted-foreground hover:text-foreground"
            >
              <div>
                <EmojiPicker
                  onChange={(emoji: string) => setValue(`${value}${emoji}`)}
                />
              </div>
            </Button>
          </div>
        </div>

        {/* Send / Like button */}
        <Button
          onClick={sendMessage}
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
