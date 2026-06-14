import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { socketManager } from '../shared/socket/SocketManager';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';

// Lazy-load WebRTC to prevent crash on startup if hardware not available
let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let MediaStream: any;
let mediaDevices: any;
try {
  const webrtc = require('react-native-webrtc');
  RTCPeerConnection = webrtc.RTCPeerConnection;
  RTCSessionDescription = webrtc.RTCSessionDescription;
  RTCIceCandidate = webrtc.RTCIceCandidate;
  MediaStream = webrtc.MediaStream;
  mediaDevices = webrtc.mediaDevices;
} catch (e) {
  console.warn('[CallContext] react-native-webrtc not available:', e);
}

// ── ICE Config ────────────────────────────────────────────────────────────────

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'bfd9bc0f231dcb23a8625d17',
      credential: 'g65qhBaLA/r80etz',
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'bfd9bc0f231dcb23a8625d17',
      credential: 'g65qhBaLA/r80etz',
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'bfd9bc0f231dcb23a8625d17',
      credential: 'g65qhBaLA/r80etz',
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'bfd9bc0f231dcb23a8625d17',
      credential: 'g65qhBaLA/r80etz',
    },
  ],
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface IncomingCallData {
  chatId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  type: 'audio' | 'video';
}

interface CallContextType {
  isCallActive: boolean;
  callStatus: 'idle' | 'calling' | 'incoming' | 'connected';
  callType: 'audio' | 'video';
  incomingCall: IncomingCallData | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  activeChatId: string | null;
  startCall: (chatId: string, type: 'audio' | 'video') => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Refs for stable closures inside socket handlers
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isCallActiveRef = useRef(false);
  const incomingCallRef = useRef<IncomingCallData | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync
  useEffect(() => { isCallActiveRef.current = isCallActive; }, [isCallActive]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  const cleanupCall = useCallback(() => {
    console.log('[Call] Cleaning up');

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    localStreamRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setIncomingCall(null);
    setCallStatus('idle');
    setIsCallActive(false);
    setActiveChatId(null);
    isCallActiveRef.current = false;
    activeChatIdRef.current = null;
  }, []);

  // ── PeerConnection factory ────────────────────────────────────────────────────

  const createPeerConnection = useCallback(
    (targetUserId: string, isInitiator: boolean, stream: MediaStream) => {
      console.log(`[Call] Creating PeerConnection (initiator: ${isInitiator})`);

      const pc = new RTCPeerConnection(ICE_SERVERS as any);
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach((track: any) => {
        (pc as any).addTrack(track, stream);
      });

      // ICE candidates → forward via socket
      (pc as any).onicecandidate = ({ candidate }: any) => {
        if (candidate) {
          socketManager.emit(SOCKET_EVENTS.CALL_SIGNAL, {
            targetUserId,
            type: 'candidate',
            signal: { type: 'candidate', candidate },
            chatId: activeChatIdRef.current,
          });
        }
      };

      // Remote track arrived → build remoteStream
      (pc as any).ontrack = ({ streams }: any) => {
        console.log('[Call] Remote track received');
        if (streams && streams[0]) {
          setRemoteStream(streams[0]);
          setCallStatus('connected');
        }
      };

      (pc as any).onconnectionstatechange = () => {
        console.log('[Call] Connection state:', pc.connectionState);
        if ((pc as any).connectionState === 'failed' || (pc as any).connectionState === 'disconnected') {
          cleanupCall();
        }
      };

      return pc;
    },
    [cleanupCall],
  );

  // ── Socket event handlers ─────────────────────────────────────────────────────

  useEffect(() => {
    const handleIncoming = (data: IncomingCallData) => {
      console.log('[Call] Incoming from', data.callerId, data.type);
      if (isCallActiveRef.current) {
        socketManager.emit(SOCKET_EVENTS.CALL_REJECT, {
          chatId: data.chatId,
          callerId: data.callerId,
        });
        return;
      }
      setIncomingCall(data);
      setCallStatus('incoming');
      setCallType(data.type);
    };

    const handleMissed = () => {
      console.log('[Call] Caller gave up');
      setIncomingCall(null);
      setCallStatus('idle');
    };

    const handleUserJoined = async (data: { userId: string; chatId: string }) => {
      console.log('[Call] User joined:', data.userId);

      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }

      if (!isCallActiveRef.current || !localStreamRef.current || !pcRef.current) return;

      // Initiator creates offer
      try {
        const offer = await pcRef.current.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any);
        await pcRef.current.setLocalDescription(new RTCSessionDescription(offer as any));
        socketManager.emit(SOCKET_EVENTS.CALL_SIGNAL, {
          targetUserId: data.userId,
          type: 'offer',
          signal: { type: 'offer', sdp: offer },
          chatId: activeChatIdRef.current,
        });
      } catch (err) {
        console.error('[Call] Failed to create offer:', err);
      }
    };

    const handleSignal = async (data: {
      senderId: string;
      type: string;
      signal: any;
    }) => {
      console.log(`[Call] Signal from ${data.senderId}: ${data.type}`);

      if (!isCallActiveRef.current) return;

      // Create PC if not yet created (callee receiving offer)
      if (!pcRef.current && localStreamRef.current) {
        createPeerConnection(data.senderId, false, localStreamRef.current);
      }
      if (!pcRef.current) return;

      const { type, signal } = data;

      try {
        if (type === 'offer') {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: signal.sdp } as any),
          );
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(new RTCSessionDescription(answer as any));
          socketManager.emit(SOCKET_EVENTS.CALL_SIGNAL, {
            targetUserId: data.senderId,
            type: 'answer',
            signal: { type: 'answer', sdp: answer },
            chatId: activeChatIdRef.current,
          });
        } else if (type === 'answer') {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: signal.sdp } as any),
          );
        } else if (type === 'candidate' && signal.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error('[Call] Signal handling error:', err);
      }
    };

    const handleEnded = () => {
      console.log('[Call] Call ended by remote');
      cleanupCall();
    };

    const handleRejected = () => {
      console.log('[Call] Call rejected');
      cleanupCall();
    };

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
  }, [createPeerConnection, cleanupCall]);

  // ── Call actions ──────────────────────────────────────────────────────────────

  const startCall = async (chatId: string, type: 'audio' | 'video') => {
    try {
      setCallType(type);
      setCallStatus('calling');
      setIsCallActive(true);
      setActiveChatId(chatId);
      isCallActiveRef.current = true;
      activeChatIdRef.current = chatId;

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
          ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
          : false,
      }) as MediaStream;

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(type === 'video');
      setIsMuted(false);

      // Create PC so it's ready when user-joined fires
      createPeerConnection('', true, stream);

      socketManager.emit(SOCKET_EVENTS.CALL_START, { chatId, offer: null, type });

      // Auto-cancel after 45 seconds
      callTimeoutRef.current = setTimeout(() => {
        console.log('[Call] No answer — cancelling');
        socketManager.emit(SOCKET_EVENTS.CALL_MISSED, { chatId, type });
        cleanupCall();
      }, 45_000);
    } catch (err) {
      console.error('[Call] Failed to start:', err);
      cleanupCall();
    }
  };

  const answerCall = async () => {
    const call = incomingCallRef.current;
    if (!call) return;

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    try {
      setCallStatus('calling');
      setIsCallActive(true);
      isCallActiveRef.current = true;
      setActiveChatId(call.chatId);
      activeChatIdRef.current = call.chatId;

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: call.type === 'video'
          ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
          : false,
      }) as MediaStream;

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(call.type === 'video');
      setIsMuted(false);
      setCallType(call.type);

      // Announce join — caller will get CALL_USER_JOINED and send offer
      socketManager.emit(SOCKET_EVENTS.CALL_JOIN, { chatId: call.chatId });
      setIncomingCall(null);
    } catch (err) {
      console.error('[Call] Failed to answer:', err);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    const call = incomingCallRef.current;
    console.log('[Call] Rejecting');
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
    localStreamRef.current?.getAudioTracks().forEach((t: any) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((prev) => !prev);
  };

  const toggleVideo = () => {
    if (callType !== 'video') return;
    localStreamRef.current?.getVideoTracks().forEach((t: any) => {
      t.enabled = !t.enabled;
    });
    setIsVideoEnabled((prev) => !prev);
  };

  return (
    <CallContext.Provider
      value={{
        isCallActive,
        callStatus,
        callType,
        incomingCall,
        localStream,
        remoteStream,
        isMuted,
        isVideoEnabled,
        activeChatId,
        startCall,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useCall = (): CallContextType => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within a CallProvider');
  return ctx;
};
