import { User, Check, CheckCheck, Clock } from 'lucide-react';
import type { Chat } from '../../types';
import { isE2eePlaceholder } from '../../services/e2eeSessions';

interface ChatListProps {
  chats: Chat[];
  activeChat: Chat | null;
  onChatSelect: (chat: Chat) => void;
  currentUserId: string;
}

import { useChatStore } from '../../stores/chatStore';

export const ChatList = ({ chats, activeChat, onChatSelect, currentUserId }: ChatListProps) => {
  const { onlineUsers } = useChatStore();

  const getChatName = (chat: Chat) => {
    if (chat.type === 'direct') {
      const otherMember = chat.members.find((m) => m.userId !== currentUserId);
      return otherMember?.user.profile?.displayName || 'Unknown';
    }
    return chat.name || 'Unknown Group'; 
  };

  const getChatAvatar = (chat: Chat) => {
    if (chat.type === 'direct') {
      const otherMember = chat.members.find((m) => m.userId !== currentUserId);
      return otherMember?.user.profile?.avatarUrl || null;
    }
    return chat.avatarUrl || null;
  };

  const isOnline = (chat: Chat) => {
    if (chat.type === 'group' || chat.type === 'meeting') return false;
    const otherMember = chat.members.find((m) => m.userId !== currentUserId);
    return otherMember ? onlineUsers.has(otherMember.userId) : false;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sending':
        return <Clock size={16} color="var(--color-text-secondary)" />;
      case 'sent':
        return <Check size={16} color="var(--color-text-secondary)" />;
      case 'delivered':
        return <CheckCheck size={16} color="var(--color-text-secondary)" />;
      case 'read':
        return <CheckCheck size={16} color="var(--color-info)" />;
      default:
        return <Check size={16} color="var(--color-text-secondary)" />;
    }
  };

  const getLastMessageText = (message: any) => {
    if (message.type === 'missed_call') {
      try {
        const callLog = JSON.parse(message.content || '{}');
        const isVideo = callLog.isVideo;
        if (message.senderId === currentUserId) {
          return isVideo ? 'Video call' : 'Voice call';
        } else {
          return callLog.status === 'ended' 
            ? 'Call ended' 
            : (isVideo ? 'Missed video call' : 'Missed voice call');
        }
      } catch (e) {
        return 'Missed call';
      }
    }
    
    if (message.type === 'image') return '📷 Photo';
    if (message.type === 'audio') return '🎵 Audio';
    if (message.type === 'video') return '📹 Video';
    if (message.type === 'file' || (message.attachments && message.attachments.length > 0)) {
      return '📄 Document';
    }

    // The full sentinel sentence ("Approve this device from another
    // device...") is meant to be read once, in context, inside a chat —
    // not as a chat-list preview line, where it would look like the other
    // person is repeatedly sending you the same odd message.
    if (isE2eePlaceholder(message.content)) return '🔒 Encrypted message';

    return message.content;
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {chats.map((chat) => (
        <button
          key={chat.id}
          onClick={() => onChatSelect(chat)}
          style={{
            width: '100%',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            backgroundColor: activeChat?.id === chat.id ? 'var(--color-border)' : 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--color-surface)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background-color 0.2s ease'
          }}
          onMouseOver={(e) => {
            if (activeChat?.id !== chat.id) e.currentTarget.style.backgroundColor = 'var(--color-surface)';
          }}
          onMouseOut={(e) => {
            if (activeChat?.id !== chat.id) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {getChatAvatar(chat) ? (
                <img 
                  src={getChatAvatar(chat)!} 
                  referrerPolicy="no-referrer"
                  alt={getChatName(chat)} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <User size={24} color="var(--color-text-secondary)" />
              )}
            </div>
            {isOnline(chat) && (
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', backgroundColor: 'var(--color-accent-secondary)', borderRadius: '50%', border: '2px solid var(--color-bg)' }} />
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {getChatName(chat)}
              </span>
              {chat.lastMessage && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', flexShrink: 0, marginLeft: '8px' }}>
                  {formatTime(chat.lastMessage.createdAt)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', flex: 1, color: 'var(--color-text-secondary)', fontSize: '14px' }}>
                {chat.lastMessage ? (
                    <>
                        {chat.lastMessage.senderId === currentUserId && (
                           <span style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                               {getStatusIcon(chat.lastMessage.status)}
                           </span>
                        )}
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                           {chat.lastMessage.senderId === currentUserId ? '' : ((chat.type === 'group' || chat.type === 'meeting') ? (chat.lastMessage.senderName ? `${chat.lastMessage.senderName}: ` : '') : '')}
                           {getLastMessageText(chat.lastMessage)}
                        </span>
                    </>
                ) : (
                    <span>No messages yet</span>
                )}
              </div>
              
              {chat.unreadCount > 0 && (
                <span style={{ marginLeft: '8px', minWidth: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'var(--color-accent-secondary)', color: 'white', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', fontWeight: 600 }}>
                  {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};
