import { startListingChat } from '../chat/startChat';

// "Message" on a host's public page: the visitor's chat with the host, ready
// to ask about one of the host's listings, as the booking page does.

/** The host chose "Who can message you: No one" (Settings → Privacy). */
export const isMessagesOff = (error: unknown): boolean => {
  const body = error && typeof error === 'object' ? (error as { body?: { code?: unknown } }).body : null;
  return Boolean(body && body.code === 'messages_off');
};

/** Where to go: the chat, or Chats when none can be opened. Throws when the host isn't accepting new messages. */
export async function hostChatPath(hostId: string, listingId: string | null, start: (listingId: string) => Promise<string> = startListingChat): Promise<string> {
  const fallback = `/chats?host=${encodeURIComponent(hostId)}`;
  if (!listingId) return fallback;
  try {
    return await start(listingId);
  } catch (error) {
    if (isMessagesOff(error)) throw error;
    return fallback;
  }
}
