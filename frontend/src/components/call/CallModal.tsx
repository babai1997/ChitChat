import { useEffect, useRef } from 'react';
import { useCall } from '../../contexts/CallContext';
import { Phone, Video, Mic, MicOff, VideoOff, PhoneOff } from 'lucide-react';

export const CallModal = () => {
  const { 
    isCallActive, 
    callStatus, 
    callType, 
    incomingCall, 
    localStream, 
    remoteStream, 
    answerCall, 
    rejectCall, 
    endCall,
    toggleMute,
    toggleVideo,
    isMuted,
    isVideoEnabled
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Handle local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Handle remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Handle ringtone
  useEffect(() => {
      if (callStatus === 'incoming') {
          // Ideally use a real audio file
          // ringtoneRef.current = new Audio('/sounds/ringtone.mp3');
          // ringtoneRef.current.loop = true;
          // ringtoneRef.current.play().catch(e => console.log('Autoplay blocked', e));
      } else {
          // if (ringtoneRef.current) {
          //     ringtoneRef.current.pause();
          //     ringtoneRef.current = null;
          // }
      }
      return () => {
          // if (ringtoneRef.current) {
          //     ringtoneRef.current.pause();
          //     ringtoneRef.current = null;
          // }
      };
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
                 <img src={incomingCall.callerAvatar} alt="Caller" style={{width: '100%', height: '100%'}} />
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

  // --- Active Call UI ---
  const isVideo = callType === 'video';

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
      {/* Video/Audio Area */}
      <div style={{flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden'}}>
        
        {/* Remote Video */}
        {remoteStream && isVideo ? (
           <video 
             ref={remoteVideoRef} 
             autoPlay 
             playsInline 
             style={{width: '100%', height: '100%', objectFit: 'contain'}} 
           />
        ) : (
            // Placeholder for audio call or no video
           <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px'}}>
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
                {callStatus === 'connected' ? '👤' : '...'}
              </div>
              <p style={{color: '#e9edef', fontSize: '20px'}}>
                 {callStatus === 'calling' ? 'Calling...' : 'Connected'}
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
                backgroundColor: '#202c33'
            }}>
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  style={{width: '100%', height: '100%', objectFit: 'cover'}} 
                />
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
