import type { ChatAttachment, ChatListingSummary } from '../chatCache';
import { messagePlainText } from './messageBody';

// The actions offered on a chat message (legacy chat-data.js openMessageMenu,
// plus Copy), and how a message is summed up in reply quotes and the pin banner.

export type MessageAction = 'reply' | 'copy' | 'pin' | 'delete_for_me' | 'delete_for_everyone';

export interface MessageActionItem {
  action: MessageAction;
  icon: string;
  label: string;
}

/** Legacy order with Copy after Reply; Copy only when there is text; "Delete for everyone" only for the sender. */
export function messageActionItems({ pinned, ownMessage, canCopy = true }: { pinned: boolean; ownMessage: boolean; canCopy?: boolean }): MessageActionItem[] {
  const items: MessageActionItem[] = [{ action: 'reply', icon: 'i-reply', label: 'Reply' }];
  if (canCopy) items.push({ action: 'copy', icon: 'i-copy', label: 'Copy' });
  items.push(
    { action: 'pin', icon: 'i-pin', label: pinned ? 'Unpin message' : 'Pin message' },
    { action: 'delete_for_me', icon: 'i-trash', label: 'Delete for me' },
  );
  if (ownMessage) items.push({ action: 'delete_for_everyone', icon: 'i-trash', label: 'Delete for everyone' });
  return items;
}

/** The parts of a message a summary needs (a full message or a reply quote). */
export interface SummarisedMessage {
  message_type?: string | null;
  body?: string | null;
  deleted_at?: string | null;
  attachment?: Pick<ChatAttachment, 'id' | 'kind' | 'original_filename'> | null;
  listing?: Pick<ChatListingSummary, 'id' | 'title'> | null;
}

function isPhoto(message: SummarisedMessage): boolean {
  return message.message_type === 'photo' || message.attachment?.kind === 'photo';
}

/** A photo's caption: its text unless that is only the file name (sent without a caption). */
export function photoCaption(message: SummarisedMessage): string {
  const text = messagePlainText(message.body).trim();
  return text && text !== message.attachment?.original_filename ? text : '';
}

/** The text Copy puts on the clipboard: a text message, or a photo's caption. */
export function messageCopyText(message: SummarisedMessage): string {
  if (isPhoto(message)) return photoCaption(message);
  if (message.message_type && message.message_type !== 'text') return '';
  return messagePlainText(message.body);
}

export interface MessageSummary {
  text: string;
  /** A photo to show as a thumbnail beside the text. */
  photoAttachmentId: string | null;
}

/** One line for reply quotes and the pin banner, like WhatsApp: "Photo", "Listing: …", "File: …". */
export function messageSummary(message: SummarisedMessage | null | undefined): MessageSummary {
  if (!message || message.deleted_at) return { text: 'This message is unavailable', photoAttachmentId: null };
  if (isPhoto(message)) return { text: photoCaption(message) || 'Photo', photoAttachmentId: message.attachment?.id || null };
  const body = messagePlainText(message.body);
  if (message.message_type === 'listing') return { text: message.listing?.title ? `Listing: ${message.listing.title}` : 'Listing', photoAttachmentId: null };
  if (message.message_type === 'file') return { text: `File: ${message.attachment?.original_filename || body || 'Attachment'}`, photoAttachmentId: null };
  if (message.message_type === 'voice') return { text: 'Voice message', photoAttachmentId: null };
  return { text: body || 'This message is unavailable', photoAttachmentId: null };
}

type ClipboardLike = Pick<DataTransfer, 'files' | 'getData'> & { items?: ArrayLike<Pick<DataTransferItem, 'kind' | 'type' | 'getAsFile'>> };

/**
 * The image in a paste (a screenshot, or "Copy image"), or null. A paste that
 * also carries text (an office app adds a picture of copied text) stays a text paste.
 */
export function pastedImage(clipboard: ClipboardLike | null): File | null {
  if (!clipboard || clipboard.getData('text/plain').trim()) return null;
  const files = Array.from(clipboard.files || []);
  const fromFiles = files.find((file) => /^image\//i.test(file.type));
  if (fromFiles) return fromFiles;
  for (const item of Array.from(clipboard.items || [])) {
    if (item.kind === 'file' && /^image\//i.test(item.type)) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
