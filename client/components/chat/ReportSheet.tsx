import React, { useEffect, useState } from 'react';

// "Report User" sheet (ported from public/js/chat-data.js openReportSheet):
// a fixed reason, optional details, submitted to /api/chat/reports.

export const REPORT_REASONS = ['Spam or scam', 'Harassment', 'Inappropriate content', 'Other'];

export default function ReportSheet({ open, personName, onClose, onSubmit }: {
  open: boolean;
  personName: string;
  onClose: () => void;
  /** Resolves when the report is accepted; the sheet stays open if it rejects. */
  onSubmit: (reason: string, details: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      // The page reports the failure; the sheet stays open to retry.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="chatReportSheet" className={`chat-sheet${open ? ' open' : ''}`} aria-hidden={!open} role="dialog" aria-label="Report User">
      {open && (
        <>
          <div className="chat-sheet-head">
            <span>Report User</span>
            <button className="chat-sheet-close" type="button" aria-label="Close" onClick={onClose}>×</button>
          </div>
          <div className="chat-report-form">
            <label className="chat-report-label" htmlFor="chatReportReason">Reason</label>
            <select id="chatReportReason" className="chat-report-details" value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="">Select a reason</option>
              {REPORT_REASONS.map((item) => <option key={item}>{item}</option>)}
            </select>
            <label className="chat-report-label" htmlFor="chatReportDetails">Details (optional)</label>
            <textarea
              id="chatReportDetails"
              className="chat-report-details"
              rows={4}
              maxLength={2000}
              placeholder={`Additional details about ${personName || 'this user'}`}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
            <button className="chat-sheet-action" type="button" disabled={!reason || submitting} onClick={() => { void submit(); }}>
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
