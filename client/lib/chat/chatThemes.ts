import type { CSSProperties } from 'react';

// Message bubble themes (Chat Settings → Theme). Each sets the person's own
// ("sent") and the other person's ("received") bubbles in light and dark
// mode, on their own screen only. Colours follow the theme chart, adjusted
// where needed so text stays readable; read ticks get a colour that shows on
// each sent bubble. The page sets these as CSS variables and chats.css
// picks the light or dark set.

export type ChatThemeId = 'charcoal' | 'teal' | 'indigo' | 'beige' | 'coral';

export const DEFAULT_CHAT_THEME: ChatThemeId = 'charcoal';

interface BubbleColours {
  sent: string;
  sentText: string;
  received: string;
  receivedText: string;
  /** Read ticks on a sent bubble. */
  readTick: string;
}

export interface ChatTheme {
  id: ChatThemeId;
  label: string;
  light: BubbleColours;
  dark: BubbleColours;
}

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: 'charcoal',
    label: 'Charcoal / Cool Grey',
    light: { sent: '#3A3A3C', sentText: '#FFFFFF', received: '#E9E9EB', receivedText: '#1C1C1E', readTick: '#4ADE80' },
    dark: { sent: '#3F3F42', sentText: '#FFFFFF', received: '#A9A9AC', receivedText: '#111113', readTick: '#4ADE80' },
  },
  {
    id: 'teal',
    label: 'Teal / Aqua',
    light: { sent: '#2B807D', sentText: '#FFFFFF', received: '#CDEFEF', receivedText: '#0F2F2E', readTick: '#BAE6FD' },
    dark: { sent: '#245E5B', sentText: '#FFFFFF', received: '#7FBDB9', receivedText: '#0B2120', readTick: '#BAE6FD' },
  },
  {
    id: 'indigo',
    label: 'Deep Indigo / Lavender',
    light: { sent: '#4F4A9E', sentText: '#FFFFFF', received: '#DCD8FB', receivedText: '#1E1B4B', readTick: '#4ADE80' },
    dark: { sent: '#3F3A82', sentText: '#FFFFFF', received: '#9C93D9', receivedText: '#15123A', readTick: '#4ADE80' },
  },
  {
    id: 'beige',
    label: 'Warm Beige / Sand',
    light: { sent: '#DCC9B0', sentText: '#2B2118', received: '#F6EEE6', receivedText: '#2B2118', readTick: '#15803D' },
    dark: { sent: '#6B5E57', sentText: '#FFFFFF', received: '#BFB0A8', receivedText: '#221A16', readTick: '#4ADE80' },
  },
  {
    id: 'coral',
    label: 'Soft Coral / Peach',
    light: { sent: '#F4A3A0', sentText: '#3B1513', received: '#FCE6E1', receivedText: '#3B1513', readTick: '#166534' },
    dark: { sent: '#9E5552', sentText: '#FFFFFF', received: '#E8A6A2', receivedText: '#2E0F0E', readTick: '#4ADE80' },
  },
];

export function isChatThemeId(value: unknown): value is ChatThemeId {
  return typeof value === 'string' && CHAT_THEMES.some((theme) => theme.id === value);
}

export function chatTheme(id: unknown): ChatTheme {
  return CHAT_THEMES.find((theme) => theme.id === id) || CHAT_THEMES[0];
}

/** The theme as CSS variables (-l light, -d dark) for an element whose CSS picks the mode. */
export function chatThemeStyle(id: unknown): CSSProperties {
  const { light, dark } = chatTheme(id);
  const vars: Record<string, string> = {};
  ([['l', light], ['d', dark]] as const).forEach(([mode, colours]) => {
    vars[`--bubble-out-${mode}`] = colours.sent;
    vars[`--bubble-out-text-${mode}`] = colours.sentText;
    vars[`--bubble-in-${mode}`] = colours.received;
    vars[`--bubble-in-text-${mode}`] = colours.receivedText;
    vars[`--bubble-read-tick-${mode}`] = colours.readTick;
  });
  return vars as CSSProperties;
}

/** The bubbles' theme in Chats: the account's, or this browser's copy until the account's settings load. */
export function activeChatTheme(accountSettings: { chatTheme: ChatThemeId } | null, stored: ChatThemeId): ChatThemeId {
  return accountSettings ? accountSettings.chatTheme : stored;
}

/** The Chats shell's style: the theme's variables, hidden until Chats' stylesheet applies. */
export function chatShellStyle(id: ChatThemeId, stylesReady: boolean): CSSProperties {
  return { ...chatThemeStyle(id), ...(stylesReady ? {} : { visibility: 'hidden' as const }) };
}
