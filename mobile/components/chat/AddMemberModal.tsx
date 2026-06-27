import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  FlatList, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Search, User, Users, Check, UserPlus } from 'lucide-react-native';
import { usersApi, chatApi } from '../../src/api';
import { useChatStore } from '../../src/stores/chatStore';
import { useAuthStore } from '../../src/stores/authStore';
import type { Chat, Profile, UserWithProfile } from '../../src/types';

type ListItem =
  | { kind: 'header'; label: string }
  | { kind: 'user'; user: UserWithProfile; isSelected: boolean };

interface AddMemberModalProps {
  visible: boolean;
  onClose: () => void;
  chat: Chat;
}

function profileToUserWithProfile(member: Chat['members'][number]): UserWithProfile {
  return {
    id: member.userId,
    phone: member.user.phone,
    email: member.user.email,
    isVerified: false,
    lastSeen: null,
    profile: member.user.profile as Profile | null,
  };
}

export default function AddMemberModal({ visible, onClose, chat }: AddMemberModalProps) {
  const { user } = useAuthStore();
  const allChats = useChatStore(s => s.chats);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserWithProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserWithProfile[]>([]);

  const existingMemberIds = new Set(chat.members.map(m => m.userId));

  // Contacts from direct chats not already in this group
  const contacts: UserWithProfile[] = allChats
    .filter(c => c.type === 'direct')
    .flatMap(c => {
      const other = c.members.find(m => m.userId !== user?.id);
      if (!other || existingMemberIds.has(other.userId)) return [];
      return [profileToUserWithProfile(other)];
    });

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setSearchResults([]);
      setSelectedUsers([]);
    }
  }, [visible]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setIsSearching(true);
        try {
          const results = await usersApi.searchUsers(query);
          setSearchResults(results.filter(u => u.id !== user?.id && !existingMemberIds.has(u.id)));
        } catch (err) {
          console.error('Search failed:', err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, user?.id]);

  const filteredContacts = contacts.filter(c => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (c.profile?.displayName?.toLowerCase() ?? '').includes(q)
      || (c.phone?.toLowerCase() ?? '').includes(q);
  });

  const contactIds = new Set(contacts.map(c => c.id));
  const selectedIds = new Set(selectedUsers.map(u => u.id));
  const novelSearchResults = searchResults.filter(u => !contactIds.has(u.id));

  const buildListData = useCallback((): ListItem[] => {
    const items: ListItem[] = [];

    if (selectedUsers.length > 0) {
      items.push({ kind: 'header', label: 'Selected' });
      for (const u of selectedUsers) items.push({ kind: 'user', user: u, isSelected: true });
    }

    const unselectedContacts = filteredContacts.filter(c => !selectedIds.has(c.id));
    items.push({ kind: 'header', label: query.trim() ? `Contacts (${unselectedContacts.length})` : 'Contacts' });
    for (const u of unselectedContacts) items.push({ kind: 'user', user: u, isSelected: false });

    const novelUnselected = novelSearchResults.filter(u => !selectedIds.has(u.id));
    if (query.trim().length >= 2 && novelUnselected.length > 0) {
      items.push({ kind: 'header', label: 'Search results' });
      for (const u of novelUnselected) items.push({ kind: 'user', user: u, isSelected: false });
    }

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUsers, filteredContacts, novelSearchResults, query]);

  const listData = buildListData();

  const toggleUser = (u: UserWithProfile) => {
    if (selectedIds.has(u.id)) {
      setSelectedUsers(prev => prev.filter(p => p.id !== u.id));
    } else {
      setSelectedUsers(prev => [...prev, u]);
    }
  };

  const handleAdd = async () => {
    if (selectedUsers.length === 0 || isAdding) return;
    setIsAdding(true);
    try {
      await Promise.all(selectedUsers.map(u => chatApi.addMember(chat.id, u.id)));
      const updatedChat = await chatApi.getChat(chat.id);
      const { chats, setChats, activeChat, setActiveChat } = useChatStore.getState();
      setChats(chats.map(c => c.id === updatedChat.id ? updatedChat : c));
      if (activeChat?.id === updatedChat.id) setActiveChat(updatedChat);
      onClose();
    } catch (err) {
      console.error('Failed to add members:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if (item.kind === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
        </View>
      );
    }
    const { user: u, isSelected } = item;
    return (
      <TouchableOpacity
        key={`${u.id}-${index}`}
        style={[styles.userRow, isSelected && styles.userRowSelected]}
        onPress={() => toggleUser(u)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          {u.profile?.avatarUrl
            ? <Image source={{ uri: u.profile.avatarUrl }} style={styles.avatarImg} />
            : <View style={styles.avatarPlaceholder}><User size={20} color="#8696a0" /></View>
          }
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{u.profile?.displayName || u.phone || 'Unknown'}</Text>
          <Text style={styles.userAbout} numberOfLines={1}>{u.profile?.about || 'Hey there! I am using ChitChat'}</Text>
        </View>
        <View style={isSelected ? styles.checkboxSelected : styles.checkbox}>
          {isSelected && <Check size={13} color="white" strokeWidth={3} />}
        </View>
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: ListItem, index: number) =>
    item.kind === 'header' ? `h-${index}` : `u-${item.user.id}-${item.isSelected}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={24} color="#e9edef" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Add Member</Text>
            {selectedUsers.length > 0 && (
              <Text style={styles.headerSubtitle}>{selectedUsers.length} selected</Text>
            )}
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Search size={18} color="#8696a0" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name or phone"
            placeholderTextColor="#8696a0"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching
            ? <ActivityIndicator size="small" color="#8696a0" />
            : query.length > 0
              ? <TouchableOpacity onPress={() => setQuery('')}><X size={16} color="#8696a0" /></TouchableOpacity>
              : null
          }
        </View>

        {/* List */}
        <FlatList<ListItem>
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            contacts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Users size={48} color="#2a3942" />
                <Text style={styles.emptyText}>No contacts to add</Text>
                <Text style={styles.emptySubtext}>All contacts are already in this group</Text>
              </View>
            ) : null
          }
        />

        {/* Add button */}
        {selectedUsers.length > 0 && (
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={[styles.addBtn, isAdding && styles.addBtnDisabled]}
              onPress={() => void handleAdd()}
              disabled={isAdding}
              activeOpacity={0.8}
            >
              {isAdding
                ? <ActivityIndicator color="white" size="small" />
                : <UserPlus size={18} color="white" />
              }
              <Text style={styles.addBtnText}>
                {`Add ${selectedUsers.length === 1 ? '1 Member' : `${selectedUsers.length} Members`}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111b21' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#202c33',
    borderBottomWidth: 1, borderBottomColor: '#2a3942',
  },
  closeBtn: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#e9edef' },
  headerSubtitle: { fontSize: 12, color: '#8696a0', marginTop: 2 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#202c33', margin: 12,
    borderRadius: 8, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: '#e9edef', fontSize: 15 },
  sectionHeader: { backgroundColor: '#1f2c34', paddingHorizontal: 16, paddingVertical: 5 },
  sectionHeaderText: { color: '#8696a0', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  listContent: { paddingBottom: 16 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  userRowSelected: { backgroundColor: '#182229' },
  avatar: { marginRight: 14 },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  avatarPlaceholder: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#2a3942', alignItems: 'center', justifyContent: 'center' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, color: '#e9edef', marginBottom: 2 },
  userAbout: { fontSize: 13, color: '#8696a0' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#3b4a54', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#00a884', alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyText: { color: '#8696a0', fontSize: 16, marginTop: 16 },
  emptySubtext: { color: '#8696a0', fontSize: 13, marginTop: 4, textAlign: 'center' },
  actionBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, backgroundColor: '#202c33', borderTopWidth: 1, borderTopColor: '#2a3942' },
  addBtn: { backgroundColor: '#00a884', borderRadius: 24, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addBtnDisabled: { backgroundColor: '#2a3942' },
  addBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
});
