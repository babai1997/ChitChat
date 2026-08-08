import * as FileSystem from 'expo-file-system';
import { encryptAttachmentBytes, decryptAttachmentBytes } from '@chitchat/e2ee';

// Phase 3 (attachments, see E2EE_PLAN.md) — encrypts a file's raw bytes on
// disk before it's ever uploaded, so Cloudinary only ever stores an opaque
// blob. The content key/nonce travel INSIDE the already-encrypted message
// envelope (a JSON "descriptor", encrypted through the exact same path a
// text message's plaintext does — see ChatInput.tsx), so this file adds no
// new session-management code of its own, only the file-bytes encryption
// and the descriptor shape.

export interface AttachmentDescriptor {
  attachmentUrl: string;
  attachmentKey: string; // base64
  attachmentNonce: string; // base64
  mimeType: string;
  fileName: string;
  size: number;
}

/**
 * Encrypts a local file (by URI) and writes the ciphertext to a new
 * temp file — React Native's FormData upload streams from a file URI, not
 * from in-memory bytes, so the ciphertext has to land on disk before
 * chatApi.uploadAttachment can reference it.
 */
export async function encryptLocalFileForUpload(
  sourceUri: string,
): Promise<{ uploadUri: string; key: string; nonce: string }> {
  const sourceFile = new FileSystem.File(sourceUri);
  const bytes = await sourceFile.bytes();
  const { ciphertext, key, nonce } = encryptAttachmentBytes(bytes);

  const encFile = new FileSystem.File(FileSystem.Paths.cache, `attachment-${Date.now()}.enc`);
  encFile.write(ciphertext);
  return { uploadUri: encFile.uri, key, nonce };
}

// Decrypted attachment blobs are cached by messageId — see
// frontend/src/services/e2eeAttachments.ts's identical rationale. On
// native, the "blob URL" is a decrypted temp file's URI instead of a
// browser Blob URL, but serves the same purpose (something an <Image>/
// <Video>/<Audio> component can point `source`/`uri` at directly).
const decryptedUriCache = new Map<string, string>();

// A message can arrive over the socket within moments of the upload
// finishing — before Cloudinary's CDN has finished propagating a freshly-
// uploaded object, a fetch for it can 404 even though the upload itself
// already succeeded. Without a retry, that transient 404 became a
// PERMANENT failure for the component instance that hit it — only leaving
// and reopening the chat (a fresh component, a fresh attempt, made after
// propagation had time to finish) ever recovered.
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

export async function decryptAttachmentToLocalUri(
  messageId: string,
  descriptor: AttachmentDescriptor,
): Promise<string> {
  const cached = decryptedUriCache.get(messageId);
  if (cached) return cached;

  const response = await fetchWithRetry(descriptor.attachmentUrl);
  const ciphertext = new Uint8Array(await response.arrayBuffer());
  const plaintext = decryptAttachmentBytes(ciphertext, descriptor.attachmentKey, descriptor.attachmentNonce);

  const ext = descriptor.fileName.includes('.') ? descriptor.fileName.split('.').pop() : 'bin';
  const decFile = new FileSystem.File(FileSystem.Paths.cache, `decrypted-${messageId}.${ext}`);
  decFile.write(plaintext);
  decryptedUriCache.set(messageId, decFile.uri);
  return decFile.uri;
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
