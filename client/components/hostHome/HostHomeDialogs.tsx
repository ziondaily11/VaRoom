import React, { useEffect, useState } from 'react';
import { NICHES, REPORT_REASONS } from '../../lib/hostHome/hostHome';

// Host home's dialogs, unchanged from legacy-pages/host-home.html: Report
// this listing, and Choose your hosting niche (shown until the host has
// exactly one niche; it cannot be dismissed).

export function ReportDialog({ open, onClose, onSubmit }: {
  open: boolean;
  onClose: () => void;
  /** Resolves an error message, or null when the report was saved. */
  onSubmit: (reason: string, details: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState('fraudulent');
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Each report starts fresh.
  useEffect(() => {
    if (!open) return;
    setReason('fraudulent');
    setDetails('');
    setMessage(null);
    setSent(false);
  }, [open]);

  useEffect(() => {
    if (!sent) return undefined;
    const timer = window.setTimeout(onClose, 1800);
    return () => window.clearTimeout(timer);
  }, [sent, onClose]);

  return (
    <div className={`report-modal-overlay${open ? ' open' : ''}`} id="report-modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="report-modal">
        <h3>Report this listing</h3>
        <p>Help us keep VaRoom trustworthy. Reports are reviewed by our team — false reports don&apos;t automatically penalize a host.</p>
        <div className="field">
          <label htmlFor="report-reason">Reason</label>
          <select id="report-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
            {REPORT_REASONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="report-details">Details (optional)</label>
          <textarea id="report-details" placeholder="Anything else we should know" value={details} onChange={(event) => setDetails(event.target.value)} />
        </div>
        <div className="report-modal-actions">
          <button type="button" className="report-cancel-btn" id="report-cancel-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="report-submit-btn"
            id="report-submit-btn"
            disabled={submitting}
            style={{ display: sent ? 'none' : 'block' }}
            onClick={async () => {
              setSubmitting(true);
              const failure = await onSubmit(reason, details);
              setSubmitting(false);
              if (failure) { setMessage({ text: failure, error: true }); return; }
              setMessage({ text: 'Report submitted. Thank you for helping keep VaRoom trustworthy.', error: false });
              setSent(true);
            }}
          >{submitting ? 'Submitting...' : 'Submit report'}</button>
        </div>
        <p className={`report-modal-msg${message ? (message.error ? ' error' : ' success') : ''}`} id="report-modal-msg">{message ? message.text : ''}</p>
      </div>
    </div>
  );
}

export function NichePrompt({ open, onChoose }: { open: boolean; onChoose: (niche: string) => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} id="host-niche-prompt" role="dialog" aria-modal="true" aria-labelledby="host-niche-prompt-title">
      <div className="modal-card niche-prompt-card">
        <h2 id="host-niche-prompt-title">Choose your hosting niche</h2>
        <p>VaRoom is preparing niche-specific listing tools. Choose one niche for your host account; all listings you create will use it automatically.</p>
        <div className="niche-prompt-options" id="host-niche-options">
          {NICHES.map((niche) => (
            <button key={niche.value} type="button" className="niche-prompt-option" data-niche={niche.value} disabled={saving} onClick={async () => {
              setSaving(true);
              setMessage('Saving your niche...');
              const saved = await onChoose(niche.value);
              setSaving(false);
              setMessage(saved ? '' : 'Could not save your niche. Please try again.');
            }}>{niche.label}</button>
          ))}
        </div>
        <p className="niche-prompt-msg" id="host-niche-prompt-msg" role="status">{message}</p>
      </div>
    </div>
  );
}
