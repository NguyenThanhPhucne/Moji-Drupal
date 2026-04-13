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
import { ArrowDown, Pin, X } from "lucide-react";
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
  const {
    activeConversationId,
    conversations,
    messages: allMessages,
    messageLoading,
    fetchMessages,
    pinGroupMessage,
  } = useChatStore();
  const { socket } = useSocketStore();
  const { user: currentUser } = useAuthStore();

  // Track truly new messages — only animate the first render of a brand-new _id
  const lastNewMessageIdRef = useRef<string | null>(null);

  const [typingUsers, setTypingUsers] = useState<Record<string, TypingEntry>>(
    {},
  );
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);

  const messages = useMemo(() => {
    if (!activeConversationId) {
      return EMPTY_MESSAGES;
    }

    return allMessages[activeConversationId]?.items ?? EMPTY_MESSAGES;
  }, [allMessages, activeConversationId]);
  const hasMore = allMessages[activeConversationId!]?.hasMore ?? false;
  const selectedConvo = conversations.find(
    (c) => c._id === activeConversationId,
  );

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
      !allMessages[activeConversationId]?.items?.length
    ) {
      fetchMessages(activeConversationId).catch((err) =>
        console.error("Error fetching initial messages:", err),
      );
    }
  }, [activeConversationId, fetchMessages, allMessages]);

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
  }, [activeConversationId]);

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
      const prevMessage = index > 0 ? messages[index - 1] : undefined;
      const nextMessage = messages[index + 1];
      const showDateDivider =
        !nextMessage || !isSameDay(message.createdAt, nextMessage.createdAt);

      // Only animate a message if it matches the latest newly arrived ID.
      // This prevents every re-render of the last item (e.g. reaction updates)
      // from triggering the slide-in animation.
      const isNew = message._id === lastNewMessageIdRef.current;

      return (
        <MessageItem
          message={message}
          index={index}
          prevSenderId={prevMessage?.senderId ? String(prevMessage.senderId) : ""}
          nextSenderId={nextMessage?.senderId ? String(nextMessage.senderId) : ""}
          selectedConvo={selectedConvo as NonNullable<typeof selectedConvo>}
          lastMessageStatus={lastMessageStatus}
          lastOwnMessageId={lastOwnMessage?._id ?? null}
          seenUser={directSeenUser}
          seenUsers={groupSeenUsers}
          showDateDivider={showDateDivider}
          isNew={isNew}
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
        />
      );
    },
    [
      messages,
      selectedConvo,
      lastMessageStatus,
      lastOwnMessage?._id,
      directSeenUser,
      groupSeenUsers,
      isGroupAdmin,
      pinGroupMessage,
      pinnedMessage?._id,
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

  const fetchMoreMessages = async () => {
    if (!activeConversationId) return;
    try {
      await fetchMessages(activeConversationId);
    } catch (error) {
      console.error("Error loading more messages:", error);
    }
  };

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
      <div className="flex h-full items-center justify-center flex-col gap-2.5 text-muted-foreground px-8 text-center bg-background animate-in fade-in slide-in-from-bottom-2 duration-500">
        <span className="text-4xl select-none">👋</span>
        <div>
          <p className="text-[14px] font-semibold text-foreground/80">No messages yet</p>
          <p className="text-[12px] text-muted-foreground/60 mt-0.5">
            Be the first to say something!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      key={`chat-conversation-${activeConversationId}`}
      className="conversation-fade p-2 bg-background h-full flex flex-col overflow-hidden relative"
    >
      {selectedConvo.type === "group" && pinnedMessage && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2">
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
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 transition-colors"
          >
            Jump
          </button>

          {isGroupAdmin && (
            <button
              type="button"
              onClick={() => {
                void pinGroupMessage(selectedConvo._id, null);
              }}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
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
              "flex justify-center transition-all duration-300 overflow-hidden",
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
              setIsAtBottom(bottom);
              if (bottom) {
                setNewMsgCount(0);
              }
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
        <div className="typing-bubble-wrap">
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
        aria-label="Scroll to latest messages"
        className={cn(
          "scroll-to-bottom-fab",
          showScrollButton
            ? "scroll-btn-enter pointer-events-auto"
            : "scroll-btn-exit pointer-events-none",
        )}
      >
        <ArrowDown className="size-4" />
        {newMsgCount > 0 && (
          <span className="scroll-fab-badge animate-bounce shadow-md">
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
