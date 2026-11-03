import React, { useEffect, useState } from "react";
import { Ban, Clock, Mail } from "lucide-react";
import { createIdempotencyKey, errorMessage, type Ticket } from "../../lib/admin/adminApi";
import { SectionHeader, StatCard, StatusPill } from "./AdminUi";

export function Support({ tickets, selected, setSelected, onReply, onStatusChange }: {
  tickets: Ticket[];
  selected: Ticket | null;
  setSelected: (ticket: Ticket) => void;
  onReply: (id: string, message: string, idempotencyKey: string) => Promise<unknown>;
  onStatusChange: (id: string, status: string) => void;
}) {
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
