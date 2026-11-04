import { startListingChat } from '../chat/startChat';

// "Message" on a host's public page: the visitor's chat with the host, ready
// to ask about one of the host's listings, as the booking page does.

/** Where to go: the chat, or Chats when none can be opened. */
export async function hostChatPath(hostId: string, listingId: string | null, start: (listingId: string) => Promise<string> = startListingChat): Promise<string> {
  const fallback = `/chats?host=${encodeURIComponent(hostId)}`;
  if (!listingId) return fallback;
  try {
    return await start(listingId);
  } catch {
    return fallback;
  }
}
