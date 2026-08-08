import { View, Text, Image, StyleSheet } from "react-native";
import { FileText, Image as ImageIcon, Mic, Video as VideoIcon } from "lucide-react-native";
import { useReplyPreviewSource } from "../../src/hooks/useReplyPreviewSource";
import type { MessageReplyPreview } from "../../src/types";

/**
 * The content row of a reply quote — icon/thumbnail + label — shared by
 * MessageBubble's in-bubble quote and ChatInput's compose-time reply banner,
 * so both got the same WhatsApp-style "real preview instead of a bare 'Media'
 * label" fix in one place. Callers own the surrounding sender-name/border/
 * cancel-button chrome, which differs between the two spots. Mirrors
 * frontend/src/components/chat/ReplyPreviewLine.tsx.
 */
export function ReplyPreviewLine({
  chatId,
  replyTo,
}: {
  chatId: string;
  replyTo: MessageReplyPreview;
}) {
  const source = useReplyPreviewSource(chatId, replyTo);
  if (!source) return null;

  const iconSize = 14;

  let media: React.ReactNode = null;
  if (source.kind === "image" || source.kind === "video") {
    media = (
      <View style={styles.thumbWrap}>
        {source.thumbnailUri ? (
          <Image source={{ uri: source.thumbnailUri }} style={styles.thumbImage} resizeMode="cover" />
        ) : source.kind === "image" ? (
          <ImageIcon size={iconSize} color="#8696a0" />
        ) : (
          <VideoIcon size={iconSize} color="#8696a0" />
        )}
      </View>
    );
  } else if (source.kind === "audio") {
    media = <Mic size={iconSize} color="#8696a0" />;
  } else if (source.kind === "file") {
    media = <FileText size={iconSize} color="#8696a0" />;
  }

  return (
    <View style={[styles.row, media && styles.rowWithMedia]}>
      {media}
      <Text
        style={[styles.text, source.kind === "deleted" && styles.textDeleted]}
        numberOfLines={1}
      >
        {source.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowWithMedia: { marginTop: 4 },
  thumbWrap: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%" },
  text: { fontSize: 12.5, color: "rgba(233,237,239,0.75)", flexShrink: 1 },
  textDeleted: { color: "#8696a0", fontStyle: "italic" },
});
