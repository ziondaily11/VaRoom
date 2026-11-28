import React from "react";
import { ChevronRight } from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { GrowthPoint, Overview as OverviewData, RevenuePoint, RevenueReport, SectionKey, SigninPoint, SigninRow, Transaction } from "../../lib/admin/adminApi";

const kes = (amount: number) => `KES ${Math.round(amount).toLocaleString()}`;
import { SectionHeader, StatCard, Table } from "./AdminUi";

export function Overview({ overview, signinsSeries, revenueSeries, goTo }: {
  overview: OverviewData; signinsSeries: SigninPoint[]; revenueSeries: RevenuePoint[]; goTo: (section: SectionKey) => void;
}) {
  const totalRevenue = Number(overview.revenue || 0);
  return (
    <div>
      <SectionHeader
        title="Overview"
        description="A snapshot of sign-ins, revenue, support, and growth across the platform."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Sign-ins (7d)" value={overview.signins} />
        <StatCard label="Revenue (7d)" value={kes(totalRevenue)} sub="Plans, listings and V-Coins" />
        <StatCard
          label="Open support tickets"
          value={overview.openTickets}
          sub="Needs attention"
          alert={overview.openTickets > 0}
        />
        <StatCard label="New listings (7d)" value={overview.newListings} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-[#E4E1DA] rounded-sm bg-white p-4">
          <div className="text-sm text-[#24211E] mb-3">Sign-ins, last 14 days</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={signinsSeries}>
              <defs>
                <linearGradient id="signinsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1F6F5C" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#1F6F5C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E4E1DA" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8a857c" }} interval={3} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#8a857c" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: "#E4E1DA" }} />
              <Area type="monotone" dataKey="signins" stroke="#1F6F5C" fill="url(#signinsFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="border border-[#E4E1DA] rounded-sm bg-white p-4">
          <div className="text-sm text-[#24211E] mb-3">Revenue, last 30 days</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={revenueSeries}>
              <CartesianGrid stroke="#E4E1DA" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8a857c" }} interval={3} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#8a857c" }} axisLine={false} tickLine={false} width={36} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: "#E4E1DA" }} />
              <Line type="monotone" dataKey="revenue" stroke="#24211E" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 border border-[#E4E1DA] rounded-sm bg-white p-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-[#24211E]">Support needs a look</div>
          <div className="text-xs text-[#8a857c] mt-1">
            {overview.openTickets} open ticket{overview.openTickets === 1 ? "" : "s"}.
          </div>
        </div>
        <button
          onClick={() => goTo("support")}
          className="flex items-center gap-1 text-sm text-[#1F6F5C] hover:underline"
        >
          Go to support <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function Signins({ signins, series }: { signins: SigninRow[]; series: SigninPoint[] }) {
  return (
    <div>
      <SectionHeader title="Sign-ins" description="Recent authentication activity across the platform." />
      <div className="border border-[#E4E1DA] rounded-sm bg-white p-4 mb-4">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={series}>
            <defs>
              <linearGradient id="signinsFill2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1F6F5C" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#1F6F5C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E4E1DA" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8a857c" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#8a857c" }} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: "#E4E1DA" }} />
            <Area type="monotone" dataKey="signins" stroke="#1F6F5C" fill="url(#signinsFill2)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Table
        columns={["User", "Method", "Time", "Device"]}
        rows={signins}
        renderRow={(r, i) => (
          <tr key={i} className="border-b border-[#E4E1DA] last:border-0">
            <td className="px-4 py-2">{r.user}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.method}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.time}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.device}</td>
          </tr>
        )}
      />
    </div>
  );
}

const KIND_LABELS: Record<Transaction["kind"], string> = { subscription: "Plan", listing: "Listing", vcoins: "V-Coins" };
const what = (t: Transaction) => (t.kind === "vcoins" ? `${t.vcoins} V-Coins` : t.kind === "listing" ? `${t.listing_tier || "Paid"} listing` : t.plan_id || "Plan");

function PaymentsTable({ rows, openAccount }: { rows: Transaction[]; openAccount: (id: string) => void }) {
  return (
    <Table
      columns={["Payer", "For", "Amount", "Status", "Reference", "Date"]}
      rows={rows}
      renderRow={(r) => (
        <tr key={r.id} className="border-b border-[#E4E1DA] last:border-0">
          <td className="px-4 py-2"><button onClick={() => openAccount(r.host_id)} className="text-left text-[#1F6F5C] hover:underline">{r.payer || r.host_id.slice(0, 8)}</button></td>
          <td className="px-4 py-2 text-[#8a857c]">{KIND_LABELS[r.kind]} · {what(r)}</td>
          <td className="px-4 py-2 text-right font-mono">{kes(r.amount)}</td>
          <td className="px-4 py-2 text-[#8a857c]">{r.status}</td>
          <td className="px-4 py-2 font-mono text-xs text-[#8a857c]">{r.reference}</td>
          <td className="px-4 py-2 text-xs text-[#8a857c]">{new Date(r.date).toLocaleString()}</td>
        </tr>
      )}
    />
  );
}

/** What VaRoom earns: plans, Silver/Gold listings and V-Coins (bookings are paid to hosts directly). */
export function Revenue({ report, openAccount }: { report: RevenueReport; openAccount: (id: string) => void }) {
  const { total, transactions, series, byKind, subscribers } = report;
  return (
    <div>
      <SectionHeader title="Revenue" description={`What VaRoom earned in the last ${report.range} days: plans, Silver and Gold listings, and V-Coins. Bookings are paid to hosts directly and are not included. Refunds are issued in Paystack.`} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label={`Revenue (${report.range}d)`} value={kes(total)} sub={`${transactions.length} payments`} />
        <StatCard label="Monthly plan revenue" value={kes(report.mrr)} sub={`${subscribers.paid} paid plans`} />
        <StatCard label="Past due" value={subscribers.pastDue} sub={`${subscribers.cancelling} cancelling`} alert={subscribers.pastDue > 0} />
        <StatCard label={`Failed payments (${report.range}d)`} value={report.failed.length} alert={report.failed.length > 0} />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Plans" value={kes(byKind.subscription)} />
        <StatCard label="Listings" value={kes(byKind.listing)} />
        <StatCard label="V-Coins" value={kes(byKind.vcoins)} />
      </div>
      <div className="border border-[#E4E1DA] rounded-sm bg-white p-4 mb-4">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={series}>
            <CartesianGrid stroke="#E4E1DA" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8a857c" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#8a857c" }} axisLine={false} tickLine={false} width={36} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: "#E4E1DA" }} />
            <Line type="monotone" dataKey="revenue" stroke="#24211E" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SectionHeader title="Payments" />
      <PaymentsTable rows={transactions} openAccount={openAccount} />
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div>
          <SectionHeader title="Paid plans" />
          <Table columns={["Plan", "Hosts", "Monthly"]} rows={subscribers.byPlan} renderRow={(p) => (
            <tr key={p.plan_id} className="border-b border-[#E4E1DA] last:border-0">
              <td className="px-4 py-2">{p.name}</td><td className="px-4 py-2">{p.count}</td><td className="px-4 py-2 font-mono">{kes(p.monthly)}</td>
            </tr>
          )} />
        </div>
        <div>
          <SectionHeader title="Free plans from VaRoom" />
          <Table columns={["Host", "Plan", "Until"]} rows={report.freePlans} renderRow={(f) => (
            <tr key={f.host_id} className="border-b border-[#E4E1DA] last:border-0">
              <td className="px-4 py-2"><button onClick={() => openAccount(f.host_id)} className="text-left text-[#1F6F5C] hover:underline">{f.host || f.host_id.slice(0, 8)}</button></td>
              <td className="px-4 py-2">{f.name}</td><td className="px-4 py-2 text-xs text-[#8a857c]">{new Date(f.until).toLocaleDateString()}</td>
            </tr>
          )} />
        </div>
      </div>
      <div className="mt-6" />
      <SectionHeader title="Failed and abandoned payments" description="Checkouts that did not go through. The payer can be contacted from their account." />
      <PaymentsTable rows={report.failed} openAccount={openAccount} />
      <div className="mt-6" />
      <SectionHeader title="Refunded payments" />
      <PaymentsTable rows={report.refunded} openAccount={openAccount} />
    </div>
  );
}

export function Growth({ series }: { series: GrowthPoint[] }) {
  return (
    <div>
      <SectionHeader title="Growth" description="Signups and new listings over time." />
      <div className="border border-[#E4E1DA] rounded-sm bg-white p-4 mb-4">
        <div className="flex items-center gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1.5 text-[#8a857c]">
            <span className="w-2 h-2 rounded-full bg-[#1F6F5C]" /> Signups
          </span>
          <span className="flex items-center gap-1.5 text-[#8a857c]">
            <span className="w-2 h-2 rounded-full bg-[#24211E]" /> Listings
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={series}>
            <CartesianGrid stroke="#E4E1DA" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8a857c" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#8a857c" }} axisLine={false} tickLine={false} width={28} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 2, borderColor: "#E4E1DA" }} />
            <Line type="monotone" dataKey="signups" stroke="#1F6F5C" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="listings" stroke="#24211E" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="New signups (14d)" value={series.reduce((s, d) => s + d.signups, 0)} />
        <StatCard label="New listings (14d)" value={series.reduce((s, d) => s + d.listings, 0)} />
      </div>
    </div>
  );
}
