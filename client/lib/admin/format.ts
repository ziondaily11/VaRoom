// How the admin page writes dates, money, names and actions. Every section
// uses these, so a value reads the same everywhere.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const valid = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "28 Nov 2026". */
export function formatDate(value: string | null | undefined): string {
  const date = valid(value);
  return date ? `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}` : '—';
}

/** "28 Nov, 14:44" this year; "28 Nov 2025, 14:44" otherwise. */
export function formatWhen(value: string | null | undefined, now: Date = new Date()): string {
  const date = valid(value);
  if (!date) return '—';
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Just now", "5 min ago", "3 hours ago", "Yesterday", "4 days ago", then the date. */
export function timeAgo(value: string | null | undefined, now: Date = new Date()): string {
  const date = valid(value);
  if (!date) return 'Never';
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

/** "KES 16,600". */
export const kes = (amount: number) => `KES ${Math.round(Number(amount) || 0).toLocaleString('en-US')}`;

/** "listing_report_dismissed" → "Listing report dismissed". */
export function humanize(value: string | null | undefined): string {
  const text = String(value || '').replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/** Up to two initials: "Achieng Otieno" → "AO"; "jane@x.io" → "J". */
export function initials(name: string | null | undefined): string {
  const words = String(name || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || '?').slice(0, 1)).toUpperCase();
}

/** A stable colour (0–4) for a person's avatar, from their id or name. */
export function toneFor(key: string | null | undefined): number {
  let hash = 0;
  for (const c of String(key || '')) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return hash % 5;
}

/** "#FE35CE78" from a ticket id. */
export const ticketRef = (id: string) => `#${String(id).slice(0, 8).toUpperCase()}`;

// What admins did, as a sentence fragment: "Zion Daily suspended an account".
const ACTION_LABELS: Record<string, string> = {
  account_warned: 'warned an account',
  account_suspended: 'suspended an account',
  account_disabled: 'disabled an account',
  account_restored: 'restored an account',
  account_note_added: 'added a note to an account',
  listing_hidden: 'hid a listing',
  listing_removed: 'took down a listing',
  listing_restored: 'restored a listing',
  listing_report_resolved: 'resolved a listing report',
  listing_report_dismissed: 'dismissed a listing report',
  listing_report_actioned: 'acted on a listing report',
  user_report_resolved: 'resolved a chat report',
  user_report_dismissed: 'dismissed a chat report',
  user_report_actioned: 'acted on a chat report',
  reported_conversation_viewed: 'read a reported conversation',
  rule_updated: 'changed a rule',
  property_news_published: 'published a Property News report',
  property_news_reject: 'rejected a Property News report',
  property_news_edit: 'edited a Property News report',
  'property_news_request-more-evidence': 'asked for more evidence on a Property News report',
  varoom_review_approved: 'approved a VaRoom review',
  varoom_review_hidden: 'hid a VaRoom review',
  varoom_review_pending: 'returned a VaRoom review to pending',
  varoom_update_published: 'published a VaRoom Update',
  varoom_update_saved_draft: 'saved a VaRoom Update draft',
  varoom_update_edited: 'edited a VaRoom Update',
  varoom_update_unpublished: 'unpublished a VaRoom Update',
  varoom_update_removed: 'removed a VaRoom Update',
  varoom_update_draft: 'restored a VaRoom Update as a draft',
  support_ticket_auto_closed: 'closed a quiet support ticket',
  support_ticket_reopened: 'reopened a support ticket',
  support_reply_resent: 'sent a support reply again',
  support_template_created: 'added a saved reply',
  support_template_edited: 'edited a saved reply',
  support_template_deleted: 'deleted a saved reply',
  free_plan_given: 'gave a free plan',
  free_plan_extended: 'extended a free plan',
  free_plan_ended: 'ended a free plan',
  free_plan_expired: 'ended a free plan whose time was up',
  vcoins_granted: 'granted V-Coins',
  host_verified: 'marked a Verified host',
  host_verification_removed: 'removed a Verified host badge',
  listing_document_opened: 'opened a listing document',
  listing_review_removed: 'hid a guest review',
  listing_review_restored: 'restored a guest review',
  admin_role_changed: "changed an admin's role",
  admin_removed: 'removed an admin',
  admin_two_step_enabled: 'turned on two-step sign-in',
  admin_two_step_disabled: 'turned off two-step sign-in',
  admin_two_step_reset: "reset an admin's two-step sign-in",
};

export const actionLabel = (action: string) => ACTION_LABELS[action] || humanize(action).toLowerCase();
