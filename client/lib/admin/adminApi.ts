// Admin dashboard requests (the /admin/* routes in server/routes/adminRoutes.js).
// Admins sign in with their own email and password; the session is an
// HttpOnly cookie, so every request is same-origin with credentials.

export type SectionKey =
  | 'overview' | 'signins' | 'revenue' | 'support' | 'reports' | 'users'
  | 'listings' | 'updates' | 'growth' | 'activity' | 'admins' | 'property-news';

export interface Overview { signins: number; revenue: number; openTickets: number; newListings: number }
export interface SigninRow { user: string; method: string; time: string; device: string }
export interface SigninPoint { day: string; signins: number }
export interface RevenuePoint { day: string; revenue: number }
export interface GrowthPoint { day: string; signups: number; listings: number }
export interface Transaction { id: string; payer: string | null; listing: string | null; amount: number; date: string }

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
}

export interface ListingReport { id: string; listing: string | null; reporter: string | null; reason: string; status: string; createdAt: string }

export interface PersonRef { full_name?: string | null; username?: string | null }

export interface UserReport {
  id: string;
  reporter_user_id: string;
  reported_user_id: string;
  reporter: PersonRef | null;
  reportedUser: PersonRef | null;
  reason: string;
  status: string;
  createdAt: string;
}

export interface AccountDeletion { id: string; account_id: string; account_email: string | null; reason: string; reason_details: string | null; deleted_at: string }

export interface AccountControl { status: string; reason?: string | null }

export interface AdminUser {
  id: string;
  email: string;
  created_at?: string;
  last_sign_in_at: string | null;
  profile: PersonRef | null;
  account: AccountControl;
}

export interface UserDetail { user: AdminUser; listings: Array<{ id: string }>; activity: Array<{ id: string }> }

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
export const loadRevenue = () => adminRequest<{ transactions?: Transaction[]; total?: number; series?: RevenuePoint[] }>('/admin/revenue?range=7')
  .then((result) => ({ transactions: result.transactions || [], total: result.total || 0, series: result.series || [] }));
export const loadTickets = () => rows<Ticket>('/admin/support/tickets');
export const loadReports = () => rows<ListingReport>('/admin/reports');
export const loadUserReports = () => rows<UserReport>('/admin/user-reports');
export const loadAccountDeletions = () => rows<AccountDeletion>('/admin/account-deletions');
export const loadGrowth = () => adminRequest<{ series?: GrowthPoint[] }>('/admin/growth?range=14').then((result) => result.series || []);
export const loadAdmins = () => rows<Admin>('/admin/admins');
export const loadUsers = () => rows<AdminUser>('/admin/users');
export const loadListings = () => rows<AdminListing>('/admin/listings');
export const loadUpdates = () => rows<VaroomUpdate>('/admin/updates');
export const loadActivity = () => rows<ActivityEntry>('/admin/activity');
export const loadPendingNews = () => adminRequest<NewsEntry[] | null>('/admin/news/pending').then((result) => result || []);
export const loadUser = (id: string) => adminRequest<UserDetail>(`/admin/users/${id}`);

// ---------- Actions ----------

export const replyToTicket = (id: string, message: string, idempotencyKey: string) =>
  adminRequest<unknown>(`/admin/support/tickets/${id}/replies`, json('POST', { message }, { 'Idempotency-Key': idempotencyKey }));
export const setTicketStatus = (id: string, status: string) => adminRequest<unknown>(`/admin/support/tickets/${id}`, json('PATCH', { status }));
export const addAdmin = (admin: NewAdmin) => adminRequest<{ admin: Omit<Admin, 'lastLogin'> }>('/admin/admins', json('POST', admin));
export const actOnNews = (id: string, action: 'approve' | 'reject') => adminRequest<unknown>(`/admin/news/${id}/${action}`, json('POST', {}));
export const setUserStatus = (id: string, status: string, reason: string) => adminRequest<unknown>(`/admin/users/${id}/status`, json('POST', { status, reason }));
export const moderateListing = (id: string, status: string, reason: string) =>
  adminRequest<{ listing: Partial<AdminListing> }>(`/admin/listings/${id}/moderation`, json('POST', { status, reason }));
export const createUpdate = (payload: { title: string; body: string; status: string }) => adminRequest<{ update: VaroomUpdate }>('/admin/updates', json('POST', payload));
export const setUpdateStatus = (id: string, status: string, reason: string) =>
  adminRequest<{ update: VaroomUpdate }>(`/admin/updates/${id}/status`, json('POST', { status, reason }));
export const setReportStatus = (id: string, status: string) => adminRequest<{ report: Partial<ListingReport> }>(`/admin/reports/${id}`, json('PATCH', { status }));
export const setUserReportStatus = (id: string, status: string) => adminRequest<{ report: Partial<UserReport> }>(`/admin/user-reports/${id}`, json('PATCH', { status }));
