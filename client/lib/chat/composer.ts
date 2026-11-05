import type { ChatAttachment, ChatMessage, ChatReplyMessage } from '../chatCache';
import type { ChatApi } from './chatMedia';
import type { OptimisticChatMessage } from './optimisticMessages';
import { isImageFile } from './photoAlbums';
import { messagesUrl, sentMessages } from './thread';

// Sending from the Chats composer (pages/chats.tsx): text, the @reply
// command, files and photos (uploaded straight to storage, then saved as
// messages in order), and the composer's keyboard and paste rules.

/** Typed alone (not as a reply), it asks the chatbot to answer. */
export const REPLY_COMMAND = '@reply';

/** The quote shown on a sent reply at once (the server row has only the id). */
export function replyQuote(reply: ChatMessage): ChatReplyMessage {
  return {
    id: reply.id,
    sender_id: reply.sender_id,
    body: reply.body,
    deleted_at: reply.deleted_at,
    message_type: reply.message_type,
    attachment: reply.attachment,
    listing: reply.listing,
  };
}

/**
 * Sends the composer's message (legacy sendText): one send at a time
 * (`lock`); a file waiting on a phone goes as an upload with the text as its
 * caption; `@reply` runs the chatbot command; otherwise a text message, with
 * the reply and the listing asked about. `onAccepted` runs only once the
 * server has accepted it (the composer is cleared then), and failures reject.
 * Resolves with the messages created, or null when another send is running.
 */
export async function sendComposerMessage({ conversationId, content, plainText, reply, listingId, file }: {
  conversationId: string;
  /** The editor's HTML (desktop) or the textarea's text. */
  content: string;
  plainText: string;
  reply: ChatMessage | null;
  listingId: string | undefined;
  file: File | null;
}, { api, lock, uploadFile, onAccepted }: {
  api: ChatApi;
  lock: { current: boolean };
  uploadFile: (file: File, caption: string) => void;
  onAccepted: () => void;
}): Promise<ChatMessage[] | null> {
  if (lock.current) return null;
  lock.current = true;
  try {
    let res: { message?: ChatMessage; messages?: ChatMessage[] } | null = null;
    if (file) {
      // The upload shows its own sending and failed states in the thread.
      uploadFile(file, plainText ? content : file.name);
    } else if (!reply && plainText.toLowerCase() === REPLY_COMMAND) {
      res = await api<{ message?: ChatMessage; messages?: ChatMessage[] }>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/reply`, {
        method: 'POST',
        body: JSON.stringify({ command: REPLY_COMMAND }),
      });
    } else {
      res = await api<{ message?: ChatMessage; messages?: ChatMessage[] }>(messagesUrl(conversationId), {
        method: 'POST',
        body: JSON.stringify({
          content: content,
          messageType: 'text',
          replyToMessageId: reply?.id || undefined,
          listingId,
        }),
      });
    }

    // Accepted: clear the composer (also if the user has switched conversation).
    onAccepted();

    const sent = sentMessages(res);
    if (sent.length && reply && res?.message) res.message.reply_to_message = replyQuote(reply);
    return sent;
  } finally {
    lock.current = false;
  }
}

/** A host shares a listing: one listing message (legacy). Resolves with the message, if the server returned it. */
export async function postListingMessage(api: ChatApi, conversationId: string, listing: { id: string; title?: string | null }): Promise<ChatMessage | undefined> {
  const res = await api<{ message?: ChatMessage }>(messagesUrl(conversationId), {
    method: 'POST',
    body: JSON.stringify({ content: listing.title, listingId: listing.id, messageType: 'listing' }),
  });
  return res?.message;
}

/** Where a file chosen with the file button goes. Clients share photos only. */
export function fileDestination(file: File, isHost: boolean, isPhone: () => boolean): 'ignore' | 'preview' | 'hold' | 'upload' {
  if (!isHost) return 'ignore';
  // Images go to the photo preview; on phones other files wait for the send
  // button; on desktop they upload at once.
  if (isImageFile(file)) return 'preview';
  if (isPhone()) return 'hold';
  return 'upload';
}

/** The phone composer's line for a file waiting to be sent. */
export function pendingFileLabel(file: File | null, isElie: boolean): string {
  return file && !isElie ? `File: ${file.name}` : '';
}

/** Extension-to-MIME-type map for files the browser does not type. */
const MIME_EXT_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function inferMimeType(file: { name: string; type: string }): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return MIME_EXT_MAP[ext] || 'application/octet-stream';
}

/** Photos sent together share an album id; a single photo or a file has none. */
export function newAlbumId(kind: 'photo' | 'file', count: number, uuid: () => string): string | undefined {
  return kind === 'photo' && count > 1 ? uuid() : undefined;
}

/** The caption belongs to the first photo; the others (and files without one) carry their file name. */
export function uploadContent(index: number, caption: string | undefined, fileName: string): string {
  return (index === 0 ? (caption || '').trim() : '') || fileName;
}

/** An upload as it shows in the thread before the server has it. */
export function optimisticUpload({ tempId, conversationId, senderId, content, createdAt, kind, albumId, fileName, localUrl }: {
  tempId: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  kind: 'photo' | 'file';
  albumId: string | undefined;
  fileName: string;
  localUrl: string;
}): OptimisticChatMessage {
  return {
    id: tempId,
    conversation_id: conversationId,
    sender_id: senderId,
    body: content,
    created_at: createdAt,
    message_type: kind,
    album_id: albumId || null,
    // attachment is null initially; the image is shown via its local URL
    attachment: kind === 'photo' ? ({
      id: tempId,
      original_filename: fileName,
      kind: 'photo',
      status: 'pending',
    } as ChatAttachment) : null,
    _optimistic: true,
    _localUrl: localUrl,
  };
}

/**
 * Uploads one file straight to storage: the server reserves it (its
 * attachment id is reported through `onReserved`, which recognises the
 * server's copy of the message), the file is PUT to the signed URL, then
 * the upload is completed. Resolves with the attachment id.
 */
export async function uploadAttachment({ api, fetchFn, conversationId, file, kind, onReserved }: {
  api: ChatApi;
  fetchFn: typeof fetch;
  conversationId: string;
  file: File;
  kind: 'photo' | 'file';
  onReserved: (attachmentId: string) => void;
}): Promise<string> {
  const fileMimeType = inferMimeType(file);
  const initRes = await api<{ uploadUrl: string; attachmentId: string }>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/upload-init`, {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name,
      mimeType: fileMimeType,
      fileSize: file.size,
      kind: kind,
    }),
  });
  onReserved(initRes.attachmentId);
  const putRes = await fetchFn(initRes.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': fileMimeType },
    body: file,
  });
  if (!putRes.ok) throw new Error('R2 direct upload failed');
  await api(`/api/chat/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(initRes.attachmentId)}/complete`, {
    method: 'POST',
    body: '{}',
  });
  return initRes.attachmentId;
}

/**
 * Saves the uploaded files as messages in the chosen order (so an album
 * keeps its order and notifies once). Each waits for its own upload; one
 * that fails is reported through `onFailed` and the rest carry on.
 */
export async function saveAttachmentMessages({ api, conversationId, kind, albumId, uploads, onSent, onFailed }: {
  api: ChatApi;
  conversationId: string;
  kind: 'photo' | 'file';
  albumId: string | undefined;
  uploads: { tempId: string; content: string; upload: Promise<string> }[];
  onSent: (message: ChatMessage) => void;
  onFailed: (tempId: string) => void;
}): Promise<void> {
  for (let index = 0; index < uploads.length; index += 1) {
    const { tempId, content, upload } = uploads[index];
    try {
      const attachmentId = await upload;
      const res = await api<{ message?: ChatMessage }>(messagesUrl(conversationId), {
        method: 'POST',
        body: JSON.stringify({
          content,
          attachmentId,
          messageType: kind,
          ...(albumId ? { albumId } : {}),
        }),
      });
      const sent = res?.message;
      if (sent) onSent(sent);
    } catch (err) {
      console.error('Attachment upload failed:', err);
      // Marked failed so the user can dismiss it.
      onFailed(tempId);
    }
  }
}

/** A photo waiting in the preview: one object URL per file, reused while it stays. */
export function previewUrlFor(file: File, known: Map<File, string>, create: (file: File) => string): string {
  const existing = known.get(file);
  if (existing) return existing;
  const url = create(file);
  known.set(file, url);
  return url;
}

/** Releases the object URLs of photos that have left the preview. */
export function releasePreviewUrls(known: Map<File, string>, waiting: File[], revoke: (url: string) => void): void {
  known.forEach((url, file) => {
    if (!waiting.includes(file)) { revoke(url); known.delete(file); }
  });
}

/** Formatting the desktop editor can leave switched on. */
export const FORMAT_COMMANDS = ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'];

/** After a send, formatting left on in the desktop editor is turned off (legacy resetDesktopComposer). */
export function clearActiveFormatting(doc: Pick<Document, 'queryCommandState' | 'execCommand'>): void {
  FORMAT_COMMANDS.forEach((command) => {
    if (doc.queryCommandState(command)) doc.execCommand(command, false);
  });
}

interface ComposerKey { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }

/**
 * A key in the composer. Both: Escape cancels a reply. Desktop editor: Enter
 * sends (Shift+Enter is a new line) and Elie ignores Ctrl/Cmd+B/I/U. Phone
 * textarea: Enter sends only on phones.
 */
export function composerKeyAction(event: ComposerKey, { editor, isElie, replying, isPhone }: {
  editor: 'desktop' | 'phone';
  isElie: boolean;
  replying: boolean;
  isPhone: () => boolean;
}): 'block' | 'cancel-reply' | 'send' | null {
  if (editor === 'desktop' && isElie && (event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) return 'block';
  if (event.key === 'Escape' && replying) return 'cancel-reply';
  if (event.key === 'Enter' && !event.shiftKey && (editor === 'desktop' || isPhone())) return 'send';
  return null;
}

/**
 * Copies text: the Clipboard API, else a selected hidden textarea (API
 * unavailable or denied). Resolves whether it was copied.
 */
export async function copyText(text: string, { clipboard, doc }: {
  clipboard: Pick<Clipboard, 'writeText'> | undefined;
  doc: Document;
}): Promise<boolean> {
  try {
    if (!clipboard) throw new Error('No clipboard');
    await clipboard.writeText(text);
    return true;
  } catch {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    doc.body.appendChild(area);
    area.select();
    let copied = false;
    try { copied = doc.execCommand('copy'); } catch { copied = false; }
    area.remove();
    return copied;
  }
}
