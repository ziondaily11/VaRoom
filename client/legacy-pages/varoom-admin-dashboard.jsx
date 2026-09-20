import React, { useEffect, useState } from "react";
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
  Ban,
  Mail,
  Lock,
  LogOut,
  Plus,
  Shield,
  Newspaper,
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
  { key: "property-news", label: "Property News", icon: Newspaper },
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

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `support-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

function Overview({ overview, signinsSeries, revenueSeries, goTo }) {
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

function Signins({ signins, series }) {
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

function Revenue({ transactions, total, series }) {
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

function Support({ tickets, selected, setSelected, onReply, onStatusChange }) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const openCount = tickets.filter((t) => t.status === "open").length;

  // Reset the draft reply whenever the selected ticket changes, so switching
  // tickets doesn't leave a half-typed reply attached to the wrong one.
  useEffect(() => {
    setReply("");
    setFeedback("");
    setFeedbackError(false);
  }, [selected?.id]);

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
            // key forces a clean remount of the fields below whenever the
            // selected ticket changes, so the subject/status inputs never
            // keep showing a previous ticket's values.
            <div key={selected.id}>
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
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Type a reply — this sends an email to the address above"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={async () => {
                      if (sending || !reply.trim()) return;
                      setSending(true);
                      setFeedback("");
                      setFeedbackError(false);
                      try {
                        await onReply(selected.id, reply, createIdempotencyKey());
                        setReply("");
                        setFeedback("Reply sent successfully.");
                      } catch (error) {
                        setFeedback(error.message || "Unable to send reply.");
                        setFeedbackError(true);
                      } finally {
                        setSending(false);
                      }
                    }}
                    disabled={sending || !reply.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#1F6F5C] text-white rounded-sm hover:bg-[#195a4b] disabled:opacity-50"
                  >
                    <Mail size={13} /> {sending ? "Sending..." : "Send email reply"}
                  </button>
                  <select
                    className="text-sm border border-[#E4E1DA] rounded-sm px-2 py-1.5 focus:outline-none"
                    defaultValue={selected.status}
                    onChange={(event) => onStatusChange(selected.id, event.target.value)}
                  >
                    <option value="open">Mark open</option>
                    <option value="in_progress">Mark in progress</option>
                    <option value="resolved">Mark resolved</option>
                  </select>
                </div>
                {feedback && (
                  <div className={`text-xs mt-2 ${feedbackError ? "text-[#B5482E]" : "text-[#1F6F5C]"}`} role="status">
                  {feedback}
                  </div>
                )}
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

function ListingReports({ reports, userReports, accountDeletions }) {
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
      <SectionHeader title="Chat user reports" description="Reports submitted about conversation participants." />
      <Table
        columns={["Report", "Reported user", "Reporter", "Reason", "Status", "Filed"]}
        rows={userReports}
        renderRow={(r) => (
          <tr key={r.id} className="border-b border-[#E4E1DA] last:border-0">
            <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
            <td className="px-4 py-2">{r.reportedUser && (r.reportedUser.full_name || r.reportedUser.username) || r.reported_user_id}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.reporter && (r.reporter.full_name || r.reporter.username) || r.reporter_user_id}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.reason}</td>
            <td className="px-4 py-2"><StatusPill status={r.status} /></td>
            <td className="px-4 py-2 text-[#8a857c]">{r.createdAt}</td>
          </tr>
        )}
      />
      <SectionHeader title="Deleted accounts" description="Permanent account deletions and the reasons users provided." />
      <Table
        columns={["Account", "Email", "Reason", "Additional detail", "Deleted"]}
        rows={accountDeletions}
        renderRow={(deletion) => (
          <tr key={deletion.id} className="border-b border-[#E4E1DA] last:border-0">
            <td className="px-4 py-2 font-mono text-xs">{deletion.account_id}</td>
            <td className="px-4 py-2">{deletion.account_email || "—"}</td>
            <td className="px-4 py-2 text-[#8a857c]">{deletion.reason}</td>
            <td className="px-4 py-2 text-[#8a857c]">{deletion.reason_details || "—"}</td>
            <td className="px-4 py-2 text-[#8a857c]">{deletion.deleted_at}</td>
          </tr>
        )}
      />
    </div>
  );
}

function Growth({ series }) {
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

function Admins({ admins, addAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");

  const handleAdd = async () => {
    if (!name || !email) return;
    await addAdmin({ name, email, role });
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

function PropertyNews({ items, onAction, error }) {
  return (
    <div>
      <SectionHeader title="Property News" description="Review source-backed reports before they appear publicly or in Elie." />
      {error ? <div className="text-sm text-[#B5482E] mb-3">{error}</div> : null}
      {!error && items.length === 0 ? (
        <div className="text-sm text-[#8a857c]">No reports are waiting for review.</div>
      ) : items.map(({ item, source }) => (
        <div key={item.id} className="border border-[#E4E1DA] rounded-sm bg-white p-4 mb-3">
          <div className="flex justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{item.varoom_title || item.source_title}</div>
              <div className="text-xs text-[#8a857c] mt-1">{source && source.name} · {item.regulatory_status}</div>
              <p className="text-sm mt-2">{item.varoom_summary || "No summary available."}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => onAction(item.id, "approve")} className="px-2 py-1 text-xs bg-[#1F6F5C] text-white rounded-sm">Approve</button>
              <button onClick={() => onAction(item.id, "reject")} className="px-2 py-1 text-xs border border-[#B5482E] text-[#B5482E] rounded-sm">Reject</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoginScreen({ onLogin, error }) {
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
          onClick={() => onLogin(email, password)}
          className="w-full py-2 text-sm bg-[#1F6F5C] text-white rounded-sm hover:bg-[#195a4b]"
        >
          Log in
        </button>
        {error && <div className="mt-3 text-xs text-[#B5482E]">{error}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export default function VaroomAdminDashboard() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [active, setActive] = useState("overview");
  const [overview, setOverview] = useState({ signins: 0, revenue: 0, openTickets: 0, newListings: 0 });
  const [signins, setSignins] = useState([]);
  const [signinsSeries, setSigninsSeries] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [revenueTotal, setRevenueTotal] = useState(0);
  const [revenueSeries, setRevenueSeries] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [reports, setReports] = useState([]);
  const [userReports, setUserReports] = useState([]);
  const [accountDeletions, setAccountDeletions] = useState([]);
  const [growthSeries, setGrowthSeries] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [propertyNews, setPropertyNews] = useState([]);
  const [propertyNewsError, setPropertyNewsError] = useState("");
  const [dashboardError, setDashboardError] = useState("");

  async function api(path, options) {
    const response = await fetch(path, { credentials: "same-origin", ...options });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || "Request failed");
    }
    return response.status === 204 ? null : response.json();
  }

  useEffect(() => {
    api("/admin/session").then(() => setLoggedIn(true)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    Promise.allSettled([
      api("/admin/overview"),
      api("/admin/signins?range=14"),
      api("/admin/revenue?range=7"),
      api("/admin/support/tickets"),
      api("/admin/reports"),
      api("/admin/user-reports"),
      api("/admin/account-deletions"),
      api("/admin/growth?range=14"),
      api("/admin/admins"),
    ])
      .then((results) => {
        const value = (index) => results[index].status === "fulfilled" ? results[index].value : null;
        const errors = results
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason?.message || "A dashboard section failed to load.");

        const nextOverview = value(0);
        const nextSignins = value(1);
        const nextRevenue = value(2);
        const nextTickets = value(3);
        const nextReports = value(4);
        const nextUserReports = value(5);
        const nextAccountDeletions = value(6);
        const nextGrowth = value(7);
        const nextAdmins = value(8);

        if (nextOverview) setOverview(nextOverview);
        if (nextSignins) {
          setSignins(nextSignins.data || []);
          setSigninsSeries(nextSignins.series || []);
        }
        if (nextRevenue) {
          setTransactions(nextRevenue.transactions || []);
          setRevenueTotal(nextRevenue.total || 0);
          setRevenueSeries(nextRevenue.series || []);
        }
        if (nextTickets) {
          setTickets(nextTickets.data || []);
          setSelectedTicket((nextTickets.data || [])[0] || null);
        }
        if (nextReports) setReports(nextReports.data || []);
        if (nextUserReports) setUserReports(nextUserReports.data || []);
        if (nextAccountDeletions) setAccountDeletions(nextAccountDeletions.data || []);
        if (nextGrowth) setGrowthSeries(nextGrowth.series || []);
        if (nextAdmins) setAdmins(nextAdmins.data || []);
        setDashboardError(errors.length ? errors.join(" ") : "");
      });
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn || active !== "property-news") return;
    setPropertyNewsError("");
    api("/admin/news/pending")
      .then((nextNews) => setPropertyNews(nextNews || []))
      .catch((error) => setPropertyNewsError(error.message || "Unable to load property news."));
  }, [active, loggedIn]);

  async function login(email, password) {
    try {
      await api("/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      setLoginError("");
      setLoggedIn(true);
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function replyToTicket(id, message, idempotencyKey) {
    await api(`/admin/support/tickets/${id}/replies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ message }),
    });
  }

  async function updateTicketStatus(id, status) {
    const updated = await api(`/admin/support/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    setSelectedTicket((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
    return updated;
  }

  async function addAdmin(admin) {
    const result = await api("/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(admin),
    });
    setAdmins((prev) => [...prev, result.admin]);
  }

  async function actionPropertyNews(id, action) {
    try {
      setPropertyNewsError("");
      await api(`/admin/news/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setPropertyNews((prev) => prev.filter(({ item }) => item.id !== id));
    } catch (error) {
      setPropertyNewsError(error.message || `Unable to ${action} this report.`);
    }
  }

  async function logout() {
    await api("/admin/logout", { method: "POST" });
    setLoggedIn(false);
  }

  if (!loggedIn) {
    return <LoginScreen onLogin={login} error={loginError} />;
  }

  const renderSection = () => {
    switch (active) {
      case "overview":
        return (
          <Overview
            overview={overview}
            signinsSeries={signinsSeries}
            revenueSeries={revenueSeries}
            goTo={setActive}
          />
        );
      case "signins":
        return <Signins signins={signins} series={signinsSeries} />;
      case "revenue":
        return <Revenue transactions={transactions} total={revenueTotal} series={revenueSeries} />;
      case "support":
        return (
          <Support
            tickets={tickets}
            selected={selectedTicket}
            setSelected={setSelectedTicket}
            onReply={replyToTicket}
            onStatusChange={updateTicketStatus}
          />
        );
      case "reports":
        return <ListingReports reports={reports} userReports={userReports} accountDeletions={accountDeletions} />;
      case "growth":
        return <Growth series={growthSeries} />;
      case "admins":
        return <Admins admins={admins} addAdmin={addAdmin} />;
      case "property-news":
        return <PropertyNews items={propertyNews} onAction={actionPropertyNews} error={propertyNewsError} />;
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
          onClick={logout}
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
          {dashboardError ? (
            <div className="mb-4 border border-[#B5482E]/30 bg-[#B5482E]/5 px-4 py-3 text-sm text-[#B5482E]">
              Some dashboard data could not be loaded. Available sections are still shown below.
            </div>
          ) : null}
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
