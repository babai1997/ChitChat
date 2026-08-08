import { useEffect, useRef, useState } from "react";
import { X, FileText, Link2, Image as ImageIcon, Loader2, ExternalLink } from "lucide-react";
import { chatApi } from "../../api";
import { useChatStore } from "../../stores";
import { decryptMessagesInPlace } from "../../services/e2eeSessions";
import { parseAttachmentDescriptor, decryptAttachmentToBlobUrl } from "../../services/e2eeAttachments";
import type { Chat, Message } from "../../types";

type GalleryTab = "media" | "docs" | "links";

interface ChatGalleryModalProps {
  chat: Chat;
  isOpen: boolean;
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

// Deliberately simple (http/https only, no bare "example.com") — good
// enough for "did someone paste a link in this chat," which is the only
// thing the Links tab needs to answer.
const URL_REGEX = /https?:\/\/[^\s]+/gi;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentInfoFor(message: Message): { url: string | null; fileName: string; size: number; mimeType: string } {
  if (message.isEncrypted) {
    const descriptor = parseAttachmentDescriptor(message.content);
    return {
      url: null, // resolved lazily per-thumbnail (see MediaThumb/DocRow) — decrypting is async
      fileName: descriptor?.fileName ?? "File",
      size: descriptor?.size ?? 0,
      mimeType: descriptor?.mimeType ?? "",
    };
  }
  const att = message.attachments?.[0];
  return { url: att?.url ?? null, fileName: att?.filename ?? "File", size: att?.size ?? 0, mimeType: att?.mimeType ?? "" };
}

function MediaThumb({ message, onClick }: { message: Message; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(attachmentInfoFor(message).url);

  useEffect(() => {
    if (url || !message.isEncrypted) return;
    const descriptor = parseAttachmentDescriptor(message.content);
    if (!descriptor) return;
    let cancelled = false;
    decryptAttachmentToBlobUrl(message.id, descriptor)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]);

  return (
    <button
      onClick={onClick}
      style={{
        aspectRatio: "1",
        border: "none",
        padding: 0,
        borderRadius: "6px",
        overflow: "hidden",
        backgroundColor: "var(--color-surface)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {url ? (
        message.type === "video" ? (
          <video src={url} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )
      ) : (
        <Loader2 size={18} color="var(--color-text-secondary)" style={{ animation: "spin 1s linear infinite" }} />
      )}
    </button>
  );
}

function DocRow({ message, onClick }: { message: Message; onClick: () => void }) {
  const info = attachmentInfoFor(message);
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "100%",
        padding: "10px 4px",
        background: "none",
        border: "none",
        borderBottom: "1px solid var(--color-surface)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "8px",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <FileText size={20} color="var(--color-text-secondary)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {info.fileName}
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
          {new Date(message.createdAt).toLocaleDateString()}
          {info.size > 0 ? ` · ${formatBytes(info.size)}` : ""}
        </div>
      </div>
    </button>
  );
}

export function ChatGalleryModal({ chat, isOpen, onClose, onJumpToMessage }: ChatGalleryModalProps) {
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
  // never has for an encrypted chat. This is a real, honest scope limit:
  // links from messages outside what's currently loaded won't show up here
  // until the user scrolls back far enough in the main chat to load them.
  const scanLinks = () => {
    const localMessages = useChatStore.getState().messages[chat.id] ?? [];
    const found: ExtractedLink[] = [];
    for (const m of localMessages) {
      if (m.type !== "text" || !m.content) continue;
      const matches = m.content.match(URL_REGEX);
      if (!matches) continue;
      for (const url of matches) {
        found.push({
          messageId: m.id,
          url,
          senderName: m.sender?.displayName || "Unknown",
          createdAt: m.createdAt,
        });
      }
    }
    found.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setLinks(found);
  };

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, tab]);

  // Reset everything when the modal is closed and reopened for a different chat.
  useEffect(() => {
    if (isOpen) return;
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
  }, [isOpen]);

  if (!isOpen) return null;

  const TABS: { key: GalleryTab; label: string }[] = [
    { key: "media", label: "Media" },
    { key: "docs", label: "Docs" },
    { key: "links", label: "Links" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "480px",
          height: "600px",
          maxHeight: "85vh",
          backgroundColor: "var(--color-bg)",
          borderRadius: "12px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px", borderBottom: "1px solid var(--color-surface)" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-primary)", cursor: "pointer", padding: "4px" }}>
            <X size={20} />
          </button>
          <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)" }}>Media, links and docs</span>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--color-surface)" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: "12px",
                background: "none",
                border: "none",
                borderBottom: tab === t.key ? "2px solid var(--color-accent)" : "2px solid transparent",
                color: tab === t.key ? "var(--color-accent)" : "var(--color-text-secondary)",
                fontWeight: 500,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {tab === "media" && (
            <>
              {mediaMessages.length === 0 && !isLoadingMedia && (
                <EmptyState icon={<ImageIcon size={32} color="var(--color-text-secondary)" />} text="No media in this chat yet" />
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                {mediaMessages.map((m) => (
                  <MediaThumb key={m.id} message={m} onClick={() => onJumpToMessage(m.id)} />
                ))}
              </div>
              {mediaHasMore && (
                <LoadMoreButton isLoading={isLoadingMedia} onClick={loadMedia} />
              )}
            </>
          )}

          {tab === "docs" && (
            <>
              {docMessages.length === 0 && !isLoadingDocs && (
                <EmptyState icon={<FileText size={32} color="var(--color-text-secondary)" />} text="No documents in this chat yet" />
              )}
              {docMessages.map((m) => (
                <DocRow key={m.id} message={m} onClick={() => onJumpToMessage(m.id)} />
              ))}
              {docHasMore && (
                <LoadMoreButton isLoading={isLoadingDocs} onClick={loadDocs} />
              )}
            </>
          )}

          {tab === "links" && (
            <>
              {links.length === 0 && (
                <EmptyState icon={<Link2 size={32} color="var(--color-text-secondary)" />} text="No links found in loaded messages" />
              )}
              {links.map((link, i) => (
                <div
                  key={`${link.messageId}-${i}`}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 4px", borderBottom: "1px solid var(--color-surface)" }}
                >
                  <Link2 size={18} color="var(--color-text-secondary)" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "13.5px",
                        color: "var(--color-info)",
                        textDecoration: "none",
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {link.url}
                    </a>
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                      {link.senderName} · {new Date(link.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => onJumpToMessage(link.messageId)}
                    title="Jump to message"
                    style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", padding: "4px", flexShrink: 0 }}
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "48px 16px", color: "var(--color-text-secondary)" }}>
      {icon}
      <span style={{ fontSize: "14px" }}>{text}</span>
    </div>
  );
}

function LoadMoreButton({ isLoading, onClick }: { isLoading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      style={{
        width: "100%",
        marginTop: "12px",
        padding: "10px",
        background: "none",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        color: "var(--color-accent)",
        cursor: isLoading ? "default" : "pointer",
        fontSize: "13px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isLoading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : "Load more"}
    </button>
  );
}
