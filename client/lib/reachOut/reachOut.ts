import type { SupabaseClient } from '@supabase/supabase-js';
import { normalisePhone, phoneValid } from '../onboarding/onboarding';

// Reach Out: how prospective clients contact a listing owner outside VaRoom
// (WhatsApp, email, phone). The owner's choices live in
// profile_contact_settings (owner-only); the booking page reads a listing's
// enabled channels through the listing_contact function, so a channel that
// is off never reaches the browser. An empty value means "use the account's
// details" (registration phone, login email).

/** A listing's channels as the booking page may show them; null = not offered. */
export interface ListingContact { whatsapp: string | null; email: string | null; phone: string | null }

export const NO_CONTACT: ListingContact = { whatsapp: null, email: null, phone: null };

/** Never throws: without contact details the page still shows, with Message host only. */
export async function fetchListingContact(client: SupabaseClient, listingId: string): Promise<ListingContact> {
  try {
    const { data, error } = await client.rpc('listing_contact', { p_listing_id: listingId });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as Partial<ListingContact> | null | undefined;
    return { whatsapp: row?.whatsapp || null, email: row?.email || null, phone: row?.phone || null };
  } catch (error) {
    console.warn('Booking: the host contact options could not be loaded:', error);
    return NO_CONTACT;
  }
}

// ---------- Links ----------

export const listingUrl = (origin: string, listingId: string) => `${origin}/booking?listing=${encodeURIComponent(listingId)}`;

/** +2547… for dialling; Kenyan numbers saved as 07… become +2547…. */
export const telHref = (phone: string) => `tel:${normalisePhone(phone)}`;

/** wa.me opens the app on phones and WhatsApp Web on computers; it wants digits only. */
export function whatsappHref(phone: string, listing: { title: string; url: string; forSale: boolean }): string {
  const text = `Hello, I'm interested in ${listing.forSale ? 'buying' : 'renting'} this space. I found your listing on VaRoom: ${listing.title}\n${listing.url}`;
  return `https://wa.me/${normalisePhone(phone).slice(1)}?text=${encodeURIComponent(text)}`;
}

export function mailtoHref(email: string, listing: { title: string; url: string }): string {
  const subject = 'Enquiry About Your VaRoom Listing';
  const body = `Hello, I came across your listing on VaRoom and I'm interested in learning more about it.\n\nListing: ${listing.title}\nLink: ${listing.url}\n\nI would appreciate more information. Thank you.`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- Settings ----------

export type ReachChannel = 'whatsapp' | 'email' | 'phone';
export type ReachToggleKey = 'whatsapp_enabled' | 'email_enabled' | 'phone_enabled';

/** The owner's saved row; null values follow the account's details. */
export interface ReachOutSettings {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  phone_enabled: boolean;
}

export const DEFAULT_REACH_OUT: ReachOutSettings = { phone: null, whatsapp: null, email: null, whatsapp_enabled: true, email_enabled: true, phone_enabled: true };

const SETTINGS_COLUMNS = 'phone,whatsapp,email,whatsapp_enabled,email_enabled,phone_enabled';

/** No row yet means every default. */
export async function loadReachOut(client: SupabaseClient, userId: string): Promise<ReachOutSettings> {
  const { data, error } = await client.from('profile_contact_settings').select(SETTINGS_COLUMNS).eq('profile_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...DEFAULT_REACH_OUT, ...(data as Partial<ReachOutSettings>) } : DEFAULT_REACH_OUT;
}

/** Contact changes need a session signed into or verified recently (migration 20261105_000062). */
export const CONTACT_STEP_UP_MESSAGE = 'For your security, verify your identity again to change your contact details: reopen Your Account in Settings.';

/** Writes only the given columns; resolves the error message, or null. */
export async function saveReachOut(client: SupabaseClient, userId: string, patch: Partial<ReachOutSettings>): Promise<string | null> {
  const { error } = await client.from('profile_contact_settings')
    .upsert({ profile_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  if (!error) return null;
  // Refused by the database because this session must verify first.
  if (/row-level security/i.test(error.message || '') || error.code === '42501') return CONTACT_STEP_UP_MESSAGE;
  return error.message || 'Could not save.';
}

/** What the fields show: the saved value, else the account's. WhatsApp follows the phone. */
export function contactFieldValues(saved: ReachOutSettings, account: { phone: string | null; email: string }) {
  const phone = saved.phone || account.phone || '';
  return { phone, whatsapp: saved.whatsapp || phone, email: saved.email || account.email || '' };
}

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Field values to the columns to save: a value equal to what it would follow
 * anyway is stored as null, so it keeps following the account. Returns the
 * message for the first invalid field instead.
 */
export function contactPatch(
  fields: { phone: string; whatsapp: string; email: string },
  account: { phone: string | null; email: string },
): { patch: Pick<ReachOutSettings, 'phone' | 'whatsapp' | 'email'> } | { error: string } {
  const phone = fields.phone.trim();
  const whatsapp = fields.whatsapp.trim();
  const email = fields.email.trim();
  if (phone && !phoneValid(phone)) return { error: 'Please enter a valid phone number.' };
  if (whatsapp && !phoneValid(whatsapp)) return { error: 'Please enter a valid WhatsApp number.' };
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 254)) return { error: 'Please enter a valid email address.' };
  const accountPhone = account.phone ? normalisePhone(account.phone) : null;
  const savedPhone = phone ? normalisePhone(phone) : null;
  const followedPhone = savedPhone || accountPhone;
  const savedWhatsapp = whatsapp ? normalisePhone(whatsapp) : null;
  return {
    patch: {
      phone: savedPhone && savedPhone !== accountPhone ? savedPhone : null,
      whatsapp: savedWhatsapp && savedWhatsapp !== followedPhone ? savedWhatsapp : null,
      email: email && email.toLowerCase() !== account.email.trim().toLowerCase() ? email : null,
    },
  };
}
