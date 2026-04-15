import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bookmark,
  Clock3,
  PencilLine,
  Tags,
  Pin,
  PinOff,
  Download,
  X,
  CheckSquare,
  Square,
  ExternalLink,
  Image as ImageIcon,
  MessageSquare,
  Users,
  Trash2,
  Tag,
  Search,
  SlidersHorizontal,
  ChevronDown,
  NotebookText,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import SavedMessageSkeleton from "@/components/skeleton/SavedMessageSkeleton";
import LoadingMoreSkeleton from "@/components/skeleton/LoadingMoreSkeleton";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBookmarkStore } from "@/stores/useBookmarkStore";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";

type SavedPreset = "all" | "recent" | "tagged" | "notes" | "images" | "text";

type SavedPinnedQuery = {
  searchQuery: string;
  preset: SavedPreset;
  conversationFilter: string;
  fromDate: string;
  toDate: string;
  collectionFilter: string;
  updatedAt: string;
};

const RECENT_WINDOW_DAYS = 7;
const RECENT_WINDOW_MS = RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const SAVED_PINNED_QUERY_KEY = "moji-saved-pinned-query-v2";

const isValidSavedPreset = (value: unknown): value is SavedPreset => {
  const normalized = typeof value === "string" ? value : "";
  return ["all", "recent", "tagged", "notes", "images", "text"].includes(
    normalized,
  );
};

const toSafeString = (value: unknown) => {
  return typeof value === "string" ? value : "";
};

const parsePinnedQuery = (rawValue: string | null): SavedPinnedQuery | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<SavedPinnedQuery>;
    const preset = isValidSavedPreset(parsed?.preset) ? parsed.preset : "all";

    return {
      searchQuery: toSafeString(parsed?.searchQuery),
      preset,
      conversationFilter: toSafeString(parsed?.conversationFilter),
      fromDate: toSafeString(parsed?.fromDate),
      toDate: toSafeString(parsed?.toDate),
      collectionFilter: toSafeString(parsed?.collectionFilter),
      updatedAt: toSafeString(parsed?.updatedAt),
    };
  } catch {
    return null;
  }
};

const SAVED_PRESETS: Array<{
  key: SavedPreset;
  label: string;
  Icon: LucideIcon;
}> = [
  { key: "all", label: "All", Icon: Bookmark },
  { key: "recent", label: "Recent", Icon: Clock3 },
  { key: "tagged", label: "Tagged", Icon: Tags },
  { key: "notes", label: "With notes", Icon: NotebookText },
  { key: "images", label: "Images", Icon: ImageIcon },
  { key: "text", label: "Text", Icon: MessageSquare },
];

const SAVED_PRESET_KEYS: SavedPreset[] = [
  "all",
  "recent",
  "tagged",
  "notes",
  "images",
  "text",
];

const SavedMessagesPage = () => { // NOSONAR
  const navigate = useNavigate();
  const { bookmarks, pagination, fetchBookmarks, updateBookmarkMeta, loading } =
    useBookmarkStore();
  const { bulkRemoveTag, bulkRemoveCollection } = useBookmarkStore();
  const {
    conversations,
    fetchConversations,
    setActiveConversation,
    fetchMessages,
  } = useChatStore();
  const { user } = useAuthStore();

  const [conversationFilter, setConversationFilter] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [savedPreset, setSavedPreset] = useState<SavedPreset>("all");
  const [pinnedQuery, setPinnedQuery] = useState<SavedPinnedQuery | null>(null);
  const [pinnedQueryHydrated, setPinnedQueryHydrated] = useState(false);

  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [collectionDraft, setCollectionDraft] = useState("");
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [bulkTagToRemove, setBulkTagToRemove] = useState("");
  const [bulkCollectionToRemove, setBulkCollectionToRemove] = useState("");
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const presetButtonRefs = useRef<Record<SavedPreset, HTMLButtonElement | null>>({
    all: null,
    recent: null,
    tagged: null,
    notes: null,
    images: null,
    text: null,
  });
  const savedResultsRegionId = "saved-messages-results";

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    const parsedPinnedQuery = parsePinnedQuery(
      globalThis.localStorage.getItem(SAVED_PINNED_QUERY_KEY),
    );

    if (!parsedPinnedQuery) {
      setPinnedQueryHydrated(true);
      return;
    }

    setPinnedQuery(parsedPinnedQuery);
    setSearchQuery(parsedPinnedQuery.searchQuery);
    setSavedPreset(parsedPinnedQuery.preset);
    setConversationFilter(parsedPinnedQuery.conversationFilter);
    setFromDate(parsedPinnedQuery.fromDate);
    setToDate(parsedPinnedQuery.toDate);
    setCollectionFilter(parsedPinnedQuery.collectionFilter);
    setPinnedQueryHydrated(true);
  }, []);

  useEffect(() => {
    if (!pinnedQueryHydrated) {
      return;
    }

    fetchBookmarks({
      conversationId: conversationFilter || undefined,
      collection: collectionFilter || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      page: 1,
      limit: 30,
      append: false,
    });
  }, [
    fetchBookmarks,
    conversationFilter,
    collectionFilter,
    fromDate,
    toDate,
    pinnedQueryHydrated,
  ]);

  const conversationOptions = useMemo(() => {
    return conversations.map((conversation) => ({
      _id: conversation._id,
      label:
        conversation.type === "group"
          ? conversation.group?.name || "Untitled group"
          : conversation.participants?.find(
              (participant) => String(participant._id) !== String(user?._id),
            )?.displayName || "Direct",
    }));
  }, [conversations, user?._id]);

  const presetCounts = useMemo<Record<SavedPreset, number>>(() => {
    const now = Date.now();
    return bookmarks.reduce<Record<SavedPreset, number>>(
      (acc, bookmark) => {
        const hasImage = Boolean(bookmark.messageId.imgUrl);
        const hasText = Boolean(String(bookmark.messageId.content || "").trim());
        const hasTags = (bookmark.tags?.length || 0) > 0;
        const hasNote = Boolean(String(bookmark.note || "").trim());
        const isRecent = now - new Date(bookmark.createdAt).getTime() <= RECENT_WINDOW_MS;

        acc.all += 1;
        if (isRecent) acc.recent += 1;
        if (hasTags) acc.tagged += 1;
        if (hasNote) acc.notes += 1;
        if (hasImage) acc.images += 1;
        if (!hasImage && hasText) acc.text += 1;

        return acc;
      },
      {
        all: 0,
        recent: 0,
        tagged: 0,
        notes: 0,
        images: 0,
        text: 0,
      },
    );
  }, [bookmarks]);

  const collectionCounts = useMemo(() => {
    const counts = new Map<string, number>();

    bookmarks.forEach((bookmark) => {
      (bookmark.collections || []).forEach((collectionName) => {
        const normalized = String(collectionName || "")
          .trim()
          .toLowerCase();
        if (!normalized) {
          return;
        }

        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const countDiff = b.count - a.count;
        if (countDiff !== 0) {
          return countDiff;
        }

        return a.name.localeCompare(b.name);
      });
  }, [bookmarks]);

  const currentQuery = useMemo<SavedPinnedQuery>(
    () => ({
      searchQuery,
      preset: savedPreset,
      conversationFilter,
      fromDate,
      toDate,
      collectionFilter,
      updatedAt: new Date().toISOString(),
    }),
    [
      searchQuery,
      savedPreset,
      conversationFilter,
      fromDate,
      toDate,
      collectionFilter,
    ],
  );

  const isPinnedQueryActive = useMemo(() => {
    if (!pinnedQuery) {
      return false;
    }

    return (
      pinnedQuery.searchQuery === searchQuery &&
      pinnedQuery.preset === savedPreset &&
      pinnedQuery.conversationFilter === conversationFilter &&
      pinnedQuery.fromDate === fromDate &&
      pinnedQuery.toDate === toDate &&
      pinnedQuery.collectionFilter === collectionFilter
    );
  }, [
    pinnedQuery,
    searchQuery,
    savedPreset,
    conversationFilter,
    fromDate,
    toDate,
    collectionFilter,
  ]);

  const pinCurrentQuery = useCallback(() => {
    const nextPinnedQuery = {
      ...currentQuery,
      updatedAt: new Date().toISOString(),
    };

    globalThis.localStorage.setItem(
      SAVED_PINNED_QUERY_KEY,
      JSON.stringify(nextPinnedQuery),
    );

    setPinnedQuery(nextPinnedQuery);
    toast.success("Pinned current query");
  }, [currentQuery]);

  const clearPinnedQuery = useCallback(() => {
    globalThis.localStorage.removeItem(SAVED_PINNED_QUERY_KEY);
    setPinnedQuery(null);
    toast.success("Pinned query removed");
  }, []);

  const applyPinnedQuery = useCallback(() => {
    if (!pinnedQuery) {
      toast.error("No pinned query available");
      return;
    }

    setSearchQuery(pinnedQuery.searchQuery);
    setSavedPreset(pinnedQuery.preset);
    setConversationFilter(pinnedQuery.conversationFilter);
    setFromDate(pinnedQuery.fromDate);
    setToDate(pinnedQuery.toDate);
    setCollectionFilter(pinnedQuery.collectionFilter);
    toast.success("Pinned query applied");
  }, [pinnedQuery]);

  const filteredBookmarks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const normalizedCollectionFilter = collectionFilter.trim().toLowerCase();

    return bookmarks.filter((bookmark) => {
      const content = String(bookmark.messageId.content || "").toLowerCase();
      const note = String(bookmark.note || "").toLowerCase();
      const tags = (bookmark.tags || []).join(" ").toLowerCase();
      const collections = (bookmark.collections || [])
        .map((item) => String(item || "").toLowerCase())
        .join(" ");

      if (
        normalizedQuery &&
        !content.includes(normalizedQuery) &&
        !note.includes(normalizedQuery) &&
        !tags.includes(normalizedQuery) &&
        !collections.includes(normalizedQuery)
      ) {
        return false;
      }

      if (
        normalizedCollectionFilter &&
        !(bookmark.collections || [])
          .map((item) => String(item || "").toLowerCase())
          .includes(normalizedCollectionFilter)
      ) {
        return false;
      }

      const hasImage = Boolean(bookmark.messageId.imgUrl);
      const hasText = Boolean(String(bookmark.messageId.content || "").trim());
      const hasTags = (bookmark.tags?.length || 0) > 0;
      const hasNote = Boolean(String(bookmark.note || "").trim());
      const isRecent = now - new Date(bookmark.createdAt).getTime() <= RECENT_WINDOW_MS;

      if (savedPreset === "recent") return isRecent;
      if (savedPreset === "tagged") return hasTags;
      if (savedPreset === "notes") return hasNote;
      if (savedPreset === "images") return hasImage;
      if (savedPreset === "text") return !hasImage && hasText;

      return true;
    });
  }, [bookmarks, savedPreset, searchQuery, collectionFilter]);

  const handlePresetKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = SAVED_PRESET_KEYS.indexOf(savedPreset);
    if (currentIndex < 0) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % SAVED_PRESET_KEYS.length;
      const nextPreset = SAVED_PRESET_KEYS[nextIndex];
      setSavedPreset(nextPreset);
      presetButtonRefs.current[nextPreset]?.focus();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const nextIndex =
        (currentIndex - 1 + SAVED_PRESET_KEYS.length) % SAVED_PRESET_KEYS.length;
      const nextPreset = SAVED_PRESET_KEYS[nextIndex];
      setSavedPreset(nextPreset);
      presetButtonRefs.current[nextPreset]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSavedPreset("all");
      presetButtonRefs.current.all?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setSavedPreset("text");
      presetButtonRefs.current.text?.focus();
    }
  };

  const openConversation = useCallback(async (conversationId: string) => {
    setActiveConversation(conversationId);
    await fetchMessages(conversationId);
    navigate("/");
  }, [fetchMessages, navigate, setActiveConversation]);

  const loadMoreBookmarks = async () => {
    if (!pagination.hasNextPage || loading) return;
    await fetchBookmarks({
      conversationId: conversationFilter || undefined,
      collection: collectionFilter || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      page: pagination.page + 1,
      limit: pagination.limit,
      append: true,
    });
  };

  const toggleBookmarkSelection = (bookmarkId: string) => {
    setSelectedBookmarkIds((current) =>
      current.includes(bookmarkId)
        ? current.filter((id) => id !== bookmarkId)
        : [...current, bookmarkId],
    );
  };

  const selectAllVisible = () => {
    const visibleIds = filteredBookmarks.map((b) => b._id);
    setSelectedBookmarkIds((current) => {
      const merged = new Set([...current, ...visibleIds]);
      return Array.from(merged);
    });
  };

  const clearSelection = () => setSelectedBookmarkIds([]);

  const exportSelectedCsv = () => {
    if (selectedBookmarkIds.length === 0) {
      toast.error("Select at least one bookmark to export");
      return;
    }
    const selected = bookmarks.filter((b) => selectedBookmarkIds.includes(b._id));
    const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      [
        "bookmarkId",
        "conversationId",
        "savedAt",
        "content",
        "note",
        "tags",
        "collections",
      ],
      ...selected.map((b) => [
        b._id,
        b.messageId.conversationId,
        b.createdAt,
        b.messageId.content || "",
        b.note || "",
        (b.tags || []).join("|"),
        (b.collections || []).join("|"),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => escapeCsv(String(value || ""))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `saved-messages-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selected.length} bookmarks`);
  };

  const handleBulkRemoveTag = async () => {
    if (selectedBookmarkIds.length === 0) {
      toast.error("Select bookmarks first");
      return;
    }
    const normalizedTag = bulkTagToRemove.trim().toLowerCase();
    if (!normalizedTag) {
      toast.error("Enter a tag to remove");
      return;
    }
    const ok = await bulkRemoveTag(selectedBookmarkIds, normalizedTag);
    if (!ok) {
      toast.error("Could not remove tag in bulk");
      return;
    }
    toast.success(`Removed tag "${normalizedTag}" from ${selectedBookmarkIds.length} bookmarks`);
    setBulkTagToRemove("");
  };

  const handleBulkRemoveCollection = async () => {
    if (selectedBookmarkIds.length === 0) {
      toast.error("Select bookmarks first");
      return;
    }

    const normalizedCollection = bulkCollectionToRemove.trim().toLowerCase();
    if (!normalizedCollection) {
      toast.error("Enter a collection to remove");
      return;
    }

    const ok = await bulkRemoveCollection(
      selectedBookmarkIds,
      normalizedCollection,
    );
    if (!ok) {
      toast.error("Could not remove collection in bulk");
      return;
    }

    toast.success(
      `Removed collection "${normalizedCollection}" from ${selectedBookmarkIds.length} bookmarks`,
    );
    setBulkCollectionToRemove("");
  };

  const startEditing = (
    bookmarkId: string,
    note?: string,
    tags?: string[],
    collections?: string[],
  ) => {
    setEditingBookmarkId(bookmarkId);
    setNoteDraft(note || "");
    setTagDraft((tags || []).join(", "));
    setCollectionDraft((collections || []).join(", "));
  };

  const saveBookmarkMeta = async () => {
    if (!editingBookmarkId) return;
    const tags = tagDraft.split(",").map((item) => item.trim()).filter(Boolean);
    const collections = collectionDraft
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const ok = await updateBookmarkMeta(editingBookmarkId, {
      note: noteDraft,
      tags,
      collections,
    });
    if (!ok) {
      toast.error("Could not save bookmark metadata");
      return;
    }
    toast.success("Bookmark updated");
    setEditingBookmarkId(null);
  };

  const unreadCount = selectedBookmarkIds.length;
  const savedItemsWord = bookmarks.length === 1 ? "item" : "items";
  const savedItemsSubtitle =
    bookmarks.length === 0
      ? "Your personal message archive"
      : `${bookmarks.length} saved ${savedItemsWord}`;

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="saved-page-shell">
        <div className="app-shell-panel p-3 md:p-4">
          <div
            className="mx-auto w-full max-w-3xl flex flex-col gap-5 min-h-0"
            aria-label="Saved messages workspace"
          >

            {/* ── Hero Header ─────────────────────────────────────────── */}
            <section className="saved-hero-header" aria-labelledby="saved-messages-title">
              <div className="saved-hero-bg" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="saved-hero-icon">
                    <Bookmark className="size-6 text-white" fill="currentColor" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="saved-hero-eyebrow">Bookmarks</p>
                    <h1 id="saved-messages-title" className="saved-hero-title">Saved Messages</h1>
                    <p className="saved-hero-subtitle">
                      {savedItemsSubtitle}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters((f) => !f)}
                    aria-expanded={showFilters}
                    aria-controls="saved-filter-panel"
                    className={cn(
                      "saved-filter-toggle-btn gap-2",
                      showFilters && "saved-filter-toggle-btn--active",
                    )}
                  >
                    <SlidersHorizontal className="size-3.5" />
                    Filters
                    <ChevronDown className={cn("size-3.5 transition-transform duration-200", showFilters && "rotate-180")} />
                  </Button>
                  <BackToChatCard onClick={() => navigate("/")} />
                </div>
              </div>
            </section>

            {/* ── Search bar + pinned query ───────────────────────────── */}
            <section className="flex flex-wrap items-center gap-2" aria-label="Saved message search and pinned query">
              <div className="relative saved-search-focus-ring rounded-xl flex-1 min-w-[220px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search saved messages, notes, tags, collections..."
                  aria-label="Search saved messages"
                  className="saved-search-input pl-10 h-10 rounded-xl"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="micro-tap-chip absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <Button
                type="button"
                variant={isPinnedQueryActive ? "default" : "outline"}
                size="sm"
                onClick={pinCurrentQuery}
                className="gap-1.5"
                title="Pin current query"
                aria-label="Pin current query"
              >
                <Pin className="size-3.5" />
                Pin query
              </Button>

              {pinnedQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={isPinnedQueryActive ? clearPinnedQuery : applyPinnedQuery}
                  className="gap-1.5"
                  title={isPinnedQueryActive ? "Clear pinned query" : "Apply pinned query"}
                  aria-label={isPinnedQueryActive ? "Clear pinned query" : "Apply pinned query"}
                >
                  {isPinnedQueryActive ? (
                    <>
                      <PinOff className="size-3.5" />
                      Unpin
                    </>
                  ) : (
                    <>
                      <Pin className="size-3.5" />
                      Use pinned
                    </>
                  )}
                </Button>
              )}
            </section>

            {pinnedQuery && (
              <p className="text-xs text-muted-foreground/75">
                Pinned query updated {
                  formatDistanceToNow(
                    Number.isFinite(new Date(pinnedQuery.updatedAt).getTime())
                      ? new Date(pinnedQuery.updatedAt)
                      : new Date(),
                    { addSuffix: true },
                  )
                }
              </p>
            )}

            {/* ── Smart Views ───────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Smart views
              </p>
              {(savedPreset !== "all" || collectionFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSavedPreset("all");
                    setCollectionFilter("");
                  }}
                  className="micro-tap-chip text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Reset views
                </button>
              )}
            </div>

            <div
              className="saved-preset-strip"
              role="tablist"
              aria-label="Saved message smart views"
              onKeyDown={handlePresetKeyDown}
            >
              {SAVED_PRESETS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSavedPreset(key)}
                  data-active={savedPreset === key}
                  className="saved-preset-chip micro-tap-chip"
                  ref={(element) => {
                    presetButtonRefs.current[key] = element;
                  }}
                  role="tab"
                  id={`saved-preset-tab-${key}`}
                  aria-controls={savedResultsRegionId}
                  aria-selected={savedPreset === key}
                  tabIndex={savedPreset === key ? 0 : -1}
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                  <span className="saved-preset-count">{presetCounts[key]}</span>
                </button>
              ))}
            </div>

            {collectionCounts.length > 0 && (
              <div className="saved-preset-strip">
                <button
                  type="button"
                  onClick={() => setCollectionFilter("")}
                  data-active={collectionFilter === ""}
                  className="saved-preset-chip micro-tap-chip"
                >
                  <Tags className="size-3.5" />
                  <span>All collections</span>
                  <span className="saved-preset-count">{collectionCounts.reduce((sum, item) => sum + item.count, 0)}</span>
                </button>

                {collectionCounts.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setCollectionFilter(item.name)}
                    data-active={collectionFilter === item.name}
                    className="saved-preset-chip micro-tap-chip"
                  >
                    <Tags className="size-3.5" />
                    <span>{item.name}</span>
                    <span className="saved-preset-count">{item.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* ── Collapsible Filter Panel ─────────────────────────────── */}
            {showFilters && (
              <div
                id="saved-filter-panel"
                className="saved-filter-panel animate-in fade-in slide-in-from-top-2 duration-200"
                role="region"
                aria-label="Saved message filters"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="saved-filter-conversation" className="saved-filter-label">Conversation</label>
                    <select
                      id="saved-filter-conversation"
                      value={conversationFilter}
                      onChange={(e) => setConversationFilter(e.target.value)}
                      className="saved-filter-select"
                    >
                      <option value="">All conversations</option>
                      {conversationOptions.map((option) => (
                        <option key={option._id} value={option._id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="saved-filter-collection" className="saved-filter-label">Collection</label>
                    <select
                      id="saved-filter-collection"
                      value={collectionFilter}
                      onChange={(e) => setCollectionFilter(e.target.value)}
                      className="saved-filter-select"
                    >
                      <option value="">All collections</option>
                      {collectionCounts.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name} ({item.count})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="saved-filter-from" className="saved-filter-label">From date</label>
                    <Input
                      id="saved-filter-from"
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="saved-filter-input h-9"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="saved-filter-to" className="saved-filter-label">To date</label>
                    <Input
                      id="saved-filter-to"
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="saved-filter-input h-9"
                    />
                  </div>
                </div>
                {(conversationFilter || collectionFilter || fromDate || toDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setConversationFilter("");
                      setCollectionFilter("");
                      setFromDate("");
                      setToDate("");
                    }}
                    className="micro-tap-chip mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {/* ── Selection Toolbar ─────────────────────────────────────── */}
            {filteredBookmarks.length > 0 && (
              <div className="saved-select-toolbar">
                <p className="sr-only" aria-live="polite">
                  {unreadCount > 0
                    ? `${unreadCount} bookmarks selected`
                    : "No bookmarks selected"}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={unreadCount === filteredBookmarks.length ? clearSelection : selectAllVisible}
                    className="saved-select-all-btn micro-tap-chip"
                    aria-label="Toggle select all"
                    aria-pressed={unreadCount === filteredBookmarks.length && unreadCount > 0}
                  >
                    {unreadCount === filteredBookmarks.length && unreadCount > 0
                      ? <CheckSquare className="size-4 text-primary" />
                      : <Square className="size-4 text-muted-foreground" />
                    }
                    <span className="text-xs font-medium">
                      {unreadCount > 0 ? `${unreadCount} selected` : "Select all"}
                    </span>
                  </button>

                  {unreadCount > 0 && (
                    <>
                      <div className="w-px h-4 bg-border/60" />
                      <button
                        type="button"
                        onClick={() => setShowBulkPanel((v) => !v)}
                        className="saved-select-all-btn micro-tap-chip gap-1.5"
                        aria-expanded={showBulkPanel}
                        aria-controls="saved-bulk-panel"
                      >
                        <Tags className="size-3.5" />
                        <span className="text-xs">Bulk metadata</span>
                      </button>
                      <button
                        type="button"
                        onClick={exportSelectedCsv}
                        className="saved-select-all-btn micro-tap-chip gap-1.5"
                      >
                        <Download className="size-3.5" />
                        <span className="text-xs">Export CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="saved-select-all-btn micro-tap-chip gap-1 text-muted-foreground/70"
                      >
                        <X className="size-3.5" />
                        <span className="text-xs">Clear</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Bulk tag sub-panel */}
                {showBulkPanel && unreadCount > 0 && (
                  <div
                    id="saved-bulk-panel"
                    className="saved-bulk-panel animate-in fade-in slide-in-from-top-1 duration-150 space-y-3"
                    role="region"
                    aria-label="Bulk bookmark metadata actions"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                        <Tag className="size-3.5" />
                        Remove tag from {unreadCount} selected
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={bulkTagToRemove}
                          onChange={(e) => setBulkTagToRemove(e.target.value)}
                          placeholder="tag-name"
                          className="h-8 text-sm"
                          onKeyDown={(e) => { if (e.key === "Enter") void handleBulkRemoveTag(); }}
                        />
                        <Button type="button" size="sm" variant="destructive" onClick={handleBulkRemoveTag}>
                          <Trash2 className="size-3.5 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                        <Tags className="size-3.5" />
                        Remove collection from {unreadCount} selected
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={bulkCollectionToRemove}
                          onChange={(e) => setBulkCollectionToRemove(e.target.value)}
                          placeholder="collection-name"
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void handleBulkRemoveCollection();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={handleBulkRemoveCollection}
                        >
                          <Trash2 className="size-3.5 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Bookmark list ───────────────────────────────────────── */}
            <section
              id={savedResultsRegionId}
              className="flex flex-col gap-3 min-h-0"
              role="region"
              aria-live="polite"
              aria-label={`Saved results in ${savedPreset} view`}
            >
              {loading && bookmarks.length === 0 && (
                <SavedMessageSkeleton count={4} />
              )}

              {!loading && filteredBookmarks.length === 0 && (
                <div className="saved-empty-state animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="saved-empty-icon relative">
                    <Bookmark className="size-7 text-muted-foreground/50" />
                    <span className="absolute inset-0 rounded-full border border-muted-foreground/20 animate-ping opacity-20" />
                  </div>
                  <p className="text-[15px] font-semibold text-foreground/80 mt-4">
                    {searchQuery ? `No results for "${searchQuery}"` : "No saved messages yet"}
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-1 max-w-[240px] leading-relaxed">
                    {searchQuery
                      ? "Try different keywords or clear your search"
                      : "Long-press any message in chat to bookmark it here"}
                  </p>
                </div>
              )}

              {filteredBookmarks.map((bookmark, index) => {
                const conversationName =
                  bookmark.conversationId?.type === "group"
                    ? bookmark.conversationId.group?.name || "Untitled group"
                    : bookmark.conversationId.participants?.find(
                        (participant) =>
                          String(participant._id) !== String(user?._id),
                      )?.displayName || "Direct message";

                const isSelected = selectedBookmarkIds.includes(bookmark._id);
                const isEditing = editingBookmarkId === bookmark._id;
                const isImage = Boolean(bookmark.messageId.imgUrl);

                return (
                  <article
                    key={bookmark._id}
                    className={cn(
                      "saved-bookmark-card bookmark-card-hover",
                      isSelected && "saved-bookmark-card--selected",
                      index < 6 && `animate-in fade-in slide-in-from-bottom-2 duration-300`,
                    )}
                    style={{ animationDelay: `${Math.min(index, 5) * 40}ms` }}
                    aria-label={`Saved message from ${conversationName}`}
                  >
                    {/* Card top row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleBookmarkSelection(bookmark._id)}
                          className="micro-tap-chip mt-0.5 flex-shrink-0 transition-transform duration-150 hover:scale-110"
                          aria-label={isSelected ? "Deselect" : "Select"}
                          aria-pressed={isSelected}
                        >
                          {isSelected
                            ? <CheckSquare className="size-4 text-primary" />
                            : <Square className="size-4 text-muted-foreground/40 hover:text-muted-foreground" />
                          }
                        </button>

                        {/* Meta info */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="saved-convo-badge">
                              {bookmark.conversationId?.type === "group" ? (
                                <Users className="size-3.5" />
                              ) : (
                                <MessageSquare className="size-3.5" />
                              )}
                              {conversationName}
                            </span>
                            {isImage && (
                              <span className="saved-type-badge">
                                <ImageIcon className="size-2.5" />
                                Image
                              </span>
                            )}
                            {!isImage && (
                              <span className="saved-type-badge saved-type-badge--text">
                                <MessageSquare className="size-2.5" />
                                Text
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground/60 mt-1">
                            Saved {formatDistanceToNow(new Date(bookmark.createdAt), { addSuffix: true })}
                            {" | "}
                            {format(new Date(bookmark.createdAt), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openConversation(bookmark.messageId.conversationId)}
                        className="flex-shrink-0 gap-1.5 text-xs h-7 px-2.5 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                        aria-label={`Open ${conversationName} conversation`}
                      >
                        <ExternalLink className="size-3.5" />
                        Open
                      </Button>
                    </div>

                    {/* Message content */}
                    <div className={cn(
                      "saved-message-content mt-3",
                      bookmark.messageId.isDeleted && "opacity-50 italic",
                    )}>
                      {bookmark.messageId.isDeleted
                        ? (
                          <span className="flex items-center gap-1.5 text-muted-foreground/70">
                            <X className="size-3.5" />
                            Message was removed
                          </span>
                        )
                        : bookmark.messageId.content || (
                          <span className="flex items-center gap-1.5 text-muted-foreground/70">
                            <ImageIcon className="size-3.5" />
                            Image message
                          </span>
                        )}
                    </div>

                    {/* Collections, Tags & Note */}
                    {(bookmark.collections?.length || bookmark.tags?.length || bookmark.note) && !isEditing && (
                      <div className="mt-3 flex flex-wrap gap-2 items-start">
                        {(bookmark.collections || []).map((collectionName) => (
                          <span key={`collection-${collectionName}`} className="saved-type-badge">
                            <Tags className="size-2.5" />
                            {collectionName}
                          </span>
                        ))}
                        {(bookmark.tags || []).map((tag) => (
                          <span key={tag} className="saved-tag-chip">
                            #{tag}
                          </span>
                        ))}
                        {bookmark.note && (
                          <div className="w-full mt-1 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">
                            {bookmark.note}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Edit mode */}
                    {isEditing ? (
                      <div className="mt-3 space-y-2 rounded-xl border border-primary/30 bg-primary/[0.03] p-3 animate-in fade-in duration-150">
                        <p className="text-[11px] font-semibold text-primary/80 mb-1">Edit metadata</p>
                        <Input
                          value={tagDraft}
                          onChange={(e) => setTagDraft(e.target.value)}
                          placeholder="tags, separated, by comma"
                          className="h-8 text-sm"
                          aria-label="Edit bookmark tags"
                        />
                        <Input
                          value={collectionDraft}
                          onChange={(e) => setCollectionDraft(e.target.value)}
                          placeholder="collections, separated, by comma"
                          className="h-8 text-sm"
                          aria-label="Edit bookmark collections"
                        />
                        <textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          className="min-h-[64px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                          placeholder="Personal note…"
                          aria-label="Edit bookmark note"
                        />
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" onClick={saveBookmarkMeta} className="h-7 px-3">
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingBookmarkId(null)}
                            className="h-7 px-3"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center justify-between">
                        {!(bookmark.collections?.length) && !(bookmark.tags?.length) && !bookmark.note && (
                          <span className="text-[11px] text-muted-foreground/40 italic">No metadata yet</span>
                        )}
                        <div className={cn("flex items-center gap-1", (bookmark.collections?.length || bookmark.tags?.length || bookmark.note) && "ml-auto")}>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              startEditing(
                                bookmark._id,
                                bookmark.note,
                                bookmark.tags,
                                bookmark.collections,
                              )
                            }
                            className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground/70 hover:text-foreground rounded-lg"
                          >
                            <PencilLine className="size-3" />
                            Edit metadata
                          </Button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}

              {/* Load more */}
              {pagination.hasNextPage && (
                <div className="flex justify-center pt-2">
                  {loading ? (
                    <LoadingMoreSkeleton />
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={loadMoreBookmarks}
                      className="h-9 rounded-xl px-6 text-sm border-border/60 hover:border-border hover:bg-muted/50"
                      aria-label="Load more saved messages"
                    >
                      Load more
                    </Button>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SavedMessagesPage;
