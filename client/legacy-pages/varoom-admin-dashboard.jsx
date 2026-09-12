import React, { useState, useMemo } from "react";
import {
  LayoutDashboard,
  LogIn,
  DollarSign,
  LifeBuoy,
  Flag,
  TrendingUp,
  Search,
  ChevronRight,
  Clock,
  X,
  Ban,
  Mail,
  Users,
  Lock,
  LogOut,
  Plus,
  Shield,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ---------------------------------------------------------------------------
// Mock data — replace each of these with real API calls when wiring up.
// ---------------------------------------------------------------------------

const DAYS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
});

const signinsSeries = DAYS.map((day, i) => ({
  day,
  signins: Math.round(40 + Math.sin(i / 2) * 15 + i * 2 + Math.random() * 10),
}));

const revenueSeries = DAYS.map((day, i) => ({
  day,
  revenue: Math.round(900 + Math.cos(i / 3) * 200 + i * 40 + Math.random() * 150),
}));

const growthSeries = DAYS.map((day, i) => ({
  day,
  signups: Math.round(8 + i * 0.8 + Math.random() * 4),
  listings: Math.round(3 + i * 0.5 + Math.random() * 3),
}));

const mockTickets = [
  {
    id: "T-1044",
    name: "Peter Ndungu",
    email: "peter.ndungu@example.com",
    subject: "Why was my account suspended?",
    message:
      "I logged in this morning and got a message that my account is suspended. I don't understand why — I haven't had any complaints. Please explain and help me get this resolved.",
    status: "open",
    priority: "high",
    createdAt: "35m ago",
    accountStatus: "suspended",
  },
  {
    id: "T-1042",
    name: "Amara Otieno",
    email: "amara.o@example.com",
    subject: "Payout never arrived after checkout",
    message:
      "My guest checked out three days ago and the payout still shows as pending. Can someone look into this? I need the funds to cover next month's costs.",
    status: "open",
    priority: "high",
    createdAt: "2h ago",
    accountStatus: "active",
  },
  {
    id: "T-1041",
    name: "Brian Mwangi",
    email: "b.mwangi@example.com",
    subject: "Can't upload listing photos",
    message:
      "Every time I try to upload photos for my new listing the page just spins and nothing happens. Tried on two different phones.",
    status: "open",
    priority: "normal",
    createdAt: "5h ago",
    accountStatus: "active",
  },
  {
    id: "T-1039",
    name: "Grace Wanjiru",
    email: "grace.w@example.com",
    subject: "Refund question",
    message:
      "A guest cancelled within the free window but I was still charged a service fee. Is that expected?",
    status: "in_progress",
    priority: "normal",
    createdAt: "1d ago",
    accountStatus: "active",
  },
  {
    id: "T-1035",
    name: "Dennis Kiptoo",
    email: "dennis.k@example.com",
    subject: "Account verification stuck",
    message:
      "Submitted my ID four days ago and my account still says 'pending verification'. Please advise.",
    status: "open",
    priority: "high",
    createdAt: "1d ago",
    accountStatus: "active",
  },
  {
    id: "T-1028",
    name: "Faith Chebet",
    email: "faith.c@example.com",
    subject: "Thank you",
    message: "Just wanted to say the new booking flow is much smoother, nice work!",
    status: "resolved",
    priority: "low",
    createdAt: "3d ago",
    accountStatus: "active",
  },
];

const mockReports = [
  {
    id: "R-221",
    listing: "Lakeview Cottage, Naivasha",
    reporter: "guest_4471",
    reason: "Listing photos don't match property",
    status: "pending",
    createdAt: "3h ago",
  },
  {
    id: "R-219",
    listing: "Downtown Loft, Nairobi",
    reporter: "guest_2290",
    reason: "Host unresponsive after booking",
    status: "pending",
    createdAt: "1d ago",
  },
  {
    id: "R-214",
    listing: "Garden Studio, Karen",
    reporter: "guest_1188",
    reason: "Suspected duplicate listing",
    status: "reviewed",
    createdAt: "4d ago",
  },
];

const mockSignins = [
  { user: "amara.o@example.com", method: "Email", time: "10:42 AM", device: "iOS" },
  { user: "b.mwangi@example.com", method: "Google", time: "10:31 AM", device: "Web" },
  { user: "grace.w@example.com", method: "Email", time: "9:58 AM", device: "Android" },
  { user: "dennis.k@example.com", method: "Google", time: "9:20 AM", device: "Web" },
  { user: "faith.c@example.com", method: "Email", time: "8:47 AM", device: "iOS" },
];

const mockTransactions = [
  { id: "TX-8834", payer: "guest_4471", listing: "Lakeview Cottage", amount: 142.0, date: "Sep 12" },
  { id: "TX-8829", payer: "guest_2290", listing: "Downtown Loft", amount: 89.5, date: "Sep 12" },
  { id: "TX-8811", payer: "guest_1188", listing: "Garden Studio", amount: 210.0, date: "Sep 11" },
  { id: "TX-8790", payer: "guest_9012", listing: "Riverside Suite", amount: 65.0, date: "Sep 11" },
];

const initialAdmins = [
  {
    id: "A-001",
    name: "You",
    email: "founder@varoom.app",
    role: "super_admin",
    lastLogin: "Just now",
  },
];

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "signins", label: "Sign-ins", icon: LogIn },
  { key: "revenue", label: "Revenue", icon: DollarSign },
  { key: "support", label: "Support", icon: LifeBuoy },
  { key: "reports", label: "Listing reports", icon: Flag },
  { key: "growth", label: "Growth", icon: TrendingUp },
  { key: "admins", label: "Admins", icon: Shield },
];

function StatCard({ label, value, sub, alert }) {
  return (
    <div
      className={`border rounded-sm p-4 bg-white ${
        alert ? "border-[#B5482E]" : "border-[#E4E1DA]"
      }`}
    >
      <div className="text-xs tracking-wide text-[#8a857c]">{label}</div>
      <div
        className={`mt-2 font-mono text-2xl ${
          alert ? "text-[#B5482E]" : "text-[#24211E]"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[#8a857c]">{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, description }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl text-[#24211E]">{title}</h1>
      {description && (
        <p className="mt-1 text-sm text-[#8a857c] max-w-[60ch]">{description}</p>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    open: { text: "Open", cls: "bg-[#B5482E]/10 text-[#B5482E]" },
    in_progress: { text: "In progress", cls: "bg-[#C77D22]/10 text-[#C77D22]" },
    resolved: { text: "Resolved", cls: "bg-[#1F6F5C]/10 text-[#1F6F5C]" },
    pending: { text: "Pending", cls: "bg-[#B5482E]/10 text-[#B5482E]" },
    reviewed: { text: "Reviewed", cls: "bg-[#1F6F5C]/10 text-[#1F6F5C]" },
  };
  const { text, cls } = map[status] || { text: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-sm text-xs ${cls}`}>{text}</span>
  );
}

function Table({ columns, rows, renderRow }) {
  return (
    <div className="border border-[#E4E1DA] rounded-sm bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E4E1DA] text-left text-xs text-[#8a857c]">
            {columns.map((c) => (
              <th key={c} className="px-4 py-2 font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Overview({ openTickets, goTo }) {
  const totalRevenue = mockTransactions.reduce((s, t) => s + t.amount, 0);
  return (
    <div>
      <SectionHeader
        title="Overview"
        description="A snapshot of sign-ins, revenue, support, and growth across the platform."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Sign-ins (7d)" value="342" sub="+12% vs prior week" />
        <StatCard label="Revenue (7d)" value={`$${totalRevenue.toFixed(0)}`} sub="4 transactions today" />
        <StatCard
          label="Open support tickets"
          value={openTickets}
          sub="Needs attention"
          alert={openTickets > 0}
        />
        <StatCard label="New listings (7d)" value="9" sub="+3 vs prior week" />
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
            {openTickets} open ticket{openTickets === 1 ? "" : "s"}, oldest opened 1 day ago.
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

function Signins() {
  return (
    <div>
      <SectionHeader title="Sign-ins" description="Recent authentication activity across the platform." />
      <div className="border border-[#E4E1DA] rounded-sm bg-white p-4 mb-4">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={signinsSeries}>
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
        rows={mockSignins}
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

function Revenue() {
  const total = mockTransactions.reduce((s, t) => s + t.amount, 0);
  return (
    <div>
      <SectionHeader title="Revenue" description="Paid amounts across bookings." />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="Total (7d)" value={`$${total.toFixed(0)}`} />
        <StatCard label="Transactions (7d)" value={mockTransactions.length} />
        <StatCard label="Avg. transaction" value={`$${(total / mockTransactions.length).toFixed(0)}`} />
      </div>
      <div className="border border-[#E4E1DA] rounded-sm bg-white p-4 mb-4">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={revenueSeries}>
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
        rows={mockTransactions}
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

function Support({ tickets, selected, setSelected }) {
  const openCount = tickets.filter((t) => t.status === "open").length;
  return (
    <div>
      <SectionHeader
        title="Support"
        description="Messages submitted through the support page. This is the pipeline that previously went nowhere."
      />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Open" value={openCount} alert={openCount > 0} />
        <StatCard label="In progress" value={tickets.filter((t) => t.status === "in_progress").length} />
        <StatCard label="Resolved" value={tickets.filter((t) => t.status === "resolved").length} />
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="md:col-span-2 border border-[#E4E1DA] rounded-sm bg-white divide-y divide-[#E4E1DA]">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={`w-full text-left px-4 py-3 hover:bg-[#F7F6F3] transition-colors ${
                selected?.id === t.id ? "bg-[#F7F6F3]" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#24211E]">{t.subject}</span>
                {t.priority === "high" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B5482E] shrink-0 ml-2" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <StatusPill status={t.status} />
                {t.accountStatus === "suspended" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs bg-[#24211E]/5 text-[#24211E]">
                    <Ban size={11} /> Suspended
                  </span>
                )}
                <span className="text-xs text-[#8a857c] flex items-center gap-1">
                  <Clock size={11} /> {t.createdAt}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="md:col-span-3 border border-[#E4E1DA] rounded-sm bg-white p-5">
          {selected ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono text-[#8a857c]">{selected.id}</div>
                  <h2 className="text-base text-[#24211E] mt-1">{selected.subject}</h2>
                  <div className="text-xs text-[#8a857c] mt-1">
                    {selected.name} · {selected.email}
                  </div>
                </div>
                <StatusPill status={selected.status} />
              </div>

              {selected.accountStatus === "suspended" && (
                <div className="mt-4 flex items-start gap-2 border border-[#24211E]/15 bg-[#24211E]/[0.03] rounded-sm px-3 py-2">
                  <Ban size={14} className="text-[#24211E] mt-0.5 shrink-0" />
                  <div className="text-xs text-[#24211E]">
                    This account is currently suspended. Your reply below still sends to their
                    email — they just can't sign back in until the suspension is lifted.
                  </div>
                </div>
              )}

              <p className="text-sm text-[#24211E] mt-4 leading-relaxed">{selected.message}</p>

              <div className="mt-5 pt-4 border-t border-[#E4E1DA]">
                <div className="flex items-center gap-1.5 text-xs text-[#8a857c] mb-2">
                  <Mail size={13} />
                  Email reply
                </div>
                <div className="text-xs text-[#8a857c] mb-1">
                  To <span className="text-[#24211E]">{selected.email}</span>
                </div>
                <input
                  className="w-full mb-2 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none focus:border-[#1F6F5C]"
                  defaultValue={`Re: ${selected.subject}`}
                />
                <textarea
                  className="w-full border border-[#E4E1DA] rounded-sm p-2 text-sm resize-none focus:outline-none focus:border-[#1F6F5C]"
                  rows={4}
                  placeholder="Type a reply — this sends an email to the address above once wired up"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1F6F5C] text-white rounded-sm hover:bg-[#195a4b]">
                    <Mail size={13} /> Send email reply
                  </button>
                  <select className="text-sm border border-[#E4E1DA] rounded-sm px-2 py-1.5 focus:outline-none" defaultValue={selected.status}>
                    <option value="open">Mark open</option>
                    <option value="in_progress">Mark in progress</option>
                    <option value="resolved">Mark resolved</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#8a857c]">Select a ticket to view its details.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListingReports({ reports }) {
  return (
    <div>
      <SectionHeader title="Listing reports" description="Issues flagged by guests or hosts about a listing." />
      <Table
        columns={["Report", "Listing", "Reporter", "Reason", "Status", "Filed"]}
        rows={reports}
        renderRow={(r) => (
          <tr key={r.id} className="border-b border-[#E4E1DA] last:border-0">
            <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
            <td className="px-4 py-2">{r.listing}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.reporter}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.reason}</td>
            <td className="px-4 py-2">
              <StatusPill status={r.status} />
            </td>
            <td className="px-4 py-2 text-[#8a857c]">{r.createdAt}</td>
          </tr>
        )}
      />
    </div>
  );
}

function Growth() {
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
          <LineChart data={growthSeries}>
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
        <StatCard label="New signups (14d)" value={growthSeries.reduce((s, d) => s + d.signups, 0)} />
        <StatCard label="New listings (14d)" value={growthSeries.reduce((s, d) => s + d.listings, 0)} />
      </div>
    </div>
  );
}

function Admins({ admins, addAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");

  const handleAdd = () => {
    if (!name || !email) return;
    addAdmin({
      id: `A-${String(admins.length + 1).padStart(3, "0")}`,
      name,
      email,
      role,
      lastLogin: "Never",
    });
    setName("");
    setEmail("");
    setRole("support");
    setShowForm(false);
  };

  return (
    <div>
      <SectionHeader
        title="Admins"
        description="There's no public admin signup — accounts are only created here, by an already-logged-in admin."
      />

      <div className="border border-[#E4E1DA] rounded-sm bg-white overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E4E1DA] text-left text-xs text-[#8a857c]">
              <th className="px-4 py-2 font-normal">Name</th>
              <th className="px-4 py-2 font-normal">Email</th>
              <th className="px-4 py-2 font-normal">Role</th>
              <th className="px-4 py-2 font-normal">Last login</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-b border-[#E4E1DA] last:border-0">
                <td className="px-4 py-2">{a.name}</td>
                <td className="px-4 py-2 text-[#8a857c]">{a.email}</td>
                <td className="px-4 py-2">
                  <span className="text-xs px-2 py-0.5 rounded-sm bg-[#1F6F5C]/10 text-[#1F6F5C]">
                    {a.role.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2 text-[#8a857c]">{a.lastLogin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm ? (
        <div className="border border-[#E4E1DA] rounded-sm bg-white p-4 max-w-md">
          <div className="text-sm text-[#24211E] mb-3">Add admin</div>
          <label className="text-xs text-[#8a857c]">Name</label>
          <input
            className="w-full mb-2 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none focus:border-[#1F6F5C]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="text-xs text-[#8a857c]">Email</label>
          <input
            className="w-full mb-2 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none focus:border-[#1F6F5C]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="text-xs text-[#8a857c]">Role</label>
          <select
            className="w-full mb-3 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="support">Support</option>
            <option value="read_only">Read only</option>
            <option value="super_admin">Super admin</option>
          </select>
          <div className="text-xs text-[#8a857c] mb-3">
            They'll be sent an invite to set their own password — there's no open signup page.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 text-sm bg-[#1F6F5C] text-white rounded-sm hover:bg-[#195a4b]"
            >
              Send invite
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-[#5c584f] hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[#E4E1DA] rounded-sm text-[#24211E] hover:bg-[#F7F6F3]"
        >
          <Plus size={14} /> Add admin
        </button>
      )}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <div className="w-full max-w-sm border border-[#E4E1DA] rounded-sm bg-white p-6">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} className="text-[#1F6F5C]" />
          <span className="text-sm text-[#24211E]">Varoom Admin</span>
        </div>
        <p className="text-xs text-[#8a857c] mb-5">
          Admin access only. There's no signup here — accounts are created internally.
        </p>
        <label className="text-xs text-[#8a857c]">Email</label>
        <input
          className="w-full mb-3 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none focus:border-[#1F6F5C]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@varoom.app"
        />
        <label className="text-xs text-[#8a857c]">Password</label>
        <input
          type="password"
          className="w-full mb-4 mt-1 border border-[#E4E1DA] rounded-sm p-2 text-sm focus:outline-none focus:border-[#1F6F5C]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <button
          onClick={onLogin}
          className="w-full py-2 text-sm bg-[#1F6F5C] text-white rounded-sm hover:bg-[#195a4b]"
        >
          Log in
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export default function VaroomAdminDashboard() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [active, setActive] = useState("overview");
  const [selectedTicket, setSelectedTicket] = useState(mockTickets[0]);
  const [admins, setAdmins] = useState(initialAdmins);
  const openTickets = useMemo(
    () => mockTickets.filter((t) => t.status === "open").length,
    []
  );

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  const renderSection = () => {
    switch (active) {
      case "overview":
        return <Overview openTickets={openTickets} goTo={setActive} />;
      case "signins":
        return <Signins />;
      case "revenue":
        return <Revenue />;
      case "support":
        return <Support tickets={mockTickets} selected={selectedTicket} setSelected={setSelectedTicket} />;
      case "reports":
        return <ListingReports reports={mockReports} />;
      case "growth":
        return <Growth />;
      case "admins":
        return <Admins admins={admins} addAdmin={(a) => setAdmins([...admins, a])} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#24211E] flex" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
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
              className={`w-full flex items-center gap-2.5 px-5 py-2.5 text-sm text-left transition-colors ${
                active === key
                  ? "text-[#1F6F5C] bg-[#1F6F5C]/5 border-r-2 border-[#1F6F5C]"
                  : "text-[#5c584f] hover:bg-[#F7F6F3]"
              }`}
            >
              <Icon size={16} />
              {label}
              {key === "support" && openTickets > 0 && (
                <span className="ml-auto text-xs font-mono bg-[#B5482E] text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {openTickets}
                </span>
              )}
            </button>
          ))}
        </nav>
        <button
          onClick={() => setLoggedIn(false)}
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
        <main className="flex-1 overflow-auto p-6">{renderSection()}</main>
      </div>
    </div>
  );
}
