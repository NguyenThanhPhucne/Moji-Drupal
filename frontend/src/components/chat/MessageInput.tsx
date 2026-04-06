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
          undefined,
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
  const showActionChips = focused || value.length > 0 || Boolean(imagePreview);

  const injectTemplate = (type: "code" | "spoiler" | "mention") => {
    const trimmed = value.trim();
    if (type === "code") {
      setValue(trimmed ? `${value}\n\`\`\`\n\n\`\`\`` : "```\n\n```");
      return;
    }

    if (type === "spoiler") {
      setValue(trimmed ? `${value} ||spoiler||` : "||spoiler||");
      return;
    }

    setValue(trimmed ? `${value} @` : "@");
  };

  return (
    <div className="flex flex-col bg-background relative z-10 w-full shrink-0">
      {/* Reply preview */}
      {replyingTo && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border/30 animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="flex flex-col text-sm border-l-4 border-primary pl-3">
            <span className="font-semibold text-primary text-xs">
              Replying to message
            </span>
            <span className="text-muted-foreground truncate max-w-[240px] text-xs mt-0.5">
              {replyingTo.content}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-full hover:bg-muted-foreground/20"
            onClick={() => setReplyingTo(null)}
          >
            <X className="size-4 text-muted-foreground" />
          </Button>
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
            onClick={() => setImagePreview(null)}
            className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-0.5 shadow hover:bg-muted/70 transition-colors"
          >
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2.5 p-3 min-h-[64px]">
        {/* Attach */}
        <Button
          variant="ghost"
          size="icon"
          className="mb-0.5 flex-shrink-0 rounded-xl border border-transparent hover:border-border/60 hover:bg-primary/10"
          onClick={() => fileInputRef.current?.click()}
          title="Send image"
        >
          <ImagePlus className="size-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Textarea */}
        <div className="flex-1 relative">
          {showActionChips && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => injectTemplate("mention")}
                className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/85 transition-colors hover:bg-muted/75"
              >
                @ Mention
              </button>
              <button
                type="button"
                onClick={() => injectTemplate("code")}
                className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/85 transition-colors hover:bg-muted/75"
              >
                Code
              </button>
              <button
                type="button"
                onClick={() => injectTemplate("spoiler")}
                className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/85 transition-colors hover:bg-muted/75"
              >
                Spoiler
              </button>
              <span
                className={cn(
                  "ml-auto text-[10px] tabular-nums",
                  charsLeft < 120
                    ? "text-amber-500"
                    : "text-muted-foreground/80",
                )}
              >
                {charsLeft}
              </span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Type a message... (Shift+Enter for a new line)"
            className={cn(
              "w-full resize-none overflow-hidden rounded-2xl bg-muted/30 border-0",
              "px-4 py-3 pr-12 text-[14.5px] leading-relaxed text-foreground",
              "focus:outline-none focus:ring-0 focus:bg-muted/50",
              "transition-all duration-200 max-h-[140px]",
              "placeholder:text-muted-foreground/60",
            )}
          />
          <div className="absolute right-2 bottom-1.5 flex items-center">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8 rounded-xl hover:bg-primary/10"
            >
              <div>
                <EmojiPicker
                  onChange={(emoji: string) => setValue(`${value}${emoji}`)}
                />
              </div>
            </Button>
          </div>
        </div>

        {/* Send */}
        <Button
          onClick={sendMessage}
          size="icon"
          disabled={!hasSendable}
          className={cn(
            "flex-shrink-0 mb-0.5 rounded-xl transition-all duration-300",
            hasSendable
              ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:scale-105 active:scale-95"
              : "bg-transparent text-muted-foreground opacity-50",
          )}
          title="Send (Enter)"
        >
          <Send className="size-4 text-white" />
        </Button>
      </div>
    </div>
  );
};

export default MessageInput;
