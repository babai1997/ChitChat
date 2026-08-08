import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * SocketRegistryService
 *
 * Owns the in-memory map of userId → deviceId → socketId. Injected into all
 * gateway handlers so they can emit to specific users (or, since the E2EE
 * Phase 1 prerequisite, specific devices of a user) without coupling to the
 * gateway class itself.
 *
 * Devices matter for E2EE because each device has its own Double Ratchet
 * session and can only decrypt ciphertext addressed to it — see
 * message.handler.ts's per-device fan-out. Presence/typing/calls don't care
 * about devices and keep using emitToUser/isOnline exactly as before, which
 * still aggregate across every device (tab, phone, etc.) a user has open.
 */
@Injectable()
export class SocketRegistryService {
  private readonly logger = new Logger(SocketRegistryService.name);
  private server: Server;

  /** userId → deviceId → connected socketId (a device only ever has one live socket at a time) */
  private readonly userDevices = new Map<string, Map<string, string>>();

  /** Called once by ChatGateway after the @WebSocketServer() is initialized */
  setServer(server: Server) {
    this.server = server;
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  /**
   * @param deviceId Falls back to the raw socketId for clients that haven't
   * sent one yet (pre-Phase-1 rollout window) — each such connection is then
   * simply treated as its own single-socket "device", which is exactly
   * today's behavior since every socket used to get its own registry entry.
   */
  register(userId: string, socketId: string, deviceId: string = socketId) {
    if (!this.userDevices.has(userId)) {
      this.userDevices.set(userId, new Map());
    }
    this.userDevices.get(userId)!.set(deviceId, socketId);
  }

  unregister(
    userId: string,
    socketId: string,
    deviceId: string = socketId,
  ): boolean {
    const devices = this.userDevices.get(userId);
    if (!devices) return false;

    // A reconnect can register a new socketId under the same deviceId before
    // the old socket's disconnect event fires — only remove the entry if it
    // still points at THIS socket, so we don't clobber the newer connection.
    if (devices.get(deviceId) !== socketId) return false;

    devices.delete(deviceId);

    if (devices.size === 0) {
      this.userDevices.delete(userId);
      return true; // Last connection removed — user is now offline
    }
    return false;
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  isOnline(userId: string): boolean {
    return this.userDevices.has(userId);
  }

  getSocketIds(userId: string): Set<string> {
    const devices = this.userDevices.get(userId);
    return devices ? new Set(devices.values()) : new Set();
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.userDevices.keys());
  }

  getDeviceIds(userId: string): string[] {
    return Array.from(this.userDevices.get(userId)?.keys() ?? []);
  }

  // ─── Emit helpers ──────────────────────────────────────────────────────────

  /** Emit an event to ALL sockets of a specific user (all tabs/devices) */
  emitToUser(userId: string, event: string, data: unknown) {
    const devices = this.userDevices.get(userId);
    if (!devices || !this.server) return;

    // NestJS injects the Namespace (not the global Server) for gateways with a
    // namespace option. Namespace.sockets is Map<SocketId, Socket> — we look up
    // the socket directly so we can detect stale IDs (Android can silently drop
    // connections before the ping-timeout fires). server.to(socketId).emit()
    // silently no-ops on missing rooms, masking the delivery failure.
    const nsSocketMap = (
      this.server as unknown as {
        sockets: Map<string, { emit: (ev: string, data: unknown) => void }>;
      }
    ).sockets;
    const staleDeviceIds: string[] = [];

    devices.forEach((socketId, deviceId) => {
      const socket = nsSocketMap?.get(socketId);
      if (!socket) {
        this.logger.warn(
          `[Registry] stale socket ${socketId} for user ${userId} device ${deviceId} — cleaning up`,
        );
        staleDeviceIds.push(deviceId);
        return;
      }
      socket.emit(event, data);
    });

    staleDeviceIds.forEach((id) => devices.delete(id));
    if (devices.size === 0) this.userDevices.delete(userId);
  }

  /** Emit an event to one specific device of a user — used for per-device E2EE ciphertext delivery. */
  emitToDevice(userId: string, deviceId: string, event: string, data: unknown) {
    const socketId = this.userDevices.get(userId)?.get(deviceId);
    if (!socketId || !this.server) return;

    const nsSocketMap = (
      this.server as unknown as {
        sockets: Map<string, { emit: (ev: string, data: unknown) => void }>;
      }
    ).sockets;
    const socket = nsSocketMap?.get(socketId);
    if (!socket) {
      this.logger.warn(
        `[Registry] stale socket ${socketId} for user ${userId} device ${deviceId} — cleaning up`,
      );
      this.userDevices.get(userId)?.delete(deviceId);
      return;
    }
    socket.emit(event, data);
  }

  /** Emit an event to an entire chat room */
  emitToChat(chatId: string, event: string, data: unknown) {
    this.server?.to(`chat:${chatId}`).emit(event, data);
  }
}
