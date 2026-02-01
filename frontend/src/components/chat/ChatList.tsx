import { User, Check, CheckCheck, Clock } from 'lucide-react';
import type { Chat } from '../../types';

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
    if (chat.type === 'group') return false;
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
        return <Clock size={16} color="#8696a0" />;
      case 'sent':
        return <Check size={16} color="#8696a0" />;
      case 'delivered':
        return <CheckCheck size={16} color="#8696a0" />;
      case 'read':
        return <CheckCheck size={16} color="#53bdeb" />;
      default:
        return <Check size={16} color="#8696a0" />;
    }
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
            backgroundColor: activeChat?.id === chat.id ? '#2a3942' : 'transparent',
            border: 'none',
            borderBottom: '1px solid #202c33',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background-color 0.2s ease'
          }}
          onMouseOver={(e) => {
            if (activeChat?.id !== chat.id) e.currentTarget.style.backgroundColor = '#202c33';
          }}
          onMouseOut={(e) => {
            if (activeChat?.id !== chat.id) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#202c33', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {getChatAvatar(chat) ? (
                <img 
                  src={getChatAvatar(chat)!} 
                  alt={getChatName(chat)} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <User size={24} color="#8696a0" />
              )}
            </div>
            {isOnline(chat) && (
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', backgroundColor: '#25d366', borderRadius: '50%', border: '2px solid #111b21' }} />
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 500, color: '#e9edef', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {getChatName(chat)}
              </span>
              {chat.lastMessage && (
                <span style={{ fontSize: '12px', color: '#8696a0', flexShrink: 0, marginLeft: '8px' }}>
                  {formatTime(chat.lastMessage.createdAt)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', flex: 1, color: '#8696a0', fontSize: '14px' }}>
                {chat.lastMessage ? (
                    <>
                        {chat.lastMessage.senderId === currentUserId && (
                           <span style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
                               {getStatusIcon(chat.lastMessage.status)}
                           </span>
                        )}
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                           {chat.lastMessage.senderId === currentUserId ? '' : (chat.type === 'group' ? (chat.lastMessage.senderName ? `${chat.lastMessage.senderName}: ` : '') : '')}
                           {chat.lastMessage.content}
                        </span>
                    </>
                ) : (
                    <span>No messages yet</span>
                )}
              </div>
              
              {chat.unreadCount > 0 && (
                <span style={{ marginLeft: '8px', minWidth: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#25d366', color: 'white', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', fontWeight: 600 }}>
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
