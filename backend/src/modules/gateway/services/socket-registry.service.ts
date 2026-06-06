import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * SocketRegistryService
 *
 * Owns the in-memory map of userId → Set<socketId>.
 * Injected into all gateway handlers so they can emit to specific users
 * without coupling to the gateway class itself.
 */
@Injectable()
export class SocketRegistryService {
  private server: Server;

  /** userId → Set of connected socketIds (supports multi-tab / multi-device) */
  private readonly userSockets = new Map<string, Set<string>>();

  /** Called once by ChatGateway after the @WebSocketServer() is initialized */
  setServer(server: Server) {
    this.server = server;
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  register(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  unregister(userId: string, socketId: string): boolean {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return false;

    sockets.delete(socketId);

    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      return true; // Last connection removed — user is now offline
    }
    return false;
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  isOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  getSocketIds(userId: string): Set<string> {
    return this.userSockets.get(userId) ?? new Set();
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.userSockets.keys());
  }

  // ─── Emit helpers ──────────────────────────────────────────────────────────

  /** Emit an event to ALL sockets of a specific user (all tabs/devices) */
  emitToUser(userId: string, event: string, data: unknown) {
    const socketIds = this.userSockets.get(userId);
    if (!socketIds || !this.server) return;

    socketIds.forEach((socketId) => {
      this.server.to(socketId).emit(event, data);
    });
  }

  /** Emit an event to an entire chat room */
  emitToChat(chatId: string, event: string, data: unknown) {
    this.server?.to(`chat:${chatId}`).emit(event, data);
  }
}
