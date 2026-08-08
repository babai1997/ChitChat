import React, { useEffect, useState, useCallback } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Phone,
  PhoneMissed,
  PhoneIncoming,
  PhoneOutgoing,
  Video,
  User,
} from 'lucide-react-native';
import { useAuthStore } from '../../src/stores/authStore';
import { useChatStore } from '../../src/stores/chatStore';
import { useCall } from '../../src/contexts/CallContext';
import { chatApi } from '../../src/api';
import { useRouter, useFocusEffect } from 'expo-router';
import MeetingsPanel from '../../components/call/MeetingsPanel';

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
  const { startCall } = useCall();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      } catch (e) {}

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

  const loadCalls = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await chatApi.getCallHistory();
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

  useFocusEffect(
    useCallback(() => {
      loadCalls(true); // silent load to avoid flickering
    }, [user?.id])
  );

  useEffect(() => {
    loadCalls();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadCalls(true);
  };

  const handleCallBack = (record: CallRecord) => {
    startCall(record.chatId, record.type);
    router.push(`/chat/${record.chatId}` as any);
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
      <TouchableOpacity 
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
        activeOpacity={0.7}
        onPress={() => {
          console.log(`Navigating to Call Info: /call-info/${item.chatId}`);
          router.push(`/call-info/${item.chatId}` as any);
        }}
      >
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
      </TouchableOpacity>

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
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
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
          ListHeaderComponent={MeetingsPanel}
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
        <View style={styles.emptyScroll}>
          <MeetingsPanel />
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconWrapper}>
              <Phone size={48} color="#8696a0" />
            </View>
            <Text style={styles.emptyTitle}>No recent calls</Text>
            <Text style={styles.emptySubtext}>
              Start a new call from a chat conversation
            </Text>
          </View>
        </View>
      )}
    </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#202c33',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3942',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#e9edef',
  },
  emptyScroll: {
    flex: 1,
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
