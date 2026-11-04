import React, { useEffect, useId, useState } from 'react';

// "Report User": a small dialog centred over the conversation (reported to
// /api/chat/reports with one of the fixed reasons and optional details).

export const REPORT_REASONS = ['Spam or scam', 'Harassment', 'Inappropriate content', 'Other'];

const REASON_HINTS: Record<string, string> = {
  'Spam or scam': 'Fake listings, payment requests or suspicious links',
  Harassment: 'Threats, abuse or unwanted contact',
  'Inappropriate content': 'Offensive messages, photos or files',
  Other: 'Something else that breaks VaRoom’s rules',
};

const DETAILS_MAX = 2000;

export default function ReportSheet({ open, personName, onClose, onSubmit }: {
  open: boolean;
  personName: string;
  onClose: () => void;
  /** Resolves when the report is accepted; the dialog stays open if it rejects. */
  onSubmit: (reason: string, details: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    setReason('');
    setDetails('');
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(reason, details.trim());
      onClose();
    } catch {
      // The page reports the failure; the dialog stays open to retry.
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  const name = personName || 'this user';
  return (
    <div className="chat-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section id="chatReportSheet" className="chat-modal-card chat-report" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="chat-modal-head">
          <div>
            <h2 id={titleId}>Report {name}</h2>
            <p>VaRoom’s team reviews every report.</p>
          </div>
          <button className="chat-modal-close" type="button" aria-label="Close" onClick={onClose}>
            <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
          </button>
        </header>
        <form className="chat-report-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <fieldset className="chat-report-reasons">
            <legend className="chat-report-label">Why are you reporting?</legend>
            {REPORT_REASONS.map((item) => (
              <label key={item} className={`chat-report-reason${reason === item ? ' is-selected' : ''}`}>
                <input type="radio" name="chatReportReason" value={item} checked={reason === item} onChange={() => setReason(item)} />
                <span>
                  <strong>{item}</strong>
                  <small>{REASON_HINTS[item]}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="chat-report-label" htmlFor="chatReportDetails">Details (optional)</label>
          <textarea
            id="chatReportDetails"
            className="chat-report-details"
            rows={3}
            maxLength={DETAILS_MAX}
            placeholder={`What happened with ${name}?`}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
          <span className="chat-report-count" aria-hidden="true">{details.length} / {DETAILS_MAX}</span>
          <footer className="chat-modal-actions">
            <button className="chat-btn chat-btn-secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="chat-btn chat-btn-primary" type="submit" disabled={!reason || submitting}>
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
