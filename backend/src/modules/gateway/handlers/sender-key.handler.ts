import { Injectable, Logger, HttpException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { SenderKeysService } from '../../sender-keys/sender-keys.service';
import { SocketRegistryService } from '../services/socket-registry.service';
import { SOCKET_EVENTS } from '../../../shared/constants/socket-events';
import { DistributeSenderKeyDto } from '../../sender-keys/dto';

interface AuthSocket {
  user: { id: string };
}

@Injectable()
export class SenderKeyHandler {
  private readonly logger = new Logger(SenderKeyHandler.name);

  constructor(
    private readonly senderKeysService: SenderKeysService,
    private readonly registry: SocketRegistryService,
  ) {}

  /**
   * Persists the distribution (so an offline/not-yet-caught-up device can
   * still fetch it via GET /sender-key-distributions), and additionally
   * pushes it in real time to any currently-online target device — the
   * persistence round trip shouldn't gate how fast a rekey/new-member
   * distribution actually lands for someone already connected.
   */
  async handleDistribute(
    socket: AuthSocket,
    chatId: string,
    dto: DistributeSenderKeyDto,
  ) {
    try {
      const resolved = await this.senderKeysService.distribute(
        chatId,
        socket.user.id,
        dto,
      );

      resolved.forEach(({ recipientUserId, recipientDeviceId, ciphertext }) => {
        this.registry.emitToDevice(
          recipientUserId,
          recipientDeviceId,
          SOCKET_EVENTS.SENDER_KEY_NEW,
          {
            chatId,
            senderUserId: socket.user.id,
            senderDeviceId: dto.senderDeviceId,
            ciphertext,
          },
        );
      });

      return { success: true, delivered: resolved.length };
    } catch (error) {
      this.logger.error('Error distributing sender key:', error);
      const errorMessage =
        error instanceof HttpException
          ? error.message
          : 'Failed to distribute sender key';
      throw new WsException(errorMessage);
    }
  }
}
