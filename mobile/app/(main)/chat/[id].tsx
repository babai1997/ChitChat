import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Image,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Phone, Video, MoreVertical, User } from 'lucide-react-native';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useChatStore } from '../../../src/stores/chatStore';
import { useAuthStore } from '../../../src/stores/authStore';
import { chatApi } from '../../../src/api';
import { useSocketContext } from '../../../src/contexts/SocketProvider';
import { useCall } from '../../../src/contexts/CallContext';
import type { Message, Chat } from '../../../src/types';
import MessageBubble from '../../../components/chat/MessageBubble';
import ChatInput from '../../../components/chat/ChatInput';
import ChatInfoModal from '../../../components/chat/ChatInfoModal';
import AddMemberModal from '../../../components/chat/AddMemberModal';
import GroupCreatedCard from '../../../components/chat/GroupCreatedCard';
import TypingIndicator from '../../../components/common/TypingIndicator';
import OnlineStatus from '../../../components/common/OnlineStatus';
import ActiveCallScreen from '../../../components/call/ActiveCallScreen';
import { MessageListSkeleton } from '../../../components/common/SkeletonLoader';

const PAGE_SIZE = 50;

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams();
  const chatId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  const { user } = useAuthStore();
  const { chats, messages, messageHasMore, setMessages, prependMessages, typingUsers, onlineUsers, setActiveChat } = useChatStore();
  const { joinChat, leaveChat, markAsRead, deleteMessage, editMessage } = useSocketContext();
  const { isCallActive, activeChatId, callType, startCall, ongoingCallsByChatId, joinOngoingCall, callStatus } = useCall();

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [androidKeyboardOffset, setAndroidKeyboardOffset] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardOffset(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardOffset(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const flatListRef = useRef<FlatList>(null);
  const nextCursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);

  const chat = chats.find((c) => c.id === chatId);
  const chatMessages = messages[chatId] || [];
  const isCurrentUserAdmin = chat?.members.find(m => m.userId === user?.id)?.role === 'admin';

  // Typing users names
  const typingUserIds = typingUsers[chatId] || [];
  const typingNames = typingUserIds
    .filter((uid) => uid !== user?.id)
    .map((uid) => {
      const member = chat?.members.find((m) => m.userId === uid);
      return member?.user.profile?.displayName || 'Someone';
    });

  // Other member for direct chats (for online status)
  const otherMember = chat?.type === 'direct'
    ? chat.members.find((m) => m.userId !== user?.id)
    : null;

  const isFocused = useIsFocused();

  // useFocusEffect so cleanup (setActiveChat null, leaveChat) fires on blur,
  // not just on unmount — Tabs keeps this screen mounted in the background.
  useFocusEffect(
    useCallback(() => {
      if (!chatId) return;

      joinChat(chatId);
      if (chat) setActiveChat(chat);

      const loadMessages = async () => {
        try {
          const data = await chatApi.getMessages(chatId, undefined, PAGE_SIZE);
          setMessages(chatId, data.messages);
          nextCursorRef.current = data.nextCursor;
          hasMoreRef.current = data.hasMore;

          const unreadIds = data.messages
            .filter((m) => m.senderId !== user?.id && m.status !== 'read')
            .map((m) => m.id);
          markAsRead(chatId, unreadIds);
        } catch (error) {
          console.error('Failed to load messages:', error);
        } finally {
          setIsLoading(false);
        }
      };

      loadMessages();

      return () => {
        setActiveChat(null);
        leaveChat(chatId);
      };
    }, [chatId]),
  );

  // Mark incoming messages as read only while this screen is focused.
  // Without the isFocused guard the Tabs layout keeps this screen mounted
  // in the background, so markAsRead fires for messages the user hasn't seen.
  useEffect(() => {
    if (!isFocused) return;
    const unreadIds = chatMessages
      .filter((m) => m.senderId !== user?.id && m.status !== 'read')
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      markAsRead(chatId, unreadIds);
    }
  }, [chatMessages.length, isFocused]);

  const loadMoreMessages = useCallback(async () => {
    const canLoadMore = hasMoreRef.current || (messageHasMore[chatId] ?? false);
    if (isLoadingMore || !canLoadMore || !nextCursorRef.current) return;
    setIsLoadingMore(true);
    try {
      const data = await chatApi.getMessages(chatId, nextCursorRef.current, PAGE_SIZE);
      prependMessages(chatId, data.messages);
      nextCursorRef.current = data.nextCursor;
      hasMoreRef.current = data.hasMore;
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatId, isLoadingMore]);

  const getChatName = () => {
    if (!chat) return 'Unknown';
    if (chat.type === 'direct') {
      return otherMember?.user.profile?.displayName || 'Unknown';
    }
    return chat.name || 'Group Chat';
  };

  const getChatAvatar = () => {
    if (!chat) return null;
    if (chat.type === 'direct') {
      return otherMember?.user.profile?.avatarUrl || null;
    }
    return chat.avatarUrl || null;
  };

  const handleEdit = (messageId: string, currentContent: string) => {
    setEditingMessage({ id: messageId, content: currentContent });
    setEditText(currentContent);
  };

  const handleEditSubmit = () => {
    if (!editingMessage || !editText.trim()) return;
    editMessage(chatId, editingMessage.id, editText.trim());
    setEditingMessage(null);
    setEditText('');
  };

  const handleDelete = (messageId: string, deleteForEveryone: boolean) => {
    deleteMessage(chatId, messageId, deleteForEveryone);
  };

  const handleStartCall = (type: 'audio' | 'video') => {
    startCall(chatId, type);
  };

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  };

  const getGroupedMessages = () => {
    const messagesOldestFirst = [...chatMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    const grouped: any[] = [];
    let lastDateStr = '';

    messagesOldestFirst.forEach(msg => {
      const dateStr = formatMessageDate(msg.createdAt);
      if (dateStr && dateStr !== lastDateStr) {
        grouped.push({ id: `date-${msg.id}-${dateStr}`, type: 'date_separator', date: dateStr });
        lastDateStr = dateStr;
      }
      grouped.push(msg);
    });

    // Reverse for inverted FlatList (newest at index 0)
    return grouped.reverse();
  };

  const renderMessageItem = ({ item }: { item: any }) => {
    if (item.type === 'date_separator') {
      return (
        <View style={styles.dateSeparatorContainer}>
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{item.date}</Text>
          </View>
        </View>
      );
    }
    
    const isMine = item.senderId === user?.id;
    return (
      <MessageBubble
        message={item}
        isOwn={isMine}
        showSender={!isMine && chat?.type === 'group'}
        onEdit={isMine ? handleEdit : undefined}
        onDelete={handleDelete}
      />
    );
  };

  // If there's an active call for THIS chat, show the call screen
  if (isCallActive && activeChatId === chatId) {
    return (
      <ActiveCallScreen
        chatName={getChatName()}
        chatAvatar={getChatAvatar() || undefined}
      />
    );
  }

  if (!chat) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color="#e9edef" />
          </TouchableOpacity>
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Chat not found</Text>
        </View>
      </View>
    );
  }

  const avatar = getChatAvatar();

  return (
    // Outer fills full screen and provides header background behind the status bar
    <View style={[styles.container, Platform.OS === 'android' && { paddingBottom: androidKeyboardOffset }]}>
      <KeyboardAvoidingView
        style={styles.innerContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header — inside KAV so it stays pinned at top when keyboard opens */}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color="#e9edef" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerProfileInfo}
            onPress={() => setIsInfoModalVisible(true)}
            activeOpacity={0.7}
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <User size={20} color="#8696a0" />
              </View>
            )}
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>{getChatName()}</Text>
              {otherMember && (
                <OnlineStatus userId={otherMember.userId} />
              )}
              {chat.type === 'group' && (
                <Text style={styles.headerSubtitle}>
                  {chat.members.length} members
                </Text>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => handleStartCall('video')}
            >
              <Video size={22} color="#aebac1" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => handleStartCall('audio')}
            >
              <Phone size={20} color="#aebac1" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => setShowActionSheet(true)}
            >
              <MoreVertical size={22} color="#aebac1" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Ongoing call banner */}
        {(() => {
          const ongoing = ongoingCallsByChatId.get(chatId);
          if (!ongoing || callStatus !== 'idle') return null;
          return (
            <TouchableOpacity
              onPress={() => joinOngoingCall(chatId, ongoing.type)}
              style={styles.ongoingBanner}
              activeOpacity={0.85}
            >
              <View style={styles.ongoingBannerIcon}>
                {ongoing.type === 'video'
                  ? <Video size={16} color="#fff" />
                  : <Phone size={16} color="#fff" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ongoingBannerTitle}>
                  {ongoing.type === 'video' ? 'Ongoing video call' : 'Ongoing voice call'}
                </Text>
                <Text style={styles.ongoingBannerSub}>
                  {ongoing.participantCount} participant{ongoing.participantCount !== 1 ? 's' : ''} · Tap to join
                </Text>
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* Messages */}
        <View style={styles.content}>
          {isLoading ? (
            <MessageListSkeleton />
          ) : (
            <FlatList
              ref={flatListRef}
              data={getGroupedMessages()}
              inverted
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => (item as any).tempId || item.id}
              renderItem={renderMessageItem}
              contentContainerStyle={styles.messagesList}
              onEndReached={loadMoreMessages}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                isLoadingMore ? (
                  <ActivityIndicator size="small" color="#8696a0" style={{ padding: 16 }} />
                ) : !hasMoreRef.current && chat?.type === 'group' ? (
                  <GroupCreatedCard
                    chat={chat}
                    currentUserId={user?.id}
                    onAddMember={() => setShowAddMember(true)}
                  />
                ) : null
              }
            />
          )}
        </View>

        {/* Typing indicator */}
        {typingNames.length > 0 && (
          <TypingIndicator names={typingNames} />
        )}

        {/* Input Area */}
        <ChatInput chatId={chatId} />
      </KeyboardAvoidingView>

      {/* Action Sheet */}
      <Modal
        visible={showActionSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionSheet(false)}
      >
        <Pressable style={styles.actionSheetOverlay} onPress={() => setShowActionSheet(false)}>
          <View style={styles.actionSheetContainer}>
            <TouchableOpacity
              style={styles.actionSheetItem}
              onPress={() => { setShowActionSheet(false); setIsInfoModalVisible(true); }}
            >
              <Text style={styles.actionSheetItemText}>
                {chat?.type === 'group' ? 'Group Info' : 'Contact Info'}
              </Text>
            </TouchableOpacity>
            {chat?.type === 'group' && isCurrentUserAdmin && (
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => { setShowActionSheet(false); setShowAddMember(true); }}
              >
                <Text style={styles.actionSheetItemText}>Add Member</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionSheetItem, styles.actionSheetCancel]}
              onPress={() => setShowActionSheet(false)}
            >
              <Text style={[styles.actionSheetItemText, { color: '#8696a0' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Chat Info Modal */}
      <ChatInfoModal
        visible={isInfoModalVisible}
        onClose={() => setIsInfoModalVisible(false)}
        chat={chat || null}
        currentUserId={user?.id}
        onAddMember={isCurrentUserAdmin ? () => { setIsInfoModalVisible(false); setShowAddMember(true); } : undefined}
      />

      {/* Add Member Modal */}
      {chat?.type === 'group' && chat && (
        <AddMemberModal
          visible={showAddMember}
          onClose={() => setShowAddMember(false)}
          chat={chat}
        />
      )}

      {/* Edit Message Modal */}
      <Modal
        visible={!!editingMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMessage(null)}
      >
        <Pressable style={styles.editOverlay} onPress={() => setEditingMessage(null)}>
          <Pressable style={styles.editCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.editTitle}>Edit message</Text>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              placeholderTextColor="#8696a0"
              selectionColor="#00a884"
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editCancel}
                onPress={() => setEditingMessage(null)}
              >
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editSave, !editText.trim() && { opacity: 0.4 }]}
                onPress={handleEditSubmit}
                disabled={!editText.trim()}
              >
                <Text style={styles.editSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#202c33',
  },
  innerContainer: {
    flex: 1,
    backgroundColor: '#202c33',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    backgroundColor: '#202c33',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a3942',
  },
  backButton: {
    padding: 10,
    marginRight: 2,
  },
  headerProfileInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
  },
  headerAvatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2a3942',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e9edef',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8696a0',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionBtn: {
    padding: 10,
  },
  content: {
    flex: 1,
    backgroundColor: '#0b141a',
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  dateSeparatorContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateSeparator: {
    backgroundColor: '#182229',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  dateSeparatorText: {
    color: '#8696a0',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    color: '#8696a0',
    fontSize: 16,
  },
  // Edit modal
  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  editCard: {
    width: '100%',
    backgroundColor: '#233138',
    borderRadius: 16,
    padding: 20,
  },
  editTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#e9edef',
    marginBottom: 16,
  },
  editInput: {
    backgroundColor: '#2a3942',
    borderRadius: 10,
    padding: 12,
    color: '#e9edef',
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  editCancel: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  editCancelText: {
    color: '#8696a0',
    fontSize: 15,
    fontWeight: '500',
  },
  editSave: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#00a884',
  },
  editSaveText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheetContainer: {
    backgroundColor: '#202c33',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    overflow: 'hidden',
  },
  actionSheetItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3942',
  },
  actionSheetCancel: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  actionSheetItemText: {
    fontSize: 16,
    color: '#e9edef',
  },
  ongoingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#00a884',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ongoingBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ongoingBannerTitle: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  ongoingBannerSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 1,
  },
});
