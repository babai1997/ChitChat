import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface TurnCredentials {
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }>;
  ttlSeconds: number;
}

@Injectable()
export class TurnCredentialsService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Mints short-lived TURN credentials using the coturn/TURN-REST-API
   * static-auth-secret scheme: username = "<expiry>:<label>", credential =
   * base64(HMAC-SHA1(secret, username)). The relay validates the HMAC and
   * expiry itself — nothing here is checked against a database, so a leaked
   * credential is only ever valid until it expires.
   */
  generate(userId: string): TurnCredentials {
    const secret = this.configService.get<string>('turn.secret')!;
    const ttlSeconds = this.configService.get<number>('turn.ttlSeconds')!;
    const stunUrls = this.configService.get<string[]>('turn.stunUrls')!;
    const turnUrls = this.configService.get<string[]>('turn.turnUrls')!;

    const expiryTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiryTimestamp}:${userId}`;
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');

    return {
      iceServers: [
        { urls: stunUrls },
        { urls: turnUrls, username, credential },
      ],
      ttlSeconds,
    };
  }
}
