import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Mic, MicOff, Video, VideoOff, User } from 'lucide-react';
import { meetingsApi, type MeetingSummary } from '../api';
import { useCall, type PreAcquiredMedia } from '../contexts/CallContext';
import { useAuthStore } from '../stores';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Landing page for a shared meeting link (`/meet/:slug`) — a Google-Meet
 * style lobby: shows who/what you're joining, previews your camera/mic
 * with on/off toggles, and only actually joins once you hit "Join now".
 * Joining grants ChatMember membership via a self-service slug lookup
 * (see MeetingsService.join on the backend) rather than an admin invite —
 * everything after that point (call signaling, TURN credentials, E2EE)
 * reuses the exact same CallContext/CallModal any other chat's call uses.
 * The preview stream acquired here is handed straight into startCall/
 * joinOngoingCall (see PreAcquiredMedia) so there's no second permission
 * prompt or getUserMedia call at the moment of actually joining.
 *
 * Unauthenticated visitors never reach this page directly — ProtectedRoute
 * (see App.tsx) redirects them to /login with `state.from` set to this URL,
 * and login/register already resume back here afterward.
 */
export const MeetingJoinPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { ongoingCallsByChatId, startCall, joinOngoingCall } = useCall();
  const localUserAvatar = useAuthStore((s) => s.user?.profile?.avatarUrl ?? null);
  const localUserName = useAuthStore((s) => s.user?.profile?.displayName ?? 'You');

  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [meetingInfo, setMeetingInfo] = useState<MeetingSummary | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [gotVideo, setGotVideo] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isJoining, setIsJoining] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Set right before navigating away with the call started — tells the
  // unmount cleanup below NOT to stop the tracks it just handed off.
  const handedOffRef = useRef(false);

  const acquirePreview = async () => {
    setState('loading');
    setErrorMessage(null);
    try {
      let stream: MediaStream;
      let video = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        video = true;
      } catch (camErr) {
        console.warn('[MeetingLobby] Camera unavailable, previewing audio-only:', camErr);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      streamRef.current = stream;
      setPreviewStream(stream);
      setGotVideo(video);
      setIsCameraOn(video);
      setState('ready');
    } catch (err) {
      console.error('[MeetingLobby] Failed to acquire microphone:', err);
      setErrorMessage(
        'ChitChat needs microphone access to join this meeting. Please allow it in your browser and try again.',
      );
      setState('error');
    }
  };

  // Fetch meeting info (name/host, no membership required) + acquire the preview stream.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      try {
        const info = await meetingsApi.getBySlug(slug);
        if (!cancelled) setMeetingInfo(info);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Failed to load meeting:', err);
        setErrorMessage(
          err?.response?.status === 404
            ? 'This meeting link is no longer valid.'
            : 'Failed to load this meeting. Please try again.',
        );
        setState('error');
        return;
      }
      if (!cancelled) await acquirePreview();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Release the preview camera/mic if the user navigates away without joining.
  useEffect(() => {
    return () => {
      if (!handedOffRef.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  const toggleCamera = () => {
    if (!gotVideo || !previewStream) return;
    const next = !isCameraOn;
    previewStream.getVideoTracks().forEach((t) => { t.enabled = next; });
    setIsCameraOn(next);
  };

  const toggleMic = () => {
    if (!previewStream) return;
    const next = !isMicOn;
    previewStream.getAudioTracks().forEach((t) => { t.enabled = next; });
    setIsMicOn(next);
  };

  const handleJoin = async () => {
    if (!slug || !previewStream || isJoining) return;
    setIsJoining(true);
    try {
      const { chatId } = await meetingsApi.join(slug);
      const ongoing = ongoingCallsByChatId.get(chatId);

      handedOffRef.current = true;
      const preAcquired: PreAcquiredMedia = {
        stream: previewStream,
        gotVideo,
        videoEnabled: gotVideo && isCameraOn,
        startMuted: !isMicOn,
      };

      if (ongoing) {
        await joinOngoingCall(chatId, ongoing.type, preAcquired);
      } else {
        startCall(chatId, gotVideo && isCameraOn ? 'video' : 'audio', preAcquired);
      }
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Failed to join meeting:', err);
      handedOffRef.current = false;
      setIsJoining(false);
      setErrorMessage('Failed to join this meeting. Please try again.');
    }
  };

  if (state === 'error') {
    return (
      <div style={pageStyle}>
        <Video size={40} color="var(--color-text-secondary)" />
        <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', maxWidth: '320px' }}>{errorMessage}</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => navigate('/', { replace: true })} style={secondaryButtonStyle}>
            Go to ChitChat
          </button>
          <button onClick={() => void acquirePreview()} style={primaryButtonStyle}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div style={pageStyle}>
        <Loader2 size={40} color="var(--color-accent)" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)' }}>Getting ready…</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {meetingInfo?.name || 'Meeting'}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
          Hosted by {meetingInfo?.hostName ?? 'Unknown'}
        </div>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          aspectRatio: '4 / 3',
          borderRadius: '16px',
          backgroundColor: 'var(--color-surface)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isCameraOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            {localUserAvatar ? (
              <img
                src={localUserAvatar}
                alt=""
                style={{ width: '88px', height: '88px', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '88px', height: '88px', borderRadius: '50%', backgroundColor: 'var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <User size={40} color="var(--color-text-secondary)" />
              </div>
            )}
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>{localUserName}</span>
          </div>
        )}

        <div style={{ position: 'absolute', bottom: '16px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '14px' }}>
          <button
            onClick={toggleMic}
            title={isMicOn ? 'Turn off microphone' : 'Turn on microphone'}
            style={{ ...circleButtonStyle, backgroundColor: isMicOn ? 'rgba(255,255,255,0.15)' : 'var(--color-danger)' }}
          >
            {isMicOn ? <Mic size={20} color="var(--color-white)" /> : <MicOff size={20} color="var(--color-white)" />}
          </button>
          <button
            onClick={toggleCamera}
            disabled={!gotVideo}
            title={!gotVideo ? 'No camera available' : isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            style={{
              ...circleButtonStyle,
              backgroundColor: isCameraOn ? 'rgba(255,255,255,0.15)' : 'var(--color-danger)',
              opacity: gotVideo ? 1 : 0.5,
              cursor: gotVideo ? 'pointer' : 'default',
            }}
          >
            {isCameraOn ? <Video size={20} color="var(--color-white)" /> : <VideoOff size={20} color="var(--color-white)" />}
          </button>
        </div>
      </div>

      <button onClick={() => void handleJoin()} disabled={isJoining} style={{ ...primaryButtonStyle, minWidth: '160px' }}>
        {isJoining ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : 'Join now'}
      </button>
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-deepest)',
  minHeight: '100vh',
  color: 'var(--color-text-primary)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '20px',
  padding: '24px',
  textAlign: 'center',
};

const primaryButtonStyle: React.CSSProperties = {
  background: 'var(--color-accent)',
  border: 'none',
  color: 'var(--color-bg-deepest)',
  borderRadius: '8px',
  padding: '10px 20px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: '15px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const secondaryButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--color-text-secondary)',
  color: 'var(--color-text-primary)',
  borderRadius: '8px',
  padding: '10px 20px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: '15px',
};

const circleButtonStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  borderRadius: '50%',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
