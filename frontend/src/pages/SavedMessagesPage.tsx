import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Bookmark, PencilLine, Tags } from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBookmarkStore } from "@/stores/useBookmarkStore";
import { useChatStore } from "@/stores/useChatStore";
import { useAuthStore } from "@/stores/useAuthStore";

const ITEM_ESTIMATED_HEIGHT = 210;
const OVERSCAN = 4;

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

  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);
  const [bulkTagToRemove, setBulkTagToRemove] = useState("");

  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(640);
  const [scrollTop, setScrollTop] = useState(0);

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

  useEffect(() => {
    const element = listContainerRef.current;
    if (!element) {
      return;
    }

    const updateViewport = () => {
      setViewportHeight(element.clientHeight);
    };

    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

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

  const openConversation = async (conversationId: string) => {
    setActiveConversation(conversationId);
    await fetchMessages(conversationId);
    navigate("/");
  };

  const loadMoreBookmarks = async () => {
    if (!pagination.hasNextPage || loading) {
      return;
    }

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
    const visibleIds = visibleBookmarks.map((bookmark) => bookmark._id);
    setSelectedBookmarkIds((current) => {
      const merged = new Set([...current, ...visibleIds]);
      return Array.from(merged);
    });
  };

  const clearSelection = () => {
    setSelectedBookmarkIds([]);
  };

  const exportSelectedCsv = () => {
    if (selectedBookmarkIds.length === 0) {
      toast.error("Select at least one bookmark to export");
      return;
    }

    const selected = bookmarks.filter((bookmark) =>
      selectedBookmarkIds.includes(bookmark._id),
    );

    const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;

    const rows = [
      ["bookmarkId", "conversationId", "savedAt", "content", "note", "tags"],
      ...selected.map((bookmark) => [
        bookmark._id,
        bookmark.messageId.conversationId,
        bookmark.createdAt,
        bookmark.messageId.content || "",
        bookmark.note || "",
        (bookmark.tags || []).join("|"),
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map((value) => escapeCsv(String(value || ""))).join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `saved-messages-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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

    toast.success(`Removed tag "${normalizedTag}" from selected bookmarks`);
    setBulkTagToRemove("");
  };

  const startEditing = (bookmarkId: string, note?: string, tags?: string[]) => {
    setEditingBookmarkId(bookmarkId);
    setNoteDraft(note || "");
    setTagDraft((tags || []).join(", "));
  };

  const saveBookmarkMeta = async () => {
    if (!editingBookmarkId) {
      return;
    }

    const tags = tagDraft
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const ok = await updateBookmarkMeta(editingBookmarkId, {
      note: noteDraft,
      tags,
    });

    if (!ok) {
      toast.error("Could not save bookmark metadata");
      return;
    }

    toast.success("Bookmark updated");
    setEditingBookmarkId(null);
  };

  const totalHeight = bookmarks.length * ITEM_ESTIMATED_HEIGHT;
  const visibleCount =
    Math.ceil(viewportHeight / ITEM_ESTIMATED_HEIGHT) + OVERSCAN;
  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ITEM_ESTIMATED_HEIGHT) - OVERSCAN,
  );
  const endIndex = Math.min(bookmarks.length, startIndex + visibleCount);
  const visibleBookmarks = bookmarks.slice(startIndex, endIndex);

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="app-shell-bg">
        <div className="app-shell-panel p-4 md:p-6">
          <div className="w-full min-h-0 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-eyebrow mb-1">Bookmarks</p>
                <h1 className="text-2xl font-semibold flex items-center gap-2 tracking-[-0.02em]">
                  <Bookmark className="size-5" />
                  Saved messages
                </h1>
                <p className="text-sm text-muted-foreground">
                  Quickly find your bookmarked messages
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
              >
                Back to chat
              </Button>
            </div>

            <div className="elevated-card grid grid-cols-1 gap-3 p-3 md:grid-cols-3">
              <select
                value={conversationFilter}
                onChange={(event) => setConversationFilter(event.target.value)}
                className="h-9 rounded-xl border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">All conversations</option>
                {conversationOptions.map((option) => (
                  <option key={option._id} value={option._id}>
                    {option.label}
                  </option>
                ))}
              </select>

              <Input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
              <Input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>

            <div className="elevated-card grid grid-cols-1 gap-2 p-3 md:grid-cols-[1fr_auto_auto_auto]">
              <Input
                value={bulkTagToRemove}
                onChange={(event) => setBulkTagToRemove(event.target.value)}
                placeholder="tag to remove in selected bookmarks"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleBulkRemoveTag}
              >
                Remove tag (bulk)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={exportSelectedCsv}
              >
                Export selected CSV
              </Button>
              <Button type="button" variant="ghost" onClick={clearSelection}>
                Clear ({selectedBookmarkIds.length})
              </Button>
            </div>

            <div className="min-h-0 flex-1 flex flex-col gap-3">
              {!loading && bookmarks.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border/70 bg-card/60 p-8 text-center text-sm text-muted-foreground">
                  You have no saved messages in this filter.
                </div>
              )}

              <div className="mb-2 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAllVisible}
                >
                  Select visible
                </Button>
              </div>

              <div
                ref={listContainerRef}
                onScroll={(event) =>
                  setScrollTop(event.currentTarget.scrollTop)
                }
                className="min-h-0 flex-1 overflow-y-auto pr-1"
              >
                <div
                  style={{ height: `${totalHeight}px`, position: "relative" }}
                >
                  {visibleBookmarks.map((bookmark, index) => {
                    const absoluteIndex = startIndex + index;
                    const top = absoluteIndex * ITEM_ESTIMATED_HEIGHT;

                    const conversationName =
                      bookmark.conversationId?.type === "group"
                        ? bookmark.conversationId.group?.name ||
                          "Untitled group"
                        : bookmark.conversationId.participants?.find(
                            (participant) =>
                              String(participant._id) !== String(user?._id),
                          )?.displayName || "Direct message";

                    return (
                      <div
                        key={bookmark._id}
                        style={{ position: "absolute", top, left: 0, right: 0 }}
                        className="pb-3"
                      >
                        <Card className="elevated-card p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <label className="mb-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={selectedBookmarkIds.includes(
                                    bookmark._id,
                                  )}
                                  onChange={() =>
                                    toggleBookmarkSelection(bookmark._id)
                                  }
                                />
                                <span>Select</span>
                              </label>
                              <p className="text-sm font-semibold truncate tracking-[-0.01em]">
                                {conversationName}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Saved{" "}
                                {format(
                                  new Date(bookmark.createdAt),
                                  "MMM d, yyyy HH:mm",
                                )}
                              </p>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                openConversation(
                                  bookmark.messageId.conversationId,
                                )
                              }
                            >
                              Open
                            </Button>
                          </div>

                          <div className="mt-3 rounded-xl border border-border/40 bg-muted/35 p-3 text-sm leading-relaxed break-words">
                            {bookmark.messageId.isDeleted
                              ? "This message was removed"
                              : bookmark.messageId.content || "(Image message)"}
                          </div>

                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Tags className="size-3.5" />
                              {(bookmark.tags || []).length > 0
                                ? (bookmark.tags || []).join(", ")
                                : "No tags"}
                            </div>

                            {bookmark.note && (
                              <div className="rounded-md border border-border/70 bg-background p-2 text-xs text-muted-foreground whitespace-pre-wrap">
                                {bookmark.note}
                              </div>
                            )}

                            {editingBookmarkId === bookmark._id ? (
                              <div className="space-y-2 rounded-md border border-border/70 p-2">
                                <Input
                                  value={tagDraft}
                                  onChange={(event) =>
                                    setTagDraft(event.target.value)
                                  }
                                  placeholder="tags, separated, by comma"
                                />
                                <textarea
                                  value={noteDraft}
                                  onChange={(event) =>
                                    setNoteDraft(event.target.value)
                                  }
                                  className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  placeholder="Personal note"
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={saveBookmarkMeta}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingBookmarkId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  startEditing(
                                    bookmark._id,
                                    bookmark.note,
                                    bookmark.tags,
                                  )
                                }
                              >
                                <PencilLine className="size-4" />
                                Edit note/tags
                              </Button>
                            )}
                          </div>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>

              {pagination.hasNextPage && (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadMoreBookmarks}
                    disabled={loading}
                  >
                    {loading ? "Loading..." : "Load more"}
                  </Button>
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
