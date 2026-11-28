import React from "react";
import type { HealthReport, HealthRows } from "../../lib/admin/adminApi";
import { SectionHeader, StatusPill } from "./AdminUi";

// What needs fixing behind the scenes (GET /admin/health): background jobs,
// failed emails and Paystack webhooks, plans whose renewal never arrived,
// calendar links and media cleanup that fail, Elie and Property News, and
// missing settings. Each card stands alone.

const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "—");

function Card({ title, ok, children }: { title: string; ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`border rounded-sm bg-white p-4 ${ok ? "border-[#E4E1DA]" : "border-[#B5482E]"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-[#24211E]">{title}</div>
        <StatusPill status={ok ? "Healthy" : "Needs attention"} />
      </div>
      <div className="text-sm space-y-1">{children}</div>
    </div>
  );
}

function Problems<T>({ title, rows, render, empty }: { title: string; rows: HealthRows<T>; render: (row: T) => React.ReactNode; empty: string }) {
  const count = rows.count || 0;
  return (
    <Card title={title} ok={!rows.error && count === 0}>
      {rows.error ? <div className="text-[#B5482E]">This check could not run: {rows.error}</div>
        : count === 0 ? <div className="text-[#8a857c]">{empty}</div>
          : <>{<div>{count} in all{count > (rows.recent || []).length ? ", latest:" : ":"}</div>}<ul className="text-xs text-[#5c584f] space-y-1">{(rows.recent || []).map((row, index) => <li key={index}>{render(row)}</li>)}</ul></>}
    </Card>
  );
}

export function Health({ report, refresh, openAccount }: { report: HealthReport | null; refresh: () => void; openAccount: (id: string) => void }) {
  if (!report) return <div className="text-sm text-[#8a857c]">Checking…</div>;
  const { config } = report;
  const settingsOk = config.inboundEmail && config.outboundEmail && config.paystackWebhook && config.adminsWithoutTwoStep.length === 0;
  const person = (id: string) => <button onClick={() => openAccount(id)} className="text-[#1F6F5C] hover:underline">{id.slice(0, 8)}</button>;
  return (
    <div>
      <SectionHeader title="Health" description={`Checked ${when(report.checked_at)}. Background jobs are this server's own record since it last started.`} />
      <button onClick={refresh} className="mb-4 px-3 py-1.5 text-sm border border-[#E4E1DA] rounded-sm">Check again</button>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card title="Background jobs" ok={report.jobs.every((job) => job.state === "ok" || job.state === "waiting")}>
          <ul className="text-xs space-y-1">
            {report.jobs.map((job) => (
              <li key={job.name}>
                <span className={job.state === "failing" || job.state === "late" ? "text-[#B5482E]" : ""}>{job.name}: {job.state}</span>
                <span className="text-[#8a857c]"> · last run {when(job.last_run_at)}</span>
                {job.last_error && <div className="text-[#B5482E]">{job.last_error}</div>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Services" ok={report.services.every((s) => s.ok)}>
          {report.services.map((s) => (
            <div key={s.name}>{s.name}: {!s.configured ? "not configured" : s.ok ? `answering (${s.ms} ms)` : `not answering${s.status ? ` (${s.status})` : ""}${s.error ? ` · ${s.error}` : ""}`}</div>
          ))}
        </Card>
        <Card title="Settings" ok={settingsOk}>
          <div>Support email received: {config.inboundEmail ? "yes" : "no (RESEND_WEBHOOK_SECRET is not set)"}</div>
          <div>Email sending: {config.outboundEmail ? "yes" : "no (RESEND_API_KEY is not set)"}</div>
          <div>Paystack: {config.paystackWebhook ? "configured" : "PAYSTACK_SECRET_KEY is not set"}</div>
          <div>Admins without two-step sign-in: {config.adminsWithoutTwoStep.length ? config.adminsWithoutTwoStep.map((a) => a.name).join(", ") : "none"}</div>
        </Card>
        <Problems title="Emails that failed (7 days)" rows={report.email} empty="Every support email in the last 7 days was delivered."
          render={(e) => <>{e.recipient} · {e.subject} · {when(e.sent_at)}{e.provider_error && <div className="text-[#B5482E]">{e.provider_error}</div>}</>} />
        <Problems title="Paystack webhooks that failed (7 days)" rows={report.webhooks} empty="Every Paystack event in the last 7 days was processed."
          render={(w) => <>{w.event_type} · {when(w.received_at)}{w.processing_error && <div className="text-[#B5482E]">{w.processing_error}</div>}</>} />
        <Problems title="Plans whose renewal never arrived" rows={report.stuckPlans} empty="Every live Paystack plan is within its period."
          render={(p) => <>{person(p.host_id)} · {p.plan_id} · {p.status} · period ended {when(p.current_period_end)}</>} />
        <Problems title="Calendar links failing" rows={report.calendar} empty="Every calendar link synced."
          render={(c) => <>{person(c.host_id)} · {c.name || "Calendar link"}<div className="text-[#B5482E]">{c.last_error}</div></>} />
        <Problems title="Draft media cleanup failing" rows={report.media} empty="No draft media cleanup is failing."
          render={(m) => <>Listing {m.listing_id.slice(0, 8)} · {m.attempts} attempts<div className="text-[#B5482E]">{m.last_error}</div></>} />
      </div>
    </div>
  );
}
