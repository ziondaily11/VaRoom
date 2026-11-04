import React, { useEffect, useId, useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  cleanAwayMessage, COPY, DEFAULT_AWAY_MESSAGE, loadProfileSettings, readStored, resolveSettings, saveProfileSetting,
  type ChatSettingsState, type ToggleKey,
} from '../../lib/chat/chatSettings';
import { CHAT_SETTINGS_STYLES } from './chatSettingsStyles';
import { CHAT_THEMES, chatThemeStyle, type ChatThemeId } from '../../lib/chat/chatThemes';

// The chat settings (legacy VaroomChatSettings.mount): away mode for hosts,
// notifications, privacy and archived conversations. Shown in the desktop
// Chats information column and on the /chat-settings page on phones.

const ChevronIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId();
  return (
    // The whole row is the tap target; the switch is the one keyboard stop.
    <div className="cs-row cs-row--toggle" onClick={(event) => { if (!(event.target as Element).closest('.cs-switch')) onChange(!checked); }}>
      <div className="cs-row__text">
        <span className="cs-row__label" id={`${id}-label`}>{label}</span>
        <p className="cs-row__desc" id={`${id}-desc`}>{description}</p>
      </div>
      <button type="button" className="cs-switch" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} aria-describedby={`${id}-desc`} onClick={() => onChange(!checked)} />
    </div>
  );
}

function NavRow({ label, description, onClick }: { label: string; description?: string; onClick: () => void }) {
  const id = useId();
  return (
    <button type="button" className="cs-row cs-row--nav" aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-desc` : undefined} onClick={onClick}>
      <div className="cs-row__text">
        <span className="cs-row__label" id={`${id}-label`}>{label}</span>
        {description && <p className="cs-row__desc" id={`${id}-desc`}>{description}</p>}
      </div>
      <span className="cs-row__chevron"><ChevronIcon /></span>
    </button>
  );
}

/** The bubble themes as small previews (sent above received), in this mode's colours. */
function ThemePicker({ value, onChange }: { value: ChatThemeId; onChange: (theme: ChatThemeId) => void }) {
  return (
    <div className="cs-themes" role="radiogroup" aria-label="Message bubble colours">
      {CHAT_THEMES.map((theme) => {
        const selected = theme.id === value;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`cs-theme${selected ? ' is-selected' : ''}`}
            style={chatThemeStyle(theme.id)}
            onClick={() => onChange(theme.id)}
          >
            <span className="cs-theme__bubbles" aria-hidden="true">
              <span className="cs-theme__out" />
              <span className="cs-theme__in" />
            </span>
            <span className="cs-theme__label">{theme.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section className="cs-section" aria-labelledby={id}>
      <h2 className="cs-section__title" id={id}>{title}</h2>
      <div className="cs-section__list">{children}</div>
    </section>
  );
}

export function ChatSettingsStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CHAT_SETTINGS_STYLES }} />;
}

export default function ChatSettings({ role, onOpenArchived }: { role: 'host' | 'client'; onOpenArchived: () => void }) {
  const { user } = useAuth();
  const userId = user?.id || null;
  // Defaults first: the page is prerendered, and this browser's values are
  // applied after mounting so the first render matches the server HTML.
  const [settings, setSettings] = useState<ChatSettingsState>(() => resolveSettings({}, null));
  // Runs before the profile's settings arrive (below), which then win.
  useEffect(() => { setSettings(resolveSettings(readStored(storage()), null)); }, []);

  // Every setting lives on the profile.
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !userId) return undefined;
    let cancelled = false;
    loadProfileSettings(client, userId).then((profile) => {
      if (!cancelled && profile) setSettings(resolveSettings({}, profile));
    }).catch(() => { /* Shown from this browser's copy. */ });
    return () => { cancelled = true; };
  }, [userId]);

  const setToggle = (key: ToggleKey, value: boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));
    void saveProfileSetting(getSupabaseClient(), userId, key, value, storage());
  };

  const setTheme = (chatTheme: ChatThemeId) => {
    setSettings((current) => ({ ...current, chatTheme }));
    void saveProfileSetting(getSupabaseClient(), userId, 'chatTheme', chatTheme, storage());
  };

  const editAwayMessage = () => {
    const next = window.prompt('Edit away message', settings.awayMessage || DEFAULT_AWAY_MESSAGE);
    if (next === null) return;
    const clean = cleanAwayMessage(next);
    setSettings((current) => ({ ...current, awayMessage: clean }));
    void saveProfileSetting(getSupabaseClient(), userId, 'awayMessage', clean, storage());
  };

  return (
    <div className="cs">
      {role === 'host' && (
        <Section title="AWAY MODE">
          <ToggleRow label="Away Mode" description={settings.awayMode ? COPY.awayOn : COPY.awayOff} checked={settings.awayMode} onChange={(v) => setToggle('awayMode', v)} />
          <NavRow label="Away message" description={settings.awayMessage} onClick={editAwayMessage} />
        </Section>
      )}
      <Section title="THEME">
        <ThemePicker value={settings.chatTheme} onChange={setTheme} />
      </Section>
      <Section title="NOTIFICATIONS">
        <ToggleRow label="Message notifications" description="Receive notifications for new messages." checked={settings.messageNotifications} onChange={(v) => setToggle('messageNotifications', v)} />
        <ToggleRow label="Message previews" description="Show message content in notifications." checked={settings.messagePreviews} onChange={(v) => setToggle('messagePreviews', v)} />
      </Section>
      <Section title="PRIVACY & MESSAGING">
        <ToggleRow label="Read receipts" description="Let others know when you’ve read their messages." checked={settings.readReceipts} onChange={(v) => setToggle('readReceipts', v)} />
        <ToggleRow label="Typing indicators" description="Show others when you’re typing." checked={settings.typingIndicators} onChange={(v) => setToggle('typingIndicators', v)} />
      </Section>
      <Section title="CONVERSATIONS">
        <NavRow label="Archived conversations" onClick={onOpenArchived} />
      </Section>
    </div>
  );
}
