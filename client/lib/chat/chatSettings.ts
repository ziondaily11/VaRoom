import type { SupabaseClient } from '@supabase/supabase-js';
import { getSafeRedirect } from '../safeRedirect';

// Chat Settings (migrated from legacy-pages/chat-settings.html). Away mode
// (profiles.away_mode, the server's auto-reply) and read receipts
// (profiles.read_receipts, the server's read ticks) live on the profile. The
// other settings and the away message are kept in this browser only, as
// before: there is no away_message column, and nothing reads those toggles yet.

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

/** The settings saved on the profile (null: not loaded). */
export type ProfileChatSettings = Pick<ChatSettingsState, 'awayMode' | 'readReceipts'>;
export type ProfileSettingKey = keyof ProfileChatSettings;

const PROFILE_COLUMNS: Record<ProfileSettingKey, string> = { awayMode: 'away_mode', readReceipts: 'read_receipts' };

/** Settings to show: the profile's values win over this browser's copy. */
export function resolveSettings(stored: Partial<ChatSettingsState>, profile: ProfileChatSettings | null): ChatSettingsState {
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    awayMode: profile ? profile.awayMode : bool(stored.awayMode, false),
    messageNotifications: bool(stored.messageNotifications, true),
    messagePreviews: bool(stored.messagePreviews, true),
    readReceipts: profile ? profile.readReceipts : bool(stored.readReceipts, true),
    typingIndicators: bool(stored.typingIndicators, true),
    awayMessage: cleanAwayMessage(stored.awayMessage),
  };
}

/** Where Back goes on the phone page: a same-site path, never this page. */
export function backDestination(returnTo: unknown, origin: string): string {
  const safe = getSafeRedirect(typeof returnTo === 'string' ? returnTo : '', origin);
  return safe && !safe.startsWith('/chat-settings') ? safe : '/chats';
}

// The profile's settings, read once per account while the app is open.
const profileSettings = new Map<string, ProfileChatSettings>();

export async function loadProfileSettings(client: SupabaseClient, userId: string): Promise<ProfileChatSettings | null> {
  const known = profileSettings.get(userId);
  if (known) return known;
  const { data, error } = await client.from('profiles').select('away_mode,read_receipts').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  const row = data as { away_mode?: boolean; read_receipts?: boolean | null };
  const value = { awayMode: Boolean(row.away_mode), readReceipts: row.read_receipts !== false };
  profileSettings.set(userId, value);
  return value;
}

/** Save a profile setting (the server reads it) and keep it in this browser. */
export async function saveProfileSetting(client: SupabaseClient | null, userId: string | null, key: ProfileSettingKey, value: boolean, storage: StorageLike): Promise<void> {
  writeStored(storage, key, value);
  if (!client || !userId) return;
  const previous = profileSettings.get(userId);
  if (previous) profileSettings.set(userId, { ...previous, [key]: value });
  const { error } = await client.from('profiles').update({ [PROFILE_COLUMNS[key]]: value }).eq('id', userId);
  if (error) {
    profileSettings.delete(userId);
    console.warn('Chat setting could not be saved to your account:', error.message);
  }
}

export function clearChatSettingsCache(): void {
  profileSettings.clear();
}
