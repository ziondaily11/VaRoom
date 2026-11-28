import React, { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { loadReportedConversation, loadRestrictedUsers, loadUsersPage, errorMessage } from "../../lib/admin/adminApi";
import type { AccountDeletion, ActivityEntry, AdminListing, AdminUser, ListingReport, ListingReportAction, ListingReview, NewsEntry, ReportedConversation, UserPage, UserReport, UserReportAction, VaroomUpdate } from "../../lib/admin/adminApi";
import { actionLabel, formatDate, formatWhen, humanize, timeAgo } from "../../lib/admin/format";
import { ActionMenu, Avatar, Card, ConsequentialButton, Person, Pill, SectionHeader, StatusPill, Table, Tabs, type MenuAction } from "./AdminUi";

const personName = (p: { full_name?: string | null; username?: string | null } | null | undefined, fallback: string) => (p && (p.full_name || p.username)) || fallback;
const stars = (rating: number) => "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));

/** The account actions on a person, as ⋯ menu items (warn, suspend, disable, or restore). */
export function accountActions(status: string | undefined, act: (status: string, reason: string, days?: number) => Promise<unknown>): MenuAction[] {
  if (status && status !== "active") return [{ label: "Restore account", onConfirm: (reason) => act("active", reason) }];
  return [
    { label: "Warn", danger: true, onConfirm: (reason) => act("warning", reason) },
    { label: "Suspend for 7 days", danger: true, onConfirm: (reason) => act("suspended", reason, 7) },
    { label: "Suspend until reviewed", danger: true, onConfirm: (reason) => act("suspended", reason) },
    { label: "Disable (blocks sign-in)", danger: true, separatorBefore: true, onConfirm: (reason) => act("disabled", reason) },
  ];
}

/** A reported conversation, read only after it was reported (each reading is logged). */
function ConversationViewer({ conversation, onClose }: { conversation: ReportedConversation; onClose: () => void }) {
  const { report } = conversation;
  const reported = (id: string) => id === report.reported_user_id;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Reported conversation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="adm-modal__panel">
        <div className="adm-modal__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="adm-h2">Reported conversation</h2>
            <p className="adm-small adm-muted">{report.reporter || "Someone"} reported {report.reported || "this person"}: {report.reason}{report.details ? `. ${report.details}` : ""}. Your reading is recorded in Admin activity.</p>
          </div>
          <button type="button" className="adm-btn adm-btn--sm adm-btn--icon" aria-label="Close" onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="adm-thread" style={{ overflow: "auto" }}>
          {conversation.messages.map((m) => (
            <div key={m.id} className={`adm-bubble-wrap${reported(m.sender_id) ? "" : " adm-bubble-wrap--out"}`}>
              <span className="adm-bubble-meta"><strong style={{ color: "var(--adm-ink)" }}>{reported(m.sender_id) ? report.reported || "Reported person" : report.reporter || "Reporter"}</strong> · {formatWhen(m.created_at)}</span>
              <div className={`adm-bubble${reported(m.sender_id) ? "" : " adm-bubble--out"}`}>{m.body || (m.attachment ? `[${m.attachment.kind}: ${m.attachment.filename}]` : `[${m.message_type}]`)}</div>
            </div>
          ))}
          {!conversation.messages.length && <div className="adm-muted">This conversation has no messages.</div>}
        </div>
      </div>
    </div>
  );
}

type ReportTab = "listings" | "chats" | "reviews" | "deletions";
const waiting = (r: { status: string }) => r.status === "pending" || r.status === "reviewed";

export function ListingReports({ reports, userReports, accountDeletions, listingReviews, setReviewStatus, resolveReport, resolveUserReport, actOnReport, actOnUserReport, openAccount }: {
  reports: ListingReport[]; userReports: UserReport[]; accountDeletions: AccountDeletion[];
  listingReviews: ListingReview[]; setReviewStatus: (id: string, status: "published" | "removed", reason: string) => Promise<unknown>;
  resolveReport: (id: string, status: string) => void; resolveUserReport: (id: string, status: string) => void;
  actOnReport: (id: string, action: ListingReportAction, reason: string) => Promise<unknown>;
  actOnUserReport: (id: string, action: UserReportAction, reason: string) => Promise<unknown>;
  openAccount: (id: string) => void;
}) {
  const [tab, setTab] = useState<ReportTab>("listings");
  const [conversation, setConversation] = useState<ReportedConversation | null>(null);
  const [conversationError, setConversationError] = useState("");
  async function viewConversation(id: string) {
    setConversationError("");
    try { setConversation(await loadReportedConversation(id)); } catch (error) { setConversationError(errorMessage(error, "The conversation could not be loaded.")); }
  }
  const tabs: Array<{ key: ReportTab; label: string; count?: number }> = [
    { key: "listings", label: "Listings", count: reports.filter(waiting).length },
    { key: "chats", label: "Chats", count: userReports.filter(waiting).length },
    { key: "reviews", label: "Guest reviews", count: listingReviews.length },
    { key: "deletions", label: "Deleted accounts", count: accountDeletions.length },
  ];
  return (
    <>
      <SectionHeader title="Reports" description="What people reported, guest reviews of listings, and accounts that were deleted. Acting on a report resolves it." />
      <div><Tabs label="Report type" tabs={tabs} value={tab} onChange={setTab} /></div>
      {conversationError && <div className="adm-banner adm-banner--bad" role="alert">{conversationError}</div>}

      {tab === "listings" && (
        <Table
          columns={["Listing", "Host", "Reported by", "Reason", "Status", "Filed", ""]}
          rows={reports}
          empty="No listing has been reported."
          minWidth={980}
          renderRow={(r) => (
            <tr key={r.id}>
              <td><a href={`/booking?listing=${r.listing_id}`} target="_blank" rel="noopener noreferrer" className="adm-strong">{r.listing || "Listing"}</a>{r.listing_moderation && r.listing_moderation !== "active" && <div style={{ marginTop: 4 }}><StatusPill status={r.listing_moderation} /></div>}</td>
              <td>{r.host_id ? <Person name={r.host || "Host"} id={r.host_id} onOpen={() => openAccount(r.host_id as string)} /> : "—"}</td>
              <td>{r.reporter_user_id ? <Person name={r.reporter} id={r.reporter_user_id} onOpen={() => openAccount(r.reporter_user_id as string)} /> : <span className="adm-muted">{r.reporter || "—"}</span>}</td>
              <td className="adm-cell-wrap"><span className="adm-strong">{r.reason}</span>{r.details && <div className="adm-small adm-muted">{r.details}</div>}</td>
              <td><StatusPill status={r.status} /></td>
              <td style={{ whiteSpace: "nowrap" }}>{timeAgo(r.createdAt)}</td>
              <td className="adm-cell-actions">
                <div className="adm-inline" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  {waiting(r) && <button type="button" className="adm-btn adm-btn--sm" onClick={() => resolveReport(r.id, "resolved")}>Resolve</button>}
                  <ActionMenu label={`More actions for the report on ${r.listing || "this listing"}`} actions={[
                    ...(waiting(r) ? [{ label: "Dismiss", onConfirm: async () => resolveReport(r.id, "dismissed") }] : []),
                    ...(waiting(r) ? [
                      { label: "Hide the listing", danger: true, separatorBefore: true, onConfirm: (reason: string) => actOnReport(r.id, "hide_listing", reason) },
                      { label: "Take the listing down", danger: true, onConfirm: (reason: string) => actOnReport(r.id, "remove_listing", reason) },
                      { label: "Warn the host", danger: true, onConfirm: (reason: string) => actOnReport(r.id, "warn_host", reason) },
                      { label: "Suspend the host", danger: true, onConfirm: (reason: string) => actOnReport(r.id, "suspend_host", reason) },
                    ] : []),
                  ]} />
                </div>
              </td>
            </tr>
          )}
        />
      )}

      {tab === "chats" && (
        <Table
          columns={["Reported person", "Reported by", "Reason", "Status", "Filed", ""]}
          rows={userReports}
          empty="No one has been reported in a chat."
          minWidth={900}
          toolbar={<span className="adm-small adm-muted">A reported conversation can be read only from its report, and each reading is recorded.</span>}
          renderRow={(r) => (
            <tr key={r.id}>
              <td><Person name={personName(r.reportedUser, "Reported person")} id={r.reported_user_id} onOpen={() => openAccount(r.reported_user_id)} /></td>
              <td><Person name={personName(r.reporter, "Reporter")} id={r.reporter_user_id} onOpen={() => openAccount(r.reporter_user_id)} /></td>
              <td className="adm-cell-wrap"><span className="adm-strong">{r.reason}</span>{r.details && <div className="adm-small adm-muted">{r.details}</div>}</td>
              <td><StatusPill status={r.status} /></td>
              <td style={{ whiteSpace: "nowrap" }}>{timeAgo(r.createdAt)}</td>
              <td className="adm-cell-actions">
                <div className="adm-inline" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => { void viewConversation(r.id); }}>Read chat</button>
                  <ActionMenu label={`More actions for the report on ${personName(r.reportedUser, "this person")}`} actions={[
                    ...(waiting(r) ? [
                      { label: "Resolve", onConfirm: async () => resolveUserReport(r.id, "resolved") },
                      { label: "Dismiss", onConfirm: async () => resolveUserReport(r.id, "dismissed") },
                      { label: "Warn them", danger: true, separatorBefore: true, onConfirm: (reason: string) => actOnUserReport(r.id, "warn", reason) },
                      { label: "Suspend for 7 days", danger: true, onConfirm: (reason: string) => actOnUserReport(r.id, "suspend_7_days", reason) },
                      { label: "Suspend until reviewed", danger: true, onConfirm: (reason: string) => actOnUserReport(r.id, "suspend", reason) },
                    ] : []),
                  ]} />
                </div>
              </td>
            </tr>
          )}
        />
      )}

      {tab === "reviews" && (
        <Table
          columns={["Listing", "Guest", "Rating", "Review", "Status", "Posted", ""]}
          rows={listingReviews}
          empty="No guest reviews yet."
          minWidth={960}
          toolbar={<span className="adm-small adm-muted">Hiding a review takes it off the listing and out of its rating.</span>}
          renderRow={(r) => (
            <tr key={r.id}>
              <td><a href={`/booking?listing=${r.listing_id}`} target="_blank" rel="noopener noreferrer" className="adm-strong">{r.listing || "Listing"}</a></td>
              <td><Person name={r.guest || "Guest"} id={r.client_id} onOpen={() => openAccount(r.client_id)} /></td>
              <td style={{ color: "var(--adm-accent)", whiteSpace: "nowrap" }} aria-label={`${r.rating} of 5 stars`}>{stars(r.rating)}</td>
              <td className="adm-cell-wrap">{r.comment}</td>
              <td><StatusPill status={r.status} /></td>
              <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.created_at)}</td>
              <td className="adm-cell-actions">{r.status === "removed"
                ? <ConsequentialButton label="Restore" onConfirm={(reason) => setReviewStatus(r.id, "published", reason)} />
                : <ConsequentialButton label="Hide" tone="danger" onConfirm={(reason) => setReviewStatus(r.id, "removed", reason)} />}</td>
            </tr>
          )}
        />
      )}

      {tab === "deletions" && (
        <Table
          columns={["Email", "Reason", "More detail", "Deleted"]}
          rows={accountDeletions}
          empty="No account has been deleted."
          renderRow={(d) => (
            <tr key={d.id}>
              <td className="adm-strong">{d.account_email || <span className="adm-muted">No email kept</span>}</td>
              <td>{humanize(d.reason)}</td>
              <td className="adm-cell-wrap adm-muted">{d.reason_details || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>{formatDate(d.deleted_at)}</td>
            </tr>
          )}
        />
      )}

      {conversation && <ConversationViewer conversation={conversation} onClose={() => setConversation(null)} />}
    </>
  );
}

type UserTab = "all" | "restricted";
const METHOD: Record<string, string> = { google: "Google", email: "Email" };

/** Accounts newest first, 50 at a time; the search runs on the server across every account. */
export function UsersControl({ page, restrictedCount, openAccount, updateStatus }: {
  page: UserPage; restrictedCount?: number; openAccount: (id: string) => void; updateStatus: (id: string, status: string, reason: string, days?: number) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<UserTab>("all");
  const [search, setSearch] = useState("");
  // A search, the restricted list, or more than the first page; null shows the first page.
  const [view, setView] = useState<UserPage | null>(null);
  const shown = view || page;
  const refreshView = (q: string, which: UserTab) => (which === "restricted" ? loadRestrictedUsers() : loadUsersPage(q, 0))
    .then(setView).catch(() => setView({ users: [], total: 0 }));
  useEffect(() => {
    const q = search.trim();
    if (tab === "restricted") { void refreshView("", "restricted"); return undefined; }
    if (!q) { setView(null); return undefined; }
    const timer = window.setTimeout(() => { void refreshView(q, "all"); }, 300);
    return () => window.clearTimeout(timer);
  }, [search, tab]);
  async function showMore() {
    const next = await loadUsersPage(search.trim(), shown.users.length);
    setView({ users: [...shown.users, ...next.users], total: next.total });
  }
  const act = (id: string) => async (status: string, reason: string, days?: number) => {
    const result = await updateStatus(id, status, reason, days);
    if (view) void refreshView(search.trim(), tab);
    return result;
  };
  const visible = tab === "restricted" && search.trim()
    ? shown.users.filter((u) => [u.email, u.profile?.full_name, u.profile?.username].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase()))
    : shown.users;
  return (
    <>
      <SectionHeader title="Users" description="Every account on VaRoom. Open one to see everything about it." />
      <Table
        columns={["Account", "Signs in with", "Role", "Status", "Joined", "Last sign-in", ""]}
        rows={visible}
        empty={search.trim() ? "No account matches." : tab === "restricted" ? "No account is suspended or disabled." : "No accounts yet."}
        minWidth={960}
        toolbar={<>
          <Tabs label="Accounts" value={tab} onChange={(key) => { setTab(key); setView(null); }}
            tabs={[{ key: "all", label: "All", count: tab === "all" && !search.trim() ? page.total : undefined }, { key: "restricted", label: "Restricted", count: restrictedCount }]} />
          <div className="adm-toolbar__end" style={{ flex: "1 1 260px", justifyContent: "flex-end" }}>
            <label className="adm-search" style={{ maxWidth: 360 }}>
              <Search size={16} aria-hidden="true" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, username or email" aria-label="Search accounts" />
            </label>
          </div>
        </>}
        footer={<>
          <span>{tab === "all" ? `Showing ${visible.length} of ${shown.total.toLocaleString()}${search.trim() ? " that match" : ""}` : `${visible.length} restricted`}</span>
          {tab === "all" && shown.users.length < shown.total && <button type="button" className="adm-btn" style={{ marginLeft: "auto" }} onClick={() => { void showMore(); }}>Show more</button>}
        </>}
        renderRow={(u: AdminUser) => {
          const status = u.account?.status || "active";
          return (
            <tr key={u.id}>
              <td><Person name={personName(u.profile, u.email || "Unnamed")} sub={u.email} id={u.id} onOpen={() => openAccount(u.id)} /></td>
              <td><Pill>{METHOD[u.provider || "email"] || humanize(u.provider)}</Pill></td>
              <td>{u.profile?.role ? humanize(u.profile.role) : "—"}</td>
              <td>
                <StatusPill status={status} />
                {status === "suspended" && <div className="adm-small adm-muted" style={{ marginTop: 4 }}>{u.account.suspended_until ? `Until ${formatDate(u.account.suspended_until)}` : "Until reviewed"}{u.account.rule_key ? " · automatic" : ""}</div>}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>{formatDate(u.created_at)}</td>
              <td style={{ whiteSpace: "nowrap" }}>{timeAgo(u.last_sign_in_at)}</td>
              <td className="adm-cell-actions">
                <div className="adm-inline" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => openAccount(u.id)}>View</button>
                  <ActionMenu label={`Account actions for ${personName(u.profile, u.email)}`} actions={accountActions(status, act(u.id))} />
                </div>
              </td>
            </tr>
          );
        }}
      />
    </>
  );
}

type ListingTab = "all" | "active" | "hidden" | "removed";

export function ListingsControl({ listings, moderate, openAccount }: { listings: AdminListing[]; moderate: (id: string, status: string, reason: string) => Promise<unknown>; openAccount: (id: string) => void }) {
  const [tab, setTab] = useState<ListingTab>("all");
  const [search, setSearch] = useState("");
  const count = (status: string) => listings.filter((l) => l.moderation_status === status).length;
  const q = search.trim().toLowerCase();
  const visible = listings.filter((l) => (tab === "all" || l.moderation_status === tab)
    && (!q || [l.title, l.owner?.full_name, l.owner?.username].filter(Boolean).join(" ").toLowerCase().includes(q)));
  return (
    <>
      <SectionHeader title="Listings" description="Every listing and its moderation. Hidden and taken-down listings leave the feeds; both can be restored." />
      <Table
        columns={["Listing", "Owner", "Availability", "Moderation", ""]}
        rows={visible}
        empty={q ? "No listing matches." : "No listings here."}
        minWidth={860}
        toolbar={<>
          <Tabs label="Moderation" value={tab} onChange={setTab} tabs={[
            { key: "all", label: "All", count: listings.length }, { key: "active", label: "Active", count: count("active") },
            { key: "hidden", label: "Hidden", count: count("hidden") }, { key: "removed", label: "Taken down", count: count("removed") },
          ]} />
          <div className="adm-toolbar__end" style={{ flex: "1 1 240px", justifyContent: "flex-end" }}>
            <label className="adm-search" style={{ maxWidth: 340 }}>
              <Search size={16} aria-hidden="true" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title or owner" aria-label="Search listings" />
            </label>
          </div>
        </>}
        renderRow={(l) => (
          <tr key={l.id}>
            <td className="adm-cell-wrap"><a href={`/booking?listing=${l.id}`} target="_blank" rel="noopener noreferrer" className="adm-strong">{l.title || "Untitled listing"}</a>{l.moderation_reason && <div className="adm-small adm-muted">{l.moderation_reason}</div>}</td>
            <td><Person name={personName(l.owner, "Unnamed host")} id={l.host_id} onOpen={() => openAccount(l.host_id)} /></td>
            <td><StatusPill status={l.availability_status} /></td>
            <td><StatusPill status={l.moderation_status} /></td>
            <td className="adm-cell-actions">
              <ActionMenu label={`Moderate ${l.title || "this listing"}`} actions={[
                ...(l.moderation_status === "active" ? [{ label: "Hide", danger: true, onConfirm: (reason: string) => moderate(l.id, "hidden", reason) }] : []),
                ...(l.moderation_status !== "removed" ? [{ label: "Take down", danger: true, onConfirm: (reason: string) => moderate(l.id, "removed", reason) }] : []),
                ...(l.moderation_status !== "active" ? [{ label: "Restore", onConfirm: (reason: string) => moderate(l.id, "active", reason) }] : []),
              ]} />
            </td>
          </tr>
        )}
      />
    </>
  );
}

export function UpdatesControl({ updates, createUpdate, setUpdateStatus }: {
  updates: VaroomUpdate[];
  createUpdate: (payload: { title: string; body: string; status: string }) => Promise<boolean>;
  setUpdateStatus: (id: string, status: string, reason: string) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(status: string) {
    setSaving(true);
    try { if (await createUpdate({ title, body, status })) { setTitle(""); setBody(""); } } finally { setSaving(false); }
  }
  return (
    <>
      <SectionHeader title="VaRoom Updates" description="News from VaRoom on everyone's home feed. Save a draft, or publish straight away." />
      <Card title="New update">
        <div className="adm-stack">
          <label className="adm-field"><span className="adm-label">Title (optional)</span><input className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></label>
          <label className="adm-field"><span className="adm-label">Update</span><textarea className="adm-textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={5} /></label>
          <div className="adm-inline">
            <span className="adm-small adm-muted">{body.length.toLocaleString()} / 5,000</span>
            <button type="button" className="adm-btn" style={{ marginLeft: "auto" }} disabled={!body.trim() || saving} onClick={() => { void submit("draft"); }}>Save draft</button>
            <button type="button" className="adm-btn adm-btn--primary" disabled={!body.trim() || saving} onClick={() => { void submit("published"); }}>Publish</button>
          </div>
        </div>
      </Card>
      <Table
        columns={["Update", "Status", "Published", ""]}
        rows={updates}
        empty="No updates yet."
        renderRow={(u) => (
          <tr key={u.id}>
            <td className="adm-cell-wrap" style={{ maxWidth: "64ch" }}><span className="adm-strong">{u.title || u.body?.slice(0, 90)}</span><div className="adm-small adm-muted">{u.body?.slice(0, 160)}{(u.body?.length || 0) > 160 ? "…" : ""}</div></td>
            <td><StatusPill status={u.status} /></td>
            <td style={{ whiteSpace: "nowrap" }}>{u.published_at ? formatDate(u.published_at) : "—"}</td>
            <td className="adm-cell-actions">
              <ActionMenu label={`Actions for ${u.title || "this update"}`} actions={[
                ...(u.status !== "published" && u.status !== "removed" ? [{ label: "Publish", onConfirm: (reason: string) => setUpdateStatus(u.id, "published", reason) }] : []),
                ...(u.status === "published" ? [{ label: "Unpublish", onConfirm: (reason: string) => setUpdateStatus(u.id, "unpublished", reason) }] : []),
                ...(u.status === "removed" ? [{ label: "Restore as a draft", onConfirm: (reason: string) => setUpdateStatus(u.id, "draft", reason) }] : []),
                ...(u.status !== "removed" ? [{ label: "Remove", danger: true, separatorBefore: true, onConfirm: (reason: string) => setUpdateStatus(u.id, "removed", reason) }] : []),
              ]} />
            </td>
          </tr>
        )}
      />
    </>
  );
}

const TARGET_LABELS: Record<string, string> = {
  user: "Account", listing: "Listing", support_ticket: "Ticket", rule: "Rule", admin: "Admin", varoom_update: "Update",
  property_news: "Property News", varoom_review: "VaRoom review", listing_report: "Listing report", user_report: "Chat report",
  listing_review: "Guest review", support_template: "Saved reply",
};

export function Activity({ activity, openAccount }: { activity: ActivityEntry[]; openAccount: (id: string) => void }) {
  return (
    <>
      <SectionHeader title="Admin activity" description="Everything admins and the automatic rules did, newest first. It cannot be edited." />
      <Table
        columns={["Who", "What", "On", "Reason", "When"]}
        rows={activity}
        empty="No admin activity yet."
        minWidth={900}
        renderRow={(a) => {
          const who = a.admin?.name || "System";
          return (
            <tr key={a.id}>
              <td><span className="adm-person"><Avatar name={who} size="sm" /><strong>{who}</strong></span></td>
              <td>{actionLabel(a.action)}</td>
              <td>
                <span className="adm-small adm-muted" style={{ display: "block" }}>{TARGET_LABELS[a.target_type] || humanize(a.target_type)}</span>
                {a.target_type === "user" ? <button type="button" className="adm-link" onClick={() => openAccount(a.target_id)}>{a.target_name || "Open account"}</button>
                  : <span className="adm-strong">{a.target_name || `#${a.target_id.slice(0, 8).toUpperCase()}`}</span>}
              </td>
              <td className="adm-cell-wrap adm-muted">{a.reason || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>{formatWhen(a.created_at)}</td>
            </tr>
          );
        }}
      />
    </>
  );
}

export function PropertyNews({ items, onAction, error }: { items: NewsEntry[]; onAction: (id: string, action: "approve" | "reject") => void; error: string }) {
  return (
    <>
      <SectionHeader title="Property News" description="Source-backed reports waiting for review before they appear publicly and in Elie." />
      {error ? <div className="adm-banner adm-banner--bad" role="alert">{error}</div> : null}
      {!error && items.length === 0 ? <Card><div className="adm-muted">No reports are waiting for review.</div></Card> : (
        <div className="adm-stack">
          {items.map(({ item, source }) => (
            <Card key={item.id} title={item.varoom_title || item.source_title || "Untitled report"}
              actions={<>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => onAction(item.id, "reject")}>Reject</button>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => onAction(item.id, "approve")}>Approve</button>
              </>}>
              <div className="adm-inline" style={{ marginBottom: 8 }}>
                {source?.name && <Pill tone="info">{source.name}</Pill>}
                {item.regulatory_status && <Pill>{humanize(item.regulatory_status)}</Pill>}
              </div>
              <p>{item.varoom_summary || <span className="adm-muted">No summary available.</span>}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
