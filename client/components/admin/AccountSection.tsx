import React, { useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import type { AccountOverview, GivablePlan } from "../../lib/admin/adminApi";
import { actionLabel, formatDate, formatWhen, humanize, kes, timeAgo } from "../../lib/admin/format";
import { ActionMenu, Avatar, Card, ConsequentialButton, Pill, StatusPill } from "./AdminUi";
import { accountActions } from "./ModerationSections";

// One account, everything about it (GET /admin/users/:id): who they are,
// linked accounts and teams, listings, bookings, reports, tickets, billing,
// V-Coins, warnings and suspensions, private notes and the admin trail.
// Names open the other person's account; tickets open in Support.

const Empty = ({ children = "None" }: { children?: React.ReactNode }) => <div className="adm-muted">{children}</div>;

function List<T>({ rows, render, empty }: { rows: T[]; render: (row: T, index: number) => React.ReactNode; empty?: string }) {
  return rows.length ? <ul className="adm-plain-list">{rows.map((row, index) => <li key={index} style={{ display: "block" }}>{render(row, index)}</li>)}</ul> : <Empty>{empty}</Empty>;
}

export interface AccountMoney {
  loadPlans: (userId: string) => Promise<GivablePlan[]>;
  givePlan: (userId: string, planId: string, days: number, reason: string) => Promise<boolean>;
  endPlan: (userId: string, reason: string) => Promise<boolean>;
  grantVcoins: (userId: string, amount: number, reason: string) => Promise<boolean>;
}

/** Give a free plan of the host's niche (or extend the one they have), end it, or grant V-Coins. Super admins only (server). */
function MoneyControls({ account, money }: { account: AccountOverview; money: AccountMoney }) {
  const userId = account.user.id;
  const [plans, setPlans] = useState<GivablePlan[] | null>(null);
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState("30");
  const [coins, setCoins] = useState("100");
  const comp = account.billing.subscriptions.find((s) => s.comp && ["active", "past_due", "cancel_requested"].includes(s.status));
  const paid = account.billing.subscriptions.find((s) => !s.comp && ["pending", "active", "past_due", "cancel_requested"].includes(s.status));
  async function showPlans() {
    const list = await money.loadPlans(userId).catch(() => []);
    setPlans(list);
    setPlanId(comp?.plan_id || list[0]?.id || "");
  }
  return (
    <div className="adm-stack" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--adm-line)" }}>
      {paid ? <span className="adm-small adm-muted">This host pays through Paystack; change their plan there.</span>
        : plans === null ? <button type="button" className="adm-btn adm-btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => { void showPlans(); }}>{comp ? "Extend or change the free plan" : "Give a free plan"}</button>
          : plans.length === 0 ? <span className="adm-small adm-muted">No plans for this host&apos;s niche.</span>
            : <div className="adm-inline">
              <label className="sr-only" htmlFor="adm-plan">Plan</label>
              <select id="adm-plan" className="adm-select" style={{ width: "auto", flex: "1 1 200px" }} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({kes(p.monthly)}/mo)</option>)}
              </select>
              <label className="adm-inline"><input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className="adm-input adm-input--narrow" aria-label="Days" /><span className="adm-muted">days</span></label>
              <ConsequentialButton label={comp ? "Extend free plan" : "Give free plan"} primary onConfirm={(reason) => money.givePlan(userId, planId, Number(days), reason)} />
            </div>}
      {comp && <div><ConsequentialButton label="End free plan" tone="danger" onConfirm={(reason) => money.endPlan(userId, reason)} /></div>}
      <div className="adm-inline">
        <input type="number" min={1} max={10000} value={coins} onChange={(e) => setCoins(e.target.value)} className="adm-input adm-input--narrow" aria-label="V-Coins to grant" />
        <ConsequentialButton label="Grant V-Coins" onConfirm={(reason) => money.grantVcoins(userId, Number(coins), reason)} />
      </div>
    </div>
  );
}

const DOCUMENT_LABELS: Record<string, string> = {
  ownership_management: "Ownership or management", property_policy: "Property policy", commercial_policy: "Commercial policy", floor_plan: "Floor plan",
};

export function Account({ account, loading, onBack, openAccount, openTicket, updateStatus, addNote, money, setVerified }: {
  account: AccountOverview | null;
  loading: boolean;
  onBack: () => void;
  openAccount: (id: string) => void;
  openTicket: (id: string) => void;
  updateStatus: (id: string, status: string, reason: string, days?: number) => Promise<unknown>;
  addNote: (userId: string, body: string) => Promise<boolean>;
  money: AccountMoney;
  setVerified: (userId: string, verified: boolean, reason: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const back = <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back</button>;
  if (!account) return <>{back}<Card><div className="adm-muted">{loading ? "Loading the account…" : "This account could not be loaded."}</div></Card></>;
  const { user } = account;
  const status = user.account?.status || "active";
  const name = user.profile?.full_name || user.profile?.username || user.email;
  const person = (id: string, label: string | null) => <button type="button" className="adm-link" onClick={() => openAccount(id)}>{label || "Unnamed"}</button>;

  return (
    <>
      {back}
      <section className="adm-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
        <Avatar name={name} id={user.id} size="lg" />
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <h1 className="adm-title">{name}</h1>
          <div className="adm-inline" style={{ marginTop: 6 }}>
            <span className="adm-muted">{user.email}</span>
            <StatusPill status={status} />
            {user.profile?.role && <Pill>{humanize(user.profile.role)}</Pill>}
            <Pill>Signs in with {user.provider === "google" ? "Google" : humanize(user.provider)}</Pill>
            {user.profile?.verified && <Pill tone="good">Verified host</Pill>}
          </div>
          {status !== "active" && (
            <p className="adm-small adm-muted" style={{ marginTop: 6 }}>
              {status === "suspended" ? (user.account?.suspended_until ? `Suspended until ${formatWhen(user.account.suspended_until)}` : "Suspended until reviewed") : "Disabled"}
              {user.account?.rule_key ? " · by an automatic rule" : ""}{user.account?.reason ? ` · ${user.account.reason}` : ""}
            </p>
          )}
        </div>
        <div className="adm-inline">
          {status !== "active"
            ? <ConsequentialButton label="Restore account" primary small={false} onConfirm={(reason) => updateStatus(user.id, "active", reason)} />
            : <ActionMenu label="Account actions" actions={accountActions(status, (s, reason, days) => updateStatus(user.id, s, reason, days))} />}
        </div>
      </section>

      <div className="adm-grid adm-grid--wide">
        <Card title="Profile">
          <dl className="adm-kv">
            <dt>Username</dt><dd>{user.profile?.username || "—"}</dd>
            <dt>Phone</dt><dd>{user.profile?.phone || "—"}</dd>
            <dt>City</dt><dd>{user.profile?.city || "—"}</dd>
            <dt>Business</dt><dd>{user.profile?.business_name || (user.profile?.host_type ? humanize(user.profile.host_type) : "—")}</dd>
            <dt>Joined</dt><dd>{formatDate(user.created_at)}</dd>
            <dt>Last sign-in</dt><dd>{timeAgo(user.last_sign_in_at)}</dd>
            {user.profile?.deactivated_at && <><dt>Deactivated</dt><dd>{formatWhen(user.profile.deactivated_at)}</dd></>}
          </dl>
        </Card>

        <Card title="Linked accounts" count={account.linked.length}>
          <List rows={account.linked} render={(l) => <span className="adm-inline">{person(l.id, l.name)}<StatusPill status={l.status} /></span>} />
        </Card>

        <Card title="Team" count={account.team.length}>
          <List rows={account.team} render={(t) => <span>{t.as === "owner" ? "Member " : "Works for "}{person(t.id, t.name)}<span className="adm-small adm-muted"> · {(t.roles || []).map(humanize).join(", ") || "No roles"} · {humanize(t.status)}</span></span>} />
        </Card>

        <Card title="Listings" count={account.listings.length}>
          <List rows={account.listings} render={(l) => <span className="adm-inline">
            <a href={`/booking?listing=${l.id}`} target="_blank" rel="noopener noreferrer" className="adm-strong">{l.title}</a>
            <span className="adm-small adm-muted">{humanize(l.category)} · {humanize(l.publication_state || l.availability_status)}</span>
            {l.moderation_status !== "active" && <StatusPill status={l.moderation_status} />}
          </span>} />
        </Card>

        <Card title="Bookings as host" count={account.bookings.asHost.count}>
          <List rows={account.bookings.asHost.recent} render={(b) => <span>{b.listing || "Listing"} · guest {person(b.other_id, b.other)} <span className="adm-small adm-muted">· {humanize(b.status)} · {formatDate(b.created_at)}</span></span>} />
        </Card>

        <Card title="Bookings as guest" count={account.bookings.asGuest.count}>
          <List rows={account.bookings.asGuest.recent} render={(b) => <span>Host {person(b.other_id, b.other)} <span className="adm-small adm-muted">· {humanize(b.status)} · {formatDate(b.created_at)}</span></span>} />
        </Card>

        <Card title="Reports about them" count={account.reports.received.length + account.reports.onListings.length}>
          <List rows={[...account.reports.received, ...account.reports.onListings]} render={(r) => <div>
            <span className="adm-inline"><span className="adm-strong">{r.listing ? `Listing “${r.listing}”` : "Chat"}: {r.reason}</span><StatusPill status={r.status} /></span>
            <span className="adm-small adm-muted">by {r.other_id ? person(r.other_id, r.other || null) : "someone"}{r.details ? ` · ${r.details}` : ""}</span>
          </div>} />
        </Card>

        <Card title="Reports they filed" count={account.reports.filed.length + account.reports.filedOnListings.length}>
          <List rows={[...account.reports.filed, ...account.reports.filedOnListings]} render={(r) => <span className="adm-inline">
            {r.other_id ? <span>About {person(r.other_id, r.other || null)}</span> : <span>About a listing</span>}<span className="adm-muted">· {r.reason}</span><StatusPill status={r.status} />
          </span>} />
        </Card>

        <Card title="Support tickets" count={account.tickets.length}>
          <List rows={account.tickets} render={(t) => <span className="adm-inline"><button type="button" className="adm-link" onClick={() => openTicket(t.id)}>{t.subject}</button><StatusPill status={t.status} /></span>} />
        </Card>

        <Card title="Plans and payments">
          <List rows={account.billing.subscriptions} empty="No plans." render={(s) => <span className="adm-inline">
            <span className="adm-strong">{s.plan_id}</span>{s.comp && <Pill tone="violet">Free from VaRoom</Pill>}<StatusPill status={s.status} />
            <span className="adm-small adm-muted">to {formatDate(s.current_period_end)}{s.cancel_at_period_end && !s.comp ? " · cancels" : ""}</span>
          </span>} />
          <hr className="adm-divider" />
          <List rows={account.billing.payments} empty="No payments." render={(p) => <span className="adm-inline">
            <span className="adm-strong">{kes(p.amount_minor / 100)}</span><span className="adm-muted">{humanize(p.payment_kind || p.plan_id)}</span><StatusPill status={p.status} />
            <span className="adm-small adm-muted">{formatDate(p.paid_at || p.created_at)}</span>
          </span>} />
        </Card>

        <Card title="V-Coins" actions={<span className="adm-h2">{account.vcoins.balance.toLocaleString()}</span>}>
          <List rows={account.vcoins.recent} empty="No V-Coin history." render={(v) => <span className="adm-inline">
            <span className="adm-strong" style={{ color: v.delta > 0 ? "var(--adm-good)" : "var(--adm-ink-2)" }}>{v.delta > 0 ? "+" : ""}{v.delta}</span>
            <span>{humanize(v.kind)}</span><span className="adm-small adm-muted">{formatWhen(v.created_at)}</span>
          </span>} />
          <MoneyControls account={account} money={money} />
        </Card>

        <Card title="Warnings and suspensions" count={account.actions.length}>
          <List rows={account.actions} empty="Never warned or suspended." render={(a) => <div>
            <span className="adm-inline"><StatusPill status={a.action} />{a.suspended_until && <span className="adm-small adm-muted">until {formatWhen(a.suspended_until)}</span>}</span>
            <div style={{ marginTop: 4 }}>{a.reason}</div>
            <span className="adm-small adm-muted">{a.admin?.name || "Automatic rule"} · {formatWhen(a.created_at)}</span>
          </div>} />
        </Card>

        <Card title="Documents and verification" count={account.documents.length}>
          <List rows={account.documents} empty="No documents uploaded." render={(d) => <span className="adm-inline">
            <FileText size={16} aria-hidden="true" />
            <a href={`/admin/documents/${d.id}/open`} target="_blank" rel="noopener noreferrer" className="adm-strong">{DOCUMENT_LABELS[d.document_type] || humanize(d.document_type)}</a>
            <span className="adm-small adm-muted">{d.listing || "Listing"} · {d.visibility === "host_only" ? "private" : "on the listing"}</span>
          </span>} />
          <p className="adm-small adm-muted" style={{ margin: "14px 0 10px" }}>Opening a document is recorded. The Verified host badge shows on their listings and profile.</p>
          {user.profile?.verified
            ? <ConsequentialButton label="Remove Verified host" tone="danger" onConfirm={(reason) => setVerified(user.id, false, reason)} />
            : <ConsequentialButton label="Mark as Verified host" primary onConfirm={(reason) => setVerified(user.id, true, reason)} />}
        </Card>
      </div>

      <div className="adm-row">
        <Card title="Private notes" count={account.notes.length} className="adm-grow">
          <div className="adm-stack">
            <label className="sr-only" htmlFor="adm-note">Note for other admins</label>
            <textarea id="adm-note" className="adm-textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} rows={3} placeholder="A note for other admins. The person never sees it." />
            <div><button type="button" className="adm-btn adm-btn--primary" disabled={!note.trim()} onClick={async () => { if (await addNote(user.id, note.trim())) setNote(""); }}>Add note</button></div>
            <List rows={account.notes} empty="No notes yet." render={(n) => <div>
              <div className="adm-pre">{n.body}</div>
              <span className="adm-small adm-muted">{n.admin?.name || "Admin"} · {formatWhen(n.created_at)}</span>
            </div>} />
          </div>
        </Card>
        <Card title="Admin activity on this account" count={account.activity.length} className="adm-grow">
          <List rows={account.activity} empty="No admin has acted on this account." render={(a) => <div>
            <strong>{a.admin?.name || "System"}</strong> {actionLabel(a.action)}{a.reason ? <span className="adm-muted"> · {a.reason}</span> : null}
            <div className="adm-small adm-muted">{formatWhen(a.created_at)}</div>
          </div>} />
        </Card>
      </div>
    </>
  );
}
