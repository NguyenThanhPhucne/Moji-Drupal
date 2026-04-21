import api from "@/lib/axios";
import type {
  Conversation,
  ConversationResponse,
  GroupChannelAnalyticsPayload,
  GroupChannelRole,
  Message,
} from "@/types/chat";

interface FetchMessageProps {
  messages: Message[];
  cursor?: string;
}

export interface LinkPreviewPayload {
  url: string;
  siteName: string;
  title: string;
  description: string;
  image?: string;
}

interface MessageSyncResponse {
  message: Message;
  conversation?: Partial<Conversation> | null;
}

interface RemoveForMeResponse {
  success: boolean;
  alreadyHidden: boolean;
  conversation?: Partial<Conversation> | null;
}

interface GroupJoinLinkResponse {
  conversation: Partial<Conversation>;
  joinLink: {
    token: string;
    url: string;
    expiresAt: string;
    expiresInHours: number;
    maxUses?: number | null;
    oneTime?: boolean;
    remainingUses?: number | null;
  };
}

interface GroupChannelMutationResponse {
  conversation: Partial<Conversation>;
  channel?: {
    channelId: string;
    name: string;
    description?: string;
    categoryId?: string | null;
    permissions?: {
      sendRoles: GroupChannelRole[];
    };
  };
  category?: {
    categoryId: string;
    name: string;
    position: number;
  };
}

interface GroupChannelAnalyticsResponse {
  analytics: GroupChannelAnalyticsPayload;
}

const pageLimit = 50;

export const chatService = {
  async fetchConversations(opts?: { ifNoneMatch?: string | null; ifModifiedSince?: string | null }): Promise<ConversationResponse | { notModified: true; status: number } & Partial<ConversationResponse>> {
    const headers: Record<string, string> = {};
    if (opts?.ifNoneMatch) headers["If-None-Match"] = String(opts.ifNoneMatch);
    if (opts?.ifModifiedSince) headers["If-Modified-Since"] = String(opts.ifModifiedSince);

    const res = await api.get("/conversations", {
      headers,
      validateStatus: (status) => status === 304 || (status >= 200 && status < 300),
    });

    if (res.status === 304) {
      return { notModified: true, status: 304 } as any;
    }

    const payload: ConversationResponse = res.data;
    // attach revalidation metadata
    (payload as any)._etag = res.headers?.etag || null;
    (payload as any)._lastModified = res.headers?.["last-modified"] || null;

    return payload;
  },

  async fetchConversationsWithCookieSession(): Promise<ConversationResponse> {
    const res = await api.get("/conversations", {
      headers: {
        "x-moji-skip-auth": "1",
      },
    });
    return res.data;
  },

  async fetchMessages(
    id: string,
    cursor?: string,
    channelId?: string,
  ): Promise<FetchMessageProps> {
    const res = await api.get(`/conversations/${id}/messages`, {
      params: {
        limit: pageLimit,
        ...(cursor ? { cursor } : {}),
        ...(channelId ? { channelId } : {}),
      },
    });

    return { messages: res.data.messages, cursor: res.data.nextCursor };
  },

  async sendDirectMessage(
    recipientId: string,
    content: string = "",
    imgUrl?: string,
    conversationId?: string,
    replyTo?: string,
  ) {
    const res = await api.post("/messages/direct", {
      recipientId,
      content,
      imgUrl,
      conversationId,
      replyTo,
    });

    return res.data.message;
  },

  async sendGroupMessage(
    conversationId: string,
    content: string = "",
    imgUrl?: string,
    replyTo?: string,
    groupChannelId?: string,
  ) {
    const res = await api.post("/messages/group", {
      conversationId,
      content,
      imgUrl,
      replyTo,
      groupChannelId,
    });
    return res.data.message;
  },

  async markAsSeen(conversationId: string, channelId?: string) {
    const res = await api.patch(
      `/conversations/${conversationId}/seen`,
      {},
      {
        params: {
          ...(channelId ? { channelId } : {}),
        },
      },
    );
    return res.data;
  },

  async createConversation(
    type: "direct" | "group",
    name: string,
    memberIds: string[],
  ) {
    const res = await api.post("/conversations", { type, name, memberIds });
    return res.data.conversation;
  },

  async updateGroupAnnouncementMode(conversationId: string, enabled: boolean) {
    const res = await api.patch(
      `/conversations/${conversationId}/announcement-mode`,
      { enabled },
    );
    return res.data.conversation as Partial<Conversation>;
  },

  async updateGroupAdminRole(
    conversationId: string,
    memberId: string,
    makeAdmin: boolean,
  ) {
    const res = await api.patch(`/conversations/${conversationId}/admin-role`, {
      memberId,
      makeAdmin,
    });
    return res.data.conversation as Partial<Conversation>;
  },

  async createGroupChannel(
    conversationId: string,
    payload: {
      name: string;
      description?: string;
      categoryId?: string | null;
      sendRoles?: GroupChannelRole[];
      position?: number;
    },
  ) {
    const res = await api.post(
      `/conversations/${conversationId}/channels`,
      payload,
    );

    return res.data as GroupChannelMutationResponse;
  },

  async updateGroupChannel(
    conversationId: string,
    channelId: string,
    payload: {
      name?: string;
      description?: string;
      categoryId?: string | null;
      sendRoles?: GroupChannelRole[];
    },
  ) {
    const res = await api.patch(
      `/conversations/${conversationId}/channels/${channelId}`,
      payload,
    );

    return res.data as GroupChannelMutationResponse;
  },

  async deleteGroupChannel(conversationId: string, channelId: string) {
    const res = await api.delete(
      `/conversations/${conversationId}/channels/${channelId}`,
    );

    return res.data as GroupChannelMutationResponse;
  },

  async reorderGroupChannels(conversationId: string, channelIds: string[]) {
    const res = await api.patch(`/conversations/${conversationId}/channels/reorder`, {
      channelIds,
    });

    return res.data as GroupChannelMutationResponse;
  },

  async createGroupChannelCategory(
    conversationId: string,
    payload: {
      name: string;
      position?: number;
    },
  ) {
    const res = await api.post(
      `/conversations/${conversationId}/channel-categories`,
      payload,
    );

    return res.data as GroupChannelMutationResponse;
  },

  async updateGroupChannelCategory(
    conversationId: string,
    categoryId: string,
    payload: {
      name?: string;
    },
  ) {
    const res = await api.patch(
      `/conversations/${conversationId}/channel-categories/${categoryId}`,
      payload,
    );

    return res.data as GroupChannelMutationResponse;
  },

  async deleteGroupChannelCategory(conversationId: string, categoryId: string) {
    const res = await api.delete(
      `/conversations/${conversationId}/channel-categories/${categoryId}`,
    );

    return res.data as GroupChannelMutationResponse;
  },

  async reorderGroupChannelCategories(
    conversationId: string,
    categoryIds: string[],
  ) {
    const res = await api.patch(
      `/conversations/${conversationId}/channel-categories/reorder`,
      { categoryIds },
    );

    return res.data as GroupChannelMutationResponse;
  },

  async fetchGroupChannelAnalytics(conversationId: string, days = 7) {
    const res = await api.get(`/conversations/${conversationId}/channel-analytics`, {
      params: { days },
    });

    return res.data as GroupChannelAnalyticsResponse;
  },

  async setGroupActiveChannel(conversationId: string, channelId: string) {
    const res = await api.patch(
      `/conversations/${conversationId}/active-channel`,
      { channelId },
    );

    return res.data as GroupChannelMutationResponse;
  },

  async createGroupJoinLink(
    conversationId: string,
    options?: {
      expiresInHours?: number;
      maxUses?: number | null;
      oneTime?: boolean;
    },
  ) {
    const expiresInHours =
      typeof options?.expiresInHours === "number" ? options.expiresInHours : 24;

    const res = await api.post(`/conversations/${conversationId}/join-link`, {
      expiresInHours,
      maxUses: options?.maxUses ?? null,
      oneTime: Boolean(options?.oneTime),
    });
    return res.data as GroupJoinLinkResponse;
  },

  async revokeGroupJoinLink(conversationId: string) {
    const res = await api.delete(`/conversations/${conversationId}/join-link`);
    return res.data.conversation as Partial<Conversation>;
  },

  async joinGroupByLink(conversationId: string, token: string) {
    const res = await api.post(`/conversations/${conversationId}/join-by-link`, {
      token,
    });
    return res.data as { conversation: Conversation; alreadyJoined: boolean };
  },

  async pinGroupMessage(conversationId: string, messageId?: string | null) {
    const res = await api.patch(`/conversations/${conversationId}/pin-message`, {
      messageId: messageId || null,
    });
    return res.data.conversation as Partial<Conversation>;
  },

  async deleteConversation(conversationId: string) {
    const res = await api.delete(`/conversations/${conversationId}`);
    return res.data;
  },

  async reactToMessage(messageId: string, emoji: string) {
    const res = await api.post(`/messages/${messageId}/react`, { emoji });
    return res.data;
  },

  async unsendMessage(messageId: string) {
    const res = await api.delete(`/messages/${messageId}/unsend`);
    return res.data as MessageSyncResponse;
  },

  async undoSendMessage(messageId: string) {
    const res = await api.delete(`/messages/${messageId}/undo`);
    return res.data as MessageSyncResponse;
  },

  async removeMessageForMe(messageId: string) {
    const res = await api.delete(`/messages/${messageId}/remove-for-me`);
    return res.data as RemoveForMeResponse;
  },

  async editMessage(messageId: string, content: string) {
    const res = await api.put(`/messages/${messageId}/edit`, { content });
    return res.data as MessageSyncResponse;
  },

  async markMessageRead(messageId: string) {
    const res = await api.post(`/messages/${messageId}/read`);
    return res.data;
  },

  async getLinkPreview(url: string): Promise<LinkPreviewPayload> {
    const res = await api.get("/messages/link-preview/meta", {
      params: { url },
    });
    return res.data.preview;
  },

  async forwardMessage(
    messageId: string,
    recipientIds: string[],
    groupIds: string[],
  ) {
    const res = await api.post(`/messages/${messageId}/forward`, {
      recipientIds,
      groupIds,
    });
    return res.data;
  },

  async toggleMessageForwardable(messageId: string, isForwardable: boolean) {
    const res = await api.put(`/messages/${messageId}/toggle-forward`, {
      isForwardable,
    });
    return res.data;
  },
};
