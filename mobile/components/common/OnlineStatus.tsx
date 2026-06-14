import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useChatStore } from '../../src/stores/chatStore';

interface OnlineStatusProps {
  userId: string;
}

function formatLastSeen(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'last seen just now';
  if (diffMins < 60) return `last seen ${diffMins}m ago`;
  if (diffHours < 24) return `last seen ${diffHours}h ago`;
  if (diffDays === 1) return 'last seen yesterday';
  return `last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export default function OnlineStatus({ userId }: OnlineStatusProps) {
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const lastSeen = useChatStore((s) => s.lastSeen);

  const isOnline = onlineUsers.has(userId);
  const lastSeenTime = lastSeen[userId];

  if (isOnline) {
    return <Text style={styles.online}>online</Text>;
  }

  if (lastSeenTime) {
    return <Text style={styles.offline}>{formatLastSeen(lastSeenTime)}</Text>;
  }

  return null;
}

const styles = StyleSheet.create({
  online: {
    color: '#00a884',
    fontSize: 12,
  },
  offline: {
    color: '#8696a0',
    fontSize: 12,
  },
});
