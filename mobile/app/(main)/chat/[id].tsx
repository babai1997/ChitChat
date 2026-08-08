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
import { decryptMessagesInPlace } from '../../../src/services/e2eeSessions';
import { useSocketContext } from '../../../src/contexts/SocketProvider';
import { useCall } from '../../../src/contexts/CallContext';
import type { Message, Chat } from '../../../src/types';
import MessageBubble from '../../../components/chat/MessageBubble';
import ChatInput from '../../../components/chat/ChatInput';
import ChatInfoModal from '../../../components/chat/ChatInfoModal';
import ChatGalleryModal from '../../../components/chat/ChatGalleryModal';
import AddMemberModal from '../../../components/chat/AddMemberModal';
import GroupCreatedCard from '../../../components/chat/GroupCreatedCard';
import TypingIndicator from '../../../components/common/TypingIndicator';
import OnlineStatus from '../../../components/common/OnlineStatus';
import ActiveCallScreen from '../../../components/call/ActiveCallScreen';
import { MessageListSkeleton } from '../../../components/common/SkeletonLoader';
import { COLORS } from '../../../src/theme/colors';

const PAGE_SIZE = 50;

/**
 * Mutates `fetched` in place: for any message we already have locally
 * decrypted plaintext for, reuse it instead of re-decrypting — a Double
 * Ratchet message key is single-use, so re-decrypting an already-consumed
 * cipher (e.g. this same screen re-fetching page 1 on every focus) throws a
 * "nonce mismatch" error instead of just redundantly succeeding. Only
 * genuinely new-to-this-device messages get decrypted.
 */
async function resolveFetchedMessages(chatId: string, fetched: Message[]): Promise<void> {
  const existingById = new Map(
    (useChatStore.getState().messages[chatId] || []).map((m) => [m.id, m]),
  );
  const toDecrypt: Message[] = [];
  fetched.forEach((m) => {
    if (!m.isEncrypted) return; // plaintext content from the server is always the source of truth (e.g. edits)
    const prev = existingById.get(m.id);
    if (prev && prev.content !== null) {
      m.content = prev.content;
    } else {
      // Don't gate on `m.cipher` here — a device never gets a cipher for its
      // own sent messages (see resolveSessionsForMembers), so own messages
      // always have cipher: null. decryptMessagesInPlace already checks the
      // plaintext cache first (seeded at send time) and falls back to the
      // right placeholder when a cipher is genuinely missing/undecryptable —
      // skipping this push for cipher-less messages just left them blank.
      toDecrypt.push(m);
    }
  });
  if (toDecrypt.length > 0) {
    const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
    await decryptMessagesInPlace(toDecrypt, chat?.type === 'group' || chat?.type === 'meeting');
  }
}

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
  const [isGalleryVisible, setIsGalleryVisible] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);
  const [editText, setEditText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
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

  // "Jump to" a quoted message (see MessageBubble's onJumpToReply) — scroll
  // it into view and flash it briefly, WhatsApp-style. Only works for a
  // message currently loaded (matches "Load more messages" being a manual,
  // explicit action elsewhere in this screen, not something a tap should
  // silently trigger).
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

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
          await resolveFetchedMessages(chatId, data.messages);
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
      await resolveFetchedMessages(chatId, data.messages);
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
    setReplyingTo(null);
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
    setEditingMessage(null);
  };

  const handleCancelReply = () => setReplyingTo(null);

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

  const handleJumpToReply = (messageId: string) => {
    const index = getGroupedMessages().findIndex((item) => item.id === messageId);
    if (index === -1) return;
    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    setHighlightedMessageId(messageId);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedMessageId(null), 1500);
  };

  // FlatList can't scroll to an index it hasn't measured yet (common with
  // variable-height items) — retry once after a short delay, by which point
  // the list has usually rendered enough to have a real measurement for it.
  const handleScrollToIndexFailed = (info: { index: number }) => {
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
    }, 100);
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
        showSender={!isMine && (chat?.type === 'group' || chat?.type === 'meeting')}
        onEdit={isMine ? handleEdit : undefined}
        onDelete={handleDelete}
        onReply={handleReply}
        isHighlighted={item.id === highlightedMessageId}
        onJumpToReply={handleJumpToReply}
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
            <ArrowLeft size={24} color={COLORS.textPrimary} />
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
            <ArrowLeft size={24} color={COLORS.textPrimary} />
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
                <User size={20} color={COLORS.textSecondary} />
              </View>
            )}
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>{getChatName()}</Text>
              {otherMember && (
                <OnlineStatus userId={otherMember.userId} />
              )}
              {(chat.type === 'group' || chat.type === 'meeting') && (
                <Text style={styles.headerSubtitle}>
                  {chat.type === 'meeting' ? 'Meeting · ' : ''}{chat.members.length} {chat.type === 'meeting' ? 'participants' : 'members'}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            {chat.type !== 'meeting' && (
              <>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => handleStartCall('video')}
                >
                  <Video size={22} color={COLORS.textTertiary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => handleStartCall('audio')}
                >
                  <Phone size={20} color={COLORS.textTertiary} />
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => setShowActionSheet(true)}
            >
              <MoreVertical size={22} color={COLORS.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Ongoing call banner */}
        {(() => {
          if (chat.type === 'meeting') return null;
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
                  ? <Video size={16} color={COLORS.white} />
                  : <Phone size={16} color={COLORS.white} />}
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
              onScrollToIndexFailed={handleScrollToIndexFailed}
              ListFooterComponent={
                isLoadingMore ? (
                  <ActivityIndicator size="small" color={COLORS.textSecondary} style={{ padding: 16 }} />
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
        <ChatInput
          chatId={chatId}
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
        />
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
                {chat?.type === 'meeting' ? 'Meeting Info' : chat?.type === 'group' ? 'Group Info' : 'Contact Info'}
              </Text>
            </TouchableOpacity>
            {(chat?.type === 'group' || chat?.type === 'meeting') && isCurrentUserAdmin && (
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
              <Text style={[styles.actionSheetItemText, { color: COLORS.textSecondary }]}>Cancel</Text>
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
        onOpenGallery={() => { setIsInfoModalVisible(false); setIsGalleryVisible(true); }}
      />

      {/* Media, links and docs */}
      {chat && (
        <ChatGalleryModal
          chat={chat}
          visible={isGalleryVisible}
          onClose={() => setIsGalleryVisible(false)}
          onJumpToMessage={(messageId) => {
            setIsGalleryVisible(false);
            setTimeout(() => handleJumpToReply(messageId), 300);
          }}
        />
      )}

      {/* Add Member Modal */}
      {(chat?.type === 'group' || chat?.type === 'meeting') && chat && (
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
              placeholderTextColor={COLORS.textSecondary}
              selectionColor={COLORS.accent}
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
    backgroundColor: COLORS.surface,
  },
  innerContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
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
    backgroundColor: COLORS.border,
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
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.bgDeepest,
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
    backgroundColor: COLORS.bgDeepest,
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
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.surfaceHover,
    borderRadius: 16,
    padding: 20,
  },
  editTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  editInput: {
    backgroundColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    color: COLORS.textPrimary,
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
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  editSave: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
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
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    overflow: 'hidden',
  },
  actionSheetItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  actionSheetCancel: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  actionSheetItemText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  ongoingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.accent,
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
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 13,
  },
  ongoingBannerSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 1,
  },
});
