import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { Instance } from 'simple-peer';
import SimplePeer from 'simple-peer';
import { socketManager } from '../shared/socket/SocketManager';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';
import { ringtoneManager } from '../utils/ringtone';
import toast from 'react-hot-toast';
import { useChatStore } from '../stores/chatStore';

// ── Types ───────────────────────────────────────────────────────────────────

interface IncomingCallData {
  chatId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  offer?: unknown;
  type: 'audio' | 'video';
}

interface CallContextType {
  isCallActive: boolean;
  callStatus: 'idle' | 'calling' | 'incoming' | 'connected';
  callType: 'audio' | 'video';
  incomingCall: IncomingCallData | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMinimized: boolean;
  isMuted: boolean;
  isVideoEnabled: boolean;
  startCall: (chatId: string, type: 'audio' | 'video') => void;
  answerCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleMinimize: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// ── Provider ─────────────────────────────────────────────────────────────────

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  // ── Refs (stable across renders, safe in closures) ─────────────────────────
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, Instance>>(new Map());
  const activeChatIdRef = useRef<string | null>(null);
  /**
   * FIX: Track isCallActive in a ref so socket event handlers always see
   * the latest value without stale closure issues.
   */
  const isCallActiveRef = useRef(false);
  const incomingCallRef = useRef<IncomingCallData | null>(null);
  /** Auto-cancel timer — clears when call is answered, rejected, or ended. */
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state
  useEffect(() => { isCallActiveRef.current = isCallActive; }, [isCallActive]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const cleanupCall = useCallback(() => {
    console.log('[Call] Cleaning up');
    ringtoneManager.stopAll();

    // Clear the auto-cancel timer if still running
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    peersRef.current.forEach((peer) => {
      try { peer.destroy(); } catch { /* ignore */ }
    });
    peersRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams(new Map());
    setIncomingCall(null);
    setCallStatus('idle');
    setIsCallActive(false);
    setIsMinimized(false);
    isCallActiveRef.current = false;
    activeChatIdRef.current = null;
  }, []);

  // ── Peer factory ───────────────────────────────────────────────────────────

  const createPeer = useCallback(
    (targetUserId: string, initiator: boolean, stream: MediaStream): Instance => {
      console.log(`[Call] Creating peer → ${targetUserId} (initiator: ${initiator})`);

      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream,
        config: {
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302",
            },
            {
              urls: "stun:stun1.l.google.com:19302",
            },
            {
              urls: "stun:stun.relay.metered.ca:80",
            },
            {
              urls: "turn:global.relay.metered.ca:80",
              username: "bfd9bc0f231dcb23a8625d17",
              credential: "g65qhBaLA/r80etz",
            },
            {
              urls: "turn:global.relay.metered.ca:80?transport=tcp",
              username: "bfd9bc0f231dcb23a8625d17",
              credential: "g65qhBaLA/r80etz",
            },
            {
              urls: "turn:global.relay.metered.ca:443",
              username: "bfd9bc0f231dcb23a8625d17",
              credential: "g65qhBaLA/r80etz",
            },
            {
              urls: "turns:global.relay.metered.ca:443?transport=tcp",
              username: "bfd9bc0f231dcb23a8625d17",
              credential: "g65qhBaLA/r80etz",
            },
          ],
        },
      });

      peer.on('signal', (signal) => {
        console.log(`[Call] Sending signal to ${targetUserId}:`, signal.type ?? 'candidate');
        socketManager.emit(SOCKET_EVENTS.CALL_SIGNAL, {
          targetUserId,
          type: signal.type ?? 'candidate',
          signal,
          chatId: activeChatIdRef.current,
        });
      });

      peer.on('stream', (remoteStream) => {
        console.log(`[Call] Received stream from ${targetUserId}`);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(targetUserId, remoteStream);
          return next;
        });
        // Transition to connected state when we have a stream
        setCallStatus('connected');
      });

      peer.on('connect', () => {
        console.log(`[Call] Data channel connected to ${targetUserId}`);
      });

      peer.on('close', () => {
        console.log(`[Call] Peer closed: ${targetUserId}`);
        peersRef.current.delete(targetUserId);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(targetUserId);
          return next;
        });
      });

      peer.on('error', (err) => {
        console.error(`[Call] Peer error with ${targetUserId}:`, err);
      });

      peersRef.current.set(targetUserId, peer);
      return peer;
    },
    [],
  );

  // ── Socket event listeners ─────────────────────────────────────────────────

  useEffect(() => {
    // Use socketManager.on() instead of socket.on() so these handlers are persisted
    // by the SocketManager and re-attached after every reconnect — even if the socket
    // doesn't exist yet when CallProvider first mounts.
    const handleIncoming = (data: IncomingCallData) => {
      console.log('[Call] Incoming call from', data.callerId, data.type);

      if (isCallActiveRef.current) {
        // Already in a call — auto-reject
        socketManager.emit(SOCKET_EVENTS.CALL_REJECT, {
          chatId: data.chatId,
          callerId: data.callerId,
        });
        return;
      }

      ringtoneManager.playRingtone().catch(console.error);
      setIncomingCall(data);
      setCallStatus('incoming');
      setCallType(data.type);
      
      // Bump chat to the top
      useChatStore.getState().updateChat(data.chatId, { updatedAt: new Date().toISOString() });
    };

    /** Callee side: caller timed out — dismiss the incoming call UI. */
    const handleMissed = () => {
      console.log('[Call] Caller gave up — dismissing incoming call');
      ringtoneManager.stopRingtone();
      setIncomingCall(null);
      setCallStatus('idle');
    };

    const handleUserJoined = (data: { userId: string; chatId: string }) => {
      console.log('[Call] User joined:', data.userId);
      ringtoneManager.stopCallingTone();

      // Fix: clear the caller's auto-cancel timeout since callee answered
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }

      // Status remains 'calling' (connecting) until the actual media stream arrives in peer.on('stream')

      if (!isCallActiveRef.current || !localStreamRef.current) {
        console.warn('[Call] Ignoring user-joined — call not active or no local stream');
        return;
      }

      if (!peersRef.current.has(data.userId)) {
        createPeer(data.userId, true, localStreamRef.current);
      }
    };

    const handleSignal = (data: { senderId: string; type: string; signal: unknown }) => {
      console.log(`[Call] Signal received from ${data.senderId}: ${data.type}`);
      const { senderId, signal } = data;

      let peer = peersRef.current.get(senderId);

      if (!peer) {
        if (!isCallActiveRef.current || !localStreamRef.current) {
          console.warn('[Call] Received signal but call not active — ignoring');
          return;
        }
        peer = createPeer(senderId, false, localStreamRef.current);
      }

      try {
        peer.signal(signal as SimplePeer.SignalData);
      } catch (err) {
        console.error('[Call] peer.signal() error:', err);
      }
    };

    const handleEnded = (data: { enderId: string }) => {
      console.log('[Call] Call ended by', data.enderId);
      const peer = peersRef.current.get(data.enderId);
      if (peer) {
        try { peer.destroy(); } catch { /* ignore */ }
        peersRef.current.delete(data.enderId);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(data.enderId);
          return next;
        });
      }

      if (peersRef.current.size === 0) {
        toast('Call ended');
        cleanupCall();
      }
    };

    const handleRejected = () => {
      console.log('[Call] Call rejected');
      toast.error('Call was declined');
      cleanupCall();
    };

    // Register via socketManager — handlers persist in its internal registry
    // and are re-attached automatically after each reconnect.
    socketManager.on(SOCKET_EVENTS.CALL_INCOMING, handleIncoming as any);
    socketManager.on(SOCKET_EVENTS.CALL_MISSED, handleMissed as any);
    socketManager.on(SOCKET_EVENTS.CALL_USER_JOINED, handleUserJoined as any);
    socketManager.on(SOCKET_EVENTS.CALL_SIGNAL, handleSignal as any);
    socketManager.on(SOCKET_EVENTS.CALL_ENDED, handleEnded as any);
    socketManager.on(SOCKET_EVENTS.CALL_REJECTED, handleRejected as any);

    return () => {
      socketManager.off(SOCKET_EVENTS.CALL_INCOMING, handleIncoming as any);
      socketManager.off(SOCKET_EVENTS.CALL_MISSED, handleMissed as any);
      socketManager.off(SOCKET_EVENTS.CALL_USER_JOINED, handleUserJoined as any);
      socketManager.off(SOCKET_EVENTS.CALL_SIGNAL, handleSignal as any);
      socketManager.off(SOCKET_EVENTS.CALL_ENDED, handleEnded as any);
      socketManager.off(SOCKET_EVENTS.CALL_REJECTED, handleRejected as any);
    };
  // Run once on mount — socketManager.on() persists handlers through reconnects
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createPeer, cleanupCall]);

  // ── Call actions ───────────────────────────────────────────────────────────

  const startCall = async (chatId: string, type: 'audio' | 'video') => {
    try {
      activeChatIdRef.current = chatId;
      setCallType(type);
      setCallStatus('calling');
      setIsCallActive(true);
      isCallActiveRef.current = true; // Set ref immediately

      // Instantly bump chat to the top of the chat list
      useChatStore.getState().updateChat(chatId, { updatedAt: new Date().toISOString() });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === 'video',
        audio: true,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(type === 'video');
      setIsMuted(false);

      ringtoneManager.playCallingTone();

      socketManager.emit(SOCKET_EVENTS.CALL_START, { chatId, offer: null, type });

      // ── Auto-cancel after 45 seconds if no one answers ──────────────────
      callTimeoutRef.current = setTimeout(() => {
        console.log('[Call] No answer after 45s — cancelling');
        ringtoneManager.stopCallingTone();
        socketManager.emit(SOCKET_EVENTS.CALL_MISSED, { chatId, type });
        cleanupCall();
        toast('No answer');
      }, 45_000);
    } catch (err: unknown) {
      console.error('[Call] Failed to start:', err);
      toast.error(getMediaErrorMessage(err));
      cleanupCall();
    }
  };

  const answerCall = async () => {
    const call = incomingCallRef.current;
    if (!call) return;

    ringtoneManager.stopRingtone();

    // Clear the caller's outgoing timeout — call is now being answered
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    try {
      // Set active BEFORE getting media so the signal handler sees it immediately
      // Status is 'calling' (not 'connected') — actual connection established when stream arrives
      setCallStatus('calling');
      setIsCallActive(true);
      isCallActiveRef.current = true; // Set ref immediately
      activeChatIdRef.current = call.chatId;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: call.type === 'video',
        audio: true,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(call.type === 'video');
      setIsMuted(false);

      // Announce join — caller will receive CALL_USER_JOINED and send the offer
      socketManager.emit(SOCKET_EVENTS.CALL_JOIN, { chatId: call.chatId });

      setIncomingCall(null);
    } catch (err: unknown) {
      console.error('[Call] Failed to answer:', err);
      toast.error(getMediaErrorMessage(err));
      cleanupCall();
    }
  };

  const rejectCall = () => {
    const call = incomingCallRef.current;
    console.log('[Call] Rejecting call');
    ringtoneManager.stopRingtone();

    if (call) {
      socketManager.emit(SOCKET_EVENTS.CALL_REJECT, {
        chatId: call.chatId,
        callerId: call.callerId,
      });
    }

    cleanupCall();
  };

  const endCall = () => {
    if (activeChatIdRef.current) {
      socketManager.emit(SOCKET_EVENTS.CALL_END, { chatId: activeChatIdRef.current });
    }
    cleanupCall();
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((prev) => !prev);
  };

  const toggleVideo = () => {
    if (callType !== 'video') return;
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsVideoEnabled((prev) => !prev);
  };

  const toggleMinimize = () => setIsMinimized((prev) => !prev);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <CallContext.Provider
      value={{
        isCallActive,
        callStatus,
        callType,
        incomingCall,
        localStream,
        remoteStreams,
        isMinimized,
        isMuted,
        isVideoEnabled,
        startCall,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleMinimize,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMediaErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Could not access camera/microphone';
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera/microphone permission denied. Allow access in browser settings.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera or microphone found.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera/microphone is already in use by another app.';
    case 'OverconstrainedError':
      return 'Camera/microphone settings are not supported.';
    default:
      return `Could not access media: ${err.message}`;
  }
}
