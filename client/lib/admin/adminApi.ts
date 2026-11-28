// Admin dashboard requests (the /admin/* routes in server/routes/adminRoutes.js).
// Admins sign in with their own email and password; the session is an
// HttpOnly cookie, so every request is same-origin with credentials.

export type SectionKey =
  | 'overview' | 'signins' | 'revenue' | 'support' | 'reports' | 'users'
  | 'listings' | 'updates' | 'growth' | 'activity' | 'admins' | 'property-news' | 'varoom-reviews' | 'rules' | 'account';

export interface Overview { signins: number; revenue: number; openTickets: number; newListings: number }
export interface SigninRow { user: string; method: string; time: string; device: string }
export interface SigninPoint { day: string; signins: number }
export interface RevenuePoint { day: string; revenue: number }
export interface GrowthPoint { day: string; signups: number; listings: number }
/** A VaRoom payment (billing_payments): a plan, a Silver/Gold listing, or V-Coins. amount is in KES. */
export interface Transaction {
  id: string;
  host_id: string;
  payer: string | null;
  kind: 'subscription' | 'listing' | 'vcoins';
  plan_id: string | null;
  listing_tier: string | null;
  vcoins: number | null;
  amount: number;
  status: string;
  reference: string;
  date: string;
}

/** What VaRoom earned over the range (GET /admin/revenue, server/lib/adminMoney.js). Amounts in KES. */
export interface RevenueReport {
  range: number;
  total: number;
  byKind: { subscription: number; listing: number; vcoins: number };
  transactions: Transaction[];
  series: RevenuePoint[];
  mrr: number;
  subscribers: { paid: number; pastDue: number; cancelling: number; byPlan: Array<{ plan_id: string; name: string; count: number; monthly: number }> };
  failed: Transaction[];
  refunded: Transaction[];
  freePlans: Array<{ host_id: string; host: string | null; plan_id: string; name: string; until: string }>;
}

export const EMPTY_REVENUE: RevenueReport = {
  range: 30, total: 0, byKind: { subscription: 0, listing: 0, vcoins: 0 }, transactions: [], series: [], mrr: 0,
  subscribers: { paid: 0, pastDue: 0, cancelling: 0, byPlan: [] }, failed: [], refunded: [], freePlans: [],
};

/** A plan an admin can give a host free: one of their niche's plans. monthly is in KES. */
export interface GivablePlan { id: string; name: string; niche: string; monthly: number; listings: number | null }

export interface Ticket {
  id: string;
  subject: string;
  message: string;
  name: string;
  email: string;
  status: string;
  priority?: string | null;
  createdAt: string;
  accountStatus: string;
  /** appeal, sign_in, billing, booking, report or other. */
  category?: string;
  /** web (the Support page) or email. */
  source?: string;
}

/** One message in a ticket's conversation after the first: an admin reply, the automatic acknowledgement, or the person answering by email. */
export interface TicketReply {
  id: string;
  message: string;
  direction: 'outbound' | 'inbound';
  automatic: boolean;
  delivery_status: string;
  sent_at: string;
  admin: { name?: string | null } | null;
}

export interface ReplyTemplate { id: string; title: string; body: string }

export interface ListingReport {
  id: string;
  listing_id: string;
  listing: string | null;
  listing_moderation?: string | null;
  host_id?: string | null;
  host?: string | null;
  reporter_user_id?: string | null;
  reporter: string | null;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: string;
}

export interface PersonRef { full_name?: string | null; username?: string | null }

export interface UserReport {
  id: string;
  reporter_user_id: string;
  reported_user_id: string;
  reporter: PersonRef | null;
  reportedUser: PersonRef | null;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: string;
}

/** A review of VaRoom itself (Help & Support → Rate VaRoom). */
export interface VaroomReviewRow {
  id: string;
  user_id: string;
  rating: number;
  comment: string;
  author_name: string;
  author_role: string;
  status: 'pending' | 'approved' | 'hidden';
  approved_at: string | null;
  updated_at: string;
}

export interface AccountDeletion { id: string; account_id: string; account_email: string | null; reason: string; reason_details: string | null; deleted_at: string }

/** status: active, suspended or disabled. suspended_until: when a timed suspension ends; rule_key: the rule that applied it. */
export interface AccountControl { status: string; reason?: string | null; suspended_until?: string | null; rule_key?: string | null }

/** A warning, suspension, disabling or restore (server/lib/enforcement.js). */
export interface EnforcementAction {
  id: string;
  action: 'warning' | 'suspended' | 'disabled' | 'restored';
  reason: string;
  rule_key: string | null;
  suspended_until: string | null;
  created_at: string;
  admin: { name?: string | null } | null;
}

/** An automatic rule: off, shadow (records what it would do) or enforce. */
export interface ModerationRule {
  key: string;
  label: string;
  description: string;
  mode: 'off' | 'shadow' | 'enforce';
  threshold: number;
  window_hours: number;
}

export interface RuleHit {
  id: string;
  rule_key: string;
  target_type: 'user' | 'listing';
  target_id: string;
  target_name: string | null;
  action: string;
  created_at: string;
}

export type RuleChanges = Partial<Pick<ModerationRule, 'mode' | 'threshold' | 'window_hours'>>;

export interface AdminUser {
  id: string;
  email: string;
  created_at?: string;
  last_sign_in_at: string | null;
  profile: PersonRef | null;
  account: AccountControl;
}

/** A person another record points at (by id), with their name when they have a profile. */
export interface Related { other: string | null; other_id: string }

export interface AccountReport extends Partial<Related> {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  listing?: string | null;
  listing_id?: string;
}

export interface AccountBooking extends Related {
  id: string;
  listing_id: string;
  listing?: string | null;
  status: string;
  total_price: number | null;
  start_date: string | null;
  created_at: string;
}

export interface AdminNote { id: string; body: string; created_at: string; admin: { name?: string | null } | null }

/** Everything about one account (GET /admin/users/:id, server/lib/adminInvestigation.js). */
export interface AccountOverview {
  user: AdminUser & {
    provider: string;
    profile: (PersonRef & { id: string; role?: string | null; phone?: string | null; city?: string | null; host_type?: string | null;
      business_name?: string | null; verified?: boolean | null; created_at?: string; deactivated_at?: string | null; deletion_scheduled_for?: string | null }) | null;
  };
  linked: Array<{ id: string; name: string | null; status: string }>;
  team: Array<{ as: 'owner' | 'member'; id: string; name: string | null; roles: string[] | null; status: string }>;
  listings: Array<{ id: string; title: string; category: string; created_at: string; availability_status: string; moderation_status: string; moderation_reason: string | null; publication_state: string | null }>;
  bookings: { asHost: { count: number; recent: AccountBooking[] }; asGuest: { count: number; recent: AccountBooking[] } };
  reports: { received: AccountReport[]; filed: AccountReport[]; onListings: AccountReport[]; filedOnListings: AccountReport[] };
  tickets: Array<{ id: string; subject: string; status: string; category: string | null; source: string | null; created_at: string }>;
  billing: {
    subscriptions: Array<{ id: string; plan_id: string; niche: string | null; status: string; current_period_end: string | null; cancel_at_period_end: boolean; comp?: boolean | null }>;
    payments: Array<{ id: string; payment_kind: string | null; plan_id: string; amount_minor: number; currency: string; status: string; provider_reference: string; paid_at: string | null; created_at: string }>;
  };
  vcoins: { balance: number; recent: Array<{ delta: number; kind: string; created_at: string }> };
  actions: EnforcementAction[];
  notes: AdminNote[];
  activity: Array<{ id: string; action: string; reason: string | null; created_at: string; admin: { name?: string | null } | null }>;
}

export interface SearchResults {
  users: Array<{ id: string; email?: string | null; full_name: string | null; username: string | null }>;
  listings: Array<{ id: string; title: string; host_id: string; moderation_status: string }>;
  tickets: Array<{ id: string; subject: string; email: string; status: string }>;
  payments: Array<{ id: string; host_id: string; provider_reference: string; amount_minor: number; currency: string; status: string }>;
}

/** A reported conversation, decrypted for the admin investigating it (every reading is logged). */
export interface ReportedConversation {
  report: { id: string; reporter_user_id: string; reported_user_id: string; reporter: string | null; reported: string | null; reason: string; details: string | null };
  messages: Array<{ id: string; sender_id: string; created_at: string; message_type: string; body: string | null; attachment: { kind: string; filename: string } | null }>;
}

export type ListingReportAction = 'hide_listing' | 'remove_listing' | 'warn_host' | 'suspend_host';
export type UserReportAction = 'warn' | 'suspend_7_days' | 'suspend' | 'disable';

export interface AdminListing {
  id: string;
  title: string;
  host_id: string;
  availability_status: string;
  moderation_status: string;
  moderation_reason: string | null;
  owner: PersonRef | null;
}

export interface VaroomUpdate { id: string; title: string | null; body: string | null; status: string; published_at: string | null }

export interface ActivityEntry {
  id: string;
  admin: { name?: string | null } | null;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  created_at: string;
}

export type AdminRole = 'support' | 'read_only' | 'super_admin';
export interface Admin { id: string; name: string; email: string; role: string; lastLogin: string }
export interface NewAdmin { name: string; email: string; role: AdminRole }

export interface NewsEntry {
  item: { id: string; varoom_title?: string | null; source_title?: string | null; regulatory_status?: string | null; varoom_summary?: string | null };
  source?: { name?: string | null } | null;
}

/** One admin request; a failed one throws the server's message. */
export async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error((body && body.error) || 'Request failed');
  }
  return (response.status === 204 ? null : await response.json()) as T;
}

const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

export const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message) || fallback;

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `support-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------- Session ----------

export const loadSession = () => adminRequest<{ admin: unknown }>('/admin/session');
export const login = (email: string, password: string) => adminRequest<{ admin: unknown }>('/admin/login', json('POST', { email, password }));
export const logout = () => adminRequest<null>('/admin/logout', { method: 'POST' });

// ---------- Reads ----------

const rows = <T>(path: string) => adminRequest<{ data?: T[] }>(path).then((result) => result.data || []);

export const loadOverview = () => adminRequest<Overview>('/admin/overview');
export const loadSignins = () => adminRequest<{ data?: SigninRow[]; series?: SigninPoint[] }>('/admin/signins?range=14')
  .then((result) => ({ rows: result.data || [], series: result.series || [] }));
export const loadRevenue = () => adminRequest<Partial<RevenueReport>>('/admin/revenue?range=30').then((result) => ({ ...EMPTY_REVENUE, ...result }));
export const loadGivablePlans = (userId: string) => rows<GivablePlan>(`/admin/users/${userId}/plans`);
export const loadTickets = () => rows<Ticket>('/admin/support/tickets');
export const loadReports = () => rows<ListingReport>('/admin/reports');
export const loadUserReports = () => rows<UserReport>('/admin/user-reports');
export const loadVaroomReviews = () => rows<VaroomReviewRow>('/admin/varoom-reviews');
export const loadAccountDeletions = () => rows<AccountDeletion>('/admin/account-deletions');
export const loadGrowth = () => adminRequest<{ series?: GrowthPoint[] }>('/admin/growth?range=14').then((result) => result.series || []);
export const loadAdmins = () => rows<Admin>('/admin/admins');
export const loadUsers = () => rows<AdminUser>('/admin/users');
export const loadListings = () => rows<AdminListing>('/admin/listings');
export const loadUpdates = () => rows<VaroomUpdate>('/admin/updates');
export const loadActivity = () => rows<ActivityEntry>('/admin/activity');
export const loadPendingNews = () => adminRequest<NewsEntry[] | null>('/admin/news/pending').then((result) => result || []);
export const loadTicket = (id: string) => adminRequest<{ ticket: Ticket; replies?: TicketReply[] }>(`/admin/support/tickets/${id}`);
export const loadTemplates = () => rows<ReplyTemplate>('/admin/support/templates');
export const loadAccount = (id: string) => adminRequest<AccountOverview>(`/admin/users/${id}`);
export const searchAdmin = (q: string, signal?: AbortSignal) => adminRequest<SearchResults>(`/admin/search?q=${encodeURIComponent(q)}`, { signal });
export const loadReportedConversation = (reportId: string) => adminRequest<ReportedConversation>(`/admin/user-reports/${reportId}/conversation`);
export const loadRules = () => adminRequest<{ rules?: ModerationRule[]; hits?: RuleHit[] }>('/admin/rules')
  .then((result) => ({ rules: result.rules || [], hits: result.hits || [] }));

// ---------- Actions ----------

export const replyToTicket = (id: string, message: string, idempotencyKey: string) =>
  adminRequest<unknown>(`/admin/support/tickets/${id}/replies`, json('POST', { message }, { 'Idempotency-Key': idempotencyKey }));
export const saveTemplate = ({ id, title, body }: { id?: string; title: string; body: string }) =>
  adminRequest<{ template: ReplyTemplate }>(id ? `/admin/support/templates/${id}` : '/admin/support/templates', json(id ? 'PATCH' : 'POST', { title, body }));
export const deleteTemplate = (id: string) => adminRequest<null>(`/admin/support/templates/${id}`, { method: 'DELETE' });
export const setTicketStatus = (id: string, status: string) => adminRequest<unknown>(`/admin/support/tickets/${id}`, json('PATCH', { status }));
export const addAdmin = (admin: NewAdmin) => adminRequest<{ admin: Omit<Admin, 'lastLogin'> }>('/admin/admins', json('POST', admin));
export const actOnNews = (id: string, action: 'approve' | 'reject') => adminRequest<unknown>(`/admin/news/${id}/${action}`, json('POST', {}));
/** status: active (restore), warning, suspended (for days, or until reviewed) or disabled. */
export const setUserStatus = (id: string, status: string, reason: string, days?: number) =>
  adminRequest<{ status: string | null; reason: string; suspended_until: string | null }>(`/admin/users/${id}/status`, json('POST', days ? { status, reason, days } : { status, reason }));
export const updateRule = (key: string, changes: RuleChanges) => adminRequest<{ rule: ModerationRule }>(`/admin/rules/${key}`, json('PATCH', changes));
export const moderateListing = (id: string, status: string, reason: string) =>
  adminRequest<{ listing: Partial<AdminListing> }>(`/admin/listings/${id}/moderation`, json('POST', { status, reason }));
export const createUpdate = (payload: { title: string; body: string; status: string }) => adminRequest<{ update: VaroomUpdate }>('/admin/updates', json('POST', payload));
export const setUpdateStatus = (id: string, status: string, reason: string) =>
  adminRequest<{ update: VaroomUpdate }>(`/admin/updates/${id}/status`, json('POST', { status, reason }));
export const setReportStatus = (id: string, status: string) => adminRequest<{ report: Partial<ListingReport> }>(`/admin/reports/${id}`, json('PATCH', { status }));
export const setVaroomReviewStatus = (id: string, status: VaroomReviewRow['status']) =>
  adminRequest<{ review: VaroomReviewRow }>(`/admin/varoom-reviews/${id}`, json('PATCH', { status }));
export const giveFreePlan = (userId: string, planId: string, days: number, reason: string) =>
  adminRequest<{ plan_id: string; until: string }>(`/admin/users/${userId}/free-plan`, json('POST', { plan_id: planId, days, reason }));
export const endFreePlan = (userId: string, reason: string) => adminRequest<{ ended: boolean }>(`/admin/users/${userId}/free-plan/end`, json('POST', { reason }));
export const grantVcoins = (userId: string, amount: number, reason: string) =>
  adminRequest<{ granted: number }>(`/admin/users/${userId}/vcoins`, json('POST', { amount, reason }));
export const addNote = (userId: string, body: string) => adminRequest<{ note: AdminNote }>(`/admin/users/${userId}/notes`, json('POST', { body }));
/** Resolves a report and acts on it in one step (the server marks it actioned). */
export const actOnListingReport = (id: string, action: ListingReportAction, reason: string) =>
  adminRequest<{ report: Partial<ListingReport> }>(`/admin/reports/${id}`, json('PATCH', { action, reason }));
export const actOnUserReport = (id: string, action: UserReportAction, reason: string) =>
  adminRequest<{ report: Partial<UserReport> }>(`/admin/user-reports/${id}`, json('PATCH', { action, reason }));
export const setUserReportStatus = (id: string, status: string) => adminRequest<{ report: Partial<UserReport> }>(`/admin/user-reports/${id}`, json('PATCH', { status }));
