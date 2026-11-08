import { useEffect, useRef, useState } from 'react';
import styles from '../../pages/ClientHome.module.css';

// Client Home's overlays, moved unchanged from pages/client-home.tsx so they
// load only when first opened (next/dynamic there): the photo lightbox and
// "Report this listing".

export function Lightbox({ value, close }: { value: { urls: string[]; index: number }; close: () => void }) {
  const [index, setIndex] = useState(value.index);
  const startX = useRef<number | null>(null);
  const go = (delta: number) => setIndex((current) => (current + delta + value.urls.length) % value.urls.length);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close]);

  return (
    <div
      className={styles.lightbox}
      onClick={close}
      onTouchStart={(event) => { startX.current = event.changedTouches[0].clientX; }}
      onTouchEnd={(event) => {
        if (startX.current === null) return;
        const delta = event.changedTouches[0].clientX - startX.current;
        if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
        startX.current = null;
      }}
    >
      <div className={styles.lightboxStage} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.lightboxClose} aria-label="Close" onClick={close}>×</button>
        <img className={styles.lightboxImage} src={value.urls[index]} alt="Listing media" />
        {value.urls.length > 1 && (
          <>
            <button type="button" className={`${styles.lightboxNav} ${styles.previous}`} aria-label="Previous photo" onClick={() => go(-1)}>‹</button>
            <button type="button" className={`${styles.lightboxNav} ${styles.next}`} aria-label="Next photo" onClick={() => go(1)}>›</button>
            <span className={styles.lightboxCounter}>{index + 1} / {value.urls.length}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function ReportModal({
  reason,
  details,
  message,
  submitting,
  onReason,
  onDetails,
  onCancel,
  onSubmit,
}: {
  reason: string;
  details: string;
  message: string;
  submitting: boolean;
  onReason: (value: string) => void;
  onDetails: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.reportModal} role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="report-title">Report this listing</h2>
        <p>Help us keep VaRoom trustworthy. Reports are reviewed by our team — false reports don&apos;t automatically penalize a host.</p>
        <label>
          Reason
          <select value={reason} onChange={(event) => onReason(event.target.value)}>
            <option value="fraudulent">Fraudulent — this host is scamming or misrepresenting</option>
            <option value="misleading_info">Misleading information — details don&apos;t match reality</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Details (optional)
          <textarea value={details} onChange={(event) => onDetails(event.target.value)} placeholder="Anything else we should know" />
        </label>
        {message && <p className={`${styles.reportMessage} ${message.startsWith('Report submitted') ? styles.reportSuccess : styles.reportError}`} role="status">{message}</p>}
        <div className={styles.modalActions}>
          <button type="button" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button type="button" className={styles.submitButton} onClick={onSubmit} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit report'}</button>
        </div>
      </div>
    </div>
  );
}
