import type { ChatMessage } from '../chatCache';
import { messageStatus, type ChatApi, type MessageStatus } from './chatMedia';
import type { MessageAction } from './messageActions';
import type { OptimisticChatMessage } from './optimisticMessages';

// A conversation's thread in Chats (pages/chats.tsx): what Realtime fetches,
// which messages have actions, the press and scroll rules, typing, and the
// header and navigation state.

type ThreadMessage = ChatMessage | OptimisticChatMessage;

/** The messages of a conversation, optionally only those after `since`. */
export function messagesUrl(conversationId: string, since?: string | null): string {
  let url = `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`;
  if (since) url += `?since=${encodeURIComponent(since)}`;
  return url;
}

/** A Realtime insert this page already shows (our own sends) needs no request. */
export function alreadyShown(shown: ThreadMessage[], messageId: string | undefined): boolean {
  return !messageId || shown.some((m) => m.id === messageId);
}

/** One request for everything after the newest message shown (uploads in progress are not a since point). */
export function newerMessagesUrl(conversationId: string, shown: ThreadMessage[]): string {
  const newest = [...shown].reverse().find((m) => !(m as OptimisticChatMessage)._optimistic && m.created_at);
  return messagesUrl(conversationId, newest ? newest.created_at : null);
}

/** The fetched messages the thread does not show yet. */
export function unseenMessages(shown: ThreadMessage[], fetched: ChatMessage[]): ChatMessage[] {
  return fetched.filter((m) => !shown.some((existing) => existing.id === m.id));
}

/** The thread with the sent messages added once each. */
export function appendUnseen(prev: ThreadMessage[], sent: ChatMessage[]): ThreadMessage[] {
  return [...prev, ...sent.filter((m) => !prev.some((existing) => existing.id === m.id))];
}

/** The messages a send created (one, or several for a chatbot reply). */
export function sentMessages(res: { message?: ChatMessage; messages?: ChatMessage[] } | null): ChatMessage[] {
  return res ? (res.messages || (res.message ? [res.message] : [])) : [];
}

/** The last message of a thread, null when it is empty. */
export function lastMessage(list: ChatMessage[]): ChatMessage | null {
  return list.length ? list[list.length - 1] : null;
}

/** A sync failed: the error shows only when nothing cached could be shown. */
export function showsLoadError(cached: ChatMessage[] | null): boolean {
  return !cached || cached.length === 0;
}

/**
 * Person-to-person chats only (Elie messages are not stored there). Every
 * kind of message has actions: text, photos, files, voice notes and
 * listings; not system notices, deleted messages or uploads in progress.
 */
export function canActOnMessage(m: ChatMessage, isElie: boolean): boolean {
  return (
    !isElie
    && m.message_type !== 'system'
    && !m.deleted_at
    && !(m as OptimisticChatMessage)._optimistic
  );
}

/** Long-press opens a menu after this long (ms)... */
export const LONG_PRESS_MS = 500;
/** ...unless the finger moves further than this (px). */
export const LONG_PRESS_MOVE_TOLERANCE = 12;

/** The finger moved too far for a long-press. */
export function movedTooFar(press: { x: number; y: number }, touch: { clientX: number; clientY: number }): boolean {
  return Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > LONG_PRESS_MOVE_TOLERANCE;
}

/** Links, buttons, fields and players inside a message keep their own right-click. */
export const OWN_CONTEXT_MENU_SELECTOR = 'a,button,input,textarea,video,audio';

/**
 * A right-click on a message: on phones the browser menu is suppressed (the
 * long-press opens ours); on desktop ours opens, except over a control.
 */
export function messageContextMenu(isPhone: boolean, target: Element): 'suppress' | 'native' | 'open' {
  if (isPhone) return 'suppress';
  if (target.closest(OWN_CONTEXT_MENU_SELECTOR)) return 'native';
  return 'open';
}

/** How far above the newest message (px) the thread must be to offer "back to latest". */
export const SCROLL_LATEST_THRESHOLD = 400;

export function farFromLatest(list: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return list.scrollHeight - list.scrollTop - list.clientHeight > SCROLL_LATEST_THRESHOLD;
}

/** "typing…": announced at most this often (ms) while typing, and shown this long after the last one. */
export const TYPING_SEND_INTERVAL = 2500;
export const TYPING_SHOW_MS = 4000;

/** Typing indicators (Chat Settings): on until the account's settings say otherwise. */
export function typingEnabled(chatPrefs: { typingIndicators: boolean } | null): boolean {
  return chatPrefs ? chatPrefs.typingIndicators : true;
}

/** Tell the other person "typing…": not to Elie, not with the setting off, at most every 2.5 s. */
export function shouldAnnounceTyping({ isElie, hasChannel, typingOn, lastSent, now }: {
  isElie: boolean;
  hasChannel: boolean;
  typingOn: boolean;
  lastSent: number;
  now: number;
}): boolean {
  if (isElie || !hasChannel || !typingOn) return false;
  return now - lastSent >= TYPING_SEND_INTERVAL;
}

/** Someone else's "typing" broadcast shows, with the setting on. */
export function showsTypingFrom(payload: { user_id?: string } | undefined, currentUserId: string, typingOn: boolean): boolean {
  return !(!payload?.user_id || payload.user_id === currentUserId || !typingOn);
}

/** Their message arrived: they have stopped typing. */
export function endsTyping(row: { sender_id?: string } | undefined, currentUserId: string): boolean {
  return Boolean(row?.sender_id && row.sender_id !== currentUserId);
}

/** The status under the name in the chat header (blank until presence has synced). */
export function headerStatus({ isElie, activeId, typingIn, presenceKnownId, online }: {
  isElie: boolean;
  activeId: string | null;
  typingIn: string | null;
  presenceKnownId: string | null;
  online: boolean;
}): string {
  if (isElie) return 'Your VaRoom search assistant';
  if (activeId && typingIn === activeId) return 'typing…';
  if (presenceKnownId === activeId) return online ? 'Online' : 'Offline';
  return '';
}

/**
 * The app's bottom navigation (phones and small tablets) shows with the inbox
 * only: up to 760px whenever a conversation screen is up, from 761px (side
 * by side) whenever one is open.
 */
export function conversationShowing(isPhone: boolean, mobileView: 'inbox' | 'conversation' | 'info', activeId: string | null): boolean {
  return isPhone ? mobileView !== 'inbox' : Boolean(activeId);
}

/**
 * Keeps the body's `chat-page-context` (bottom navigation hidden) in step
 * with the conversation screen, rechecked when the screen rotates. Returns
 * the cleanup.
 */
export function followConversationScreen(win: Pick<Window, 'matchMedia'>, body: HTMLElement, mobileView: 'inbox' | 'conversation' | 'info', activeId: string | null): () => void {
  const phone = win.matchMedia('(max-width: 760px)');
  const update = () => {
    body.classList.toggle('chat-page-context', conversationShowing(phone.matches, mobileView, activeId));
  };
  update();
  phone.addEventListener?.('change', update);
  return () => phone.removeEventListener?.('change', update);
}

/**
 * The four columns' classes (chats.css): up to 760px one screen shows at a
 * time (inbox, conversation or information); `has-conversation` while one
 * is open; the information column collapses or holds Chat Settings.
 */
export function chatLayoutClasses({ mobileView, activeId, isElie, infoCollapsed, chatSettingsEmbedded }: {
  mobileView: 'inbox' | 'conversation' | 'info';
  activeId: string | null;
  isElie: boolean;
  infoCollapsed: boolean;
  chatSettingsEmbedded: boolean;
}): { shell: string; contacts: string; chat: string; info: string } {
  return {
    shell: `app-shell ${mobileView === 'conversation' ? 'view-chat' : mobileView === 'info' ? 'view-info' : 'view-inbox'}${activeId ? ' has-conversation' : ''}`,
    contacts: `contacts-col${mobileView !== 'inbox' ? ' mobile-hidden' : ''}`,
    chat: `chat-col${isElie ? ' is-elie' : ''}${!activeId ? ' empty-conversation' : ''}${mobileView === 'conversation' ? ' mobile-visible' : ''}`,
    info: `info-col ${infoCollapsed ? 'collapsed' : ''}${chatSettingsEmbedded ? ' chat-settings-open' : ''}${mobileView === 'info' ? ' mobile-visible' : ''}`,
  };
}

/** A message's ticks: the user's own only, none once deleted or failed. */
export function bubbleStatus(m: ChatMessage, { isOut, isDeleted, sending }: { isOut: boolean; isDeleted: boolean; sending: boolean }): MessageStatus | null {
  return isOut && !isDeleted && !(m as OptimisticChatMessage)._failed ? messageStatus(m, sending) : null;
}

/** An upload still in progress (shown with the sending clock). */
export function uploadSending(m: ChatMessage): boolean {
  const optimistic = m as OptimisticChatMessage;
  return Boolean(optimistic._optimistic && !optimistic._failed);
}

/** An upload that failed (Failed, with Dismiss). */
export function uploadFailed(m: ChatMessage): boolean {
  const optimistic = m as OptimisticChatMessage;
  return Boolean(optimistic._optimistic && optimistic._failed);
}

/** A thread row's classes (chats.css). */
export function messageRowClass({ isSystem, isOut, isElieMessage, sameSender, isDeleted, highlighted }: {
  isSystem: boolean;
  isOut: boolean;
  isElieMessage: boolean;
  sameSender: boolean;
  isDeleted: boolean;
  highlighted: boolean;
}): string {
  return [
    'msg-row',
    isSystem ? 'system' : isOut ? 'out' : 'in',
    isElieMessage && !isOut ? 'elie-message' : '',
    sameSender ? 'same-sender' : '',
    isDeleted ? 'msg-deleted' : '',
    highlighted ? 'reply-target-highlight' : '',
  ].filter(Boolean).join(' ');
}

export const DELETE_FOR_EVERYONE_QUESTION = 'Delete this message for everyone? This cannot be undone.';

/**
 * Pin / unpin, delete for me and delete for everyone (confirmed first) go to
 * the server; then the thread and its cache are refreshed in full (pins and
 * deletions change existing messages, which a `since` sync would miss).
 * Failures are shown with the server's message.
 */
export async function runServerMessageAction({ action, messageId, conversationId, api, confirm, alert, refresh }: {
  action: Exclude<MessageAction, 'reply' | 'copy'>;
  messageId: string;
  /** The open conversation when the action runs. */
  conversationId: () => string | null;
  api: ChatApi;
  confirm: (question: string) => boolean;
  alert: (message: string) => void;
  refresh: (conversationId: string) => Promise<void>;
}): Promise<void> {
  if (action === 'delete_for_everyone' && !confirm(DELETE_FOR_EVERYONE_QUESTION)) return;
  const id = conversationId();
  if (!id) return;
  try {
    await api(`/api/chat/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    await refresh(id);
  } catch (err) {
    console.error('Unable to perform message action:', err);
    alert((err instanceof Error && err.message) || 'Unable to update message');
  }
}

/** Reports the other person in a conversation (legacy openReportSheet). */
export async function postChatReport(api: ChatApi, conversationId: string, reason: string, details: string): Promise<void> {
  await api('/api/chat/reports', {
    method: 'POST',
    body: JSON.stringify({ conversationId, reason, details: details || undefined }),
  });
}

/** The rail's links (legacy chats.html): Home, Messages, Calendar, and Analytics for hosts. */
export interface RailItem { label: string; href: string; icon: string; count?: 'chats' | 'bookings' }
export function railItems(role: 'host' | 'client'): RailItem[] {
  return [
    { label: 'Home', href: role === 'host' ? '/host-home' : '/client-home', icon: 'i-home' },
    { label: 'Messages', href: '/chats', icon: 'i-chat', count: 'chats' },
    { label: 'Calendar', href: '/bookings', icon: 'i-calendar', count: 'bookings' },
    ...(role === 'host' ? [{ label: 'Analytics', href: '/analytics', icon: 'i-chart' }] : []),
  ];
}

/** A rail click: Messages stays; a modified click opens a tab; others navigate client-side. */
export function railClick(href: string, modified: boolean): 'stay' | 'native' | 'navigate' {
  if (href === '/chats') return 'stay';
  if (modified) return 'native';
  return 'navigate';
}

/** Chat Settings on a phone: its own page, returning here. */
export function chatSettingsHref(asPath: string | undefined): string {
  return `/chat-settings?returnTo=${encodeURIComponent(asPath || '/chats')}`;
}
