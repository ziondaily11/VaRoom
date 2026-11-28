import React from "react";
import { AlertTriangle, ArrowRight, Building2, Clock, Flag, Gavel, LifeBuoy, LogIn, Mail, RefreshCw, Shield, Wallet, type LucideIcon } from "lucide-react";
import type { ActivityEntry, GrowthPoint, Overview as OverviewData, RevenueReport, SectionKey, SigninPoint, SigninRow, Transaction } from "../../lib/admin/adminApi";
import { actionLabel, formatWhen, kes, timeAgo } from "../../lib/admin/format";
import { Avatar, Bars, Card, Person, Pill, SectionHeader, StatCard, StatusPill, Table } from "./AdminUi";

// Overview, Sign-ins, Revenue and Growth. Charts are the theme's own bars
// (AdminUi Bars), so they follow light and dark with no chart library.

const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface AttentionItem { title: string; detail: string; section: SectionKey; where: string; icon: LucideIcon; tone: "bad" | "warn" | "info" | "accent" }

function attentionItems(overview: OverviewData): AttentionItem[] {
  const a = overview.attention;
  if (!a) return [];
  const items: Array<AttentionItem | false> = [
    Boolean(a.failedEmails) && { title: `${plural(a.failedEmails as number, "support email")} not delivered`, detail: "In the last 7 days. Health shows why.", section: "health", where: "Health", icon: Mail, tone: "bad" },
    Boolean(a.appeals) && { title: `${plural(a.appeals as number, "suspension appeal")} waiting`, detail: "From restricted accounts, high priority", section: "support", where: "Support", icon: LifeBuoy, tone: "accent" },
    Boolean(a.pendingReports) && { title: `${plural(a.pendingReports as number, "report")} waiting for review`, detail: "Listings and chats reported by people", section: "reports", where: "Reports", icon: Flag, tone: "warn" },
    Boolean(a.stuckPlans) && { title: `${plural(a.stuckPlans as number, "Paystack plan")} missed renewal`, detail: "Live, but their paid period ended over a day ago", section: "health", where: "Health", icon: RefreshCw, tone: "warn" },
    Boolean(a.adminsWithoutTwoStep) && { title: `${plural(a.adminsWithoutTwoStep as number, "admin")} without two-step sign-in`, detail: "A stolen password alone could open this page", section: "admins", where: "Admins", icon: Shield, tone: "warn" },
    Boolean(a.shadowRules) && { title: `${plural(a.shadowRules as number, "rule")} recording in shadow mode`, detail: "Check what they flagged, then enforce", section: "rules", where: "Rules", icon: Gavel, tone: "info" },
  ];
  return items.filter((item): item is AttentionItem => Boolean(item));
}

export function ActivityFeed({ activity, limit }: { activity: ActivityEntry[]; limit?: number }) {
  const rows = limit ? activity.slice(0, limit) : activity;
  if (!rows.length) return <div className="adm-muted">No admin activity yet.</div>;
  return (
    <ol className="adm-plain-list">
      {rows.map((a) => {
        const who = a.admin?.name || "System";
        return (
          <li key={a.id}>
            <Avatar name={who} size="sm" />
            <span style={{ minWidth: 0 }}>
              <strong>{who}</strong> {actionLabel(a.action)}{a.target_name ? <>: <span className="adm-strong">{a.target_name}</span></> : null}
              {a.reason && <span className="adm-muted"> · {a.reason}</span>}
              <span className="adm-small adm-muted" style={{ display: "block" }}>{formatWhen(a.created_at)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Overview({ overview, me, revenue, activity, goTo }: {
  overview: OverviewData; me: string | null; revenue: RevenueReport; activity: ActivityEntry[]; goTo: (section: SectionKey) => void;
}) {
  const items = attentionItems(overview);
  const accounts = overview.accounts;
  const active = accounts ? accounts.total - accounts.suspended - accounts.disabled : 0;
  const share = (n: number) => (accounts && accounts.total ? `${(n / accounts.total) * 100}%` : "0%");
  return (
    <>
      <SectionHeader
        eyebrow={today()}
        title={`${greeting()}${me ? `, ${me.split(" ")[0]}` : ""}`}
        description={items.length ? `${plural(items.length, "thing needs", "things need")} you today. Everything else is running.` : "Nothing needs you right now."}
        actions={<button type="button" className="adm-btn adm-btn--primary" onClick={() => goTo("health")}>Open Health <ArrowRight size={16} aria-hidden="true" /></button>}
      />

      <div className="adm-grid">
        <StatCard label="Sign-ins" value={overview.signins} sub="People who signed in, last 7 days" icon={LogIn} />
        <StatCard label="Revenue" value={kes(overview.revenue)} sub="Plans, listings and V-Coins, last 7 days" icon={Wallet} />
        <StatCard label="Open tickets" value={overview.openTickets} sub={overview.openTickets ? "Waiting in Support" : "Support is clear"} icon={LifeBuoy} tone={overview.openTickets ? "warn" : undefined} />
        <StatCard label="New listings" value={overview.newListings} sub="Created in the last 7 days" icon={Building2} />
      </div>

      <div className="adm-row">
        <Card title="Needs attention" count={items.length} className="adm-grow">
          {items.length ? (
            <div className="adm-list">
              {items.map((item) => (
                <button key={item.title} type="button" className="adm-list__item" onClick={() => goTo(item.section)}>
                  <span className="adm-list__icon" data-tone={item.tone}><item.icon size={18} aria-hidden="true" /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="adm-strong" style={{ display: "block" }}>{item.title}</span>
                    <span className="adm-small adm-muted">{item.detail}</span>
                  </span>
                  <span className="adm-list__go">{item.where} →</span>
                </button>
              ))}
            </div>
          ) : <div className="adm-muted">Nothing needs you right now.</div>}
        </Card>

        <Card title="Revenue" className="adm-grow" actions={<span className="adm-h2">{kes(revenue.total)}</span>}>
          <div className="adm-stack">
            <div className="adm-inline">
              <span className="adm-muted">Last {revenue.range} days</span>
              <Pill tone="accent">Plans {kes(revenue.byKind.subscription)}</Pill>
              <Pill tone="info">Listings {kes(revenue.byKind.listing)}</Pill>
              <Pill tone="good">V-Coins {kes(revenue.byKind.vcoins)}</Pill>
            </div>
            <Bars days={revenue.series.map((p) => p.day)} values={revenue.series.map((p) => [p.revenue])} format={kes}
              label={`Daily revenue for the last ${revenue.range} days, ${kes(revenue.total)} in all`} />
            <div className="adm-inline adm-muted">Monthly plan revenue <strong style={{ color: "var(--adm-ink)" }}>{kes(revenue.mrr)}</strong> · Paid plans <strong style={{ color: "var(--adm-ink)" }}>{revenue.subscribers.paid}</strong></div>
          </div>
        </Card>
      </div>

      <div className="adm-row">
        <Card title="Recent activity" className="adm-grow" actions={<button type="button" className="adm-link" onClick={() => goTo("activity")}>All activity →</button>}>
          <ActivityFeed activity={activity} limit={6} />
        </Card>
        <Card title="Accounts" className="adm-side" actions={<button type="button" className="adm-link" onClick={() => goTo("users")}>Open Users →</button>}>
          {accounts ? (
            <div className="adm-stack">
              <div className="adm-stat__value">{accounts.total.toLocaleString()}</div>
              <div className="adm-meter" role="img" aria-label={`${active} active, ${accounts.suspended} suspended, ${accounts.disabled} disabled`}>
                <span style={{ width: share(active), background: "var(--adm-good)" }} />
                <span style={{ width: share(accounts.suspended), background: "var(--adm-warn)" }} />
                <span style={{ width: share(accounts.disabled), background: "var(--adm-bad)" }} />
              </div>
              <div className="adm-stack adm-stack--tight">
                <div className="adm-inline"><Pill tone="good" dot>Active</Pill><strong style={{ marginLeft: "auto" }}>{active}</strong></div>
                <div className="adm-inline"><Pill tone="warn" dot>Suspended</Pill><strong style={{ marginLeft: "auto" }}>{accounts.suspended}</strong></div>
                <div className="adm-inline"><Pill tone="bad" dot>Disabled</Pill><strong style={{ marginLeft: "auto" }}>{accounts.disabled}</strong></div>
              </div>
            </div>
          ) : <div className="adm-muted">Account counts are not available right now.</div>}
        </Card>
      </div>
    </>
  );
}

export function Signins({ signins, series }: { signins: SigninRow[]; series: SigninPoint[] }) {
  const total = series.reduce((sum, d) => sum + d.signins, 0);
  return (
    <>
      <SectionHeader title="Sign-ins" description="Each person's latest sign-in over the last 14 days." />
      <Card title="Sign-ins per day" actions={<span className="adm-muted">{plural(total, "sign-in")} in 14 days</span>}>
        <Bars days={series.map((d) => d.day)} values={series.map((d) => [d.signins])} label={`Sign-ins per day, ${total} in the last 14 days`} />
      </Card>
      <Table
        columns={["Person", "Signs in with", "Last sign-in"]}
        rows={signins}
        empty="Nobody signed in during the last 14 days."
        minWidth={560}
        renderRow={(r, i) => (
          <tr key={`${r.user}-${i}`}>
            <td><Person name={r.user} /></td>
            <td><Pill>{r.method === "google" ? "Google" : r.method === "email" ? "Email" : r.method}</Pill></td>
            <td>{timeAgo(r.time)}<div className="adm-small adm-muted">{formatWhen(r.time)}</div></td>
          </tr>
        )}
      />
    </>
  );
}

const KIND_LABELS: Record<Transaction["kind"], string> = { subscription: "Plan", listing: "Listing", vcoins: "V-Coins" };
const what = (t: Transaction) => (t.kind === "vcoins" ? `${t.vcoins} V-Coins` : t.kind === "listing" ? `${t.listing_tier ? `${t.listing_tier[0].toUpperCase()}${t.listing_tier.slice(1)}` : "Paid"} listing` : t.plan_id || "Plan");

function PaymentsTable({ rows, openAccount, empty }: { rows: Transaction[]; openAccount: (id: string) => void; empty: string }) {
  return (
    <Table
      columns={["Payer", "For", "Amount", "Status", "Reference", "Date"]}
      rows={rows}
      empty={empty}
      renderRow={(r) => (
        <tr key={r.id}>
          <td><Person name={r.payer || "Unnamed host"} id={r.host_id} onOpen={() => openAccount(r.host_id)} /></td>
          <td><span className="adm-strong">{KIND_LABELS[r.kind]}</span><div className="adm-small adm-muted">{what(r)}</div></td>
          <td className="adm-strong" style={{ whiteSpace: "nowrap" }}>{kes(r.amount)}</td>
          <td><StatusPill status={r.status} /></td>
          <td className="adm-mono adm-muted">{r.reference}</td>
          <td style={{ whiteSpace: "nowrap" }}>{formatWhen(r.date)}</td>
        </tr>
      )}
    />
  );
}

/** What VaRoom earns: plans, Silver/Gold listings and V-Coins (bookings are paid to hosts directly). */
export function Revenue({ report, openAccount }: { report: RevenueReport; openAccount: (id: string) => void }) {
  const { total, transactions, series, byKind, subscribers } = report;
  return (
    <>
      <SectionHeader title="Revenue" description={`What VaRoom earned in the last ${report.range} days: plans, Silver and Gold listings, and V-Coins. Bookings are paid to hosts directly and are not included. Refunds are issued in Paystack.`} />
      <div className="adm-grid">
        <StatCard label={`Revenue, ${report.range} days`} value={kes(total)} sub={plural(transactions.length, "payment")} icon={Wallet} />
        <StatCard label="Monthly plan revenue" value={kes(report.mrr)} sub={plural(subscribers.paid, "paid plan")} icon={RefreshCw} />
        <StatCard label="Past due" value={subscribers.pastDue} sub={`${subscribers.cancelling} cancelling`} icon={Clock} tone={subscribers.pastDue ? "warn" : undefined} />
        <StatCard label={`Failed payments, ${report.range} days`} value={report.failed.length} sub="Checkouts that did not go through" icon={AlertTriangle} tone={report.failed.length ? "bad" : undefined} />
      </div>
      <Card title="Revenue per day" actions={<div className="adm-inline"><Pill tone="accent">Plans {kes(byKind.subscription)}</Pill><Pill tone="info">Listings {kes(byKind.listing)}</Pill><Pill tone="good">V-Coins {kes(byKind.vcoins)}</Pill></div>}>
        <Bars days={series.map((p) => p.day)} values={series.map((p) => [p.revenue])} format={kes} label={`Daily revenue for the last ${report.range} days, ${kes(total)} in all`} />
      </Card>
      <h2 className="adm-h2">Payments</h2>
      <PaymentsTable rows={transactions} openAccount={openAccount} empty={`No payments in the last ${report.range} days.`} />
      <div className="adm-row">
        <Card title="Paid plans" count={subscribers.paid} className="adm-grow">
          {subscribers.byPlan.length ? (
            <ul className="adm-plain-list">
              {subscribers.byPlan.map((p) => (
                <li key={p.plan_id}><span style={{ flex: 1 }} className="adm-strong">{p.name}</span><span className="adm-muted">{plural(p.count, "host")}</span><span className="adm-strong">{kes(p.monthly)}/mo</span></li>
              ))}
            </ul>
          ) : <div className="adm-muted">No paid plans right now.</div>}
        </Card>
        <Card title="Free plans from VaRoom" count={report.freePlans.length} className="adm-grow">
          {report.freePlans.length ? (
            <ul className="adm-plain-list">
              {report.freePlans.map((f) => (
                <li key={f.host_id}><span style={{ flex: 1, minWidth: 0 }}><Person name={f.host || "Unnamed host"} id={f.host_id} sub={f.name} onOpen={() => openAccount(f.host_id)} /></span><span className="adm-muted">until {formatWhen(f.until)}</span></li>
              ))}
            </ul>
          ) : <div className="adm-muted">No free plans right now. Give one from a host's account.</div>}
        </Card>
      </div>
      <h2 className="adm-h2">Failed and abandoned payments</h2>
      <PaymentsTable rows={report.failed} openAccount={openAccount} empty="No checkouts failed. The payer of one that does can be contacted from their account." />
      <h2 className="adm-h2">Refunded payments</h2>
      <PaymentsTable rows={report.refunded} openAccount={openAccount} empty="No refunds." />
    </>
  );
}

export function Growth({ series }: { series: GrowthPoint[] }) {
  const signups = series.reduce((s, d) => s + d.signups, 0);
  const listings = series.reduce((s, d) => s + d.listings, 0);
  return (
    <>
      <SectionHeader title="Growth" description="New accounts and new listings, day by day, over the last 14 days." />
      <div className="adm-grid">
        <StatCard label="New accounts" value={signups} sub="Last 14 days" icon={LogIn} />
        <StatCard label="New listings" value={listings} sub="Last 14 days" icon={Building2} />
      </div>
      <Card title="Per day" actions={<div className="adm-legend"><span><span className="adm-legend__swatch" />Accounts</span><span><span className="adm-legend__swatch" data-series="1" />Listings</span></div>}>
        <Bars days={series.map((d) => d.day)} values={series.map((d) => [d.signups, d.listings])} label={`${signups} new accounts and ${listings} new listings in 14 days`} />
      </Card>
    </>
  );
}
