import { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, User, Users, Phone, Video, ArrowLeft, Trash2, UserPlus, Camera } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { chatApi } from '../../src/api';
import { useChatStore } from '../../src/stores/chatStore';
import type { Chat, ChatMember } from '../../src/types';

interface ChatInfoModalProps {
  visible: boolean;
  onClose: () => void;
  chat: Chat | null;
  currentUserId?: string;
  onAddMember?: () => void;
}

export default function ChatInfoModal({ visible, onClose, chat, currentUserId, onAddMember }: ChatInfoModalProps) {
  const [selectedMember, setSelectedMember] = useState<ChatMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleAvatarUpload = async () => {
    if (!chat || isUploading) return;

    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission Required', 'Allow photo library access to change the group photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setIsUploading(true);
    try {
      const { url } = await chatApi.uploadGroupAvatar(
        chat.id,
        asset.uri,
        asset.fileName || 'group-avatar.jpg',
        asset.mimeType || 'image/jpeg',
      );
      const updatedChat = await chatApi.updateGroup(chat.id, { avatarUrl: url });
      const { chats, setChats, activeChat, setActiveChat } = useChatStore.getState();
      setChats(chats.map(c => c.id === updatedChat.id ? updatedChat : c));
      if (activeChat?.id === updatedChat.id) setActiveChat(updatedChat);
    } catch (err) {
      console.error('Failed to upload group avatar:', err);
      Alert.alert('Upload Failed', 'Could not update the group photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!chat || !visible) return null;

  const isGroup = chat.type === 'group';
  const isCurrentUserAdmin = chat.members.find(m => m.userId === currentUserId)?.role === 'admin';

  const sortedMembers = isGroup ? [...chat.members].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (b.role === 'admin' && a.role !== 'admin') return 1;
    const nameA = a.user.profile?.displayName || a.user.phone || '';
    const nameB = b.user.profile?.displayName || b.user.phone || '';
    return nameA.localeCompare(nameB);
  }) : [];

  const otherMember = !isGroup ? chat.members.find(m => m.userId !== currentUserId) : null;
  const avatarUrl = isGroup ? chat.avatarUrl : otherMember?.user.profile?.avatarUrl;
  const displayName = isGroup
    ? (chat.name || 'Group Chat')
    : (otherMember?.user.profile?.displayName || 'Unknown User');

  const handleRemoveMember = async () => {
    if (!selectedMember || isRemoving) return;
    setIsRemoving(true);
    try {
      await chatApi.removeMember(chat.id, selectedMember.userId);
      const updatedChat = await chatApi.getChat(chat.id);
      const { chats, setChats, activeChat, setActiveChat } = useChatStore.getState();
      setChats(chats.map(c => c.id === updatedChat.id ? updatedChat : c));
      if (activeChat?.id === updatedChat.id) setActiveChat(updatedChat);
      setSelectedMember(null);
    } catch (err) {
      console.error('Failed to remove member:', err);
    } finally {
      setIsRemoving(false);
    }
  };

  // ── Member profile view ────────────────────────────────────────────────────
  if (selectedMember) {
    const memberName = selectedMember.userId === currentUserId
      ? 'You'
      : (selectedMember.user.profile?.displayName || selectedMember.user.phone || 'Unknown');

    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedMember(null)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setSelectedMember(null)} style={styles.backBtn}>
              <ArrowLeft size={24} color="#e9edef" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Member Info</Text>
          </View>

          <ScrollView style={styles.scrollView}>
            <View style={[styles.mainInfoCard, { paddingBottom: 32 }]}>
              <View style={styles.avatarWrap}>
                {selectedMember.user.profile?.avatarUrl ? (
                  <Image source={{ uri: selectedMember.user.profile.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <User size={60} color="#8696a0" />
                  </View>
                )}
              </View>
              <Text style={styles.nameText}>{memberName}</Text>
              {selectedMember.user.phone && (
                <Text style={styles.phoneText}>{selectedMember.user.phone}</Text>
              )}
              {selectedMember.role === 'admin' && (
                <View style={[styles.adminBadge, { marginTop: 8 }]}>
                  <Text style={styles.adminBadgeText}>Group Admin</Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.aboutText}>
                {selectedMember.user.profile?.about || 'Hey there! I am using ChitChat'}
              </Text>
            </View>

            {isCurrentUserAdmin && selectedMember.userId !== currentUserId && (
              <View style={styles.dangerSection}>
                <TouchableOpacity
                  style={styles.dangerButton}
                  onPress={() => void handleRemoveMember()}
                  disabled={isRemoving}
                  activeOpacity={0.7}
                >
                  {isRemoving
                    ? <ActivityIndicator size="small" color="#ef4444" />
                    : <Trash2 size={20} color="#ef4444" />
                  }
                  <Text style={styles.dangerButtonText}>Remove from group</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Main info view ─────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <X size={24} color="#e9edef" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isGroup ? 'Group Info' : 'Contact Info'}</Text>
        </View>

        <ScrollView style={styles.scrollView}>
          {/* Main Info Card */}
          <View style={styles.mainInfoCard}>
            {/* Avatar — tappable for groups to change photo */}
            {isGroup ? (
              <TouchableOpacity
                style={styles.avatarWrap}
                onPress={() => void handleAvatarUpload()}
                activeOpacity={0.8}
                disabled={isUploading}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Users size={60} color="#8696a0" />
                  </View>
                )}
                <View style={styles.cameraOverlay}>
                  {isUploading
                    ? <ActivityIndicator size="small" color="white" />
                    : <Camera size={18} color="white" />
                  }
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.avatarWrap}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <User size={60} color="#8696a0" />
                  </View>
                )}
              </View>
            )}

            <Text style={styles.nameText}>{displayName}</Text>

            {isGroup ? (
              <Text style={styles.phoneText}>Group · {chat.members.length} participants</Text>
            ) : otherMember?.user.phone ? (
              <Text style={styles.phoneText}>{otherMember.user.phone}</Text>
            ) : null}

            {/* Action buttons — direct chats only */}
            {!isGroup && (
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity style={styles.actionButton}>
                  <Phone size={24} color="#00a884" />
                  <Text style={styles.actionButtonText}>Audio</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
                  <Video size={24} color="#00a884" />
                  <Text style={styles.actionButtonText}>Video</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* About / Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isGroup ? 'Description' : 'About'}</Text>
            <Text style={styles.aboutText}>
              {isGroup
                ? 'Welcome to the group!'
                : (otherMember?.user.profile?.about || 'Hey there! I am using ChitChat')}
            </Text>
          </View>

          {/* Participants (groups only) */}
          {isGroup && (
            <View style={styles.section}>
              <View style={styles.participantsHeader}>
                <Text style={styles.sectionTitle}>{chat.members.length} participants</Text>
                {isCurrentUserAdmin && onAddMember && (
                  <TouchableOpacity
                    style={styles.addMemberBtn}
                    onPress={() => { onClose(); onAddMember(); }}
                    activeOpacity={0.7}
                  >
                    <UserPlus size={16} color="#00a884" />
                    <Text style={styles.addMemberBtnText}>Add Member</Text>
                  </TouchableOpacity>
                )}
              </View>

              {sortedMembers.map((member) => {
                const mName = member.userId === currentUserId
                  ? 'You'
                  : (member.user.profile?.displayName || member.user.phone || 'Unknown');
                const clickable = isCurrentUserAdmin && member.userId !== currentUserId;

                return (
                  <TouchableOpacity
                    key={member.id}
                    style={styles.memberRow}
                    onPress={clickable ? () => setSelectedMember(member) : undefined}
                    activeOpacity={clickable ? 0.7 : 1}
                  >
                    <View style={styles.memberAvatarContainer}>
                      {member.user.profile?.avatarUrl ? (
                        <Image source={{ uri: member.user.profile.avatarUrl }} style={styles.memberAvatar} />
                      ) : (
                        <View style={styles.memberAvatarPlaceholder}>
                          <User size={20} color="#8696a0" />
                        </View>
                      )}
                    </View>
                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberNameText}>{mName}</Text>
                        {member.role === 'admin' && (
                          <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>Group Admin</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.memberAboutText} numberOfLines={1}>
                        {member.user.profile?.about || 'Hey there! I am using ChitChat'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Block option (direct only) */}
          {!isGroup && (
            <View style={styles.dangerSection}>
              <TouchableOpacity style={[styles.dangerButton, { borderBottomWidth: 0 }]}>
                <X size={20} color="#ef4444" />
                <Text style={styles.dangerButtonText}>Block {displayName}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b141a' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, backgroundColor: '#202c33',
    borderBottomWidth: 1, borderBottomColor: '#2a3942',
  },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#e9edef' },
  scrollView: { flex: 1 },
  mainInfoCard: {
    alignItems: 'center', paddingVertical: 24,
    backgroundColor: '#111b21', marginBottom: 8,
  },
  avatarWrap: {
    width: 140, height: 140,
    marginBottom: 16,
    position: 'relative',
  },
  avatar: { width: 140, height: 140, borderRadius: 70 },
  avatarPlaceholder: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#2a3942', alignItems: 'center', justifyContent: 'center',
  },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#00a884',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#111b21',
  },
  changePhotoRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111b21',
    paddingVertical: 14, paddingHorizontal: 20,
    marginBottom: 8, gap: 14,
  },
  changePhotoIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#2a3942',
    alignItems: 'center', justifyContent: 'center',
  },
  changePhotoText: { fontSize: 16, color: '#00a884', fontWeight: '500' },
  nameText: { fontSize: 24, fontWeight: '500', color: '#e9edef', marginBottom: 4 },
  phoneText: { fontSize: 15, color: '#8696a0', marginBottom: 8 },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 40, marginTop: 16 },
  actionButton: { alignItems: 'center', gap: 8 },
  actionButtonText: { color: '#00a884', fontSize: 14 },
  section: { backgroundColor: '#111b21', padding: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 13, color: '#8696a0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  aboutText: { fontSize: 16, color: '#e9edef' },
  participantsHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  addMemberBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#00a884', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  addMemberBtnText: { color: '#00a884', fontSize: 13, fontWeight: '500' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  memberAvatarContainer: { marginRight: 12 },
  memberAvatar: { width: 46, height: 46, borderRadius: 23 },
  memberAvatarPlaceholder: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#2a3942', alignItems: 'center', justifyContent: 'center',
  },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  memberNameText: { fontSize: 16, color: '#e9edef' },
  adminBadge: { borderWidth: 1, borderColor: '#00a884', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  adminBadgeText: { color: '#00a884', fontSize: 10 },
  memberAboutText: { fontSize: 14, color: '#8696a0' },
  dangerSection: { backgroundColor: '#111b21', marginTop: 8, marginBottom: 32 },
  dangerButton: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#2a3942', gap: 16,
  },
  dangerButtonText: { color: '#ef4444', fontSize: 16 },
});
