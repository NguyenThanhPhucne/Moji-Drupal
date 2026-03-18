import { create } from "zustand";
import { bookmarkService } from "@/services/bookmarkService";
import type { BookmarkPagination, SavedBookmark } from "@/types/chat";

const removeTagFromSelectedBookmarks = (
  bookmarks: SavedBookmark[],
  bookmarkIds: string[],
  normalizedTag: string,
) => {
  const selectedIds = new Set(bookmarkIds);

  return bookmarks.map((bookmark) => {
    if (!selectedIds.has(bookmark._id)) {
      return bookmark;
    }

    return {
      ...bookmark,
      tags: (bookmark.tags || []).filter(
        (existingTag) => existingTag !== normalizedTag,
      ),
    };
  });
};

interface BookmarkState {
  bookmarks: SavedBookmark[];
  bookmarkedMessageIds: string[];
  pagination: BookmarkPagination;
  loading: boolean;
  fetchBookmarks: (filters?: {
    conversationId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    append?: boolean;
  }) => Promise<void>;
  toggleBookmark: (
    messageId: string,
  ) => Promise<{ ok: boolean; bookmarked: boolean }>;
  updateBookmarkMeta: (
    bookmarkId: string,
    payload: { note?: string; tags?: string[] },
  ) => Promise<boolean>;
  bulkRemoveTag: (bookmarkIds: string[], tag: string) => Promise<boolean>;
  isBookmarked: (messageId: string) => boolean;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: [],
  bookmarkedMessageIds: [],
  pagination: {
    page: 1,
    limit: 30,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
  },
  loading: false,

  fetchBookmarks: async (filters) => {
    try {
      set({ loading: true });
      const result = await bookmarkService.getBookmarks(filters);
      const shouldAppend = Boolean(filters?.append);

      const mergedBookmarks = shouldAppend
        ? [...get().bookmarks, ...result.bookmarks]
        : result.bookmarks;

      set({
        bookmarks: mergedBookmarks,
        pagination: result.pagination,
        bookmarkedMessageIds: mergedBookmarks.map(
          (bookmark) => bookmark.messageId._id,
        ),
      });
    } catch (error) {
      console.error("Error loading bookmarks", error);
      set({
        bookmarks: [],
        bookmarkedMessageIds: [],
        pagination: {
          page: 1,
          limit: 30,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
        },
      });
    } finally {
      set({ loading: false });
    }
  },

  toggleBookmark: async (messageId) => {
    try {
      const result = await bookmarkService.toggleBookmark(messageId);
      const currentIds = new Set(get().bookmarkedMessageIds);

      if (result.bookmarked) {
        currentIds.add(messageId);
      } else {
        currentIds.delete(messageId);
      }

      set({ bookmarkedMessageIds: Array.from(currentIds) });

      return { ok: true, bookmarked: result.bookmarked };
    } catch (error) {
      console.error("Error toggling bookmark", error);
      return { ok: false, bookmarked: get().isBookmarked(messageId) };
    }
  },

  updateBookmarkMeta: async (bookmarkId, payload) => {
    try {
      const updatedBookmark = await bookmarkService.updateBookmarkMeta(
        bookmarkId,
        payload,
      );

      set((state) => ({
        bookmarks: state.bookmarks.map((bookmark) =>
          bookmark._id === bookmarkId
            ? {
                ...bookmark,
                note: updatedBookmark.note || "",
                tags: updatedBookmark.tags || [],
              }
            : bookmark,
        ),
      }));

      return true;
    } catch (error) {
      console.error("Error updating bookmark metadata", error);
      return false;
    }
  },

  bulkRemoveTag: async (bookmarkIds, tag) => {
    try {
      const normalizedTag = tag.trim().toLowerCase();
      if (!normalizedTag || bookmarkIds.length === 0) {
        return false;
      }

      await bookmarkService.bulkRemoveTag(bookmarkIds, normalizedTag);

      set((state) => ({
        bookmarks: removeTagFromSelectedBookmarks(
          state.bookmarks,
          bookmarkIds,
          normalizedTag,
        ),
      }));

      return true;
    } catch (error) {
      console.error("Error bulk removing tag", error);
      return false;
    }
  },

  isBookmarked: (messageId) => {
    return get().bookmarkedMessageIds.includes(messageId);
  },
}));
