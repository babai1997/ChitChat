import * as Linking from "expo-linking";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  FlatList,
  Alert,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useChatStore } from "../../src/stores/chatStore";
import { useAuthStore } from "../../src/stores/authStore";
import { chatApi } from "../../src/api";
import {
  Check,
  CheckCheck,
  Clock,
  FileText,
  Trash2,
  Edit2,
  Ban,
  Video,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  X,
  Forward,
  Download,
  Reply,
} from "lucide-react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Message } from "../../src/types";
import AudioPlayer from "./AudioPlayer";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender?: boolean;
  onEdit?: (messageId: string, currentContent: string) => void;
  onDelete?: (messageId: string, deleteForEveryone: boolean) => void;
  onReply?: (message: Message) => void;
}

// ── Palette ──────────────────────────────────────────────────────────────────
const OWN_BG = "#0a7260"; // richer teal-green (more vibrant than WhatsApp's #005c4b)
const THEIR_BG = "#1e2c35"; // deep blue-grey (warmer than #202c33)
const OWN_TEXT = "#e9f8f5"; // slightly green-tinted white
const THEIR_TEXT = "#e9edef";
const TIME_COLOR = "rgba(233,237,239,0.6)";
const READ_TICK = "#7edcf5"; // sky-blue for read ticks

export default function MessageBubble({
  message,
  isOwn,
  showSender,
  onEdit,
  onDelete,
  onReply,
}: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showForward, setShowForward] = useState(false);
  const { chats } = useChatStore();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();

  const handleDownload = async () => {
    if (!selectedImage) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "We need permission to save to your gallery.",
        );
        return;
      }

      const filename = selectedImage.split("/").pop() || "download.jpg";
      const file = await FileSystem.File.downloadFileAsync(
        selectedImage,
        new FileSystem.File(FileSystem.Paths.document, filename),
      );
      const uri = file.uri;
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("Success", "Image saved to gallery!");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not download image.");
    }
  };

  const handleForward = async (chatId: string) => {
    try {
      const attachment = message.attachments?.[0];
      if (!attachment) return;

      await chatApi.sendMessage(
        chatId,
        message.content,
        message.type,
        undefined,
        [
          {
            filename: attachment.filename,
            url: attachment.url,
            mimetype: attachment.mimeType,
            size: attachment.size,
          },
        ],
      );
      Alert.alert("Forwarded", "Message forwarded successfully!");
      setShowForward(false);
      setSelectedImage(null);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not forward message.");
    }
  };

  const formatTime = (d: string) => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return dt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const Tick = () => {
    switch (message.status) {
      case "sending":
        return <Clock size={11} color={TIME_COLOR} />;
      case "sent":
        return <Check size={13} color={TIME_COLOR} />;
      case "delivered":
        return <CheckCheck size={13} color={TIME_COLOR} />;
      case "read":
        return <CheckCheck size={13} color={READ_TICK} />;
      default:
        return <Clock size={11} color={TIME_COLOR} />;
    }
  };

  /** Timestamp row — absolutely anchored to bottom-right of the bubble */
  const Meta = ({ standalone = false }: { standalone?: boolean }) => (
    <View style={[styles.metaRow, standalone && styles.metaStandalone]}>
      {message.isEdited && <Text style={styles.editedLabel}>Edited </Text>}
      <Text style={styles.timeText}>{formatTime(message.createdAt)}</Text>
      {isOwn && (
        <View style={{ marginLeft: 3 }}>
          <Tick />
        </View>
      )}
    </View>
  );

  // ── Deleted ─────────────────────────────────────────────────────────────────
  if (message.isDeleted) {
    return (
      <Wrapper isOwn={isOwn}>
        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleTheirs,
            { opacity: 0.55, paddingBottom: 10 },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ban size={14} color="#8696a0" style={{ marginRight: 6 }} />
            <Text
              style={{ fontSize: 14, fontStyle: "italic", color: "#8696a0" }}
            >
              This message was deleted
            </Text>
          </View>
        </View>
      </Wrapper>
    );
  }

  // ── Call log ─────────────────────────────────────────────────────────────────
  if (message.type === "missed_call") {
    let callLog: { status: string; duration: number; isVideo: boolean } = { status: "missed", duration: 0, isVideo: false };
    try {
      if (message.content?.startsWith("{")) {
        callLog = JSON.parse(message.content);
      } else if (message.content) {
        callLog.isVideo = message.content.includes("video");
        callLog.status = message.content.includes("ended") ? "ended" : "missed";
      }
    } catch { /* ignore */ }

    const isVideo  = callLog.isVideo;
    const ended    = callLog.status === "ended";
    const rejected = callLog.status === "rejected";
    // isOwn = the caller (initiator wrote the log)

    // ── Title ──
    const title = ended || rejected
      ? isVideo ? "Video Call" : "Voice Call"
      : isOwn
        ? isVideo ? "Video Call" : "Voice Call"
        : isVideo ? "Missed Video Call" : "Missed Voice Call";

    // ── Subtitle ──
    const formatDur = (s: number) => {
      if (s < 60)   return `${s}s`;
      if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
      return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    };
    const duration = ended && callLog.duration > 0 ? formatDur(callLog.duration) : null;
    const subtitle = duration ?? (rejected ? "Call declined" : "No answer");

    // ── Icon + colours ──
    // ended        → green  | PhoneOutgoing (own) / PhoneIncoming (theirs) / Video
    // outgoing missed (isOwn) → neutral | PhoneOutgoing / Video
    // incoming missed (!isOwn) → red    | PhoneIncoming / Video
    let iconColor: string;
    let iconBg: string;
    let AudioIcon: typeof Phone;

    if (ended) {
      iconColor = "#25d366";
      iconBg    = "rgba(37,211,102,0.15)";
      AudioIcon = isOwn ? PhoneOutgoing : PhoneIncoming;
    } else if (isOwn) {
      iconColor = "rgba(233,237,239,0.65)";
      iconBg    = "rgba(255,255,255,0.08)";
      AudioIcon = PhoneOutgoing;
    } else {
      iconColor = "#ea4335";
      iconBg    = "rgba(234,67,53,0.15)";
      AudioIcon = PhoneIncoming;
    }

    return (
      <Wrapper isOwn={isOwn}>
        <View style={[
          styles.callBubble,
          isOwn ? styles.bubbleOwn : styles.bubbleTheirs,
        ]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={[styles.callIcon, { backgroundColor: iconBg }]}>
              {isVideo ? (
                <Video size={20} color={iconColor} />
              ) : (
                <AudioIcon size={20} color={iconColor} />
              )}
            </View>
            <View>
              <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: "600", color: isOwn ? OWN_TEXT : THEIR_TEXT, lineHeight: 20 }}>
                {title}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 12, color: TIME_COLOR, marginTop: 1 }}>
                {subtitle} · {formatTime(message.createdAt)}
              </Text>
            </View>
          </View>
        </View>
      </Wrapper>
    );
  }

  // ── Normal message ───────────────────────────────────────────────────────────
  const hasAttachments = !!message.attachments?.length;
  const hasText = !!message.content && message.type === "text";

  return (
    <Wrapper isOwn={isOwn}>
      <TouchableOpacity
        activeOpacity={0.82}
        onLongPress={() => setShowMenu(true)}
        style={[
          styles.bubble, 
          isOwn ? styles.bubbleOwn : styles.bubbleTheirs,
          !hasText && { paddingBottom: 8 }
        ]}
      >
        {/* Group sender name */}
        {showSender && message.sender && (
          <Text style={styles.senderName}>
            {message.sender.displayName || "Unknown"}
          </Text>
        )}

        {/* Quoted preview of the message being replied to */}
        {message.replyTo && (
          <View style={styles.replyQuote}>
            <Text style={styles.replyQuoteSender}>
              {message.replyTo.senderName}
            </Text>
            <Text
              style={[
                styles.replyQuoteText,
                message.replyTo.isDeleted && styles.replyQuoteDeleted,
              ]}
              numberOfLines={1}
            >
              {message.replyTo.isDeleted
                ? "This message was deleted"
                : message.replyTo.content || "Media"}
            </Text>
          </View>
        )}

        {/* Attachments */}
        {hasAttachments && (
          <View style={{ marginBottom: hasText ? 4 : 0 }}>
            {message.attachments!.map((att, index) =>
              message.type === "image" ? (
                <TouchableOpacity
                  key={index}
                  onPress={() => setSelectedImage(att.url)}
                >
                  <Image
                    source={{ uri: att.url }}
                    style={styles.imgAttach}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ) : message.type === "audio" ? (
                <AudioPlayer key={index} uri={att.url} isOwn={isOwn} />
              ) : (
                <View key={index} style={styles.fileAttach}>
                  <FileText size={24} color={isOwn ? OWN_TEXT : "#8696a0"} />
                  <Text style={styles.fileName} numberOfLines={1}>
                    {att.filename}
                  </Text>
                </View>
              ),
            )}
            {!hasText && <Meta standalone />}
          </View>
        )}

        {/* Message text */}
        {hasText && (
          <Text
            style={[styles.msgText, { color: isOwn ? OWN_TEXT : THEIR_TEXT }]}
          >
            {message.content}
          </Text>
        )}

        {/* Timestamp — pinned to bottom-right of bubble */}
        {hasText && <Meta />}
      </TouchableOpacity>

      {/* Long-press context menu */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowMenu(false)}>
          <View style={styles.menu}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setShowMenu(false);
                onReply?.(message);
              }}
            >
              <Reply size={18} color="#e9edef" />
              <Text style={styles.menuTxt}>Reply</Text>
            </TouchableOpacity>
            {isOwn && message.type === "text" && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setShowMenu(false);
                  onEdit?.(message.id, message.content);
                }}
              >
                <Edit2 size={18} color="#e9edef" />
                <Text style={styles.menuTxt}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setShowMenu(false);
                onDelete?.(message.id, false);
              }}
            >
              <Trash2 size={18} color="#e9edef" />
              <Text style={styles.menuTxt}>Delete for me</Text>
            </TouchableOpacity>
            {isOwn && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setShowMenu(false);
                  onDelete?.(message.id, true);
                }}
              >
                <Trash2 size={18} color="#ef4444" />
                <Text style={[styles.menuTxt, { color: "#ef4444" }]}>
                  Delete for everyone
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal
        visible={!!selectedImage}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {/* Header */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: insets.top + 10,
              paddingBottom: 16,
              paddingHorizontal: 20,
              backgroundColor: "rgba(0,0,0,0.5)",
              zIndex: 10,
            }}
          >
            <TouchableOpacity onPress={() => setSelectedImage(null)}>
              <X size={28} color="#fff" />
            </TouchableOpacity>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <TouchableOpacity onPress={handleDownload}>
                <Download size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowForward(true)}>
                <Forward size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <Image
            source={{ uri: selectedImage! }}
            style={{ flex: 1 }}
            resizeMode="contain"
          />
        </View>
      </Modal>

      {/* Forward Modal */}
      <Modal
        visible={showForward}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForward(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#111b21" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + 10, paddingBottom: 16, paddingHorizontal: 16, backgroundColor: "#202c33" }}>
            <TouchableOpacity onPress={() => setShowForward(false)}>
              <X size={24} color="#e9edef" />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 20,
                color: "#e9edef",
                marginLeft: 16,
                fontWeight: "500",
              }}
            >
              Forward to...
            </Text>
          </View>
          <FlatList
            data={chats}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              let name = item.name;
              if (item.type === "direct") {
                const otherMember = item.members.find(
                  (m: any) => m.userId !== user?.id,
                );
                name = otherMember?.user?.profile?.displayName || "Unknown";
              }
              return (
                <TouchableOpacity
                  style={{
                    padding: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: "#2a3942",
                  }}
                  onPress={() => handleForward(item.id)}
                >
                  <Text style={{ color: "#e9edef", fontSize: 16 }}>{name}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </Wrapper>
  );
}

// ── Wrapper ─────────────────────────────────────────────────────────────────
function Wrapper({
  isOwn,
  children,
}: {
  isOwn: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.wrapper, isOwn ? styles.own : styles.theirs]}>
      {isOwn && <View style={styles.tailR} />}
      {!isOwn && <View style={styles.tailL} />}
      {children}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Outer wrapper
  wrapper: {
    marginVertical: 3,
    maxWidth: "78%",
    position: "relative",
  },
  own: { alignSelf: "flex-end", marginRight: 12 },
  theirs: { alignSelf: "flex-start", marginLeft: 12 },

  // ── Tails — smooth pointer matching the bubble colour
  tailR: {
    position: "absolute",
    top: 0,
    right: -8,
    width: 0,
    height: 0,
    // two-border trick gives a slightly smoother tail
    borderStyle: "solid",
    borderLeftWidth: 9,
    borderLeftColor: OWN_BG,
    borderTopWidth: 0,
    borderBottomWidth: 11,
    borderBottomColor: "transparent",
  },
  tailL: {
    position: "absolute",
    top: 0,
    left: -8,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderRightWidth: 9,
    borderRightColor: THEIR_BG,
    borderTopWidth: 0,
    borderBottomWidth: 11,
    borderBottomColor: "transparent",
  },

  // ── Bubble — bigger radius, nicer depth
  bubble: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24, // reserved zone for the absolute timestamp
    borderRadius: 18,
    position: "relative",
    minWidth: 96,
    // rich layered shadow for depth
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  bubbleOwn: {
    backgroundColor: OWN_BG,
    borderTopRightRadius: 0, // perfectly flat top-right corner where tail meets
  },
  bubbleTheirs: {
    backgroundColor: THEIR_BG,
    borderTopLeftRadius: 0, // perfectly flat top-left corner where tail meets
  },

  // ── Message text
  msgText: {
    fontSize: 15.5,
    lineHeight: 23,
    letterSpacing: 0.1,
  },

  // ── Timestamp row — absolutely pinned to bottom-right of bubble
  metaRow: {
    position: "absolute",
    bottom: 5,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaStandalone: {
    position: "relative",
    bottom: undefined,
    right: undefined,
    justifyContent: "flex-end",
    marginTop: 4,
  },
  editedLabel: {
    fontSize: 11,
    color: TIME_COLOR,
    fontStyle: "italic",
  },
  timeText: {
    fontSize: 11.5,
    color: TIME_COLOR,
    letterSpacing: 0.2,
  },

  // ── Group sender name
  senderName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#7edcf5",
    marginBottom: 4,
    letterSpacing: 0.1,
  },

  // ── Quoted reply preview
  replyQuote: {
    borderLeftWidth: 3,
    borderLeftColor: "#06cf9c",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  replyQuoteSender: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#06cf9c",
  },
  replyQuoteText: {
    fontSize: 12.5,
    color: "rgba(233,237,239,0.75)",
    marginTop: 1,
  },
  replyQuoteDeleted: {
    color: "#8696a0",
    fontStyle: "italic",
  },

  // ── Attachments
  imgAttach: {
    width: 230,
    height: 230,
    borderRadius: 12,
    marginBottom: 4,
  },
  fileAttach: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
    padding: 10,
    borderRadius: 10,
    width: 210,
  },
  fileName: {
    color: "#e9edef",
    marginLeft: 8,
    fontSize: 14,
    flex: 1,
  },

  // ── Call log bubble (dedicated — no text-bubble padding hacks)
  callBubble: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    minWidth: 230,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  // ── Call icon circle
  callIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(234,67,53,0.18)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },

  // ── Context menu
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    backgroundColor: "#1e2c35",
    borderRadius: 16,
    width: 260,
    padding: 6,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 10,
  },
  menuTxt: {
    color: "#e9edef",
    fontSize: 15,
    marginLeft: 14,
    fontWeight: "500",
  },
});
