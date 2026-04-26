import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import {
  Profiler,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useSocketStore } from "@/stores/useSocketStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { ArrowDown, MessageCircle, Pin, X } from "lucide-react";
import { ForwardMessageModal } from "./ForwardMessageModal";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Message } from "@/types/chat";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ChatWindowSkeleton } from "@/components/skeleton/ChatWindowSkeleton";
import {
  exposeChatThreadBenchApi,
  isChatThreadBenchEnabled,
  pushChatThreadSample,
  startChatThreadBench,
} from "@/lib/chatThreadBenchmark";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

const SEARCH_JUMP_FETCH_MAX_ATTEMPTS = 20;
const SEARCH_JUMP_HIGHLIGHT_MS = 1900;

function isSameDay(a: string, b: string) {
  return (
    format(new Date(a), "yyyy-MM-dd") === format(new Date(b), "yyyy-MM-dd")
  );
}

interface TypingEventPayload {
  conversationId: string;
  userId: string;
  displayName?: string;
}

interface TypingEntry {
  displayName: string;
  expiresAt: number;
}

const pruneExpiredTypingUsers = (
  typingMap: Record<string, TypingEntry>,
  now: number,
) => {
  return Object.fromEntries(
    Object.entries(typingMap).filter(([, entry]) => entry.expiresAt > now),
  );
};

const buildTypingSummary = (names: string[]) => {
  const normalizedNames = names.filter(Boolean);
  if (normalizedNames.length === 0) {
    return "";
  }

  if (normalizedNames.length === 1) {
    return `${normalizedNames[0]} is typing...`;
  }

  if (normalizedNames.length === 2) {
    return `${normalizedNames[0]}, ${normalizedNames[1]} are typing...`;
  }

  const othersCount = normalizedNames.length - 2;
  return `${normalizedNames[0]}, ${normalizedNames[1]} and ${othersCount} others are typing...`;
};

const EMPTY_MESSAGES: Message[] = [];

const ChatWindowBody = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    activeConversationId,
    conversations,
    messages: allMessages,
    messageLoading,
    fetchMessages,
    pinGroupMessage,
    setActiveThreadRootId,
    threadUnreadCounts,
  } = useChatStore();
  const { socket } = useSocketStore();
  const { user: currentUser } = useAuthStore();

  // Track truly new messages — only animate the first render of a brand-new _id
  const lastNewMessageIdRef = useRef<string | null>(null);

  const [typingUsers, setTypingUsers] = useState<Record<string, TypingEntry>>(
    {},
  );
  const [isAtBottom, setIsAtBottom] = useState(true);
  const atBottomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(
    null,
  );
  const searchJumpFetchAttemptRef = useRef<Record<string, number>>({});
  const searchJumpFallbackNotifiedRef = useRef<Record<string, true>>({});
  const highlightResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const messages = useMemo(() => {
    if (!activeConversationId) {
      return EMPTY_MESSAGES;
    }

    return allMessages[activeConversationId]?.items ?? EMPTY_MESSAGES;
  }, [allMessages, activeConversationId]);

  const threadReplyCountByRootId = useMemo(() => {
    const counts: Record<string, number> = {};
    messages.forEach((messageItem) => {
      const rootId = String(messageItem.threadRootId || "").trim();
      if (!rootId) return;
      counts[rootId] = Number(counts[rootId] || 0) + 1;
    });
    return counts;
  }, [messages]);

  // Pre-compute grouping metadata outside renderMessageItem to avoid
  // repeated Date constructions on every Virtuoso render pass.
  const messageGroupMeta = useMemo(() => {
    const THRESHOLD = 5 * 60 * 1000;
    return messages.map((msg, index) => {
      const prev = index > 0 ? messages[index - 1] : undefined;
      const next = messages[index + 1];
      const samePrev = !!prev && prev.senderId === msg.senderId && !msg.isDeleted && !prev.isDeleted;
      const sameNext = !!next && next.senderId === msg.senderId && !msg.isDeleted && !next.isDeleted;
      const closePrev = prev ? new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < THRESHOLD : false;
      const closeNext = next ? new Date(next.createdAt).getTime() - new Date(msg.createdAt).getTime() < THRESHOLD : false;
      const showDate = !next || !isSameDay(msg.createdAt, next.createdAt);
      return {
        isFirstInGroup: !samePrev || !closePrev,
        isLastInGroup: !sameNext || !closeNext,
        showDateDivider: showDate,
      };
    });
  }, [messages]);

  const { searchConversationId, searchMessageId } = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return {
      searchConversationId: String(
        searchParams.get("conversationId") || "",
      ).trim(),
      searchMessageId: String(searchParams.get("messageId") || "").trim(),
    };
  }, [location.search]);

  const hasMore = allMessages[activeConversationId!]?.hasMore ?? false;
  const selectedConvo = conversations.find(
    (c) => String(c._id) === String(activeConversationId || ""),
  );
  const activeGroupChannelId =
    selectedConvo?.type === "group"
      ? String(
          selectedConvo.group?.activeChannelId ||
            selectedConvo.group?.channels?.[0]?.channelId ||
            "general",
        )
      : "";
  const activeGroupChannelName =
    selectedConvo?.type === "group"
      ? (
          selectedConvo.group?.channels?.find(
            (channel) => String(channel.channelId) === activeGroupChannelId,
          )?.name || "general"
        )
      : "";

  const myId = useMemo(
    () => (currentUser?._id ? String(currentUser._id) : ""),
    [currentUser?._id],
  );

  const isGroupAdmin = useMemo(() => {
    if (selectedConvo?.type !== "group" || !myId) {
      return false;
    }

    const isCreator = String(selectedConvo.group?.createdBy || "") === myId;
    if (isCreator) {
      return true;
    }

    return (selectedConvo.group?.adminIds || []).map(String).includes(myId);
  }, [myId, selectedConvo]);

  const pinnedMessage = selectedConvo?.pinnedMessage || null;

  // Count unread messages that arrived while user was scrolled up
  const [newMsgCount, setNewMsgCount] = useState(0);

  const lastOwnMessage = useMemo(() => {
    if (!myId || messages.length === 0) {
      return null;
    }

    return (
      [...messages]
        .reverse()
        .find(
          (messageItem) =>
            messageItem.senderId === myId && !messageItem.isDeleted,
        ) ?? null
    );
  }, [messages, myId]);

  const lastMessageStatus = useMemo<"delivered" | "seen">(() => {
    if (!myId || !lastOwnMessage) {
      return "delivered";
    }

    const readByOthers = (lastOwnMessage.readBy ?? [])
      .map(String)
      .filter((readerId: string) => readerId !== myId);

    if (readByOthers.length > 0) {
      return "seen";
    }

    const seenByOthers = (selectedConvo?.seenBy ?? [])
      .map((seenUser) =>
        typeof seenUser === "string" ? seenUser : String(seenUser._id),
      )
      .filter((seenUserId) => seenUserId !== myId);

    const isConversationLastMessage =
      selectedConvo?.lastMessage?._id === lastOwnMessage._id;

    return isConversationLastMessage && seenByOthers.length > 0
      ? "seen"
      : "delivered";
  }, [
    myId,
    lastOwnMessage,
    selectedConvo?.lastMessage?._id,
    selectedConvo?.seenBy,
  ]);

  const directSeenUser = useMemo(() => {
    if (selectedConvo?.type !== "direct" || !myId) {
      return null;
    }

    const partner = selectedConvo.participants.find(
      (participant) => String(participant._id) !== myId,
    );

    if (!partner) {
      return null;
    }

    const seenPartner = (selectedConvo.seenBy ?? []).find(
      (seenUser) => String(seenUser._id) === String(partner._id),
    );

    return {
      _id: String(partner._id),
      displayName: seenPartner?.displayName || partner.displayName,
      avatarUrl: seenPartner?.avatarUrl ?? partner.avatarUrl ?? null,
    };
  }, [selectedConvo, myId]);

  const groupSeenUsers = useMemo(() => {
    if (selectedConvo?.type !== "group" || !myId) {
      return [] as Array<{
        _id: string;
        displayName?: string;
        avatarUrl?: string | null;
      }>;
    }

    const participantsById = new Map(
      (selectedConvo.participants ?? []).map((participant) => [
        String(participant._id),
        participant,
      ]),
    );

    return (selectedConvo.seenBy ?? []).reduce<
      Array<{
        _id: string;
        displayName?: string;
        avatarUrl?: string | null;
      }>
    >((acc, seenUser) => {
      const seenUserId =
        typeof seenUser === "string" ? seenUser : String(seenUser._id);
      const participant = participantsById.get(seenUserId);

      if (seenUserId === myId || !participant) {
        return acc;
      }

      acc.push({
        _id: seenUserId,
        displayName:
          typeof seenUser === "string"
            ? participant.displayName
            : (seenUser.displayName ?? participant.displayName),
        avatarUrl:
          typeof seenUser === "string"
            ? participant.avatarUrl
            : (seenUser.avatarUrl ?? participant.avatarUrl),
      });

      return acc;
    }, []);
  }, [selectedConvo, myId]);

  const participantMap = useMemo(() => {
    return new Map(
      (selectedConvo?.participants || []).map((participant) => [
        String(participant._id),
        participant,
      ]),
    );
  }, [selectedConvo?.participants]);

  const typingUserList = useMemo(() => {
    const now = Date.now();

    return Object.entries(typingUsers)
      .filter(([, entry]) => entry.expiresAt > now)
      .map(([userId, entry]) => ({
        userId,
        displayName: entry.displayName,
        avatarUrl: participantMap.get(userId)?.avatarUrl,
      }));
  }, [typingUsers, participantMap]);

  const typingSummaryText = useMemo(() => {
    return buildTypingSummary(
      typingUserList.map((typingUser) => typingUser.displayName),
    );
  }, [typingUserList]);

  // Fetch initial messages if not present
  useEffect(() => {
    if (
      activeConversationId &&
      !messageLoading &&
      !allMessages[activeConversationId]?.items?.length
    ) {
      fetchMessages(activeConversationId).catch((err) =>
        console.error("Error fetching initial messages:", err),
      );
    }
  }, [activeConversationId, fetchMessages, allMessages, messageLoading]);

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);

  // Auto mark as seen when the latest incoming message is visible in active chat.
  useEffect(() => {
    if (!activeConversationId || !selectedConvo || !currentUser?._id) {
      return;
    }

    const newestMessage = messages.at(-1);
    if (!newestMessage || newestMessage.senderId === currentUser._id) {
      return;
    }

    const myUnread = selectedConvo.unreadCounts?.[currentUser._id] ?? 0;
    if (myUnread <= 0) {
      return;
    }

    const timer = globalThis.setTimeout(() => {
      useChatStore.getState().markAsSeen();
    }, 200);

    return () => globalThis.clearTimeout(timer);
  }, [activeConversationId, currentUser?._id, messages, selectedConvo]);

  // Typing indicator via socket
  useEffect(() => {
    if (!socket || !activeConversationId) return;

    const handleTyping = ({
      conversationId,
      userId,
      displayName,
    }: TypingEventPayload) => {
      if (conversationId === activeConversationId && userId !== currentUser?._id) {
        setTypingUsers((prev) => ({
          ...prev,
          [userId]: {
            displayName: displayName || "Someone",
            expiresAt: Date.now() + 2600,
          },
        }));
      }
    };
    const handleStopTyping = ({
      conversationId,
      userId,
    }: TypingEventPayload) => {
      if (conversationId === activeConversationId) {
        setTypingUsers((prev) => {
          const next = { ...prev };
          if (next[userId]) {
            next[userId] = {
              ...next[userId],
              expiresAt: Date.now() + 450,
            };
          }
          return next;
        });
      }
    };

    socket.on("user-typing", handleTyping);
    socket.on("user-stop_typing", handleStopTyping);
    return () => {
      socket.off("user-typing", handleTyping);
      socket.off("user-stop_typing", handleStopTyping);
    };
  }, [socket, activeConversationId, currentUser?._id]);

  // Reset stale typing indicator when switching conversations.
  useEffect(() => {
    setTypingUsers({});
  }, [activeConversationId, activeGroupChannelId]);

  useEffect(() => {
    const interval = globalThis.setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        const next = pruneExpiredTypingUsers(prev, now);

        if (Object.keys(next).length === Object.keys(prev).length) {
          return prev;
        }

        return next;
      });
    }, 500);

    return () => {
      globalThis.clearInterval(interval);
    };
  }, []);

  // Auto-scroll logic when new messages arrive
  const prevMsgLength = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMsgLength.current) {
      const delta = messages.length - prevMsgLength.current;
      const newestMsg = messages.at(-1);
      const isSentByMe = newestMsg?.senderId === currentUser?._id;

      // Mark this specific message ID as the new one to animate
      if (newestMsg?._id) {
        lastNewMessageIdRef.current = newestMsg._id;
      }

      // Keep chat pinned to bottom for outgoing messages or when already at bottom.
      if (isSentByMe || isAtBottom) {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: "end",
          behavior: "smooth",
        });
        setNewMsgCount(0);
      } else if (!isSentByMe) {
        // User scrolled up — accumulate unread indicator for incoming messages.
        setNewMsgCount((prev) => prev + delta);
      }
    }
    prevMsgLength.current = messages.length;
  }, [messages, currentUser?._id, isAtBottom]);

  const renderMessageItem = useCallback(
    (index: number, message: Message) => {
      const meta = messageGroupMeta[index];

      // Only animate a message if it matches the latest newly arrived ID.
      // This prevents every re-render of the last item (e.g. reaction updates)
      // from triggering the slide-in animation.
      const isNew = message._id === lastNewMessageIdRef.current;
      const isSearchTarget = message._id === highlightedMessageId;
      const threadUnreadKey = String(activeConversationId || "").trim()
        ? `${String(activeConversationId).trim()}:${String(message._id || "").trim()}`
        : "";
      const threadReplyCount = Number(threadReplyCountByRootId[message._id] || 0);
      const threadUnreadCount = threadUnreadKey
        ? Number(threadUnreadCounts[threadUnreadKey] || 0)
        : 0;

      return (
        <MessageItem
          message={message}
          isFirstInGroup={meta?.isFirstInGroup ?? true}
          isLastInGroup={meta?.isLastInGroup ?? true}
          selectedConvo={selectedConvo as NonNullable<typeof selectedConvo>}
          lastMessageStatus={lastMessageStatus}
          lastOwnMessageId={lastOwnMessage?._id ?? null}
          seenUser={directSeenUser}
          seenUsers={groupSeenUsers}
          showDateDivider={meta?.showDateDivider ?? false}
          isNew={isNew}
          isSearchTarget={isSearchTarget}
          onForward={() => setForwardMessageId(message._id)}
          canPinMessage={selectedConvo?.type === "group" && isGroupAdmin}
          isPinned={pinnedMessage?._id === message._id}
          onTogglePin={(targetMessageId, willPin) => {
            if (selectedConvo?.type !== "group") {
              return;
            }

            void pinGroupMessage(
              selectedConvo._id,
              willPin ? targetMessageId : null,
            );
          }}
          onOpenThread={(messageId) => {
            setActiveThreadRootId(messageId);
          }}
          threadReplyCount={threadReplyCount}
          threadUnreadCount={threadUnreadCount}
        />
      );
    },
    [
      messages,
      messageGroupMeta,
      selectedConvo,
      lastMessageStatus,
      lastOwnMessage?._id,
      directSeenUser,
      groupSeenUsers,
      isGroupAdmin,
      pinGroupMessage,
      setActiveThreadRootId,
      pinnedMessage?._id,
      highlightedMessageId,
      activeConversationId,
      threadReplyCountByRootId,
      threadUnreadCounts,
    ],
  );

  const handleJumpToPinned = useCallback(() => {
    if (!pinnedMessage?._id) {
      return;
    }

    const pinnedIndex = messages.findIndex(
      (messageItem) => messageItem._id === pinnedMessage._id,
    );
    if (pinnedIndex < 0) {
      return;
    }

    virtuosoRef.current?.scrollToIndex({
      index: pinnedIndex,
      align: "center",
      behavior: "smooth",
    });
  }, [messages, pinnedMessage?._id]);

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({
      index: Math.max(messages.length - 1, 0),
      align: "end",
      behavior: "smooth",
    });
    setIsAtBottom(true);
    setNewMsgCount(0);
  };
  const showScrollButton = isAtBottom === false;
  const benchEnabled = useMemo(() => isChatThreadBenchEnabled(), []);

  const onThreadRender = useCallback(
    (
      _id: string,
      phase: "mount" | "update" | "nested-update",
      actualDuration: number,
      baseDuration: number,
      startTime: number,
      commitTime: number,
    ) => {
      pushChatThreadSample({
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
        messageCount: messages.length,
      });
    },
    [messages.length],
  );

  useEffect(() => {
    if (!benchEnabled) {
      return;
    }

    exposeChatThreadBenchApi();
    startChatThreadBench();
  }, [benchEnabled]);

  // Reset badge when conversation changes
  useEffect(() => {
    setNewMsgCount(0);
    setIsAtBottom(true);
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: Math.max(messages.length - 1, 0),
        align: "end",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  const fetchMoreMessages = useCallback(async () => {
    if (!activeConversationId || messageLoading || !hasMore) {
      return;
    }

    try {
      await fetchMessages(activeConversationId);
    } catch (error) {
      console.error("Error loading more messages:", error);
    }
  }, [activeConversationId, fetchMessages, hasMore, messageLoading]);

  useEffect(() => {
    return () => {
      if (highlightResetTimerRef.current) {
        globalThis.clearTimeout(highlightResetTimerRef.current);
      }
    };
  }, []);

  const clearSearchMessageParam = useCallback(() => {
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.delete("messageId");

    navigate(
      {
        pathname: location.pathname,
        search: nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate]);

  const notifySearchJumpFallback = useCallback((searchKey: string) => {
    if (searchJumpFallbackNotifiedRef.current[searchKey]) {
      return;
    }

    searchJumpFallbackNotifiedRef.current[searchKey] = true;
    toast.info("Couldn't locate that message", {
      description: "It may be too old to load right now, or it was already removed.",
    });
  }, []);

  useEffect(() => {
    if (!activeConversationId || !searchMessageId) {
      return;
    }

    if (
      searchConversationId &&
      String(searchConversationId) !== String(activeConversationId)
    ) {
      return;
    }

    const searchKey = `${String(activeConversationId)}:${searchMessageId}`;
    const targetIndex = messages.findIndex(
      (messageItem) => messageItem._id === searchMessageId,
    );

    if (targetIndex >= 0) {
      virtuosoRef.current?.scrollToIndex({
        index: targetIndex,
        align: "center",
        behavior: "smooth",
      });

      setHighlightedMessageId(searchMessageId);

      if (highlightResetTimerRef.current) {
        globalThis.clearTimeout(highlightResetTimerRef.current);
      }

      highlightResetTimerRef.current = globalThis.setTimeout(() => {
        setHighlightedMessageId((currentMessageId) =>
          currentMessageId === searchMessageId ? null : currentMessageId,
        );
      }, SEARCH_JUMP_HIGHLIGHT_MS);

      searchJumpFetchAttemptRef.current[searchKey] = 0;

      delete searchJumpFallbackNotifiedRef.current[searchKey];
      clearSearchMessageParam();
      return;
    }

    if (!hasMore) {
      notifySearchJumpFallback(searchKey);
      clearSearchMessageParam();
      return;
    }

    if (messageLoading) {
      return;
    }

    const currentAttempt = searchJumpFetchAttemptRef.current[searchKey] ?? 0;
    if (currentAttempt >= SEARCH_JUMP_FETCH_MAX_ATTEMPTS) {
      notifySearchJumpFallback(searchKey);
      clearSearchMessageParam();
      return;
    }

    searchJumpFetchAttemptRef.current[searchKey] = currentAttempt + 1;
    void fetchMoreMessages();
  }, [
    activeConversationId,
    clearSearchMessageParam,
    fetchMoreMessages,
    hasMore,
    messageLoading,
    messages,
    notifySearchJumpFallback,
    searchConversationId,
    searchMessageId,
  ]);

  if (!selectedConvo) return <ChatWelcomeScreen />;

  // Show skeleton while fetching the first page of messages (avoids CLS flash)
  const isInitialLoad = messageLoading && !messages?.length;
  if (isInitialLoad) {
    return (
      <div className="h-full bg-background">
        <ChatWindowSkeleton />
      </div>
    );
  }

  if (!messages?.length) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-hidden bg-background px-8 text-center text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-full bg-primary/[0.05] blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 -left-20 h-52 w-52 rounded-full bg-accent/[0.05] blur-3xl" aria-hidden="true" />

        <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-border/50 bg-muted/40" aria-hidden="true">
          <MessageCircle className="h-6 w-6 text-muted-foreground/70" />
        </span>

        <div className="relative z-10">
          <p className="text-[14px] font-semibold text-foreground/85">No messages yet</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground/65">
            {selectedConvo.type === "group"
              ? `Be the first to post in #${activeGroupChannelName}`
              : "Be the first to say something!"}
          </p>
        </div>

        <p className="relative z-10 rounded-full border border-border/45 bg-background/70 px-3 py-1 text-[10.5px] font-medium tracking-wide text-muted-foreground/60">
          Tip: Start typing below and press Enter to send quickly.
        </p>
      </div>
    );
  }

  return (
    <div
      key={`chat-conversation-${activeConversationId}-${activeGroupChannelId || "direct"}`}
      className="conversation-fade chat-thread-shell chat-thread-shell--command p-1.5 sm:p-2 bg-background h-full flex flex-col overflow-hidden relative"
    >
      {selectedConvo.type === "group" && pinnedMessage && (
        <div className="chat-pinned-banner chat-pinned-banner--command mb-1.5 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-2.5 py-1.5 sm:mb-2 sm:px-3 sm:py-2">
          <Pin className="size-3.5 text-primary flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary/90">
              Pinned message
            </p>
            <p className="truncate text-xs text-foreground/85">
              {String(pinnedMessage.content || "").trim() ||
                (pinnedMessage.imgUrl ? "Pinned image" : "Pinned message")}
            </p>
          </div>

          <button
            type="button"
            onClick={handleJumpToPinned}
            className="chat-pinned-banner-action rounded-lg px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 transition-colors"
          >
            Jump
          </button>

          {isGroupAdmin && (
            <button
              type="button"
              onClick={() => {
                void pinGroupMessage(selectedConvo._id, null);
              }}
              className="chat-pinned-banner-dismiss rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Unpin message"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <Profiler id="chat-thread" onRender={onThreadRender}>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div
            className={cn(
              "flex justify-center overflow-hidden transition-[height,opacity,margin] duration-300",
              messageLoading && messages.length > 0
                ? "h-10 opacity-100 mt-4 mb-2"
                : "h-0 opacity-0 mt-0 mb-0",
            )}
          >
            <div className="flex flex-col gap-2 w-full max-w-[65%] items-center opacity-70">
              <Skeleton className="h-[28px] w-[50%] rounded-2xl bg-muted/60" />
            </div>
          </div>

          <Virtuoso
            ref={virtuosoRef}
            className="h-full beautiful-scrollbar"
            data={messages}
            atBottomStateChange={(bottom) => {
              // Debounce to avoid a React re-render on every scroll pixel
              if (atBottomDebounceRef.current) {
                clearTimeout(atBottomDebounceRef.current);
              }
              atBottomDebounceRef.current = setTimeout(() => {
                setIsAtBottom(bottom);
                if (bottom) setNewMsgCount(0);
              }, 80);
            }}
            followOutput={(atBottom) => (atBottom ? "smooth" : false)}
            startReached={() => {
              if (hasMore) {
                void fetchMoreMessages();
              }
            }}
            itemContent={renderMessageItem}
          />
        </div>
      </Profiler>

      {/* ── Typing indicator ── */}
      {typingUserList.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="typing-bubble-wrap typing-bubble-wrap--command"
        >
          <div className="typing-avatars">
            {typingUserList.slice(0, 3).map((typingUser) => (
              <div key={typingUser.userId} className="typing-avatar">
                {typingUser.avatarUrl ? (
                  <img
                    src={typingUser.avatarUrl}
                    alt={typingUser.displayName}
                    className="typing-avatar-img"
                  />
                ) : (
                  <div className="typing-avatar-fallback">
                    {typingUser.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="typing-avatar-pulse" />
              </div>
            ))}
          </div>

          <div className="typing-bubble">
            <span className="typing-dot typing-dot--1" />
            <span className="typing-dot typing-dot--2" />
            <span className="typing-dot typing-dot--3" />
          </div>
          <span className="typing-label">{typingSummaryText}</span>
        </div>
      )}

      {/* ── Scroll-to-bottom FAB ── */}
      <button
        type="button"
        onClick={scrollToBottom}
        aria-label={
          newMsgCount > 0
            ? `Scroll to latest messages (${newMsgCount} unread)`
            : "Scroll to latest messages"
        }
        className={cn(
          "scroll-to-bottom-fab scroll-to-bottom-fab--command",
          showScrollButton
            ? "scroll-btn-enter pointer-events-auto"
            : "scroll-btn-exit pointer-events-none",
        )}
      >
        <ArrowDown className="size-4 shrink-0" />
        <span className="hidden text-[11px] font-semibold sm:inline">Latest</span>
        {newMsgCount > 0 && (
          <span className="scroll-fab-badge">
            {newMsgCount > 99 ? "99+" : newMsgCount}
          </span>
        )}
      </button>

      <ForwardMessageModal
        isOpen={!!forwardMessageId}
        onClose={() => setForwardMessageId(null)}
        messageId={forwardMessageId}
      />
    </div>
  );
};

export default ChatWindowBody;
