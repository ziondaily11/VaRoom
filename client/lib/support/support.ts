// Support page content and rules (ported from legacy-pages/support.html):
// the help articles, the help search, the support flows and the ticket the
// form sends to /api/support/tickets.

export interface HelpArticle {
  id: string;
  icon: string;
  title: string;
  description: string;
  /** Steps; a leading "LABEL:" is shown in bold. */
  steps: string[];
  note?: string;
  /** Extra search words that are not in the visible text. */
  keywords: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'become-host',
    icon: '⌂',
    title: 'How to become a host',
    description: 'Start hosting from your Profile, available in the sidebar on both desktop and mobile.',
    steps: ['Open your Profile from the sidebar.', 'Find and select **Become a Host**.', 'You will be redirected to create a Host Account.', 'Complete the Host Account setup.'],
    keywords: 'host become host profile sidebar mobile host account setup listing',
  },
  {
    id: 'dark-mode',
    icon: '☾',
    title: 'How to turn on dark mode',
    description: 'Keep VaRoom comfortable on your eyes with dark mode.',
    steps: ['Open your Profile.', 'Go to Settings.', 'Open Display Preferences.', 'Find Dark Mode and turn it on.'],
    keywords: 'dark mode display preferences settings profile theme',
  },
  {
    id: 'marketplace',
    icon: '◌',
    title: 'How to view as marketplace',
    description: 'Switch to Marketplace view to browse listings in a marketplace format.',
    steps: ['Open Marketplace.', 'Browse listings in Marketplace format.'],
    keywords: 'marketplace explore view browse listings',
  },
  {
    id: 'add-listing',
    icon: '＋',
    title: 'How to add a listing',
    description: 'Host tools become available after you create a Host Account.',
    steps: [
      '**HOST — DESKTOP:** Find Add Listing in desktop navigation and select it.',
      '**HOST — MOBILE:** Select the + button next to Search at the top.',
      '**NOT A HOST YET:** Create a Host Account first.',
    ],
    keywords: 'add listing host desktop mobile plus create property',
  },
  {
    id: 'report-listing',
    icon: '⚑',
    title: 'How to report a listing',
    description: "Report a listing from the listing itself or the host's profile.",
    steps: ['Open the exact listing you want to report.', 'Open the three-dot menu (⋯) at the top-right.', 'Select Report and choose a reason.', 'Write a custom reason if needed, then submit.'],
    note: 'The report is handed over to the VaRoom Support team for review.',
    keywords: 'report listing three dot menu reason support review',
  },
  {
    id: 'switch-account',
    icon: '⇄',
    title: 'How to switch or add an account',
    description: 'Add an existing account through your profile menu.',
    steps: [
      'Open your Profile and select your profile photo.',
      'Select the dropdown arrow, then Add an existing account.',
      'Sign in; the account is added to the account switcher.',
      'Switch accounts from the profile dropdown or Settings → Login & Account.',
    ],
    note: 'This feature is being finalized, so this guidance may be updated.',
    keywords: 'switch add account profile dropdown login account existing',
  },
];

/** A step as plain and bold ("**text**") runs. */
export function stepParts(step: string): Array<{ bold: boolean; text: string }> {
  return step.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) => (
    part.startsWith('**') && part.endsWith('**') ? { bold: true, text: part.slice(2, -2) } : { bold: false, text: part }
  ));
}

function articleText(article: HelpArticle): string {
  const steps = article.steps.map((step) => step.replace(/\*\*/g, '')).join(' ');
  return `${article.title} ${article.description} ${steps} ${article.note || ''} ${article.keywords}`.toLowerCase();
}

/** The first article containing every word of the query (legacy search), or null. */
export function findHelpArticle(query: string, articles: HelpArticle[] = HELP_ARTICLES): HelpArticle | null {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return articles.find((article) => {
    const text = articleText(article);
    return words.every((word) => text.includes(word));
  }) || null;
}

export type SupportFlow = 'ticket' | 'bug' | 'feature' | 'account';

export interface FlowCopy {
  title: string;
  label: string;
  placeholder: string;
  submit: string;
  /** Fixed subject for flows that do not ask for one. */
  subject: string | null;
  confirmation: string;
  confirmationMessage: string;
}

export const FLOW_COPY: Record<Exclude<SupportFlow, 'account'>, FlowCopy> = {
  ticket: {
    title: 'Contact support',
    label: 'How can we help?',
    placeholder: 'Tell us what you need help with...',
    submit: 'Send ticket',
    subject: null,
    confirmation: 'Support ticket sent',
    confirmationMessage: 'Thanks — we have received your request and will look into it.',
  },
  bug: {
    title: 'Report a bug',
    label: 'What happened?',
    placeholder: 'Describe the bug, what you expected, and when it happened...',
    submit: 'Submit bug report',
    subject: 'Bug report',
    confirmation: 'Bug report sent',
    confirmationMessage: 'Thanks for helping us improve VaRoom. We will look into it.',
  },
  feature: {
    title: 'Request a feature',
    label: 'What would you like to see?',
    placeholder: 'Tell us about the feature you would like to see and how it would help...',
    submit: 'Submit idea',
    subject: 'Feature request',
    confirmation: 'Feature request sent',
    confirmationMessage: 'Thanks for the idea. We will take a look.',
  },
};

export const ACCOUNT_HELP_COPY = 'We can help with sign-in issues, profile updates, account access, and other account-related questions.';

export interface SupportTicket { name: string; email: string; subject: string; message: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The dialog's fields as a ticket request: the reply-to email the user typed
 * (contact support only; other flows use the account's email), and the
 * flow's fixed subject when it has one.
 */
export function ticketRequest(
  flow: Exclude<SupportFlow, 'account'>,
  user: { name: string; email: string },
  fields: { replyEmail: string; subject: string; message: string },
): { name: string; email: string; subject: string; message: string } {
  return {
    name: user.name,
    email: flow === 'ticket' ? fields.replyEmail : user.email,
    subject: FLOW_COPY[flow].subject ?? fields.subject,
    message: fields.message,
  };
}

/** The logo and Home link: the account's home, Client Home when signed out. */
export const supportHomeHref = (role: string | null) => (role === 'host' ? '/host-home' : '/client-home');

/** The ticket to send, or the first problem to show (legacy order and wording). */
export function buildSupportTicket(input: { name: string; email: string; subject: string; message: string }): { ticket: SupportTicket } | { error: string } {
  const ticket: SupportTicket = {
    name: (input.name || 'VaRoom member').trim(),
    email: (input.email || '').trim(),
    subject: (input.subject || '').trim(),
    message: (input.message || '').trim(),
  };
  if (!ticket.email || !EMAIL_PATTERN.test(ticket.email)) return { error: 'Please enter a valid reply-to email.' };
  if (!ticket.subject) return { error: 'Please add a subject.' };
  if (!ticket.message) return { error: 'Please tell us how we can help.' };
  return { ticket };
}

/** Send a ticket; rejects with the message to show. */
export async function sendSupportTicket(ticket: SupportTicket, accessToken: string | null, fetchFn: typeof fetch = fetch): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetchFn('/api/support/tickets', {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: JSON.stringify(ticket),
  });
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await response.json() : { error: 'The support service returned an unexpected response. Please try again.' };
  if (!response.ok || !isJson) throw new Error(body.error || 'Unable to send support request');
}
