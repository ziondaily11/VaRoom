import React, { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  cleanAwayMessage, COPY, DEFAULT_AWAY_MESSAGE, effectiveEmailAlertMinutes, EMAIL_ALERT_CHOICES, loadProfileSettings, readStored,
  resolveSettings, saveProfileSetting, type ChatSettingsState, type EmailAlertMinutes, type ToggleKey,
} from '../../lib/chat/chatSettings';
import { CHAT_SETTINGS_STYLES } from './chatSettingsStyles';
import AnimatedMenu, { menuItemStyle } from './AnimatedMenu';
import QuickRepliesEditor from './QuickRepliesEditor';
import BusinessHoursEditor from './BusinessHoursEditor';
import { outsideBusinessHours, type BusinessHours } from '../../lib/chat/businessHours';
import { CHAT_THEMES, chatThemeStyle, type ChatThemeId } from '../../lib/chat/chatThemes';
import { elieUsageText, fetchElieHostUsage, type ElieHostUsage } from '../../lib/elieHost';

// The chat settings (legacy VaroomChatSettings.mount): away mode for hosts,
// notifications, privacy and archived conversations. Shown in the desktop
// Chats information column and on the /chat-settings page on phones.

const ChevronIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

// anchor: the row's element id (Settings search scrolls to it).
function ToggleRow({ label, description, checked, onChange, anchor }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void; anchor?: string }) {
  const id = useId();
  return (
    // The whole row is the tap target; the switch is the one keyboard stop.
    <div className="cs-row cs-row--toggle" id={anchor} onClick={(event) => { if (!(event.target as Element).closest('.cs-switch')) onChange(!checked); }}>
      <div className="cs-row__text">
        <span className="cs-row__label" id={`${id}-label`}>{label}</span>
        {description && <p className="cs-row__desc" id={`${id}-desc`}>{description}</p>}
      </div>
      <button type="button" className="cs-switch" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-desc` : undefined} onClick={() => onChange(!checked)} />
    </div>
  );
}

/** A setting with a few choices: a button showing the current one, opening an animated list (AnimatedMenu). */
function ChoiceRow({ label, description, value, choices, onChange, anchor }: {
  label: string;
  description: string;
  anchor?: string;
  value: number;
  choices: { minutes: number; label: string }[];
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const current = choices.find((choice) => choice.minutes === value) || choices[0];

  useEffect(() => {
    if (!open) return undefined;
    window.requestAnimationFrame(() => wrapRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
    const onPointerDown = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (minutes: number) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (minutes !== value) onChange(minutes);
  };
  // ↑ ↓ move between the choices.
  const moveFocus = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const options = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>('[role="option"]') || []);
    const at = options.indexOf(document.activeElement as HTMLElement);
    options[(at + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
  };

  return (
    <div className="cs-row cs-row--choice" id={anchor}>
      <div className="cs-row__text">
        <span className="cs-row__label" id={`${id}-label`}>{label}</span>
        <p className="cs-row__desc" id={`${id}-desc`}>{description}</p>
      </div>
      <div className="cs-choice" ref={wrapRef}>
        <button
          ref={triggerRef}
          type="button"
          className="cs-select"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-label ${id}-value`}
          aria-describedby={`${id}-desc`}
          onClick={() => setOpen((was) => !was)}
          onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}
        >
          <span id={`${id}-value`}>{current.label}</span>
          <svg className="cs-select__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <AnimatedMenu open={open} placement="below-end" className="cs-choice-menu" role="listbox" aria-labelledby={`${id}-label`} onKeyDown={moveFocus}>
          {choices.map((choice, index) => (
            <button
              key={choice.minutes}
              type="button"
              role="option"
              aria-selected={choice.minutes === value}
              className="cs-choice-option vr-menu-item"
              style={menuItemStyle(index)}
              onClick={() => choose(choice.minutes)}
            >
              {choice.label}
            </button>
          ))}
        </AnimatedMenu>
      </div>
    </div>
  );
}

function NavRow({ label, description, onClick, anchor }: { label: string; description?: string; onClick: () => void; anchor?: string }) {
  const id = useId();
  return (
    <button type="button" id={anchor} className="cs-row cs-row--nav" aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-desc` : undefined} onClick={onClick}>
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

function Section({ title, children, anchor }: { title: string; children: React.ReactNode; anchor?: string }) {
  const id = useId();
  return (
    <section className="cs-section" id={anchor} aria-labelledby={id}>
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

  // Hosts: whether Elie answers while they're away, and this month's Elie actions.
  const [elieUsage, setElieUsage] = useState<ElieHostUsage | null>(null);
  useEffect(() => {
    if (role !== 'host' || !userId) return undefined;
    let cancelled = false;
    fetchElieHostUsage().then((usage) => { if (!cancelled) setElieUsage(usage); }).catch(() => { /* The row stays hidden. */ });
    return () => { cancelled = true; };
  }, [role, userId]);

  const setToggle = (key: ToggleKey, value: boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));
    void saveProfileSetting(getSupabaseClient(), userId, key, value, storage());
  };

  // Business hours: shown at once, saved once the host stops adjusting them.
  const scheduleTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (scheduleTimerRef.current) window.clearTimeout(scheduleTimerRef.current); }, []);
  const setSchedule = (awaySchedule: BusinessHours) => {
    setSettings((current) => ({ ...current, awaySchedule }));
    if (scheduleTimerRef.current) window.clearTimeout(scheduleTimerRef.current);
    scheduleTimerRef.current = window.setTimeout(() => {
      void saveProfileSetting(getSupabaseClient(), userId, 'awaySchedule', awaySchedule, storage());
    }, 600);
  };
  const outsideHours = outsideBusinessHours(settings.awaySchedule);

  const setTheme = (chatTheme: ChatThemeId) => {
    setSettings((current) => ({ ...current, chatTheme }));
    void saveProfileSetting(getSupabaseClient(), userId, 'chatTheme', chatTheme, storage());
  };

  const setEmailAlerts = (minutes: number) => {
    const emailAlertMinutes = minutes as EmailAlertMinutes;
    setSettings((current) => ({ ...current, emailAlertMinutes }));
    void saveProfileSetting(getSupabaseClient(), userId, 'emailAlertMinutes', emailAlertMinutes, storage());
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
        <Section title="Away Mode">
          <ToggleRow anchor="cs-away-mode" label="Away Mode" description={settings.awayMode ? COPY.awayOn : outsideHours ? COPY.awayOutsideHours : COPY.awayOff} checked={settings.awayMode} onChange={(v) => setToggle('awayMode', v)} />
          <NavRow anchor="cs-away-message" label="Away message" description={settings.awayMessage} onClick={editAwayMessage} />
          {elieUsage && (
            <NavRow anchor="cs-elie" label="Elie answers" description={elieUsageText(elieUsage)} onClick={() => { window.location.assign(elieUsage.plansUrl); }} />
          )}
          <ToggleRow
            anchor="cs-business-hours"
            label="Business hours"
            description={!settings.awaySchedule.enabled ? COPY.hoursOff : outsideHours ? COPY.awayOutsideHours : COPY.hoursOpen}
            checked={settings.awaySchedule.enabled}
            onChange={(enabled) => setSchedule({ ...settings.awaySchedule, enabled })}
          />
          {settings.awaySchedule.enabled && <BusinessHoursEditor value={settings.awaySchedule} onChange={setSchedule} />}
        </Section>
      )}
      {role === 'host' && (
        <Section title="Elie" anchor="cs-elie-settings">
          <ToggleRow anchor="cs-elie-away" label="Elie answers while I’m away" description={settings.elieAwayReplies ? 'Guests get your away message, then Elie’s answer.' : 'Guests get only your away message.'} checked={settings.elieAwayReplies} onChange={(v) => setToggle('elieAwayReplies', v)} />
          <ToggleRow anchor="cs-elie-new" label="Answer new enquiries" description="Elie also answers a guest’s first message when you’re not away." checked={settings.elieNewEnquiries} onChange={(v) => setToggle('elieNewEnquiries', v)} />
          <ToggleRow anchor="cs-elie-drafts" label="Save Elie’s answers as drafts" description={settings.elieAwayDrafts ? 'Elie’s answers wait in the chat for you to use or dismiss.' : 'Elie’s answers are sent to the guest straight away.'} checked={settings.elieAwayDrafts} onChange={(v) => setToggle('elieAwayDrafts', v)} />
          <ToggleRow anchor="cs-elie-listings" label="Suggest my other listings" description="Elie may add up to 3 of your other listings when they fit." checked={settings.elieSuggestListings} onChange={(v) => setToggle('elieSuggestListings', v)} />
        </Section>
      )}
      <Section title="Theme" anchor="cs-theme">
        <ThemePicker value={settings.chatTheme} onChange={setTheme} />
      </Section>
      <Section title="Notifications">
        <ToggleRow anchor="cs-message-notifications" label="Message notifications" checked={settings.messageNotifications} onChange={(v) => setToggle('messageNotifications', v)} />
        <ToggleRow anchor="cs-message-previews" label="Message previews" description="Show message text in notifications." checked={settings.messagePreviews} onChange={(v) => setToggle('messagePreviews', v)} />
        <ChoiceRow
          anchor="cs-email-alerts"
          label="Email me about unread messages"
          description="Sent once. It never includes the message."
          value={effectiveEmailAlertMinutes(settings.emailAlertMinutes, role)}
          choices={EMAIL_ALERT_CHOICES}
          onChange={setEmailAlerts}
        />
      </Section>
      <Section title="Quick Replies" anchor="cs-quick-replies">
        <QuickRepliesEditor userId={userId} />
      </Section>
      <Section title="Privacy & Messaging">
        <ToggleRow anchor="cs-read-receipts" label="Read receipts" checked={settings.readReceipts} onChange={(v) => setToggle('readReceipts', v)} />
        <ToggleRow anchor="cs-typing-indicators" label="Typing indicators" checked={settings.typingIndicators} onChange={(v) => setToggle('typingIndicators', v)} />
      </Section>
      <Section title="Conversations">
        <NavRow anchor="cs-archived" label="Archived conversations" onClick={onOpenArchived} />
      </Section>
    </div>
  );
}
