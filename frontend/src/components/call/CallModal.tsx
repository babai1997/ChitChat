import { useEffect, useRef, useState, useCallback } from 'react';
import { useCall } from '../../contexts/CallContext';
import { useChatStore } from '../../stores/chatStore';
import {
  Phone, Video, Mic, MicOff, VideoOff, PhoneOff,
  Minimize2, Maximize2, GripHorizontal, Volume2, VolumeX,
} from 'lucide-react';

// ── Speaking detection via Web Audio API ──────────────────────────────────────

function useIsSpeaking(stream: MediaStream | undefined): boolean {
  const [speaking, setSpeaking] = useState(false);
  const rafRef = useRef<number>(0);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeaking(avg > 10);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* browser may block AudioContext until user gesture */ }

    return () => {
      cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [stream]);

  return speaking;
}

// ── Participant tile ──────────────────────────────────────────────────────────

interface ParticipantTileProps {
  stream: MediaStream;
  isVideo: boolean;
  memberName: string;
  memberAvatar: string | null;
  isSpeakerOn: boolean;
}

const ParticipantTile = ({ stream, isVideo, memberName, memberAvatar, isSpeakerOn }: ParticipantTileProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isSpeaking = useIsSpeaking(stream);

  useEffect(() => {
    const attach = async (el: HTMLMediaElement) => {
      try {
        el.srcObject = stream;
        el.volume = 1;
        await el.play();
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') console.error('Media play error:', e);
      }
    };
    if (isVideo && videoRef.current) attach(videoRef.current);
    if (audioRef.current) attach(audioRef.current);
  }, [stream, isVideo]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isSpeakerOn ? 1 : 0;
    if (videoRef.current) videoRef.current.volume = isSpeakerOn ? 1 : 0;
  }, [isSpeakerOn]);

  const initial = memberName.charAt(0).toUpperCase();

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#111b21',
      borderRadius: '8px',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      outline: isSpeaking ? '2.5px solid #00a884' : '2.5px solid transparent',
      transition: 'outline 0.15s ease',
    }}>
      {isVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          {memberAvatar ? (
            <img
              src={memberAvatar}
              referrerPolicy="no-referrer"
              alt={memberName}
              style={{
                width: '88px', height: '88px', borderRadius: '50%', objectFit: 'cover',
                border: isSpeaking ? '3px solid #00a884' : '3px solid transparent',
                transition: 'border 0.15s ease',
              }}
            />
          ) : (
            <div style={{
              width: '88px', height: '88px', borderRadius: '50%',
              backgroundColor: '#2a3942',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '36px', fontWeight: 700, color: '#e9edef',
              border: isSpeaking ? '3px solid #00a884' : '3px solid transparent',
              transition: 'border 0.15s ease',
            }}>
              {initial}
            </div>
          )}
        </div>
      )}

      {/* Hidden audio element — always present to output remote audio */}
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Name label with speaking dot */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
        padding: '20px 10px 8px',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        {isSpeaking && (
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: '#00a884', flexShrink: 0,
          }} />
        )}
        <span style={{
          color: '#fff', fontSize: '13px', fontWeight: 600,
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {memberName}
        </span>
      </div>
    </div>
  );
};

// ── Local video PiP (defined outside to keep ref stable) ─────────────────────

const LocalVideo = ({ stream }: { stream: MediaStream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);
  return <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
};

// ── Main component ─────────────────────────────────────────────────────────────

export const CallModal = () => {
  const {
    isCallActive,
    callStatus,
    callType,
    incomingCall,
    localStream,
    remoteStreams,
    activeChatId,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleMinimize,
    isMuted,
    isVideoEnabled,
    isMinimized,
  } = useCall();

  // Speaker — controls remote audio volume on web
  const [isSpeaker, setIsSpeaker] = useState(true);
  const toggleSpeaker = () => setIsSpeaker((p) => !p);

  // Member info lookup
  const chats = useChatStore((s) => s.chats);
  const chat = chats.find((c) => c.id === activeChatId) ?? null;
  const getMemberInfo = (userId: string) => {
    const member = chat?.members?.find((m) => m.userId === userId);
    return {
      name: member?.user?.profile?.displayName || 'User',
      avatar: member?.user?.profile?.avatarUrl || null,
    };
  };

  // PiP drag — minimized remote tile
  const [pipPosition, setPipPosition] = useState({ x: window.innerWidth - 200, y: window.innerHeight - 280 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const pipRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragOffset({ x: clientX - pipPosition.x, y: clientY - pipPosition.y });
  }, [pipPosition]);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setPipPosition({
        x: Math.max(0, Math.min(window.innerWidth - 180, cx - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 240, cy - dragOffset.y)),
      });
    };
    const end = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
  }, [isDragging, dragOffset]);

  // Local PiP drag
  const [localPipPosition, setLocalPipPosition] = useState({ x: window.innerWidth - 140, y: window.innerHeight - 260 });
  const [isLocalDragging, setIsLocalDragging] = useState(false);
  const [localDragOffset, setLocalDragOffset] = useState({ x: 0, y: 0 });
  const localPipRef = useRef<HTMLDivElement>(null);

  const handleLocalDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsLocalDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setLocalDragOffset({ x: clientX - localPipPosition.x, y: clientY - localPipPosition.y });
  }, [localPipPosition]);

  useEffect(() => {
    if (!isLocalDragging) return;
    const move = (e: MouseEvent | TouchEvent) => {
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setLocalPipPosition({
        x: Math.max(0, Math.min(window.innerWidth - 120, cx - localDragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 160, cy - localDragOffset.y)),
      });
    };
    const end = () => setIsLocalDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
  }, [isLocalDragging, localDragOffset]);

  const isVideo = callType === 'video';
  const remoteEntries = Array.from(remoteStreams.entries());

  if (!isCallActive && callStatus === 'idle') return null;

  // ── Incoming call ──────────────────────────────────────────────────────────
  if (callStatus === 'incoming' && incomingCall) {
    return (
      <div style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          backgroundColor: '#202c33', padding: '32px', borderRadius: '16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '24px', minWidth: '300px',
        }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden',
            backgroundColor: '#2a3942', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {incomingCall.callerAvatar ? (
              <img src={incomingCall.callerAvatar} alt="Caller" referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%' }} />
            ) : (
              <span style={{ fontSize: '32px', color: '#8696a0' }}>
                {incomingCall.callerName.charAt(0)}
              </span>
            )}
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#e9edef', margin: 0 }}>{incomingCall.callerName}</h2>
            <p style={{ color: '#8696a0', margin: '8px 0' }}>Incoming {incomingCall.type} call...</p>
          </div>
          <div style={{ display: 'flex', gap: '32px' }}>
            <button onClick={rejectCall} style={circleBtn('#ea4335')}><PhoneOff size={24} /></button>
            <button onClick={answerCall} style={{ ...circleBtn('#34a853'), animation: 'pulse 1.5s infinite' }}>
              {incomingCall.type === 'video' ? <Video size={24} /> : <Phone size={24} />}
            </button>
          </div>
        </div>
        <style>{`@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(52,168,83,.7)}70%{box-shadow:0 0 0 10px rgba(52,168,83,0)}100%{box-shadow:0 0 0 0 rgba(52,168,83,0)}}`}</style>
      </div>
    );
  }

  // ── Minimized PiP ──────────────────────────────────────────────────────────
  if (isMinimized) {
    const firstEntry = remoteEntries[0];
    return (
      <div ref={pipRef} style={{
        position: 'fixed', left: `${pipPosition.x}px`, top: `${pipPosition.y}px`,
        width: '180px', height: '240px', backgroundColor: '#202c33',
        borderRadius: '12px', overflow: 'hidden', zIndex: 9999,
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.7)' : '0 4px 12px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        cursor: isDragging ? 'grabbing' : 'default',
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
      }}>
        <div onMouseDown={handleDragStart} onTouchStart={handleDragStart} style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '32px',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'grab', zIndex: 10,
        }}>
          <GripHorizontal size={16} color="#8696a0" />
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', marginTop: '32px' }}>
          {firstEntry ? (
            <ParticipantTile
              stream={firstEntry[1]}
              isVideo={isVideo}
              memberName={getMemberInfo(firstEntry[0]).name}
              memberAvatar={getMemberInfo(firstEntry[0]).avatar}
              isSpeakerOn={isSpeaker}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a3942',
              fontSize: '48px', color: '#8696a0',
            }}>···</div>
          )}
        </div>
        <div style={{
          padding: '8px', display: 'flex', justifyContent: 'space-around',
          backgroundColor: 'rgba(0,0,0,0.6)',
          position: 'absolute', bottom: 0, left: 0, right: 0,
        }}>
          <button onClick={toggleMinimize} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
            <Maximize2 size={20} />
          </button>
          <button onClick={endCall} style={{ background: 'none', border: 'none', color: '#ea4335', cursor: 'pointer' }}>
            <PhoneOff size={20} />
          </button>
        </div>
      </div>
    );
  }

  // ── Grid layout ────────────────────────────────────────────────────────────
  const getGridStyle = (count: number): React.CSSProperties => {
    if (count <= 1) return { display: 'flex', width: '100%', height: '100%' };
    if (count === 2) return { display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', height: '100%' };
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gridTemplateRows: 'repeat(auto-fit, minmax(200px, 1fr))',
      width: '100%', height: '100%',
    };
  };

  // ── Full screen active call ────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: '#0b141a',
      zIndex: 9999, display: 'flex', flexDirection: 'column',
    }}>
      {/* Minimize button */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
        <button onClick={toggleMinimize} style={iconBtn}>
          <Minimize2 size={24} />
        </button>
      </div>

      {/* Participant grid */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '10px' }}>
        {remoteEntries.length > 0 ? (
          <div style={getGridStyle(remoteEntries.length)}>
            {remoteEntries.map(([userId, stream]) => {
              const { name, avatar } = getMemberInfo(userId);
              return (
                <div key={userId} style={{ position: 'relative', width: '100%', height: '100%', padding: '5px' }}>
                  <ParticipantTile
                    stream={stream}
                    isVideo={isVideo}
                    memberName={name}
                    memberAvatar={avatar}
                    isSpeakerOn={isSpeaker}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '20px',
          }}>
            <div style={{
              width: '120px', height: '120px', borderRadius: '50%',
              backgroundColor: '#2a3942',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '48px', color: '#8696a0',
            }}>···</div>
            <p style={{ color: '#e9edef', fontSize: '20px' }}>
              {callStatus === 'calling' ? 'Calling...' : 'Waiting for others...'}
            </p>
          </div>
        )}

        {/* Local video PiP */}
        {localStream && isVideo && (
          <div
            ref={localPipRef}
            onMouseDown={handleLocalDragStart}
            onTouchStart={handleLocalDragStart}
            style={{
              position: 'fixed', left: `${localPipPosition.x}px`, top: `${localPipPosition.y}px`,
              width: '120px', height: '160px', borderRadius: '8px', overflow: 'hidden',
              boxShadow: isLocalDragging ? '0 8px 16px rgba(0,0,0,0.5)' : '0 4px 6px rgba(0,0,0,0.3)',
              backgroundColor: '#202c33', zIndex: 20,
              cursor: isLocalDragging ? 'grabbing' : 'grab',
              transition: isLocalDragging ? 'none' : 'box-shadow 0.2s ease',
            }}
          >
            <LocalVideo stream={localStream} />
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
              padding: '14px 6px 4px', textAlign: 'center',
            }}>
              <span style={{ color: '#fff', fontSize: '11px', fontWeight: 600 }}>You</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div style={{
        height: '80px', backgroundColor: '#202c33',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
      }}>
        <button onClick={toggleMute} style={circleBtn(isMuted ? '#ea4335' : '#374045')}>
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        {isVideo && (
          <button onClick={toggleVideo} style={circleBtn(!isVideoEnabled ? '#ea4335' : '#374045')}>
            {!isVideoEnabled ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        )}

        <button
          onClick={toggleSpeaker}
          title={isSpeaker ? 'Turn off speaker' : 'Turn on speaker'}
          style={circleBtn(isSpeaker ? '#374045' : '#555')}
        >
          {isSpeaker ? <Volume2 size={22} /> : <VolumeX size={22} />}
        </button>

        <button onClick={endCall} style={circleBtn('#ea4335')}>
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );
};

// ── Style helpers ─────────────────────────────────────────────────────────────

const circleBtn = (bg: string): React.CSSProperties => ({
  padding: '12px',
  borderRadius: '50%',
  backgroundColor: bg,
  color: 'white',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const iconBtn: React.CSSProperties = {
  padding: '10px',
  borderRadius: '50%',
  backgroundColor: 'rgba(0,0,0,0.3)',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
