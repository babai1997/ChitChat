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

export interface OngoingCallInfo {
  chatId: string;
  type: 'audio' | 'video';
  callerName: string;
  participantCount: number;
}

interface CallContextType {
  isCallActive: boolean;
  callStatus: 'idle' | 'calling' | 'incoming' | 'connected';
  callType: 'audio' | 'video';
  incomingCall: IncomingCallData | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  /** userId → whether that peer has video enabled. Absent = unknown (assume enabled). */
  remoteVideoStates: Map<string, boolean>;
  /** userId → whether that peer has their mic muted. Absent = unknown (assume unmuted). */
  remoteMuteStates: Map<string, boolean>;
  activeChatId: string | null;
  isMinimized: boolean;
  isMuted: boolean;
  isVideoEnabled: boolean;
  /** Ongoing calls in other chats — keyed by chatId. Used to show the "Tap to join" banner. */
  ongoingCallsByChatId: Map<string, OngoingCallInfo>;
  /** Whether the local user is currently sharing their screen. */
  isScreenSharing: boolean;
  /** The local screen capture stream when sharing. */
  screenStream: MediaStream | null;
  /** userId of whoever is currently sharing their screen (remote). null if no one is sharing. */
  sharingUserId: string | null;
  /** Document Picture-in-Picture window for the share control bar. null if not supported or not open. */
  pipWindow: Window | null;
  startCall: (chatId: string, type: 'audio' | 'video') => void;
  answerCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleMinimize: () => void;
  addToCall: (targetUserId: string) => void;
  joinOngoingCall: (chatId: string, type: 'audio' | 'video') => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
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
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [remoteVideoStates, setRemoteVideoStates] = useState<Map<string, boolean>>(new Map());
  const [remoteMuteStates, setRemoteMuteStates] = useState<Map<string, boolean>>(new Map());
  const [ongoingCallsByChatId, setOngoingCallsByChatId] = useState<Map<string, OngoingCallInfo>>(new Map());
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sharingUserId, setSharingUserId] = useState<string | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipWindowRef = useRef<Window | null>(null);

  // ── Refs (stable across renders, safe in closures) ─────────────────────────
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
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
  /** Auto-dismiss timer on the recipient side — safety net in case CALL_MISSED never arrives. */
  const incomingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitiatorRef = useRef(false);
  const callStartTimeRef = useRef<number | null>(null);
  const callStatusRef = useRef<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const callTypeRef = useRef<'audio' | 'video'>('audio');
  const wasRejectedRef = useRef(false);
  /** Total recipients ringing — set when CALL_RINGING ack arrives from server. */
  const pendingRecipientCountRef = useRef(0);
  /** How many recipients have explicitly declined so far. */
  const rejectedCountRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { isCallActiveRef.current = isCallActive; }, [isCallActive]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);
  useEffect(() => { callTypeRef.current = callType; }, [callType]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const cleanupCall = useCallback(() => {
    console.log('[Call] Cleaning up');
    ringtoneManager.stopAll();

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    if (incomingTimeoutRef.current) {
      clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }

    // Send call history message — only the initiator writes the log to avoid duplicates
    if (
      isInitiatorRef.current &&
      activeChatIdRef.current &&
      callStatusRef.current !== 'idle' &&
      callStatusRef.current !== 'incoming'
    ) {
      let duration = 0;
      let status = 'missed';

      if (callStatusRef.current === 'connected' && callStartTimeRef.current) {
        duration = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
        status = 'ended';
      } else if (wasRejectedRef.current) {
        status = 'rejected';
      }
      // 'calling' → stays 'missed'

      const payload = JSON.stringify({ status, duration, isVideo: callTypeRef.current === 'video' });
      const capturedChatId = activeChatIdRef.current;
      setTimeout(() => {
        socketManager.emit(SOCKET_EVENTS.MESSAGE_SEND, {
          chatId: capturedChatId,
          content: payload,
          type: 'missed_call',
          tempId: `temp-call-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
      }, 50);
    }

    peersRef.current.forEach((peer) => {
      try { peer.destroy(); } catch { /* ignore */ }
    });
    peersRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    setLocalStream(null);
    setRemoteStreams(new Map());
    setRemoteVideoStates(new Map());
    setRemoteMuteStates(new Map());
    setIsScreenSharing(false);
    setScreenStream(null);
    setSharingUserId(null);
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
    }
    pipWindowRef.current = null;
    setPipWindow(null);
    setIncomingCall(null);
    setCallStatus('idle');
    setIsCallActive(false);
    setIsMinimized(false);
    setActiveChatId(null);
    isCallActiveRef.current = false;
    activeChatIdRef.current = null;
    isInitiatorRef.current = false;
    callStartTimeRef.current = null;
    wasRejectedRef.current = false;
    pendingRecipientCountRef.current = 0;
    rejectedCountRef.current = 0;
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
        if (!callStartTimeRef.current) {
          callStartTimeRef.current = Date.now();
        }
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

      // Auto-dismiss after 60s if caller never sends CALL_MISSED — safety net
      if (incomingTimeoutRef.current) clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = setTimeout(() => {
        incomingTimeoutRef.current = null;
        ringtoneManager.stopRingtone();
        setIncomingCall(null);
        setCallStatus('idle');
      }, 60_000);
    };

    const handleRinging = (data: { recipientCount: number }) => {
      pendingRecipientCountRef.current = data.recipientCount;
      rejectedCountRef.current = 0;
    };

    const handleOngoing = (data: OngoingCallInfo) => {
      // Don't show the banner for the chat we're already in
      if (data.chatId === activeChatIdRef.current) return;
      setOngoingCallsByChatId((prev) => new Map(prev).set(data.chatId, data));
    };

    const handleFinished = (data: { chatId: string }) => {
      setOngoingCallsByChatId((prev) => {
        const next = new Map(prev);
        next.delete(data.chatId);
        return next;
      });
    };

    /** Callee side: caller timed out — dismiss the incoming call UI. */
    const handleMissed = () => {
      console.log('[Call] Caller gave up — dismissing incoming call');
      if (incomingTimeoutRef.current) {
        clearTimeout(incomingTimeoutRef.current);
        incomingTimeoutRef.current = null;
      }
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

    const handleRejected = (data?: { rejectorName?: string }) => {
      const name = data?.rejectorName || 'Someone';
      rejectedCountRef.current += 1;
      console.log(`[Call] ${name} declined (${rejectedCountRef.current}/${pendingRecipientCountRef.current})`);

      // In a group call only end when every recipient has declined and no peer connected
      const allDeclined = rejectedCountRef.current >= pendingRecipientCountRef.current;
      const noneConnected = peersRef.current.size === 0;

      if (allDeclined && noneConnected) {
        // Emit CALL_END so backend decrements count → emits CALL_FINISHED → removes banners
        if (activeChatIdRef.current) {
          socketManager.emit(SOCKET_EVENTS.CALL_END, { chatId: activeChatIdRef.current });
        }
        toast.error(
          pendingRecipientCountRef.current === 1
            ? 'Call was declined'
            : 'Everyone declined the call',
        );
        wasRejectedRef.current = true;
        cleanupCall();
      } else {
        toast(`${name} declined`);
      }
    };

    const handleVideoState = (data: unknown) => {
      const { senderId, videoEnabled } = data as { senderId: string; videoEnabled: boolean };
      setRemoteVideoStates((prev) => {
        const next = new Map(prev);
        next.set(senderId, videoEnabled);
        return next;
      });
    };

    const handleAudioState = (data: unknown) => {
      const { senderId, isMuted } = data as { senderId: string; isMuted: boolean };
      setRemoteMuteStates((prev) => {
        const next = new Map(prev);
        next.set(senderId, isMuted);
        return next;
      });
    };

    const handleScreenSharing = (data: unknown) => {
      const { userId } = data as { userId: string; chatId: string };
      setSharingUserId(userId);
    };

    const handleScreenStopped = (data: unknown) => {
      const { userId } = data as { userId: string; chatId: string };
      setSharingUserId((prev) => (prev === userId ? null : prev));
    };

    // Register via socketManager — handlers persist in its internal registry
    // and are re-attached automatically after each reconnect.
    socketManager.on(SOCKET_EVENTS.CALL_INCOMING, handleIncoming as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socketManager.on(SOCKET_EVENTS.CALL_RINGING, handleRinging as (data: any) => void);
    socketManager.on(SOCKET_EVENTS.CALL_MISSED, handleMissed as any);
    socketManager.on(SOCKET_EVENTS.CALL_USER_JOINED, handleUserJoined as any);
    socketManager.on(SOCKET_EVENTS.CALL_SIGNAL, handleSignal as any);
    socketManager.on(SOCKET_EVENTS.CALL_ENDED, handleEnded as any);
    socketManager.on(SOCKET_EVENTS.CALL_REJECTED, handleRejected as any);
    socketManager.on(SOCKET_EVENTS.CALL_VIDEO_STATE, handleVideoState);
    socketManager.on(SOCKET_EVENTS.CALL_AUDIO_STATE, handleAudioState);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    socketManager.on(SOCKET_EVENTS.CALL_ONGOING, handleOngoing as any);
    socketManager.on(SOCKET_EVENTS.CALL_FINISHED, handleFinished as any);
    socketManager.on(SOCKET_EVENTS.CALL_SCREEN_SHARING, handleScreenSharing);
    socketManager.on(SOCKET_EVENTS.CALL_SCREEN_STOPPED, handleScreenStopped);

    return () => {
      socketManager.off(SOCKET_EVENTS.CALL_INCOMING, handleIncoming as any);
      socketManager.off(SOCKET_EVENTS.CALL_RINGING, handleRinging as any);
      socketManager.off(SOCKET_EVENTS.CALL_MISSED, handleMissed as any);
      socketManager.off(SOCKET_EVENTS.CALL_USER_JOINED, handleUserJoined as any);
      socketManager.off(SOCKET_EVENTS.CALL_SIGNAL, handleSignal as any);
      socketManager.off(SOCKET_EVENTS.CALL_ENDED, handleEnded as any);
      socketManager.off(SOCKET_EVENTS.CALL_REJECTED, handleRejected as any);
      socketManager.off(SOCKET_EVENTS.CALL_VIDEO_STATE, handleVideoState);
      socketManager.off(SOCKET_EVENTS.CALL_AUDIO_STATE, handleAudioState);
      socketManager.off(SOCKET_EVENTS.CALL_ONGOING, handleOngoing as any);
      socketManager.off(SOCKET_EVENTS.CALL_FINISHED, handleFinished as any);
      socketManager.off(SOCKET_EVENTS.CALL_SCREEN_SHARING, handleScreenSharing);
      socketManager.off(SOCKET_EVENTS.CALL_SCREEN_STOPPED, handleScreenStopped);
      /* eslint-enable @typescript-eslint/no-explicit-any */
    };
  // Run once on mount — socketManager.on() persists handlers through reconnects
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createPeer, cleanupCall]);

  // ── Call actions ───────────────────────────────────────────────────────────

  const startCall = async (chatId: string, type: 'audio' | 'video') => {
    try {
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      setCallType(type);
      callTypeRef.current = type;
      setCallStatus('calling');
      setIsCallActive(true);
      isCallActiveRef.current = true;
      isInitiatorRef.current = true;
      callStartTimeRef.current = null;

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

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    if (incomingTimeoutRef.current) {
      clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }

    try {
      // Set active BEFORE getting media so the signal handler sees it immediately
      // Status is 'calling' (not 'connected') — actual connection established when stream arrives
      setCallStatus('calling');
      setIsCallActive(true);
      isCallActiveRef.current = true;
      isInitiatorRef.current = false;
      callStartTimeRef.current = null;
      callTypeRef.current = call.type;
      activeChatIdRef.current = call.chatId;
      setActiveChatId(call.chatId);

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

    if (incomingTimeoutRef.current) {
      clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }

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
    const newMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted;
    });
    setIsMuted(newMuted);
    if (activeChatIdRef.current) {
      socketManager.emit(SOCKET_EVENTS.CALL_AUDIO_STATE, {
        chatId: activeChatIdRef.current,
        isMuted: newMuted,
      });
    }
  };

  const toggleVideo = () => {
    if (callType !== 'video') return;
    const newEnabled = !isVideoEnabled;
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = newEnabled;
    });
    setIsVideoEnabled(newEnabled);
    if (activeChatIdRef.current) {
      socketManager.emit(SOCKET_EVENTS.CALL_VIDEO_STATE, {
        chatId: activeChatIdRef.current,
        videoEnabled: newEnabled,
      });
    }
  };

  const toggleMinimize = () => setIsMinimized((prev) => !prev);

  const addToCall = (targetUserId: string) => {
    if (!activeChatIdRef.current || callStatus !== 'connected') return;
    socketManager.emit(SOCKET_EVENTS.CALL_ADD_MEMBER, {
      chatId: activeChatIdRef.current,
      targetUserId,
      type: callType,
    });
  };

  const stopScreenShare = useCallback(() => {
    if (!screenStreamRef.current) return;
    screenStreamRef.current.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    setScreenStream(null);
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
    }
    pipWindowRef.current = null;
    setPipWindow(null);

    // Restore camera video track in all peer connections
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    peersRef.current.forEach((peer) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pc = (peer as any)._pc as RTCPeerConnection | undefined;
      if (!pc) return;
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && cameraTrack) sender.replaceTrack(cameraTrack).catch(console.error);
    });

    if (activeChatIdRef.current) {
      socketManager.emit(SOCKET_EVENTS.CALL_SCREEN_SHARE_STOP, { chatId: activeChatIdRef.current });
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    if (!activeChatIdRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) { stream.getTracks().forEach((t) => t.stop()); return; }

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);

      // Replace video track in all active peer connections
      peersRef.current.forEach((peer) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pc = (peer as any)._pc as RTCPeerConnection | undefined;
        if (!pc) return;
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack).catch(console.error);
      });

      socketManager.emit(SOCKET_EVENTS.CALL_SCREEN_SHARE_START, { chatId: activeChatIdRef.current });

      // Auto-stop when user clicks browser's native "Stop sharing" button
      videoTrack.addEventListener('ended', () => stopScreenShare());

      // Open Document Picture-in-Picture (Chrome 116+) so the bar floats above all tabs/apps
      if ('documentPictureInPicture' in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pip = await (window as any).documentPictureInPicture.requestWindow({
            width: 270,
            height: 380,
            disallowReturnToOpener: false,
          });
          // Basic reset so our dark UI renders correctly
          const style = pip.document.createElement('style');
          style.textContent = '*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; } html, body { height:100%; overflow:hidden; background:#111b21; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }';
          pip.document.head.appendChild(style);
          pipWindowRef.current = pip;
          setPipWindow(pip);
          pip.addEventListener('pagehide', () => {
            pipWindowRef.current = null;
            setPipWindow(null);
          });
        } catch {
          // Not supported or user dismissed — fall back to in-page portal bar
        }
      }
    } catch (err) {
      console.error('[Call] Screen share failed:', err);
    }
  }, [stopScreenShare]);

  const joinOngoingCall = async (chatId: string, type: 'audio' | 'video') => {
    try {
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      setCallType(type);
      callTypeRef.current = type;
      setCallStatus('calling');
      setIsCallActive(true);
      isCallActiveRef.current = true;
      isInitiatorRef.current = false;
      callStartTimeRef.current = null;

      // Remove the banner for this chat immediately
      setOngoingCallsByChatId((prev) => {
        const next = new Map(prev);
        next.delete(chatId);
        return next;
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === 'video',
        audio: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(type === 'video');
      setIsMuted(false);

      socketManager.emit(SOCKET_EVENTS.CALL_JOIN, { chatId });
    } catch (err: unknown) {
      console.error('[Call] Failed to join ongoing call:', err);
      toast.error(getMediaErrorMessage(err));
      cleanupCall();
    }
  };

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
        remoteVideoStates,
        remoteMuteStates,
        activeChatId,
        isMinimized,
        isMuted,
        isVideoEnabled,
        ongoingCallsByChatId,
        isScreenSharing,
        screenStream,
        sharingUserId,
        pipWindow,
        startCall,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleMinimize,
        addToCall,
        joinOngoingCall,
        startScreenShare,
        stopScreenShare,
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
