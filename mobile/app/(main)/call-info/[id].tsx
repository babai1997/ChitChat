import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  MoreVertical,
  MessageSquare,
  Phone,
  Video,
  PhoneMissed,
  PhoneOutgoing,
  PhoneIncoming,
  User,
} from 'lucide-react-native';
import { chatApi } from '../../../src/api';
import { useChatStore } from '../../../src/stores/chatStore';
import { useAuthStore } from '../../../src/stores/authStore';
import { useCall } from '../../../src/contexts/CallContext';
import { COLORS } from '../../../src/theme/colors';

export default function CallInfoScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { chats } = useChatStore();
  const { startCall } = useCall();

  const [callRecords, setCallRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const chat = chats.find((c) => c.id === chatId);
  
  let chatName = 'Unknown';
  let avatarUrl = null;
  let phoneStr = '';

  if (chat) {
    if (chat.type === 'direct') {
      const otherMember = chat.members.find((m) => m.userId !== user?.id);
      if (otherMember?.user?.profile) {
        chatName = otherMember.user.profile.displayName || 'Unknown';
        avatarUrl = otherMember.user.profile.avatarUrl;
        phoneStr = otherMember.user.phone || '';
      } else if (otherMember?.user) {
        chatName = otherMember.user.phone || otherMember.user.email || 'Unknown';
        phoneStr = otherMember.user.phone || '';
      }
    } else {
      chatName = chat.name || 'Group';
      avatarUrl = chat.avatarUrl;
    }
  }

  useEffect(() => {
    const loadCallHistory = async () => {
      try {
        const data = await chatApi.getCallHistory(chatId);
        
        const records = data.map((msg: any) => {
          const isMine = msg.senderId === user?.id;
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

          let direction = 'missed';
          if (isMine) {
            direction = 'outgoing';
          } else if (callLog.status === 'ended') {
            direction = 'incoming';
          } else {
            direction = 'missed';
          }

          return {
            id: msg.id,
            type: callLog.isVideo ? 'video' : 'audio',
            direction,
            time: msg.createdAt,
            duration: callLog.duration,
            status: callLog.status,
          };
        });

        setCallRecords(records);
      } catch (err) {
        console.error('Failed to load call history for chat:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (chatId) {
      loadCallHistory();
    }
  }, [chatId]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const getCallIcon = (direction: string) => {
    if (direction === 'missed') {
      return <PhoneMissed size={20} color={COLORS.danger} />;
    }
    if (direction === 'outgoing') {
      return <PhoneOutgoing size={20} color={COLORS.accent} />;
    }
    return <PhoneIncoming size={20} color={COLORS.info} />;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return 'Not answered';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} sec`;
    return `${m} min ${s} sec`;
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.recordItem}>
      <View style={styles.recordIconWrapper}>
        {getCallIcon(item.direction)}
      </View>
      <View style={styles.recordDetails}>
        <Text style={styles.recordTitle}>
          {item.direction === 'missed' ? 'Missed' :
           item.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}
        </Text>
        <Text style={styles.recordTime}>{formatTime(item.time)}</Text>
      </View>
      <View style={styles.recordRight}>
        <Text style={styles.recordDuration}>{formatDuration(item.duration)}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <ArrowLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Call info</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn}>
          <MoreVertical size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View style={styles.avatarWrapper}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <User size={50} color={COLORS.textSecondary} />
            </View>
          )}
        </View>
        <Text style={styles.nameText}>{chatName}</Text>
        {!!phoneStr && <Text style={styles.phoneText}>{phoneStr}</Text>}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.actionBtn}
            onPress={() => router.push(`/chat/${chatId}` as any)}
            activeOpacity={0.7}
          >
            <MessageSquare size={24} color={COLORS.accent} />
            <Text style={styles.actionLabel}>Message</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionBtn}
            onPress={() => {
              startCall(chatId, 'audio');
              router.push(`/chat/${chatId}` as any);
            }}
            activeOpacity={0.7}
          >
            <Phone size={24} color={COLORS.accent} />
            <Text style={styles.actionLabel}>Audio</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionBtn}
            onPress={() => {
              startCall(chatId, 'video');
              router.push(`/chat/${chatId}` as any);
            }}
            activeOpacity={0.7}
          >
            <Video size={24} color={COLORS.accent} />
            <Text style={styles.actionLabel}>Video</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.historyHeader}>
        <Text style={styles.historyHeaderText}>Today</Text>
      </View>

      {/* Call History List */}
      {isLoading ? (
        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={callRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDeepest, // WhatsApp dark bg
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    padding: 12,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: '500',
    marginLeft: 8,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  avatarWrapper: {
    marginBottom: 16,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  avatarPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: '500',
    marginBottom: 4,
  },
  phoneText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    marginBottom: 24,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  actionBtn: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.surface,
    borderRadius: 16,
    width: 90,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionLabel: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '500',
  },
  historyHeader: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  historyHeaderText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  recordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  recordIconWrapper: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recordDetails: {
    flex: 1,
  },
  recordTitle: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '500',
    marginBottom: 2,
  },
  recordTime: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  recordRight: {
    justifyContent: 'center',
  },
  recordDuration: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});
