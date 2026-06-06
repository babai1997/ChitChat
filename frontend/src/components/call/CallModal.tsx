import { useEffect, useRef, useState, useCallback } from 'react';
import { useCall } from '../../contexts/CallContext';
import { Phone, Video, Mic, MicOff, VideoOff, PhoneOff, Minimize2, Maximize2, GripHorizontal } from 'lucide-react';

export const CallModal = () => {
  const { 
    isCallActive, 
    callStatus, 
    callType, 
    incomingCall, 
    localStream, 
    remoteStreams, 
    answerCall, 
    rejectCall, 
    endCall,
    toggleMute,
    toggleVideo,
    toggleMinimize,
    isMuted,
    isVideoEnabled,
    isMinimized
  } = useCall();

  // PiP drag state
  const [pipPosition, setPipPosition] = useState({ x: window.innerWidth - 200, y: window.innerHeight - 280 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const pipRef = useRef<HTMLDivElement>(null);

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragOffset({
      x: clientX - pipPosition.x,
      y: clientY - pipPosition.y
    });
  }, [pipPosition]);

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      // Keep within window bounds
      const newX = Math.max(0, Math.min(window.innerWidth - 180, clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 240, clientY - dragOffset.y));
      
      setPipPosition({ x: newX, y: newY });
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragOffset]);

  // --- Active Call UI ---
  const isVideo = callType === 'video';
  const remoteStreamsArray = Array.from(remoteStreams.values());

  // Handle ringtone
  useEffect(() => {
      if (callStatus === 'incoming') {
          // Ideally use a real audio file
      } 
      return () => {};
  }, [callStatus]);

  if (!isCallActive && callStatus === 'idle') return null;

  // --- Incoming Call UI ---
  if (callStatus === 'incoming' && incomingCall) {
     return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          backgroundColor: '#202c33',
          padding: '32px',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          minWidth: '300px'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: '#2a3942',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
             {incomingCall.callerAvatar ? (
                 <img src={incomingCall.callerAvatar} alt="Caller" referrerPolicy="no-referrer" style={{width: '100%', height: '100%'}} />
             ) : (
                 <span style={{fontSize: '32px', color: '#8696a0'}}>{incomingCall.callerName.charAt(0)}</span>
             )}
          </div>
          
          <div style={{textAlign: 'center'}}>
            <h2 style={{color: '#e9edef', margin: 0}}>{incomingCall.callerName}</h2>
            <p style={{color: '#8696a0', margin: '8px 0'}}>Incoming {incomingCall.type} call...</p>
          </div>

          <div style={{display: 'flex', gap: '32px'}}>
            <button 
                onClick={rejectCall}
                style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: '#ea4335',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'white'
                }}
            >
                <PhoneOff size={24} />
            </button>
            
            <button 
                onClick={answerCall}
                style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: '#34a853',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'white',
                    animation: 'pulse 1.5s infinite'
                }}
            >
                {incomingCall.type === 'video' ? <Video size={24} /> : <Phone size={24} />}
            </button>
          </div>
        </div>
        <style>{`
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(52, 168, 83, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(52, 168, 83, 0); }
                100% { box-shadow: 0 0 0 0 rgba(52, 168, 83, 0); }
            }
        `}</style>
      </div>
    );
  }

  // --- Active Call UI (Minimized) ---
  if (isMinimized) {
    // Show first remote stream or placeholder
    const firstRemoteStream = remoteStreamsArray[0];

    return (
      <div 
        ref={pipRef}
        style={{
          position: 'fixed',
          left: `${pipPosition.x}px`,
          top: `${pipPosition.y}px`,
          width: '180px',
          height: '240px',
          backgroundColor: '#202c33',
          borderRadius: '12px',
          overflow: 'hidden',
          zIndex: 9999,
          boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.7)' : '0 4px 12px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          cursor: isDragging ? 'grabbing' : 'default',
          transition: isDragging ? 'none' : 'box-shadow 0.2s ease'
        }}>
        {/* Drag Handle */}
        <div 
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '32px',
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            zIndex: 10
          }}
        >
          <GripHorizontal size={16} color="#8696a0" />
        </div>

        <div style={{flex: 1, position: 'relative', overflow: 'hidden', marginTop: '32px'}}>
          {firstRemoteStream && isVideo ? (
             <VideoTile stream={firstRemoteStream} isVideo={true} />
          ) : (
            <div style={{
              width: '100%', 
              height: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: '#2a3942'
            }}>
              <span style={{fontSize: '48px'}}>👤</span>
            </div>
          )}
        </div>

        <div style={{
          padding: '8px', 
          display: 'flex', 
          justifyContent: 'space-around', 
          backgroundColor: 'rgba(0,0,0,0.6)',
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0
        }}>
           <button onClick={toggleMinimize} style={{background: 'none', border: 'none', color: 'white', cursor: 'pointer'}}>
             <Maximize2 size={20} />
           </button>
           <button onClick={endCall} style={{background: 'none', border: 'none', color: '#ea4335', cursor: 'pointer'}}>
             <PhoneOff size={20} />
           </button>
        </div>
      </div>
    );
  }

  // --- Active Call UI (Full Screen Grid) ---
  
  const getGridStyle = (count: number) => {
      if (count <= 1) return { display: 'flex', width: '100%', height: '100%' };
      if (count === 2) return { display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', height: '100%' };
      return { 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
          gridTemplateRows: 'repeat(auto-fit, minmax(200px, 1fr))',
          width: '100%', 
          height: '100%' 
      };
  };

  const gridStyle = getGridStyle(remoteStreamsArray.length);

  // Local video ref
  const LocalVideo = () => {
      const videoRef = useRef<HTMLVideoElement>(null);
      useEffect(() => {
          if (videoRef.current && localStream) {
              videoRef.current.srcObject = localStream;
          }
      }, [localStream]);

      if (!localStream) return null;

      return (
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            style={{width: '100%', height: '100%', objectFit: 'cover'}} 
        />
      );
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#0b141a',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Bar for Minimize */}
      <div style={{
        position: 'absolute', 
        top: '20px', 
        left: '20px', 
        zIndex: 10
      }}>
        <button 
           onClick={toggleMinimize}
           style={{
               padding: '10px',
               borderRadius: '50%',
               backgroundColor: 'rgba(0,0,0,0.3)',
               color: 'white',
               border: 'none',
               cursor: 'pointer'
           }}
        >
          <Minimize2 size={24} />
        </button>
      </div>

      {/* Video Grid Area */}
      <div style={{flex: 1, position: 'relative', overflow: 'hidden', padding: '10px'}}>
        
        {remoteStreamsArray.length > 0 ? (
            <div style={gridStyle}>
                {remoteStreamsArray.map((stream, i) => (
                    <div key={stream.id || i} style={{ position: 'relative', width: '100%', height: '100%', padding: '5px' }}>
                         <VideoTile stream={stream} isVideo={isVideo} />
                    </div>
                ))}
            </div>
        ) : (
            // Placeholder for Waiting
            <div style={{
                  width: '100%', 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '20px'
            }}>
               <div style={{
                  width: '120px',
                  height: '120px', 
                  borderRadius: '50%', 
                  backgroundColor: '#2a3942',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '48px',
                  color: '#8696a0'
               }}>
                 ...
               </div>
               <p style={{color: '#e9edef', fontSize: '20px'}}>
                  {callStatus === 'calling' ? 'Calling...' : 'Waiting for others...'}
               </p>
            </div>
        )}

        {/* Local Video (PiP) */}
        {localStream && isVideo && (
            <div style={{
                position: 'absolute',
                bottom: '100px',
                right: '20px',
                width: '120px',
                height: '160px',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                backgroundColor: '#202c33',
                zIndex: 20
            }}>
                <LocalVideo />
            </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
          height: '80px',
          backgroundColor: '#202c33',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px'
      }}>
          <button 
             onClick={toggleMute}
             style={{
                 padding: '12px',
                 borderRadius: '50%',
                 backgroundColor: isMuted ? '#ea4335' : '#374045',
                 color: 'white',
                 border: 'none',
                 cursor: 'pointer'
             }}
          >
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          
          {isVideo && (
             <button 
                onClick={toggleVideo}
                style={{
                    padding: '12px',
                    borderRadius: '50%',
                    backgroundColor: !isVideoEnabled ? '#ea4335' : '#374045',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer'
                }}
             >
                 {!isVideoEnabled ? <VideoOff size={24} /> : <Video size={24} />}
             </button>
          )}

          <button 
             onClick={endCall}
             style={{
                 padding: '12px',
                 borderRadius: '50%',
                 backgroundColor: '#ea4335',
                 color: 'white',
                 border: 'none',
                 cursor: 'pointer'
             }}
          >
              <PhoneOff size={24} />
          </button>
      </div>
    </div>
  );
};

// --- Helper Component ---

const VideoTile = ({ stream, isVideo }: { stream: MediaStream, isVideo: boolean }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const handlePlay = async (element: HTMLMediaElement) => {
            try {
                element.srcObject = stream;
                await element.play();
            } catch (e: any) {
                // Ignore AbortError as it happens when play is interrupted by new load
                if (e.name !== 'AbortError') {
                    console.error('Error playing media:', e);
                }
            }
        };

        if (isVideo && videoRef.current) {
            handlePlay(videoRef.current);
        } else if (!isVideo && audioRef.current) {
            handlePlay(audioRef.current);
        }
    }, [stream, isVideo]);

    return (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isVideo ? (
                <video 
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
            ) : (
                <div style={{ fontSize: '48px' }}>👤</div>
            )}
            <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
        </div>
    );
};
