import React, { useEffect, useRef } from 'react';

// The listing wizard's frame: one progress bar above the steps, then each
// step's panel (its content) beside its photo. Every step stays mounted and
// CSS shows the active one.

export interface SaveStatus { message: string; state: 'saving' | 'saved' | 'error' | null }

export const INITIAL_SAVE_STATUS: SaveStatus = { message: 'Changes save automatically.', state: null };

/** The steps, in order, as the progress bar names them. */
export const STEP_LABELS = ['Basics', 'Location', 'The space', 'Photos', 'Price & terms', 'Review'] as const;

/**
 * Where the host is: "Step 2 of 5 · Location", the save status, and a bar of
 * segments. A segment already reached opens its step; later ones wait.
 */
export function WizardProgress({ step, furthest, saveStatus, onGo }: {
  step: number;
  furthest: number;
  saveStatus: SaveStatus;
  onGo: (step: number) => void;
}) {
  const total = STEP_LABELS.length;
  return (
    <nav className="wz-progress" aria-label="Listing steps">
      <div className="wz-progress-head">
        <p className="wz-progress-label"><span>Step {step} of {total}</span> · {STEP_LABELS[step - 1]}</p>
        <span className="listing-save-status" role="status" aria-live="polite" data-state={saveStatus.state || undefined}>{saveStatus.message}</span>
      </div>
      <ol className="wz-progress-bar">
        {STEP_LABELS.map((label, index) => {
          const target = index + 1;
          const reached = target <= furthest;
          const state = target === step ? 'current' : target < step || reached ? 'done' : 'next';
          return (
            <li key={label} className={`wz-progress-seg is-${state}`}>
              <button type="button" disabled={!reached || target === step} aria-current={target === step ? 'step' : undefined}
                aria-label={`Step ${target}: ${label}${reached ? '' : ' (not reached yet)'}`} onClick={() => onGo(target)}>
                <span className="wz-progress-fill" aria-hidden="true" />
                <span className="wz-progress-name">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepFrame({ step, active, children, photo, overlay = null }: {
  step: number;
  active: boolean;
  children: React.ReactNode;
  photo: React.ReactNode;
  /** Covers the whole card (the Silver / Gold choice); the step behind it is inert. */
  overlay?: React.ReactNode;
}) {
  const covered = active && Boolean(overlay);
  const panel = useRef<HTMLDivElement>(null);
  // React 18 has no inert prop: set the attribute so focus can't reach the covered form.
  useEffect(() => { panel.current?.toggleAttribute('inert', covered); }, [covered]);
  return (
    <section className={`step-frame${active ? ' active' : ''}`} data-step={step}>
      <div className="step-panel" ref={panel}>{children}</div>
      {photo}
      {covered && overlay}
    </section>
  );
}

/** A step's photo panel with its badge and caption. */
export const StepPhoto = React.forwardRef<HTMLDivElement, { image: number; badge: string; title: string; text: string; children?: React.ReactNode }>(
  function StepPhoto({ image, badge, title, text, children }, ref) {
    return (
      <div className="step-photo" ref={ref} style={{ backgroundImage: `url('/assets/listing-wizard/step-${image}.jpg')` }}>
        {children}
        <div className="step-photo-badge"><span className="check">✓</span> {badge}</div>
        <div className="step-photo-caption">
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
      </div>
    );
  },
);

/** What stops the host moving on, shown in the page (not a browser pop-up). */
export function StepAlert({ text }: { text: string | null }) {
  return <p className={`wz-step-alert${text ? ' show' : ''}`} role="alert">{text || ''}</p>;
}

/** Back and Continue, kept in view at the bottom of the step, with what stops the host moving on just above. */
export function PanelActions({ onBack, next, onNext, alert = null, style }: { onBack?: () => void; next?: string; onNext?: () => void; alert?: string | null; style?: React.CSSProperties }) {
  return (
    <div className="panel-actions" style={style}>
      <StepAlert text={alert} />
      <div className="panel-actions-row">
        {onBack && <button type="button" className="step-btn back" data-back onClick={onBack}>← Back</button>}
        {next && onNext && <button type="button" className="step-btn next" data-next onClick={onNext}>{next}</button>}
      </div>
    </div>
  );
}
