import { useEffect, useMemo, useRef, useState } from "react";
import { Pin, Search, Star, Users, MessagesSquare } from "lucide-react";
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
import GlobalSearchResultsSkeleton from "@/components/skeleton/GlobalSearchResultsSkeleton";
import GlobalSearchMetaSkeleton from "@/components/skeleton/GlobalSearchMetaSkeleton";
import { cn } from "@/lib/utils";
import type {
  GlobalSearchGroup,
  GlobalSearchMessage,
  GlobalSearchPerson,
  GlobalSearchResponse,
} from "@/types/chat";

const RECENT_KEY = "coming-search-recent";
const PINNED_KEY = "coming-search-pinned";

type SearchResultItem =
  | ({ type: "people" } & GlobalSearchPerson)
  | ({ type: "groups" } & GlobalSearchGroup)
  | ({ type: "messages" } & GlobalSearchMessage);

interface PinnedSearchItem {
  key: string;
  label: string;
  type: "people" | "groups" | "messages";
  conversationId?: string;
  userId?: string;
}

const toResultKey = (item: SearchResultItem) => {
  if (item.type === "people") return `people:${item._id}`;
  if (item.type === "groups") return `groups:${item.conversationId}`;
  return `messages:${item.messageId}`;
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

  addAll(remote.people.map((item) => ({ ...item, type: "people" })));
  addAll(remote.groups.map((item) => ({ ...item, type: "groups" })));
  addAll(remote.messages.map((item) => ({ ...item, type: "messages" })));

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
  } = useChatStore();
  const { user } = useAuthStore();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [pinned, setPinned] = useState<PinnedSearchItem[]>([]);
  const [isMetaLoading, setIsMetaLoading] = useState(false);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [remoteResult, setRemoteResult] = useState<GlobalSearchResponse>({
    people: [],
    groups: [],
    messages: [],
  });

  const hasLoadedMetaRef = useRef(false);

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
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", handleGlobalShortcut);
    return () => document.removeEventListener("keydown", handleGlobalShortcut);
  }, []);

  const localResult = useMemo<GlobalSearchResponse>(() => {
    const normalized = query.trim().toLowerCase();

    if (normalized.length < 2) {
      return { people: [], groups: [], messages: [] };
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
    };
  }, [query, conversations, messages, user?._id]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setRemoteResult({ people: [], groups: [], messages: [] });
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

  const mergedResults = useMemo(
    () => mergeResults(localResult, remoteResult),
    [localResult, remoteResult],
  );

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
    if (item.type === "people") {
      label = item.displayName;
    } else if (item.type === "groups") {
      label = item.name;
    } else {
      label = item.content;
    }

    const normalizedConversationId = item.conversationId ?? undefined;

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
          },
          ...pinned,
        ].slice(0, 20);

    setPinned(next);
    localStorage.setItem(PINNED_KEY, JSON.stringify(next));
  };

  const onSelectResult = async (item: SearchResultItem) => {
    saveRecentQuery(query);

    if (item.type === "people") {
      if (item.conversationId) {
        setActiveConversation(item.conversationId);
        await fetchMessages(item.conversationId);
      } else {
        const ok = await createConversation("direct", "", [item._id]);
        if (!ok) {
          return;
        }
      }
    }

    if (item.type === "groups") {
      setActiveConversation(item.conversationId);
      await fetchMessages(item.conversationId);
    }

    if (item.type === "messages") {
      setActiveConversation(item.conversationId);
      await fetchMessages(item.conversationId);
    }

    navigate("/");
    setOpen(false);
  };

  const hasPinned = pinned.length > 0;
  const hasSearchResults = mergedResults.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!globalOnly && (
        <DialogTrigger asChild>
          <button
            type="button"
            className="group hidden md:flex items-center gap-2 min-w-[160px] max-w-[220px] px-3 py-1.5 rounded-xl border border-border/50 bg-muted/40 text-sm text-muted-foreground transition-all duration-200 hover:bg-muted/70 hover:text-foreground hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
            <span className="flex-1 text-left text-[12px] truncate">Search...</span>
            <kbd className="hidden sm:inline-flex items-center rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 shrink-0">
              ⌘K
            </kbd>
          </button>
        </DialogTrigger>
      )}

      <DialogContent 
        className="modal-content-shell sm:max-w-3xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.querySelector<HTMLInputElement>('[data-autofocus="true"]')?.focus();
        }}
      >
        <DialogHeader className="modal-stagger-item">
          <DialogTitle>Global search</DialogTitle>
          <DialogDescription className="sr-only">
            Search for people, groups, or messages across the platform
          </DialogDescription>
        </DialogHeader>

        <Input
          data-autofocus="true"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people, groups, messages..."
          className="modal-stagger-item"
        />

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
                        onClick={() => setQuery(item)}
                        className="rounded-full border border-border/70 px-2.5 py-1 text-xs hover:bg-muted/70"
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
                          className="w-full flex items-center justify-between rounded-md border border-border/70 px-2.5 py-2 text-left hover:bg-muted/70 hover:text-foreground"
                          onClick={() => {
                            if (item.conversationId) {
                              setActiveConversation(item.conversationId);
                              navigate("/");
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
              </>
            )}
          </div>
        )}

        {query.trim().length >= 2 && (
          <div className="max-h-[420px] min-h-[320px] overflow-y-auto space-y-2 pr-1 modal-stagger-item">
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
                  {mergedResults.map((item) => {
                    const pinnedState = pinned.some(
                      (entry) => entry.key === toResultKey(item),
                    );

                    let resultTitle = "";
                    if (item.type === "people") {
                      resultTitle = item.displayName;
                    } else if (item.type === "groups") {
                      resultTitle = item.name;
                    } else {
                      resultTitle = item.content;
                    }

                    let resultSubtitle = "";
                    if (item.type === "people") {
                      resultSubtitle = `@${item.username} • ${item.mutualGroupsCount} mutual groups`;
                    } else if (item.type === "groups") {
                      resultSubtitle = `${item.membersCount} members`;
                    } else {
                      resultSubtitle = `in conversation ${item.conversationId}`;
                    }

                    return (
                      <div
                        key={toResultKey(item)}
                        className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5 hover:bg-muted/40"
                      >
                        <div className="size-8 rounded-full bg-muted flex items-center justify-center">
                          {item.type === "people" && <Users className="size-4" />}
                          {item.type === "groups" && (
                            <MessagesSquare className="size-4" />
                          )}
                          {item.type === "messages" && <Search className="size-4" />}
                        </div>

                        <button
                          type="button"
                          onClick={() => onSelectResult(item)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-medium">
                            {resultTitle}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {resultSubtitle}
                          </p>
                        </button>

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
