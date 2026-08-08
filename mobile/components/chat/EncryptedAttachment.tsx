import { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { FileText } from "lucide-react-native";
import { parseAttachmentDescriptor, decryptAttachmentToLocalUri } from "../../src/services/e2eeAttachments";
import AudioPlayer from "./AudioPlayer";
import type { Message } from "../../src/types";

/**
 * Renders an encrypted image/audio/video/file message — the counterpart to
 * the plaintext `message.attachments` rendering above it in MessageBubble.
 * `message.content` (already decrypted) is a JSON "descriptor" carrying the
 * Cloudinary URL plus the per-attachment key/nonce needed to decrypt it —
 * this component fetches the ciphertext and decrypts it into a local file
 * URI on demand, memoized per message id (see e2eeAttachments.ts) so it
 * only happens once per message per app session.
 */
export function EncryptedAttachment({
  message,
  isOwn,
  onImagePress,
}: {
  message: Message;
  isOwn: boolean;
  onImagePress: (uri: string) => void;
}) {
  const descriptor = parseAttachmentDescriptor(message.content);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!descriptor) return;
    let cancelled = false;
    setLocalUri(null);
    setError(null);
    decryptAttachmentToLocalUri(message.id, descriptor)
      .then((uri) => {
        if (!cancelled) setLocalUri(uri);
      })
      .catch((err) => {
        console.error("[E2EE] Failed to decrypt attachment:", err);
        if (!cancelled) setError("Failed to load attachment");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id, descriptor?.attachmentUrl]);

  if (!descriptor) {
    // content isn't a valid descriptor — either the "no cipher for this
    // device" or "decrypt failed" placeholder text (see e2eeSessions.ts),
    // or genuinely empty. Show whatever's there rather than nothing.
    return message.content ? <Text style={styles.placeholder}>{message.content}</Text> : null;
  }

  if (error) {
    return <Text style={styles.error}>⚠️ {error}</Text>;
  }

  if (!localUri) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color="#8696a0" />
        <Text style={styles.loadingText}>Decrypting…</Text>
      </View>
    );
  }

  if (message.type === "image") {
    return (
      <TouchableOpacity onPress={() => onImagePress(localUri)}>
        <Image source={{ uri: localUri }} style={styles.imgAttach} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  if (message.type === "audio") {
    return <AudioPlayer uri={localUri} isOwn={isOwn} />;
  }

  // Default to file (also covers video for now — no dedicated video player
  // component exists yet on mobile, matching the pre-Phase-3 plaintext path).
  return (
    <View style={styles.fileAttach}>
      <FileText size={24} color={isOwn ? "#e9edef" : "#8696a0"} />
      <Text style={styles.fileName} numberOfLines={1}>
        {descriptor.fileName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  imgAttach: { width: 230, height: 230, borderRadius: 12, marginBottom: 4 },
  fileAttach: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
    padding: 10,
    borderRadius: 10,
    width: 210,
  },
  fileName: { color: "#e9edef", marginLeft: 8, fontSize: 14, flex: 1 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8 },
  loadingText: { color: "#8696a0", fontSize: 13 },
  placeholder: { color: "#8696a0", fontSize: 13, fontStyle: "italic" },
  error: { color: "#ef4444", fontSize: 13 },
});
