import { useEffect, useState } from "react";
import { Loader2, FileText } from "lucide-react";
import { parseAttachmentDescriptor, decryptAttachmentToBlobUrl } from "../../services/e2eeAttachments";
import type { Message } from "../../types";

/**
 * Renders an encrypted image/audio/video/file message — the counterpart to
 * the plaintext `message.attachments` rendering above it in MessageBubble.
 * `message.content` (already decrypted by decryptMessagesInPlace) is a JSON
 * "descriptor" carrying the Cloudinary URL plus the per-attachment key/nonce
 * needed to decrypt it — this component fetches the ciphertext and decrypts
 * it into a renderable blob URL on demand, memoized per message id (see
 * e2eeAttachments.ts) so it only happens once per message per page load.
 */
export function EncryptedAttachment({
  message,
  isOwn,
  onImageClick,
}: {
  message: Message;
  isOwn: boolean;
  onImageClick: (url: string) => void;
}) {
  const descriptor = parseAttachmentDescriptor(message.content);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!descriptor) return;
    let cancelled = false;
    setBlobUrl(null);
    setError(null);
    decryptAttachmentToBlobUrl(message.id, descriptor)
      .then((url) => {
        if (!cancelled) setBlobUrl(url);
      })
      .catch((err) => {
        console.error("[E2EE] Failed to decrypt attachment:", err);
        if (!cancelled) setError("Failed to load attachment");
      });
    return () => {
      cancelled = true;
    };
    // Re-run only if the underlying ciphertext location actually changes —
    // not on every re-render of the surrounding bubble.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id, descriptor?.attachmentUrl]);

  if (!descriptor) {
    // content isn't a valid descriptor — either the "no cipher for this
    // device" or "decrypt failed" placeholder text (see e2eeSessions.ts),
    // or genuinely empty. Show whatever's there as plain text rather than
    // nothing, since those placeholders ARE the useful information here.
    return message.content ? (
      <span style={{ fontSize: "13px", color: "#8696a0", fontStyle: "italic" }}>{message.content}</span>
    ) : null;
  }

  if (error) {
    return <span style={{ fontSize: "13px", color: "#ef4444" }}>⚠️ {error}</span>;
  }

  if (!blobUrl) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px", color: "#8696a0" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: "13px" }}>Decrypting…</span>
      </div>
    );
  }

  if (message.type === "image") {
    return (
      <img
        src={blobUrl}
        alt={descriptor.fileName}
        style={{
          borderRadius: "8px",
          maxWidth: "100%",
          maxHeight: "300px",
          objectFit: "cover",
          cursor: "pointer",
        }}
        onClick={() => onImageClick(blobUrl)}
      />
    );
  }

  if (message.type === "video") {
    return (
      <video
        controls
        src={blobUrl}
        style={{ borderRadius: "8px", maxWidth: "100%", maxHeight: "300px" }}
      />
    );
  }

  if (message.type === "audio") {
    return <audio controls src={blobUrl} style={{ width: "240px", maxWidth: "100%" }} />;
  }

  // Default to file
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px",
        backgroundColor: "rgba(0,0,0,0.1)",
        borderRadius: "8px",
      }}
    >
      <FileText size={24} color={isOwn ? "#e9edef" : "#8696a0"} />
      <a
        href={blobUrl}
        download={descriptor.fileName}
        style={{
          color: "inherit",
          textDecoration: "none",
          fontSize: "14px",
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {descriptor.fileName}
      </a>
    </div>
  );
}
