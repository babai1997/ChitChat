import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { PrismaService } from '../../prisma/prisma.service';
import { PushPlatform, PushTokenType } from '@prisma/client';

export interface CallPushPayload {
  callId: string;
  chatId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string | null;
  type: 'audio' | 'video';
}

export interface MessagePushPayload {
  chatId: string;
  chatName: string;
  senderId: string;
  senderName: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'file';
  content: string;
}

/**
 * Sends wake-up push notifications so incoming calls ring even when the
 * recipient's app is backgrounded or fully killed (see CALL_NOTIFICATIONS_PLAN.md).
 *
 * Android only for now (FCM data messages). iOS needs a direct APNs VoIP push
 * (PushKit), which is a separate, later phase — `apns_voip` tokens are stored
 * but not yet sent to.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      this.messaging = getMessaging(existingApps[0]);
      return;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON not set — call push notifications are ' +
          'disabled (backgrounded/killed Android apps will not ring for incoming calls).',
      );
      return;
    }

    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      const app = initializeApp({ credential: cert(serviceAccount) });
      this.messaging = getMessaging(app);
      this.logger.log('Firebase Admin initialized for call push notifications');
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin:', err);
    }
  }

  // ── Token registration ──────────────────────────────────────────────────

  async registerToken(
    userId: string,
    params: {
      deviceId: string;
      platform: PushPlatform;
      tokenType: PushTokenType;
      token: string;
    },
  ) {
    const { deviceId, platform, tokenType, token } = params;
    return this.prisma.pushToken.upsert({
      where: { userId_deviceId_tokenType: { userId, deviceId, tokenType } },
      update: { token, platform },
      create: { userId, deviceId, platform, tokenType, token },
    });
  }

  async unregisterToken(userId: string, deviceId: string) {
    await this.prisma.pushToken.deleteMany({ where: { userId, deviceId } });
  }

  // ── Sending ──────────────────────────────────────────────────────────────

  async sendCallPush(recipientId: string, payload: CallPushPayload) {
    await this.sendDataMessage(recipientId, {
      kind: 'call',
      ...payload,
    });
  }

  async sendMessagePush(recipientId: string, payload: MessagePushPayload) {
    await this.sendDataMessage(recipientId, {
      kind: 'message',
      chatId: payload.chatId,
      chatName: payload.chatName,
      senderId: payload.senderId,
      senderName: payload.senderName,
      messageType: payload.messageType,
      content: payload.content,
    });
  }

  async sendCancelPush(recipientId: string, callId: string) {
    await this.sendDataMessage(recipientId, {
      kind: 'call_cancel',
      callId,
    });
  }

  private async sendDataMessage(
    recipientId: string,
    data: Record<string, string | undefined | null>,
  ) {
    if (!this.messaging) return;

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: recipientId, tokenType: 'fcm' },
    });
    if (tokens.length === 0) return;

    // FCM data payloads must be a flat map of strings.
    const stringData: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) stringData[key] = value;
    }

    const results = await Promise.allSettled(
      tokens.map((t) =>
        this.messaging!.send({
          token: t.token,
          data: stringData,
          android: { priority: 'high' },
        }),
      ),
    );

    results.forEach((result, i) => {
      if (result.status !== 'rejected') return;

      const err = result.reason as { code?: string };
      this.logger.warn(
        `Push send failed for token ${tokens[i].id}: ${err?.code ?? result.reason}`,
      );

      // Prune tokens the OS has confirmed are no longer valid (uninstalled, expired).
      if (
        err?.code === 'messaging/registration-token-not-registered' ||
        err?.code === 'messaging/invalid-registration-token'
      ) {
        void this.prisma.pushToken
          .delete({ where: { id: tokens[i].id } })
          .catch(() => {});
      }
    });
  }
}
