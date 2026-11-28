import React, { useEffect, useState } from "react";
import { Ban, Bot, Clock, Inbox, Mail } from "lucide-react";
import { createIdempotencyKey, errorMessage, loadTicket, type ReplyTemplate, type Ticket, type TicketReply } from "../../lib/admin/adminApi";
import { SectionHeader, StatCard, StatusPill } from "./AdminUi";

// Support: tickets from the Support page and from email to any @varoom.co.ke
// address (server/lib/supportInbox.js). A ticket's conversation loads when it
// is opened; saved replies fill in {{name}} and {{ticket}}.

const CATEGORY_LABELS: Record<string, string> = {
  appeal: "Appeal", sign_in: "Sign-in", billing: "Billing", booking: "Booking", report: "Report", other: "Other",
};

const ticketRef = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;
const fillTemplate = (body: string, ticket: Ticket) => body.replaceAll("{{name}}", ticket.name).replaceAll("{{ticket}}", ticketRef(ticket.id));

function Thread({ ticket, replies }: { ticket: Ticket; replies: TicketReply[] | undefined }) {
  const bubble = "rounded-sm px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed";
  return (
    <div className="mt-4 space-y-3">
      <div>
        <div className="text-xs text-[#8a857c] mb-1">{ticket.name} · {ticket.createdAt}</div>
        <div className={`${bubble} bg-[#F7F6F3] text-[#24211E]`}>{ticket.message}</div>
      </div>
      {replies === undefined && <div className="text-xs text-[#8a857c]">Loading the conversation…</div>}
      {(replies || []).map((reply) => {
        const inbound = reply.direction === "inbound";
        const who = inbound ? ticket.name : reply.automatic ? "Automatic acknowledgement" : reply.admin?.name || "VaRoom Support";
        return (
          <div key={reply.id} className={inbound ? "" : "pl-8"}>
            <div className="text-xs text-[#8a857c] mb-1 flex items-center gap-1">
              {reply.automatic && <Bot size={11} />}{who} · {reply.sent_at}
              {reply.delivery_status === "failed" && <span className="text-[#B5482E]"> · not delivered</span>}
            </div>
            <div className={`${bubble} ${inbound ? "bg-[#F7F6F3] text-[#24211E]" : "bg-[#1F6F5C]/5 text-[#24211E]"}`}>{reply.message}</div>
          </div>
        );
      })}
    </div>
  );
}

function SavedReplies({ templates, save, remove }: {
  templates: ReplyTemplate[];
  save: (template: { id?: string; title: string; body: string }) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<{ id?: string; title: string; body: string }>({ title: "", body: "" });
  const field = "w-full border border-[#E4E1DA] rounded-sm p-2 text-sm";
  return (
    <div className="mt-6">
      <SectionHeader title="Saved replies" description="Insert one into a reply from the ticket. {{name}} becomes the person's name and {{ticket}} the ticket number." />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-[#E4E1DA] rounded-sm bg-white divide-y divide-[#E4E1DA]">
          {templates.map((t) => (
            <div key={t.id} className="px-4 py-2 flex items-center justify-between gap-2">
              <span className="text-sm">{t.title}</span>
              <span className="flex gap-2 shrink-0">
                <button onClick={() => setDraft({ id: t.id, title: t.title, body: t.body })} className="text-xs text-[#1F6F5C]">Edit</button>
                <button onClick={() => { if (window.confirm(`Delete "${t.title}"?`)) void remove(t.id); }} className="text-xs text-[#B5482E]">Delete</button>
              </span>
            </div>
          ))}
          {!templates.length && <div className="px-4 py-3 text-sm text-[#8a857c]">No saved replies yet.</div>}
        </div>
        <div className="border border-[#E4E1DA] rounded-sm bg-white p-4">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" maxLength={120} className={`${field} mb-2`} />
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Reply text" maxLength={5000} rows={6} className={`${field} resize-none`} />
          <div className="flex gap-2 mt-2">
            <button disabled={!draft.title.trim() || !draft.body.trim()} onClick={async () => { if (await save(draft)) setDraft({ title: "", body: "" }); }} className="px-3 py-1.5 text-sm bg-[#1F6F5C] text-white rounded-sm disabled:opacity-50">
              {draft.id ? "Save changes" : "Add saved reply"}
            </button>
            {draft.id && <button onClick={() => setDraft({ title: "", body: "" })} className="px-3 py-1.5 text-sm border border-[#E4E1DA] rounded-sm">Cancel</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Support({ tickets, selected, setSelected, onReply, onStatusChange, templates, saveTemplate, deleteTemplate }: {
  tickets: Ticket[];
  selected: Ticket | null;
  setSelected: (ticket: Ticket) => void;
  onReply: (id: string, message: string, idempotencyKey: string) => Promise<unknown>;
  onStatusChange: (id: string, status: string) => void;
  templates: ReplyTemplate[];
  saveTemplate: (template: { id?: string; title: string; body: string }) => Promise<boolean>;
  deleteTemplate: (id: string) => Promise<boolean>;
}) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  // Each opened ticket's conversation, kept while the section is open.
  const [threads, setThreads] = useState<Record<string, TicketReply[]>>({});
  const openCount = tickets.filter((t) => t.status === "open").length;
  const restricted = (t: Ticket) => t.accountStatus === "suspended" || t.accountStatus === "disabled";

  const refreshThread = (id: string) => loadTicket(id)
    .then((result) => setThreads((current) => ({ ...current, [id]: result.replies || [] })))
    .catch(() => setThreads((current) => ({ ...current, [id]: [] })));

  // Reset the draft reply whenever the selected ticket changes, so switching
  // tickets doesn't leave a half-typed reply attached to the wrong one.
  useEffect(() => {
    setReply("");
    setFeedback("");
    setFeedbackError(false);
    if (selected && !threads[selected.id]) void refreshThread(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  return (
    <div>
      <SectionHeader
        title="Support"
        description="Messages from the Support page and emails to any @varoom.co.ke address. Each new ticket gets an automatic acknowledgement; replies by email join their ticket."
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
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <StatusPill status={t.status} />
                {t.category && t.category !== "other" && <StatusPill status={CATEGORY_LABELS[t.category] || t.category} />}
                {restricted(t) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs bg-[#24211E]/5 text-[#24211E]">
                    <Ban size={11} /> {t.accountStatus === "disabled" ? "Disabled" : "Suspended"}
                  </span>
                )}
                {t.source === "email" && <Inbox size={12} className="text-[#8a857c]" aria-label="By email" />}
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
                  <div className="text-xs font-mono text-[#8a857c]">{ticketRef(selected.id)} · {selected.source === "email" ? "Email" : "Support page"}</div>
                  <h2 className="text-base text-[#24211E] mt-1">{selected.subject}</h2>
                  <div className="text-xs text-[#8a857c] mt-1">
                    {selected.name} · {selected.email}
                  </div>
                </div>
                <StatusPill status={selected.status} />
              </div>

              {restricted(selected) && (
                <div className="mt-4 flex items-start gap-2 border border-[#24211E]/15 bg-[#24211E]/[0.03] rounded-sm px-3 py-2">
                  <Ban size={14} className="text-[#24211E] mt-0.5 shrink-0" />
                  <div className="text-xs text-[#24211E]">
                    This account is currently {selected.accountStatus}. Your reply below still sends to their
                    email. Restore the account from Users if the appeal is accepted.
                  </div>
                </div>
              )}

              <Thread ticket={selected} replies={threads[selected.id]} />

              <div className="mt-5 pt-4 border-t border-[#E4E1DA]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-xs text-[#8a857c]">
                    <Mail size={13} />
                    Email reply to <span className="text-[#24211E]">{selected.email}</span>
                  </div>
                  {templates.length > 0 && (
                    <select
                      value=""
                      onChange={(event) => {
                        const template = templates.find((t) => t.id === event.target.value);
                        if (template) setReply(fillTemplate(template.body, selected));
                      }}
                      className="text-xs border border-[#E4E1DA] rounded-sm px-2 py-1"
                    >
                      <option value="">Insert saved reply…</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  )}
                </div>
                <textarea
                  className="w-full border border-[#E4E1DA] rounded-sm p-2 text-sm resize-none focus:outline-none focus:border-[#1F6F5C]"
                  rows={5}
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
                        void refreshThread(selected.id);
                      } catch (error) {
                        setFeedback(errorMessage(error, "Unable to send reply."));
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
                    <option value="closed">Mark closed</option>
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

      <SavedReplies templates={templates} save={saveTemplate} remove={deleteTemplate} />
    </div>
  );
}
