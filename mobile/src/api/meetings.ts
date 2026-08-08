import api from './client';

export interface MeetingSummary {
  chatId: string;
  name: string | null;
  hostName: string;
}

export interface MyMeeting {
  slug: string;
  name: string | null;
  chatId: string;
  createdAt: string;
  revoked: boolean;
  isPersonal: boolean;
}

export interface ChatMeetingLink {
  slug: string;
  revoked: boolean;
  isHost: boolean;
}

export const meetingsApi = {
  create: async (name?: string): Promise<{ chatId: string; slug: string }> => {
    const { data } = await api.post('/meetings', name ? { name } : {});
    return data;
  },

  /** Get-or-create the caller's persistent Personal Meeting Room — same link every time, unlike create(). */
  getPersonalRoom: async (): Promise<{ chatId: string; slug: string }> => {
    const { data } = await api.get('/meetings/personal');
    return data;
  },

  /** Every meeting the caller hosts, for a "My Meetings" list. */
  listMine: async (): Promise<MyMeeting[]> => {
    const { data } = await api.get('/meetings/mine');
    return data;
  },

  /** Resolve a chat's meeting link from inside the chat itself (e.g. ChatInfoModal). */
  getByChatId: async (chatId: string): Promise<ChatMeetingLink> => {
    const { data } = await api.get(`/meetings/by-chat/${chatId}`);
    return data;
  },

  getBySlug: async (slug: string): Promise<MeetingSummary> => {
    const { data } = await api.get(`/meetings/${slug}`);
    return data;
  },

  join: async (slug: string): Promise<{ chatId: string }> => {
    const { data } = await api.post(`/meetings/${slug}/join`);
    return data;
  },

  rename: async (slug: string, name: string): Promise<void> => {
    await api.patch(`/meetings/${slug}`, { name });
  },

  revoke: async (slug: string): Promise<void> => {
    await api.delete(`/meetings/${slug}`);
  },
};
