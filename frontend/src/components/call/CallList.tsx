import React, { useEffect, useState } from 'react';
import { Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing, Video, User } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCall } from '../../contexts/CallContext';
import { chatApi } from '../../api';

interface CallRecord {
  id: string;
  chatId: string;
  chatName: string;
  avatarUrl: string | null;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  time: string;
  otherUserId: string;
}

interface CallListProps {
  onChatSelect: (chatId: string) => void;
}

export const CallList = ({ onChatSelect }: CallListProps) => {
  const { user } = useAuthStore();
  const { startCall } = useCall();
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const buildCallRecords = (messages: any[], currentUserId: string): CallRecord[] => {
    const records: CallRecord[] = [];

    for (const msg of messages) {
      const isMine = msg.senderId === currentUserId;
      let chatName = 'Unknown';
      let avatarUrl = null;
      let otherUserId = msg.senderId;

      if (msg.chat) {
        if (msg.chat.type === 'direct') {
          const otherMember = msg.chat.members.find((m: any) => m.userId !== currentUserId);
          if (otherMember?.user?.profile) {
            chatName = otherMember.user.profile.displayName || 'Unknown';
            avatarUrl = otherMember.user.profile.avatarUrl;
            otherUserId = otherMember.userId;
          } else if (otherMember?.user) {
            chatName = otherMember.user.phone || otherMember.user.email || 'Unknown';
            otherUserId = otherMember.userId;
          }
        } else {
          chatName = msg.chat.name || 'Group';
          avatarUrl = msg.chat.avatarUrl;
        }
      } else {
        // Fallback to sender
        chatName = msg.sender?.profile?.displayName || msg.sender?.phone || 'Unknown';
        avatarUrl = msg.sender?.profile?.avatarUrl || null;
      }

      let callLog = { status: 'missed', duration: 0, isVideo: false };
      try {
        if (msg.content) {
          if (msg.content.startsWith('{')) {
            callLog = JSON.parse(msg.content);
          } else {
            callLog.isVideo = msg.content.includes('video');
            callLog.status = msg.content.includes('ended') ? 'ended' : 'missed';
          }
        }
      } catch {
        // ignore parse error
      }

      let direction: 'missed' | 'outgoing' | 'incoming' = 'missed';
      if (isMine) {
        direction = 'outgoing';
      } else if (callLog.status === 'ended') {
        direction = 'incoming';
      } else {
        direction = 'missed';
      }

      records.push({
        id: msg.id,
        chatId: msg.chatId,
        chatName,
        avatarUrl,
        type: callLog.isVideo ? 'video' : 'audio',
        direction,
        time: msg.createdAt,
        otherUserId,
      });
    }

    return records;
  };

  useEffect(() => {
    const loadCalls = async () => {
      setIsLoading(true);
      try {
        const data = await chatApi.getCallHistory();
        if (user?.id) {
          setCallRecords(buildCallRecords(data, user.id));
        }
      } catch (err) {
        console.error('Failed to load call history:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadCalls();
  }, [user?.id]);

  const handleCallBack = (e: React.MouseEvent, record: CallRecord) => {
    e.stopPropagation();
    startCall(record.chatId, record.type);
  };

  const handleRecordClick = (record: CallRecord) => {
    // We notify the parent (HomePage) to open the chat
    onChatSelect(record.chatId);
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getCallIcon = (record: CallRecord) => {
    if (record.direction === 'missed') {
      return <PhoneMissed size={16} color="#ef4444" />;
    }
    if (record.direction === 'outgoing') {
      return <PhoneOutgoing size={16} color="#00a884" />;
    }
    return <PhoneIncoming size={16} color="#53bdeb" />;
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
        <div style={{ color: '#00a884', animation: 'spin 1s linear infinite' }}>
           <Phone size={24} />
        </div>
      </div>
    );
  }

  if (callRecords.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '256px', color: '#8696a0' }}>
        <Phone size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
        <p style={{ fontSize: '18px', fontWeight: 500, color: '#e9edef', marginBottom: '8px' }}>No recent calls</p>
        <p style={{ fontSize: '14px', textAlign: 'center' }}>Start a new call from a chat conversation</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {callRecords.map((item) => (
        <button
          key={item.id}
          onClick={() => handleRecordClick(item)}
          style={{
            width: '100%',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: '1px solid #202c33',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background-color 0.2s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#202c33'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#2a3942', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {item.avatarUrl ? (
                <img 
                  src={item.avatarUrl} 
                  referrerPolicy="no-referrer"
                  alt={item.chatName} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <User size={24} color="#8696a0" />
              )}
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 500, color: item.direction === 'missed' ? '#ef4444' : '#e9edef', fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.chatName}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: '#8696a0', fontSize: '14px', gap: '4px' }}>
              {getCallIcon(item)}
              <span>{item.direction === 'missed' ? 'Missed' : item.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}</span>
              {item.type === 'video' && <Video size={14} style={{ marginLeft: '4px' }} />}
              <span> · {formatTime(item.time)}</span>
            </div>
          </div>
          
          {/* Call Back Button */}
          <div 
             onClick={(e) => handleCallBack(e, item)}
             style={{ padding: '8px', color: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
             onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 168, 132, 0.1)'}
             onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
             {item.type === 'video' ? <Video size={22} /> : <Phone size={22} />}
          </div>
        </button>
      ))}
    </div>
  );
};
