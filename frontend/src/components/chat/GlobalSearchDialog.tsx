import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  FileText,
  MessageSquareText,
  Pin,
  Search,
  Star,
  UserCircle,
  Users,
  MessagesSquare,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { searchService } from "@/services/searchService";
import axios from "axios";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useSocialStore } from "@/stores/useSocialStore";
import { useMiniChatDockStore } from "@/stores/useMiniChatDockStore";
import {
  usePersonalizationStore,
  type NotificationDensityPreference,
  type NotificationGroupingPreference,
  type StartPagePreference,
  type TimestampStylePreference,
} from "@/stores/usePersonalizationStore";
import GlobalSearchResultsSkeleton from "@/components/skeleton/GlobalSearchResultsSkeleton";
import GlobalSearchMetaSkeleton from "@/components/skeleton/GlobalSearchMetaSkeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  GlobalSearchGroup,
  GlobalSearchMessage,
  GlobalSearchPost,
  GlobalSearchPerson,
  GlobalSearchResponse,
} from "@/types/chat";

const RECENT_KEY = "coming-search-recent";
const PINNED_KEY = "coming-search-pinned";

type SearchResultItem =
  | ({ type: "people" } & GlobalSearchPerson)
  | ({ type: "groups" } & GlobalSearchGroup)
  | ({ type: "messages" } & GlobalSearchMessage)
  | ({ type: "posts" } & GlobalSearchPost)
  | {
      type: "command";
      commandId: string;
      title: string;
      subtitle: string;
      score: number;
    };

type ResultFilter = "all" | SearchResultItem["type"];

const RESULT_FILTERS: Array<{ value: ResultFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "command", label: "Actions" },
  { value: "people", label: "People" },
  { value: "groups", label: "Groups" },
  { value: "messages", label: "Messages" },
  { value: "posts", label: "Posts" },
];

interface PinnedSearchItem {
  key: string;
  label: string;
  type: "people" | "groups" | "messages" | "posts" | "command";
  conversationId?: string;
  userId?: string;
  postId?: string;
  commandId?: string;
}

const toResultKey = (item: SearchResultItem) => {
  if (item.type === "command") return `command:${item.commandId}`;
  if (item.type === "people") return `people:${item._id}`;
  if (item.type === "groups") return `groups:${item.conversationId}`;
  if (item.type === "posts") return `posts:${item.postId}`;
  return `messages:${item.messageId}`;
};

const getResultTitle = (item: SearchResultItem) => {
  if (item.type === "command") {
    return item.title;
  }

  if (item.type === "people") {
    return item.displayName;
  }

  if (item.type === "groups") {
    return item.name;
  }

  if (item.type === "posts") {
    return item.preview;
  }

  return item.content;
};

const getResultSubtitle = (item: SearchResultItem) => {
  if (item.type === "command") {
    return item.subtitle;
  }

  if (item.type === "people") {
    return `@${item.username} | ${item.mutualGroupsCount} mutual groups`;
  }

  if (item.type === "groups") {
    return `${item.membersCount} members`;
  }

  if (item.type === "posts") {
    return `Post by ${item.authorName} · ${item.mediaCount} media`;
  }

  return `from ${item.senderName || "Unknown"}`;
};

const mergeResults = (
  local: GlobalSearchResponse,
  remote: GlobalSearchResponse,
): SearchResultItem[] => {
  const bucket = new Map<string, SearchResultItem>();

  const addAll = (items: SearchResultItem[]) => {
    for (const item of items) {
      const key = toResultKey(item);
      const existing = bucket.get(key);
      if (!existing || (item.score || 0) > (existing.score || 0)) {
        bucket.set(key, item);
      }
    }
  };

  addAll(local.people.map((item) => ({ ...item, type: "people" })));
  addAll(local.groups.map((item) => ({ ...item, type: "groups" })));
  addAll(local.messages.map((item) => ({ ...item, type: "messages" })));
  addAll(local.posts.map((item) => ({ ...item, type: "posts" })));

  addAll(remote.people.map((item) => ({ ...item, type: "people" })));
  addAll(remote.groups.map((item) => ({ ...item, type: "groups" })));
  addAll(remote.messages.map((item) => ({ ...item, type: "messages" })));
  addAll(remote.posts.map((item) => ({ ...item, type: "posts" })));

  return Array.from(bucket.values()).sort(
    (a, b) => (b.score || 0) - (a.score || 0),
  );
};

const GlobalSearchDialog = ({ globalOnly = false }: { globalOnly?: boolean }) => {
  const navigate = useNavigate();
  const {
    conversations,
    messages,
    setActiveConversation,
    fetchMessages,
    createConversation,
    fetchConversations,
    flushOutgoingQueue,
  } = useChatStore();
  const { user } = useAuthStore();
  const setIsHubOpen = useNotificationStore((state) => state.setIsHubOpen);
  const minimizeMiniChatWindows = useMiniChatDockStore(
    (state) => state.minimizeAll,
  );
  const markAllNotificationsRead = useSocialStore(
    (state) => state.markAllNotificationsRead,
  );
  const notificationGroupingPreference = usePersonalizationStore(
    (state) => state.notificationGroupingPreference,
  );
  const setNotificationGroupingPreference = usePersonalizationStore(
    (state) => state.setNotificationGroupingPreference,
  );
  const timestampStylePreference = usePersonalizationStore(
    (state) => state.timestampStylePreference,
  );
  const setTimestampStylePreference = usePersonalizationStore(
    (state) => state.setTimestampStylePreference,
  );
  const notificationDensityPreference = usePersonalizationStore(
    (state) => state.notificationDensityPreference,
  );
  const setNotificationDensityPreference = usePersonalizationStore(
    (state) => state.setNotificationDensityPreference,
  );
  const startPagePreference = usePersonalizationStore(
    (state) => state.startPagePreference,
  );
  const setStartPagePreference = usePersonalizationStore(
    (state) => state.setStartPagePreference,
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [pinned, setPinned] = useState<PinnedSearchItem[]>([]);
  const [isMetaLoading, setIsMetaLoading] = useState(false);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [remoteResult, setRemoteResult] = useState<GlobalSearchResponse>({
    people: [],
    groups: [],
    messages: [],
    posts: [],
  });

  const hasLoadedMetaRef = useRef(false);
  const resultRowRefs = useRef<Array<HTMLDivElement | null>>([]);

  const runCommandAction = useCallback(
    async (commandId: string) => {
      try {
        switch (commandId) {
          case "go-chat":
            navigate("/");
            break;
          case "go-feed":
            navigate("/feed");
            break;
          case "go-explore":
            navigate("/explore");
            break;
          case "go-saved":
            navigate("/saved");
            break;
          case "go-profile":
            navigate(user?._id ? `/profile/${user._id}` : "/profile");
            break;
          case "go-notification-settings":
            navigate("/settings/notifications");
            break;
          case "open-notification-center":
            setIsHubOpen(true);
            break;
          case "mark-all-notifications-read":
            await markAllNotificationsRead();
            setIsHubOpen(true);
            break;
          case "refresh-conversations":
            await fetchConversations();
            break;
          case "flush-outgoing-queue":
            await flushOutgoingQueue();
            break;
          case "set-grouping-auto":
            setNotificationGroupingPreference("auto");
            break;
          case "set-grouping-priority":
            setNotificationGroupingPreference("priority");
            break;
          case "set-grouping-time":
            setNotificationGroupingPreference("time");
            break;
          case "set-timestamp-relative":
            setTimestampStylePreference("relative");
            break;
          case "set-timestamp-absolute":
            setTimestampStylePreference("absolute");
            break;
          case "set-density-comfortable":
            setNotificationDensityPreference("comfortable");
            break;
          case "set-density-compact":
            setNotificationDensityPreference("compact");
            break;
          case "set-start-page-chat":
            setStartPagePreference("chat");
            break;
          case "set-start-page-feed":
            setStartPagePreference("feed");
            break;
          case "set-start-page-explore":
            setStartPagePreference("explore");
            break;
          case "set-start-page-saved":
            setStartPagePreference("saved");
            break;
          case "open-post-compose":
            navigate("/feed");
            globalThis.setTimeout(() => {
              globalThis.dispatchEvent(new CustomEvent("moji:open-post-composer"));
            }, 80);
            break;
          case "mini-chat-minimize-all":
            minimizeMiniChatWindows();
            break;
          default:
            return;
        }

        setOpen(false);
      } catch (error) {
        console.error("Global command action failed", error);
        toast.error("Cannot run this command right now");
      }
    },
    [
      fetchConversations,
      flushOutgoingQueue,
      markAllNotificationsRead,
      minimizeMiniChatWindows,
      navigate,
      setIsHubOpen,
      setNotificationDensityPreference,
      setNotificationGroupingPreference,
      setStartPagePreference,
      setTimestampStylePreference,
      user?._id,
    ],
  );

  const commandResults = useMemo<SearchResultItem[]>(() => {
    const normalized = query.trim().toLowerCase();

    const groupingLabelByPreference: Record<
      NotificationGroupingPreference,
      string
    > = {
      auto: "Auto",
      priority: "Priority",
      time: "Time",
    };

    const timestampLabelByPreference: Record<TimestampStylePreference, string> = {
      relative: "Relative",
      absolute: "Absolute",
    };

    const densityLabelByPreference: Record<NotificationDensityPreference, string> = {
      comfortable: "Comfortable",
      compact: "Compact",
    };

    const startPageLabelByPreference: Record<StartPagePreference, string> = {
      chat: "Chat",
      feed: "Feed",
      explore: "Explore",
      saved: "Saved",
    };

    const actions = [
      {
        commandId: "go-chat",
        title: "Open Chat Workspace",
        subtitle: "Jump to the main chat inbox",
        keywords: ["chat", "inbox", "dm", "messages", "workspace"],
        baseScore: 88,
      },
      {
        commandId: "go-feed",
        title: "Open Social Feed",
        subtitle: "Go to feed and stories",
        keywords: ["feed", "home", "social", "timeline", "posts"],
        baseScore: 84,
      },
      {
        commandId: "go-explore",
        title: "Open Explore",
        subtitle: "Discover people and trending posts",
        keywords: ["explore", "discover", "trending", "search"],
        baseScore: 80,
      },
      {
        commandId: "go-saved",
        title: "Open Saved Messages",
        subtitle: "Review bookmarks and saved items",
        keywords: ["saved", "bookmark", "bookmarks", "archive"],
        baseScore: 78,
      },
      {
        commandId: "go-profile",
        title: "Open My Profile",
        subtitle: "Go to your profile and activity",
        keywords: ["profile", "me", "account", "activity"],
        baseScore: 77,
      },
      {
        commandId: "go-notification-settings",
        title: "Open Notification Settings",
        subtitle: "Tune delivery and social alerts",
        keywords: ["notification", "settings", "alerts", "preferences"],
        baseScore: 76,
      },
      {
        commandId: "open-notification-center",
        title: "Open Notification Center",
        subtitle: "Review social and friend updates in one place",
        keywords: ["notification", "center", "hub", "alerts", "inbox"],
        baseScore: 79,
      },
      {
        commandId: "mark-all-notifications-read",
        title: "Mark All Notifications Read",
        subtitle: "Clear unread counters across social notifications",
        keywords: ["mark", "read", "clear", "notifications", "inbox"],
        baseScore: 74,
      },
      {
        commandId: "refresh-conversations",
        title: "Refresh Conversation List",
        subtitle: "Force reload conversation roster from server",
        keywords: ["refresh", "conversation", "sync", "reload", "rooms"],
        baseScore: 73,
      },
      {
        commandId: "flush-outgoing-queue",
        title: "Retry Outgoing Queue",
        subtitle: "Send queued messages immediately",
        keywords: ["retry", "queue", "flush", "delivery", "unsent"],
        baseScore: 75,
      },
      {
        commandId: "open-post-compose",
        title: "Open Post Composer",
        subtitle: "Start a new social post draft",
        keywords: ["compose", "post", "create", "new", "feed"],
        baseScore: 78,
      },
      {
        commandId: "mini-chat-minimize-all",
        title: "Mini Chat: Minimize All Windows",
        subtitle: "Collapse all floating mini chat windows",
        keywords: ["mini chat", "dock", "minimize", "windows", "focus"],
        baseScore: 72,
      },
      {
        commandId: "set-grouping-auto",
        title: "Notification Grouping: Auto",
        subtitle: `Current mode: ${groupingLabelByPreference[notificationGroupingPreference]}`,
        keywords: ["grouping", "notification", "auto", "priority", "time"],
        baseScore: 71,
      },
      {
        commandId: "set-grouping-priority",
        title: "Notification Grouping: Priority",
        subtitle: `Current mode: ${groupingLabelByPreference[notificationGroupingPreference]}`,
        keywords: ["grouping", "notification", "priority", "important"],
        baseScore: 71,
      },
      {
        commandId: "set-grouping-time",
        title: "Notification Grouping: Time",
        subtitle: `Current mode: ${groupingLabelByPreference[notificationGroupingPreference]}`,
        keywords: ["grouping", "notification", "time", "chronological"],
        baseScore: 71,
      },
      {
        commandId: "set-timestamp-relative",
        title: "Timestamp Mode: Relative",
        subtitle: `Current mode: ${timestampLabelByPreference[timestampStylePreference]}`,
        keywords: ["timestamp", "relative", "time", "format"],
        baseScore: 70,
      },
      {
        commandId: "set-timestamp-absolute",
        title: "Timestamp Mode: Absolute",
        subtitle: `Current mode: ${timestampLabelByPreference[timestampStylePreference]}`,
        keywords: ["timestamp", "absolute", "time", "format"],
        baseScore: 70,
      },
      {
        commandId: "set-density-comfortable",
        title: "Density: Comfortable",
        subtitle: `Current density: ${densityLabelByPreference[notificationDensityPreference]}`,
        keywords: ["density", "comfortable", "spacing", "layout"],
        baseScore: 69,
      },
      {
        commandId: "set-density-compact",
        title: "Density: Compact",
        subtitle: `Current density: ${densityLabelByPreference[notificationDensityPreference]}`,
        keywords: ["density", "compact", "spacing", "layout"],
        baseScore: 69,
      },
      {
        commandId: "set-start-page-chat",
        title: "Start Page: Chat",
        subtitle: `Current start page: ${startPageLabelByPreference[startPagePreference]}`,
        keywords: ["start", "default", "page", "chat", "workspace"],
        baseScore: 68,
      },
      {
        commandId: "set-start-page-feed",
        title: "Start Page: Feed",
        subtitle: `Current start page: ${startPageLabelByPreference[startPagePreference]}`,
        keywords: ["start", "default", "page", "feed", "home"],
        baseScore: 68,
      },
      {
        commandId: "set-start-page-explore",
        title: "Start Page: Explore",
        subtitle: `Current start page: ${startPageLabelByPreference[startPagePreference]}`,
        keywords: ["start", "default", "page", "explore", "discover"],
        baseScore: 68,
      },
      {
        commandId: "set-start-page-saved",
        title: "Start Page: Saved",
        subtitle: `Current start page: ${startPageLabelByPreference[startPagePreference]}`,
        keywords: ["start", "default", "page", "saved", "bookmarks"],
        baseScore: 68,
      },
    ];

    const matches = actions
      .filter((action) => {
        if (!normalized) {
          return true;
        }

        const searchable = `${action.title} ${action.subtitle} ${action.keywords.join(" ")}`.toLowerCase();
        return searchable.includes(normalized);
      })
      .map<SearchResultItem>((action) => {
        const titleMatch = action.title.toLowerCase().includes(normalized);
        const keywordMatch = action.keywords.some((keyword) =>
          keyword.toLowerCase().includes(normalized),
        );

        let scoreBoost = 0;
        if (normalized) {
          if (titleMatch) {
            scoreBoost = 22;
          } else if (keywordMatch) {
            scoreBoost = 14;
          } else {
            scoreBoost = 6;
          }
        }

        return {
          type: "command",
          commandId: action.commandId,
          title: action.title,
          subtitle: action.subtitle,
          score: action.baseScore + scoreBoost,
        };
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    if (!normalized) {
      return matches.slice(0, 20);
    }

    return matches;
  }, [
    notificationDensityPreference,
    notificationGroupingPreference,
    query,
    startPagePreference,
    timestampStylePreference,
  ]);

  const openConversation = useCallback(
    (conversationId: string, options?: { messageId?: string }) => {
      const normalizedConversationId = String(conversationId || "").trim();
      if (!normalizedConversationId) {
        return;
      }

      const nextSearchParams = new URLSearchParams();
      nextSearchParams.set("conversationId", normalizedConversationId);

      if (options?.messageId) {
        nextSearchParams.set("messageId", String(options.messageId));
      }

      setActiveConversation(normalizedConversationId);
      navigate({
        pathname: "/",
        search: `?${nextSearchParams.toString()}`,
      });
      setOpen(false);
    },
    [navigate, setActiveConversation],
  );

  const ensureConversationMessagesLoaded = useCallback(
    (conversationId: string) => {
      const normalizedConversationId = String(conversationId || "").trim();
      if (!normalizedConversationId || messages[normalizedConversationId]) {
        return;
      }

      void fetchMessages(normalizedConversationId).catch((error) => {
        console.error("Failed to preload conversation from global search", error);
      });
    },
    [fetchMessages, messages],
  );

  useEffect(() => {
    if (!open || hasLoadedMetaRef.current) {
      return;
    }

    setIsMetaLoading(true);

    const timer = globalThis.setTimeout(() => {
      try {
        const savedRecent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        const savedPinned = JSON.parse(localStorage.getItem(PINNED_KEY) || "[]");
        setRecent(Array.isArray(savedRecent) ? savedRecent : []);
        setPinned(Array.isArray(savedPinned) ? savedPinned : []);
      } catch {
        setRecent([]);
        setPinned([]);
      } finally {
        hasLoadedMetaRef.current = true;
        setIsMetaLoading(false);
      }
    }, 120);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!globalOnly) {
      return;
    }

    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", handleGlobalShortcut);
    return () => document.removeEventListener("keydown", handleGlobalShortcut);
  }, [globalOnly]);

  const localResult = useMemo<GlobalSearchResponse>(() => {
    const normalized = query.trim().toLowerCase();

    if (normalized.length < 2) {
      return { people: [], groups: [], messages: [], posts: [] };
    }

    const people: GlobalSearchPerson[] = conversations
      .filter((conversation) => conversation.type === "direct")
      .map((conversation) => {
        const participant = conversation.participants.find(
          (item) => String(item._id) !== String(user?._id),
        );

        if (!participant) {
          return null;
        }

        return {
          _id: participant?._id,
          displayName: participant?.displayName,
          username: participant?.username || "",
          avatarUrl: participant?.avatarUrl || null,
          bio: participant?.bio || "",
          lastActiveAt: conversation.lastMessageAt,
          mutualGroupsCount: 0,
          conversationId: conversation._id,
          score: 0,
        };
      })
      .filter(Boolean)
      .filter((participant) => {
        const candidate =
          `${participant?.displayName} ${participant?.username}`.toLowerCase();
        return candidate.includes(normalized);
      })
      .map((item) => ({ ...(item as GlobalSearchPerson), score: 45 }));

    const groups: GlobalSearchGroup[] = conversations
      .filter((conversation) => conversation.type === "group")
      .filter((conversation) =>
        String(conversation.group?.name || "")
          .toLowerCase()
          .includes(normalized),
      )
      .map((conversation) => ({
        conversationId: conversation._id,
        name: conversation.group?.name || "Untitled group",
        membersCount: conversation.participants.length,
        score: 42,
      }));

    const allMessages = Object.values(messages).flatMap(
      (bucket) => bucket.items,
    );

    const localMessages: GlobalSearchMessage[] = allMessages
      .filter((message) =>
        String(message.content || "")
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 20)
      .map((message) => ({
        messageId: message._id,
        conversationId: message.conversationId,
        content: message.content || "",
        createdAt: message.createdAt,
        senderId: message.senderId,
        senderName: "",
        score: 40,
      }));

    return {
      people,
      groups,
      messages: localMessages,
      posts: [],
    };
  }, [query, conversations, messages, user?._id]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setRemoteResult({ people: [], groups: [], messages: [], posts: [] });
      setIsSearchingRemote(false);
      return;
    }

    setIsSearchingRemote(true);
    const controller = new AbortController();
    let cancelled = false;

    const timer = globalThis.setTimeout(async () => {
      try {
        const result = await searchService.globalSearch(
          normalized,
          controller.signal,
        );
        setRemoteResult(result);
      } catch (error) {
        if (axios.isCancel(error)) {
          return;
        }

        if ((error as Error)?.name === "CanceledError") {
          return;
        }

        console.error("Global search error", error);
      } finally {
        if (!cancelled) {
          setIsSearchingRemote(false);
        }
      }
    }, 260);

    return () => {
      cancelled = true;
      controller.abort();
      globalThis.clearTimeout(timer);
    };
  }, [query]);

  const mergedSearchResults = useMemo(
    () => mergeResults(localResult, remoteResult),
    [localResult, remoteResult],
  );

  const mergedResults = useMemo(() => {
    return [...commandResults, ...mergedSearchResults].sort(
      (a, b) => (b.score || 0) - (a.score || 0),
    );
  }, [commandResults, mergedSearchResults]);

  const filteredResults = useMemo(() => {
    if (resultFilter === "all") {
      return mergedResults;
    }

    return mergedResults.filter((item) => item.type === resultFilter);
  }, [mergedResults, resultFilter]);

  const filterCounts = useMemo(() => {
    return {
      all: mergedResults.length,
      command: mergedResults.filter((item) => item.type === "command").length,
      people: mergedResults.filter((item) => item.type === "people").length,
      groups: mergedResults.filter((item) => item.type === "groups").length,
      messages: mergedResults.filter((item) => item.type === "messages").length,
      posts: mergedResults.filter((item) => item.type === "posts").length,
    };
  }, [mergedResults]);

  useEffect(() => {
    if (filteredResults.length === 0) {
      setActiveResultIndex(0);
      return;
    }

    setActiveResultIndex((current) =>
      Math.min(current, filteredResults.length - 1),
    );
  }, [filteredResults.length]);

  useEffect(() => {
    if (!open || filteredResults.length === 0) {
      return;
    }

    const node = resultRowRefs.current[activeResultIndex];
    node?.scrollIntoView({ block: "nearest" });
  }, [activeResultIndex, filteredResults.length, open]);

  const saveRecentQuery = (value: string) => {
    const normalized = value.trim();
    if (normalized.length < 2) {
      return;
    }

    const next = [
      normalized,
      ...recent.filter((item) => item !== normalized),
    ].slice(0, 8);
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };

  const togglePin = (item: SearchResultItem) => {
    const key = toResultKey(item);
    let label = "";
    if (item.type === "command") {
      label = item.title;
    } else if (item.type === "people") {
      label = item.displayName;
    } else if (item.type === "groups") {
      label = item.name;
    } else if (item.type === "posts") {
      label = item.preview || item.caption || "Post";
    } else {
      label = item.content;
    }

    const normalizedConversationId =
      "conversationId" in item ? item.conversationId ?? undefined : undefined;

    const exists = pinned.some((entry) => entry.key === key);
    const next: PinnedSearchItem[] = exists
      ? pinned.filter((entry) => entry.key !== key)
      : [
          {
            key,
            label,
            type: item.type,
            conversationId: normalizedConversationId,
            userId: item.type === "people" ? item._id : undefined,
            postId: item.type === "posts" ? item.postId : undefined,
            commandId: item.type === "command" ? item.commandId : undefined,
          },
          ...pinned,
        ].slice(0, 20);

    setPinned(next);
    localStorage.setItem(PINNED_KEY, JSON.stringify(next));
  };

  const handleSelectPeopleResult = useCallback(
    async (item: Extract<SearchResultItem, { type: "people" }>) => {
      if (item.conversationId) {
        openConversation(item.conversationId);
        ensureConversationMessagesLoaded(item.conversationId);
        return;
      }

      const ok = await createConversation("direct", "", [item._id]);
      if (!ok) {
        return;
      }

      const createdConversationId = String(
        useChatStore.getState().activeConversationId || "",
      ).trim();

      if (createdConversationId) {
        openConversation(createdConversationId);
        ensureConversationMessagesLoaded(createdConversationId);
      }
    },
    [createConversation, ensureConversationMessagesLoaded, openConversation],
  );

  const onSelectResult = async (
    item: SearchResultItem,
    mode: "default" | "profile" = "default",
  ) => {
    saveRecentQuery(query);

    if (item.type === "command") {
      await runCommandAction(item.commandId);
      return;
    }

    if (mode === "profile" && item.type === "people") {
      navigate(`/profile/${item._id}`);
      setOpen(false);
      return;
    }

    if (item.type === "posts") {
      navigate(`/post/${item.postId}`);
      setOpen(false);
      return;
    }

    if (item.type === "people") {
      await handleSelectPeopleResult(item);
      return;
    }

    if (item.type === "groups") {
      openConversation(item.conversationId);
      ensureConversationMessagesLoaded(item.conversationId);
      return;
    }

    if (item.type === "messages") {
      openConversation(item.conversationId, {
        messageId: item.messageId,
      });
      ensureConversationMessagesLoaded(item.conversationId);
      return;
    }

    navigate("/");
    setOpen(false);
  };

  const hasPinned = pinned.length > 0;
  const hasSearchResults = filteredResults.length > 0;

  const handleSearchInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (filteredResults.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((current) =>
        current >= filteredResults.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex((current) =>
        current <= 0 ? filteredResults.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter") {
      const selected = filteredResults[activeResultIndex];
      if (!selected) {
        return;
      }

      event.preventDefault();
      if ((event.metaKey || event.ctrlKey) && selected.type === "people") {
        void onSelectResult(selected, "profile");
        return;
      }

      void onSelectResult(selected);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!globalOnly && (
        <>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Open global search"
              className="global-search-trigger-mobile"
            >
              <Search className="size-4 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
            </button>
          </DialogTrigger>

          <DialogTrigger asChild>
            <button
              type="button"
              className="global-search-trigger"
            >
              <Search className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
              <span className="flex-1 text-left text-[12px] truncate">Search...</span>
              <kbd className="hidden sm:inline-flex items-center rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 shrink-0">
                ⌘K
              </kbd>
            </button>
          </DialogTrigger>
        </>
      )}

      <DialogContent
        className="sm:max-w-3xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.querySelector<HTMLInputElement>('[data-autofocus="true"]')?.focus();
        }}
      >
        <DialogHeader className="modal-stagger-item">
          <DialogTitle>Global search</DialogTitle>
          <DialogDescription className="sr-only">
            Search for people, groups, messages, or posts across the platform
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex items-center w-full modal-stagger-item">
          <Search className="absolute left-4 size-4 text-muted-foreground/60 pointer-events-none" />
          <Input
            data-autofocus="true"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchInputKeyDown}
            placeholder="Search people, groups, messages, posts..."
            aria-label="Global search"
            className="search-input-pill h-11 text-base pl-10 pr-10"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                document.querySelector<HTMLInputElement>('[data-autofocus="true"]')?.focus();
              }}
              className="absolute right-3 p-1 rounded-full text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {query.trim().length < 2 && (
          <div className="space-y-3 modal-stagger-item">
            {isMetaLoading ? (
              <GlobalSearchMetaSkeleton />
            ) : (
              <>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Recent searches
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recent.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        No recent searches yet.
                      </span>
                    )}
                    {recent.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setQuery(item);
                          setResultFilter("all");
                        }}
                        className="rounded-full border border-border/70 px-2.5 py-1 text-xs hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {hasPinned && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Pinned results
                    </p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {pinned.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="w-full flex items-center justify-between rounded-md border border-border/70 px-2.5 py-2 text-left hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
                          onClick={() => {
                            if (item.conversationId) {
                              openConversation(item.conversationId);
                              ensureConversationMessagesLoaded(item.conversationId);
                              return;
                            }

                            if (item.commandId) {
                              runCommandAction(item.commandId);
                              return;
                            }

                            if (item.userId) {
                              navigate(`/profile/${item.userId}`);
                              setOpen(false);
                              return;
                            }

                            if (item.postId) {
                              navigate(`/post/${item.postId}`);
                              setOpen(false);
                            }
                          }}
                        >
                          <span className="text-sm truncate">{item.label}</span>
                          <Pin className="chat-pin-active size-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Quick actions
                  </p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {commandResults.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        No quick actions match this keyword.
                      </span>
                    )}

                    {commandResults.slice(0, 8).map((item) => {
                      if (item.type !== "command") {
                        return null;
                      }

                      return (
                        <button
                          key={toResultKey(item)}
                          type="button"
                          className="w-full flex items-center justify-between rounded-md border border-border/70 px-2.5 py-2 text-left hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
                          onClick={() => runCommandAction(item.commandId)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {item.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.subtitle}
                            </span>
                          </span>

                          <Command className="size-3.5 text-muted-foreground/75" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {query.trim().length >= 2 && (
          <div className="max-h-[420px] min-h-[320px] overflow-y-auto space-y-2 pr-1 modal-stagger-item">
            <div className="sticky top-0 z-[1] rounded-md border border-border/50 bg-background/95 px-2 py-2 backdrop-blur">
              <div className="flex flex-wrap items-center gap-1.5">
                {RESULT_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1",
                      resultFilter === item.value
                        ? "border-primary/45 bg-primary/10 text-primary"
                        : "border-border/70 bg-background text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                    onClick={() => {
                      setResultFilter(item.value);
                      setActiveResultIndex(0);
                    }}
                  >
                    {item.label} ({filterCounts[item.value]})
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Enter to run primary action | Cmd/Ctrl+Enter opens profile for people.
              </p>
            </div>

            {isSearchingRemote && mergedResults.length === 0 ? (
              <GlobalSearchResultsSkeleton />
            ) : (
              <>
                <div
                  className={cn(
                    "rounded-lg border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground transition-opacity duration-200",
                    hasSearchResults
                      ? "opacity-0 h-0 overflow-hidden p-0 border-transparent"
                      : "opacity-100",
                  )}
                >
                  No results found.
                </div>

                <div
                  className={cn(
                    "space-y-2 transition-opacity duration-200",
                    hasSearchResults ? "opacity-100" : "opacity-0",
                  )}
                >
                  {filteredResults.map((item, index) => {
                    const pinnedState = pinned.some(
                      (entry) => entry.key === toResultKey(item),
                    );
                    const isActive = index === activeResultIndex;
                    const resultTitle = getResultTitle(item);
                    const resultSubtitle = getResultSubtitle(item);

                    return (
                      <div
                        key={toResultKey(item)}
                        ref={(node) => {
                          resultRowRefs.current[index] = node;
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border border-border/70 p-2.5 transition-colors focus-within:ring-2 focus-within:ring-primary/25",
                          isActive
                            ? "bg-muted/50 ring-2 ring-primary/25"
                            : "hover:bg-muted/40",
                        )}
                      >
                        <div
                          className={cn(
                            "size-8 rounded-full flex items-center justify-center border",
                            item.type === "command" && "bg-secondary/65 text-foreground border-border/50",
                            item.type === "people" && "bg-info/10 text-info border-info/20",
                            item.type === "groups" && "bg-online/10 text-online border-online/20",
                            item.type === "messages" && "bg-primary/10 text-primary border-primary/20",
                            item.type === "posts" && "bg-warning/10 text-warning border-warning/20",
                          )}
                        >
                          {item.type === "command" && <Command className="size-[18px]" />}
                          {item.type === "people" && <Users className="size-[18px]" />}
                          {item.type === "groups" && <MessagesSquare className="size-[18px]" />}
                          {item.type === "messages" && <Search className="size-[18px]" />}
                          {item.type === "posts" && <FileText className="size-[18px]" />}
                        </div>

                        <button
                          type="button"
                          onClick={() => onSelectResult(item)}
                          onMouseEnter={() => setActiveResultIndex(index)}
                          className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1"
                        >
                          <p className="truncate text-sm font-medium">
                            {resultTitle}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {resultSubtitle}
                          </p>
                        </button>

                        {item.type === "people" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onSelectResult(item, "profile")}
                            title="Open profile"
                          >
                            <UserCircle className="size-4 text-muted-foreground" />
                          </Button>
                        )}

                        {item.type === "messages" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onSelectResult(item)}
                            title="Open message in chat"
                          >
                            <MessageSquareText className="size-4 text-muted-foreground" />
                          </Button>
                        )}

                        {item.type === "posts" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onSelectResult(item)}
                            title="Open post"
                          >
                            <FileText className="size-4 text-muted-foreground" />
                          </Button>
                        )}

                        {item.type === "command" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onSelectResult(item)}
                            title="Run action"
                          >
                            <Command className="size-4 text-muted-foreground" />
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => togglePin(item)}
                          title={pinnedState ? "Unpin" : "Pin"}
                        >
                          <Star
                            className={cn(
                              "size-4",
                              pinnedState
                                ? "chat-pin-active chat-pin-active-fill"
                                : "text-muted-foreground",
                            )}
                          />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GlobalSearchDialog;
