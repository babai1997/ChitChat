import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
} from "react-native";
import {
  Check,
  CheckCheck,
  Clock,
  FileText,
  Trash2,
  Edit2,
  Ban,
  PhoneMissed,
  Video,
  Phone,
  PhoneOff,
} from "lucide-react-native";
import { useState } from "react";
import type { Message } from "../../src/types";
import AudioPlayer from "./AudioPlayer";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender?: boolean;
  onEdit?: (messageId: string, currentContent: string) => void;
  onDelete?: (messageId: string, deleteForEveryone: boolean) => void;
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
}: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);

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

  // ── Missed call ─────────────────────────────────────────────────────────────
  if (message.type === "missed_call") {
    let callLog = { status: "missed", duration: 0, isVideo: false };
    try {
      if (message.content) {
        // Handle legacy or plain text just in case
        if (message.content.startsWith("{")) {
          callLog = JSON.parse(message.content);
        } else {
          callLog.isVideo = message.content.includes("video");
          callLog.status = message.content.includes("ended")
            ? "ended"
            : "missed";
        }
      }
    } catch (e) {}

    const isVideo = callLog.isVideo;

    let icon = <PhoneMissed size={16} color="#ea4335" />;
    if (callLog.status === "ended") {
      icon = isVideo ? (
        <Video size={16} color={isOwn ? OWN_TEXT : THEIR_TEXT} />
      ) : (
        <Phone size={16} color={isOwn ? OWN_TEXT : THEIR_TEXT} />
      );
    } else if (callLog.status === "rejected") {
      icon = <PhoneOff size={16} color="#ea4335" />;
    } else if (callLog.status === "missed") {
      if (isOwn) {
        icon = isVideo ? (
          <Video size={16} color={OWN_TEXT} />
        ) : (
          <Phone size={16} color={OWN_TEXT} />
        );
      } else {
        icon = isVideo ? (
          <Video size={16} color="#ea4335" />
        ) : (
          <PhoneMissed size={16} color="#ea4335" />
        );
      }
    }

    let text = "Missed call";
    if (callLog.status === "ended") {
      const m = Math.floor(callLog.duration / 60);
      const s = callLog.duration % 60;
      text = `Call ended • ${m}:${s.toString().padStart(2, "0")}`;
    } else if (callLog.status === "rejected") {
      text = "Call rejected";
    } else {
      if (isOwn) {
        text = isVideo ? "Video call\nNo answer" : "Voice call\nNo answer";
      } else {
        text = isVideo ? "Missed video call" : "Missed voice call";
      }
    }

    return (
      <Wrapper isOwn={isOwn}>
        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleTheirs,
            { minWidth: 160 },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <View style={styles.callIcon}>{icon}</View>
            <Text
              style={[
                styles.msgText,
                { marginLeft: 8, color: isOwn ? OWN_TEXT : THEIR_TEXT },
              ]}
            >
              {text}
            </Text>
          </View>
          <Meta standalone />
        </View>
      </Wrapper>
    );
  }

  // ── Normal message ───────────────────────────────────────────────────────────
  const hasAttachments = !!message.attachments?.length;
  const hasText = !!message.content && message.type !== "audio";

  return (
    <Wrapper isOwn={isOwn}>
      <TouchableOpacity
        activeOpacity={0.82}
        onLongPress={() => setShowMenu(true)}
        style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleTheirs]}
      >
        {/* Group sender name */}
        {showSender && message.sender && (
          <Text style={styles.senderName}>
            {message.sender.displayName || "Unknown"}
          </Text>
        )}

        {/* Attachments */}
        {hasAttachments && (
          <View style={{ marginBottom: hasText ? 4 : 0 }}>
            {message.attachments!.map((att, index) =>
              message.type === "image" ? (
                <Image
                  key={index}
                  source={{ uri: att.url }}
                  style={styles.imgAttach}
                  resizeMode="cover"
                />
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
    borderTopRightRadius: 4, // flat top-right corner where tail meets
  },
  bubbleTheirs: {
    backgroundColor: THEIR_BG,
    borderTopLeftRadius: 4, // flat top-left corner where tail meets
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

  // ── Missed call icon
  callIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(234,67,53,0.18)",
    alignItems: "center",
    justifyContent: "center",
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
