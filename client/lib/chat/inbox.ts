import type { ParsedUrlQuery } from 'querystring';
import type { ChatConversation, ChatMessage } from '../chatCache';
import type { ChatApi } from './chatMedia';

// The Chats inbox: order, previews, search, the archived view, selection
// mode, and the archive / delete requests (pages/chats.tsx).

export type InboxView = 'all' | 'archived';
export type ChatRole = 'host' | 'client';

/** When a conversation last changed: its last message, else when it began. */
export function conversationTime(c: ChatConversation): number {
  return new Date(c.lastMessage?.created_at || c.created_at || 0).getTime();
}

/**
 * The inbox follows the newest message: the conversation's preview updated,
 * newest first (legacy updateConversationPreview). `null` when a thread is
 * empty. The same array comes back when nothing changed (no re-render).
 */
export function bumpInbox(prev: ChatConversation[], conversationId: string, lastMessage: ChatMessage | null): ChatConversation[] {
  const index = prev.findIndex((c) => c.id === conversationId);
  if (index < 0) return prev;
  const current = prev[index];
  const unchanged = (current.lastMessage?.id || null) === (lastMessage?.id || null)
    && (current.lastMessage?.deleted_at || null) === (lastMessage?.deleted_at || null);
  if (unchanged) return prev;
  const next = prev.slice();
  next[index] = { ...current, lastMessage };
  return next.sort((a, b) => conversationTime(b) - conversationTime(a));
}

/** Chats the server refused to delete go back into the inbox, newest first. */
export function restoreChats(prev: ChatConversation[], failed: ChatConversation[]): ChatConversation[] {
  return [...prev, ...failed.filter((f) => !prev.some((c) => c.id === f.id))]
    .sort((a, b) => conversationTime(b) - conversationTime(a));
}

/** A clean, readable plain-text preview for an inbox row (no literal HTML tags). */
export function conversationPreview(m?: ChatMessage | null): string {
  if (!m) return '';
  if (m.deleted_at) return 'This message was deleted';

  const raw = m.body || '';
  let plain = '';
  if (raw) {
    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
      try {
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        doc.querySelectorAll('script, style, template').forEach((el) => el.remove());
        doc.querySelectorAll('br').forEach((el) => el.replaceWith(' '));
        doc.querySelectorAll('p, div, li').forEach((el) => el.appendChild(doc.createTextNode(' ')));
        plain = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
      } catch {
        plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    } else {
      plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  if (plain) return plain;

  // Media / attachment previews when there is no text caption.
  if (m.message_type === 'photo' || (m.attachment && m.attachment.kind === 'photo')) {
    return 'Photo';
  }
  if (m.message_type === 'file' || (m.attachment && m.attachment.kind === 'file')) {
    return m.attachment?.original_filename || 'Attachment';
  }
  if (m.attachment) {
    return m.attachment.original_filename || 'Attachment';
  }

  return '';
}

/** The chats in this view (inbox or archived) that match the search (name, username or preview). */
export function filterInbox(conversations: ChatConversation[], inboxView: InboxView, searchQuery: string): ChatConversation[] {
  const inView = conversations.filter((c) => Boolean(c.archived) === (inboxView === 'archived'));
  if (!searchQuery.trim()) return inView;
  const q = searchQuery.toLowerCase();
  return inView.filter((c) => {
    const name = c.participant?.full_name?.toLowerCase() || '';
    const username = c.participant?.username?.toLowerCase() || '';
    const last = conversationPreview(c.lastMessage).toLowerCase();
    return name.includes(q) || username.includes(q) || last.includes(q);
  });
}

/** Selection mode: ticks or unticks a chat; unticking the last leaves selection mode (null). */
export function toggleSelection(current: Set<string> | null, conversationId: string): Set<string> | null {
  const next = new Set(current || []);
  if (next.has(conversationId)) next.delete(conversationId); else next.add(conversationId);
  return next.size ? next : null;
}

export type InboxAction = 'archive' | 'unarchive' | 'delete' | 'select';

/** An inbox chat's menu (right-click, or long-press on phones). */
export function inboxMenuItems(archived: boolean | undefined): { action: InboxAction; icon: string; label: string }[] {
  return [
    archived
      ? { action: 'unarchive' as const, icon: 'i-archive', label: 'Unarchive chat' }
      : { action: 'archive' as const, icon: 'i-archive', label: 'Archive chat' },
    { action: 'delete' as const, icon: 'i-trash', label: 'Delete chat' },
    { action: 'select' as const, icon: 'i-check', label: 'Select chats' },
  ];
}

/** The other person's name in Delete chat's question. */
export function chatName(c: ChatConversation): string {
  return c.participant?.full_name || c.participant?.username || 'this person';
}

/** Delete chat asks once, for one chat or many. */
export function deleteChatsQuestion(chats: ChatConversation[]): string {
  return chats.length === 1
    ? `Delete your chat with ${chatName(chats[0])}? Its messages will be cleared for you. ${chatName(chats[0])} keeps their copy.`
    : `Delete ${chats.length} chats? Their messages will be cleared for you. The other people keep their copies.`;
}

/** A status note and how long it shows (undefined: the default). */
export interface StatusNote { text: string; ms?: number }

const chatsNoun = (count: number) => (count === 1 ? 'Chat' : `${count} chats`);

/** After archiving or unarchiving: how many were done, or how many were refused. */
export function archiveStatusNote(done: number, failed: number, archived: boolean): StatusNote {
  if (!failed) return { text: `${chatsNoun(done)} ${archived ? 'archived' : 'unarchived'}` };
  return { text: `${chatsNoun(failed)} not ${archived ? 'archived' : 'unarchived'}. Please try again.`, ms: 3500 };
}

/** After deleting chats: done, or how many were refused. */
export function deleteStatusNote(total: number, failed: number): StatusNote {
  if (failed) return { text: `${failed === 1 ? 'Chat' : `${failed} chats`} not deleted. Please try again.`, ms: 3500 };
  return { text: total === 1 ? 'Chat deleted' : `${total} chats deleted` };
}

/** Archives or unarchives each chat on the server; the ids it refused. */
export async function archiveOnServer(api: ChatApi, conversationIds: string[], archived: boolean): Promise<string[]> {
  const results = await Promise.allSettled(conversationIds.map((id) => (
    api(`/api/chat/conversations/${encodeURIComponent(id)}/archive`, { method: 'POST', body: JSON.stringify({ archived }) })
  )));
  return conversationIds.filter((_, index) => results[index].status === 'rejected');
}

/**
 * Deletes each chat for this person on the server. `cleared`: every
 * conversation the server cleared (all of theirs with that person);
 * `failed`: the chats it refused.
 */
export async function deleteOnServer(api: ChatApi, chats: ChatConversation[]): Promise<{ cleared: string[]; failed: ChatConversation[] }> {
  const results = await Promise.allSettled(chats.map((c) => (
    api<{ conversationIds?: string[] }>(`/api/chat/conversations/${encodeURIComponent(c.id)}/delete`, { method: 'POST', body: '{}' })
  )));
  const cleared: string[] = [];
  const failed: ChatConversation[] = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected') { failed.push(chats[index]); return; }
    const returned = result.value.conversationIds;
    cleared.push(...(returned && returned.length ? returned : [chats[index].id]));
  });
  return { cleared, failed };
}

/** The empty inbox's wording (legacy). */
export function emptyInboxCopy(role: ChatRole): { heading: string; detail: string } {
  return role === 'host'
    ? { heading: 'No conversations yet', detail: 'When clients reach out, your conversations will appear here.' }
    : { heading: 'Start a conversation', detail: 'Chat with a host and your conversations will appear here.' };
}

/** The conversation a deep link asks for (?c= or ?conversation=), unless it is already open. */
export function requestedConversation(c: string | undefined, conversation: string | undefined, activeId: string | null): string | null {
  const requested = c || conversation || null;
  return requested && requested !== activeId ? requested : null;
}

/** The URL query once a conversation is opened (?c=), or null when the URL already names it. */
export function conversationRouteQuery(currentQuery: ParsedUrlQuery, id: string): ParsedUrlQuery | null {
  if (currentQuery.c === id || currentQuery.conversation === id) return null;
  const nextQuery: ParsedUrlQuery = { ...currentQuery, c: id };
  delete nextQuery.conversation;
  return nextQuery;
}
