import React, { useEffect, useRef } from 'react';

// "Leave this listing?" (unchanged from installSaveOrDiscardNavigation in
// legacy-pages/list.html): keep editing, save as a draft, or discard.

export type LeaveStage = 'choose' | 'confirm';

export function LeaveDialog({ open, stage, canDiscard, busy, onStay, onSave, onDiscard, onConfirmDiscard, onCancelDiscard }: {
  open: boolean;
  stage: LeaveStage;
  /** A paid listing can't be discarded. */
  canDiscard: boolean;
  busy: 'save' | 'discard' | null;
  onStay: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else { element.setAttribute('open', ''); document.body.classList.add('listing-leave-fallback'); }
    } else if (!open && element.open) {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
      document.body.classList.remove('listing-leave-fallback');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    (stage === 'confirm' ? confirm.current : stay.current)?.focus();
  }, [open, stage]);

  useEffect(() => () => document.body.classList.remove('listing-leave-fallback'), []);

  return (
    <dialog
      ref={dialog}
      className="listing-leave-dialog"
      aria-labelledby="listing-leave-title"
      onCancel={(event) => { event.preventDefault(); onStay(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onStay(); }}
    >
      <div className="listing-leave-card">
        <h2 id="listing-leave-title">Leave this listing?</h2>
        <p className="listing-leave-copy">{stage === 'confirm' ? 'Discard this unpublished listing? This cannot be undone.' : 'Save your progress as a draft, or discard your changes.'}</p>
        <div className="listing-leave-actions">
          {stage === 'choose' ? (
            <>
              <button type="button" data-leave-action="stay" ref={stay} onClick={onStay}>Keep editing</button>
              <button type="button" data-leave-action="save" disabled={busy === 'save'} onClick={onSave}>{busy === 'save' ? 'Saving draft…' : 'Save as draft'}</button>
              <button type="button" data-leave-action="discard" hidden={!canDiscard} onClick={onDiscard}>Discard listing</button>
            </>
          ) : (
            <>
              <button type="button" data-leave-action="cancel-discard" onClick={onCancelDiscard}>Keep editing</button>
              <button type="button" data-leave-action="confirm-discard" ref={confirm} disabled={busy === 'discard'} onClick={onConfirmDiscard}>{busy === 'discard' ? 'Discarding…' : 'Discard listing'}</button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
