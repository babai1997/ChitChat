import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native";
import { X, FileText, Link2, Image as ImageIcon, ExternalLink } from "lucide-react-native";
import { chatApi } from "../../src/api";
import { useChatStore } from "../../src/stores/chatStore";
import { decryptMessagesInPlace } from "../../src/services/e2eeSessions";
import { parseAttachmentDescriptor, decryptAttachmentToLocalUri } from "../../src/services/e2eeAttachments";
import type { Chat, Message } from "../../src/types";
import { COLORS } from '../../src/theme/colors';

type GalleryTab = "media" | "docs" | "links";

interface ChatGalleryModalProps {
  chat: Chat;
  visible: boolean;
  onClose: () => void;
  /** Closes this modal and scrolls/highlights the message in the open chat (reuses MessageBubble's "jump to reply" mechanism). */
  onJumpToMessage: (messageId: string) => void;
}

interface ExtractedLink {
  messageId: string;
  url: string;
  senderName: string;
  createdAt: string;
}

// Deliberately simple (http/https only) — good enough for "did someone
// paste a link in this chat," which is all the Links tab needs to answer.
const URL_REGEX = /https?:\/\/[^\s]+/gi;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentInfoFor(message: Message): { url: string | null; fileName: string; size: number } {
  if (message.isEncrypted) {
    const descriptor = parseAttachmentDescriptor(message.content);
    return { url: null, fileName: descriptor?.fileName ?? "File", size: descriptor?.size ?? 0 };
  }
  const att = message.attachments?.[0];
  return { url: att?.url ?? null, fileName: att?.filename ?? "File", size: att?.size ?? 0 };
}

function MediaThumb({ message, onPress }: { message: Message; onPress: () => void }) {
  const [uri, setUri] = useState<string | null>(attachmentInfoFor(message).url);

  useEffect(() => {
    if (uri || !message.isEncrypted || message.type !== "image") return;
    const descriptor = parseAttachmentDescriptor(message.content);
    if (!descriptor) return;
    let cancelled = false;
    decryptAttachmentToLocalUri(message.id, descriptor)
      .then((u) => {
        if (!cancelled) setUri(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]);

  return (
    <TouchableOpacity onPress={onPress} style={styles.thumb}>
      {uri && message.type === "image" ? (
        <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
      ) : message.type === "video" ? (
        // No video-frame decoding on mobile yet (matches EncryptedAttachment.tsx) — icon placeholder.
        <View style={styles.thumbPlaceholder}>
          <ImageIcon size={20} color={COLORS.textSecondary} />
        </View>
      ) : (
        <View style={styles.thumbPlaceholder}>
          <ActivityIndicator size="small" color={COLORS.textSecondary} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function DocRow({ message, onPress }: { message: Message; onPress: () => void }) {
  const info = attachmentInfoFor(message);
  return (
    <TouchableOpacity onPress={onPress} style={styles.docRow}>
      <View style={styles.docIcon}>
        <FileText size={20} color={COLORS.textSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.docName} numberOfLines={1}>
          {info.fileName}
        </Text>
        <Text style={styles.docMeta}>
          {new Date(message.createdAt).toLocaleDateString()}
          {info.size > 0 ? ` · ${formatBytes(info.size)}` : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ChatGalleryModal({ chat, visible, onClose, onJumpToMessage }: ChatGalleryModalProps) {
  const [tab, setTab] = useState<GalleryTab>("media");

  const [mediaMessages, setMediaMessages] = useState<Message[]>([]);
  const [docMessages, setDocMessages] = useState<Message[]>([]);
  const [mediaCursor, setMediaCursor] = useState<string | undefined>(undefined);
  const [docCursor, setDocCursor] = useState<string | undefined>(undefined);
  const [mediaHasMore, setMediaHasMore] = useState(true);
  const [docHasMore, setDocHasMore] = useState(true);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const mediaLoadedRef = useRef(false);
  const docsLoadedRef = useRef(false);

  const [links, setLinks] = useState<ExtractedLink[]>([]);

  const isGroupChat = chat.type === "group" || chat.type === "meeting";

  const loadMedia = async () => {
    if (isLoadingMedia) return;
    setIsLoadingMedia(true);
    try {
      const res = await chatApi.getGallery(chat.id, ["image", "video"], mediaCursor, 30);
      await decryptMessagesInPlace(res.messages, isGroupChat);
      setMediaMessages((prev) => [...prev, ...res.messages]);
      setMediaCursor(res.nextCursor ?? undefined);
      setMediaHasMore(res.hasMore);
    } catch (err) {
      console.error("Failed to load media:", err);
    } finally {
      setIsLoadingMedia(false);
    }
  };

  const loadDocs = async () => {
    if (isLoadingDocs) return;
    setIsLoadingDocs(true);
    try {
      const res = await chatApi.getGallery(chat.id, ["file", "audio"], docCursor, 30);
      await decryptMessagesInPlace(res.messages, isGroupChat);
      setDocMessages((prev) => [...prev, ...res.messages]);
      setDocCursor(res.nextCursor ?? undefined);
      setDocHasMore(res.hasMore);
    } catch (err) {
      console.error("Failed to load docs:", err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // Links can only ever come from what's already decrypted in this chat's
  // local store — a URL exists solely inside plaintext, which the server
  // never has for an encrypted chat. Real, honest scope limit: links from
  // messages outside what's currently loaded won't show up here until the
  // user scrolls back far enough in the main chat to load them.
  const scanLinks = () => {
    const localMessages = useChatStore.getState().messages[chat.id] ?? [];
    const found: ExtractedLink[] = [];
    for (const m of localMessages) {
      if (m.type !== "text" || !m.content) continue;
      const matches = m.content.match(URL_REGEX);
      if (!matches) continue;
      for (const url of matches) {
        found.push({ messageId: m.id, url, senderName: m.sender?.displayName || "Unknown", createdAt: m.createdAt });
      }
    }
    found.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setLinks(found);
  };

  useEffect(() => {
    if (!visible) return;
    if (tab === "media" && !mediaLoadedRef.current) {
      mediaLoadedRef.current = true;
      void loadMedia();
    }
    if (tab === "docs" && !docsLoadedRef.current) {
      docsLoadedRef.current = true;
      void loadDocs();
    }
    if (tab === "links") {
      scanLinks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tab]);

  useEffect(() => {
    if (visible) return;
    mediaLoadedRef.current = false;
    docsLoadedRef.current = false;
    setMediaMessages([]);
    setDocMessages([]);
    setMediaCursor(undefined);
    setDocCursor(undefined);
    setMediaHasMore(true);
    setDocHasMore(true);
    setLinks([]);
    setTab("media");
  }, [visible]);

  const TABS: { key: GalleryTab; label: string }[] = [
    { key: "media", label: "Media" },
    { key: "docs", label: "Docs" },
    { key: "links", label: "Links" },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <X size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Media, links and docs</Text>
        </View>

        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={styles.tabBtn}>
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
              {tab === t.key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ padding: 16 }}>
          {tab === "media" && (
            <>
              {mediaMessages.length === 0 && !isLoadingMedia && (
                <EmptyState icon={<ImageIcon size={32} color={COLORS.textSecondary} />} text="No media in this chat yet" />
              )}
              <View style={styles.mediaGrid}>
                {mediaMessages.map((m) => (
                  <MediaThumb key={m.id} message={m} onPress={() => onJumpToMessage(m.id)} />
                ))}
              </View>
              {mediaHasMore && <LoadMoreButton isLoading={isLoadingMedia} onPress={loadMedia} />}
            </>
          )}

          {tab === "docs" && (
            <>
              {docMessages.length === 0 && !isLoadingDocs && (
                <EmptyState icon={<FileText size={32} color={COLORS.textSecondary} />} text="No documents in this chat yet" />
              )}
              {docMessages.map((m) => (
                <DocRow key={m.id} message={m} onPress={() => onJumpToMessage(m.id)} />
              ))}
              {docHasMore && <LoadMoreButton isLoading={isLoadingDocs} onPress={loadDocs} />}
            </>
          )}

          {tab === "links" && (
            <>
              {links.length === 0 && (
                <EmptyState icon={<Link2 size={32} color={COLORS.textSecondary} />} text="No links found in loaded messages" />
              )}
              {links.map((link, i) => (
                <View key={`${link.messageId}-${i}`} style={styles.linkRow}>
                  <Link2 size={18} color={COLORS.textSecondary} />
                  <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => Linking.openURL(link.url)}>
                    <Text style={styles.linkUrl} numberOfLines={1}>
                      {link.url}
                    </Text>
                    <Text style={styles.linkMeta}>
                      {link.senderName} · {new Date(link.createdAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onJumpToMessage(link.messageId)} style={{ padding: 4 }}>
                    <ExternalLink size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={styles.emptyState}>
      {icon}
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function LoadMoreButton({ isLoading, onPress }: { isLoading: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={isLoading} style={styles.loadMoreBtn}>
      {isLoading ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Text style={styles.loadMoreText}>Load more</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgDeepest },
  header: {
    flexDirection: "row", alignItems: "center", gap: 16,
    padding: 16, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {},
  headerTitle: { fontSize: 17, fontWeight: "600", color: COLORS.textPrimary },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel: { fontSize: 14, fontWeight: "500", color: COLORS.textSecondary },
  tabLabelActive: { color: COLORS.accent },
  tabUnderline: { marginTop: 6, height: 2, width: 32, backgroundColor: COLORS.accent, borderRadius: 1 },
  content: { flex: 1 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  thumb: {
    width: "31.5%", aspectRatio: 1, borderRadius: 6, overflow: "hidden",
    backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center",
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  docRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.surface,
  },
  docIcon: {
    width: 40, height: 40, borderRadius: 8, backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center",
  },
  docName: { fontSize: 14, color: COLORS.textPrimary },
  docMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  linkRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.surface,
  },
  linkUrl: { fontSize: 13.5, color: COLORS.info },
  linkMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  emptyState: { alignItems: "center", gap: 10, paddingVertical: 48 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
  loadMoreBtn: {
    marginTop: 12, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border, alignItems: "center",
  },
  loadMoreText: { color: COLORS.accent, fontSize: 13 },
});
