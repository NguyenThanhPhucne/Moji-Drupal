import api from "@/lib/axios";
import type { BookmarkPagination, SavedBookmark } from "@/types/chat";

export const bookmarkService = {
  async toggleBookmark(messageId: string) {
    const res = await api.post(`/bookmarks/${messageId}/toggle`);
    return {
      bookmarked: Boolean(res.data?.bookmarked),
      messageId: String(res.data?.messageId || messageId),
    };
  },

  async getBookmarks(filters?: {
    conversationId?: string;
    collection?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<{ bookmarks: SavedBookmark[]; pagination: BookmarkPagination }> {
    const params = new URLSearchParams();

    if (filters?.conversationId) {
      params.set("conversationId", filters.conversationId);
    }

    if (filters?.collection) {
      params.set("collection", filters.collection);
    }

    if (filters?.q) {
      params.set("q", filters.q);
    }

    if (filters?.from) {
      params.set("from", filters.from);
    }

    if (filters?.to) {
      params.set("to", filters.to);
    }

    if (filters?.page) {
      params.set("page", String(filters.page));
    }

    if (filters?.limit) {
      params.set("limit", String(filters.limit));
    }

    const queryString = params.toString();
    const url = queryString ? `/bookmarks?${queryString}` : "/bookmarks";
    const res = await api.get(url);

    return {
      bookmarks: (res.data?.bookmarks || []) as SavedBookmark[],
      pagination: {
        page: Number(res.data?.pagination?.page || 1),
        limit: Number(res.data?.pagination?.limit || filters?.limit || 30),
        total: Number(res.data?.pagination?.total || 0),
        totalPages: Number(res.data?.pagination?.totalPages || 1),
        hasNextPage: Boolean(res.data?.pagination?.hasNextPage),
      },
    };
  },

  async updateBookmarkMeta(
    bookmarkId: string,
    payload: { note?: string; tags?: string[]; collections?: string[] },
  ) {
    const res = await api.patch(`/bookmarks/${bookmarkId}/meta`, payload);
    return res.data?.bookmark as SavedBookmark;
  },

  async bulkRemoveTag(bookmarkIds: string[], tag: string) {
    const res = await api.post("/bookmarks/bulk", {
      bookmarkIds,
      action: "remove-tag",
      tag,
    });

    return {
      matchedCount: Number(res.data?.matchedCount || 0),
      modifiedCount: Number(res.data?.modifiedCount || 0),
    };
  },

  async bulkRemoveCollection(bookmarkIds: string[], collection: string) {
    const res = await api.post("/bookmarks/bulk", {
      bookmarkIds,
      action: "remove-collection",
      collection,
    });

    return {
      matchedCount: Number(res.data?.matchedCount || 0),
      modifiedCount: Number(res.data?.modifiedCount || 0),
    };
  },
};
