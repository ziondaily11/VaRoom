import React, { useState } from "react";
import type { AccountDeletion, ActivityEntry, AdminListing, AdminUser, ListingReport, NewsEntry, UserDetail, UserReport, VaroomUpdate } from "../../lib/admin/adminApi";
import { ConsequentialButton, SectionHeader, StatusPill, Table } from "./AdminUi";

export function ListingReports({ reports, userReports, accountDeletions, resolveReport, resolveUserReport }: {
  reports: ListingReport[]; userReports: UserReport[]; accountDeletions: AccountDeletion[];
  resolveReport: (id: string, status: string) => void; resolveUserReport: (id: string, status: string) => void;
}) {
  return (
    <div>
      <SectionHeader title="Listing reports" description="Issues flagged by guests or hosts about a listing." />
      <Table
        columns={["Report", "Listing", "Reporter", "Reason", "Status", "Filed", "Action"]}
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
            <td className="px-4 py-2 flex gap-2"><button onClick={() => resolveReport(r.id, "resolved")} className="text-xs text-[#1F6F5C]">Resolve</button><button onClick={() => resolveReport(r.id, "dismissed")} className="text-xs text-[#8a857c]">Dismiss</button></td>
          </tr>
        )}
      />
      <SectionHeader title="Chat user reports" description="Reports submitted about conversation participants." />
      <Table
        columns={["Report", "Reported user", "Reporter", "Reason", "Status", "Filed", "Action"]}
        rows={userReports}
        renderRow={(r) => (
          <tr key={r.id} className="border-b border-[#E4E1DA] last:border-0">
            <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
            <td className="px-4 py-2">{r.reportedUser && (r.reportedUser.full_name || r.reportedUser.username) || r.reported_user_id}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.reporter && (r.reporter.full_name || r.reporter.username) || r.reporter_user_id}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.reason}</td>
            <td className="px-4 py-2"><StatusPill status={r.status} /></td>
            <td className="px-4 py-2 text-[#8a857c]">{r.createdAt}</td>
            <td className="px-4 py-2 flex gap-2"><button onClick={() => resolveUserReport(r.id, "resolved")} className="text-xs text-[#1F6F5C]">Resolve</button><button onClick={() => resolveUserReport(r.id, "dismissed")} className="text-xs text-[#8a857c]">Dismiss</button></td>
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

export function UsersControl({ users, loadUser, updateStatus }: {
  users: AdminUser[]; loadUser: (id: string) => Promise<UserDetail | null>; updateStatus: (id: string, status: string, reason: string) => Promise<unknown>;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const visible = users.filter((u) => [u.email, u.profile?.full_name, u.profile?.username].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()));
  async function inspect(id: string) { const detail = await loadUser(id); if (detail) setSelected(detail); }
  return <div>
    <SectionHeader title="Users" description="Search accounts, inspect their profile and listings, and apply server-enforced account controls." />
    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, username or email" className="w-full max-w-md mb-4 border border-[#E4E1DA] rounded-sm p-2 text-sm" />
    <Table columns={["User", "Email", "Status", "Last sign-in", "Actions"]} rows={visible} renderRow={(u) => <tr key={u.id} className="border-b border-[#E4E1DA] last:border-0">
      <td className="px-4 py-2">{u.profile?.full_name || u.profile?.username || "Unnamed user"}</td><td className="px-4 py-2 text-[#8a857c]">{u.email}</td><td className="px-4 py-2"><StatusPill status={u.account?.status} /></td><td className="px-4 py-2 text-xs text-[#8a857c]">{u.last_sign_in_at || "Never"}</td>
      <td className="px-4 py-2 flex gap-2"><button onClick={() => inspect(u.id)} className="text-xs text-[#1F6F5C]">View</button>{u.account?.status === "active" ? <ConsequentialButton label="Suspend" tone="danger" onConfirm={(reason) => updateStatus(u.id, "suspended", reason)} /> : <ConsequentialButton label="Restore" onConfirm={(reason) => updateStatus(u.id, "active", reason)} />}</td>
    </tr>} />
    {selected && <div className="mt-4 border border-[#E4E1DA] bg-white p-4 rounded-sm"><div className="flex justify-between"><div><div className="font-medium">{selected.user.profile?.full_name || selected.user.email}</div><div className="text-xs text-[#8a857c]">{selected.user.email} · {selected.user.account?.status}</div></div><button onClick={() => setSelected(null)} className="text-xs">Close</button></div><div className="mt-3 text-sm">Listings: {selected.listings.length} · Admin history: {selected.activity.length}</div>{selected.user.account?.reason && <div className="mt-1 text-xs text-[#8a857c]">Current restriction reason: {selected.user.account.reason}</div>}</div>}
  </div>;
}

export function ListingsControl({ listings, moderate }: { listings: AdminListing[]; moderate: (id: string, status: string, reason: string) => Promise<unknown> }) {
  return <div><SectionHeader title="Listings" description="Moderation is reversible. Hidden and removed listings are taken out of the client/host-facing feed by their lifecycle status." />
    <Table columns={["Listing", "Owner", "Availability", "Moderation", "Reason", "Actions"]} rows={listings} renderRow={(l) => <tr key={l.id} className="border-b border-[#E4E1DA] last:border-0"><td className="px-4 py-2">{l.title}</td><td className="px-4 py-2 text-[#8a857c]">{l.owner?.full_name || l.owner?.username || l.host_id}</td><td className="px-4 py-2"><StatusPill status={l.availability_status} /></td><td className="px-4 py-2"><StatusPill status={l.moderation_status} /></td><td className="px-4 py-2 text-xs text-[#8a857c]">{l.moderation_reason || "—"}</td><td className="px-4 py-2 flex gap-2">{l.moderation_status === "active" && <ConsequentialButton label="Hide" tone="danger" onConfirm={(reason) => moderate(l.id, "hidden", reason)} />}{l.moderation_status !== "removed" && <ConsequentialButton label="Take down" tone="danger" onConfirm={(reason) => moderate(l.id, "removed", reason)} />}{l.moderation_status !== "active" && <ConsequentialButton label="Restore" onConfirm={(reason) => moderate(l.id, "active", reason)} />}</td></tr>} />
  </div>;
}

export function UpdatesControl({ updates, createUpdate, setUpdateStatus }: {
  updates: VaroomUpdate[];
  createUpdate: (payload: { title: string; body: string; status: string }) => Promise<boolean>;
  setUpdateStatus: (id: string, status: string, reason: string) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(status: string) { setSaving(true); try { if (await createUpdate({ title, body, status })) { setTitle(""); setBody(""); } } finally { setSaving(false); } }
  return <div><SectionHeader title="Varoom Updates" description="Create drafts or publish directly to the existing VaRoom Updates home feeds." />
    <div className="border border-[#E4E1DA] rounded-sm bg-white p-4 mb-5 max-w-2xl"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="w-full border border-[#E4E1DA] rounded-sm p-2 text-sm mb-2" /><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Update content" maxLength={5000} className="w-full h-28 border border-[#E4E1DA] rounded-sm p-2 text-sm" /><div className="mt-2 flex gap-2"><button disabled={!body.trim() || saving} onClick={() => submit("draft")} className="px-3 py-1.5 text-sm border border-[#E4E1DA] rounded-sm">Save draft</button><button disabled={!body.trim() || saving} onClick={() => submit("published")} className="px-3 py-1.5 text-sm bg-[#1F6F5C] text-white rounded-sm">Publish</button></div></div>
    <Table columns={["Update", "Status", "Published", "Actions"]} rows={updates} renderRow={(u) => <tr key={u.id} className="border-b border-[#E4E1DA] last:border-0"><td className="px-4 py-2"><div>{u.title || u.body?.slice(0, 90)}</div><div className="text-xs text-[#8a857c]">{u.body?.slice(0, 150)}</div></td><td className="px-4 py-2"><StatusPill status={u.status} /></td><td className="px-4 py-2 text-xs text-[#8a857c]">{u.published_at || "—"}</td><td className="px-4 py-2 flex gap-2">{u.status !== "published" && <ConsequentialButton label="Publish" onConfirm={(reason) => setUpdateStatus(u.id, "published", reason)} />}{u.status === "published" && <ConsequentialButton label="Unpublish" onConfirm={(reason) => setUpdateStatus(u.id, "unpublished", reason)} />}{u.status !== "removed" && <ConsequentialButton label="Remove" tone="danger" onConfirm={(reason) => setUpdateStatus(u.id, "removed", reason)} />}{u.status === "removed" && <ConsequentialButton label="Restore" onConfirm={(reason) => setUpdateStatus(u.id, "draft", reason)} />}</td></tr>} />
  </div>;
}

export function Activity({ activity }: { activity: ActivityEntry[] }) { return <div><SectionHeader title="Admin activity" description="An append-only audit trail for account, content and report actions." /><Table columns={["Admin", "Action", "Target", "Reason", "Date"]} rows={activity} renderRow={(a) => <tr key={a.id} className="border-b border-[#E4E1DA] last:border-0"><td className="px-4 py-2">{a.admin?.name || "System"}</td><td className="px-4 py-2">{a.action.replaceAll("_", " ")}</td><td className="px-4 py-2 text-xs">{a.target_type}: {a.target_id}</td><td className="px-4 py-2 text-[#8a857c]">{a.reason || "—"}</td><td className="px-4 py-2 text-xs text-[#8a857c]">{a.created_at}</td></tr>} /></div>; }

export function PropertyNews({ items, onAction, error }: { items: NewsEntry[]; onAction: (id: string, action: "approve" | "reject") => void; error: string }) {
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
