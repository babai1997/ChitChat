import { View, Text, StyleSheet, Modal, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, User, Users, Phone, Video, Search } from 'lucide-react-native';
import type { Chat } from '../../src/types';

interface ChatInfoModalProps {
  visible: boolean;
  onClose: () => void;
  chat: Chat | null;
  currentUserId?: string;
}

export default function ChatInfoModal({ visible, onClose, chat, currentUserId }: ChatInfoModalProps) {
  if (!chat || !visible) return null;

  const isGroup = chat.type === 'group';
  
  // Sort members for groups: You first, then admins, then others alphabetically
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
  const name = isGroup ? (chat.name || 'Group Chat') : (otherMember?.user.profile?.displayName || 'Unknown User');
  const about = isGroup ? 'Group Description' : (otherMember?.user.profile?.about || 'Hey there! I am using ChitChat');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color="#e9edef" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isGroup ? 'Group Info' : 'Contact Info'}</Text>
        </View>

        <ScrollView style={styles.scrollView}>
          {/* Main Info Card */}
          <View style={styles.mainInfoCard}>
            <View style={styles.avatarContainer}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  {isGroup ? <Users size={60} color="#8696a0" /> : <User size={60} color="#8696a0" />}
                </View>
              )}
            </View>
            <Text style={styles.nameText}>{name}</Text>
            {otherMember && otherMember.user.phone && (
              <Text style={styles.phoneText}>{otherMember.user.phone}</Text>
            )}
            
            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity style={styles.actionButton}>
                <Phone size={24} color="#00a884" />
                <Text style={styles.actionButtonText}>Audio</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Video size={24} color="#00a884" />
                <Text style={styles.actionButtonText}>Video</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Search size={24} color="#00a884" />
                <Text style={styles.actionButtonText}>Search</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* About Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isGroup ? 'Description' : 'About and phone number'}</Text>
            <Text style={styles.aboutText}>{about}</Text>
          </View>

          {/* Participants Section (Groups only) */}
          {isGroup && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{chat.members.length} participants</Text>
              
              {sortedMembers.map((member) => (
                <View key={member.id} style={styles.memberRow}>
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
                      <Text style={styles.memberNameText}>
                        {member.userId === currentUserId ? 'You' : (member.user.profile?.displayName || member.user.phone || 'Unknown')}
                      </Text>
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
                </View>
              ))}
            </View>
          )}

          {/* Block / Report Section (Direct only) */}
          {!isGroup && (
            <View style={styles.dangerSection}>
              <TouchableOpacity style={styles.dangerButton}>
                <Ban size={20} color="#ef4444" />
                <Text style={styles.dangerButtonText}>Block {name}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dangerButton, { borderBottomWidth: 0 }]}>
                <Text style={styles.dangerButtonText}>Report {name}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// Temporary Ban icon placeholder since it's not imported above
const Ban = ({ size, color }: any) => <X size={size} color={color} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b141a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#202c33',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3942',
  },
  closeButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e9edef',
  },
  scrollView: {
    flex: 1,
  },
  mainInfoCard: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#111b21',
    marginBottom: 8,
  },
  avatarContainer: {
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
    backgroundColor: '#2a3942',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    fontSize: 24,
    fontWeight: '500',
    color: '#e9edef',
    marginBottom: 4,
  },
  phoneText: {
    fontSize: 16,
    color: '#8696a0',
    marginBottom: 16,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginTop: 16,
  },
  actionButton: {
    alignItems: 'center',
    gap: 8,
  },
  actionButtonText: {
    color: '#00a884',
    fontSize: 14,
  },
  section: {
    backgroundColor: '#111b21',
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    color: '#8696a0',
    marginBottom: 8,
  },
  aboutText: {
    fontSize: 16,
    color: '#e9edef',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  memberAvatarContainer: {
    marginRight: 12,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  memberAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2a3942',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  memberNameText: {
    fontSize: 16,
    color: '#e9edef',
  },
  adminBadge: {
    borderWidth: 1,
    borderColor: '#00a884',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adminBadgeText: {
    color: '#00a884',
    fontSize: 10,
  },
  memberAboutText: {
    fontSize: 14,
    color: '#8696a0',
  },
  dangerSection: {
    backgroundColor: '#111b21',
    marginTop: 16,
    marginBottom: 32,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3942',
    gap: 16,
  },
  dangerButtonText: {
    color: '#ef4444',
    fontSize: 16,
  },
});
