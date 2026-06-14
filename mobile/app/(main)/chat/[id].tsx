import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Phone, Video, MoreVertical, User } from 'lucide-react-native';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useChatStore } from '../../../src/stores/chatStore';
import { useAuthStore } from '../../../src/stores/authStore';
import { chatApi } from '../../../src/api';
import { useSocketContext } from '../../../src/contexts/SocketProvider';
import { useCall } from '../../../src/contexts/CallContext';
import type { Message, Chat } from '../../../src/types';
import MessageBubble from '../../../components/chat/MessageBubble';
import ChatInput from '../../../components/chat/ChatInput';
import ChatInfoModal from '../../../components/chat/ChatInfoModal';
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
  const { chats, messages, setMessages, prependMessages, typingUsers, onlineUsers } = useChatStore();
  const { joinChat, leaveChat, markAsRead, deleteMessage, editMessage } = useSocketContext();
  const { isCallActive, activeChatId, callType, startCall } = useCall();

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);
  const [editText, setEditText] = useState('');
  const insets = useSafeAreaInsets();

  const flatListRef = useRef<FlatList>(null);
  const nextCursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);

  const chat = chats.find((c) => c.id === chatId);
  const chatMessages = messages[chatId] || [];

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

  useEffect(() => {
    if (!chatId) return;

    joinChat(chatId);

    const loadMessages = async () => {
      try {
        const data = await chatApi.getMessages(chatId, undefined, PAGE_SIZE);
        setMessages(chatId, data.messages);
        nextCursorRef.current = data.nextCursor;
        hasMoreRef.current = data.hasMore;

        // Mark all as read
        if (data.messages.length > 0) {
          const unreadIds = data.messages
            .filter((m) => m.senderId !== user?.id && m.status !== 'read')
            .map((m) => m.id);
          if (unreadIds.length > 0) markAsRead(chatId, unreadIds);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();

    return () => {
      leaveChat(chatId);
    };
  }, [chatId]);

  // Mark incoming messages as read when chat is focused
  useEffect(() => {
    const unreadIds = chatMessages
      .filter((m) => m.senderId !== user?.id && m.status !== 'read')
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      markAsRead(chatId, unreadIds);
    }
  }, [chatMessages.length]);

  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreRef.current || !nextCursorRef.current) return;
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
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
            {/* Online status for direct chats */}
            {otherMember && (
              <OnlineStatus userId={otherMember.userId} />
            )}
            {/* Member count for groups */}
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
            onPress={() => setIsInfoModalVisible(true)}
          >
            <MoreVertical size={22} color="#aebac1" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages + Input */}
      <View style={styles.innerContainer}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.content}>
            {isLoading ? (
              <MessageListSkeleton />
            ) : (
              <FlatList
                ref={flatListRef}
                data={getGroupedMessages()}
                inverted
                keyExtractor={(item) => item.id}
                renderItem={renderMessageItem}
                contentContainerStyle={styles.messagesList}
                onEndReached={loadMoreMessages}
                onEndReachedThreshold={0.3}
                ListFooterComponent={
                  isLoadingMore ? (
                    <ActivityIndicator size="small" color="#8696a0" style={{ padding: 16 }} />
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
      </View>

      {/* Chat Info Modal */}
      <ChatInfoModal
        visible={isInfoModalVisible}
        onClose={() => setIsInfoModalVisible(false)}
        chat={chat || null}
        currentUserId={user?.id}
      />

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
    backgroundColor: '#202c33', // Matches header so the top safe area is filled
  },
  innerContainer: {
    flex: 1,
    backgroundColor: '#0b141a', // The actual chat background color
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
});
