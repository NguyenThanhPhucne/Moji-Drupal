import api from "@/lib/axios";
import type { ConversationResponse, Message } from "@/types/chat";

interface FetchMessageProps {
  messages: Message[];
  cursor?: string;
}

const pageLimit = 50;

export const chatService = {
  async fetchConversations(): Promise<ConversationResponse> {
    const res = await api.get("/conversations");
    return res.data;
  },

  async fetchMessages(id: string, cursor?: string): Promise<FetchMessageProps> {
    const res = await api.get(
      `/conversations/${id}/messages?limit=${pageLimit}&cursor=${cursor}`,
    );

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
    console.log("[chatService][debug] POST /conversations:", {
      type,
      name,
      memberIds,
    });
    const res = await api.post("/conversations", { type, name, memberIds });
    console.log("[chatService][ok] Response:", res.data);
    return res.data.conversation;
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
    return res.data;
  },

  async removeMessageForMe(messageId: string) {
    const res = await api.delete(`/messages/${messageId}/remove-for-me`);
    return res.data;
  },

  async editMessage(messageId: string, content: string) {
    const res = await api.put(`/messages/${messageId}/edit`, { content });
    return res.data;
  },

  async markMessageRead(messageId: string) {
    const res = await api.post(`/messages/${messageId}/read`);
    return res.data;
  },
};
