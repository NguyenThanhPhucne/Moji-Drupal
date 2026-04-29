import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { MessageSquareText, MessageSquareDashed, Send, X, Mic, MicOff, Square } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { AudioMeta, Conversation, Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import UserAvatar from "./UserAvatar";
import { toast } from "sonner";

const MAX_THREAD_RECORDING_SECONDS = 180;
const THREAD_MEMO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
const resolveThreadMime = () => {
  if (typeof MediaRecorder === "undefined") return "";
  return THREAD_MEMO_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
};
const fmtSeconds = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;



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
  const latestThreadRequestIdRef = useRef(0);
  const shouldStickToBottomRef = useRef(true);

  // ── Voice recording state ──────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [audioMeta, setAudioMeta] = useState<AudioMeta | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recSecsRef = useRef(0);
  const recMimeRef = useRef("");
  const recCanceledRef = useRef(false);
  const recUnmountRef = useRef(false);

  useEffect(() => { recUnmountRef.current = false; return () => { recUnmountRef.current = true; }; }, []);

  const clearRecTimer = useCallback(() => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
  }, []);

  const releaseStream = useCallback(() => {
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    const mime = resolveThreadMime();
    if (!mime) { toast.error("Voice recording not supported by this browser."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      recMimeRef.current = mime;
      recCanceledRef.current = false;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onerror = () => {
        clearRecTimer(); setIsRecording(false); setRecordingSecs(0);
        stream.getTracks().forEach((t) => t.stop()); releaseStream();
        if (!recUnmountRef.current) toast.error("Recording failed.");
      };
      recorder.onstop = () => {
        const canceled = recCanceledRef.current;
        const mimeType = recorder.mimeType || recMimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const dur = Math.max(1, Math.round(recSecsRef.current));
        clearRecTimer(); setIsRecording(false); setRecordingSecs(0); recSecsRef.current = 0;
        stream.getTracks().forEach((t) => t.stop()); releaseStream();
        if (recUnmountRef.current || canceled || !blob.size) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          if (recUnmountRef.current) return;
          setAudioPreview(reader.result as string);
          setAudioMeta({ durationSeconds: dur, mimeType, sizeBytes: blob.size });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      setIsRecording(true); setRecordingSecs(0); recSecsRef.current = 0;
      clearRecTimer();
      recTimerRef.current = setInterval(() => {
        const next = recSecsRef.current + 1;
        recSecsRef.current = Math.min(next, MAX_THREAD_RECORDING_SECONDS);
        setRecordingSecs(recSecsRef.current);
        if (next >= MAX_THREAD_RECORDING_SECONDS) { clearRecTimer(); recorder.stop(); }
      }, 1000);
    } catch {
      toast.error("Microphone access denied.");
    }
  }, [isRecording, clearRecTimer, releaseStream]);

  const stopRecording = useCallback(() => {
    recCanceledRef.current = false;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancelRecording = useCallback(() => {
    recCanceledRef.current = true;
    clearRecTimer(); setIsRecording(false); setRecordingSecs(0); recSecsRef.current = 0;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setAudioPreview(null); setAudioMeta(null);
  }, [clearRecTimer]);

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
  const replyCountLabel = (() => {
    if (replyCount <= 0) {
      return "No replies yet";
    }

    return `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`;
  })();

  const loadThread = useCallback(async (cursor?: string, append = false) => {
    if (!rootMessageId) return;
    if (append && !cursor) return;

    const requestId = latestThreadRequestIdRef.current + 1;
    latestThreadRequestIdRef.current = requestId;
    shouldStickToBottomRef.current = !append;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingThread(true);
    }

    try {
      const result = await chatService.fetchMessageThread(rootMessageId, cursor);
      if (requestId !== latestThreadRequestIdRef.current) {
        return;
      }

      const resolvedThreadRootId = String(result.threadRootId || "").trim();
      if (
        resolvedThreadRootId &&
        resolvedThreadRootId !== rootMessageId
      ) {
        setActiveThreadRootId(resolvedThreadRootId);
      }

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
    } catch (error) {
      console.error("Failed to load thread messages", error);
    } finally {
      if (requestId === latestThreadRequestIdRef.current) {
        setLoadingThread(false);
        setLoadingMore(false);
      }
    }
  }, [rootMessageId, setActiveThreadRootId]);

  useEffect(() => {
    if (!rootMessageId || !activeConversationId) {
      latestThreadRequestIdRef.current += 1;
      setThreadMessages([]);
      setThreadCursor(null);
      setComposerValue("");
      return;
    }

    void loadThread(undefined, false);
  }, [rootMessageId, activeConversationId, loadThread]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      shouldStickToBottomRef.current = true;
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mergedThreadMessages.length]);

  const handleClose = () => {
    setActiveThreadRootId(null);
    setComposerValue("");
  };

  const handleSendThreadReply = useCallback(async () => {
    const normalizedContent = String(composerValue || "").trim();
    const hasAudio = Boolean(audioPreview);
    if ((!normalizedContent && !hasAudio) || !selectedConvo || !rootMessageId || sending) return;

    setSending(true);
    const capturedAudio = audioPreview;
    const capturedMeta = audioMeta;
    setComposerValue(""); setAudioPreview(null); setAudioMeta(null);

    try {
      let resolvedAudioUrl: string | undefined;
      let resolvedAudioMeta = capturedMeta;
      if (capturedAudio?.startsWith("data:audio/")) {
        const up = await chatService.uploadAudio(capturedAudio);
        resolvedAudioUrl = up.audioUrl;
        if (up.audioMeta) resolvedAudioMeta = { ...capturedMeta, ...up.audioMeta };
      } else if (capturedAudio) {
        resolvedAudioUrl = capturedAudio;
      }

      if (selectedConvo.type === "direct") {
        const recipient = selectedConvo.participants.find(
          (p) => String(p._id) !== String(user?._id || ""),
        );
        if (!recipient?._id) return;
        await sendDirectMessage(
          String(recipient._id), normalizedContent,
          undefined, resolvedAudioUrl, selectedConvo._id,
          { replyTo: rootMessageId, threadRootId: rootMessageId, audioMeta: resolvedAudioMeta || undefined },
        );
      } else {
        await sendGroupMessage(
          selectedConvo._id, normalizedContent,
          undefined, resolvedAudioUrl,
          { replyTo: rootMessageId, groupChannelId: selectedConvo.group?.activeChannelId, threadRootId: rootMessageId, audioMeta: resolvedAudioMeta || undefined },
        );
      }

      textareaRef.current?.focus();
    } catch {
      setComposerValue(normalizedContent);
      setAudioPreview(capturedAudio); setAudioMeta(capturedMeta);
      toast.error("Failed to send reply.");
    } finally {
      setSending(false);
    }
  }, [composerValue, audioPreview, audioMeta, selectedConvo, rootMessageId, sending, user, sendDirectMessage, sendGroupMessage]);

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
        <SheetHeader className="flex-none border-b border-border/60 px-4 py-3 bg-background/85 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary shadow-sm">
                <MessageSquareText className="size-3.5" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-sm font-semibold leading-tight">
                  Thread
                </SheetTitle>
                <SheetDescription className="text-[11px] leading-none mt-0.5 text-muted-foreground">
                  {replyCountLabel}
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
              <VoiceMessagePlayer
                src={rootMessage.audioUrl}
                initialDurationSeconds={rootMessage.audioMeta?.durationSeconds ?? null}
              />
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
            <div className="space-y-4">
              {THREAD_SKELETON_KEYS.map((skeletonKey, i) => (
                <div key={skeletonKey} className={cn("flex gap-3", i % 2 === 0 ? "flex-row-reverse" : "flex-row")}>
                  <div className="size-8 animate-pulse rounded-full bg-muted/40 shrink-0 chat-thread-skeleton-shimmer" />
                  <div className={cn("flex flex-col gap-1.5", i % 2 === 0 ? "items-end" : "items-start")}>
                    <div className="h-3.5 w-16 animate-pulse rounded-md bg-muted/40 chat-thread-skeleton-shimmer" />
                    <div className="h-10 w-[200px] animate-pulse rounded-2xl bg-muted/25 border border-border/40 chat-thread-skeleton-shimmer" />
                  </div>
                </div>
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

              {/* Replies section header — only shown when there are actual replies */}
              {replyCount > 0 && (
                <div className="flex items-center gap-2 pb-1 pt-0.5">
                  <div className="flex-1 h-px bg-border/25" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/50 px-1 select-none">
                    {replyCount} {replyCount === 1 ? "reply" : "replies"}
                  </span>
                  <div className="flex-1 h-px bg-border/25" />
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
                        <UserAvatar
                          type="chat"
                          name={senderName}
                          avatarUrl={selectedConvo?.participants?.find((p) => String(p._id) === String(messageItem.senderId))?.avatarUrl ?? undefined}
                        />
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

                        <div
                          className={cn(
                            "chat-message-bubble-shell text-[13.5px] leading-relaxed relative",
                            isOwn
                              ? "chat-bubble-sent chat-message-bubble-shell--own"
                              : "chat-bubble-received chat-message-bubble-shell--peer",
                            isRoot && !isOwn && "border-primary/40 bg-primary/[0.04] shadow-sm",
                          )}
                        >
                          <div className={cn("chat-message-bubble-surface relative z-10", isOwn ? "chat-message-bubble-surface--own" : "chat-message-bubble-surface--peer")}>
                            {messageItem.audioUrl && !messageItem.isDeleted ? (
                              <VoiceMessagePlayer
                                src={messageItem.audioUrl}
                                isOwn={isOwn}
                                initialDurationSeconds={
                                  messageItem.audioMeta?.durationSeconds ?? null
                                }
                              />
                            ) : (
                              <p>
                                {messageItem.isDeleted
                                  ? "This message was removed"
                                  : messageItem.content?.trim() || "Media message"}
                              </p>
                            )}
                          </div>
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

          {/* ── Empty state: no replies yet ──────────────────────────────── */}
          {!loadingThread && replyCount === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center animate-in fade-in slide-in-from-bottom-2 duration-400">
              <span className="flex size-11 items-center justify-center rounded-full border border-border/50 bg-muted/30">
                <MessageSquareDashed className="size-5 text-muted-foreground/50" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground/75 leading-snug">
                  No replies yet
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground/55 leading-relaxed">
                  Be the first to reply in this thread.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="flex-none border-t border-border/60 bg-background px-3 py-3 space-y-2">
          {/* Audio preview before send */}
          {audioPreview && !isRecording && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
              <div className="flex-1">
                <VoiceMessagePlayer src={audioPreview} standalone />
              </div>
              <button
                type="button"
                onClick={() => { setAudioPreview(null); setAudioMeta(null); }}
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/80 text-white hover:bg-destructive transition-colors"
                aria-label="Remove voice memo"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 animate-in fade-in duration-150">
              <span className="size-2 rounded-full bg-destructive animate-pulse shrink-0" />
              <span className="text-xs font-medium text-destructive flex-1">Recording {fmtSeconds(recordingSecs)}</span>
              <button type="button" onClick={cancelRecording} aria-label="Cancel recording"
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button type="button" onClick={stopRecording} aria-label="Stop recording"
                className="inline-flex size-7 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors">
                <Square className="size-3" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 clean-composer-shell transition-all">
              <textarea
                ref={textareaRef}
                id="thread-reply-input"
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isRecording ? "Recording…" : "Reply in thread… (Enter to send)"}
                rows={2}
                disabled={isRecording}
                className="w-full resize-none bg-transparent px-3 pt-2.5 pb-2 text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
              />
              <div className="flex items-center justify-between px-2 pb-1.5">
                <div className="flex items-center gap-1">
                  {isRecording ? (
                    <button type="button" onClick={cancelRecording} aria-label="Cancel recording"
                      className="inline-flex size-6 items-center justify-center rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors">
                      <MicOff className="size-3.5" />
                    </button>
                  ) : (
                    <button type="button" onClick={() => { void startRecording(); }} aria-label="Record voice memo"
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full transition-colors",
                        audioPreview
                          ? "text-primary bg-primary/15 hover:bg-primary/25"
                          : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/60"
                      )}>
                      <Mic className="size-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/50">Shift+Enter for new line</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { void handleSendThreadReply(); }}
              disabled={sending || isRecording || (!String(composerValue || "").trim() && !audioPreview)}
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
