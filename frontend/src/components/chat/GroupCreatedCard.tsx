import { Lock, Users, UserPlus } from 'lucide-react';
import type { Chat } from '../../types';

interface GroupCreatedCardProps {
  chat: Chat;
  currentUserId: string;
  onAddMember: () => void;
}

export const GroupCreatedCard = ({ chat, currentUserId, onAddMember }: GroupCreatedCardProps) => {
  const isCurrentUserAdmin = chat.members.find(m => m.userId === currentUserId)?.role === 'admin';

  const createdDate = new Date(chat.createdAt);
  const dateStr = createdDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });

  const creatorMember = [...chat.members].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
  )[0];
  const creatorName = creatorMember?.userId === currentUserId
    ? 'You'
    : (creatorMember?.user.profile?.displayName || creatorMember?.user.phone || 'Someone');

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 8px 8px' }}>
      <div style={{
        backgroundColor: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        padding: '16px',
        maxWidth: '300px',
        width: '100%',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        textAlign: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}>
        {/* Group avatar */}
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {chat.avatarUrl ? (
            <img src={chat.avatarUrl} alt={chat.name || 'Group'} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Users size={36} color="var(--color-text-secondary)" />
          )}
        </div>

        {/* Name */}
        <div>
          <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>
            {chat.name || 'Group Chat'}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
            Group · {chat.members.length} participants
          </p>
        </div>

        {/* Created by */}
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, wordBreak: 'break-word' }}>
          {creatorName} created this group on {dateStr}
        </p>

        {/* Add members (admin only) */}
        {isCurrentUserAdmin && (
          <button
            onClick={onAddMember}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              backgroundColor: 'transparent', border: '1px solid var(--color-accent)',
              borderRadius: '20px', padding: '6px 16px', cursor: 'pointer', color: 'var(--color-accent)',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent-muted-bg)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <UserPlus size={14} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Add Members</span>
          </button>
        )}

        {/* End-to-end note */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '4px', borderTop: '1px solid var(--color-border)', width: '100%', justifyContent: 'center' }}>
          <Lock size={12} color="var(--color-text-secondary)" />
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0 }}>
            Messages are end-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
};
