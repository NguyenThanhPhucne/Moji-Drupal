import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ArrowDown,
  Loader2,
  MessageSquareText,
  MessageSquareDashed,
  Send,
  X,
  Mic,
  MicOff,
  Square,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { AudioMeta, Conversation, Message } from "@/types/chat";
import { cn } from "@/lib/utils";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import UserAvatar from "./UserAvatar";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  addVoiceMemoOutboxItem,
  buildVoiceMemoOutboxId,
  type VoiceMemoOutboxItem,
} from "@/lib/voiceMemoOutbox";
import {
  flushVoiceMemoOutbox,
  VOICE_MEMO_OUTBOX_TOAST_ID,
} from "@/lib/voiceMemoDelivery";

const MAX_THREAD_RECORDING_SECONDS = 180;
const THREAD_MEMO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
const MAX_VOICE_MEMO_UPLOAD_MB = 8;
const resolveThreadMime = () => {
  if (typeof MediaRecorder === "undefined") return "";
  return THREAD_MEMO_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
};
const fmtSeconds = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const estimateAudioDataUrlBytes = (audioDataUrl: string) => {
  const payload = String(audioDataUrl || "").split(",")[1] || "";
  const normalizedPayload = payload.replaceAll(/\s+/g, "");
  if (!normalizedPayload) {
    return 0;
  }
  return Math.floor((normalizedPayload.length * 3) / 4);
};



const THREAD_SKELETON_KEYS = [
  "thread-skeleton-a",
  "thread-skeleton-b",
  "thread-skeleton-c",
  "thread-skeleton-d",
];

const queueThreadVoiceMemoForDelivery = async ({
  user,
  selectedConvo,
  rootMessageId,
  content,
  audioDataUrl,
  audioMeta,
  replyPreview,
  addMessage,
  removeMessageFromConversation,
}: {
  user: any;
  selectedConvo: Conversation;
  rootMessageId: string;
  content: string;
  audioDataUrl: string;
  audioMeta: AudioMeta | null;
  replyPreview?: Message["replyTo"] | null;
  addMessage: (message: Message) => void;
  removeMessageFromConversation: (conversationId: string, messageId: string) => void;
}): Promise<void> => {
  const normalizedUserId = String(user?._id || "").trim();
  const normalizedConversationId = String(selectedConvo._id || "").trim();

  if (!normalizedUserId || !normalizedConversationId) {
    throw new Error("Unable to queue voice memo while offline");
  }

  const outboxId = buildVoiceMemoOutboxId();
  const queuedAt = new Date().toISOString();
  const isOnlineNow = typeof navigator !== "undefined" && navigator.onLine !== false;
  const activeGroupChannelId =
    selectedConvo.type === "group"
      ? String(
          selectedConvo.group?.activeChannelId ||
            selectedConvo.group?.channels?.[0]?.channelId ||
            "general",
        )
      : null;

  const optimisticMessage: Message = {
    _id: outboxId,
    conversationId: normalizedConversationId,
    groupChannelId: activeGroupChannelId || undefined,
    senderId: normalizedUserId,
    content: content ?? "",
    audioUrl: audioDataUrl,
    audioMeta: audioMeta ?? null,
    replyTo: replyPreview ?? null,
    threadRootId: rootMessageId,
    reactions: [],
    isDeleted: false,
    editedAt: null,
    readBy: [],
    hiddenFor: [],
    createdAt: queuedAt,
    updatedAt: queuedAt,
    isOwn: true,
    deliveryState: isOnlineNow ? "uploading" : "queued",
    deliveryError: null,
    deliveryAttemptCount: 0,
  };

  addMessage(optimisticMessage);

  const baseOutboxItem: VoiceMemoOutboxItem = {
    id: outboxId,
    userId: normalizedUserId,
    scope: selectedConvo.type === "direct" ? "direct" : "group",
    conversationId: normalizedConversationId,
    content,
    audioDataUrl,
    audioDurationSeconds: audioMeta?.durationSeconds ?? null,
    audioMimeType: audioMeta?.mimeType ?? null,
    audioSizeBytes: audioMeta?.sizeBytes ?? null,
    replyToId: replyPreview?._id || undefined,
    threadRootId: rootMessageId,
    queuedAt,
    attemptCount: 0,
    lastError: null,
  };

  try {
    if (selectedConvo.type === "direct") {
      const currentUserId = String(user?._id || "");
      const otherUser = selectedConvo.participants.find(
        (p) => String(p._id) !== currentUserId,
      );
      if (!otherUser?._id) {
        throw new Error("DIRECT_RECIPIENT_NOT_FOUND");
      }

      await addVoiceMemoOutboxItem({
        ...baseOutboxItem,
        recipientId: String(otherUser._id),
      });
    } else {
      await addVoiceMemoOutboxItem({
        ...baseOutboxItem,
        groupChannelId: activeGroupChannelId || undefined,
      });
    }
  } catch (error) {
    removeMessageFromConversation(normalizedConversationId, outboxId);
    throw error;
  }

  if (isOnlineNow) {
    void flushVoiceMemoOutbox({ silent: true });
  } else {
    toast.info("Voice memo queued. It will send when you are back online.", {
      id: VOICE_MEMO_OUTBOX_TOAST_ID,
    });
  }
};

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

const buildThreadReplyPreview = (
  rootMessage: Message | null,
  rootMessageId: string,
) => {
  if (rootMessage) {
    return {
      _id: String(rootMessage._id || rootMessageId),
      content: String(rootMessage.content || ""),
      senderId: String(rootMessage.senderId || ""),
    };
  }

  return {
    _id: rootMessageId,
    content: "",
    senderId: "",
  };
};



interface ThreadPanelProps {
  selectedConvo: Conversation | null;
}

const ThreadPanel = ({ selectedConvo }: ThreadPanelProps) => {
  const { user } = useAuthStore();
  const { t } = useI18n();
  const {
    messages,
    activeThreadRootId,
    setActiveThreadRootId,
    sendDirectMessage,
    sendGroupMessage,
    addMessage,
    removeMessageFromConversation,
    applyThreadReplyStats,
    threadReplyCounts,
    threadUnreadCounts,
  } = useChatStore();

  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadCursor, setThreadCursor] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestThreadRequestIdRef = useRef(0);
  const shouldStickToBottomRef = useRef(true);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // ── Voice recording state ──────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [audioMeta, setAudioMeta] = useState<AudioMeta | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recSecsRef = useRef(0);
  const recMimeRef = useRef("");
  const recCanceledRef = useRef(false);
  const recUnmountRef = useRef(false);

  useEffect(() => {
    recUnmountRef.current = false;
    return () => {
      recUnmountRef.current = true;
      // Cleanup on unmount: stop recording and release stream
      if (recorderRef.current?.state === "recording" || recorderRef.current?.state === "paused") {
        recCanceledRef.current = true;
        recorderRef.current.stop();
      }
      if (recStreamRef.current) {
        recStreamRef.current.getTracks().forEach((t) => t.stop());
        recStreamRef.current = null;
      }
      if (recTimerRef.current) {
        clearInterval(recTimerRef.current);
        recTimerRef.current = null;
      }
      recorderRef.current = null;
    };
  }, []);

  const clearRecTimer = useCallback(() => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    if (recStreamRef.current) {
      recStreamRef.current.getTracks().forEach((t) => t.stop());
      recStreamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    const mime = resolveThreadMime();
    if (!mime) {
      toast.error("Voice recording not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      recMimeRef.current = mime;
      recCanceledRef.current = false;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      recorder.onerror = () => {
        clearRecTimer();
        setIsRecording(false);
        setRecordingSecs(0);
        recSecsRef.current = 0;
        releaseStream();
        if (!recUnmountRef.current) {
          toast.error("Recording failed.");
        }
      };
      
      recorder.onstop = () => {
        const canceled = recCanceledRef.current;
        const mimeType = recorder.mimeType || recMimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const dur = Math.max(1, Math.round(recSecsRef.current));
        clearRecTimer();
        setIsRecording(false);
        setRecordingSecs(0);
        recSecsRef.current = 0;
        releaseStream();
        if (recUnmountRef.current || canceled || !blob.size) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          if (recUnmountRef.current) return;
          setAudioPreview(reader.result as string);
          setAudioMeta({
            durationSeconds: dur,
            mimeType,
            sizeBytes: blob.size,
          });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSecs(0);
      recSecsRef.current = 0;
      clearRecTimer();
      recTimerRef.current = setInterval(() => {
        const next = recSecsRef.current + 1;
        recSecsRef.current = Math.min(next, MAX_THREAD_RECORDING_SECONDS);
        setRecordingSecs(recSecsRef.current);
        if (next >= MAX_THREAD_RECORDING_SECONDS) {
          clearRecTimer();
          recorder.stop();
        }
      }, 1000);
    } catch (err) {
      console.error("Unable to access microphone", err);
      releaseStream();
      if (!recUnmountRef.current) {
        toast.error("Microphone access denied.");
      }
    }
  }, [isRecording, clearRecTimer, releaseStream]);

  const stopRecording = useCallback(() => {
    recCanceledRef.current = false;
    if (recorderRef.current?.state === "recording" || recorderRef.current?.state === "paused") {
      recorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    recCanceledRef.current = true;
    clearRecTimer();
    setIsRecording(false);
    setRecordingSecs(0);
    recSecsRef.current = 0;
    if (recorderRef.current?.state === "recording" || recorderRef.current?.state === "paused") {
      recorderRef.current.stop();
    } else {
      // If not recording, just release the stream immediately
      releaseStream();
    }
    setAudioPreview(null);
    setAudioMeta(null);
  }, [clearRecTimer, releaseStream]);

  const restoreThreadComposerAfterSendFailure = useCallback(
    (failedContent: string, failedAudioPreview: string | null, failedAudioMeta: AudioMeta | null) => {
      setComposerValue(failedContent);
      setAudioPreview(failedAudioPreview);
      setAudioMeta(failedAudioPreview ? failedAudioMeta : null);

      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    [],
  );

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

  const threadReplyMessages = useMemo(
    () =>
      mergedThreadMessages.filter(
        (messageItem) => String(messageItem._id) !== rootMessageId,
      ),
    [mergedThreadMessages, rootMessageId],
  );

  const loadedReplyCount = threadReplyMessages.length;
  const threadStatsKey =
    activeConversationId && rootMessageId
      ? `${activeConversationId}:${rootMessageId}`
      : "";
  const replyCount =
    threadStatsKey && threadStatsKey in threadReplyCounts
      ? Number(threadReplyCounts[threadStatsKey] || 0)
      : loadedReplyCount;
  const threadUnreadCount =
    threadStatsKey && threadStatsKey in threadUnreadCounts
      ? Number(threadUnreadCounts[threadStatsKey] || 0)
      : 0;

  const replyCountLabel = (() => {
    if (replyCount <= 0) {
      return t("thread.no_replies_yet");
    }

    const label = replyCount === 1 ? t("thread.reply") : t("thread.replies");
    return `${replyCount} ${label}`;
  })();

  const updateScrollPosition = useCallback(() => {
    const scrollElement = scrollContainerRef.current;
    if (!scrollElement) return;
    const distanceFromBottom =
      scrollElement.scrollHeight -
      scrollElement.scrollTop -
      scrollElement.clientHeight;
    setIsNearBottom(distanceFromBottom < 72);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const reduceMotion =
      globalThis.window?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
    messagesEndRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : behavior,
    });
    shouldStickToBottomRef.current = true;
    setIsNearBottom(true);
  }, []);

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

      if (activeConversationId && !append) {
        applyThreadReplyStats(activeConversationId, {
          threadRootId: resolvedThreadRootId || rootMessageId,
          replyCount: result.replyCount,
        });
      }
    } catch (error) {
      console.error("Failed to load thread messages", error);
    } finally {
      if (requestId === latestThreadRequestIdRef.current) {
        setLoadingThread(false);
        setLoadingMore(false);
      }
    }
  }, [
    activeConversationId,
    applyThreadReplyStats,
    rootMessageId,
    setActiveThreadRootId,
  ]);

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

  useEffect(() => {
    if (!rootMessageId) return;
    const focusTimer = globalThis.window?.setTimeout(() => {
      textareaRef.current?.focus();
    }, 140);
    return () => {
      if (typeof focusTimer === "number") {
        globalThis.window?.clearTimeout(focusTimer);
      }
    };
  }, [rootMessageId]);

  // Auto-scroll to bottom when new replies arrive (if user is already near bottom)
  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      shouldStickToBottomRef.current = true;
      return;
    }
    if (!isNearBottom) return;

    const reduceMotion =
      globalThis.window?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
    messagesEndRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [threadReplyMessages.length, isNearBottom]);

  useEffect(() => {
    if (loadingThread || !rootMessageId) return;
    const frameId = globalThis.window?.requestAnimationFrame(() => {
      updateScrollPosition();
      if (shouldStickToBottomRef.current) {
        scrollToBottom("auto");
      }
    });
    return () => {
      if (typeof frameId === "number") {
        globalThis.window?.cancelAnimationFrame(frameId);
      }
    };
  }, [
    loadingThread,
    rootMessageId,
    threadReplyMessages.length,
    updateScrollPosition,
    scrollToBottom,
  ]);

  const handleClose = () => {
    if (isRecording) {
      cancelRecording();
    }
    setActiveThreadRootId(null);
    setComposerValue("");
    setAudioPreview(null);
    setAudioMeta(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleSendThreadReply = useCallback(async () => {
    const normalizedContent = String(composerValue || "").trim();
    const hasAudio = Boolean(audioPreview);
    if ((!normalizedContent && !hasAudio) || !selectedConvo || !rootMessageId || sending) return;

    setSending(true);
    const capturedAudio = audioPreview;
    const capturedMeta = audioMeta;
    setComposerValue("");
    setAudioPreview(null);
    setAudioMeta(null);

    try {
      const resolvedAudioUrl = capturedAudio || undefined;
      const resolvedAudioMeta = capturedMeta;

      if (capturedAudio?.startsWith("data:audio/")) {
        // Pre-validate audio size before queueing
        const audioBytes = estimateAudioDataUrlBytes(capturedAudio);
        if (audioBytes > MAX_VOICE_MEMO_UPLOAD_MB * 1024 * 1024) {
          throw new Error(`Voice memo exceeds ${MAX_VOICE_MEMO_UPLOAD_MB}MB limit`);
        }

        const replyPreview = buildThreadReplyPreview(
          rootMessage,
          rootMessageId,
        );

        await queueThreadVoiceMemoForDelivery({
          user,
          selectedConvo,
          rootMessageId,
          content: normalizedContent,
          audioDataUrl: capturedAudio,
          audioMeta: capturedMeta,
          replyPreview,
          addMessage,
          removeMessageFromConversation,
        });
        textareaRef.current?.focus();
        return;
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
    } catch (error) {
      restoreThreadComposerAfterSendFailure(normalizedContent, capturedAudio, capturedMeta);
      
      if (error instanceof Error && /exceeds.*MB/i.test(error.message)) {
        toast.error(error.message);
      } else {
        toast.error("Failed to send reply.");
      }
    } finally {
      setSending(false);
    }
  }, [composerValue, audioPreview, audioMeta, selectedConvo, rootMessageId, sending, user, sendDirectMessage, sendGroupMessage, rootMessage, addMessage, removeMessageFromConversation]);

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
        className="thread-panel-sheet p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="thread-panel-header flex-none px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary shadow-sm">
                <MessageSquareText className="size-3.5" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-sm font-semibold leading-tight">
                  Thread
                </SheetTitle>
                <SheetDescription className="text-[11px] leading-none mt-0.5 text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <span>{replyCountLabel}</span>
                  {threadUnreadCount > 0 && (
                    <span className="thread-panel-unread-pill">
                      {threadUnreadCount > 99 ? "99+" : threadUnreadCount} new
                    </span>
                  )}
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
          <div className="thread-panel-root flex-none px-4 py-3">
            <p className="thread-panel-root-label mb-1.5">Original message</p>
            {rootMessage.audioUrl && !rootMessage.isDeleted ? (
              <VoiceMessagePlayer
                src={rootMessage.audioUrl}
                initialDurationSeconds={rootMessage.audioMeta?.durationSeconds ?? null}
                audioSizeBytes={rootMessage.audioMeta?.sizeBytes ?? null}
              />
            ) : (
              <p className="text-sm leading-relaxed text-foreground line-clamp-4">
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
        <div className="relative flex-1 min-h-0 flex flex-col">
          {!isNearBottom && threadReplyMessages.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToBottom()}
              className="thread-panel-jump-latest"
              aria-label="Jump to latest replies"
            >
              <ArrowDown className="size-3.5" />
              Latest
            </button>
          )}

        <div
          ref={scrollContainerRef}
          onScroll={updateScrollPosition}
          className="thread-panel-scroll px-3 py-3 space-y-0.5"
        >
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
                    disabled={loadingMore}
                    onClick={() => {
                      if (!loadingMore) void loadThread(threadCursor, true);
                    }}
                    className="thread-panel-load-more"
                  >
                    {loadingMore && (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    )}
                    {loadingMore ? "Loading…" : "Load older replies"}
                  </button>
                </div>
              )}

              {(replyCount > 0 || threadReplyMessages.length > 0) && (
                <div className="thread-panel-replies-divider">
                  <span>
                    {replyCount} {replyCount === 1 ? "reply" : "replies"}
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                {threadReplyMessages.map((messageItem) => {
                  const isOwn = String(messageItem.senderId) === String(user?._id || "");
                  const senderName =
                    selectedConvo?.participants?.find(
                      (p) => String(p._id) === String(messageItem.senderId),
                    )?.displayName || "Unknown";

                  return (
                    <div
                      key={messageItem._id}
                      className={cn(
                        "thread-panel-reply-row flex gap-2.5",
                        isOwn ? "flex-row-reverse" : "flex-row",
                      )}
                    >
                      {!isOwn && (
                        <UserAvatar
                          type="chat"
                          name={senderName}
                          avatarUrl={selectedConvo?.participants?.find((p) => String(p._id) === String(messageItem.senderId))?.avatarUrl ?? undefined}
                        />
                      )}

                      <div
                        className={cn(
                          "flex flex-col max-w-[82%]",
                          isOwn ? "items-end" : "items-start",
                        )}
                      >
                        {!isOwn && (
                          <span className="mb-0.5 px-1 text-[11px] font-semibold text-foreground/80">
                            {senderName}
                          </span>
                        )}

                        <div
                          className={cn(
                            "chat-message-bubble-shell text-[13.5px] leading-relaxed relative",
                            isOwn
                              ? "chat-bubble-sent chat-message-bubble-shell--own"
                              : "chat-bubble-received chat-message-bubble-shell--peer",
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
                                audioSizeBytes={messageItem.audioMeta?.sizeBytes ?? null}
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

          {!loadingThread &&
            replyCount === 0 &&
            threadReplyMessages.length === 0 && (
            <div className="thread-panel-empty animate-in fade-in slide-in-from-bottom-2 duration-400">
              <span className="thread-panel-empty-icon">
                <MessageSquareDashed className="size-5" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground/80 leading-snug">
                  No replies yet
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground/60 leading-relaxed max-w-[14rem] mx-auto">
                  Start the conversation — your reply appears here.
                </p>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Composer */}
        <div className="thread-panel-composer flex-none px-3 pt-3 space-y-2">
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
              <span className="text-sm font-bold text-destructive/80 flex-1 animate-pulse">Recording {fmtSeconds(recordingSecs)}</span>
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
              {sending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ThreadPanel;
