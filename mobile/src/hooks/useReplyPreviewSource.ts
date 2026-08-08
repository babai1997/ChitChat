import { useEffect, useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { parseAttachmentDescriptor, decryptAttachmentToLocalUri } from '../services/e2eeAttachments';
import type { MessageReplyPreview, MessageType } from '../types';

export interface ReplyPreviewSource {
  kind: 'text' | 'image' | 'video' | 'audio' | 'file' | 'deleted';
  label: string;
  thumbnailUri: string | null;
}

/**
 * Resolves what to actually show for a quoted message. The server can never
 * supply real content for an encrypted quote (see messages.mapper.ts) — only
 * `type`, which is safe metadata. So this prefers the SAME message already
 * sitting decrypted in chatStore (virtually always true, since you're
 * replying/viewing a reply within the very chat that message belongs to) and
 * falls back to a generic type-based label ("Photo"/"Video"/...) only when
 * that local copy genuinely isn't available (e.g. outside the loaded page).
 * Mirrors frontend/src/hooks/useReplyPreviewSource.ts.
 */
export function useReplyPreviewSource(
  chatId: string,
  replyTo: MessageReplyPreview | null,
): ReplyPreviewSource | null {
  const localMessage = useChatStore((s) => s.messages[chatId]?.find((m) => m.id === replyTo?.id));
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  const type: MessageType | undefined = localMessage?.type ?? replyTo?.type;
  const content = localMessage?.content ?? replyTo?.content ?? null;
  const isEncrypted = localMessage?.isEncrypted ?? false;
  const descriptor = isEncrypted ? parseAttachmentDescriptor(content) : null;
  const plaintextAttachment = !isEncrypted ? localMessage?.attachments?.[0] : undefined;

  useEffect(() => {
    setThumbnailUri(null);
    // Only 'image' gets a real thumbnail — mobile has no video renderer yet
    // (EncryptedAttachment.tsx falls back to a generic file icon for video
    // too), so decrypting a video just to throw the result away isn't worth it.
    if (type !== 'image') return;
    if (descriptor) {
      let cancelled = false;
      decryptAttachmentToLocalUri(replyTo!.id, descriptor)
        .then((uri) => {
          if (!cancelled) setThumbnailUri(uri);
        })
        .catch(() => {
          // No thumbnail — the icon fallback below covers this.
        });
      return () => {
        cancelled = true;
      };
    }
    if (plaintextAttachment) setThumbnailUri(plaintextAttachment.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyTo?.id, type, descriptor?.attachmentUrl, plaintextAttachment?.url]);

  if (!replyTo) return null;
  if (replyTo.isDeleted) {
    return { kind: 'deleted', label: 'This message was deleted', thumbnailUri: null };
  }

  switch (type) {
    case 'image':
      return { kind: 'image', label: 'Photo', thumbnailUri };
    case 'video':
      return { kind: 'video', label: 'Video', thumbnailUri };
    case 'audio':
      return { kind: 'audio', label: 'Audio', thumbnailUri: null };
    case 'file':
      return {
        kind: 'file',
        label: descriptor?.fileName || plaintextAttachment?.filename || 'Document',
        thumbnailUri: null,
      };
    default:
      return { kind: 'text', label: content || 'Message', thumbnailUri: null };
  }
}
