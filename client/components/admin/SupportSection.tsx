import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, Send } from "lucide-react";
import { createIdempotencyKey, errorMessage, loadTicket, type ReplyTemplate, type Ticket, type TicketReply } from "../../lib/admin/adminApi";
import { formatDate, formatWhen, ticketRef, timeAgo } from "../../lib/admin/format";
import { Avatar, Card, ConsequentialButton, Pill, SectionHeader, StatusPill, Tabs } from "./AdminUi";

// Support: tickets from the Support page and from email to any @varoom.co.ke
// address (server/lib/supportInbox.js). An inbox on the left, the opened
// ticket's conversation on the right; saved replies fill in {{name}} and
// {{ticket}}. A reply the email provider refused can be sent again.

const CATEGORY: Record<string, [string, "accent" | "info" | "violet" | "good" | "warn"]> = {
  appeal: ["Appeal", "accent"], sign_in: ["Sign-in", "violet"], billing: ["Billing", "info"], booking: ["Booking", "good"], report: ["Report", "warn"],
};

type Box = "open" | "waiting" | "done";
const BOX_OF: Record<string, Box> = { open: "open", in_progress: "waiting", resolved: "done", closed: "done" };

const fillTemplate = (body: string, ticket: Ticket) => body.replaceAll("{{name}}", ticket.name).replaceAll("{{ticket}}", ticketRef(ticket.id));

/** Why an email was refused, in words: the provider's own message is long and technical. */
function deliveryProblem(error: string | null | undefined): string {
  const text = String(error || "");
  if (/not authorized to send emails from/i.test(text)) return "the sender address isn't on a domain verified in Resend";
  if (/RESEND_API_KEY/i.test(text)) return "email sending isn't set up on the server";
  return text ? text.replace(/^Email provider rejected request:\s*/i, "").slice(0, 140) : "the email provider refused it";
}

function Thread({ ticket, replies, onResend }: { ticket: Ticket; replies: TicketReply[] | undefined; onResend: (reply: TicketReply) => Promise<void> }) {
  return (
    <div className="adm-thread">
      <div className="adm-bubble-wrap">
        <span className="adm-bubble-meta"><strong style={{ color: "var(--adm-ink)" }}>{ticket.name}</strong> · {formatWhen(ticket.createdAt)}</span>
        <div className="adm-bubble">{ticket.message}</div>
      </div>
      {replies === undefined && <div className="adm-small adm-muted">Loading the conversation…</div>}
      {(replies || []).map((reply) => {
        const inbound = reply.direction === "inbound";
        const who = inbound ? ticket.name : reply.automatic ? "Automatic acknowledgement" : reply.admin?.name || "VaRoom Support";
        return (
          <div key={reply.id} className={`adm-bubble-wrap${inbound ? "" : " adm-bubble-wrap--out"}`}>
            <span className="adm-bubble-meta">{reply.automatic && <Bot size={13} aria-hidden="true" />}<strong style={{ color: "var(--adm-ink)" }}>{who}</strong> · {formatWhen(reply.sent_at)}</span>
            <div className={`adm-bubble${inbound ? "" : reply.automatic ? " adm-bubble--auto" : " adm-bubble--out"}`}>{reply.message}</div>
            {reply.delivery_status === "failed" && (
              <span className="adm-bubble-error">
                <AlertTriangle size={14} aria-hidden="true" />Not delivered: {deliveryProblem(reply.provider_error)}
                <button type="button" className="adm-link" style={{ color: "inherit", textDecoration: "underline" }} onClick={() => { void onResend(reply); }}>Send again</button>
              </span>
            )}
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
  return (
    <Card title="Saved replies" count={templates.length}>
      <p className="adm-muted" style={{ marginBottom: 14 }}>Insert one from a ticket. {"{{name}}"} becomes the person&apos;s name and {"{{ticket}}"} the ticket number.</p>
      <div className="adm-row">
        <ul className="adm-plain-list adm-grow">
          {templates.map((t) => (
            <li key={t.id} style={{ alignItems: "center" }}>
              <span className="adm-strong" style={{ flex: 1 }}>{t.title}</span>
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => setDraft({ id: t.id, title: t.title, body: t.body })}>Edit</button>
              <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => { if (window.confirm(`Delete "${t.title}"?`)) void remove(t.id); }}>Delete</button>
            </li>
          ))}
          {!templates.length && <li className="adm-muted">No saved replies yet.</li>}
        </ul>
        <div className="adm-stack adm-grow">
          <label className="adm-field"><span className="adm-label">Title</span><input className="adm-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} /></label>
          <label className="adm-field"><span className="adm-label">Reply text</span><textarea className="adm-textarea" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} maxLength={5000} rows={6} /></label>
          <div className="adm-inline">
            <button type="button" className="adm-btn adm-btn--primary" disabled={!draft.title.trim() || !draft.body.trim()} onClick={async () => { if (await save(draft)) setDraft({ title: "", body: "" }); }}>
              {draft.id ? "Save changes" : "Add saved reply"}
            </button>
            {draft.id && <button type="button" className="adm-btn" onClick={() => setDraft({ title: "", body: "" })}>Cancel</button>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function Support({ tickets, selected, setSelected, onReply, onStatusChange, templates, saveTemplate, deleteTemplate, resend, openAccount, restoreAccount }: {
  tickets: Ticket[];
  selected: Ticket | null;
  setSelected: (ticket: Ticket) => void;
  onReply: (id: string, message: string, idempotencyKey: string) => Promise<unknown>;
  onStatusChange: (id: string, status: string) => void;
  templates: ReplyTemplate[];
  saveTemplate: (template: { id?: string; title: string; body: string }) => Promise<boolean>;
  deleteTemplate: (id: string) => Promise<boolean>;
  resend: (ticketId: string, replyId: string) => Promise<TicketReply | null>;
  openAccount: (id: string) => void;
  restoreAccount: (userId: string, reason: string) => Promise<boolean>;
}) {
  const [box, setBox] = useState<Box>("open");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // Each opened ticket's conversation, kept while the section is open.
  const [threads, setThreads] = useState<Record<string, TicketReply[]>>({});
  const counts = useMemo(() => tickets.reduce((acc, t) => { acc[BOX_OF[t.status] || "open"] += 1; return acc; }, { open: 0, waiting: 0, done: 0 } as Record<Box, number>), [tickets]);
  const shown = tickets.filter((t) => (BOX_OF[t.status] || "open") === box);
  const restricted = (t: Ticket) => t.accountStatus === "suspended" || t.accountStatus === "disabled";

  const refreshThread = (id: string) => loadTicket(id)
    .then((result) => setThreads((current) => ({ ...current, [id]: result.replies || [] })))
    .catch(() => setThreads((current) => ({ ...current, [id]: [] })));

  // A new ticket starts with an empty reply, so a half-typed one never goes to the wrong person.
  useEffect(() => {
    setReply("");
    setFeedback("");
    setFeedbackError(false);
    if (selected && !threads[selected.id]) void refreshThread(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function send() {
    if (!selected || sending || !reply.trim()) return;
    setSending(true);
    setFeedback("");
    setFeedbackError(false);
    try {
      await onReply(selected.id, reply, createIdempotencyKey());
      setReply("");
      setFeedback("Reply sent.");
    } catch (error) {
      setFeedback(errorMessage(error, "Unable to send the reply."));
      setFeedbackError(true);
    } finally {
      setSending(false);
      void refreshThread(selected.id);
    }
  }

  async function resendReply(ticketId: string, r: TicketReply) {
    const sent = await resend(ticketId, r.id);
    if (sent) setThreads((current) => ({ ...current, [ticketId]: (current[ticketId] || []).map((x) => (x.id === sent.id ? { ...x, ...sent } : x)) }));
  }

  return (
    <>
      <SectionHeader
        title="Support"
        description="Messages from the Support page and email to any @varoom.co.ke address. Each new ticket is acknowledged automatically, and replies by email join their ticket."
        actions={<button type="button" className="adm-btn" onClick={() => setShowTemplates((v) => !v)}>{showTemplates ? "Hide saved replies" : "Saved replies"}</button>}
      />
      {showTemplates && <SavedReplies templates={templates} save={saveTemplate} remove={deleteTemplate} />}

      <div className="adm-row">
        <section className="adm-table-card" aria-label="Tickets" style={{ flex: "1 1 320px", maxWidth: 440 }}>
          <div className="adm-toolbar">
            <Tabs label="Ticket status" value={box} onChange={setBox}
              tabs={[{ key: "open", label: "Open", count: counts.open }, { key: "waiting", label: "Waiting", count: counts.waiting }, { key: "done", label: "Done", count: counts.done }]} />
          </div>
          <ul style={{ padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {shown.map((t) => {
              const [catLabel, catTone] = CATEGORY[t.category || ""] || [null, "info" as const];
              return (
                <li key={t.id}>
                  <button type="button" className="adm-inbox-item" aria-current={selected?.id === t.id} onClick={() => setSelected(t)}>
                    <Avatar name={t.name} id={t.email} />
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span className="adm-inline" style={{ flexWrap: "nowrap" }}><strong className="adm-ellipsis" style={{ flex: 1 }}>{t.name}</strong><span className="adm-small adm-muted" style={{ whiteSpace: "nowrap" }}>{timeAgo(t.createdAt)}</span></span>
                      <span className="adm-ellipsis" style={{ fontWeight: 600 }}>{t.subject}</span>
                      <span className="adm-small adm-muted adm-ellipsis">{t.message}</span>
                      <span className="adm-inline" style={{ gap: 6 }}>
                        {catLabel && <Pill tone={catTone}>{catLabel}</Pill>}
                        {restricted(t) && <StatusPill status={t.accountStatus} />}
                        <Pill>{t.source === "email" ? "Email" : "Support page"}</Pill>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="adm-empty">{box === "open" ? "No open tickets. Support is clear." : box === "waiting" ? "No tickets waiting on a reply from the person." : "No finished tickets yet."}</li>}
          </ul>
        </section>

        <section className="adm-table-card" aria-label={selected ? `Ticket ${ticketRef(selected.id)}` : "Ticket"} style={{ flex: "2 1 480px", display: "flex", flexDirection: "column" }}>
          {selected ? (
            <div key={selected.id} style={{ display: "flex", flexDirection: "column" }}>
              <div className="adm-modal__head" style={{ flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div className="adm-small adm-muted adm-strong">{ticketRef(selected.id)} · {selected.source === "email" ? "Email" : "Support page"} · {formatDate(selected.createdAt)}</div>
                  <h2 className="adm-title" style={{ fontSize: "1.25rem", margin: "4px 0 8px" }}>{selected.subject}</h2>
                  <div className="adm-inline">
                    {selected.user_id ? <button type="button" className="adm-link" onClick={() => openAccount(selected.user_id as string)}>{selected.name}</button> : <strong>{selected.name}</strong>}
                    <span className="adm-muted">{selected.email}</span>
                    {restricted(selected) && <StatusPill status={selected.accountStatus} />}
                    {selected.category === "appeal" && <Pill tone="accent">Appeal{selected.priority === "high" ? " · high priority" : ""}</Pill>}
                    <StatusPill status={selected.status} />
                  </div>
                </div>
                <div className="adm-inline">
                  {restricted(selected) && selected.user_id && <ConsequentialButton label="Restore account" onConfirm={(reason) => restoreAccount(selected.user_id as string, reason)} small={false} />}
                  <label className="adm-inline"><span className="sr-only">Ticket status</span>
                    <select className="adm-select" style={{ width: "auto" }} value={selected.status} onChange={(event) => onStatusChange(selected.id, event.target.value)}>
                      <option value="open">Open</option>
                      <option value="in_progress">Waiting on them</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                </div>
              </div>

              <Thread ticket={selected} replies={threads[selected.id]} onResend={(r) => resendReply(selected.id, r)} />

              <div className="adm-stack" style={{ padding: "16px 20px 20px", borderTop: "1px solid var(--adm-line)" }}>
                <div className="adm-inline">
                  <span className="adm-muted">Email reply to <strong style={{ color: "var(--adm-ink)" }}>{selected.email}</strong></span>
                  {templates.length > 0 && (
                    <label className="adm-inline" style={{ marginLeft: "auto" }}>
                      <span className="adm-small adm-muted">Saved reply</span>
                      <select className="adm-select" style={{ width: "auto" }} value="" onChange={(event) => {
                        const template = templates.find((t) => t.id === event.target.value);
                        if (template) setReply(fillTemplate(template.body, selected));
                      }}>
                        <option value="">Insert…</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <label className="sr-only" htmlFor="adm-reply">Reply</label>
                <textarea id="adm-reply" className="adm-textarea" rows={5} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply. It is sent as an email to the address above." />
                <div className="adm-inline">
                  <span className="adm-small adm-muted">Replies by email join this ticket.</span>
                  {feedback && <span className={`adm-small adm-strong`} style={{ color: feedbackError ? "var(--adm-bad)" : "var(--adm-good)" }} role="status">{feedback}</span>}
                  <button type="button" className="adm-btn adm-btn--primary" style={{ marginLeft: "auto" }} disabled={sending || !reply.trim()} onClick={() => { void send(); }}>
                    <Send size={16} aria-hidden="true" />{sending ? "Sending…" : "Send reply"}
                  </button>
                </div>
              </div>
            </div>
          ) : <div className="adm-empty">Choose a ticket to read it.</div>}
        </section>
      </div>
    </>
  );
}
