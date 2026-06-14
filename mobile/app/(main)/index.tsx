import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../src/stores/authStore";
import { useChatStore } from "../../src/stores/chatStore";
import { chatApi } from "../../src/api";
import {
  User,
  Check,
  CheckCheck,
  Clock,
  Search,
  MessageSquarePlus,
  X,
} from "lucide-react-native";
import type { Chat } from "../../src/types";
import { ChatListSkeleton } from "../../components/common/SkeletonLoader";

export default function ChatsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { chats, setChats, setActiveChat, onlineUsers } = useChatStore();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const loadChats = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await chatApi.getChats();
      setChats(data);
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadChats(true);
  };

  const getChatName = (chat: Chat) => {
    if (chat.type === "direct") {
      const otherMember = chat.members.find((m) => m.userId !== user?.id);
      return otherMember?.user.profile?.displayName || "Unknown";
    }
    return chat.name || "Unknown Group";
  };

  const getChatAvatar = (chat: Chat) => {
    if (chat.type === "direct") {
      const otherMember = chat.members.find((m) => m.userId !== user?.id);
      return otherMember?.user.profile?.avatarUrl || null;
    }
    return chat.avatarUrl || null;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sending":
        return <Clock size={14} color="#8696a0" />;
      case "sent":
        return <Check size={14} color="#8696a0" />;
      case "delivered":
        return <CheckCheck size={14} color="#8696a0" />;
      case "read":
        return <CheckCheck size={14} color="#53bdeb" />;
      default:
        return <Check size={14} color="#8696a0" />;
    }
  };

  const handleChatSelect = (chat: Chat) => {
    setActiveChat(chat);
    router.push(`/(main)/chat/${chat.id}`);
  };

  // Filter chats by search query
  const filteredChats = chats.filter((chat) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (chat.type === "group") {
      return chat.name?.toLowerCase().includes(q);
    }
    const otherMember = chat.members.find((m) => m.userId !== user?.id);
    return otherMember?.user.profile?.displayName?.toLowerCase().includes(q);
  });

  const renderItem = ({ item: chat }: { item: Chat }) => {
    let isOnline = false;
    if (chat.type === "direct") {
      const otherMember = chat.members.find((m) => m.userId !== user?.id);
      if (otherMember) isOnline = onlineUsers.has(otherMember.userId);
    }
    const avatar = getChatAvatar(chat);

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => handleChatSelect(chat)}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <User size={24} color="#8696a0" />
            </View>
          )}
          {isOnline && <View style={styles.onlineIndicator} />}
        </View>

        {/* Content */}
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>
              {getChatName(chat)}
            </Text>
            {chat.lastMessage && (
              <Text
                style={[
                  styles.chatTime,
                  chat.unreadCount > 0 && styles.chatTimeUnread,
                ]}
              >
                {formatTime(chat.lastMessage.createdAt)}
              </Text>
            )}
          </View>

          <View style={styles.chatFooter}>
            <View style={styles.lastMessageContainer}>
              {chat.lastMessage ? (
                <>
                  {chat.lastMessage.senderId === user?.id && (
                    <View style={{ marginRight: 4 }}>
                      {getStatusIcon(chat.lastMessage.status)}
                    </View>
                  )}
                  <Text style={styles.lastMessageText} numberOfLines={1}>
                    {chat.lastMessage.senderId !== user?.id &&
                    chat.type === "group" &&
                    chat.lastMessage.senderName
                      ? `${chat.lastMessage.senderName}: `
                      : ""}
                    {chat.lastMessage.type === "missed_call" ||
                    chat.lastMessage.type === "call_log"
                      ? (() => {
                          let status = "missed";
                          let isVideo = false;
                          try {
                            if (
                              chat.lastMessage.content &&
                              chat.lastMessage.content.startsWith("{")
                            ) {
                              const parsed = JSON.parse(
                                chat.lastMessage.content,
                              );
                              status = parsed.status;
                              isVideo = parsed.isVideo;
                            }
                          } catch (e) {}

                          if (status === "ended") return `📞 Call ended`;
                          if (status === "rejected") return `🚫 Call rejected`;
                          if (chat.lastMessage.senderId === user?.id) {
                            return isVideo ? `📹 Video call` : `📞 Voice call`;
                          } else {
                            return isVideo
                              ? `📹 Missed video call`
                              : `📞 Missed voice call`;
                          }
                        })()
                      : chat.lastMessage.type === "audio"
                        ? `🎤 Voice message`
                        : chat.lastMessage.content ||
                          (chat.lastMessage.type !== "text"
                            ? `📎 ${chat.lastMessage.type}`
                            : "")}
                  </Text>
                </>
              ) : (
                <Text style={[styles.lastMessageText, { fontStyle: "italic" }]}>
                  No messages yet
                </Text>
              )}
            </View>

            {chat.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    // Use plain View + paddingTop from insets so the header background
    // fills all the way to the physical top of the screen (no white rectangle)
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ChitChat</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.push("/new-chat")}
        >
          <MessageSquarePlus size={22} color="#aebac1" />
        </TouchableOpacity>
      </View>

      <View style={styles.contentWrapper}>
        {/* Search Bar */}
        <View style={styles.searchWrapper}>
          <View
            style={[
              styles.searchBar,
              isSearchFocused && styles.searchBarFocused,
            ]}
          >
            {isSearchFocused || searchQuery ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  setIsSearchFocused(false);
                }}
                style={styles.searchIcon}
              >
                <X size={18} color="#00a884" />
              </TouchableOpacity>
            ) : (
              <View style={styles.searchIcon}>
                <Search size={18} color="#8696a0" />
              </View>
            )}
            <TextInput
              style={styles.searchInput}
              placeholder="Search chats…"
              placeholderTextColor="#8696a0"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => !searchQuery && setIsSearchFocused(false)}
              returnKeyType="search"
              clearButtonMode="never"
            />
          </View>
        </View>

        {/* Chat List */}
        {isLoading ? (
          <ChatListSkeleton count={9} />
        ) : filteredChats.length > 0 ? (
          <FlatList
            data={filteredChats}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 80 }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#00a884"
                colors={["#00a884"]}
              />
            }
          />
        ) : (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>
              {searchQuery
                ? `No chats matching "${searchQuery}"`
                : "No conversations yet"}
            </Text>
            {!searchQuery && (
              <Text style={styles.emptySubtext}>
                Tap the compose icon to start a new chat
              </Text>
            )}
          </View>
        )}

        {/* FAB */}
        <TouchableOpacity
          style={[styles.fab, { bottom: 24 + insets.bottom }]}
          onPress={() => router.push("/new-chat")}
          activeOpacity={0.85}
        >
          <MessageSquarePlus size={24} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#202c33", // header colour — fills all the way to top status bar
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: "#111b21",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "#111b21",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#202c33",
    // Removed borderBottom to make it flow seamlessly into the search bar or content
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#e9edef",
  },
  headerBtn: {
    padding: 4,
  },
  searchWrapper: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#111b21",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#202c33",
    borderRadius: 48,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 16,
    height: 54,
  },
  searchBarFocused: {
    borderColor: "#00a884",
  },
  searchIcon: {
    marginRight: 10,
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    flex: 1,
    color: "#e9edef",
    fontSize: 15,
  },
  chatItem: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2a3942",
  },
  avatarContainer: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2a3942",
    alignItems: "center",
    justifyContent: "center",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    backgroundColor: "#25d366",
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#111b21",
  },
  chatContent: {
    flex: 1,
    justifyContent: "center",
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#e9edef",
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 12,
    color: "#8696a0",
  },
  chatTimeUnread: {
    color: "#00a884",
    fontWeight: "500",
  },
  chatFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessageContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  lastMessageText: {
    fontSize: 14,
    color: "#8696a0",
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: "#25d366",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  emptyText: {
    color: "#8696a0",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtext: {
    color: "#4f6672",
    fontSize: 14,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#00a884",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#00a884",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
});
