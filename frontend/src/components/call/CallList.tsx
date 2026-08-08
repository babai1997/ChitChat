import React, { useRef, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing, Video, User, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCall } from '../../contexts/CallContext';
import { useHasCamera } from '../../hooks';
import { Tooltip } from '../common/Tooltip';
import { chatApi } from '../../api';

interface RawCallMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  createdAt: string;
  chat?: {
    type: string;
    name?: string;
    avatarUrl?: string | null;
    members: Array<{
      userId: string;
      user?: {
        phone?: string;
        email?: string;
        profile?: {
          displayName?: string;
          avatarUrl?: string | null;
        };
      };
    }>;
  };
  sender?: {
    phone?: string;
    profile?: {
      displayName?: string;
      avatarUrl?: string | null;
    };
  };
}

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

function buildCallRecords(messages: RawCallMessage[], currentUserId: string): CallRecord[] {
  const records: CallRecord[] = [];

  for (const msg of messages) {
    const isMine = msg.senderId === currentUserId;
    let chatName = 'Unknown';
    let avatarUrl: string | null = null;
    let otherUserId = msg.senderId;

    if (msg.chat) {
      if (msg.chat.type === 'direct') {
        const otherMember = msg.chat.members.find((m) => m.userId !== currentUserId);
        if (otherMember?.user?.profile) {
          chatName = otherMember.user.profile.displayName ?? 'Unknown';
          avatarUrl = otherMember.user.profile.avatarUrl ?? null;
          otherUserId = otherMember.userId;
        } else if (otherMember?.user) {
          chatName = otherMember.user.phone ?? otherMember.user.email ?? 'Unknown';
          otherUserId = otherMember.userId;
        }
      } else {
        chatName = msg.chat.name ?? 'Group';
        avatarUrl = msg.chat.avatarUrl ?? null;
      }
    } else if (msg.sender) {
      chatName = msg.sender.profile?.displayName ?? msg.sender.phone ?? 'Unknown';
      avatarUrl = msg.sender.profile?.avatarUrl ?? null;
    }

    let callLog = { status: 'missed', isVideo: false };
    try {
      if (msg.content) {
        if (msg.content.startsWith('{')) {
          const parsed = JSON.parse(msg.content) as { status?: string; isVideo?: boolean };
          callLog = { status: parsed.status ?? 'missed', isVideo: parsed.isVideo ?? false };
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
}

export const CallList = ({ onChatSelect }: CallListProps) => {
  const { user } = useAuthStore();
  const { startCall } = useCall();
  const hasCamera = useHasCamera();
  const observerRef = useRef<IntersectionObserver | null>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['call-history', user?.id],
    queryFn: async ({ pageParam }) => {
      const raw = await chatApi.getCallHistory({
        cursor: pageParam as string | undefined,
      });
      return {
        records: user?.id ? buildCallRecords(raw.data as RawCallMessage[], user.id) : [],
        nextCursor: raw.nextCursor,
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!user?.id,
    staleTime: 0,
    gcTime: 5 * 60_000,
  });

  // Sentinel ref for auto-load-more on scroll
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      });
      observerRef.current.observe(node);
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  const callRecords = data?.pages.flatMap((p) => p.records) ?? [];

  const handleCallBack = (e: React.MouseEvent, record: CallRecord) => {
    e.stopPropagation();
    if (record.type === 'video' && !hasCamera) return;
    startCall(record.chatId, record.type);
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getCallIcon = (record: CallRecord) => {
    if (record.direction === 'missed') return <PhoneMissed size={16} color="var(--color-danger)" />;
    if (record.direction === 'outgoing') return <PhoneOutgoing size={16} color="var(--color-accent)" />;
    return <PhoneIncoming size={16} color="var(--color-info)" />;
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
        <Loader2 size={24} color="var(--color-accent)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (callRecords.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '256px', color: 'var(--color-text-secondary)' }}>
        <Phone size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
        <p style={{ fontSize: '18px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '8px' }}>No recent calls</p>
        <p style={{ fontSize: '14px', textAlign: 'center' }}>Start a new call from a chat conversation</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {callRecords.map((item) => (
        <button
          key={item.id}
          onClick={() => onChatSelect(item.chatId)}
          style={{
            width: '100%',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--color-surface)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background-color 0.2s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={{ flexShrink: 0 }}>
            <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {item.avatarUrl ? (
                <img src={item.avatarUrl} referrerPolicy="no-referrer" alt={item.chatName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={24} color="var(--color-text-secondary)" />
              )}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 500, color: item.direction === 'missed' ? 'var(--color-danger)' : 'var(--color-text-primary)', fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.chatName}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)', fontSize: '14px', gap: '4px' }}>
              {getCallIcon(item)}
              <span>{item.direction === 'missed' ? 'Missed' : item.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}</span>
              {item.type === 'video' && <Video size={14} style={{ marginLeft: '4px' }} />}
              <span> · {formatTime(item.time)}</span>
            </div>
          </div>

          <Tooltip text="No camera detected" disabled={!(item.type === 'video' && !hasCamera)}>
            <div
              onClick={(e) => handleCallBack(e, item)}
              style={{
                padding: '8px', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
                cursor: item.type === 'video' && !hasCamera ? 'not-allowed' : 'pointer',
                opacity: item.type === 'video' && !hasCamera ? 0.4 : 1,
              }}
              onMouseOver={(e) => {
                if (item.type === 'video' && !hasCamera) return;
                e.currentTarget.style.backgroundColor = 'rgba(108, 93, 216, 0.1)';
              }}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {item.type === 'video' ? <Video size={22} /> : <Phone size={22} />}
            </div>
          </Tooltip>
        </button>
      ))}

      {/* Sentinel triggers next page fetch when scrolled into view */}
      <div ref={sentinelRef} style={{ height: '1px' }} />

      {isFetchingNextPage && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
          <Loader2 size={20} color="var(--color-accent)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}
    </div>
  );
};
