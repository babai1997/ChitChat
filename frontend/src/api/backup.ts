import { api } from './client';

export interface EncryptedBackupRecord {
  salt: string;
  nonce: string;
  ciphertext: string;
  updatedAt: string;
}

export const backupApi = {
  upsert: async (salt: string, nonce: string, ciphertext: string): Promise<void> => {
    await api.put('/backup', { salt, nonce, ciphertext });
  },

  get: async (): Promise<EncryptedBackupRecord | null> => {
    const { data } = await api.get('/backup');
    return data;
  },

  delete: async (): Promise<void> => {
    await api.delete('/backup');
  },
};
