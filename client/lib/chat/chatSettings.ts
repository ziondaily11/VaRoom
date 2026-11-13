import type { SupabaseClient } from '@supabase/supabase-js';
import { getSafeRedirect } from '../safeRedirect';
import { DEFAULT_CHAT_THEME, isChatThemeId, type ChatThemeId } from './chatThemes';
import { DEFAULT_BUSINESS_HOURS, readBusinessHours, type BusinessHours } from './businessHours';

// Chat Settings (migrated from legacy-pages/chat-settings.html). Every
// setting is saved on the profile, where it takes effect:
// - away_mode, away_message, away_schedule: auto-reply sends the away message,
//   then Elie, while Away mode is on or outside the business hours;
// - message_notifications: "New message" notifications are created;
// - message_previews: notifications show the message (decrypted on view);
// - read_receipts: read ticks; typing_indicators: "typing…" in a chat;
// - chat_theme: the colours of message bubbles on this person's screen.
// This browser keeps a copy, shown until the profile has loaded.

export const STORAGE_KEY = 'varoom:chat-settings';
export const DEFAULT_AWAY_MESSAGE = '“I’m currently away and will respond as soon as I can.”';

export const COPY = {
  awayOn: 'When enabled, Varoom will automatically respond to new incoming messages while you’re away.',
  awayOff: 'Turn this on when you don’t want to manually respond to every incoming message.',
  awayOutsideHours: 'Away now: outside your business hours, guests get your away message.',
  hoursOff: 'Be away automatically outside the hours you set.',
  hoursOpen: 'Open now. Outside these hours you’re away automatically.',
};

export interface ChatSettingsState {
  awayMode: boolean;
  messageNotifications: boolean;
  messagePreviews: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
  awayMessage: string;
  chatTheme: ChatThemeId;
  /** Minutes before an unread message is emailed about (0 never); null: the account's default. */
  emailAlertMinutes: EmailAlertMinutes | null;
  /** Business hours: away automatically outside them (lib/chat/businessHours). */
  awaySchedule: BusinessHours;
}

export type EmailAlertMinutes = 0 | 15 | 60;
export const EMAIL_ALERT_CHOICES: { minutes: EmailAlertMinutes; label: string }[] = [
  { minutes: 15, label: 'After 15 minutes' },
  { minutes: 60, label: 'After 1 hour' },
  { minutes: 0, label: 'Never' },
];
const asAlertMinutes = (value: unknown): EmailAlertMinutes | null => (value === 0 || value === 15 || value === 60 ? value : null);

/** The email timing in effect: the person's choice, else hosts after 15 minutes and clients never (as the server). */
export function effectiveEmailAlertMinutes(value: EmailAlertMinutes | null, role: 'host' | 'client'): EmailAlertMinutes {
  return value ?? (role === 'host' ? 15 : 0);
}

export type ToggleKey = 'awayMode' | 'messageNotifications' | 'messagePreviews' | 'readReceipts' | 'typingIndicators';

export const DEFAULTS: ChatSettingsState = {
  awayMode: false,
  messageNotifications: true,
  messagePreviews: true,
  readReceipts: true,
  typingIndicators: true,
  awayMessage: DEFAULT_AWAY_MESSAGE,
  chatTheme: DEFAULT_CHAT_THEME,
  emailAlertMinutes: null,
  awaySchedule: DEFAULT_BUSINESS_HOURS,
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

export function writeStored(storage: StorageLike, key: keyof ChatSettingsState, value: ChatSettingsState[keyof ChatSettingsState]): void {
  try {
    const stored = readStored(storage);
    storage?.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [key]: value }));
  } catch {
    // Storage unavailable: the setting lasts for this visit.
  }
}

/** The longest away message the profile keeps. */
export const AWAY_MESSAGE_MAX = 500;

export function cleanAwayMessage(value: unknown): string {
  const message = typeof value === 'string' ? value.trim().slice(0, AWAY_MESSAGE_MAX) : '';
  return message || DEFAULT_AWAY_MESSAGE;
}

/** The settings saved on the profile (null: not loaded). */
export type ProfileChatSettings = ChatSettingsState;
export type ProfileSettingKey = keyof ProfileChatSettings;

const PROFILE_COLUMNS: Record<ProfileSettingKey, string> = {
  awayMode: 'away_mode',
  awayMessage: 'away_message',
  messageNotifications: 'message_notifications',
  messagePreviews: 'message_previews',
  readReceipts: 'read_receipts',
  typingIndicators: 'typing_indicators',
  chatTheme: 'chat_theme',
  emailAlertMinutes: 'email_alert_minutes',
  awaySchedule: 'away_schedule',
};

/** Settings to show: the profile's values win over this browser's copy. */
export function resolveSettings(stored: Partial<ChatSettingsState>, profile: ProfileChatSettings | null): ChatSettingsState {
  if (profile) return { ...profile };
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    awayMode: bool(stored.awayMode, false),
    messageNotifications: bool(stored.messageNotifications, true),
    messagePreviews: bool(stored.messagePreviews, true),
    readReceipts: bool(stored.readReceipts, true),
    typingIndicators: bool(stored.typingIndicators, true),
    awayMessage: cleanAwayMessage(stored.awayMessage),
    chatTheme: isChatThemeId(stored.chatTheme) ? stored.chatTheme : DEFAULT_CHAT_THEME,
    emailAlertMinutes: asAlertMinutes(stored.emailAlertMinutes),
    awaySchedule: readBusinessHours(stored.awaySchedule),
  };
}

/** A profile row's settings; unset switches are on (away mode off). */
export function profileSettingsFromRow(row: Record<string, unknown>): ProfileChatSettings {
  return {
    awayMode: row.away_mode === true,
    awayMessage: cleanAwayMessage(row.away_message),
    messageNotifications: row.message_notifications !== false,
    messagePreviews: row.message_previews !== false,
    readReceipts: row.read_receipts !== false,
    typingIndicators: row.typing_indicators !== false,
    chatTheme: isChatThemeId(row.chat_theme) ? row.chat_theme : DEFAULT_CHAT_THEME,
    emailAlertMinutes: asAlertMinutes(row.email_alert_minutes),
    awaySchedule: readBusinessHours(row.away_schedule),
  };
}

/** Where Back goes on the phone page: a same-site path, never this page. */
export function backDestination(returnTo: unknown, origin: string): string {
  const safe = getSafeRedirect(typeof returnTo === 'string' ? returnTo : '', origin);
  return safe && !safe.startsWith('/chat-settings') ? safe : '/chats';
}

// The profile's settings, read once per account while the app is open;
// pages that act on them (Chats, Notifications) follow changes as they are saved.
const profileSettings = new Map<string, ProfileChatSettings>();
const inFlight = new Map<string, Promise<ProfileChatSettings | null>>();
const listeners = new Map<string, Set<(settings: ProfileChatSettings) => void>>();

function publish(userId: string, settings: ProfileChatSettings): void {
  listeners.get(userId)?.forEach((listener) => listener(settings));
}

/** Calls `listener` whenever this account's saved settings change; returns the unsubscribe. */
export function subscribeProfileSettings(userId: string, listener: (settings: ProfileChatSettings) => void): () => void {
  const set = listeners.get(userId) || new Set();
  set.add(listener);
  listeners.set(userId, set);
  return () => { set.delete(listener); };
}

export function cachedProfileSettings(userId: string): ProfileChatSettings | null {
  return profileSettings.get(userId) || null;
}

export async function loadProfileSettings(client: SupabaseClient, userId: string): Promise<ProfileChatSettings | null> {
  const known = profileSettings.get(userId);
  if (known) return known;
  const pending = inFlight.get(userId);
  if (pending) return pending;
  const request = (async () => {
    const { data, error } = await client.from('profiles').select(Object.values(PROFILE_COLUMNS).join(',')).eq('id', userId).maybeSingle();
    if (error || !data) return null;
    const value = profileSettingsFromRow(data as unknown as Record<string, unknown>);
    profileSettings.set(userId, value);
    publish(userId, value);
    return value;
  })().finally(() => inFlight.delete(userId));
  inFlight.set(userId, request);
  return request;
}

/** Save a profile setting (the server reads it) and keep it in this browser. */
export async function saveProfileSetting<K extends ProfileSettingKey>(client: SupabaseClient | null, userId: string | null, key: K, value: ProfileChatSettings[K], storage: StorageLike): Promise<void> {
  writeStored(storage, key, value);
  if (!client || !userId) return;
  const previous = profileSettings.get(userId);
  if (previous) {
    const next = { ...previous, [key]: value };
    profileSettings.set(userId, next);
    publish(userId, next);
  }
  const { error } = await client.from('profiles').update({ [PROFILE_COLUMNS[key]]: value }).eq('id', userId);
  if (error) {
    profileSettings.delete(userId);
    console.warn('Chat setting could not be saved to your account:', error.message);
  }
}

export function clearChatSettingsCache(): void {
  profileSettings.clear();
  inFlight.clear();
}
