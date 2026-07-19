import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { socketManager } from '../shared/socket/SocketManager';
import { SOCKET_EVENTS } from '../shared/constants/socket-events';
import { useSocketContext } from './SocketProvider';
import { useChatStore } from '../stores/chatStore';
import notifee, { EventType } from '@notifee/react-native';
import {
  getPendingCall,
  clearPendingCall,
  cancelIncomingCallNotification,
  handleNotifeeCallEvent,
} from '../services/incomingCallNotification';

// Lazy-load WebRTC to prevent crash on startup if hardware not available
let RTCPeerConnection: any;
let RTCSessionDescription: any;
let RTCIceCandidate: any;
let mediaDevices: any;
try {
  const webrtc = require('react-native-webrtc');
  RTCPeerConnection = webrtc.RTCPeerConnection;
  RTCSessionDescription = webrtc.RTCSessionDescription;
  RTCIceCandidate = webrtc.RTCIceCandidate;
  mediaDevices = webrtc.mediaDevices;
} catch (e) {
  console.warn('[CallContext] react-native-webrtc not available:', e);
}

// Lazy-load InCallManager — controls speaker/earpiece routing during WebRTC calls.
// expo-av's setAudioModeAsync does NOT affect WebRTC audio on iOS because
// react-native-webrtc takes over the AVAudioSession.
let InCallManager: any = null;
try {
  InCallManager = require('react-native-incall-manager').default;
} catch {
  console.warn('[CallContext] react-native-incall-manager not available — speaker routing may not work');
}

// ── ICE Config ────────────────────────────────────────────────────────────────

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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
  callId?: string;
  chatId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
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
  remoteVideoStates: Map<string, boolean>;
  remoteMuteStates: Map<string, boolean>;
  activeSpeakers: Set<string>;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeaker: boolean;
  activeChatId: string | null;
  /** Ongoing calls in other chats — keyed by chatId. Used to show the "Tap to join" banner. */
  ongoingCallsByChatId: Map<string, OngoingCallInfo>;
  isScreenSharing: boolean;
  screenStream: MediaStream | null;
  sharingUserId: string | null;
  startCall: (chatId: string, type: 'audio' | 'video') => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;
  addToCall: (targetUserId: string) => void;
  joinOngoingCall: (chatId: string, type: 'audio' | 'video') => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteVideoStates, setRemoteVideoStates] = useState<Map<string, boolean>>(new Map());
  const [remoteMuteStates, setRemoteMuteStates] = useState<Map<string, boolean>>(new Map());
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [ongoingCallsByChatId, setOngoingCallsByChatId] = useState<Map<string, OngoingCallInfo>>(new Map());
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sharingUserId, setSharingUserId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const { sendMessage } = useSocketContext();

  // Map of userId → RTCPeerConnection (one per remote participant)
  const peerConnectionsRef = useRef<Map<string, any>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  /** Guards against overlapping upgradeToVideo() calls from repeated button taps. */
  const upgradingVideoRef = useRef(false);
  const isCallActiveRef = useRef(false);
  const incomingCallRef = useRef<IncomingCallData | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-sender ICE candidate queue (buffered before remoteDescription is set)
  const pendingCandidatesRef = useRef<Map<string, any[]>>(new Map());
  /** Auto-dismiss timer on the recipient side — clears when answered, rejected, or missed. */
  const incomingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callStartTimeRef = useRef<number | null>(null);
  const isInitiatorRef = useRef<boolean>(false);
  const callStatusRef = useRef<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const callTypeRef = useRef<'audio' | 'video'>('audio');
  const sendMessageRef = useRef(sendMessage);

  const incomingSoundRef = useRef<Audio.Sound | null>(null);
  const outgoingSoundRef = useRef<Audio.Sound | null>(null);
  /** Total recipients ringing — set when CALL_RINGING ack arrives from server. */
  const pendingRecipientCountRef = useRef(0);
  /** How many recipients have explicitly declined so far. */
  const rejectedCountRef = useRef(0);

  // Initialize sounds
  useEffect(() => {
    (async () => {
      try {
        const { sound: iSound } = await Audio.Sound.createAsync(
          require('../../assets/audio/incoming.wav'),
          { isLooping: true }
        );
        incomingSoundRef.current = iSound;

        const { sound: oSound } = await Audio.Sound.createAsync(
          require('../../assets/audio/outgoing.wav'),
          { isLooping: true }
        );
        outgoingSoundRef.current = oSound;
      } catch (err) {
        console.warn('[Call] Failed to load sounds:', err);
      }
    })();
    return () => {
      incomingSoundRef.current?.unloadAsync().catch(() => {});
      outgoingSoundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  // Poll audio stats to detect active speakers.
  // Paused during screen sharing — reduces getStats calls (and their debug spam)
  // which were causing RTCView re-renders and visible flickering.
  useEffect(() => {
    if (!isCallActive || isScreenSharing) return;
    const interval = setInterval(() => {
      const speaking = new Set<string>();
      const checks: Promise<void>[] = [];
      peerConnectionsRef.current.forEach((pc, userId) => {
        const p = new Promise<void>((resolve) => {
          try {
            pc.getStats(null, (statsReport: any) => {
              const stats: any[] = Array.isArray(statsReport) ? statsReport : [];
              const active = stats.some((s: any) =>
                (s.type === 'ssrc' && s.mediaType === 'audio' &&
                  ((s.audioOutputLevel ?? 0) > 300 || (s.audioInputLevel ?? 0) > 300)) ||
                (s.type === 'inbound-rtp' && s.kind === 'audio' && (s.audioLevel ?? 0) > 0.01)
              );
              if (active) speaking.add(userId);
              resolve();
            }, () => resolve());
          } catch { resolve(); }
        });
        checks.push(p);
      });
      Promise.all(checks).then(() => setActiveSpeakers(new Set(speaking)));
    }, 1500);
    return () => clearInterval(interval);
  }, [isCallActive, isScreenSharing]);

  // Keep refs in sync
  useEffect(() => { isCallActiveRef.current = isCallActive; }, [isCallActive]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);
  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);
  useEffect(() => { callTypeRef.current = callType; }, [callType]);
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ── Speaker mode ──────────────────────────────────────────────────────────────
  // react-native-incall-manager properly controls speaker/earpiece routing in a
  // WebRTC context. expo-av's setAudioModeAsync is ignored by WebRTC on iOS
  // because react-native-webrtc owns the AVAudioSession while the call is live.

  const applySpeakerMode = (speaker: boolean) => {
    if (InCallManager) {
      InCallManager.setForceSpeakerphoneOn(speaker);
    }
  };

  const startInCallAudio = (type: 'audio' | 'video') => {
    if (InCallManager) {
      InCallManager.start({ media: type, auto: false, ringback: '' });
      InCallManager.setForceSpeakerphoneOn(false);
    }
  };

  const stopInCallAudio = () => {
    if (InCallManager) {
      InCallManager.stop();
    }
  };

  const toggleSpeaker = () => {
    const next = !isSpeaker;
    setIsSpeaker(next);
    applySpeakerMode(next);
  };

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  const cleanupCall = useCallback(() => {
    console.log('[Call] Cleaning up');

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }

    if (incomingTimeoutRef.current) {
      clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }

    try { incomingSoundRef.current?.stopAsync().catch(() => {}); } catch {}
    try { outgoingSoundRef.current?.stopAsync().catch(() => {}); } catch {}
    stopInCallAudio();

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => { try { pc.close(); } catch {} });
    peerConnectionsRef.current.clear();

    // Dispatch call log if initiator
    if (isInitiatorRef.current && activeChatIdRef.current && callStatusRef.current !== 'idle' && callStatusRef.current !== 'incoming') {
      let duration = 0;
      let status = 'missed';

      if (callStatusRef.current === 'connected' && callStartTimeRef.current) {
        duration = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
        status = 'ended';
      } else if (callStatusRef.current === ('rejected' as any)) {
        status = 'rejected';
      } else if (callStatusRef.current === 'calling') {
        status = 'missed';
      }

      const payload = JSON.stringify({
        status,
        duration,
        isVideo: callTypeRef.current === 'video'
      });

      const capturedChatId = activeChatIdRef.current;
      setTimeout(() => {
        if (capturedChatId) {
          sendMessageRef.current(capturedChatId, payload, 'missed_call');
        }
      }, 50);
    }

    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    localStreamRef.current = null;

    screenStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    screenStreamRef.current = null;

    setIsScreenSharing(false);
    setScreenStream(null);
    setSharingUserId(null);

    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: true,
    }).catch(() => {});

    setLocalStream(null);
    setRemoteStreams(new Map());
    setRemoteVideoStates(new Map());
    setRemoteMuteStates(new Map());
    setIncomingCall(null);
    setCallStatus('idle');
    setIsCallActive(false);
    setActiveChatId(null);
    setIsSpeaker(false);
    isCallActiveRef.current = false;
    activeChatIdRef.current = null;
    pendingCandidatesRef.current.clear();
    callStartTimeRef.current = null;
    isInitiatorRef.current = false;
    pendingRecipientCountRef.current = 0;
    rejectedCountRef.current = 0;
  }, []);

  // ── PeerConnection factory ────────────────────────────────────────────────────
  // Creates one RTCPeerConnection per remote user and stores it in peerConnectionsRef.

  const createPeerConnection = useCallback(
    (targetUserId: string, isInitiator: boolean, stream: MediaStream) => {
      console.log(`[Call] Creating PC for ${targetUserId} (initiator: ${isInitiator})`);

      const pc = new RTCPeerConnection(ICE_SERVERS as any);
      peerConnectionsRef.current.set(targetUserId, pc);

      // Add all local tracks to this peer connection
      stream.getTracks().forEach((track: any) => {
        (pc as any).addTrack(track, stream);
      });

      // ICE candidates — closed over targetUserId so each PC routes independently
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

      // Remote track arrived — add to the per-user streams Map
      (pc as any).ontrack = ({ streams }: any) => {
        console.log(`[Call] Remote track received from ${targetUserId}`);
        if (streams && streams[0]) {
          try { outgoingSoundRef.current?.stopAsync().catch(() => {}); } catch {}
          setRemoteStreams(prev => new Map(prev).set(targetUserId, streams[0]));
          setCallStatus('connected');
          if (!callStartTimeRef.current) {
            callStartTimeRef.current = Date.now();
          }
        }
      };

      // When a single peer fails, remove them. If no peers remain, end the call.
      const removePeer = () => {
        if (!peerConnectionsRef.current.has(targetUserId)) return;
        try { pc.close(); } catch {}
        peerConnectionsRef.current.delete(targetUserId);
        setRemoteStreams(prev => { const m = new Map(prev); m.delete(targetUserId); return m; });
        setRemoteVideoStates(prev => { const m = new Map(prev); m.delete(targetUserId); return m; });
        setRemoteMuteStates(prev => { const m = new Map(prev); m.delete(targetUserId); return m; });
        pendingCandidatesRef.current.delete(targetUserId);

        if (peerConnectionsRef.current.size === 0 && isCallActiveRef.current) {
          if (activeChatIdRef.current) {
            socketManager.emit(SOCKET_EVENTS.CALL_END, { chatId: activeChatIdRef.current });
          }
          cleanupCall();
        }
      };

      (pc as any).onconnectionstatechange = () => {
        const state = (pc as any).connectionState;
        console.log(`[Call] PC state for ${targetUserId}:`, state);
        if (state === 'failed' || state === 'disconnected') {
          removePeer();
        }
      };

      (pc as any).oniceconnectionstatechange = () => {
        const state = (pc as any).iceConnectionState;
        console.log(`[Call] ICE state for ${targetUserId}:`, state);
        if (state === 'failed') {
          removePeer();
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
      try { incomingSoundRef.current?.playAsync().catch(() => {}); } catch {}

      useChatStore.getState().updateChat(data.chatId, { updatedAt: new Date().toISOString() });

      // Auto-dismiss after 60s if caller never cancels — safety net
      if (incomingTimeoutRef.current) clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = setTimeout(() => {
        incomingTimeoutRef.current = null;
        try { incomingSoundRef.current?.stopAsync().catch(() => {}); } catch {}
        setIncomingCall(null);
        setCallStatus('idle');
      }, 60_000);
    };

    const handleRinging = (data: { recipientCount: number }) => {
      pendingRecipientCountRef.current = data.recipientCount;
      rejectedCountRef.current = 0;
    };

    const handleMissed = () => {
      console.log('[Call] Caller gave up');
      if (incomingTimeoutRef.current) {
        clearTimeout(incomingTimeoutRef.current);
        incomingTimeoutRef.current = null;
      }
      try { incomingSoundRef.current?.stopAsync().catch(() => {}); } catch {}
      setIncomingCall(null);
      setCallStatus('idle');
    };

    const handleUserJoined = async (data: { userId: string; chatId: string }) => {
      console.log('[Call] User joined:', data.userId);

      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }

      if (!isCallActiveRef.current || !localStreamRef.current) return;

      // Guard against duplicate connections to the same user
      if (peerConnectionsRef.current.has(data.userId)) return;

      createPeerConnection(data.userId, true, localStreamRef.current);
      const pc = peerConnectionsRef.current.get(data.userId);
      if (!pc) return;

      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any);
        await pc.setLocalDescription(new RTCSessionDescription(offer as any));
        socketManager.emit(SOCKET_EVENTS.CALL_SIGNAL, {
          targetUserId: data.userId,
          type: 'offer',
          signal: offer,
          chatId: activeChatIdRef.current,
        });
      } catch (err) {
        console.error('[Call] Failed to create offer for', data.userId, err);
      }
    };

    const handleSignal = async (data: {
      senderId: string;
      type: string;
      signal: any;
    }) => {
      console.log(`[Call] Signal from ${data.senderId}: ${data.type}`);

      if (!isCallActiveRef.current) return;

      const { senderId, type, signal } = data;

      // Create a PC for this sender if we don't have one (answerer side)
      if (!peerConnectionsRef.current.has(senderId) && localStreamRef.current) {
        createPeerConnection(senderId, false, localStreamRef.current);
      }
      const pc = peerConnectionsRef.current.get(senderId);
      if (!pc) return;

      // Per-sender ICE candidate buffer
      if (!pendingCandidatesRef.current.has(senderId)) {
        pendingCandidatesRef.current.set(senderId, []);
      }
      const pending = pendingCandidatesRef.current.get(senderId)!;

      try {
        if (type === 'offer') {
          let sdpString = signal.sdp;
          if (typeof signal.sdp === 'object' && signal.sdp !== null) {
            sdpString = signal.sdp.sdp;
          }
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: sdpString } as any));

          // Flush buffered ICE candidates for this sender
          while (pending.length > 0) {
            await pc.addIceCandidate(new RTCIceCandidate(pending.shift()));
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(new RTCSessionDescription(answer as any));
          socketManager.emit(SOCKET_EVENTS.CALL_SIGNAL, {
            targetUserId: senderId,
            type: 'answer',
            signal: answer,
            chatId: activeChatIdRef.current,
          });
        } else if (type === 'answer') {
          let sdpString = signal.sdp;
          if (typeof signal.sdp === 'object' && signal.sdp !== null) {
            sdpString = signal.sdp.sdp;
          }
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: sdpString } as any));

          while (pending.length > 0) {
            await pc.addIceCandidate(new RTCIceCandidate(pending.shift()));
          }
        } else if (type === 'candidate' && signal.candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            pending.push(signal.candidate);
          }
        }
      } catch (err) {
        console.error('[Call] Signal handling error for', senderId, err);
      }
    };

    const handleEnded = (data: { chatId: string; enderId: string }) => {
      const enderId = data?.enderId;
      console.log('[Call] Peer left:', enderId);

      if (enderId && peerConnectionsRef.current.has(enderId)) {
        try { peerConnectionsRef.current.get(enderId)?.close(); } catch {}
        peerConnectionsRef.current.delete(enderId);
        setRemoteStreams(prev => { const m = new Map(prev); m.delete(enderId); return m; });
        setRemoteVideoStates(prev => { const m = new Map(prev); m.delete(enderId); return m; });
        setRemoteMuteStates(prev => { const m = new Map(prev); m.delete(enderId); return m; });
        pendingCandidatesRef.current.delete(enderId);

        // If all peers have left, end the call locally too
        if (peerConnectionsRef.current.size === 0) {
          cleanupCall();
        }
      } else {
        cleanupCall();
      }
    };

    const handleRejected = (data?: { rejectorName?: string }) => {
      const name = data?.rejectorName || 'Someone';
      rejectedCountRef.current += 1;
      console.log(`[Call] ${name} declined (${rejectedCountRef.current}/${pendingRecipientCountRef.current})`);

      const allDeclined = rejectedCountRef.current >= pendingRecipientCountRef.current;
      const noneConnected = peerConnectionsRef.current.size === 0;

      if (allDeclined && noneConnected) {
        if (activeChatIdRef.current) {
          socketManager.emit(SOCKET_EVENTS.CALL_END, { chatId: activeChatIdRef.current });
        }
        callStatusRef.current = 'rejected' as any;
        cleanupCall();
      }
      // else: some members still pending or someone already connected — keep ringing
    };

    const handleVideoState = (data: { senderId: string; videoEnabled: boolean }) => {
      console.log('[Call] Remote video state from', data.senderId, '→', data.videoEnabled);
      setRemoteVideoStates(prev => new Map(prev).set(data.senderId, data.videoEnabled));
      // A peer turning their camera on mid-call upgrades this from an audio-only
      // call to a video call for everyone — unlocks the video-call UI (grid,
      // local PiP, etc.) so their incoming video track has somewhere to render.
      if (data.videoEnabled && callTypeRef.current !== 'video') {
        callTypeRef.current = 'video';
        setCallType('video');
      }
    };

    const handleAudioState = (data: { senderId: string; isMuted: boolean }) => {
      console.log('[Call] Remote audio state from', data.senderId, '→ muted:', data.isMuted);
      setRemoteMuteStates(prev => new Map(prev).set(data.senderId, data.isMuted));
    };

    socketManager.on(SOCKET_EVENTS.CALL_INCOMING, handleIncoming as any);
    socketManager.on(SOCKET_EVENTS.CALL_RINGING, handleRinging as any);
    socketManager.on(SOCKET_EVENTS.CALL_MISSED, handleMissed as any);
    socketManager.on(SOCKET_EVENTS.CALL_USER_JOINED, handleUserJoined as any);
    socketManager.on(SOCKET_EVENTS.CALL_SIGNAL, handleSignal as any);
    socketManager.on(SOCKET_EVENTS.CALL_ENDED, handleEnded as any);
    socketManager.on(SOCKET_EVENTS.CALL_REJECTED, handleRejected as any);
    socketManager.on(SOCKET_EVENTS.CALL_VIDEO_STATE, handleVideoState as any);
    socketManager.on(SOCKET_EVENTS.CALL_AUDIO_STATE, handleAudioState as any);

    const handleOngoing = (data: OngoingCallInfo) => {
      console.log('[Call] CALL_ONGOING received', data, 'activeChatId:', activeChatIdRef.current);
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
    socketManager.on(SOCKET_EVENTS.CALL_ONGOING, handleOngoing as any);
    socketManager.on(SOCKET_EVENTS.CALL_FINISHED, handleFinished as any);

    const handleScreenSharing = (data: { userId: string; chatId: string }) => {
      setSharingUserId(data.userId);
    };
    const handleScreenStopped = (data: { userId: string; chatId: string }) => {
      setSharingUserId((prev) => (prev === data.userId ? null : prev));
    };
    socketManager.on(SOCKET_EVENTS.CALL_SCREEN_SHARING, handleScreenSharing as any);
    socketManager.on(SOCKET_EVENTS.CALL_SCREEN_STOPPED, handleScreenStopped as any);

    return () => {
      socketManager.off(SOCKET_EVENTS.CALL_INCOMING, handleIncoming as any);
      socketManager.off(SOCKET_EVENTS.CALL_RINGING, handleRinging as any);
      socketManager.off(SOCKET_EVENTS.CALL_MISSED, handleMissed as any);
      socketManager.off(SOCKET_EVENTS.CALL_USER_JOINED, handleUserJoined as any);
      socketManager.off(SOCKET_EVENTS.CALL_SIGNAL, handleSignal as any);
      socketManager.off(SOCKET_EVENTS.CALL_ENDED, handleEnded as any);
      socketManager.off(SOCKET_EVENTS.CALL_REJECTED, handleRejected as any);
      socketManager.off(SOCKET_EVENTS.CALL_VIDEO_STATE, handleVideoState as any);
      socketManager.off(SOCKET_EVENTS.CALL_AUDIO_STATE, handleAudioState as any);
      socketManager.off(SOCKET_EVENTS.CALL_ONGOING, handleOngoing as any);
      socketManager.off(SOCKET_EVENTS.CALL_FINISHED, handleFinished as any);
      socketManager.off(SOCKET_EVENTS.CALL_SCREEN_SHARING, handleScreenSharing as any);
      socketManager.off(SOCKET_EVENTS.CALL_SCREEN_STOPPED, handleScreenStopped as any);
    };
  }, [createPeerConnection, cleanupCall]);

  // ── Reconcile a call surfaced by a push notification ───────────────────────
  // Covers both: the app cold-starting because the user tapped the
  // notification (backgrounded/killed — see index.js's background handler),
  // and the notification's Answer/Decline actions being tapped while the app
  // is already in the foreground.
  useEffect(() => {
    const reconcile = async () => {
      const pending = await getPendingCall();
      if (!pending) return;
      await clearPendingCall(pending.callId);
      // The OS-level notification/ringtone hands off to the in-app UI now.
      await cancelIncomingCallNotification(pending.callId);

      if (isCallActiveRef.current) return; // already mid-call — ignore stale ping

      const incoming: IncomingCallData = {
        callId: pending.callId,
        chatId: pending.chatId,
        callerId: pending.callerId,
        callerName: pending.callerName,
        callerAvatar: pending.callerAvatar,
        type: pending.type,
      };

      incomingCallRef.current = incoming;
      setIncomingCall(incoming);
      setCallStatus('incoming');
      setCallType(pending.type);

      if (pending.action === 'answer') {
        await answerCall();
      }
    };

    void reconcile();

    const unsubscribeForeground = notifee.onForegroundEvent(async ({ type, detail }) => {
      await handleNotifeeCallEvent({ type, detail });
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'decline') return;
      await reconcile();
    });

    return () => {
      unsubscribeForeground();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Call actions ──────────────────────────────────────────────────────────────

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        if (
          grants[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED ||
          grants[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] !== PermissionsAndroid.RESULTS.GRANTED
        ) {
          throw new Error('Camera/Microphone permissions required');
        }
      } catch (err) {
        console.warn('[Call] Permission check failed:', err);
        throw err;
      }
    }
  };

  const startCall = async (chatId: string, type: 'audio' | 'video') => {
    try {
      await requestPermissions();

      setCallType(type);
      callTypeRef.current = type;
      setCallStatus('calling');
      setIsCallActive(true);
      setActiveChatId(chatId);
      isCallActiveRef.current = true;
      activeChatIdRef.current = chatId;
      isInitiatorRef.current = true;
      callStartTimeRef.current = null;

      // Try video; fall back to audio-only if camera is unavailable
      let stream: any;
      let videoAvailable = type === 'video';
      if (type === 'video') {
        try {
          stream = await mediaDevices.getUserMedia({
            audio: true,
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          const vTracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
          if (vTracks.length === 0 || !vTracks.some((t: any) => t.readyState === 'live')) {
            videoAvailable = false;
          }
        } catch (camErr) {
          console.warn('[Call] Camera unavailable, falling back to audio-only:', camErr);
          stream = await mediaDevices.getUserMedia({ audio: true, video: false });
          videoAvailable = false;
        }
      } else {
        stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(videoAvailable);
      setIsMuted(false);

      // Speaker starts OFF — InCallManager.start sets up the WebRTC audio session
      setIsSpeaker(false);
      startInCallAudio(type);

      // DO NOT create PC yet — wait for CALL_USER_JOINED to know targetUserId
      socketManager.emit(SOCKET_EVENTS.CALL_START, {
        chatId: activeChatIdRef.current,
        type: callTypeRef.current,
      });
      try { outgoingSoundRef.current?.playAsync().catch(() => {}); } catch {}

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

    if (incomingTimeoutRef.current) {
      clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }

    try {
      await requestPermissions();

      setCallStatus('calling');
      setIsCallActive(true);
      isCallActiveRef.current = true;
      setActiveChatId(call.chatId);
      activeChatIdRef.current = call.chatId;
      isInitiatorRef.current = false;
      callStartTimeRef.current = null;
      callTypeRef.current = call.type;

      try {
        if (incomingSoundRef.current) {
          await incomingSoundRef.current.stopAsync().catch(() => {});
        }
      } catch (err) {
        console.warn('[Call] Failed to stop incoming sound:', err);
      }

      // Try video; fall back to audio-only if camera is unavailable
      let stream: any;
      let videoAvailable = call.type === 'video';
      if (call.type === 'video') {
        try {
          stream = await mediaDevices.getUserMedia({
            audio: true,
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          const vTracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
          if (vTracks.length === 0 || !vTracks.some((t: any) => t.readyState === 'live')) {
            videoAvailable = false;
          }
        } catch (camErr) {
          console.warn('[Call] Camera unavailable, falling back to audio-only:', camErr);
          stream = await mediaDevices.getUserMedia({ audio: true, video: false });
          videoAvailable = false;
        }
      } else {
        stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(videoAvailable);
      setIsMuted(false);
      setCallType(call.type);
      callTypeRef.current = call.type;

      // Speaker starts OFF — InCallManager.start sets up the WebRTC audio session
      setIsSpeaker(false);
      startInCallAudio(call.type);

      // Announce join — all existing participants get CALL_USER_JOINED and send offers
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
    localStreamRef.current?.getAudioTracks().forEach((t: any) => {
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

  // Turns the camera on for a call that started audio-only (or that this user
  // joined before it was upgraded) — acquires a camera track, adds it to the
  // local stream and every peer connection, and manually renegotiates each
  // connection that has no existing video sender yet (mirrors the same
  // pattern used for audio-call screen sharing — there's no onnegotiationneeded
  // handler wired up on these PCs, to avoid racing the initial-offer flow).
  const upgradeToVideo = useCallback(async () => {
    if (upgradingVideoRef.current || !localStreamRef.current || !activeChatIdRef.current || !mediaDevices) return;
    upgradingVideoRef.current = true;
    try {
      await requestPermissions();
      const camStream = await mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const videoTrack = camStream.getVideoTracks()[0];
      if (!videoTrack) return;

      // Mutate the existing local stream in place (same id) rather than
      // building a new one — peers already carry this stream's id in their
      // audio track's msid, and grouping the camera track under it keeps the
      // two on the same remote MediaStream instead of splitting into a
      // second, audio-less one on the receiving end.
      localStreamRef.current.addTrack(videoTrack);
      callTypeRef.current = 'video';
      setCallType('video');
      setIsVideoEnabled(true);

      for (const [targetUserId, pc] of peerConnectionsRef.current.entries()) {
        try {
          const senders = pc.getSenders();
          const videoSender = senders.find((s: any) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(videoTrack);
          } else {
            (pc as any).addTrack(videoTrack, localStreamRef.current);
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any);
            await pc.setLocalDescription(new RTCSessionDescription(offer as any));
            socketManager.emit(SOCKET_EVENTS.CALL_SIGNAL, {
              targetUserId,
              type: 'offer',
              signal: offer,
              chatId: activeChatIdRef.current,
            });
          }
        } catch (e) {
          console.warn('[Call] Upgrade-to-video track setup failed for', targetUserId, e);
        }
      }

      socketManager.emit(SOCKET_EVENTS.CALL_VIDEO_STATE, {
        chatId: activeChatIdRef.current,
        videoEnabled: true,
      });
    } catch (err) {
      console.error('[Call] Failed to upgrade to video:', err);
    } finally {
      upgradingVideoRef.current = false;
    }
  }, []);

  const toggleVideo = () => {
    const hasVideoTrack = (localStreamRef.current?.getVideoTracks().length ?? 0) > 0;
    if (!hasVideoTrack) {
      void upgradeToVideo();
      return;
    }
    const newEnabled = !isVideoEnabled;
    localStreamRef.current?.getVideoTracks().forEach((t: any) => {
      t.enabled = newEnabled;
    });
    setIsVideoEnabled(newEnabled);

    // Broadcast camera state to the entire chat room
    if (activeChatIdRef.current) {
      socketManager.emit(SOCKET_EVENTS.CALL_VIDEO_STATE, {
        chatId: activeChatIdRef.current,
        videoEnabled: newEnabled,
      });
    }
  };

  const stopScreenShare = useCallback(() => {
    if (!screenStreamRef.current) return;
    screenStreamRef.current.getTracks().forEach((t: any) => t.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
    setScreenStream(null);

    // Restore the camera video track in all peer connections — or, for calls
    // that never had a camera (audio-only calls), remove the video track we
    // added for sharing and manually renegotiate back down to audio-only.
    // There's no onnegotiationneeded handler wired up on these PCs (to avoid
    // racing the initial offer flow in handleUserJoined), so this mirrors
    // that same manual createOffer/setLocalDescription/emit sequence.
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    peerConnectionsRef.current.forEach((pc, targetUserId) => {
      (async () => {
        try {
          const senders = pc.getSenders();
          const videoSender = senders.find((s: any) => s.track?.kind === 'video');
          if (!videoSender) return;
          if (cameraTrack) {
            videoSender.replaceTrack(cameraTrack);
            return;
          }
          pc.removeTrack(videoSender);
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any);
          await pc.setLocalDescription(new RTCSessionDescription(offer as any));
          socketManager.emit(SOCKET_EVENTS.CALL_SIGNAL, {
            targetUserId,
            type: 'offer',
            signal: offer,
            chatId: activeChatIdRef.current,
          });
        } catch (e) {
          console.warn('[Call] replaceTrack restore failed:', e);
        }
      })();
    });

    if (activeChatIdRef.current) {
      socketManager.emit(SOCKET_EVENTS.CALL_SCREEN_SHARE_STOP, { chatId: activeChatIdRef.current });
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    if (!activeChatIdRef.current || !mediaDevices) return;
    try {
      const stream = await mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) { stream.getTracks().forEach((t: any) => t.stop()); return; }

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);

      // Replace the video track in all active peer connections — or, for
      // calls that never had a camera (audio-only calls), add a new video
      // track and manually renegotiate (mirrors the offer/answer flow in
      // handleUserJoined — there's no onnegotiationneeded handler wired up
      // on these PCs, to avoid racing that initial-offer flow).
      for (const [targetUserId, pc] of peerConnectionsRef.current.entries()) {
        try {
          const senders = pc.getSenders();
          const videoSender = senders.find((s: any) => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(videoTrack);
          } else if (localStreamRef.current) {
            // Group under the existing local (audio-only) stream so the
            // remote side adds this track to its existing MediaStream for
            // us, instead of treating it as a brand-new (audio-less) one.
            (pc as any).addTrack(videoTrack, localStreamRef.current);
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as any);
            await pc.setLocalDescription(new RTCSessionDescription(offer as any));
            socketManager.emit(SOCKET_EVENTS.CALL_SIGNAL, {
              targetUserId,
              type: 'offer',
              signal: offer,
              chatId: activeChatIdRef.current,
            });
          }
        } catch (e) {
          console.warn('[Call] Screen share track setup failed for', targetUserId, e);
        }
      }

      socketManager.emit(SOCKET_EVENTS.CALL_SCREEN_SHARE_START, { chatId: activeChatIdRef.current });

      // Auto-stop when the OS ends the screen capture
      (videoTrack as any).addEventListener?.('ended', () => stopScreenShare());
    } catch (err) {
      console.error('[Call] Screen share failed:', err);
    }
  }, [stopScreenShare]);

  const addToCall = (targetUserId: string) => {
    if (!activeChatIdRef.current || callStatus !== 'connected') return;
    socketManager.emit(SOCKET_EVENTS.CALL_ADD_MEMBER, {
      chatId: activeChatIdRef.current,
      targetUserId,
      type: callType,
    });
  };

  const joinOngoingCall = async (chatId: string, type: 'audio' | 'video') => {
    try {
      await requestPermissions();

      setCallType(type);
      callTypeRef.current = type;
      // Go straight to 'connected' — the call is already in progress, so the user
      // should land directly in the grid rather than seeing a "calling" screen.
      setCallStatus('connected');
      callStatusRef.current = 'connected';
      setIsCallActive(true);
      isCallActiveRef.current = true;
      isInitiatorRef.current = false;
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      callStartTimeRef.current = Date.now();

      setOngoingCallsByChatId((prev) => {
        const next = new Map(prev);
        next.delete(chatId);
        return next;
      });

      let stream: any;
      if (type === 'video') {
        try {
          stream = await mediaDevices.getUserMedia({
            audio: true,
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          });
        } catch {
          stream = await mediaDevices.getUserMedia({ audio: true, video: false });
        }
      } else {
        stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoEnabled(type === 'video');
      setIsMuted(false);
      setIsSpeaker(false);
      startInCallAudio(type);

      socketManager.emit(SOCKET_EVENTS.CALL_JOIN, { chatId });
    } catch (err) {
      console.error('[Call] Failed to join ongoing call:', err);
      cleanupCall();
    }
  };

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
        activeSpeakers,
        isMuted,
        isVideoEnabled,
        isSpeaker,
        activeChatId,
        ongoingCallsByChatId,
        isScreenSharing,
        screenStream,
        sharingUserId,
        startCall,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleSpeaker,
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

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useCall = (): CallContextType => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within a CallProvider');
  return ctx;
};
