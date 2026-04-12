import api from "@/lib/axios";
import type { Conversation, ConversationResponse, Message } from "@/types/chat";

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

interface GroupJoinLinkResponse {
  conversation: Partial<Conversation>;
  joinLink: {
    token: string;
    url: string;
    expiresAt: string;
    expiresInHours: number;
  };
}

const pageLimit = 50;

export const chatService = {
  async fetchConversations(): Promise<ConversationResponse> {
    const res = await api.get("/conversations");
    return res.data;
  },

  async fetchMessages(id: string, cursor?: string): Promise<FetchMessageProps> {
    const res = await api.get(`/conversations/${id}/messages`, {
      params: {
        limit: pageLimit,
        ...(cursor ? { cursor } : {}),
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
  ) {
    const res = await api.post("/messages/group", {
      conversationId,
      content,
      imgUrl,
      replyTo,
    });
    return res.data.message;
  },

  async markAsSeen(conversationId: string) {
    const res = await api.patch(`/conversations/${conversationId}/seen`);
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

  async createGroupJoinLink(conversationId: string, expiresInHours = 24) {
    const res = await api.post(`/conversations/${conversationId}/join-link`, {
      expiresInHours,
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

  async removeMessageForMe(messageId: string) {
    const res = await api.delete(`/messages/${messageId}/remove-for-me`);
    return res.data;
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
