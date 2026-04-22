import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { MessageSquareText, Send, X, Mic } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Conversation, Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import VoiceMessagePlayer from "./VoiceMessagePlayer";

const THREAD_PAGE_LIMIT_FALLBACK = 50;
const THREAD_SKELETON_KEYS = [
  "thread-skeleton-a",
  "thread-skeleton-b",
  "thread-skeleton-c",
  "thread-skeleton-d",
];

const toMessageDateLabel = (value?: string) => {
  if (!value) return "";
  try {
    const date = new Date(value);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
};

// Simple avatar fallback circle with initials
const AvatarFallback = ({ name, size = 7 }: { name?: string; size?: number }) => {
  const initials = String(name || "?")
    .split(" ")
    .map((part) => part[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        `size-${size} flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold`,
        `text-[${size > 6 ? "11" : "9"}px]`,
      )}
    >
      {initials}
    </div>
  );
};

interface ThreadPanelProps {
  selectedConvo: Conversation | null;
}

const ThreadPanel = ({ selectedConvo }: ThreadPanelProps) => {
  const { user } = useAuthStore();
  const {
    messages,
    activeThreadRootId,
    setActiveThreadRootId,
    sendDirectMessage,
    sendGroupMessage,
  } = useChatStore();

  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadCursor, setThreadCursor] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConversationId = String(selectedConvo?._id || "").trim();
  const rootMessageId = String(activeThreadRootId || "").trim();
  const activeConversationMessages = messages[activeConversationId]?.items || [];

  const rootMessage = useMemo(() => {
    if (!rootMessageId) return null;
    return (
      activeConversationMessages.find(
        (messageItem) => String(messageItem._id) === rootMessageId,
      ) || null
    );
  }, [activeConversationMessages, rootMessageId]);

  const mergedThreadMessages = useMemo(() => {
    const localThreadCandidates = activeConversationMessages.filter((messageItem) => {
      return (
        String(messageItem._id) === rootMessageId ||
        String(messageItem.threadRootId || "") === rootMessageId
      );
    });

    const mergedById = new Map<string, Message>();
    [...localThreadCandidates, ...threadMessages].forEach((messageItem) => {
      mergedById.set(String(messageItem._id), messageItem);
    });

    return [...mergedById.values()].sort(
      (leftMessage, rightMessage) =>
        new Date(leftMessage.createdAt).getTime() -
        new Date(rightMessage.createdAt).getTime(),
    );
  }, [activeConversationMessages, rootMessageId, threadMessages]);

  const replyCount = mergedThreadMessages.filter(
    (m) => String(m._id) !== rootMessageId,
  ).length;

  const loadThread = useCallback(async (cursor?: string, append = false) => {
    if (!rootMessageId) return;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingThread(true);
    }

    try {
      const result = await chatService.fetchMessageThread(rootMessageId, cursor);
      const fetchedItems = Array.isArray(result.messages) ? result.messages : [];

      setThreadMessages((currentItems) => {
        if (!append) return fetchedItems;

        const mergedById = new Map<string, Message>();
        [...currentItems, ...fetchedItems].forEach((messageItem) => {
          mergedById.set(String(messageItem._id), messageItem);
        });

        return [...mergedById.values()].sort(
          (leftMessage, rightMessage) =>
            new Date(leftMessage.createdAt).getTime() -
            new Date(rightMessage.createdAt).getTime(),
        );
      });

      setThreadCursor(result.cursor || null);
    } finally {
      setLoadingThread(false);
      setLoadingMore(false);
    }
  }, [rootMessageId]);

  useEffect(() => {
    if (!rootMessageId || !activeConversationId) {
      setThreadMessages([]);
      setThreadCursor(null);
      setComposerValue("");
      return;
    }

    void loadThread(undefined, false);
  }, [rootMessageId, activeConversationId, loadThread]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mergedThreadMessages.length]);

  const handleClose = () => {
    setActiveThreadRootId(null);
    setComposerValue("");
  };

  const handleSendThreadReply = useCallback(async () => {
    const normalizedContent = String(composerValue || "").trim();
    if (!normalizedContent || !selectedConvo || !rootMessageId || sending) return;

    setSending(true);
    try {
      if (selectedConvo.type === "direct") {
        const recipient = selectedConvo.participants.find(
          (participant) => String(participant._id) !== String(user?._id || ""),
        );
        if (!recipient?._id) return;

        await sendDirectMessage(
          String(recipient._id),
          normalizedContent,
          undefined,
          undefined,
          selectedConvo._id,
          rootMessageId,
          rootMessageId,
        );
      } else {
        await sendGroupMessage(
          selectedConvo._id,
          normalizedContent,
          undefined,
          undefined,
          rootMessageId,
          selectedConvo.group?.activeChannelId,
          rootMessageId,
        );
      }

      setComposerValue("");
      textareaRef.current?.focus();
    } finally {
      setSending(false);
    }
  }, [composerValue, selectedConvo, rootMessageId, sending, user, sendDirectMessage, sendGroupMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSendThreadReply();
      }
    },
    [handleSendThreadReply],
  );

  return (
    <Sheet open={Boolean(rootMessageId)} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        className="w-[min(92vw,400px)] border-l border-border/70 bg-background p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="flex-none border-b border-border/60 px-4 py-3 bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <MessageSquareText className="size-3.5" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-sm font-semibold leading-tight">
                  Thread
                </SheetTitle>
                <SheetDescription className="text-[11px] leading-none mt-0.5 text-muted-foreground">
                  {replyCount > 0
                    ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
                    : "No replies yet"}
                </SheetDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close thread panel"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border/65 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </SheetHeader>

        {/* Root message preview */}
        {rootMessage && (
          <div className="flex-none border-b border-border/50 bg-muted/15 px-4 py-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
              Original message
            </p>
            {rootMessage.audioUrl && !rootMessage.isDeleted ? (
              <VoiceMessagePlayer src={rootMessage.audioUrl} />
            ) : (
              <p className="text-sm leading-relaxed text-foreground line-clamp-3">
                {rootMessage.isDeleted
                  ? "This message was removed"
                  : rootMessage.content?.trim() || "Media message"}
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {toMessageDateLabel(rootMessage.createdAt)}
            </p>
          </div>
        )}

        {/* Messages list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-0.5">
          {loadingThread ? (
            <div className="space-y-2.5">
              {THREAD_SKELETON_KEYS.map((skeletonKey) => (
                <div
                  key={skeletonKey}
                  className="h-14 animate-pulse rounded-xl border border-border/40 bg-muted/25"
                />
              ))}
            </div>
          ) : (
            <>
              {threadCursor && (
                <div className="flex justify-center pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!loadingMore) void loadThread(threadCursor, true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    {loadingMore ? "Loading..." : "Load older replies"}
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {mergedThreadMessages.map((messageItem) => {
                  const isOwn = String(messageItem.senderId) === String(user?._id || "");
                  const isRoot = String(messageItem._id) === rootMessageId;
                  const senderName =
                    selectedConvo?.participants?.find(
                      (p) => String(p._id) === String(messageItem.senderId),
                    )?.displayName || "Unknown";

                  return (
                    <div
                      key={messageItem._id}
                      className={cn(
                        "flex gap-2.5 group",
                        isOwn ? "flex-row-reverse" : "flex-row",
                        isRoot && "pb-2 border-b border-dashed border-border/40",
                      )}
                    >
                      {/* Avatar */}
                      {!isOwn && (
                        <AvatarFallback name={senderName} size={7} />
                      )}

                      {/* Bubble */}
                      <div
                        className={cn(
                          "flex flex-col max-w-[80%]",
                          isOwn ? "items-end" : "items-start",
                        )}
                      >
                        {/* Sender name + time */}
                        {!isOwn && (
                          <div className="flex items-baseline gap-1.5 mb-0.5 px-1">
                            <span className="text-[11px] font-semibold text-foreground/80">
                              {senderName}
                            </span>
                            {isRoot && (
                              <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                Original
                              </span>
                            )}
                          </div>
                        )}

                        {/* Message content */}
                        <div
                          className={cn(
                            "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                            isOwn
                              ? "bg-primary text-primary-foreground rounded-tr-[4px]"
                              : "bg-muted/60 border border-border/50 text-foreground rounded-tl-[4px]",
                            isRoot && !isOwn && "border-primary/30 bg-primary/[0.06]",
                          )}
                        >
                          {messageItem.audioUrl && !messageItem.isDeleted ? (
                            <VoiceMessagePlayer
                              src={messageItem.audioUrl}
                              isOwn={isOwn}
                            />
                          ) : (
                            <p>
                              {messageItem.isDeleted
                                ? "This message was removed"
                                : messageItem.content?.trim() || "Media message"}
                            </p>
                          )}
                        </div>

                        {/* Timestamp */}
                        <p className="mt-0.5 px-1 text-[10px] text-muted-foreground/70">
                          {toMessageDateLabel(messageItem.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Composer */}
        <div className="flex-none border-t border-border/60 bg-background px-3 py-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-2xl border border-border/70 bg-muted/20 transition-colors focus-within:border-primary/60 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/20">
              <textarea
                ref={textareaRef}
                id="thread-reply-input"
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Reply in thread… (Enter to send)"
                rows={2}
                className="w-full resize-none bg-transparent px-3 pt-2.5 pb-2 text-sm outline-none placeholder:text-muted-foreground/60"
              />
              <div className="flex items-center justify-between px-2 pb-1.5">
                <div className="flex items-center gap-1">
                  <div className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/60 transition-colors">
                    <Mic className="size-3.5" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/50">
                  Shift+Enter for new line
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { void handleSendThreadReply(); }}
              disabled={sending || !String(composerValue || "").trim()}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 shadow-sm"
              aria-label="Send thread reply"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ThreadPanel;
