// Settings search: every section and the settings inside it. A result opens
// its section and, when it has a target, scrolls to that element (by id) and
// highlights it. Results with an href leave Settings (Help Centre, policies).

export type SettingsSection =
  | 'account' | 'plans' | 'bookings' | 'notifications' | 'chats' | 'display' | 'team' | 'privacy' | 'support' | 'login-accounts';

export const SECTION_TITLES: Record<SettingsSection, string> = {
  account: 'Your Account',
  plans: 'Plans & Billing',
  bookings: 'Bookings',
  notifications: 'Notifications',
  chats: 'Chats',
  display: 'Display',
  team: 'Team',
  privacy: 'Privacy & Security',
  support: 'Support & About',
  'login-accounts': 'Login & Accounts',
};

export interface SearchEntry {
  section: SettingsSection;
  label: string;
  /** Element id to scroll to inside the section. */
  target?: string;
  /** Opened instead of the section. */
  href?: string;
  /** Extra words that should find this entry. */
  keywords?: string;
  hostOnly?: boolean;
}

/** Who can see what (Plans: hosts and Finance members; Bookings: hosts). */
export interface SearchAccess { isHost: boolean; showPlans: boolean }

const SETTINGS: SearchEntry[] = [
  { section: 'account', label: 'Username', target: 'username-row', keywords: 'handle profile link @' },
  { section: 'account', label: 'Full name', target: 'full-name-row', keywords: 'name business' },
  { section: 'account', label: 'Email address', target: 'email-row', keywords: 'mail' },
  { section: 'account', label: 'Phone number', target: 'phone-row', keywords: 'mobile telephone' },
  { section: 'account', label: 'Change password', target: 'password-row', keywords: 'security' },
  { section: 'account', label: 'Reach Out', target: 'reach-out', keywords: 'contact whatsapp phone email clients guests', hostOnly: true },
  { section: 'account', label: 'Deactivate account', target: 'deactivate-row', keywords: 'disable pause hide' },
  { section: 'account', label: 'Delete account', target: 'show-delete-confirm', keywords: 'remove close' },

  { section: 'plans', label: 'Subscription', target: 'current-plan', keywords: 'plan upgrade premium pricing' },
  { section: 'plans', label: 'Listings remaining', target: 'listing-allowance', keywords: 'limit allowance' },
  { section: 'plans', label: 'Payment method', target: 'payment-method', keywords: 'card m-pesa mpesa paystack' },
  { section: 'plans', label: 'Invoices', target: 'billing-information', keywords: 'billing history receipts payments' },
  { section: 'plans', label: 'Cancel subscription', target: 'danger-zone', keywords: 'danger zone' },

  { section: 'bookings', label: 'Instant book', target: 'booking-instant', keywords: 'approve automatic' },
  { section: 'bookings', label: 'Minimum notice', target: 'booking-notice', keywords: 'same day' },
  { section: 'bookings', label: 'How far ahead', target: 'booking-advance', keywords: 'advance window months' },
  { section: 'bookings', label: 'Minimum stay', target: 'booking-min-stay', keywords: 'nights' },
  { section: 'bookings', label: 'Maximum stay', target: 'booking-max-stay', keywords: 'nights' },
  { section: 'bookings', label: 'Check-in and check-out times', target: 'booking-checkin', keywords: 'checkin checkout time house' },
  { section: 'bookings', label: 'Cancellation policy', target: 'booking-cancellation', keywords: 'refund' },

  { section: 'notifications', label: 'Message notifications', target: 'notify-message_notifications', keywords: 'chats alerts' },
  { section: 'notifications', label: 'Booking notifications', target: 'notify-notify_bookings', keywords: 'requests alerts' },
  { section: 'notifications', label: 'Requests about to expire', target: 'notify-notify_booking_reminders', keywords: 'reminders bookings', hostOnly: true },
  { section: 'notifications', label: 'Review notifications', target: 'notify-notify_reviews', keywords: 'reviews alerts' },
  { section: 'notifications', label: 'Important account updates', target: 'notify-notify_account_updates', keywords: 'alerts' },
  { section: 'notifications', label: 'Promotional & marketing', target: 'notify-notify_marketing', keywords: 'promotions offers newsletter' },

  { section: 'chats', label: 'Away Mode', target: 'cs-away-mode', keywords: 'auto reply vacation messages', hostOnly: true },
  { section: 'chats', label: 'Away message', target: 'cs-away-message', keywords: 'auto reply', hostOnly: true },
  { section: 'chats', label: 'Business hours', target: 'cs-business-hours', keywords: 'opening hours schedule away', hostOnly: true },
  { section: 'chats', label: 'Chat theme', target: 'cs-theme', keywords: 'bubble colours colors messages' },
  { section: 'chats', label: 'Message previews', target: 'cs-message-previews', keywords: 'notifications' },
  { section: 'chats', label: 'Unread message emails', target: 'cs-email-alerts', keywords: 'email alerts' },
  { section: 'chats', label: 'Quick replies', target: 'cs-quick-replies', keywords: 'saved replies templates messages' },
  { section: 'chats', label: 'Read receipts', target: 'cs-read-receipts', keywords: 'seen messages' },
  { section: 'chats', label: 'Typing indicators', target: 'cs-typing-indicators', keywords: 'messages' },
  { section: 'chats', label: 'Archived conversations', target: 'cs-archived', keywords: 'archive chats messages' },

  { section: 'display', label: 'Appearance', target: 'appearance-options', keywords: 'theme dark mode light system' },
  { section: 'display', label: 'Font size', target: 'font-size-slider', keywords: 'text size accessibility' },

  { section: 'team', label: 'Invite to your team', target: 'team-invite-username', keywords: 'add member staff manager finance messaging roles', hostOnly: true },
  { section: 'team', label: 'Teams you’re on', target: 'team-memberships', keywords: 'work as join invitation leave' },

  { section: 'privacy', label: 'Profile visibility', target: 'profile-visibility', keywords: 'private public' },
  { section: 'privacy', label: 'Who can message you', target: 'who-can-message', keywords: 'chats block messages' },
  { section: 'privacy', label: 'Location visibility', target: 'location-visibility', keywords: 'map address' },

  { section: 'support', label: 'Help Centre', href: '/support', keywords: 'help faq questions' },
  { section: 'support', label: 'Contact VaRoom', href: 'mailto:privacy@varoom.co.ke?subject=VaRoom%20Support', keywords: 'email support' },
  { section: 'support', label: 'Report a problem', href: 'mailto:privacy@varoom.co.ke?subject=VaRoom%20—%20Problem%20report', keywords: 'bug issue' },
  { section: 'support', label: 'Privacy Policy', href: '/privacy', keywords: 'policies data' },
  { section: 'support', label: 'Terms & Conditions', href: '/terms', keywords: 'policies terms of service' },

  { section: 'login-accounts', label: 'Saved accounts', target: 'dashboard-accounts-list', keywords: 'switch linked accounts' },
  { section: 'login-accounts', label: 'Add account', target: 'add-account-btn', keywords: 'switch linked' },
  { section: 'login-accounts', label: 'Log out', target: 'logout-btn', keywords: 'sign out logout' },
];

// The sections themselves come first, so a section outranks its settings on a tie.
const SECTIONS: SearchEntry[] = (Object.keys(SECTION_TITLES) as SettingsSection[]).map((section) => ({
  section,
  label: SECTION_TITLES[section],
  ...(section === 'support' ? { href: '/support' } : {}),
}));

export const SEARCH_ENTRIES: SearchEntry[] = [...SECTIONS, ...SETTINGS];

export function canSee(entry: SearchEntry, access: SearchAccess): boolean {
  if (entry.section === 'plans') return access.showPlans;
  if (entry.section === 'bookings' || entry.hostOnly) return access.isHost;
  return true;
}

/**
 * Entries whose label, section or keywords contain every word typed, best
 * first: the label starts with the query, then a word of the label starts
 * with it, then anything else.
 */
export function searchSettings(query: string, access: SearchAccess, entries: SearchEntry[] = SEARCH_ENTRIES): SearchEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const phrase = words.join(' ');
  const ranked: Array<{ entry: SearchEntry; rank: number; order: number }> = [];
  entries.forEach((entry, order) => {
    if (!canSee(entry, access)) return;
    const label = entry.label.toLowerCase();
    const haystack = `${label} ${SECTION_TITLES[entry.section].toLowerCase()} ${entry.keywords || ''}`;
    if (!words.every((word) => haystack.includes(word))) return;
    const rank = label.startsWith(phrase) ? 0 : label.split(/[^a-z0-9@]+/).some((part) => part.startsWith(words[0])) ? 1 : 2;
    ranked.push({ entry, rank, order });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map((item) => item.entry);
}
