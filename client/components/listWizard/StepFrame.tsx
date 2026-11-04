import React from 'react';

// One step of the listing wizard: the panel (brand, progress ring, save
// status, the step's own content) beside its photo. Unchanged markup from
// legacy-pages/list.html; every step stays mounted and CSS shows the active one.

export interface SaveStatus { message: string; state: 'saving' | 'saved' | 'error' | null }

export const INITIAL_SAVE_STATUS: SaveStatus = { message: 'Changes save automatically.', state: null };

export function StepFrame({ step, tone, active, pct, progress, saveStatus, children, photo }: {
  step: number;
  tone: 'tone-dark' | 'tone-red' | 'tone-cream';
  active: boolean;
  pct: number;
  progress: React.ReactNode;
  saveStatus: SaveStatus;
  children: React.ReactNode;
  photo: React.ReactNode;
}) {
  return (
    <section className={`step-frame${active ? ' active' : ''} ${tone}`} data-step={step}>
      <div className="step-panel">
        <div className="panel-brand"><span className="roof" /> VaRoom</div>
        <div className="progress-row">
          <div className="progress-ring" style={{ '--pct': pct } as React.CSSProperties}><span>{pct}%</span></div>
          <div className="progress-text">{progress}</div>
        </div>
        <span className="listing-save-status" role="status" aria-live="polite" data-state={saveStatus.state || undefined}>{saveStatus.message}</span>
        {children}
      </div>
      {photo}
    </section>
  );
}

/** A step's photo panel with its badge and caption. */
export const StepPhoto = React.forwardRef<HTMLDivElement, { step: number; badge: string; title: string; text: string; children?: React.ReactNode }>(
  function StepPhoto({ step, badge, title, text, children }, ref) {
    return (
      <div className="step-photo" ref={ref} style={{ backgroundImage: `url('/assets/listing-wizard/step-${step}.jpg')` }}>
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

export function PanelActions({ onBack, next, onNext, style }: { onBack?: () => void; next?: string; onNext?: () => void; style?: React.CSSProperties }) {
  return (
    <div className="panel-actions" style={style}>
      {onBack && <button type="button" className="step-btn back" data-back onClick={onBack}>← Back</button>}
      {next && onNext && <button type="button" className="step-btn next" data-next onClick={onNext}>{next}</button>}
    </div>
  );
}
