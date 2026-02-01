import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { Instance } from 'simple-peer';
import SimplePeer from 'simple-peer';
import { useSocket } from '../hooks';

import toast from 'react-hot-toast';



interface CallContextType {
  isCallActive: boolean;
  callStatus: 'idle' | 'calling' | 'incoming' | 'connected';
  callType: 'audio' | 'video';
  incomingCall: IncomingCallData | null;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  startCall: (chatId: string, type: 'audio' | 'video') => void;
  answerCall: () => void;
  rejectCall: () => void;
  toggleMinimize: () => void;
  isMinimized: boolean;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  isMuted: boolean;
  isVideoEnabled: boolean;
}

interface IncomingCallData {
  chatId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  offer?: any;
  type: 'audio' | 'video';
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  
  const [isMinimized, setIsMinimized] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  // Replaced single remoteStream with Map of streams
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  // Replaced single peerRef with Map of peers
  const peersRef = useRef<Map<string, Instance>>(new Map());
  const activeChatIdRef = useRef<string | null>(null);

  const cleanupCall = useCallback(() => {
    console.log('Cleaning up call...');
    // Destroy all peers
    peersRef.current.forEach(peer => peer.destroy());
    peersRef.current.clear();

    if (localStreamRef.current) {
        console.log('Stopping local tracks:', localStreamRef.current.id);
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStreams(new Map());
    setIncomingCall(null);
    setCallStatus('idle');
    setIsCallActive(false);
    setIsMinimized(false);
    activeChatIdRef.current = null;
  }, []);

  const createPeer = (targetUserId: string, initiator: boolean, stream: MediaStream) => {
    console.log(`Creating peer for ${targetUserId} (initiator: ${initiator})`);
    const peer = new SimplePeer({
      initiator,
      trickle: false,
      stream,
    });

    peer.on('signal', (signal) => {
      // type is generic 'signal' here effectively, but we can infer role
      socket?.emit('call:signal', {
        targetUserId,
        type: initiator ? 'offer' : 'answer', // Hint for clarity
        signal,
        chatId: activeChatIdRef.current
      });
    });

    peer.on('stream', (stream) => {
      console.log(`Received stream from ${targetUserId}`);
      setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(targetUserId, stream);
          return newMap;
      });
    });

    peer.on('close', () => {
        console.log(`Peer connection closed: ${targetUserId}`);
        peersRef.current.delete(targetUserId);
        setRemoteStreams(prev => {
            const newMap = new Map(prev);
            newMap.delete(targetUserId);
            return newMap;
        });
    });

    peer.on('error', (err) => {
        console.error(`Peer error with ${targetUserId}:`, err);
        // Potentially cleanup specific peer?
    });

    peersRef.current.set(targetUserId, peer);
    return peer;
  };

  // --- Socket Event Listeners ---
  useEffect(() => {
    if (!socket) return;

    socket.on('call:incoming', (data: IncomingCallData) => {
      console.log('Incoming call:', data);
      if (callStatus !== 'idle') {
        // Busy
        socket.emit('call:reject', { chatId: data.chatId, callerId: data.callerId });
        return;
      }
      setIncomingCall(data);
      setCallStatus('incoming');
      setCallType(data.type);
    });

    // Handle new user joining the call (Mesh: initiate connection)
    socket.on('call:user-joined', (data: { userId: string, chatId: string }) => {
        console.log('User joined call:', data.userId);
        if (isCallActive && localStreamRef.current && data.userId !== socket.id) { // Should check vs self? userId is usually DB id, assume socket.user.id
            // Initiate connection to the new joiner
            // Note: we need to ensure we don't connect to self if broadcast includes self.
            // But we don't have our own userId easily accessible here unless we store it.
            // Assuming backend doesn't send to self or we handle duplicate safely.
            
            if (!peersRef.current.has(data.userId)) {
                createPeer(data.userId, true, localStreamRef.current);
            }
        }
    });

    // Handle signals (Offer, Answer, Candidate)
    socket.on('call:signal', (data: { senderId: string, type: string, signal: any }) => {
        console.log(`Received signal from ${data.senderId} (${data.type})`);
        const { senderId, signal } = data;
        
        let peer = peersRef.current.get(senderId);

        if (!peer) {
            // If we receive an offer and don't have a peer, we are the receiver (non-initiator)
            if (isCallActive && localStreamRef.current) {
                 peer = createPeer(senderId, false, localStreamRef.current);
            } else {
                console.warn('Received signal but call not active or no stream');
                return;
            }
        }

        peer.signal(signal);
    });

    // Legacy/Global end
    socket.on('call:ended', (data: { enderId: string }) => {
      // Logic change: in usage, if someone ends, they leave.
      // If we want "End for everyone", that's different.
      // For now, if "enderId" is the one we are talking to, we might close that peer.
      // But 'call:ended' event currently is broadcast to close the whole call or just notify?
      // Code says "Notify everyone... call ended".
      // Mesh: usually one person leaving doesn't end call for others.
      // We'll treat this as "Someone left", verify if it was the last one?
      // For simplicity/requirement "Group Call", we just remove that peer.
      
      console.log(`User left call: ${data.enderId}`);
      const peer = peersRef.current.get(data.enderId);
      if (peer) {
          peer.destroy();
          peersRef.current.delete(data.enderId);
          setRemoteStreams(prev => {
              const newMap = new Map(prev);
              newMap.delete(data.enderId);
              return newMap;
          });
      }
      
      // If everyone left?
      if (peersRef.current.size === 0 && callStatus === 'connected') {
          // toast('All participants left');
          // cleanupCall(); // Optional: auto-end?
      }
    });

    // Rejections
    socket.on('call:rejected', (_: { rejectorId: string }) => {
      console.log('[Call] Call rejected by recipient');
      toast.error('Call was declined');
      cleanupCall(); // End the call on caller's side
    });

    return () => {
      socket.off('call:incoming');
      socket.off('call:user-joined');
      socket.off('call:signal');
      socket.off('call:ended');
      socket.off('call:rejected');
    };
  }, [socket, callStatus, isCallActive]); // Deps need careful management

  const toggleMinimize = () => setIsMinimized(prev => !prev);

  const startCall = async (chatId: string, type: 'audio' | 'video') => {
    try {
      activeChatIdRef.current = chatId;
      setCallType(type);
      setCallStatus('calling');
      setIsCallActive(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === 'video',
        audio: true
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsVideoEnabled(type === 'video');
      setIsMuted(false);

      // Emit start (Advertises presence/invitation). No offer sent here.
      socket!.emit('call:start', {
        chatId,
        offer: null, // No initial offer in Mesh
        type
      });
      
      // Now we wait for 'call:user-joined' (when they accept)

    } catch (err: any) {
      console.error('Failed to start call:', err);
      
      // More specific error messages
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Camera/microphone permission denied. Please allow access in browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error('No camera or microphone found. Please connect a device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        toast.error('Camera/microphone is already in use by another application.');
      } else if (err.name === 'OverconstrainedError') {
        toast.error('Camera/microphone settings are not supported.');
      } else if (err.name === 'TypeError') {
        toast.error('Invalid media constraints.');
      } else {
        toast.error(`Could not access camera/microphone: ${err.message || err.name}`);
      }
      
      cleanupCall();
    }
  };

  const answerCall = async () => {
    if (!incomingCall) return;

    try {
      setCallStatus('connected'); // Immediately show connected UI
      setIsCallActive(true);
      activeChatIdRef.current = incomingCall.chatId;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: incomingCall.type === 'video',
        audio: true
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsVideoEnabled(incomingCall.type === 'video');
      setIsMuted(false);

      // Announce join to the room.
      // Existing participants (including caller) will receive this and initiate connection.
      socket!.emit('call:join', {
          chatId: incomingCall.chatId
      });

      setIncomingCall(null);

    } catch (err: any) {
      console.error('Failed to answer call:', err);
      
      // More specific error messages
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Camera/microphone permission denied. Please allow access in browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        toast.error('No camera or microphone found. Please connect a device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        toast.error('Camera/microphone is already in use by another application.');
      } else if (err.name === 'OverconstrainedError') {
        toast.error('Camera/microphone settings are not supported.');
      } else if (err.name === 'TypeError') {
        toast.error('Invalid media constraints.');
      } else {
        toast.error(`Could not access camera/microphone: ${err.message || err.name}`);
      }
      
      cleanupCall();
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      socket!.emit('call:reject', { 
        chatId: incomingCall.chatId, 
        callerId: incomingCall.callerId 
      });
    }
    cleanupCall();
  };

  const endCall = () => {
    if (activeChatIdRef.current) {
        // We just emit 'call:end' to notify we are leaving?
        // Or generic "I left". backend `handleCallEnd` notifies others.
        socket!.emit('call:end', { chatId: activeChatIdRef.current });
    }
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setIsMuted(prev => !prev);
    }
  };

  const toggleVideo = () => {
      if (localStream && callType === 'video') {
          localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
          setIsVideoEnabled(prev => !prev);
      }
  }

  return (
    <CallContext.Provider
      value={{
        isCallActive,
        callStatus,
        callType,
        incomingCall,
        localStream,
        remoteStreams, // Map
        startCall,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        isMuted,
        isVideoEnabled,
        toggleMinimize,
        isMinimized
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
