import api from "@/lib/axios";
import type { GlobalSearchResponse } from "@/types/chat";

export const searchService = {
  async globalSearch(
    query: string,
    signal?: AbortSignal,
  ): Promise<GlobalSearchResponse> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return { people: [], groups: [], messages: [], posts: [] };
    }

    const res = await api.get(
      `/search/global?q=${encodeURIComponent(trimmed)}`,
      {
        signal,
      },
    );
    return {
      people: res.data?.people || [],
      groups: res.data?.groups || [],
      messages: res.data?.messages || [],
      posts: res.data?.posts || [],
    };
  },
};
