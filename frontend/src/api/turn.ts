import api from './client';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface TurnCredentialsResponse {
  iceServers: IceServer[];
  ttlSeconds: number;
}

// Cached across calls in the same session — refetched once it's within 60s of
// expiring so a fresh call never starts with a credential that's about to die.
let cached: { iceServers: IceServer[]; expiresAt: number } | null = null;

export async function getIceServers(): Promise<IceServer[]> {
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.iceServers;
  }

  const response = await api.get<TurnCredentialsResponse>('/calls/turn-credentials');
  const { iceServers, ttlSeconds } = response.data;
  cached = { iceServers, expiresAt: Date.now() + ttlSeconds * 1000 };
  return iceServers;
}
