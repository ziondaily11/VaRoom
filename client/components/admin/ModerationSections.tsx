import React, { useEffect, useState } from "react";
import { loadReportedConversation, loadUsersPage, errorMessage } from "../../lib/admin/adminApi";
import type { AccountDeletion, ActivityEntry, AdminListing, ListingReport, ListingReportAction, ListingReview, NewsEntry, ReportedConversation, UserPage, UserReport, UserReportAction, VaroomUpdate } from "../../lib/admin/adminApi";
import { ConsequentialButton, SectionHeader, StatusPill, Table } from "./AdminUi";

const shortDate = (value: string) => new Date(value).toLocaleString();
const linkButton = "text-left text-[#1F6F5C] hover:underline";

/** A reported conversation, read only after it was reported (each reading is logged). */
function ConversationViewer({ conversation, onClose }: { conversation: ReportedConversation; onClose: () => void }) {
  const { report } = conversation;
  const nameOf = (id: string) => (id === report.reported_user_id ? report.reported || "Reported person" : report.reporter || "Reporter");
  return (
    <div className="mt-4 border border-[#E4E1DA] bg-white rounded-sm p-4">
      <div className="flex justify-between items-start gap-4 mb-3">
        <div>
          <div className="text-sm font-medium">Reported conversation</div>
          <div className="text-xs text-[#8a857c]">Report: {report.reason}{report.details ? ` · ${report.details}` : ""}. Your reading is recorded in Admin activity.</div>
        </div>
        <button onClick={onClose} className="text-xs">Close</button>
      </div>
      <div className="space-y-2 max-h-[28rem] overflow-auto">
        {conversation.messages.map((m) => (
          <div key={m.id} className={m.sender_id === report.reported_user_id ? "" : "pl-8"}>
            <div className="text-xs text-[#8a857c]">{nameOf(m.sender_id)} · {shortDate(m.created_at)}</div>
            <div className={`text-sm rounded-sm px-3 py-1.5 whitespace-pre-wrap ${m.sender_id === report.reported_user_id ? "bg-[#B5482E]/5" : "bg-[#F7F6F3]"}`}>
              {m.body || (m.attachment ? `[${m.attachment.kind}: ${m.attachment.filename}]` : `[${m.message_type}]`)}
            </div>
          </div>
        ))}
        {!conversation.messages.length && <div className="text-sm text-[#8a857c]">This conversation has no messages.</div>}
      </div>
    </div>
  );
}

export function ListingReports({ reports, userReports, accountDeletions, listingReviews, setReviewStatus, resolveReport, resolveUserReport, actOnReport, actOnUserReport, openAccount }: {
  reports: ListingReport[]; userReports: UserReport[]; accountDeletions: AccountDeletion[];
  listingReviews: ListingReview[]; setReviewStatus: (id: string, status: "published" | "removed", reason: string) => Promise<unknown>;
  resolveReport: (id: string, status: string) => void; resolveUserReport: (id: string, status: string) => void;
  actOnReport: (id: string, action: ListingReportAction, reason: string) => Promise<unknown>;
  actOnUserReport: (id: string, action: UserReportAction, reason: string) => Promise<unknown>;
  openAccount: (id: string) => void;
}) {
  const [conversation, setConversation] = useState<ReportedConversation | null>(null);
  const [conversationError, setConversationError] = useState("");
  const open = (r: { status: string }) => r.status === "pending" || r.status === "reviewed";
  async function viewConversation(id: string) {
    setConversationError("");
    try { setConversation(await loadReportedConversation(id)); } catch (error) { setConversationError(errorMessage(error, "The conversation could not be loaded.")); }
  }
  return (
    <div>
      <SectionHeader title="Listing reports" description="Issues flagged by guests or hosts about a listing. Acting on one resolves it." />
      <Table
        columns={["Listing", "Host", "Reporter", "Reason", "Status", "Filed", "Action"]}
        rows={reports}
        renderRow={(r) => (
          <tr key={r.id} className="border-b border-[#E4E1DA] last:border-0 align-top">
            <td className="px-4 py-2"><a href={`/booking?listing=${r.listing_id}`} target="_blank" rel="noopener noreferrer" className={linkButton}>{r.listing || "Listing"}</a>{r.listing_moderation && r.listing_moderation !== "active" && <div><StatusPill status={r.listing_moderation} /></div>}</td>
            <td className="px-4 py-2">{r.host_id ? <button onClick={() => openAccount(r.host_id as string)} className={linkButton}>{r.host || "Host"}</button> : "—"}</td>
            <td className="px-4 py-2">{r.reporter_user_id ? <button onClick={() => openAccount(r.reporter_user_id as string)} className={linkButton}>{r.reporter}</button> : <span className="text-[#8a857c]">{r.reporter || "—"}</span>}</td>
            <td className="px-4 py-2 text-[#8a857c]">{r.reason}{r.details && <div className="text-xs mt-0.5 max-w-[32ch]">{r.details}</div>}</td>
            <td className="px-4 py-2"><StatusPill status={r.status} /></td>
            <td className="px-4 py-2 text-xs text-[#8a857c]">{shortDate(r.createdAt)}</td>
            <td className="px-4 py-2"><div className="flex flex-wrap gap-2">
              <button onClick={() => resolveReport(r.id, "resolved")} className="text-xs text-[#1F6F5C]">Resolve</button>
              <button onClick={() => resolveReport(r.id, "dismissed")} className="text-xs text-[#8a857c]">Dismiss</button>
              {open(r) && <>
                <ConsequentialButton label="Hide listing" tone="danger" onConfirm={(reason) => actOnReport(r.id, "hide_listing", reason)} />
                <ConsequentialButton label="Take down" tone="danger" onConfirm={(reason) => actOnReport(r.id, "remove_listing", reason)} />
                <ConsequentialButton label="Warn host" tone="danger" onConfirm={(reason) => actOnReport(r.id, "warn_host", reason)} />
                <ConsequentialButton label="Suspend host" tone="danger" onConfirm={(reason) => actOnReport(r.id, "suspend_host", reason)} />
              </>}
            </div></td>
          </tr>
        )}
      />
      <SectionHeader title="Chat user reports" description="Reports about conversation participants. The reported conversation can be read only from here, and each reading is recorded." />
      <Table
        columns={["Reported user", "Reporter", "Reason", "Status", "Filed", "Action"]}
        rows={userReports}
        renderRow={(r) => (
          <tr key={r.id} className="border-b border-[#E4E1DA] last:border-0 align-top">
            <td className="px-4 py-2"><button onClick={() => openAccount(r.reported_user_id)} className={linkButton}>{r.reportedUser && (r.reportedUser.full_name || r.reportedUser.username) || r.reported_user_id}</button></td>
            <td className="px-4 py-2"><button onClick={() => openAccount(r.reporter_user_id)} className={linkButton}>{r.reporter && (r.reporter.full_name || r.reporter.username) || r.reporter_user_id}</button></td>
            <td className="px-4 py-2 text-[#8a857c]">{r.reason}{r.details && <div className="text-xs mt-0.5 max-w-[32ch]">{r.details}</div>}</td>
            <td className="px-4 py-2"><StatusPill status={r.status} /></td>
            <td className="px-4 py-2 text-xs text-[#8a857c]">{shortDate(r.createdAt)}</td>
            <td className="px-4 py-2"><div className="flex flex-wrap gap-2">
              <button onClick={() => { void viewConversation(r.id); }} className="text-xs text-[#1F6F5C]">View conversation</button>
              <button onClick={() => resolveUserReport(r.id, "resolved")} className="text-xs text-[#1F6F5C]">Resolve</button>
              <button onClick={() => resolveUserReport(r.id, "dismissed")} className="text-xs text-[#8a857c]">Dismiss</button>
              {open(r) && <>
                <ConsequentialButton label="Warn" tone="danger" onConfirm={(reason) => actOnUserReport(r.id, "warn", reason)} />
                <ConsequentialButton label="Suspend 7 days" tone="danger" onConfirm={(reason) => actOnUserReport(r.id, "suspend_7_days", reason)} />
                <ConsequentialButton label="Suspend until reviewed" tone="danger" onConfirm={(reason) => actOnUserReport(r.id, "suspend", reason)} />
              </>}
            </div></td>
          </tr>
        )}
      />
      {conversationError && <div className="mt-3 text-sm text-[#B5482E]" role="alert">{conversationError}</div>}
      {conversation && <ConversationViewer conversation={conversation} onClose={() => setConversation(null)} />}
      <div className="mt-6" />
      <SectionHeader title="Guest reviews of listings" description="Hide a review that breaks the rules (it leaves the listing and its rating); restore it if hidden by mistake." />
      <Table
        columns={["Listing", "Guest", "Rating", "Review", "Status", "Posted", "Action"]}
        rows={listingReviews}
        renderRow={(r) => (
          <tr key={r.id} className="border-b border-[#E4E1DA] last:border-0 align-top">
            <td className="px-4 py-2"><a href={`/booking?listing=${r.listing_id}`} target="_blank" rel="noopener noreferrer" className={linkButton}>{r.listing || "Listing"}</a></td>
            <td className="px-4 py-2"><button onClick={() => openAccount(r.client_id)} className={linkButton}>{r.guest || "Guest"}</button></td>
            <td className="px-4 py-2">{"★".repeat(r.rating)}</td>
            <td className="px-4 py-2 text-[#8a857c] max-w-[40ch]">{r.comment}</td>
            <td className="px-4 py-2"><StatusPill status={r.status} /></td>
            <td className="px-4 py-2 text-xs text-[#8a857c]">{shortDate(r.created_at)}</td>
            <td className="px-4 py-2">{r.status === "removed"
              ? <ConsequentialButton label="Restore" onConfirm={(reason) => setReviewStatus(r.id, "published", reason)} />
              : <ConsequentialButton label="Hide" tone="danger" onConfirm={(reason) => setReviewStatus(r.id, "removed", reason)} />}</td>
          </tr>
        )}
      />
      <div className="mt-6" />
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

/** Accounts newest first, 50 at a time; the search runs on the server across every account. */
export function UsersControl({ page, openAccount, updateStatus }: {
  page: UserPage; openAccount: (id: string) => void; updateStatus: (id: string, status: string, reason: string, days?: number) => Promise<unknown>;
}) {
  const [search, setSearch] = useState("");
  // A search, or more than the first page; null shows the first page.
  const [view, setView] = useState<UserPage | null>(null);
  const shown = view || page;
  const refreshView = (q: string) => loadUsersPage(q, 0).then(setView).catch(() => setView({ users: [], total: 0 }));
  useEffect(() => {
    const q = search.trim();
    if (!q) { setView(null); return undefined; }
    const timer = window.setTimeout(() => { void refreshView(q); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  async function showMore() {
    const next = await loadUsersPage(search.trim(), shown.users.length);
    setView({ users: [...shown.users, ...next.users], total: next.total });
  }
  const act = async (id: string, status: string, reason: string, days?: number) => {
    const result = await updateStatus(id, status, reason, days);
    if (view) void refreshView(search.trim());
    return result;
  };
  return <div>
    <SectionHeader title="Users" description={`${shown.total.toLocaleString()} account${shown.total === 1 ? "" : "s"}${search.trim() ? " match" : ""}. Open one to see everything about it, and apply server-enforced account controls.`} />
    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, username or email" className="w-full max-w-md mb-4 border border-[#E4E1DA] rounded-sm p-2 text-sm" />
    <Table columns={["User", "Email", "Status", "Last sign-in", "Actions"]} rows={shown.users} renderRow={(u) => <tr key={u.id} className="border-b border-[#E4E1DA] last:border-0">
      <td className="px-4 py-2">{u.profile?.full_name || u.profile?.username || "Unnamed user"}</td><td className="px-4 py-2 text-[#8a857c]">{u.email}</td><td className="px-4 py-2"><StatusPill status={u.account?.status} />{u.account?.status === "suspended" && <div className="text-xs text-[#8a857c] mt-0.5">{u.account.suspended_until ? `Until ${shortDate(u.account.suspended_until)}` : "Until reviewed"}{u.account.rule_key ? " · automatic" : ""}</div>}</td><td className="px-4 py-2 text-xs text-[#8a857c]">{u.last_sign_in_at || "Never"}</td>
      <td className="px-4 py-2 flex gap-2"><button onClick={() => openAccount(u.id)} className="text-xs text-[#1F6F5C]">View</button>{u.account?.status === "active" ? <>
        <ConsequentialButton label="Warn" tone="danger" onConfirm={(reason) => act(u.id, "warning", reason)} />
        <ConsequentialButton label="Suspend 7 days" tone="danger" onConfirm={(reason) => act(u.id, "suspended", reason, 7)} />
        <ConsequentialButton label="Suspend until reviewed" tone="danger" onConfirm={(reason) => act(u.id, "suspended", reason)} />
        <ConsequentialButton label="Disable" tone="danger" onConfirm={(reason) => act(u.id, "disabled", reason)} />
      </> : <ConsequentialButton label="Restore" onConfirm={(reason) => act(u.id, "active", reason)} />}</td>
    </tr>} />
    {shown.users.length < shown.total && <button onClick={() => { void showMore(); }} className="mt-3 px-3 py-1.5 text-sm border border-[#E4E1DA] rounded-sm">Show more</button>}
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
