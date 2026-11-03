import type { SupabaseClient } from '@supabase/supabase-js';
import { getSafeRedirect } from '../safeRedirect';

// Chat Settings (migrated from legacy-pages/chat-settings.html). Away mode is
// the host's profiles.away_mode, which the server reads to auto-reply. The
// other settings and the away message are kept in this browser only, as
// before: there is no away_message column, and nothing reads the toggles yet.

export const STORAGE_KEY = 'varoom:chat-settings';
export const DEFAULT_AWAY_MESSAGE = '“I’m currently away and will respond as soon as I can.”';

export const COPY = {
  awayOn: 'When enabled, Varoom will automatically respond to new incoming messages while you’re away.',
  awayOff: 'Turn this on when you don’t want to manually respond to every incoming message.',
};

export interface ChatSettingsState {
  awayMode: boolean;
  messageNotifications: boolean;
  messagePreviews: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
  awayMessage: string;
}

export type ToggleKey = 'awayMode' | 'messageNotifications' | 'messagePreviews' | 'readReceipts' | 'typingIndicators';

export const DEFAULTS: ChatSettingsState = {
  awayMode: false,
  messageNotifications: true,
  messagePreviews: true,
  readReceipts: true,
  typingIndicators: true,
  awayMessage: DEFAULT_AWAY_MESSAGE,
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> | null;

export function readStored(storage: StorageLike): Partial<ChatSettingsState> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return (raw && JSON.parse(raw)) || {};
  } catch {
    return {};
  }
}

export function writeStored(storage: StorageLike, key: keyof ChatSettingsState, value: boolean | string): void {
  try {
    const stored = readStored(storage);
    storage?.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [key]: value }));
  } catch {
    // Storage unavailable: the setting lasts for this visit.
  }
}

export function cleanAwayMessage(value: unknown): string {
  const message = typeof value === 'string' ? value.trim() : '';
  return message || DEFAULT_AWAY_MESSAGE;
}

/** Settings to show: the profile's away mode wins over this browser's copy. */
export function resolveSettings(stored: Partial<ChatSettingsState>, profileAwayMode: boolean | null): ChatSettingsState {
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    awayMode: typeof profileAwayMode === 'boolean' ? profileAwayMode : bool(stored.awayMode, false),
    messageNotifications: bool(stored.messageNotifications, true),
    messagePreviews: bool(stored.messagePreviews, true),
    readReceipts: bool(stored.readReceipts, true),
    typingIndicators: bool(stored.typingIndicators, true),
    awayMessage: cleanAwayMessage(stored.awayMessage),
  };
}

/** Where Back goes on the phone page: a same-site path, never this page. */
export function backDestination(returnTo: unknown, origin: string): string {
  const safe = getSafeRedirect(typeof returnTo === 'string' ? returnTo : '', origin);
  return safe && !safe.startsWith('/chat-settings') ? safe : '/chats';
}

// The host's away mode, read once per account while the app is open.
const awayModes = new Map<string, boolean>();

export async function loadAwayMode(client: SupabaseClient, userId: string): Promise<boolean | null> {
  if (awayModes.has(userId)) return awayModes.get(userId) as boolean;
  const { data, error } = await client.from('profiles').select('away_mode').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  const value = Boolean((data as { away_mode?: boolean }).away_mode);
  awayModes.set(userId, value);
  return value;
}

/** Save away mode to the profile (the server reads it) and to this browser. */
export async function saveAwayMode(client: SupabaseClient | null, userId: string | null, value: boolean, storage: StorageLike): Promise<void> {
  writeStored(storage, 'awayMode', value);
  if (!client || !userId) return;
  awayModes.set(userId, value);
  const { error } = await client.from('profiles').update({ away_mode: value }).eq('id', userId);
  if (error) {
    awayModes.delete(userId);
    console.warn('Away mode could not be saved to your account:', error.message);
  }
}

export function clearChatSettingsCache(): void {
  awayModes.clear();
}
