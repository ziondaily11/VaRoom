import type { ChatMessage } from '../chatCache';
import type { MessageStatus } from './chatMedia';
import { photoCaption } from './messageActions';

// Up to 4 photos sent together share an album id. Each stays its own message
// (replies, deletion, ticks); the thread shows a run of them as one collage.

export const ALBUM_MAX = 4;

const IMAGE_NAME = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i;

export function isImageFile(file: Pick<File, 'type' | 'name'>): boolean {
  return /^image\//i.test(file.type || '') || IMAGE_NAME.test(file.name || '');
}

/** Adds images to the photos waiting to be sent, at most ALBUM_MAX; `dropped` counts the rest. */
export function addToSelection<T extends Pick<File, 'type' | 'name'>>(current: T[], incoming: T[]): { files: T[]; dropped: number } {
  const images = incoming.filter(isImageFile);
  const room = Math.max(0, ALBUM_MAX - current.length);
  return { files: [...current, ...images.slice(0, room)], dropped: Math.max(0, images.length - room) };
}

function inAlbumWith(message: ChatMessage, first: ChatMessage): boolean {
  return Boolean(message.album_id)
    && message.album_id === first.album_id
    && message.sender_id === first.sender_id
    && !message.deleted_at;
}

/**
 * The album starting at this message (its photos, in order), 'member' when an
 * earlier message already shows it, or null for a message outside an album.
 * A deleted photo leaves its album (it shows as deleted on its own).
 */
export function albumAt<T extends ChatMessage>(messages: T[], index: number): T[] | 'member' | null {
  const message = messages[index];
  if (!message || !message.album_id || message.deleted_at) return null;
  if (index > 0 && inAlbumWith(messages[index - 1], message)) return 'member';
  const members = [message];
  for (let next = index + 1; next < messages.length && inAlbumWith(messages[next], message); next += 1) members.push(messages[next]);
  return members.length > 1 ? members : null;
}

const STATUS_ORDER: MessageStatus[] = ['sending', 'sent', 'delivered', 'read'];

/** An album's ticks: the least advanced of its photos (any still sending shows the clock). */
export function albumStatus(statuses: (MessageStatus | null)[]): MessageStatus | null {
  const known = statuses.filter((status): status is MessageStatus => Boolean(status));
  if (!known.length) return null;
  return known.reduce((least, status) => (STATUS_ORDER.indexOf(status) < STATUS_ORDER.indexOf(least) ? status : least));
}

/** A photo in the thread fits this width (px): 330 on desktop, 340 on phones. */
export function photoMaxWidth(isPhone: boolean): number {
  return isPhone ? 340 : 330;
}

/** A swipe shorter than this (px) does not page the viewer. */
export const SWIPE_MIN_PX = 40;

/** The photo viewer pages through an album: → and ← keys (1, -1), or none. */
export function viewerKeyStep(key: string, count: number): 1 | -1 | 0 {
  if (count > 1 && key === 'ArrowRight') return 1;
  if (count > 1 && key === 'ArrowLeft') return -1;
  return 0;
}

/** A swipe in the viewer: left shows the next photo, right the previous; short swipes and single photos do nothing. */
export function swipeStep(start: number | null, end: number | undefined, count: number): 1 | -1 | 0 {
  if (count < 2 || start === null || end === undefined || Math.abs(end - start) < SWIPE_MIN_PX) return 0;
  return end < start ? 1 : -1;
}

/** The album's caption: the first photo's (the one written in the preview). */
export function albumCaption(members: ChatMessage[]): string {
  for (const member of members) {
    const caption = photoCaption(member);
    if (caption) return caption;
  }
  return '';
}
