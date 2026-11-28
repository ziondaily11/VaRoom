// Help & Support content and rules: the help topics and articles, the help
// search, the support flows and the ticket the form sends to
// /api/support/tickets.

/** The help topics, in the order the page shows them. */
export const HELP_TOPICS = [
  { id: 'start', title: 'Getting started', text: 'Your account, finding places, display settings.' },
  { id: 'bookings', title: 'Bookings and payments', text: 'Book, cancel and pay safely.' },
  { id: 'hosting', title: 'Hosting and listings', text: 'List a space, answer requests, your team.' },
  { id: 'chats', title: 'Chats', text: 'Messages, away mode and notifications.' },
  { id: 'account', title: 'Account and security', text: 'Password, accounts, deactivate or delete.' },
  { id: 'safety', title: 'Safety and reports', text: 'Report a listing, stay safe, community rules.' },
] as const;

export type HelpTopic = (typeof HELP_TOPICS)[number]['id'];

export interface HelpArticle {
  id: string;
  topic: HelpTopic;
  title: string;
  /** One sentence under the title. */
  summary: string;
  /** Steps; a leading "**label**" is shown in bold. */
  steps: string[];
  note?: string;
  /** A page that explains more (Terms or Privacy sections open in a new tab). */
  link?: { href: string; label: string };
  /** Extra search words that are not in the visible text. */
  keywords: string;
}

/**
 * The help articles. Each one follows the app as it is today: the sidebar
 * (Home, Marketplace, Bookings, Chats, Notifications, List a space,
 * Settings), Settings sections, the listing wizard and the Terms.
 */
export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'find-a-place', topic: 'start', title: 'Find a place',
    summary: 'Browse every listing in Marketplace, or search by name and area.',
    steps: ['Open **Marketplace** from the sidebar (on a phone, tap the menu button at the top left).', 'Search by name or area, or choose a type: Airbnbs, Hotels, Event venues, Offices, Shops or Property.', 'Open a listing to see its photos, price, rules and the host.'],
    note: 'The types you chose when you joined are shown first.',
    keywords: 'search browse explore marketplace listings category filter',
  },
  {
    id: 'become-host', topic: 'start', title: 'Become a host',
    summary: 'Hosts list their spaces on VaRoom. Your client account becomes a host account: same email, same sign-in.',
    steps: ['In the sidebar, select **Become a Host**.', 'Finish the short setup: photo, username, phone and location.', 'Pick what you will list. Your account switches to Host Home, where you add your first listing.'],
    note: 'Your own bookings stay under Bookings → My trips.',
    keywords: 'host account sign up signup become host switch convert',
  },
  {
    id: 'dark-mode', topic: 'start', title: 'Turn on dark mode',
    summary: 'Choose Light, Dark or System (follows your device).',
    steps: ['Open **Settings**.', 'Select **Display**.', 'Under Appearance, choose **Dark**.'],
    keywords: 'dark mode theme light system appearance display',
  },
  {
    id: 'text-size', topic: 'start', title: 'Make text bigger or smaller',
    summary: 'Change the text size across VaRoom on this device.',
    steps: ['Open **Settings**, then **Display**.', 'Move the **Font size** slider. The preview shows the new size.'],
    note: 'This setting is saved on this device only.',
    keywords: 'font text size bigger smaller accessibility zoom',
  },
  {
    id: 'book-a-stay', topic: 'bookings', title: 'Book a stay, room or venue',
    summary: 'Choose your dates on the listing and send a request.',
    steps: ['Open the listing and choose your dates (or the hours, for listings priced per hour).', 'Check the total, then send the request.', 'Listings with instant book confirm open dates at once. Otherwise the host approves or declines your request.', 'Follow your request in **Bookings**.'],
    keywords: 'book reserve request dates nights hours instant booking',
  },
  {
    id: 'rent-or-buy', topic: 'bookings', title: 'Rent or buy a property, office or shop',
    summary: 'Ask the host about a rental, a lease or a sale from the listing.',
    steps: ['Open the listing and check whether it is for rent, for sale, or both.', 'To rent, choose a move-in date and the length, then send the request.', 'To buy, message the host from the listing.'],
    note: 'For offices and shops priced per day or by turnover, the host confirms the price with you.',
    keywords: 'rent lease buy purchase property office shop move in',
  },
  {
    id: 'cancel-booking', topic: 'bookings', title: 'Cancel a booking',
    summary: 'Cancel a booking that has not started yet.',
    steps: ['Open **Bookings**.', 'Open the booking and select **Cancel Booking**.', 'Confirm that you want to cancel.'],
    note: "Refunds follow the listing's cancellation policy and are settled between you and the host.",
    link: { href: '/terms#cancellations-and-refunds', label: 'Cancellations and refunds in the Terms' },
    keywords: 'cancel booking refund cancellation policy',
  },
  {
    id: 'pay-safely', topic: 'bookings', title: 'How payments work',
    summary: 'Payments for a place are made between you and the host.',
    steps: ['Agree the price and terms with the host, ideally in VaRoom chat so there is a record.', 'Only pay once you are sure the host is entitled to the payment, and avoid paying in advance for a place you could not check.', 'VaRoom will never ask you to send money for a place to VaRoom or to anyone on our behalf.'],
    note: 'VaRoom does not hold payments and cannot reverse or recover them.',
    link: { href: '/terms#no-escrow', label: 'Payments in the Terms' },
    keywords: 'pay payment mpesa card money escrow refund scam deposit',
  },
  {
    id: 'list-a-space', topic: 'hosting', title: 'List a space',
    summary: 'Six short steps: basics, location, the space, photos, price and terms, review.',
    steps: ['Select **List a space** in the sidebar (on a phone, tap the menu button at the top left first).', 'Fill in each step. Your progress saves automatically.', 'On the review step, publish. Some listing types need a listing fee or a plan first; the review step shows the options.'],
    note: 'If you leave before publishing, you can save the listing as a draft and continue later.',
    keywords: 'add listing create new list space publish draft wizard',
  },
  {
    id: 'answer-requests', topic: 'hosting', title: 'Approve or decline a request',
    summary: 'Answer booking requests from Bookings.',
    steps: ['Open **Bookings** and find the request.', 'Select **Approve**, or select **Decline** and confirm.'],
    note: 'Turn on the "Reminders" notification in Settings so none run out.',
    keywords: 'approve decline accept reject request host bookings',
  },
  {
    id: 'booking-rules', topic: 'hosting', title: 'Set your booking rules',
    summary: 'Defaults for every new listing, and rules per listing.',
    steps: ['For defaults, open **Settings**, then **Bookings**: instant book, notice, how far ahead, stay lengths, check-in times and cancellation policy.', 'For one listing, edit it and change the **Price & terms** step.'],
    keywords: 'rules minimum notice advance stay check in instant book cancellation defaults',
  },
  {
    id: 'team', topic: 'hosting', title: 'Add people to your team',
    summary: 'Let others help with listings, chats or billing.',
    steps: ['Open **Settings**, then **Team**.', 'Invite a person by their VaRoom username.', 'Choose what they can do: **Manager** (listings and bookings), **Messaging** (chats with guests) or **Finance** (plans, billing and analytics).'],
    note: 'Only you can manage the team and your account.',
    keywords: 'team members invite manager messaging finance staff',
  },
  {
    id: 'message-host', topic: 'chats', title: 'Message a host or guest',
    summary: 'Keep conversations in VaRoom chat.',
    steps: ['Open a listing and select the message button, or open **Chats** from the sidebar.', 'Write your message and send.'],
    note: 'Some hosts also offer WhatsApp, phone or email. Those conversations happen outside VaRoom.',
    link: { href: '/terms#contacting-hosts-outside-varoom', label: 'Contact outside VaRoom in the Terms' },
    keywords: 'message chat contact host guest whatsapp email phone',
  },
  {
    id: 'away-mode', topic: 'chats', title: 'Reply automatically when you are away',
    summary: 'Away mode sends your away message to new chats.',
    steps: ['Open **Settings**, then **Chats**.', 'Turn on **Away Mode** and edit the away message.', 'To go away automatically outside your hours, turn on **Business hours** and set them.'],
    keywords: 'away mode auto reply business hours away message',
  },
  {
    id: 'notifications', topic: 'chats', title: 'Choose your notifications',
    summary: 'Pick what VaRoom tells you about.',
    steps: ['Open **Settings**, then **Notifications** for messages, bookings, reviews and account updates.', 'For chat alerts, message previews and unread-message emails, open **Settings**, then **Chats**.'],
    keywords: 'notifications email alerts turn off mute messages bookings',
  },
  {
    id: 'change-password', topic: 'account', title: 'Change your password',
    summary: 'Change it from Your Account in Settings.',
    steps: ['Open **Settings**, then **Your Account**. You may be asked to confirm your current password first.', 'Under Password, select **Change password**.', 'Enter the new password twice and save. If we email you a code, enter it to finish.'],
    keywords: 'password change reset security verification code',
  },
  {
    id: 'cant-sign-in', topic: 'account', title: "Can't sign in",
    summary: 'We can help you get back into your account.',
    steps: ['Check you are using the same sign-in you joined with: email and password, or Google.', 'On the sign-in page, select **Trouble signing in?**', 'Or use **Need help with account** below and tell us what happened.'],
    keywords: 'sign in login locked out forgot password google cant log in',
  },
  {
    id: 'switch-account', topic: 'account', title: 'Add or switch accounts',
    summary: 'Keep up to three accounts on this device.',
    steps: ['Open **Settings**, then **Login & Accounts**.', 'Select **+ Add account** and sign in.', 'Switch with **Log in** next to the account, or from your profile menu in the sidebar.'],
    keywords: 'switch add account multiple accounts login',
  },
  {
    id: 'deactivate-delete', topic: 'account', title: 'Deactivate or delete your account',
    summary: 'Deactivating hides you for now; deleting removes your account after 30 days.',
    steps: ['Open **Settings**, then **Your Account**.', 'Under Account Status, choose **Deactivate account** or **Delete account** and confirm.', 'Changed your mind? Sign in again: a deactivated account comes back, and a deleted one is restored if it is within 30 days.'],
    link: { href: '/terms#account-deletion', label: 'Account deletion in the Terms' },
    keywords: 'delete deactivate close remove account 30 days restore',
  },
  {
    id: 'report-listing', topic: 'safety', title: 'Report a listing',
    summary: 'Tell us about a scam, a misleading listing or bad behaviour.',
    steps: ['On the listing card in your Home feed, open the **⋯** menu.', 'Select **Report**, choose a reason and add details if you can.', 'Send. Our team reviews every report.'],
    note: 'A report does not penalise a host on its own. We check it first.',
    link: { href: '/terms#reviews-complaints-and-reports', label: 'Reports in the Terms' },
    keywords: 'report scam fraud fake listing misleading abuse',
  },
  {
    id: 'stay-safe', topic: 'safety', title: 'Stay safe on VaRoom',
    summary: 'A few habits that protect you.',
    steps: ['Keep conversations in VaRoom chat where you can.', 'Visit or verify a place before paying, and never pay someone who is not the host.', 'Do not share your password or sign-in codes with anyone, including people who say they are VaRoom.', 'Report anything that feels wrong.'],
    link: { href: '/terms#prohibited-conduct', label: 'Community rules (Prohibited conduct)' },
    keywords: 'safety safe scam fraud tips verify password',
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
  return `${article.title} ${article.summary} ${steps} ${article.note || ''} ${article.keywords}`.toLowerCase();
}

/**
 * Articles containing every word of the query, best first: a match in the
 * title, then in the summary, then anywhere. Empty for an empty query.
 */
export function searchHelpArticles(query: string, articles: HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (article: HelpArticle) => {
    const title = article.title.toLowerCase();
    const summary = article.summary.toLowerCase();
    return words.reduce((sum, word) => sum + (title.includes(word) ? 3 : summary.includes(word) ? 2 : 1), 0);
  };
  return articles
    .filter((article) => { const text = articleText(article); return words.every((word) => text.includes(word)); })
    .map((article, index) => ({ article, index, score: score(article) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.article);
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

export const FLOW_COPY: Record<SupportFlow, FlowCopy> = {
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
  account: {
    title: 'Need help with account',
    label: 'Tell us more',
    placeholder: 'What happened? Anything that helps us find your account helps...',
    submit: 'Send request',
    subject: null,
    confirmation: 'Request sent',
    confirmationMessage: 'Thanks. We will reply to your email as soon as we can.',
  },
};

/** What account help is about; the choice becomes the ticket's subject. */
export const ACCOUNT_TOPICS = [
  "I can't sign in",
  'My account is suspended',
  'My account was deactivated',
  "Password reset isn't working",
  "I didn't get a verification code",
  'Change my email or phone number',
  'Delete my account',
  'Something else',
] as const;

/** The ticket subject for an account help topic. */
export const accountSubject = (topic: string): string => (topic.trim() ? `Account help: ${topic.trim()}` : '');

export const ACCOUNT_HELP_COPY = 'We can help with sign-in issues, profile updates, account access, and other account-related questions.';

export interface SupportTicket { name: string; email: string; subject: string; message: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The dialog's fields as a ticket request: the reply-to email (contact
 * support and account help ask for one; the other flows use the account's
 * email), the chosen topic as the subject for account help, otherwise the
 * typed subject or the flow's fixed one.
 */
export function ticketRequest(
  flow: SupportFlow,
  user: { name: string; email: string },
  fields: { replyEmail: string; subject: string; message: string; topic?: string },
): { name: string; email: string; subject: string; message: string } {
  return {
    name: user.name,
    email: flow === 'ticket' || flow === 'account' ? fields.replyEmail : user.email,
    subject: flow === 'account' ? accountSubject(fields.topic || '') : FLOW_COPY[flow].subject ?? fields.subject,
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
