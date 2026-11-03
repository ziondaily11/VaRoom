import React from "react";
import { ChevronRight } from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { GrowthPoint, Overview as OverviewData, RevenuePoint, SectionKey, SigninPoint, SigninRow, Transaction } from "../../lib/admin/adminApi";
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
        <StatCard label="Revenue (7d)" value={`$${totalRevenue.toFixed(0)}`} />
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
          <div className="text-sm text-[#24211E] mb-3">Revenue, last 14 days</div>
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

export function Revenue({ transactions, total, series }: { transactions: Transaction[]; total: number; series: RevenuePoint[] }) {
  return (
    <div>
      <SectionHeader title="Revenue" description="Paid amounts across bookings." />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="Total (7d)" value={`$${total.toFixed(0)}`} />
        <StatCard label="Transactions (7d)" value={transactions.length} />
        <StatCard label="Avg. transaction" value={`$${(total / (transactions.length || 1)).toFixed(0)}`} />
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
      <Table
        columns={["Transaction", "Payer", "Listing", "Amount", "Date"]}
        rows={transactions}
        renderRow={(r) => (
          <tr key={r.id} className="border-b border-[#E4E1DA] last:border-0">
            <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.payer}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.listing}</td>
            <td className="px-4 py-2 text-right font-mono">${r.amount.toFixed(2)}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.date}</td>
          </tr>
        )}
      />
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
