import React, { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { ICON_PHONE } from '../../lib/booking/bookingIcons';
import {
  contactFieldValues, contactPatch, DEFAULT_REACH_OUT, loadReachOut, saveReachOut, type ReachOutSettings, type ReachToggleKey,
} from '../../lib/reachOut/reachOut';
import Svg from '../booking/Svg';

// Reach Out (Your Account, hosts): the phone, WhatsApp number and email
// clients see on this host's booking pages, and which of those channels are
// offered. Empty fields, or values equal to the account's, follow the
// account's details. The icons are the booking page's own.

type Msg = { text: string; kind: '' | 'success' | 'error' };

const CHANNELS: Array<{ key: ReachToggleKey; label: string; icon: React.ReactNode }> = [
  { key: 'whatsapp_enabled', label: 'WhatsApp', icon: <img src="/assets/whatsapp.svg" alt="" aria-hidden="true" /> },
  { key: 'email_enabled', label: 'Email', icon: <img src="/assets/gmail.svg" alt="" aria-hidden="true" /> },
  { key: 'phone_enabled', label: 'Phone', icon: <Svg markup={ICON_PHONE} /> },
];

export default function ReachOutSection({ userId, accountPhone, accountEmail }: { userId: string; accountPhone: string | null; accountEmail: string }) {
  const [saved, setSaved] = useState<ReachOutSettings | null>(null);
  const [fields, setFields] = useState({ phone: '', whatsapp: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [fieldsMsg, setFieldsMsg] = useState<Msg>({ text: '', kind: '' });
  const [togglesMsg, setTogglesMsg] = useState<Msg>({ text: '', kind: '' });
  const account = { phone: accountPhone, email: accountEmail };

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return undefined;
    let cancelled = false;
    loadReachOut(client, userId).then((value) => {
      if (cancelled) return;
      setSaved(value);
      setFields(contactFieldValues(value, { phone: accountPhone, email: accountEmail }));
    }, (error: unknown) => {
      console.error('Settings could not load your Reach Out details:', error);
      if (!cancelled) setFieldsMsg({ text: 'Your contact options could not be loaded. Please refresh to try again.', kind: 'error' });
    });
    return () => { cancelled = true; };
  }, [userId, accountPhone, accountEmail]);

  const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setFields((current) => ({ ...current, [key]: value }));
  };

  const saveFields = async () => {
    const client = getSupabaseClient();
    if (!client || !saved) return;
    const result = contactPatch(fields, account);
    if ('error' in result) { setFieldsMsg({ text: result.error, kind: 'error' }); return; }
    setSaving(true);
    const error = await saveReachOut(client, userId, result.patch);
    setSaving(false);
    if (error) { setFieldsMsg({ text: 'Your contact details could not be saved. Please try again.', kind: 'error' }); return; }
    const next = { ...saved, ...result.patch };
    setSaved(next);
    setFields(contactFieldValues(next, account));
    setFieldsMsg({ text: 'Contact details saved. Your booking pages now show them.', kind: 'success' });
  };

  const toggle = async (key: ReachToggleKey, value: boolean) => {
    const client = getSupabaseClient();
    if (!client || !saved) return;
    setSaved((current) => (current ? { ...current, [key]: value } : current));
    setTogglesMsg({ text: '', kind: '' });
    const error = await saveReachOut(client, userId, { [key]: value });
    if (error) {
      setSaved((current) => (current ? { ...current, [key]: !value } : current));
      setTogglesMsg({ text: 'That change could not be saved. Please try again.', kind: 'error' });
    }
  };

  const ready = Boolean(saved);
  const values = saved || DEFAULT_REACH_OUT;

  return (
    <div className="settings-section" id="reach-out">
      <p className="section-title">Reach Out</p>
      <div className="card">
        <div className="reach-fields">
          <p className="inline-msg neutral reach-intro">How clients contact you from your listings. Empty fields use your account&apos;s phone and email.</p>
          <div className="field">
            <label htmlFor="reach-phone-input">Phone number</label>
            <input type="tel" id="reach-phone-input" autoComplete="tel" value={fields.phone} disabled={!ready} onChange={set('phone')} />
          </div>
          <div className="field">
            <label htmlFor="reach-whatsapp-input">WhatsApp number</label>
            <input type="tel" id="reach-whatsapp-input" value={fields.whatsapp} disabled={!ready} onChange={set('whatsapp')} />
          </div>
          <div className="field">
            <label htmlFor="reach-email-input">Email address</label>
            <input type="email" id="reach-email-input" autoComplete="email" value={fields.email} disabled={!ready} onChange={set('email')} />
          </div>
          <button type="button" className="btn" disabled={!ready || saving} onClick={() => { void saveFields(); }}>{saving ? 'Saving…' : 'Save contact details'}</button>
          <p className={`inline-msg${fieldsMsg.kind ? ` ${fieldsMsg.kind}` : ''}`} role="status">{fieldsMsg.text}</p>
        </div>
      </div>
      <p className="section-title reach-subtitle">Ways you can be reached</p>
      <div className="card">
        {CHANNELS.map((channel) => (
          <div className="toggle-row" key={channel.key}>
            <div className="reach-channel">
              <span className="info-icon reach-icon">{channel.icon}</span>
              <span className="toggle-label">{channel.label}</span>
            </div>
            <label className="switch" aria-label={`Clients can reach you by ${channel.label}`}>
              <input type="checkbox" checked={values[channel.key]} disabled={!ready} onChange={(event) => { void toggle(channel.key, event.target.checked); }} />
              <span className="switch-track" />
            </label>
          </div>
        ))}
      </div>
      {togglesMsg.text && <p className={`inline-msg ${togglesMsg.kind}`} role="status">{togglesMsg.text}</p>}
    </div>
  );
}
