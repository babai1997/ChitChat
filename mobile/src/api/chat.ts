import api from "./client";
import type { Chat, Message, MessagesResponse, Profile } from "../types";

export const chatApi = {
  // Chats
  getCallHistory: async (chatId?: string): Promise<Message[]> => {
    const url = chatId
      ? `/chats/calls/history?chatId=${chatId}`
      : "/chats/calls/history";
    const response = await api.get(url);
    // Backend returns { data: Message[], nextCursor } — unwrap the array
    return response.data?.data ?? response.data ?? [];
  },

  getChats: async (): Promise<Chat[]> => {
    const response = await api.get("/chats");
    return response.data;
  },

  getChat: async (chatId: string): Promise<Chat> => {
    const response = await api.get(`/chats/${chatId}`);
    return response.data;
  },

  createDirectChat: async (participantId: string): Promise<Chat> => {
    const response = await api.post("/chats/direct", { participantId });
    return response.data;
  },

  createGroup: async (name: string, memberIds: string[]): Promise<Chat> => {
    const response = await api.post("/chats/group", { name, memberIds });
    return response.data;
  },

  updateGroup: async (
    chatId: string,
    data: { name?: string; avatarUrl?: string },
  ): Promise<Chat> => {
    const response = await api.put(`/chats/${chatId}`, data);
    return response.data;
  },

  addMember: async (
    chatId: string,
    userId: string,
    role?: "admin" | "member",
  ): Promise<void> => {
    await api.post(`/chats/${chatId}/members`, { userId, role });
  },

  removeMember: async (chatId: string, userId: string): Promise<void> => {
    await api.delete(`/chats/${chatId}/members/${userId}`);
  },

  leaveChat: async (chatId: string): Promise<void> => {
    await api.post(`/chats/${chatId}/leave`);
  },

  markAsRead: async (chatId: string): Promise<void> => {
    await api.post(`/chats/${chatId}/read`);
  },

  // Messages
  getMessages: async (
    chatId: string,
    cursor?: string,
    limit?: number,
  ): Promise<MessagesResponse> => {
    const params = new URLSearchParams();
    if (cursor) params.append("cursor", cursor);
    if (limit) params.append("limit", limit.toString());

    const response = await api.get(`/chats/${chatId}/messages?${params}`);
    return response.data;
  },

  sendMessage: async (
    chatId: string,
    content: string,
    type: string = "text",
    replyToId?: string,
    attachments?: {
      filename: string;
      url: string;
      mimetype: string;
      size: number;
    }[],
  ): Promise<Message> => {
    const response = await api.post(`/chats/${chatId}/messages`, {
      content,
      type,
      replyToId,
      attachments,
    });
    return response.data;
  },

  uploadAttachment: async (
    chatId: string,
    formData: FormData,
  ): Promise<{
    filename: string;
    url: string;
    mimetype: string;
    size: number;
  }> => {
    // Use transformRequest to delete the default 'Content-Type: application/json'
    // header AFTER axios merges all headers. This lets React Native's native XHR
    // detect the FormData body and auto-set 'multipart/form-data; boundary=XXX'.
    // This also keeps the axios auth interceptor (token refresh) working.
    const response = await api.post(
      `/chats/${chatId}/messages/attachments`,
      formData,
      {
        transformRequest: (
          data: FormData,
          headers?: Record<string, string | Record<string, string>>,
        ) => {
          if (headers) {
            // Delete at all header levels axios might store it
            delete (headers as Record<string, unknown>)["Content-Type"];
            const common = (headers as Record<string, unknown>)["common"];
            if (common && typeof common === "object") {
              delete (common as Record<string, unknown>)["Content-Type"];
            }
          }
          return data; // pass FormData through as-is
        },
      },
    );
    return response.data;
  },

  uploadGroupAvatar: async (
    chatId: string,
    uri: string,
    filename: string,
    type: string,
  ): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', { uri, name: filename, type } as any);
    const response = await api.post(
      `/chats/${chatId}/messages/attachments`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return { url: response.data.url };
  },

  markMessagesAsRead: async (
    chatId: string,
    messageIds: string[],
  ): Promise<void> => {
    await api.post(`/chats/${chatId}/messages/read`, { messageIds });
  },
};

export default { chatApi };
