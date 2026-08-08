import { encryptAttachmentBytes, decryptAttachmentBytes } from '@chitchat/e2ee';

// Phase 3 (attachments, see E2EE_PLAN.md) — encrypts a file's raw bytes
// client-side before it ever reaches Cloudinary, so the server only ever
// stores an opaque blob. The content key/nonce travel INSIDE the already-
// encrypted message envelope (a JSON "descriptor", encrypted through the
// EXACT same path as a text message's plaintext — see encryptForMembers/
// encryptGroupMessage) — so this file adds no new session-management code
// of its own, only the file-bytes encryption and the descriptor shape.

export interface AttachmentDescriptor {
  attachmentUrl: string;
  attachmentKey: string; // base64
  attachmentNonce: string; // base64
  mimeType: string;
  fileName: string;
  size: number;
}

/**
 * Encrypts a file's bytes and wraps them as a File object ready to upload —
 * the filename/mimetype on THIS object describe the opaque ciphertext blob
 * (not the real file), so Cloudinary/the server never see the real name or
 * type. The real values travel separately, inside the descriptor built by
 * the caller from this function's return value once the upload resolves.
 */
export async function encryptFileForUpload(
  file: File,
): Promise<{ uploadFile: File; key: string; nonce: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { ciphertext, key, nonce } = encryptAttachmentBytes(bytes);
  const uploadFile = new File([ciphertext.slice()], 'attachment.enc', { type: 'application/octet-stream' });
  return { uploadFile, key, nonce };
}

// Decrypted attachment blobs are cached by messageId — a plaintext file
// blob decrypts identically every time (unlike a Double Ratchet message
// key, there's no single-use constraint here), but re-downloading and
// re-decrypting on every render/re-mount would be wasteful.
const blobUrlCache = new Map<string, string>();

// A message can arrive over the socket (see message.handlers.ts) within
// moments of the upload finishing — before Cloudinary's CDN has finished
// propagating a freshly-uploaded object, a fetch for it can 404 even though
// the upload itself already succeeded. Without a retry, that transient 404
// became a PERMANENT failure for the component instance that hit it —
// only a full page reload (a fresh component, a fresh attempt, made after
// propagation had time to finish) ever recovered. Retrying with backoff
// covers that window instead of surfacing it to the user as "broken."
const FETCH_RETRY_DELAYS_MS = [400, 1000, 2000];

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`Failed to download attachment (${response.status})`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < FETCH_RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, FETCH_RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

/**
 * Fetches an encrypted attachment and decrypts it into a browser-renderable
 * Blob URL, memoized per message. Callers (MessageBubble) are responsible
 * for eventually revoking stale URLs if a message is ever removed from the
 * DOM long-term — not attempted here since chatStore has no "message
 * permanently gone" signal to hook into.
 */
export async function decryptAttachmentToBlobUrl(
  messageId: string,
  descriptor: AttachmentDescriptor,
): Promise<string> {
  const cached = blobUrlCache.get(messageId);
  if (cached) return cached;

  const response = await fetchWithRetry(descriptor.attachmentUrl);
  const ciphertext = new Uint8Array(await response.arrayBuffer());
  const plaintext = decryptAttachmentBytes(ciphertext, descriptor.attachmentKey, descriptor.attachmentNonce);
  const blob = new Blob([plaintext.slice()], { type: descriptor.mimeType });
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(messageId, url);
  return url;
}

/** Parses a decrypted message's content as an attachment descriptor — returns null for anything else (plain text, malformed, etc). */
export function parseAttachmentDescriptor(content: string | null): AttachmentDescriptor | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (
      parsed &&
      typeof parsed.attachmentUrl === 'string' &&
      typeof parsed.attachmentKey === 'string' &&
      typeof parsed.attachmentNonce === 'string'
    ) {
      return parsed as AttachmentDescriptor;
    }
    return null;
  } catch {
    return null;
  }
}
