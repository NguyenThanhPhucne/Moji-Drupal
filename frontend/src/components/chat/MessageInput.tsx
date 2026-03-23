import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation } from "@/types/chat";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { ImagePlus, Send, X } from "lucide-react";
import EmojiPicker from "./EmojiPicker";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE_MB = 5;

const MessageInput = ({ selectedConvo }: { selectedConvo: Conversation }) => {
  const { user } = useAuthStore();
  const { sendDirectMessage, sendGroupMessage, replyingTo, setReplyingTo } =
    useChatStore();
  const { socket } = useSocketStore();
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);

  if (!user) return null;

  const stopTyping = () => {
    if (typing && socket?.connected) {
      socket.emit("stop_typing", selectedConvo._id);
      setTyping(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Auto-resize textarea
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }

    if (socket?.connected && !typing) {
      setTyping(true);
      socket.emit("typing", selectedConvo._id);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 2000);
  };

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
          (p) => p._id !== user._id,
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

  return (
    <div className="flex flex-col bg-background/95 border-t border-border/50 backdrop-blur-sm">
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
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for a new line)"
            className={cn(
              "w-full resize-none overflow-hidden rounded-2xl bg-card/80 border border-border/60 shadow-sm",
              "px-4 py-2.5 pr-12 text-sm leading-relaxed",
              "focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30",
              "transition-all duration-150 max-h-[120px]",
              "placeholder:text-muted-foreground",
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
            "flex-shrink-0 mb-0.5 transition-all duration-200",
            hasSendable
              ? "bg-gradient-chat shadow-md hover:shadow-glow hover:scale-105"
              : "bg-muted text-muted-foreground",
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
