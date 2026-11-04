import React, { useRef } from 'react';

// A property listing's optional policy document: the upload link and the
// attached file's name (step 3), and the preview overlay over step 3's photo.
// Markup unchanged from legacy-pages/list.html.

export function PolicyField({ hidden, filename, removing, onChoose, onPreview, onRemove }: {
  hidden: boolean;
  /** The attached or chosen document's name; null when none. */
  filename: string | null;
  removing: boolean;
  onChoose: (file: File) => void;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="field property-policy-section" id="property-policy-section" hidden={hidden}>
      <button type="button" className="policy-upload-link" id="policy-upload-btn" onClick={() => input.current?.click()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
        Upload your property policy PDF (optional)
      </button>
      <input
        ref={input}
        type="file"
        id="policy-input"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.jpg,.jpeg,.png,.webp,.gif"
        style={{ display: 'none' }}
        onChange={(event) => { const file = event.target.files && event.target.files[0]; event.target.value = ''; if (file) onChoose(file); }}
      />
      <div className={`policy-file-name${filename !== null ? ' show' : ''}`} id="policy-file-name">
        <button type="button" className="policy-preview-btn" id="policy-preview-btn" onClick={onPreview}>{filename || ''}</button>
        <button type="button" className="policy-remove" id="policy-remove-btn" disabled={removing} onClick={onRemove}>{removing ? 'Removing…' : 'Remove'}</button>
      </div>
    </div>
  );
}

export const UNAVAILABLE_DOCUMENT_PAGE = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui,sans-serif;padding:2rem;color:#333"><p>This document is no longer available. Please refresh the listing and try again.</p></body></html>';

/** What the preview shows: a document address, or the "no longer available" page. */
export type PolicyPreviewState = { filename: string; src: string | null } | null;

export function PolicyPreviewOverlay({ preview, onClose }: { preview: PolicyPreviewState; onClose: () => void }) {
  return (
    <div className={`policy-preview-overlay${preview ? ' show' : ''}`} id="policy-preview-overlay">
      <div className="policy-preview-toolbar">
        <span id="policy-preview-filename">{preview ? preview.filename : ''}</span>
        <button type="button" className="policy-preview-close" id="policy-preview-close" aria-label="Close policy preview" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      {/* Either src or srcDoc, never both: a later document no longer stays behind the unavailable page. */}
      <iframe
        className="policy-preview-frame"
        id="policy-preview-frame"
        title="Policy document preview"
        src={preview && preview.src ? preview.src : preview ? undefined : 'about:blank'}
        srcDoc={preview && !preview.src ? UNAVAILABLE_DOCUMENT_PAGE : undefined}
      />
    </div>
  );
}
