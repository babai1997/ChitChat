import { api } from './client';

export interface DeviceSummary {
  deviceId: string;
  revoked: boolean;
  approved: boolean;
  platform: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface PendingLinkPayload {
  chatId: string;
  ciphertext: string;
  approvingDeviceId: string;
}

export const devicesApi = {
  getMyDevices: async (): Promise<DeviceSummary[]> => {
    const { data } = await api.get('/devices/mine');
    return data;
  },

  revokeDevice: async (deviceId: string): Promise<void> => {
    await api.delete(`/devices/${deviceId}`);
  },

  approveDevice: async (deviceId: string): Promise<void> => {
    await api.post(`/devices/${deviceId}/approve`);
  },

  declineDevice: async (deviceId: string): Promise<void> => {
    await api.post(`/devices/${deviceId}/decline`);
  },

  pushLinkPayload: async (newDeviceId: string, chatId: string, ciphertext: string): Promise<void> => {
    await api.post('/devices/link-payloads', { newDeviceId, chatId, ciphertext });
  },

  getPendingLinkPayloads: async (): Promise<PendingLinkPayload[]> => {
    const { data } = await api.get('/devices/link-payloads/pending');
    return data;
  },
};
