import { X, User, Users } from 'lucide-react';
import type { Chat } from '../../types';

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat;
  currentUserId: string;
}

export const GroupInfoModal = ({ isOpen, onClose, chat, currentUserId }: GroupInfoModalProps) => {
  if (!isOpen) return null;

  // Sort members: You first, then admins, then others alphabetically
  const sortedMembers = [...chat.members].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (b.role === 'admin' && a.role !== 'admin') return 1;
    
    const nameA = a.user.profile?.displayName || a.user.phone || '';
    const nameB = b.user.profile?.displayName || b.user.phone || '';
    return nameA.localeCompare(nameB);
  });

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }} 
      onClick={onClose}
    >
      <div 
        className="glass" 
        style={{
          width: '100%',
          maxWidth: '400px',
          maxHeight: '80vh',
          backgroundColor: '#1f2c34',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          border: '1px solid #2a3942'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          borderBottom: '1px solid #2a3942',
          backgroundColor: '#202c33'
        }}>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', display: 'flex' }}
          >
            <X size={24} />
          </button>
          <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#e9edef', margin: 0 }}>Group Info</h2>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Group Header Info */}
          <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '10px solid #111b21' }}>
            <div style={{ 
              width: '120px', 
              height: '120px', 
              borderRadius: '50%', 
              backgroundColor: '#2a3942', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              marginBottom: '16px',
              overflow: 'hidden'
            }}>
              {chat.avatarUrl ? (
                <img src={chat.avatarUrl} alt={chat.name || 'Group'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Users size={60} color="#8696a0" />
              )}
            </div>

            <h3 style={{ fontSize: '22px', fontWeight: 600, color: '#e9edef', marginBottom: '4px', textAlign: 'center' }}>
              {chat.name || 'Group Chat'}
            </h3>
            <p style={{ fontSize: '14px', color: '#8696a0', marginBottom: '8px' }}>
              Group · {chat.members.length} participants
            </p>
          </div>

          {/* About / Description (Placeholder if not available in types yet) */}
          <div style={{ padding: '16px', borderBottom: '10px solid #111b21' }}>
            <p style={{ fontSize: '14px', color: '#25d366', marginBottom: '4px' }}>Description</p>
            <p style={{ fontSize: '15px', color: '#e9edef' }}>
              {/* Assuming no explicit description field in Chat type yet, using generic message or extending type later */}
              Welcome to the group!
            </p>
          </div>

          {/* Participants */}
          <div style={{ padding: '16px' }}>
            <p style={{ fontSize: '14px', color: '#8696a0', marginBottom: '16px' }}>
              {chat.members.length} participants
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sortedMembers.map((member) => (
                <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
                  <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '50%', 
                    backgroundColor: '#2a3942', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    {member.user.profile?.avatarUrl ? (
                      <img src={member.user.profile.avatarUrl} alt={member.user.profile.displayName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <User size={20} color="#8696a0" />
                    )}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ 
                        fontSize: '16px', 
                        color: '#e9edef', 
                        fontWeight: 400, 
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {member.userId === currentUserId ? 'You' : (member.user.profile?.displayName || member.user.phone || 'Unknown')}
                      </h4>
                      {member.role === 'admin' && (
                        <span style={{ 
                          fontSize: '11px', 
                          color: '#25d366', 
                          border: '1px solid #25d366', 
                          padding: '2px 6px', 
                          borderRadius: '4px',
                          marginLeft: '8px'
                        }}>
                          Group Admin
                        </span>
                      )}
                    </div>
                    
                    <p style={{ fontSize: '13px', color: '#8696a0', margin: 0, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {member.user.profile?.about || 'Hey there! I am using ChitChat'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
