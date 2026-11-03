import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  LogIn,
  DollarSign,
  LifeBuoy,
  Flag,
  TrendingUp,
  Search,
  LogOut,
  Shield,
  Newspaper,
  Users,
  Building2,
  Megaphone,
  History,
  type LucideIcon,
} from "lucide-react";
import * as api from "../../lib/admin/adminApi";
import type { NewsEntry, SectionKey, Ticket } from "../../lib/admin/adminApi";
import { Growth, Overview, Revenue, Signins } from "./ChartSections";
import { Support } from "./SupportSection";
import { Activity, ListingReports, ListingsControl, PropertyNews, UpdatesControl, UsersControl } from "./ModerationSections";
import { Admins } from "./AdminsSection";
import { LoginScreen } from "./LoginScreen";

// The VaRoom admin dashboard (/admin). Overview loads at sign-in; every other
// section loads the first time it is opened and is kept until sign-out
// (a failed load is retried when the section is opened again). Actions update
// what they change and refresh the audit trail in the background.

const NAV_ITEMS: Array<{ key: SectionKey; label: string; icon: LucideIcon }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "signins", label: "Sign-ins", icon: LogIn },
  { key: "revenue", label: "Revenue", icon: DollarSign },
  { key: "support", label: "Support", icon: LifeBuoy },
  { key: "reports", label: "Listing reports", icon: Flag },
  { key: "users", label: "Users", icon: Users },
  { key: "listings", label: "Listings", icon: Building2 },
  { key: "updates", label: "Varoom Updates", icon: Megaphone },
  { key: "growth", label: "Growth", icon: TrendingUp },
  { key: "activity", label: "Admin activity", icon: History },
  { key: "admins", label: "Admins", icon: Shield },
  { key: "property-news", label: "Property News", icon: Newspaper },
];

const LOADERS = {
  overview: api.loadOverview,
  signins: api.loadSignins,
  revenue: api.loadRevenue,
  tickets: api.loadTickets,
  reports: api.loadReports,
  userReports: api.loadUserReports,
  deletions: api.loadAccountDeletions,
  growth: api.loadGrowth,
  admins: api.loadAdmins,
  users: api.loadUsers,
  listings: api.loadListings,
  updates: api.loadUpdates,
  activity: api.loadActivity,
};

type Resources = { [K in keyof typeof LOADERS]: Awaited<ReturnType<(typeof LOADERS)[K]>> };
type ResourceKey = keyof Resources;

const SECTION_RESOURCES: Record<SectionKey, ResourceKey[]> = {
  overview: ["overview", "signins", "revenue"],
  signins: ["signins"],
  revenue: ["revenue"],
  support: ["tickets"],
  reports: ["reports", "userReports", "deletions"],
  users: ["users"],
  listings: ["listings"],
  updates: ["updates"],
  growth: ["growth"],
  activity: ["activity"],
  admins: ["admins"],
  "property-news": [],
};

const EMPTY_OVERVIEW = { signins: 0, revenue: 0, openTickets: 0, newListings: 0 };

export default function AdminDashboard() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [active, setActive] = useState<SectionKey>("overview");
  const [data, setData] = useState<Partial<Resources>>({});
  const [failed, setFailed] = useState<ResourceKey[]>([]);
  const requested = useRef(new Set<ResourceKey>());
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [propertyNews, setPropertyNews] = useState<NewsEntry[]>([]);
  const [propertyNewsError, setPropertyNewsError] = useState("");
  const [actionError, setActionError] = useState("");

  const setResource = useCallback(<K extends ResourceKey>(key: K, update: (current: Resources[K] | undefined) => Resources[K] | undefined) => {
    setData((current) => ({ ...current, [key]: update(current[key] as Resources[K] | undefined) }));
  }, []);

  const reload = useCallback(<K extends ResourceKey>(key: K) => {
    requested.current.add(key);
    return (LOADERS[key]() as Promise<Resources[K]>).then((value) => {
      setData((current) => ({ ...current, [key]: value }));
      setFailed((current) => current.filter((entry) => entry !== key));
      if (key === "tickets") setSelectedTicket((current) => current || (value as Ticket[])[0] || null);
    }, (error: unknown) => {
      console.error(`Admin dashboard: ${key} failed to load:`, error);
      requested.current.delete(key);
      setFailed((current) => (current.includes(key) ? current : [...current, key]));
    });
  }, []);

  useEffect(() => {
    api.loadSession().then(() => setLoggedIn(true)).catch(() => {});
  }, []);

  // Overview (the Support badge) and the open section's data, each once.
  useEffect(() => {
    if (!loggedIn) return;
    for (const key of ["overview", ...SECTION_RESOURCES[active]] as ResourceKey[]) {
      if (!requested.current.has(key)) void reload(key);
    }
  }, [loggedIn, active, reload]);

  useEffect(() => { setActionError(""); }, [active]);

  useEffect(() => {
    if (!loggedIn || active !== "property-news") return;
    setPropertyNewsError("");
    api.loadPendingNews()
      .then(setPropertyNews)
      .catch((error: unknown) => setPropertyNewsError(api.errorMessage(error, "Unable to load property news.")));
  }, [active, loggedIn]);

  const resetData = () => {
    requested.current.clear();
    setData({});
    setFailed([]);
    setSelectedTicket(null);
    setPropertyNews([]);
    setActionError("");
  };

  async function login(email: string, password: string) {
    try {
      await api.login(email, password);
      resetData();
      setLoginError("");
      setLoggedIn(true);
    } catch (error) {
      setLoginError(api.errorMessage(error, "Request failed"));
    }
  }

  /** Runs an action; a failure is shown above the section. Resolves whether it succeeded. */
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setActionError("");
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(api.errorMessage(error, "That action could not be completed."));
      return false;
    }
  }

  const refreshActivity = () => { void reload("activity"); };

  const replyToTicket = (id: string, message: string, idempotencyKey: string) => api.replyToTicket(id, message, idempotencyKey);

  const updateTicketStatus = (id: string, status: string) => run(async () => {
    await api.setTicketStatus(id, status);
    setResource("tickets", (prev) => prev && prev.map((t) => (t.id === id ? { ...t, status } : t)));
    setSelectedTicket((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
  });

  const addAdmin = (admin: api.NewAdmin) => run(async () => {
    const result = await api.addAdmin(admin);
    setResource("admins", (prev) => [...(prev || []), { ...result.admin, lastLogin: "Never" }]);
  });

  async function actionPropertyNews(id: string, action: "approve" | "reject") {
    try {
      setPropertyNewsError("");
      await api.actOnNews(id, action);
      setPropertyNews((prev) => prev.filter((entry) => entry.item.id !== id));
    } catch (error) {
      setPropertyNewsError(api.errorMessage(error, `Unable to ${action} this report.`));
    }
  }

  async function loadUser(id: string): Promise<api.UserDetail | null> {
    setActionError("");
    try {
      return await api.loadUser(id);
    } catch (error) {
      setActionError(api.errorMessage(error, "That action could not be completed."));
      return null;
    }
  }

  const updateUserStatus = (id: string, status: string, reason: string) => run(async () => {
    await api.setUserStatus(id, status, reason);
    setResource("users", (prev) => prev && prev.map((u) => (u.id === id ? { ...u, account: { ...u.account, status, reason } } : u)));
    refreshActivity();
  });

  const moderateListing = (id: string, status: string, reason: string) => run(async () => {
    const result = await api.moderateListing(id, status, reason);
    setResource("listings", (prev) => prev && prev.map((l) => (l.id === id ? { ...l, ...result.listing } : l)));
    refreshActivity();
  });

  const createUpdate = (payload: { title: string; body: string; status: string }) => run(async () => {
    const result = await api.createUpdate(payload);
    setResource("updates", (prev) => [result.update, ...(prev || [])]);
    refreshActivity();
  });

  const setUpdateStatus = (id: string, status: string, reason: string) => run(async () => {
    const result = await api.setUpdateStatus(id, status, reason);
    setResource("updates", (prev) => prev && prev.map((u) => (u.id === id ? result.update : u)));
    refreshActivity();
  });

  const resolveReport = (id: string, status: string) => { void run(async () => {
    const result = await api.setReportStatus(id, status);
    setResource("reports", (prev) => prev && prev.map((r) => (r.id === id ? { ...r, ...result.report } : r)));
  }); };

  const resolveUserReport = (id: string, status: string) => { void run(async () => {
    const result = await api.setUserReportStatus(id, status);
    setResource("userReports", (prev) => prev && prev.map((r) => (r.id === id ? { ...r, ...result.report } : r)));
  }); };

  async function logout() {
    if (await run(() => api.logout())) {
      setLoggedIn(false);
      resetData();
    }
  }

  if (!loggedIn) {
    return <LoginScreen onLogin={(email, password) => { void login(email, password); }} error={loginError} />;
  }

  const overview = data.overview || EMPTY_OVERVIEW;
  const signins = data.signins || { rows: [], series: [] };
  const revenue = data.revenue || { transactions: [], total: 0, series: [] };

  const renderSection = () => {
    switch (active) {
      case "overview":
        return (
          <Overview
            overview={overview}
            signinsSeries={signins.series}
            revenueSeries={revenue.series}
            goTo={setActive}
          />
        );
      case "signins":
        return <Signins signins={signins.rows} series={signins.series} />;
      case "revenue":
        return <Revenue transactions={revenue.transactions} total={revenue.total} series={revenue.series} />;
      case "support":
        return (
          <Support
            tickets={data.tickets || []}
            selected={selectedTicket}
            setSelected={setSelectedTicket}
            onReply={replyToTicket}
            onStatusChange={(id, status) => { void updateTicketStatus(id, status); }}
          />
        );
      case "reports":
        return <ListingReports reports={data.reports || []} userReports={data.userReports || []} accountDeletions={data.deletions || []} resolveReport={resolveReport} resolveUserReport={resolveUserReport} />;
      case "users":
        return <UsersControl users={data.users || []} loadUser={loadUser} updateStatus={updateUserStatus} />;
      case "listings":
        return <ListingsControl listings={data.listings || []} moderate={moderateListing} />;
      case "updates":
        return <UpdatesControl updates={data.updates || []} createUpdate={createUpdate} setUpdateStatus={setUpdateStatus} />;
      case "growth":
        return <Growth series={data.growth || []} />;
      case "activity":
        return <Activity activity={data.activity || []} />;
      case "admins":
        return <Admins admins={data.admins || []} addAdmin={addAdmin} />;
      case "property-news":
        return <PropertyNews items={propertyNews} onAction={(id, action) => { void actionPropertyNews(id, action); }} error={propertyNewsError} />;
      default:
        return null;
    }
  };

  return (
    <div className="admin-dashboard min-h-screen bg-[#F7F6F3] text-[#24211E] flex" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-white border-r border-[#E4E1DA] flex flex-col">
        <div className="px-5 py-5 border-b border-[#E4E1DA]">
          <div className="text-sm tracking-wide text-[#24211E]">Varoom</div>
          <div className="text-xs text-[#8a857c]">Admin</div>
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`w-full border-0 flex items-center gap-2.5 px-5 py-2.5 text-sm text-left transition-colors ${
                active === key
                  ? "text-[#1F6F5C] bg-[#1F6F5C]/5 border-r-2 border-[#1F6F5C]"
                  : "text-[#5c584f] hover:bg-[#F7F6F3]"
              }`}
            >
              <Icon size={16} />
              {label}
              {key === "support" && overview.openTickets > 0 && (
                <span className="ml-auto text-xs font-mono bg-[#B5482E] text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {overview.openTickets}
                </span>
              )}
            </button>
          ))}
        </nav>
        <button
          onClick={() => { void logout(); }}
          className="flex items-center gap-2.5 px-5 py-3 text-sm text-[#8a857c] border-t border-[#E4E1DA] hover:text-[#24211E]"
        >
          <LogOut size={15} /> Log out
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[#E4E1DA] bg-white flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-[#8a857c] text-sm">
            <Search size={15} />
            <span>Search users, listings, tickets…</span>
          </div>
          <div className="text-sm text-[#5c584f]">Admin</div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {failed.length ? (
            <div className="mb-4 border border-[#B5482E]/30 bg-[#B5482E]/5 px-4 py-3 text-sm text-[#B5482E]">
              Some dashboard data could not be loaded. Available sections are still shown below.
            </div>
          ) : null}
          {actionError ? (
            <div className="mb-4 border border-[#B5482E]/30 bg-[#B5482E]/5 px-4 py-3 text-sm text-[#B5482E]" role="alert">
              {actionError}
            </div>
          ) : null}
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
