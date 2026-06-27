import { io, Socket } from 'socket.io-client';

type Handler = (...args: unknown[]) => void;

/**
 * SocketManager — Singleton
 *
 * Owns the socket.io connection. Components never touch `io()` directly.
 * All event registration goes through this class so there's a single place
 * to manage reconnection, cleanup, and the event handler registry.
 */
class SocketManager {
  private socket: Socket | null = null;

  // Persists handlers across reconnects so they survive disconnect/reconnect cycles
  private readonly handlers = new Map<string, Set<Handler>>();

  connect(url: string, token: string) {
    if (this.socket?.connected) {
      console.log('[SocketManager] Already connected, skipping');
      return;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    // The backend gateway is mounted on the /chat namespace.
    // We strip /api and /chat from the base URL so we connect to the right path.
    const namespaceUrl = url.replace(/\/api\/?$/, '').replace(/\/chat\/?$/, '') + '/chat';
    console.log('[SocketManager] Connecting to:', namespaceUrl);

    this.socket = io(namespaceUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });

    // Attach all handlers that were registered before this connect() call
    this.handlers.forEach((fns, event) => {
      fns.forEach((fn) => this.socket!.on(event, fn));
    });

    // Re-attach all registered handlers after a reconnect.
    // We must remove first to prevent duplicates since socket.on() doesn't deduplicate.
    this.socket.on('connect', () => {
      console.log('[SocketManager] Connected, socket ID:', this.socket!.id);
      this.handlers.forEach((fns, event) => {
        fns.forEach((fn) => {
          this.socket!.off(event, fn); // remove first to avoid double-firing
          this.socket!.on(event, fn);
        });
      });
    });
  }

  disconnect() {
    console.log('[SocketManager] Disconnecting');
    this.socket?.disconnect();
    this.socket = null;
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    this.socket?.on(event, handler);
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    this.socket?.off(event, handler);
  }

  emit(event: string, data?: unknown) {
    if (!this.socket?.connected) {
      console.warn(`[SocketManager] Cannot emit '${event}' — not connected`);
      return;
    }
    this.socket.emit(event, data);
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Expose raw socket for libraries (e.g. CallContext) that need direct access */
  get instance(): Socket | null {
    return this.socket;
  }
}

// Export the singleton
export const socketManager = new SocketManager();
