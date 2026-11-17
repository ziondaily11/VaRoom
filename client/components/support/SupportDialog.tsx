import React, { useEffect, useRef, useState } from 'react';
import {
  ACCOUNT_HELP_COPY,
  ACCOUNT_TOPICS,
  FLOW_COPY,
  buildSupportTicket,
  sendSupportTicket,
  ticketRequest,
  type SupportFlow,
} from '../../lib/support/support';
import { maskEmail } from '../../lib/support/handoff';

// The support dialog (legacy renderFlow / submitSupportForm): a ticket, bug
// report, feature request or account help form. Closes on Escape, the
// backdrop or ✕; focus moves in on open and back to the button that opened
// it on close.
//
// A reply-to email already known (the account's, or the one typed on the
// sign-in panel) is shown masked, "zi*****ly@gmail.com", and sent as is;
// "Use a different email" swaps it for an empty field.

export default function SupportDialog({ flow, user, getAccessToken, onClose }: {
  flow: SupportFlow;
  user: { name: string; email: string };
  getAccessToken: () => Promise<string | null>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // The button that opened the dialog, read before focus moves into it.
  const openerRef = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
  const [replyEmail, setReplyEmail] = useState(user.email);
  const [editingEmail, setEditingEmail] = useState(!user.email);
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Each flow starts with a fresh form.
  useEffect(() => {
    setReplyEmail(user.email);
    setEditingEmail(!user.email);
    setSubject('');
    setTopic('');
    setMessage('');
    setProblem('');
    setSent(false);
    const first = dialogRef.current?.querySelector<HTMLElement>('select, input:not([type=hidden]), textarea');
    (first || dialogRef.current)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  useEffect(() => {
    const opener = openerRef.current;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The confirmation closes the dialog after a moment (legacy 1.4 s).
  useEffect(() => {
    if (!sent) return undefined;
    const timer = window.setTimeout(onClose, 1400);
    return () => window.clearTimeout(timer);
  }, [sent, onClose]);

  const copy = FLOW_COPY[flow];
  const asksEmail = flow === 'ticket' || flow === 'account';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (flow === 'account' && !topic) {
      setProblem('Please choose what you need help with.');
      return;
    }
    const result = buildSupportTicket(ticketRequest(flow, user, { replyEmail, subject, message, topic }));
    if ('error' in result) {
      setProblem(result.error);
      return;
    }
    setProblem('');
    setSubmitting(true);
    try {
      await sendSupportTicket(result.ticket, await getAccessToken());
      setSent(true);
    } catch (error) {
      setProblem((error instanceof Error && error.message) || 'Unable to send support request.');
    } finally {
      setSubmitting(false);
    }
  };

  const useDifferentEmail = () => {
    setReplyEmail('');
    setEditingEmail(true);
    window.requestAnimationFrame(() => document.getElementById('ticket-email')?.focus());
  };

  return (
    <div
      id="support-modal-backdrop"
      className="support-modal-backdrop"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} className="support-modal" role="dialog" aria-modal="true" aria-labelledby="support-modal-title" tabIndex={-1}>
        <button id="support-modal-close" className="support-modal-close" type="button" aria-label="Close support dialog" onClick={onClose}>✕</button>
        <div id="support-modal-content">
          {sent ? (
            <div className="support-success-compact" role="status">
              <span className="success-icon" aria-hidden="true">✓</span>
              <strong>{copy.confirmation}</strong>
              <p>{copy.confirmationMessage}</p>
            </div>
          ) : (
            <>
              <div className="section-label">{copy.title}</div>
              <h2 id="support-modal-title">{copy.title}</h2>
              {flow === 'account' && <p>{ACCOUNT_HELP_COPY}</p>}
              <form id="active-support-form" className={`support-form${submitting ? ' is-submitting' : ''}`} noValidate onSubmit={submit}>
                {asksEmail && (
                  editingEmail ? (
                    <>
                      <label className="field-label" htmlFor="ticket-email">Reply-to email</label>
                      <input id="ticket-email" name="reply_email" type="email" required value={replyEmail} placeholder="name@example.com" autoComplete="email" onChange={(event) => setReplyEmail(event.target.value)} />
                    </>
                  ) : (
                    <>
                      <span className="field-label">Reply-to email</span>
                      <div className="reply-email-known">
                        <span>{maskEmail(replyEmail)}</span>
                        <button type="button" className="reply-email-change" onClick={useDifferentEmail}>Use a different email</button>
                      </div>
                    </>
                  )
                )}
                {flow === 'account' && (
                  <>
                    <label className="field-label" htmlFor="account-topic">What do you need help with?</label>
                    <select id="account-topic" name="topic" required value={topic} onChange={(event) => setTopic(event.target.value)}>
                      <option value="" disabled>Choose one</option>
                      {ACCOUNT_TOPICS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </>
                )}
                {flow === 'ticket' && (
                  <>
                    <label className="field-label" htmlFor="ticket-subject">Subject</label>
                    <input id="ticket-subject" name="subject" type="text" required placeholder="How can we help?" value={subject} onChange={(event) => setSubject(event.target.value)} />
                  </>
                )}
                <label className="field-label" htmlFor="active-message">{copy.label}</label>
                <textarea id="active-message" name="message" required rows={5} placeholder={copy.placeholder} value={message} onChange={(event) => setMessage(event.target.value)} />
                <div className="support-form-actions">
                  <button className="support-form-secondary" type="button" onClick={onClose}>Cancel</button>
                  <button className="write-button submit-button" type="submit" disabled={submitting}>{submitting ? 'Sending...' : copy.submit}</button>
                </div>
                <p className="support-form-message" aria-live="polite">{problem}</p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
