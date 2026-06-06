import { Injectable } from '@nestjs/common';
import { SOCKET_EVENTS } from '../../../shared/constants/socket-events';

interface AuthSocket {
  id: string;
  user: { id: string; profile?: { displayName?: string | null } | null };
  to: (room: string) => { emit: (event: string, data: unknown) => void };
}

@Injectable()
export class PresenceHandler {
  handleTypingStart(socket: AuthSocket, data: { chatId: string }) {
    socket.to(`chat:${data.chatId}`).emit(SOCKET_EVENTS.TYPING_START, {
      chatId: data.chatId,
      userId: socket.user.id,
      displayName: socket.user.profile?.displayName || 'Someone',
    });
  }

  handleTypingStop(socket: AuthSocket, data: { chatId: string }) {
    socket.to(`chat:${data.chatId}`).emit(SOCKET_EVENTS.TYPING_STOP, {
      chatId: data.chatId,
      userId: socket.user.id,
    });
  }
}
