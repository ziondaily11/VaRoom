import { apiFetch } from '../api';

// "Chat" / "Message host" on a listing, wherever it appears (home feeds,
// booking page, bookings, a host's profile). The server reuses the existing
// conversation with that host (one per pair of people) or creates one, and
// Chats opens with the listing ready to ask about: the first message is sent
// with it, so the host and Elie see which listing it concerns.

/** Chats with this conversation and the listing to ask about. */
export function listingChatPath(conversationId: string, listingId: string): string {
  return `/chats?c=${encodeURIComponent(conversationId)}&listing=${encodeURIComponent(listingId)}`;
}

/** Opens the signed-in person's chat with the listing's host; returns where to go. */
export async function startListingChat(listingId: string): Promise<string> {
  const { conversationId } = await apiFetch<{ conversationId: string }>('/api/chat/conversations/start', {
    method: 'POST',
    body: { listingId },
  });
  return listingChatPath(conversationId, listingId);
}
