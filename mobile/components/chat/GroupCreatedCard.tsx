import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Users, UserPlus, Lock } from 'lucide-react-native';
import type { Chat } from '../../src/types';

interface GroupCreatedCardProps {
  chat: Chat;
  currentUserId?: string;
  onAddMember: () => void;
}

export default function GroupCreatedCard({ chat, currentUserId, onAddMember }: GroupCreatedCardProps) {
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
    <View style={styles.wrapper}>
      <View style={styles.card}>
        {/* Group avatar */}
        <View style={styles.avatarContainer}>
          {chat.avatarUrl ? (
            <Image source={{ uri: chat.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Users size={36} color="#8696a0" />
            </View>
          )}
        </View>

        {/* Name + count */}
        <Text style={styles.groupName}>{chat.name || 'Group Chat'}</Text>
        <Text style={styles.memberCount}>Group · {chat.members.length} participants</Text>

        {/* Created by */}
        <Text style={styles.createdBy}>
          {creatorName} created this group on {dateStr}
        </Text>

        {/* Add members (admin only) */}
        {isCurrentUserAdmin && (
          <TouchableOpacity style={styles.addBtn} onPress={onAddMember} activeOpacity={0.7}>
            <UserPlus size={14} color="#00a884" />
            <Text style={styles.addBtnText}>Add Members</Text>
          </TouchableOpacity>
        )}

        {/* End-to-end note */}
        <View style={styles.encryptedRow}>
          <Lock size={11} color="#8696a0" />
          <Text style={styles.encryptedText}>Messages are end-to-end encrypted</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 24 },
  card: {
    backgroundColor: '#1f2c34', borderRadius: 12, borderWidth: 1, borderColor: '#2a3942',
    padding: 20, maxWidth: 300, width: '100%', alignItems: 'center', gap: 10,
  },
  avatarContainer: { marginBottom: 4 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#2a3942', alignItems: 'center', justifyContent: 'center' },
  groupName: { fontSize: 17, fontWeight: '600', color: '#e9edef', textAlign: 'center' },
  memberCount: { fontSize: 13, color: '#8696a0' },
  createdBy: { fontSize: 13, color: '#8696a0', textAlign: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#00a884', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  addBtnText: { color: '#00a884', fontSize: 13, fontWeight: '500' },
  encryptedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: 1, borderTopColor: '#2a3942', paddingTop: 10, width: '100%', justifyContent: 'center' },
  encryptedText: { fontSize: 12, color: '#8696a0' },
});
