import { useState, useEffect } from 'react';
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
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, User, Users, ChevronRight } from 'lucide-react-native';
import { useAuthStore } from '../src/stores/authStore';
import { usersApi, chatApi } from '../src/api';
import type { Profile, Chat, UserWithProfile } from '../src/types';

import { useChatStore } from '../src/stores/chatStore';
import { useRouter } from 'expo-router';

export default function NewChatScreen() {
  const { user } = useAuthStore();
  const { chats, setChats } = useChatStore();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<UserWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserWithProfile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const insets = useSafeAreaInsets();



  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsLoading(true);
        try {
          const results = await usersApi.searchUsers(searchQuery);
          // Filter out current user
          setUsers(results.filter(p => p.id !== user?.id));
        } catch (error) {
          console.error('Failed to search users:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setUsers([]);
      }
    }, 500);

    return () => clearTimeout(searchTimeout);
  }, [searchQuery, user?.id]);

  const handleUserSelect = async (selectedUser: UserWithProfile) => {
    if (isCreatingGroup) {
      // Toggle selection for group
      const isSelected = selectedUsers.find(u => u.id === selectedUser.id);
      if (isSelected) {
        setSelectedUsers(prev => prev.filter(u => u.id !== selectedUser.id));
      } else {
        setSelectedUsers(prev => [...prev, selectedUser]);
      }
    } else {
      // Create direct chat
      setIsSubmitting(true);
      try {
        const chat = await chatApi.createDirectChat(selectedUser.id);
        setChats([chat, ...chats.filter(c => c.id !== chat.id)]);
        router.replace(`/(main)/chat/${chat.id}`);
      } catch (error) {
        console.error('Failed to create chat:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;
    
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

  const renderUserItem = ({ item }: { item: UserWithProfile }) => {
    const isSelected = selectedUsers.find(u => u.id === item.id);

    return (
      <TouchableOpacity 
        style={styles.userItem} 
        onPress={() => handleUserSelect(item)}
      >
        <View style={styles.avatarContainer}>
          {item.profile?.avatarUrl ? (
            <Image source={{ uri: item.profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {item.profile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.profile?.displayName || item.phone || 'Unknown User'}</Text>
          {item.profile?.about ? (
            <Text style={styles.userAbout} numberOfLines={1}>{item.profile.about}</Text>
          ) : null}
        </View>
        
        {isCreatingGroup && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <X size={14} color="white" />}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
                <X size={24} color="#e9edef" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>
                {isCreatingGroup ? 'New group' : 'New chat'}
              </Text>
            </View>
          </View>
          
          <View style={styles.contentWrapper}>
            {isCreatingGroup && (
            <View style={styles.groupSetupContainer}>
              <TextInput
                style={styles.groupInput}
                placeholder="Group subject"
                placeholderTextColor="#8696a0"
                value={groupName}
                onChangeText={setGroupName}
                maxLength={25}
              />
              <Text style={styles.selectionText}>
                {selectedUsers.length} selected
              </Text>
            </View>
          )}

          {/* Search */}
          <View style={styles.searchContainer}>
            <Search size={20} color="#8696a0" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name or phone number"
              placeholderTextColor="#8696a0"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* New Group Button (only if not already creating group and no search query) */}
          {!isCreatingGroup && !searchQuery && (
            <TouchableOpacity 
              style={styles.newGroupBtn} 
              onPress={() => setIsCreatingGroup(true)}
            >
              <View style={styles.newGroupIcon}>
                <Users size={20} color="white" />
              </View>
              <Text style={styles.newGroupText}>New group</Text>
            </TouchableOpacity>
          )}

          {/* Results list */}
          {isLoading ? (
            <ActivityIndicator size="large" color="#00a884" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={users}
              keyExtractor={(item) => item.id}
              renderItem={renderUserItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={() => (
                searchQuery.length >= 2 ? (
                  <Text style={styles.emptyText}>No users found</Text>
                ) : null
              )}
            />
          )}

          {/* Floating Action Button for Group Creation */}
          {isCreatingGroup && selectedUsers.length > 0 && groupName.trim().length > 0 && (
            <TouchableOpacity 
              style={styles.fab} 
              onPress={handleCreateGroup}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <ChevronRight size={28} color="white" />
              )}
            </TouchableOpacity>
          )}
          </View>
      </KeyboardAvoidingView>
      
      {/* Loading Overlay for Direct Chat Creation */}
      {isSubmitting && !isCreatingGroup && (
        <View style={StyleSheet.absoluteFillObject}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#00a884" />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#202c33',
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: '#111b21',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#202c33',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeBtn: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e9edef',
  },
  groupSetupContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#202c33',
  },
  groupInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#00a884',
    paddingVertical: 8,
    color: '#e9edef',
    fontSize: 16,
    marginBottom: 8,
  },
  selectionText: {
    color: '#8696a0',
    fontSize: 13,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202c33',
    margin: 16,
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
    fontSize: 16,
  },
  newGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  newGroupIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  newGroupText: {
    fontSize: 16,
    color: '#e9edef',
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 80,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6a7f8a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 16,
    color: '#e9edef',
    marginBottom: 4,
  },
  userAbout: {
    fontSize: 14,
    color: '#8696a0',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#8696a0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#00a884',
    borderColor: '#00a884',
  },
  emptyText: {
    color: '#8696a0',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
