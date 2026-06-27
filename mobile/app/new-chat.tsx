import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, Users, Check, MessageSquare, ArrowLeft } from 'lucide-react-native';
import { useAuthStore } from '../src/stores/authStore';
import { usersApi, chatApi } from '../src/api';
import type { Profile, UserWithProfile } from '../src/types';
import { useChatStore } from '../src/stores/chatStore';
import { useRouter } from 'expo-router';

type ScreenView = 'list' | 'group-details';

type ListItem =
  | { kind: 'header'; label: string }
  | { kind: 'user'; user: UserWithProfile; isSelected: boolean };

function memberToUserWithProfile(member: {
  userId: string;
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    profile: {
      displayName: string | null;
      avatarUrl: string | null;
      about: string | null;
      isOnline: boolean;
    } | null;
    lastSeen?: string | null;
  };
}): UserWithProfile {
  return {
    id: member.userId,
    phone: member.user.phone,
    email: member.user.email,
    isVerified: false,
    lastSeen: member.user.lastSeen ?? null,
    profile: member.user.profile as Profile | null,
  };
}

export default function NewChatScreen() {
  const { user } = useAuthStore();
  const { chats, setChats } = useChatStore();
  const router = useRouter();

  const [view, setView] = useState<ScreenView>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserWithProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserWithProfile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGroupHint, setShowGroupHint] = useState(false);

  const insets = useSafeAreaInsets();

  const contacts: UserWithProfile[] = chats
    .filter(c => c.type === 'direct')
    .flatMap(c => {
      const other = c.members.find(m => m.userId !== user?.id);
      if (!other) return [];
      return [memberToUserWithProfile(other)];
    });

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        try {
          const results = await usersApi.searchUsers(searchQuery);
          setSearchResults(results.filter(p => p.id !== user?.id));
        } catch (error) {
          console.error('Failed to search users:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, user?.id]);

  const filteredContacts = contacts.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = c.profile?.displayName?.toLowerCase() ?? '';
    const phone = c.phone?.toLowerCase() ?? '';
    return name.includes(q) || phone.includes(q);
  });

  const contactIds = new Set(contacts.map(c => c.id));
  const selectedIds = new Set(selectedUsers.map(u => u.id));
  const novelSearchResults = searchResults.filter(u => !contactIds.has(u.id));

  const buildListData = useCallback((): ListItem[] => {
    const items: ListItem[] = [];

    if (selectedUsers.length > 0) {
      items.push({ kind: 'header', label: 'Selected' });
      for (const u of selectedUsers) {
        items.push({ kind: 'user', user: u, isSelected: true });
      }
    }

    const unselectedContacts = filteredContacts.filter(c => !selectedIds.has(c.id));
    items.push({
      kind: 'header',
      label: searchQuery.trim() ? `Contacts (${unselectedContacts.length})` : 'Contacts',
    });
    for (const u of unselectedContacts) {
      items.push({ kind: 'user', user: u, isSelected: false });
    }

    const novelUnselected = novelSearchResults.filter(u => !selectedIds.has(u.id));
    if (searchQuery.trim().length >= 2 && novelUnselected.length > 0) {
      items.push({ kind: 'header', label: 'Search results' });
      for (const u of novelUnselected) {
        items.push({ kind: 'user', user: u, isSelected: false });
      }
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUsers, filteredContacts, novelSearchResults, searchQuery]);

  const listData = buildListData();

  const toggleUser = (u: UserWithProfile) => {
    if (selectedIds.has(u.id)) {
      setSelectedUsers(prev => prev.filter(p => p.id !== u.id));
    } else {
      setSelectedUsers(prev => [...prev, u]);
    }
  };

  const handleDirectMessage = async () => {
    if (selectedUsers.length !== 1 || isSubmitting) return;
    const target = selectedUsers[0];

    const existing = chats.find(
      c => c.type === 'direct' && c.members.some(m => m.userId === target.id),
    );
    if (existing) {
      router.replace(`/(main)/chat/${existing.id}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const chat = await chatApi.createDirectChat(target.id);
      setChats([chat, ...chats.filter(c => c.id !== chat.id)]);
      router.replace(`/(main)/chat/${chat.id}`);
    } catch (error) {
      console.error('Failed to open chat:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length < 2 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const memberIds = selectedUsers.map(u => u.id);
      const chat = await chatApi.createGroup(groupName.trim(), memberIds);
      setChats([chat, ...chats.filter(c => c.id !== chat.id)]);
      router.replace(`/(main)/chat/${chat.id}`);
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (view === 'group-details') {
      setView('list');
    } else {
      router.back();
    }
  };

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if (item.kind === 'header') {
      return (
        <View key={`h-${index}`} style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
        </View>
      );
    }

    const { user: u, isSelected } = item;
    return (
      <TouchableOpacity
        style={[styles.userItem, isSelected && styles.userItemSelected]}
        onPress={() => toggleUser(u)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {u.profile?.avatarUrl ? (
            <Image source={{ uri: u.profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {u.profile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName}>
            {u.profile?.displayName || u.phone || 'Unknown User'}
          </Text>
          {u.profile?.about ? (
            <Text style={styles.userAbout} numberOfLines={1}>
              {u.profile.about}
            </Text>
          ) : null}
        </View>

        {/* Checkbox — always shown */}
        <View style={isSelected ? styles.checkboxSelected : styles.checkbox}>
          {isSelected && <Check size={13} color="white" strokeWidth={3} />}
        </View>
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: ListItem, index: number): string => {
    if (item.kind === 'header') return `header-${index}`;
    return `user-${item.user.id}-${item.isSelected ? 'sel' : 'unsel'}`;
  };

  // ─── Group details screen ──────────────────────────────────────────────────
  if (view === 'group-details') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <ArrowLeft size={24} color="#e9edef" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Group</Text>
        </View>

        <View style={styles.groupDetailsContent}>
          <Text style={styles.groupMembersPreview}>
            {selectedUsers.map(u => u.profile?.displayName || u.phone).join(', ')}
          </Text>

          <TextInput
            style={styles.groupNameInput}
            placeholder="Group name"
            placeholderTextColor="#8696a0"
            value={groupName}
            onChangeText={setGroupName}
            autoFocus
            maxLength={50}
            returnKeyType="done"
            onSubmitEditing={() => void handleCreateGroup()}
          />

          <TouchableOpacity
            style={[styles.createGroupBtn, (!groupName.trim() || isSubmitting) && styles.createGroupBtnDisabled]}
            onPress={() => void handleCreateGroup()}
            disabled={!groupName.trim() || isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Check size={20} color="white" />
            )}
            <Text style={styles.createGroupBtnText}>Create Group</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── List screen ───────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <X size={24} color="#e9edef" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>New Chat</Text>
            {selectedUsers.length > 0 && (
              <Text style={styles.headerSubtitle}>{selectedUsers.length} selected</Text>
            )}
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <Search size={18} color="#8696a0" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name or phone number"
            placeholderTextColor="#8696a0"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching ? (
            <ActivityIndicator size="small" color="#8696a0" />
          ) : searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#8696a0" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* New Group row — hidden while searching */}
        {!searchQuery && (
          <TouchableOpacity
            style={styles.newGroupRow}
            onPress={() => setShowGroupHint(h => !h)}
            activeOpacity={0.7}
          >
            <View style={styles.newGroupIconCircle}>
              <Users size={22} color="white" />
            </View>
            <Text style={styles.newGroupRowText}>New Group</Text>
          </TouchableOpacity>
        )}

        {/* Hint banner */}
        {showGroupHint && selectedUsers.length < 2 && (
          <View style={styles.groupHintBanner}>
            <Users size={15} color="#00a884" />
            <Text style={styles.groupHintText}>
              Select 2 or more contacts to create a group
            </Text>
            <TouchableOpacity onPress={() => setShowGroupHint(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={14} color="#8696a0" />
            </TouchableOpacity>
          </View>
        )}

        {/* User list — always visible, no full-screen loader */}
        <FlatList<ListItem>
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            contacts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Users size={48} color="#2a3942" />
                <Text style={styles.emptyText}>No contacts yet</Text>
                <Text style={styles.emptySubtext}>Search to start a new chat</Text>
              </View>
            ) : null
          }
        />

        {/* Bottom action bar — appears when ≥1 user selected */}
        {selectedUsers.length > 0 && (
          <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {selectedUsers.length === 1 ? (
              <TouchableOpacity
                style={[styles.actionBtn, isSubmitting && styles.actionBtnDisabled]}
                onPress={() => void handleDirectMessage()}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <MessageSquare size={18} color="white" />
                )}
                <Text style={styles.actionBtnText}>Direct Message</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setView('group-details')}
                activeOpacity={0.8}
              >
                <Users size={18} color="white" />
                <Text style={styles.actionBtnText}>
                  Create Group ({selectedUsers.length} members)
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111b21',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#202c33',
  },
  backBtn: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e9edef',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8696a0',
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202c33',
    margin: 12,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: '#e9edef',
    fontSize: 15,
  },
  sectionHeader: {
    backgroundColor: '#1f2c34',
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  sectionHeaderText: {
    color: '#8696a0',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  listContent: {
    paddingBottom: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userItemSelected: {
    backgroundColor: '#182229',
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6a7f8a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 15,
    color: '#e9edef',
    marginBottom: 2,
  },
  userAbout: {
    fontSize: 13,
    color: '#8696a0',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#3b4a54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3942',
  },
  newGroupIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  newGroupRowText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#e9edef',
  },
  groupHintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#182229',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3942',
  },
  groupHintText: {
    flex: 1,
    fontSize: 13,
    color: '#8696a0',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#8696a0',
    fontSize: 16,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#8696a0',
    fontSize: 13,
    marginTop: 4,
  },
  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#202c33',
    borderTopWidth: 1,
    borderTopColor: '#2a3942',
  },
  actionBtn: {
    backgroundColor: '#00a884',
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnDisabled: {
    backgroundColor: '#2a3942',
  },
  actionBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  // ─── Group details screen ──────────────────────────────────────────────────
  groupDetailsContent: {
    flex: 1,
    padding: 24,
  },
  groupMembersPreview: {
    color: '#8696a0',
    fontSize: 13,
    marginBottom: 24,
    lineHeight: 18,
  },
  groupNameInput: {
    borderBottomWidth: 2,
    borderBottomColor: '#00a884',
    paddingVertical: 8,
    color: '#e9edef',
    fontSize: 18,
    marginBottom: 32,
  },
  createGroupBtn: {
    backgroundColor: '#00a884',
    borderRadius: 24,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createGroupBtnDisabled: {
    backgroundColor: '#2a3942',
  },
  createGroupBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
});
