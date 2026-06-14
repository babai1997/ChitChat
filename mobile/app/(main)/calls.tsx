import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Phone,
  PhoneMissed,
  PhoneIncoming,
  PhoneOutgoing,
  Video,
  User,
  MessageSquarePlus,
} from 'lucide-react-native';
import { useAuthStore } from '../../src/stores/authStore';
import { useChatStore } from '../../src/stores/chatStore';
import { useCall } from '../../src/contexts/CallContext';
import { chatApi } from '../../src/api';
import { useRouter } from 'expo-router';
import type { Message, Chat } from '../../src/types';

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

export default function CallsScreen() {
  const { user } = useAuthStore();
  const { chats } = useChatStore();
  const { startCall } = useCall();
  const router = useRouter();

  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const buildCallRecords = (allChats: Chat[], currentUserId: string): CallRecord[] => {
    const records: CallRecord[] = [];

    for (const chat of allChats) {
      // We'll fetch missed_call messages from direct chats
      if (chat.type !== 'direct') continue;
      const otherMember = chat.members.find((m) => m.userId !== currentUserId);
      if (!otherMember) continue;

      // Check lastMessage for missed calls
      if (chat.lastMessage?.type === 'missed_call') {
        const isVideoCall = chat.lastMessage.content?.toLowerCase().includes('video');
        const isMine = chat.lastMessage.senderId === currentUserId;
        records.push({
          id: chat.lastMessage.id,
          chatId: chat.id,
          chatName: otherMember.user.profile?.displayName || 'Unknown',
          avatarUrl: otherMember.user.profile?.avatarUrl || null,
          type: isVideoCall ? 'video' : 'audio',
          direction: isMine ? 'outgoing' : 'missed',
          time: chat.lastMessage.createdAt,
          otherUserId: otherMember.userId,
        });
      }
    }

    // Sort by most recent
    return records.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  };

  const loadCalls = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await chatApi.getChats();
      if (user?.id) {
        setCallRecords(buildCallRecords(data, user.id));
      }
    } catch (err) {
      console.error('Failed to load call history:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadCalls();
  }, []);

  // Also build from existing store chats
  useEffect(() => {
    if (chats.length > 0 && user?.id) {
      setCallRecords(buildCallRecords(chats, user.id));
    }
  }, [chats, user?.id]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadCalls(true);
  };

  const handleCallBack = (record: CallRecord) => {
    startCall(record.chatId, record.type);
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

  const renderItem = ({ item }: { item: CallRecord }) => (
    <View style={styles.callItem}>
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <User size={22} color="#8696a0" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.callInfo}>
        <Text style={styles.callerName} numberOfLines={1}>{item.chatName}</Text>
        <View style={styles.callMeta}>
          {getCallIcon(item)}
          <Text style={[styles.callDirection, item.direction === 'missed' && styles.missedText]}>
            {item.direction === 'missed' ? 'Missed' :
             item.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}
          </Text>
          {item.type === 'video' && <Video size={12} color="#8696a0" style={{ marginLeft: 4 }} />}
          <Text style={styles.callTime}> · {formatTime(item.time)}</Text>
        </View>
      </View>

      {/* Callback button */}
      <TouchableOpacity
        style={styles.callbackBtn}
        onPress={() => handleCallBack(item)}
        activeOpacity={0.7}
      >
        {item.type === 'video' ? (
          <Video size={22} color="#00a884" />
        ) : (
          <Phone size={22} color="#00a884" />
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calls</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#00a884" />
        </View>
      ) : callRecords.length > 0 ? (
        <FlatList
          data={callRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#00a884"
              colors={['#00a884']}
            />
          }
        />
      ) : (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconWrapper}>
            <Phone size={48} color="#8696a0" />
          </View>
          <Text style={styles.emptyTitle}>No recent calls</Text>
          <Text style={styles.emptySubtext}>
            Start a new call from a chat conversation
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111b21',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#202c33',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3942',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#e9edef',
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a3942',
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2a3942',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callInfo: {
    flex: 1,
  },
  callerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#e9edef',
    marginBottom: 4,
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  callDirection: {
    fontSize: 13,
    color: '#8696a0',
    marginLeft: 4,
  },
  missedText: {
    color: '#ef4444',
  },
  callTime: {
    fontSize: 13,
    color: '#8696a0',
  },
  callbackBtn: {
    padding: 10,
  },
  emptyIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#2a3942',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e9edef',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8696a0',
    textAlign: 'center',
    lineHeight: 20,
  },
});
