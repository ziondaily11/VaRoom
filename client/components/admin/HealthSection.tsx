import React from "react";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import type { HealthReport, HealthRows } from "../../lib/admin/adminApi";
import { formatWhen, timeAgo } from "../../lib/admin/format";
import { Card, Pill, SectionHeader, StatusPill } from "./AdminUi";

// What needs fixing behind the scenes (GET /admin/health): background jobs,
// failed emails and Paystack webhooks, plans whose renewal never arrived,
// calendar links and media cleanup that fail, Elie and Property News, and
// missing settings. Each card stands alone.

function HealthCard({ title, ok, children }: { title: string; ok: boolean; children: React.ReactNode }) {
  return (
    <Card title={<span className="adm-inline">{ok ? <CheckCircle2 size={18} aria-hidden="true" style={{ color: "var(--adm-good)" }} /> : <AlertTriangle size={18} aria-hidden="true" style={{ color: "var(--adm-bad)" }} />}{title}</span>}
      actions={<Pill tone={ok ? "good" : "bad"} dot>{ok ? "Healthy" : "Needs attention"}</Pill>}>
      <div className="adm-stack adm-stack--tight">{children}</div>
    </Card>
  );
}

function Problems<T>({ title, rows, render, empty }: { title: string; rows: HealthRows<T>; render: (row: T) => React.ReactNode; empty: string }) {
  const count = rows.count || 0;
  return (
    <HealthCard title={title} ok={!rows.error && count === 0}>
      {rows.error ? <div style={{ color: "var(--adm-bad)" }}>This check could not run: {rows.error}</div>
        : count === 0 ? <div className="adm-muted">{empty}</div>
          : <>
            <div className="adm-strong">{count} in all{count > (rows.recent || []).length ? ". The latest:" : ":"}</div>
            <ul className="adm-plain-list">{(rows.recent || []).map((row, index) => <li key={index} style={{ display: "block" }}>{render(row)}</li>)}</ul>
          </>}
    </HealthCard>
  );
}

const Problem = ({ children }: { children: React.ReactNode }) => <div className="adm-small" style={{ color: "var(--adm-bad)" }}>{children}</div>;

export function Health({ report, refresh, openAccount }: { report: HealthReport | null; refresh: () => void; openAccount: (id: string) => void }) {
  const header = <SectionHeader title="Health" description={report ? `Checked ${formatWhen(report.checked_at)}. Background jobs are this server's own record since it last started.` : "Checking…"}
    actions={<button type="button" className="adm-btn" onClick={refresh}><RefreshCw size={16} aria-hidden="true" />Check again</button>} />;
  if (!report) return header;
  const { config } = report;
  const settingsOk = config.inboundEmail && config.outboundEmail && config.paystackWebhook && config.adminsWithoutTwoStep.length === 0;
  const person = (id: string) => <button type="button" className="adm-link" onClick={() => openAccount(id)}>Open account</button>;
  const yes = (ok: boolean, good: string, bad: string) => <span className="adm-inline"><Pill tone={ok ? "good" : "bad"} dot>{ok ? "Yes" : "No"}</Pill><span className="adm-muted">{ok ? good : bad}</span></span>;
  return (
    <>
      {header}
      <div className="adm-grid adm-grid--wide">
        <HealthCard title="Background jobs" ok={report.jobs.every((job) => job.state === "ok" || job.state === "waiting")}>
          <ul className="adm-plain-list">
            {report.jobs.map((job) => (
              <li key={job.name} style={{ display: "block" }}>
                <span className="adm-inline"><span className="adm-strong" style={{ flex: 1 }}>{job.name}</span><StatusPill status={`job_${job.state}`} /></span>
                <span className="adm-small adm-muted">Last run {job.last_run_at ? timeAgo(job.last_run_at) : "not yet"}</span>
                {job.last_error && <Problem>{job.last_error}</Problem>}
              </li>
            ))}
          </ul>
        </HealthCard>
        <HealthCard title="Services" ok={report.services.every((s) => s.ok)}>
          {report.services.map((s) => (
            <div key={s.name} className="adm-inline">
              <span className="adm-strong" style={{ flex: 1 }}>{s.name}</span>
              <Pill tone={s.ok ? "good" : "bad"} dot>{!s.configured ? "Not set up" : s.ok ? `Answering · ${s.ms} ms` : `Not answering${s.status ? ` (${s.status})` : ""}`}</Pill>
              {s.error && <Problem>{s.error}</Problem>}
            </div>
          ))}
        </HealthCard>
        <HealthCard title="Settings" ok={settingsOk}>
          <div><span className="adm-strong">Support email received</span><div>{yes(config.inboundEmail, "Resend's webhook is set up", "RESEND_WEBHOOK_SECRET is not set")}</div></div>
          <div><span className="adm-strong">Email sending</span><div>{yes(config.outboundEmail, "RESEND_API_KEY is set", "RESEND_API_KEY is not set")}</div></div>
          <div><span className="adm-strong">Paystack</span><div>{yes(config.paystackWebhook, "PAYSTACK_SECRET_KEY is set", "PAYSTACK_SECRET_KEY is not set")}</div></div>
          <div><span className="adm-strong">Admins without two-step sign-in</span><div className="adm-muted">{config.adminsWithoutTwoStep.length ? config.adminsWithoutTwoStep.map((a) => a.name).join(", ") : "None"}</div></div>
        </HealthCard>
        <Problems title="Emails that failed, 7 days" rows={report.email} empty="Every support email in the last 7 days was delivered."
          render={(e) => <><span className="adm-strong">{e.subject}</span> <span className="adm-muted">to {e.recipient} · {formatWhen(e.sent_at)}</span>{e.provider_error && <Problem>{e.provider_error}</Problem>}</>} />
        <Problems title="Paystack webhooks that failed, 7 days" rows={report.webhooks} empty="Every Paystack event in the last 7 days was processed."
          render={(w) => <><span className="adm-strong">{w.event_type}</span> <span className="adm-muted">· {formatWhen(w.received_at)}</span>{w.processing_error && <Problem>{w.processing_error}</Problem>}</>} />
        <Problems title="Plans whose renewal never arrived" rows={report.stuckPlans} empty="Every live Paystack plan is within its paid period."
          render={(p) => <span className="adm-inline"><span className="adm-strong">{p.plan_id}</span><StatusPill status={p.status} /><span className="adm-muted">ended {formatWhen(p.current_period_end)}</span>{person(p.host_id)}</span>} />
        <Problems title="Calendar links failing" rows={report.calendar} empty="Every calendar link synced."
          render={(c) => <><span className="adm-inline"><span className="adm-strong">{c.name || "Calendar link"}</span>{person(c.host_id)}</span><Problem>{c.last_error}</Problem></>} />
        <Problems title="Draft media cleanup failing" rows={report.media} empty="No draft media cleanup is failing."
          render={(m) => <><span className="adm-strong">{m.attempts} attempts</span> <span className="adm-muted">· {formatWhen(m.updated_at)}</span><Problem>{m.last_error}</Problem></>} />
      </div>
    </>
  );
}
