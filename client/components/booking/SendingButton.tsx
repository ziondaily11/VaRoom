import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ICON_AIRPLANE } from '../../lib/booking/bookingIcons';
import Svg from './Svg';

// The booking buttons' sending animation, unchanged from legacy-pages/booking.html:
// idle → sending (a green fill and a paper plane cross to 85%, then creep to
// 95% while waiting) → sent (finish, fade, success text), or back to idle on
// an error. Reduced motion shows a static "Sending…" state instead.

export interface SendingHandle {
  /** Locks the button and starts the animation. */
  start(): void;
  /** The request succeeded: finish, then show the success text. */
  complete(): Promise<void>;
  /** The request failed: reverse back to the idle button. */
  error(): void;
}

type Phase = 'idle' | 'sending' | 'sent';

const MIN_ANIM_MS = 1800;
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { successText: string; children: React.ReactNode };

const SendingButton = forwardRef<SendingHandle, ButtonProps>(function SendingButton({ successText, children, className, disabled, style, ...rest }, ref) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [minHeight, setMinHeight] = useState<string>('');
  const [label, setLabel] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const progress = useRef<HTMLSpanElement>(null);
  const plane = useRef<HTMLSpanElement>(null);
  const cur = useRef(0);
  const running = useRef(false);
  const frame = useRef(0);
  const reduced = useRef(false);

  useEffect(() => () => { running.current = false; cancelAnimationFrame(frame.current); }, []);

  const setProgress = useCallback((p: number) => {
    cur.current = Math.min(Math.max(p, 0), 1);
    if (progress.current) progress.current.style.transform = `scaleX(${cur.current})`;
    if (!reduced.current && plane.current && button.current) {
      const maxX = button.current.clientWidth - 24;
      plane.current.style.transform = `translateY(-50%) translateX(${cur.current * maxX}px)`;
    }
  }, []);

  const animate = useCallback((duration: number, step: (t: number) => void, done?: () => void) => {
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startedAt) / duration, 1);
      step(t);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else if (done) done();
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  useImperativeHandle(ref, () => ({
    start() {
      reduced.current = reducedMotion();
      if (button.current) setMinHeight(`${button.current.getBoundingClientRect().height}px`);
      running.current = true;
      cur.current = 0;
      setLabel(reduced.current ? 'Sending…' : '');
      setPhase('sending');
      if (reduced.current) return;
      // Phase 1: 0 → 85% over MIN_ANIM_MS; phase 2: creep 85% → 95% (waiting for the server).
      animate(MIN_ANIM_MS, (t) => { if (running.current) setProgress(easeIO(t) * 0.85); }, () => {
        if (running.current) animate(10000, (t) => { if (running.current) setProgress(0.85 + t * 0.1); });
      });
    },
    complete() {
      return new Promise<void>((resolve) => {
        running.current = false;
        cancelAnimationFrame(frame.current);
        const finish = (delay: number) => setTimeout(() => {
          setPhase('sent');
          setLabel(successText);
          setMinHeight('');
          resolve();
        }, delay);
        if (reduced.current) {
          setProgress(1);
          finish(150);
          return;
        }
        // Smoothly finish from the current point, then fade the green to reveal the red.
        const from = cur.current;
        animate(Math.max(400, (1 - from) * 800), (t) => setProgress(from + (1 - from) * easeOut(t)), () => {
          if (progress.current) { progress.current.style.transition = 'opacity .35s ease'; progress.current.style.opacity = '0'; }
          if (plane.current) { plane.current.style.transition = 'opacity .25s ease'; plane.current.style.opacity = '0'; }
          finish(380);
        });
      });
    },
    error() {
      running.current = false;
      cancelAnimationFrame(frame.current);
      const reset = () => { setPhase('idle'); setMinHeight(''); setLabel(''); };
      if (reduced.current) { reset(); return; }
      const from = cur.current;
      animate(400, (t) => setProgress(from * (1 - t)), () => { setTimeout(reset, 80); });
    },
  }), [animate, setProgress, successText]);

  const classes = [className, phase === 'sending' ? 'cta-sending' : '', phase === 'sent' ? 'cta-sent' : ''].filter(Boolean).join(' ');
  return (
    <button
      {...rest}
      ref={button}
      className={classes}
      disabled={phase !== 'idle' || disabled}
      aria-busy={phase === 'sending' ? true : undefined}
      aria-label={phase === 'sent' ? successText : rest['aria-label']}
      style={minHeight ? { ...style, minHeight } : style}
    >
      {phase === 'idle' ? children : (
        <>
          {phase === 'sending' && <span className="cta-progress" ref={progress} style={reduced.current ? { transform: 'scaleX(0.5)' } : undefined} />}
          {phase === 'sending' && <span className="cta-airplane" ref={plane} style={reduced.current ? { display: 'none' } : undefined}><Svg markup={ICON_AIRPLANE} /></span>}
          <span className="cta-label" aria-live="polite">{label}</span>
        </>
      )}
    </button>
  );
});

export default SendingButton;
