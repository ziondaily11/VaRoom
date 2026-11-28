import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  LogIn,
  Wallet,
  LifeBuoy,
  Flag,
  TrendingUp,
  LogOut,
  Shield,
  Newspaper,
  Users,
  Building2,
  Megaphone,
  History,
  Star,
  Gavel,
  HeartPulse,
  Lock,
  Menu,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import * as api from "../../lib/admin/adminApi";
import type { NewsEntry, SectionKey, Ticket } from "../../lib/admin/adminApi";
import { applyTheme } from "../../lib/theme";
import { Growth, Overview, Revenue, Signins } from "./ChartSections";
import { Support } from "./SupportSection";
import { Activity, ListingReports, ListingsControl, PropertyNews, UpdatesControl, UsersControl } from "./ModerationSections";
import { Admins } from "./AdminsSection";
import { VaroomReviews } from "./VaroomReviewsSection";
import { Rules } from "./RulesSection";
import { Account } from "./AccountSection";
import { SearchBox } from "./SearchBox";
import { Health } from "./HealthSection";
import { LoginScreen } from "./LoginScreen";
import { Avatar } from "./AdminUi";

// The VaRoom admin dashboard (/admin). Overview loads at sign-in; every other
// section loads the first time it is opened and is kept until sign-out
// (a failed load is retried when the section is opened again). Actions update
// what they change and refresh the audit trail in the background. Its look is
// styles/admin.css; it follows the site's light/dark setting, and the moon
// button changes that setting.

const NAV: Array<{ title: string; items: Array<{ key: SectionKey; label: string; icon: LucideIcon }> }> = [
  { title: "Today", items: [{ key: "overview", label: "Overview", icon: LayoutDashboard }, { key: "health", label: "Health", icon: HeartPulse }] },
  { title: "People", items: [
    { key: "users", label: "Users", icon: Users }, { key: "support", label: "Support", icon: LifeBuoy },
    { key: "reports", label: "Reports", icon: Flag }, { key: "signins", label: "Sign-ins", icon: LogIn },
  ] },
  { title: "Content", items: [
    { key: "listings", label: "Listings", icon: Building2 }, { key: "updates", label: "VaRoom Updates", icon: Megaphone },
    { key: "property-news", label: "Property News", icon: Newspaper }, { key: "varoom-reviews", label: "VaRoom reviews", icon: Star },
  ] },
  { title: "Money", items: [{ key: "revenue", label: "Revenue", icon: Wallet }, { key: "growth", label: "Growth", icon: TrendingUp }] },
  { title: "Safety", items: [{ key: "rules", label: "Rules", icon: Gavel }, { key: "activity", label: "Admin activity", icon: History }, { key: "admins", label: "Admins", icon: Shield }] },
];

const ROLE_LABELS: Record<string, string> = { super_admin: "Super admin", support: "Support", read_only: "Read only" };

const LOADERS = {
  overview: api.loadOverview,
  signins: api.loadSignins,
  revenue: api.loadRevenue,
  tickets: api.loadTickets,
  templates: api.loadTemplates,
  reports: api.loadReports,
  userReports: api.loadUserReports,
  deletions: api.loadAccountDeletions,
  varoomReviews: api.loadVaroomReviews,
  growth: api.loadGrowth,
  admins: api.loadAdmins,
  users: api.loadUsers,
  listings: api.loadListings,
  updates: api.loadUpdates,
  activity: api.loadActivity,
  rules: api.loadRules,
  listingReviews: api.loadListingReviews,
  health: api.loadHealth,
};

type Resources = { [K in keyof typeof LOADERS]: Awaited<ReturnType<(typeof LOADERS)[K]>> };
type ResourceKey = keyof Resources;

const SECTION_RESOURCES: Record<SectionKey, ResourceKey[]> = {
  overview: ["overview", "revenue", "activity"],
  signins: ["signins"],
  revenue: ["revenue"],
  support: ["tickets", "templates"],
  reports: ["reports", "userReports", "deletions", "listingReviews"],
  users: ["users"],
  listings: ["listings"],
  updates: ["updates"],
  growth: ["growth"],
  activity: ["activity"],
  admins: ["admins"],
  "property-news": [],
  "varoom-reviews": ["varoomReviews"],
  rules: ["rules"],
  account: [],
  health: ["health"],
};

const EMPTY_OVERVIEW: api.Overview = { signins: 0, revenue: 0, openTickets: 0, newListings: 0 };

/** The site's theme now (set on <html> by lib/theme). */
const currentTheme = (): "light" | "dark" => (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

export default function AdminDashboard() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [codeRequired, setCodeRequired] = useState(false);
  const [me, setMe] = useState<api.SessionAdmin | null>(null);
  const [active, setActive] = useState<SectionKey>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [data, setData] = useState<Partial<Resources>>({});
  const [failed, setFailed] = useState<ResourceKey[]>([]);
  const requested = useRef(new Set<ResourceKey>());
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [propertyNews, setPropertyNews] = useState<NewsEntry[]>([]);
  const [propertyNewsError, setPropertyNewsError] = useState("");
  const [actionError, setActionError] = useState("");
  // The account page: opened accounts are kept (and refreshed when reopened) until sign-out.
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Record<string, api.AccountOverview>>({});
  const [accountLoading, setAccountLoading] = useState(false);
  const [returnTo, setReturnTo] = useState<SectionKey>("users");

  const setResource = useCallback(<K extends ResourceKey>(key: K, update: (current: Resources[K] | undefined) => Resources[K] | undefined) => {
    setData((current) => ({ ...current, [key]: update(current[key] as Resources[K] | undefined) }));
  }, []);

  const reload = useCallback(<K extends ResourceKey>(key: K) => {
    requested.current.add(key);
    return (LOADERS[key]() as Promise<Resources[K]>).then((value) => {
      setData((current) => ({ ...current, [key]: value }));
      setFailed((current) => current.filter((entry) => entry !== key));
      if (key === "tickets") setSelectedTicket((current) => current || (value as Ticket[]).find((t) => t.status === "open") || (value as Ticket[])[0] || null);
    }, (error: unknown) => {
      console.error(`Admin dashboard: ${key} failed to load:`, error);
      requested.current.delete(key);
      setFailed((current) => (current.includes(key) ? current : [...current, key]));
    });
  }, []);

  useEffect(() => {
    setTheme(currentTheme());
    api.loadSession().then((session) => { setMe(session.admin); setLoggedIn(true); }).catch(() => {});
  }, []);

  // Overview (the menu's badges) and the open section's data, each once.
  useEffect(() => {
    if (!loggedIn) return;
    for (const key of ["overview", ...SECTION_RESOURCES[active]] as ResourceKey[]) {
      if (!requested.current.has(key)) void reload(key);
    }
  }, [loggedIn, active, reload]);

  useEffect(() => { setActionError(""); setMenuOpen(false); }, [active]);

  useEffect(() => {
    if (!loggedIn || active !== "property-news") return;
    setPropertyNewsError("");
    api.loadPendingNews()
      .then(setPropertyNews)
      .catch((error: unknown) => setPropertyNewsError(api.errorMessage(error, "Unable to load property news.")));
  }, [active, loggedIn]);

  /** Switches the site's light/dark setting on this device (the same one Settings changes). */
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    try { window.localStorage.setItem("varoom_theme", next); } catch { /* storage unavailable: this page only */ }
    applyTheme(window.location.pathname);
    if (currentTheme() !== next) document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
  }

  const resetData = () => {
    requested.current.clear();
    setData({});
    setFailed([]);
    setSelectedTicket(null);
    setPropertyNews([]);
    setActionError("");
    setAccounts({});
    setAccountId(null);
  };

  async function login(email: string, password: string, code?: string) {
    try {
      const session = await api.login(email, password, code);
      resetData();
      setLoginError("");
      setCodeRequired(false);
      setMe(session.admin);
      setLoggedIn(true);
    } catch (error) {
      // Right password, two-step sign-in on: the code field appears (no error until a code is tried).
      const needsCode = Boolean((error as api.AdminRequestError).codeRequired);
      setCodeRequired(needsCode);
      setLoginError(needsCode && !code ? "" : api.errorMessage(error, "Request failed"));
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

  // The server moves an answered open ticket to waiting; the list follows.
  const replyToTicket = async (id: string, message: string, idempotencyKey: string) => {
    await api.replyToTicket(id, message, idempotencyKey);
    const answered = (t: Ticket) => (t.id === id && t.status === "open" ? { ...t, status: "in_progress" } : t);
    setResource("tickets", (prev) => prev && prev.map(answered));
    setSelectedTicket((prev) => prev && answered(prev));
  };

  const resendReply = async (ticketId: string, replyId: string) => {
    let sent: api.TicketReply | null = null;
    await run(async () => { sent = (await api.resendReply(ticketId, replyId)).reply; refreshActivity(); });
    return sent;
  };

  const saveTemplate = (template: { id?: string; title: string; body: string }) => run(async () => {
    const result = await api.saveTemplate(template);
    setResource("templates", (prev) => {
      const others = (prev || []).filter((t) => t.id !== result.template.id);
      return [...others, result.template].sort((a, b) => a.title.localeCompare(b.title));
    });
  });

  const deleteTemplate = (id: string) => run(async () => {
    await api.deleteTemplate(id);
    setResource("templates", (prev) => prev && prev.filter((t) => t.id !== id));
  });

  const updateTicketStatus = (id: string, status: string) => run(async () => {
    await api.setTicketStatus(id, status);
    setResource("tickets", (prev) => prev && prev.map((t) => (t.id === id ? { ...t, status } : t)));
    setSelectedTicket((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
  });

  const addAdmin = (admin: api.NewAdmin) => run(async () => {
    const result = await api.addAdmin(admin);
    setResource("admins", (prev) => [...(prev || []), { ...result.admin, lastLogin: "Never" }]);
  });

  const adminControls = {
    setRole: (id: string, role: api.AdminRole) => run(async () => {
      await api.setAdminRole(id, role);
      setResource("admins", (prev) => prev && prev.map((a) => (a.id === id ? { ...a, role } : a)));
      refreshActivity();
    }),
    remove: (id: string) => run(async () => {
      await api.removeAdmin(id);
      setResource("admins", (prev) => prev && prev.filter((a) => a.id !== id));
      refreshActivity();
    }),
    resetTwoStep: (id: string) => run(async () => {
      await api.resetAdminTwoStep(id);
      setResource("admins", (prev) => prev && prev.map((a) => (a.id === id ? { ...a, totp_enabled: false } : a)));
    }),
    setupTwoStep: async () => {
      let setup: { secret: string; uri: string } | null = null;
      await run(async () => { setup = await api.setupTwoStep(); });
      return setup;
    },
    enableTwoStep: (code: string) => run(async () => {
      await api.enableTwoStep(code);
      setMe((current) => current && { ...current, totp_enabled: true });
      setResource("admins", (prev) => prev && prev.map((a) => (a.id === me?.id ? { ...a, totp_enabled: true } : a)));
    }),
    disableTwoStep: (code: string) => run(async () => {
      await api.disableTwoStep(code);
      setMe((current) => current && { ...current, totp_enabled: false });
      setResource("admins", (prev) => prev && prev.map((a) => (a.id === me?.id ? { ...a, totp_enabled: false } : a)));
    }),
  };

  const setReviewStatus = (id: string, status: "published" | "removed", reason: string) => run(async () => {
    await api.setListingReviewStatus(id, status, reason);
    setResource("listingReviews", (prev) => prev && prev.map((r) => (r.id === id ? { ...r, status } : r)));
    refreshActivity();
  });

  const setHostVerified = (userId: string, verified: boolean, reason: string) => run(async () => {
    await api.setHostVerified(userId, verified, reason);
    void refreshAccount(userId);
    refreshActivity();
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

  const refreshAccount = (id: string) => {
    setAccountLoading(true);
    return api.loadAccount(id)
      .then((account) => setAccounts((current) => ({ ...current, [id]: account })))
      .catch((error: unknown) => setActionError(api.errorMessage(error, "The account could not be loaded.")))
      .finally(() => setAccountLoading(false));
  };

  /** Opens an account's page (shown at once when opened before, refreshed in the background). */
  const openAccount = (id: string) => {
    if (active !== "account") setReturnTo(active);
    setAccountId(id);
    setActive("account");
    void refreshAccount(id);
  };

  /** Opens a ticket in Support, loading it when the list does not have it yet. */
  const openTicket = (id: string) => {
    setActive("support");
    const known = (data.tickets || []).find((t) => t.id === id);
    if (known) { setSelectedTicket(known); return; }
    api.loadTicket(id).then((result) => setSelectedTicket(result.ticket))
      .catch((error: unknown) => setActionError(api.errorMessage(error, "The ticket could not be loaded.")));
  };

  // Free plans and V-Coins; the account and the revenue figures refresh after.
  const afterMoney = (userId: string) => { void refreshAccount(userId); if (requested.current.has("revenue")) void reload("revenue"); refreshActivity(); };
  const accountMoney = {
    loadPlans: api.loadGivablePlans,
    givePlan: (userId: string, planId: string, days: number, reason: string) => run(async () => { await api.giveFreePlan(userId, planId, days, reason); afterMoney(userId); }),
    endPlan: (userId: string, reason: string) => run(async () => { await api.endFreePlan(userId, reason); afterMoney(userId); }),
    grantVcoins: (userId: string, amount: number, reason: string) => run(async () => { await api.grantVcoins(userId, amount, reason); afterMoney(userId); }),
  };

  const addNote = (userId: string, body: string) => run(async () => {
    const { note } = await api.addNote(userId, body);
    setAccounts((current) => current[userId] ? { ...current, [userId]: { ...current[userId], notes: [note, ...current[userId].notes] } } : current);
  });

  // Acting on a report can change listings and accounts; those reload when next shown.
  const forget = (...keys: ResourceKey[]) => keys.forEach((key) => requested.current.delete(key));

  const actOnReport = (id: string, action: api.ListingReportAction, reason: string) => run(async () => {
    await api.actOnListingReport(id, action, reason);
    setResource("reports", (prev) => prev && prev.map((r) => (r.id === id ? { ...r, status: "actioned" } : r)));
    forget("listings", "users");
    void reload("reports");
    refreshActivity();
  });

  const actOnUserReport = (id: string, action: api.UserReportAction, reason: string) => run(async () => {
    await api.actOnUserReport(id, action, reason);
    setResource("userReports", (prev) => prev && prev.map((r) => (r.id === id ? { ...r, status: "actioned" } : r)));
    forget("users");
    refreshActivity();
  });

  const updateUserStatus = (id: string, status: string, reason: string, days?: number) => run(async () => {
    const result = await api.setUserStatus(id, status, reason, days);
    const { status: accountStatus, reason: accountReason, suspended_until } = result;
    if (accountStatus) {
      setResource("users", (prev) => prev && { ...prev, users: prev.users.map((u) => (u.id === id ? { ...u, account: { ...u.account, status: accountStatus, reason: accountReason, suspended_until, rule_key: null } } : u)) });
      // A restored or newly restricted account changes its tickets' labels and the counts.
      setResource("tickets", (prev) => prev && prev.map((t) => (t.user_id === id ? { ...t, accountStatus } : t)));
      setSelectedTicket((prev) => (prev && prev.user_id === id ? { ...prev, accountStatus } : prev));
      void reload("overview");
    }
    if (accounts[id]) void refreshAccount(id);
    refreshActivity();
  });

  const saveRule = (key: string, changes: api.RuleChanges) => run(async () => {
    const { rule } = await api.updateRule(key, changes);
    setResource("rules", (prev) => prev && { ...prev, rules: prev.rules.map((r) => (r.key === key ? rule : r)) });
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

  const setVaroomReviewStatus = (id: string, status: api.VaroomReviewRow["status"]) => { void run(async () => {
    const result = await api.setVaroomReviewStatus(id, status);
    setResource("varoomReviews", (prev) => prev && prev.map((r) => (r.id === id ? { ...r, ...result.review } : r)));
    refreshActivity();
  }); };

  async function logout() {
    if (await run(() => api.logout())) {
      setLoggedIn(false);
      resetData();
    }
  }

  if (!loggedIn) {
    return <LoginScreen onLogin={(email, password, code) => { void login(email, password, code); }} error={loginError} codeRequired={codeRequired} />;
  }

  const overview = data.overview || EMPTY_OVERVIEW;
  const signins = data.signins || { rows: [], series: [] };
  const revenue = data.revenue || api.EMPTY_REVENUE;
  const attention = overview.attention;
  const healthCount = attention ? (attention.failedEmails || 0) + (attention.stuckPlans || 0) : 0;
  const badges: Partial<Record<SectionKey, number>> = {
    support: overview.openTickets,
    health: healthCount,
    reports: attention?.pendingReports || 0,
  };

  const renderSection = () => {
    switch (active) {
      case "overview":
        return <Overview overview={overview} me={me?.name || null} revenue={revenue} activity={data.activity || []} goTo={setActive} />;
      case "signins":
        return <Signins signins={signins.rows} series={signins.series} />;
      case "revenue":
        return <Revenue report={revenue} openAccount={openAccount} />;
      case "support":
        return (
          <Support
            tickets={data.tickets || []}
            selected={selectedTicket}
            setSelected={setSelectedTicket}
            onReply={replyToTicket}
            onStatusChange={(id, status) => { void updateTicketStatus(id, status); }}
            templates={data.templates || []}
            saveTemplate={saveTemplate}
            deleteTemplate={deleteTemplate}
            resend={resendReply}
            openAccount={openAccount}
            restoreAccount={(userId, reason) => updateUserStatus(userId, "active", reason)}
          />
        );
      case "reports":
        return <ListingReports reports={data.reports || []} userReports={data.userReports || []} accountDeletions={data.deletions || []} listingReviews={data.listingReviews || []} setReviewStatus={setReviewStatus} resolveReport={resolveReport} resolveUserReport={resolveUserReport} actOnReport={actOnReport} actOnUserReport={actOnUserReport} openAccount={openAccount} />;
      case "varoom-reviews":
        return <VaroomReviews reviews={data.varoomReviews || []} setStatus={setVaroomReviewStatus} />;
      case "users":
        return <UsersControl page={data.users || { users: [], total: 0 }} restrictedCount={overview.accounts ? overview.accounts.suspended + overview.accounts.disabled : undefined} openAccount={openAccount} updateStatus={updateUserStatus} />;
      case "account":
        return (
          <Account
            account={accountId ? accounts[accountId] || null : null}
            loading={accountLoading}
            onBack={() => setActive(returnTo)}
            openAccount={openAccount}
            openTicket={openTicket}
            updateStatus={updateUserStatus}
            addNote={addNote}
            money={accountMoney}
            setVerified={setHostVerified}
          />
        );
      case "rules":
        return <Rules rules={data.rules?.rules || []} hits={data.rules?.hits || []} save={saveRule} />;
      case "listings":
        return <ListingsControl listings={data.listings || []} moderate={moderateListing} openAccount={openAccount} />;
      case "updates":
        return <UpdatesControl updates={data.updates || []} createUpdate={createUpdate} setUpdateStatus={setUpdateStatus} />;
      case "growth":
        return <Growth series={data.growth || []} />;
      case "activity":
        return <Activity activity={data.activity || []} openAccount={openAccount} />;
      case "admins":
        return <Admins admins={data.admins || []} addAdmin={addAdmin} me={me} controls={adminControls} />;
      case "health":
        return <Health report={data.health || null} refresh={() => { void reload("health"); }} openAccount={openAccount} />;
      case "property-news":
        return <PropertyNews items={propertyNews} onAction={(id, action) => { void actionPropertyNews(id, action); }} error={propertyNewsError} />;
      default:
        return null;
    }
  };

  const current = active === "account" ? returnTo : active;

  return (
    <div className="admin-dashboard">
      <div className="adm-shell" data-menu={menuOpen ? "open" : "closed"}>
        <div className="adm-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <aside className="adm-sidebar" aria-label="Admin menu">
          <div className="adm-brand">
            <span className="adm-brand__va">Va</span><span className="adm-brand__room">Room</span>
            <span className="adm-brand__tag">Admin</span>
          </div>
          <nav className="adm-nav" aria-label="Admin sections">
            {NAV.map((group) => (
              <div key={group.title} className="adm-nav__group">
                <div className="adm-nav__title">{group.title}</div>
                {group.items.map(({ key, label, icon: Icon }) => (
                  <button key={key} type="button" className="adm-nav__item" aria-current={current === key ? "page" : undefined} onClick={() => setActive(key)}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                    {Boolean(badges[key]) && <span className="adm-nav__badge" aria-label={`${badges[key]} waiting`}>{badges[key]}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="adm-me">
            <Avatar name={me?.name || "Admin"} id={me?.id} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="adm-me__name">{me?.name || "Admin"}</div>
              <div className="adm-me__role">{me ? ROLE_LABELS[me.role] || me.role : ""}</div>
            </div>
            <button type="button" className="adm-btn adm-btn--icon adm-btn--ghost" aria-label="Log out" title="Log out" onClick={() => { void logout(); }}>
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="adm-content">
          <header className="adm-topbar">
            <button type="button" className="adm-btn adm-btn--icon adm-menu-button" aria-label="Open the menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
              <Menu size={18} aria-hidden="true" />
            </button>
            <SearchBox openAccount={openAccount} openTicket={openTicket} />
            <button type="button" className="adm-btn adm-btn--icon" style={{ marginLeft: "auto" }} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggleTheme}>
              {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
          </header>
          <main className="adm-main">
            {me && !me.totp_enabled ? (
              <div className="adm-banner adm-banner--warn">
                <Lock size={18} aria-hidden="true" />
                <span className="adm-banner__text">Two-step sign-in is off for your account. A stolen password alone could open this page.</span>
                <button type="button" className="adm-banner__link" onClick={() => setActive("admins")}>Turn it on</button>
              </div>
            ) : null}
            {failed.length ? (
              <div className="adm-banner adm-banner--bad">Some of this page could not be loaded. Open the section again to retry; the rest is shown below.</div>
            ) : null}
            {actionError ? <div className="adm-banner adm-banner--bad" role="alert">{actionError}</div> : null}
            {renderSection()}
          </main>
        </div>
      </div>
    </div>
  );
}
