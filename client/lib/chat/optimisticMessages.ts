import type { ChatMessage } from '../chatCache';

// Uploads shown in the thread before the server has them. When the server's
// copy arrives (the send response, a realtime insert or a full refresh) it
// takes the optimistic row's place, keeping its React key and local image, so
// the photo stays at its size instead of remounting and loading again.

export interface OptimisticChatMessage extends ChatMessage {
  /** True while the upload / persistence request is in-flight. */
  _optimistic?: boolean;
  /** Local blob URL created from the selected file for instant display. */
  _localUrl?: string;
  /** True when the upload or persistence request failed. */
  _failed?: boolean;
  /** The optimistic row's id, kept as the React key once the server copy replaces it. */
  _clientKey?: string;
}

/** The React key of a thread row: stable from the optimistic upload to the server's copy. */
export function messageKey(message: OptimisticChatMessage): string {
  return message._clientKey || message.id;
}

function adopt(server: ChatMessage, local: OptimisticChatMessage): OptimisticChatMessage {
  return { ...server, _localUrl: local._localUrl, _clientKey: local._clientKey || local.id };
}

/** The pending upload this server message is the copy of (same attachment), if any. */
function pendingFor(current: OptimisticChatMessage[], message: ChatMessage): number {
  if (!message.attachment_id) return -1;
  return current.findIndex((m) => m._optimistic && !m._failed && m.attachment_id === message.attachment_id);
}

/** Adds new server messages: an upload's copy replaces it in place; the rest are appended. */
export function mergeServerMessages(current: OptimisticChatMessage[], incoming: ChatMessage[]): OptimisticChatMessage[] {
  const next = [...current];
  for (const message of incoming) {
    if (next.some((m) => m.id === message.id)) continue;
    const index = pendingFor(next, message);
    if (index >= 0) next[index] = adopt(message, next[index]);
    else next.push(message);
  }
  return next;
}

/**
 * A full refresh: the server's list, with local images kept on messages that
 * had them, and uploads still in progress (or failed) kept at the end.
 */
export function reconcileThread(current: OptimisticChatMessage[], server: ChatMessage[]): OptimisticChatMessage[] {
  const local = new Map(current.filter((m) => !m._optimistic && m._clientKey).map((m) => [m.id, m]));
  const pending = current.filter((m) => m._optimistic);
  const adopted = new Set<OptimisticChatMessage>();
  const thread = server.map((message) => {
    const known = local.get(message.id);
    if (known) return adopt(message, known);
    const index = pendingFor(pending.filter((m) => !adopted.has(m)), message);
    if (index < 0) return message;
    const upload = pending.filter((m) => !adopted.has(m))[index];
    adopted.add(upload);
    return adopt(message, upload);
  });
  return [...thread, ...pending.filter((m) => !adopted.has(m))];
}

/** Local image URLs still referenced by a thread (the rest can be released). */
export function localUrls(thread: OptimisticChatMessage[]): Set<string> {
  return new Set(thread.map((m) => m._localUrl).filter((url): url is string => Boolean(url)));
}
