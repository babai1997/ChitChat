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
  remoteStream: MediaStream | null;
  startCall: (chatId: string, type: 'audio' | 'video') => void;
  answerCall: () => void;
  rejectCall: () => void;
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
  offer: any;
  type: 'audio' | 'video';
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket(); // Need direct socket access
  
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [callType, setCallType] = useState<'audio' | 'video'>('audio');
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  const peerRef = useRef<Instance | null>(null);
  const activeChatIdRef = useRef<string | null>(null);

  // --- Socket Event Listeners ---
  useEffect(() => {
    if (!socket) return;

    socket.on('call:incoming', (data: IncomingCallData) => {
      console.log('Incoming call:', data);
      if (callStatus !== 'idle') {
        // Busy - auto reject or show busy?
        socket.emit('call:reject', { chatId: data.chatId, callerId: data.callerId });
        return;
      }
      setIncomingCall(data);
      setCallStatus('incoming');
      setCallType(data.type);
    });

    socket.on('call:accepted', (data: { answer: any; responderId: string }) => {
      console.log('Call accepted by:', data.responderId);
      if (callStatus === 'calling' && peerRef.current) {
        setCallStatus('connected');
        peerRef.current.signal(data.answer);
      }
    });

    socket.on('call:rejected', () => {
      toast.error('Call rejected');
      cleanupCall();
    });

    socket.on('call:ended', () => {
      toast('Call ended');
      cleanupCall();
    });

    socket.on('call:ice-candidate', (data: { candidate: any }) => {
      if (peerRef.current) {
        peerRef.current.signal(data.candidate);
      }
    });

    return () => {
      socket.off('call:incoming');
      socket.off('call:accepted');
      socket.off('call:rejected');
      socket.off('call:ended');
      socket.off('call:ice-candidate');
    };
  }, [socket, callStatus]);

  const cleanupCall = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
    }
    setRemoteStream(null);
    setIncomingCall(null);
    setCallStatus('idle');
    setIsCallActive(false);
    activeChatIdRef.current = null;
  }, [localStream]);

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
      setIsVideoEnabled(type === 'video');
      setIsMuted(false);

      const peer = new SimplePeer({
        initiator: true,
        trickle: false,
        stream: stream,
      });

      peer.on('signal', (data) => {
        socket!.emit('call:start', {
          chatId,
          offer: data,
          type
        });
      });

      peer.on('stream', (currentRemoteStream) => {
        setRemoteStream(currentRemoteStream);
      });
      
      peer.on('close', () => {
          cleanupCall();
      });

      peer.on('error', (err) => {
          console.error('Peer error:', err);
          cleanupCall();
      });

      peerRef.current = peer;

    } catch (err: any) {
      console.error('Failed to start call:', err);
      let errorMessage = 'Could not access camera/microphone';
      if (err.name === 'NotAllowedError') errorMessage = 'Permission denied. Please allow access.';
      if (err.name === 'NotFoundError') errorMessage = 'No camera or microphone found.';
      if (err.name === 'NotReadableError') errorMessage = 'Camera/Microphone is already in use.';
      
      toast.error(`${errorMessage} (${err.name})`);
      cleanupCall();
    }
  };

  const answerCall = async () => {
    if (!incomingCall) return;

    try {
      setCallStatus('connected');
      setIsCallActive(true);
      activeChatIdRef.current = incomingCall.chatId;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: incomingCall.type === 'video',
        audio: true
      });
      
      setLocalStream(stream);
      setIsVideoEnabled(incomingCall.type === 'video');
      setIsMuted(false);

      const peer = new SimplePeer({
        initiator: false,
        trickle: false,
        stream: stream,
      });

      peer.on('signal', (data) => {
        socket!.emit('call:answer', {
          chatId: incomingCall.chatId,
          callerId: incomingCall.callerId,
          answer: data
        });
      });

      peer.on('stream', (currentRemoteStream) => {
        setRemoteStream(currentRemoteStream);
      });
      
      peer.on('close', () => {
          cleanupCall();
      });

      peer.on('error', (err) => {
          console.error('Peer error:', err);
          cleanupCall();
      });

      peer.signal(incomingCall.offer);
      peerRef.current = peer;
      setIncomingCall(null);

    } catch (err: any) {
      console.error('Failed to answer call:', err);
      let errorMessage = 'Could not access camera/microphone';
      if (err.name === 'NotAllowedError') errorMessage = 'Permission denied. Please allow access.';
      if (err.name === 'NotFoundError') errorMessage = 'No camera or microphone found.';
      if (err.name === 'NotReadableError') errorMessage = 'Camera/Microphone is already in use.';

      toast.error(`${errorMessage} (${err.name})`);
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
        remoteStream,
        startCall,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        isMuted,
        isVideoEnabled
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
