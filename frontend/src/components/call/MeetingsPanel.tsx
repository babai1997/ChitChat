import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Loader2, Trash2, Users, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import { meetingsApi, type MyMeeting } from '../../api';

function meetingLink(slug: string): string {
  return `${window.location.origin}/meet/${slug}`;
}

function CopyButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(meetingLink(slug));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy meeting link:', err);
      toast.error('Failed to copy link');
    }
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy link"
      style={{ background: 'none', border: 'none', color: copied ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px' }}
    >
      {copied ? <Check size={18} /> : <Copy size={18} />}
    </button>
  );
}

/**
 * Replaces the old "New Meeting -> one-shot share modal, link gone
 * forever after closing it" flow. Gives every user ONE persistent,
 * reusable Personal Meeting Room (same link every time, like Zoom's PMI)
 * plus a "My Meetings" list so an ad-hoc named room's link can be found
 * and re-copied later instead of only ever being shown once.
 */
export const MeetingsPanel = () => {
  const navigate = useNavigate();
  const [personalSlug, setPersonalSlug] = useState<string | null>(null);
  const [isLoadingPersonal, setIsLoadingPersonal] = useState(true);
  const [meetings, setMeetings] = useState<MyMeeting[]>([]);
  const [isLoadingMine, setIsLoadingMine] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [actioningSlug, setActioningSlug] = useState<string | null>(null);

  const loadMine = async () => {
    try {
      setMeetings(await meetingsApi.listMine());
    } catch (err) {
      console.error('Failed to load meetings:', err);
    } finally {
      setIsLoadingMine(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { slug } = await meetingsApi.getPersonalRoom();
        setPersonalSlug(slug);
      } catch (err) {
        console.error('Failed to load personal meeting room:', err);
      } finally {
        setIsLoadingPersonal(false);
      }
    })();
    void loadMine();
  }, []);

  const handleCreateMeeting = async () => {
    setIsCreating(true);
    try {
      const { slug } = await meetingsApi.create();
      navigate(`/meet/${slug}`);
    } catch (err) {
      console.error('Failed to create meeting:', err);
      toast.error('Failed to create meeting');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (slug: string) => {
    if (!window.confirm('Revoke this meeting link? It will stop working immediately.')) return;
    setActioningSlug(slug);
    try {
      await meetingsApi.revoke(slug);
      toast.success('Meeting link revoked');
      await loadMine();
    } catch (err) {
      console.error('Failed to revoke meeting:', err);
      toast.error('Failed to revoke meeting');
    } finally {
      setActioningSlug(null);
    }
  };

  const namedMeetings = meetings.filter((m) => !m.isPersonal && !m.revoked);

  return (
    <div style={{ padding: '16px', borderBottom: '1px solid var(--color-surface)' }}>
      {/* Personal Meeting Room — the actual fix: one link, reused forever */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px',
          backgroundColor: 'var(--color-surface)',
          borderRadius: '8px',
          marginBottom: '12px',
        }}
      >
        <Video size={22} color="var(--color-accent)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: 500 }}>Your Personal Meeting Room</div>
          <div
            style={{
              fontSize: '12.5px',
              color: 'var(--color-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isLoadingPersonal ? 'Loading…' : personalSlug ? meetingLink(personalSlug) : 'Unavailable'}
          </div>
        </div>
        {personalSlug && (
          <>
            <CopyButton slug={personalSlug} />
            <button
              onClick={() => navigate(`/meet/${personalSlug}`)}
              style={{
                background: 'var(--color-accent)',
                border: 'none',
                color: 'var(--color-bg-deepest)',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '13px',
                whiteSpace: 'nowrap',
              }}
            >
              Start
            </button>
          </>
        )}
      </div>

      <button
        onClick={handleCreateMeeting}
        disabled={isCreating}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          width: '100%',
          background: 'none',
          border: '1px solid var(--color-border)',
          color: 'var(--color-accent)',
          borderRadius: '8px',
          padding: '10px',
          cursor: isCreating ? 'default' : 'pointer',
          fontWeight: 500,
          fontSize: '14px',
          marginBottom: namedMeetings.length > 0 ? '16px' : 0,
        }}
      >
        {isCreating ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Users size={16} />}
        New Meeting
      </button>

      {!isLoadingMine && namedMeetings.length > 0 && (
        <div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>My Meetings</div>
          {namedMeetings.map((m) => (
            <div
              key={m.slug}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 0',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name || 'Meeting'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  Created {new Date(m.createdAt).toLocaleDateString()}
                </div>
              </div>
              <CopyButton slug={m.slug} />
              <button
                onClick={() => navigate(`/meet/${m.slug}`)}
                title="Join"
                style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', padding: '6px' }}
              >
                <Video size={18} />
              </button>
              <button
                onClick={() => handleRevoke(m.slug)}
                disabled={actioningSlug === m.slug}
                title="Revoke"
                style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '6px' }}
              >
                {actioningSlug === m.slug ? (
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Trash2 size={18} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
