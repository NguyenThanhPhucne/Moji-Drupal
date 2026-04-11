import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bookmark,
  PencilLine,
  Tags,
  Download,
  X,
  CheckSquare,
  Square,
  ExternalLink,
  Image as ImageIcon,
  MessageSquare,
  Trash2,
  Tag,
  Search,
  SlidersHorizontal,
  ChevronDown,
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

const SavedMessagesPage = () => {
  const navigate = useNavigate();
  const { bookmarks, pagination, fetchBookmarks, updateBookmarkMeta, loading } =
    useBookmarkStore();
  const { bulkRemoveTag } = useBookmarkStore();
  const {
    conversations,
    fetchConversations,
    setActiveConversation,
    fetchMessages,
  } = useChatStore();
  const { user } = useAuthStore();

  const [conversationFilter, setConversationFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [bulkTagToRemove, setBulkTagToRemove] = useState("");
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    fetchBookmarks({
      conversationId: conversationFilter || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      page: 1,
      limit: 30,
      append: false,
    });
  }, [fetchBookmarks, conversationFilter, fromDate, toDate]);

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

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarks;
    const q = searchQuery.toLowerCase();
    return bookmarks.filter((b) => {
      const content = (b.messageId.content || "").toLowerCase();
      const note = (b.note || "").toLowerCase();
      const tags = (b.tags || []).join(" ").toLowerCase();
      return content.includes(q) || note.includes(q) || tags.includes(q);
    });
  }, [bookmarks, searchQuery]);

  const openConversation = useCallback(async (conversationId: string) => {
    setActiveConversation(conversationId);
    await fetchMessages(conversationId);
    navigate("/");
  }, [fetchMessages, navigate, setActiveConversation]);

  const loadMoreBookmarks = async () => {
    if (!pagination.hasNextPage || loading) return;
    await fetchBookmarks({
      conversationId: conversationFilter || undefined,
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
      ["bookmarkId", "conversationId", "savedAt", "content", "note", "tags"],
      ...selected.map((b) => [
        b._id,
        b.messageId.conversationId,
        b.createdAt,
        b.messageId.content || "",
        b.note || "",
        (b.tags || []).join("|"),
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

  const startEditing = (bookmarkId: string, note?: string, tags?: string[]) => {
    setEditingBookmarkId(bookmarkId);
    setNoteDraft(note || "");
    setTagDraft((tags || []).join(", "));
  };

  const saveBookmarkMeta = async () => {
    if (!editingBookmarkId) return;
    const tags = tagDraft.split(",").map((item) => item.trim()).filter(Boolean);
    const ok = await updateBookmarkMeta(editingBookmarkId, { note: noteDraft, tags });
    if (!ok) {
      toast.error("Could not save bookmark metadata");
      return;
    }
    toast.success("Bookmark updated");
    setEditingBookmarkId(null);
  };

  const unreadCount = selectedBookmarkIds.length;

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="saved-page-shell">
        <div className="app-shell-panel p-3 md:p-4">
          <div className="mx-auto w-full max-w-3xl flex flex-col gap-5 min-h-0">

            {/* ── Hero Header ─────────────────────────────────────────── */}
            <div className="saved-hero-header">
              <div className="saved-hero-bg" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="saved-hero-icon">
                    <Bookmark className="size-6 text-white" fill="currentColor" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="saved-hero-eyebrow">Bookmarks</p>
                    <h1 className="saved-hero-title">Saved Messages</h1>
                    <p className="saved-hero-subtitle">
                      {bookmarks.length > 0
                        ? `${bookmarks.length} saved item${bookmarks.length !== 1 ? "s" : ""}`
                        : "Your personal message archive"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters((f) => !f)}
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
            </div>

            {/* ── Search bar ──────────────────────────────────────────── */}
            <div className="relative saved-search-focus-ring rounded-xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60 pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search saved messages, notes, tags…"
                className="saved-search-input pl-10 h-10 rounded-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* ── Collapsible Filter Panel ─────────────────────────────── */}
            {showFilters && (
              <div className="saved-filter-panel animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="saved-filter-label">Conversation</label>
                    <select
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
                    <label className="saved-filter-label">From date</label>
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="saved-filter-input h-9"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="saved-filter-label">To date</label>
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="saved-filter-input h-9"
                    />
                  </div>
                </div>
                {(conversationFilter || fromDate || toDate) && (
                  <button
                    type="button"
                    onClick={() => { setConversationFilter(""); setFromDate(""); setToDate(""); }}
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {/* ── Selection Toolbar ─────────────────────────────────────── */}
            {filteredBookmarks.length > 0 && (
              <div className="saved-select-toolbar">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={unreadCount === filteredBookmarks.length ? clearSelection : selectAllVisible}
                    className="saved-select-all-btn"
                    aria-label="Toggle select all"
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
                        className="saved-select-all-btn gap-1.5"
                      >
                        <Tags className="size-3.5" />
                        <span className="text-xs">Bulk tag</span>
                      </button>
                      <button
                        type="button"
                        onClick={exportSelectedCsv}
                        className="saved-select-all-btn gap-1.5"
                      >
                        <Download className="size-3.5" />
                        <span className="text-xs">Export CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="saved-select-all-btn gap-1 text-muted-foreground/70"
                      >
                        <X className="size-3.5" />
                        <span className="text-xs">Clear</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Bulk tag sub-panel */}
                {showBulkPanel && unreadCount > 0 && (
                  <div className="saved-bulk-panel animate-in fade-in slide-in-from-top-1 duration-150">
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
                )}
              </div>
            )}

            {/* ── Bookmark list ───────────────────────────────────────── */}
            <div className="flex flex-col gap-3 min-h-0">
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
                  <div
                    key={bookmark._id}
                    className={cn(
                      "saved-bookmark-card bookmark-card-hover",
                      isSelected && "saved-bookmark-card--selected",
                      index < 6 && `animate-in fade-in slide-in-from-bottom-2 duration-300`,
                    )}
                    style={{ animationDelay: `${Math.min(index, 5) * 40}ms` }}
                  >
                    {/* Card top row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleBookmarkSelection(bookmark._id)}
                          className="mt-0.5 flex-shrink-0 transition-transform duration-150 hover:scale-110"
                          aria-label={isSelected ? "Deselect" : "Select"}
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
                              {bookmark.conversationId?.type === "group" ? "👥" : "💬"}
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
                            {" · "}
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
                        ? "✕ This message was removed"
                        : bookmark.messageId.content || (
                          <span className="flex items-center gap-1.5 text-muted-foreground/70">
                            <ImageIcon className="size-3.5" />
                            Image message
                          </span>
                        )}
                    </div>

                    {/* Tags & Note */}
                    {(bookmark.tags?.length || bookmark.note) && !isEditing && (
                      <div className="mt-3 flex flex-wrap gap-2 items-start">
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
                        />
                        <textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          className="min-h-[64px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                          placeholder="Personal note…"
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
                        {!(bookmark.tags?.length) && !bookmark.note && (
                          <span className="text-[11px] text-muted-foreground/40 italic">No tags or notes</span>
                        )}
                        <div className={cn("flex items-center gap-1", (bookmark.tags?.length || bookmark.note) && "ml-auto")}>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditing(bookmark._id, bookmark.note, bookmark.tags)}
                            className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground/70 hover:text-foreground rounded-lg"
                          >
                            <PencilLine className="size-3" />
                            Edit note/tags
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
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
                    >
                      Load more
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SavedMessagesPage;
