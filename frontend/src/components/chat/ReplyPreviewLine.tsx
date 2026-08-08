import { FileText, Image as ImageIcon, Mic, Video as VideoIcon } from "lucide-react";
import { useReplyPreviewSource } from "../../hooks/useReplyPreviewSource";
import type { MessageReplyPreview } from "../../types";

/**
 * The content row of a reply quote — icon/thumbnail + label — shared by
 * MessageBubble's in-bubble quote and ChatView's compose-time reply banner,
 * so both got the same WhatsApp-style "real preview instead of a bare 'Media'
 * label" fix in one place. Callers own the surrounding sender-name/border/
 * cancel-button chrome, which differs between the two spots.
 */
export function ReplyPreviewLine({
  chatId,
  replyTo,
  maxWidth = 260,
}: {
  chatId: string;
  replyTo: MessageReplyPreview;
  maxWidth?: number;
}) {
  const source = useReplyPreviewSource(chatId, replyTo);
  if (!source) return null;

  const iconSize = 14;
  const thumbSize = 32;

  let media: React.ReactNode = null;
  if (source.kind === "image" || source.kind === "video") {
    media = (
      <div
        style={{
          width: thumbSize,
          height: thumbSize,
          borderRadius: "4px",
          flexShrink: 0,
          backgroundColor: "rgba(255,255,255,0.08)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {source.thumbnailUrl ? (
          source.kind === "image" ? (
            <img src={source.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <video
              src={source.thumbnailUrl}
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )
        ) : source.kind === "image" ? (
          <ImageIcon size={iconSize} color="var(--color-text-secondary)" />
        ) : (
          <VideoIcon size={iconSize} color="var(--color-text-secondary)" />
        )}
      </div>
    );
  } else if (source.kind === "audio") {
    media = <Mic size={iconSize} color="var(--color-text-secondary)" style={{ flexShrink: 0 }} />;
  } else if (source.kind === "file") {
    media = <FileText size={iconSize} color="var(--color-text-secondary)" style={{ flexShrink: 0 }} />;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: media ? "4px" : 0 }}>
      {media}
      <span
        style={{
          fontSize: "12.5px",
          color: source.kind === "deleted" ? "var(--color-text-secondary)" : "rgba(240, 238, 247,0.75)",
          fontStyle: source.kind === "deleted" ? "italic" : "normal",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: `${maxWidth}px`,
        }}
      >
        {source.label}
      </span>
    </div>
  );
}
