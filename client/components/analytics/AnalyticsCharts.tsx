import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
import { fmtDate, formatMetric, label, num, short } from '../../lib/analytics/format';
import type { FunnelStep, MetricFormat, TrendMetric } from '../../lib/analytics/niche';
import type { Granularity, StatusCount, TrendPoint } from '../../lib/analytics/types';

// Charts for the analytics page: SVG and CSS only, no chart library. Marks
// follow the dataviz specs: 2px lines, bars <= 24px with 4px rounded ends and
// a 2px surface gap, hairline grid, crosshair or per-mark tooltips.

/** Status colour class for a booking or reservation status (status palette, always with a label). */
export const statusTone = (s: string) =>
  (({ approved: 'good', paid: 'good', succeeded: 'good', completed: 'good', pending: 'warn', requested: 'warn', contacted: 'warn', declined: 'bad', cancelled: 'bad', failed: 'bad' }) as Record<string, string>)[s.toLowerCase()] ?? 'mute';

/** Width of a container, from one ResizeObserver per chart. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number | null>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // Measure before paint, then follow resizes.
    setW(Math.max(200, Math.floor(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
};

function tipLeft(x: number, w: number) {
  return Math.min(w - 70, Math.max(70, x));
}

/* ---------- Sparkline ---------- */

export function Sparkline({ values, width = 76, height = 26, variant = 'tile' }: { values: number[]; width?: number; height?: number; variant?: 'tile' | 'hero' }) {
  const id = useId();
  if (values.length < 2 || values.every((v) => v === 0)) return variant === 'hero' ? null : <span className="va-spark" />;
  const max = Math.max(...values), min = Math.min(0, ...values);
  const pad = variant === 'hero' ? 6 : 3;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / (max - min || 1));
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  if (variant === 'hero') {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".32" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  const last = values.length - 1;
  return (
    <svg className="va-spark" viewBox={`-4 -4 ${width + 8} ${height + 8}`} aria-hidden="true">
      <path className="l" d={line} />
      <circle cx={x(last)} cy={y(values[last])} r="3.5" />
    </svg>
  );
}

/* ---------- Area chart with crosshair ---------- */

export function AreaChart({ points, g, metric }: { points: TrendPoint[]; g: Granularity; metric: TrendMetric }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, measured] = useWidth();
  const H = 260, m = { t: 14, r: 8, b: 28, l: 44 };
  if (measured === null) return <div className="va-chart" ref={ref} style={{ height: H }} />;
  const w = measured;
  const vals = points.map((p) => p[metric.key]);
  const max = niceMax(Math.max(...vals, 0));
  const iw = w - m.l - m.r, ih = H - m.t - m.b;
  const x = (i: number) => m.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => m.t + ih - (v / max) * ih;
  // A smooth curve (monotone-ish cubic) through the points.
  const line = vals.map((v, i) => {
    if (i === 0) return `M${x(0).toFixed(1)},${y(v).toFixed(1)}`;
    const cx = (x(i - 1) + x(i)) / 2;
    return `C${cx.toFixed(1)},${y(vals[i - 1]).toFixed(1)} ${cx.toFixed(1)},${y(v).toFixed(1)} ${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  }).join('');
  const area = `${line}L${x(vals.length - 1).toFixed(1)},${m.t + ih}L${x(0).toFixed(1)},${m.t + ih}Z`;
  const every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 70)));
  const fmt = (n: number) => formatMetric(n, metric.format);
  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const i = points.length < 2 ? 0 : Math.round(((clientX - r.left - m.l) / iw) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };
  const total = vals.reduce((s, v) => s + v, 0);

  return (
    <div className="va-chart" ref={ref}>
      <svg
        width={w} height={H} role="img" tabIndex={0}
        aria-label={`${metric.label} over time, total ${fmt(total)}`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? points.length) - 1));
        }}
        onBlur={() => setHover(null)}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".22" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line className="va-gridline" x1={m.l} x2={w - m.r} y1={y(t * max)} y2={y(t * max)} />
            <text className="va-axis" x={m.l - 10} y={y(t * max) + 4} textAnchor="end">{short(t * max)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${id})`} />
        <path className="va-line" d={line} />
        {points.map((p, i) => i % every === 0 && (
          <text key={p.bucket} className="va-axis" x={x(i)} y={H - 6} textAnchor="middle">{fmtDate(p.bucket, g)}</text>
        ))}
        {hover !== null && points[hover] && (
          <g>
            <line className="va-cross" x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} />
            <circle className="va-dot" cx={x(hover)} cy={y(vals[hover])} r={5} />
          </g>
        )}
      </svg>
      {hover !== null && points[hover] && (
        <div className="va-tip" style={{ transform: `translate(${tipLeft(x(hover), w)}px, ${Math.max(0, y(vals[hover]) - 64)}px) translateX(-50%)` }}>
          <b>{fmt(vals[hover])}</b>
          {fmtDate(points[hover].bucket, g)}
        </div>
      )}
    </div>
  );
}

/* ---------- Stacked columns: approved vs the rest ---------- */

export function RequestColumns({ points, g }: { points: TrendPoint[]; g: Granularity }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, measured] = useWidth();
  const H = 220, m = { t: 10, r: 4, b: 26, l: 32 };
  if (measured === null) return <div className="va-chart" ref={ref} style={{ height: H }} />;
  const w = measured;
  const max = niceMax(Math.max(...points.map((p) => p.requests), 0));
  const iw = w - m.l - m.r, ih = H - m.t - m.b;
  const slot = iw / Math.max(1, points.length);
  const bw = Math.max(3, Math.min(24, slot * 0.62));
  const y = (v: number) => (v / max) * ih;
  const every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 64)));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];

  // A column: rounded 4px at the data end, square at the baseline.
  const colPath = (x: number, top: number, height: number, rounded: boolean) => {
    if (height <= 0) return '';
    const r = rounded ? Math.min(4, height, bw / 2) : 0;
    const bottom = top + height;
    return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${bottom}Z`;
  };

  return (
    <div className="va-chart" ref={ref}>
      <svg width={w} height={H} role="img" aria-label={`Requests over time: ${points.reduce((s, p) => s + p.requests, 0)} requests, ${points.reduce((s, p) => s + p.approved, 0)} approved`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="va-gridline" x1={m.l} x2={w - m.r} y1={m.t + ih - y(t)} y2={m.t + ih - y(t)} />
            <text className="va-axis" x={m.l - 8} y={m.t + ih - y(t) + 4} textAnchor="end">{short(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = m.l + slot * i + (slot - bw) / 2;
          const approvedH = y(p.approved);
          const rest = Math.max(0, p.requests - p.approved);
          const restH = y(rest);
          const gap = approvedH > 0 && restH > 0 ? 2 : 0;
          const base = m.t + ih;
          return (
            <g
              key={p.bucket} className="va-col" tabIndex={p.requests ? 0 : -1}
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${fmtDate(p.bucket, g)}: ${p.requests} requests, ${p.approved} approved`}
            >
              <rect x={m.l + slot * i} y={m.t} width={slot} height={ih} fill="transparent" />
              <path className="va-col-approved" d={colPath(x, base - approvedH, approvedH, restH === 0)} />
              <path className="va-col-rest" d={colPath(x, base - approvedH - gap - restH, restH, true)} />
            </g>
          );
        })}
        {points.map((p, i) => i % every === 0 && (
          <text key={p.bucket} className="va-axis" x={m.l + slot * i + slot / 2} y={H - 6} textAnchor="middle">{fmtDate(p.bucket, g)}</text>
        ))}
      </svg>
      {hover !== null && points[hover] && (
        <div className="va-tip" style={{ transform: `translate(${tipLeft(m.l + slot * hover + slot / 2, w)}px, ${Math.max(0, m.t + ih - y(points[hover].requests) - 84)}px) translateX(-50%)` }}>
          <b>{num.format(points[hover].requests)} requests</b>
          <span className="k"><i style={{ background: 'var(--accent)' }} />{num.format(points[hover].approved)} approved</span>
          <span>{fmtDate(points[hover].bucket, g)}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Thin status bar ---------- */

export function StatusStrip({ items }: { items: StatusCount[] }) {
  const shown = items.filter((i) => i.count > 0);
  if (!shown.length) return null;
  return (
    <>
      <div className="va-thinbar" role="img" aria-label={shown.map((i) => `${label(i.status)} ${i.count}`).join(', ')}>
        {shown.map((i) => <span key={i.status} className={`st-${statusTone(i.status)}`} style={{ flex: `${i.count} 1 0` }} />)}
      </div>
      <ul className="va-legend">
        {shown.map((i) => <li key={i.status}><i className={`st-${statusTone(i.status)}`} />{label(i.status)} <b>{num.format(i.count)}</b></li>)}
      </ul>
    </>
  );
}

/* ---------- Funnel ---------- */

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="va-funnel">
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        return (
          <li key={step.key}>
            {prev !== null && <span className="rate"><b aria-hidden="true">↓</b>{prev && step.value <= prev ? formatMetric(step.value / prev, 'percent') : '–'}</span>}
            <span className="lbl">{step.label}</span>
            <span className="val">{num.format(step.value)}</span>
            <span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(step.value ? 2 : 0, (step.value / top) * 100)}%` }} /></span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Gauge (meter) ---------- */

export function Gauge({ value, caption }: { value: number | null; caption: string }) {
  const size = 150, r = 60, c = 2 * Math.PI * r;
  const arc = 0.75; // a 270° meter, open at the bottom
  const filled = value === null ? 0 : Math.max(0, Math.min(1, value)) * arc * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${caption}: ${formatMetric(value, 'percent')}`}>
      <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
        <circle className="va-gauge-track" cx={size / 2} cy={size / 2} r={r} strokeDasharray={`${arc * c} ${c}`} strokeLinecap="round" />
        {filled > 0 && <circle className="va-gauge-fill" cx={size / 2} cy={size / 2} r={r} strokeDasharray={`${filled} ${c}`} />}
      </g>
      <text className="va-gauge-num" x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">{value === null ? '–' : formatMetric(value, 'percent')}</text>
      <text className="va-gauge-sub" x="50%" y={size / 2 + 24} textAnchor="middle">{caption}</text>
    </svg>
  );
}

/* ---------- Tall segmented bar (contact channels) ---------- */

export function MixBar({ parts }: { parts: { key: string; label: string; value: number; swatch: string; darkInk?: boolean }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <div className="va-mix" aria-hidden="true"><span style={{ flex: 1, background: 'var(--soft)' }} /></div>;
  return (
    <div className="va-mix" role="img" aria-label={parts.map((p) => `${p.label} ${p.value} (${Math.round((p.value / total) * 100)}%)`).join(', ')}>
      {parts.filter((p) => p.value > 0).map((p) => {
        const share = p.value / total;
        return (
          <span key={p.key} className={`${p.swatch}${p.darkInk ? ' dark-ink' : ''}`} style={{ flex: `${p.value} 1 0` }} title={`${p.label}: ${num.format(p.value)}`}>
            {share >= 0.14 ? `${Math.round(share * 100)}%` : ''}
          </span>
        );
      })}
    </div>
  );
}

/* ---------- Small columns (weekday, time of day) ---------- */

export function MiniColumns({ items, format = 'count', height = 120 }: { items: { label: string; value: number }[]; format?: MetricFormat; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, measured] = useWidth();
  const m = { t: 8, b: 22 };
  if (measured === null) return <div className="va-chart" ref={ref} style={{ height: height }} />;
  const w = measured;
  const max = Math.max(1, ...items.map((i) => i.value));
  const slot = w / Math.max(1, items.length);
  const bw = Math.max(4, Math.min(24, slot * 0.6));
  const ih = height - m.t - m.b;
  const peak = items.reduce((best, item, i) => (item.value > items[best].value ? i : best), 0);
  return (
    <div className="va-chart" ref={ref}>
      <svg width={w} height={height} role="img" aria-label={items.map((i) => `${i.label} ${i.value}`).join(', ')}>
        <line className="va-gridline" x1={0} x2={w} y1={m.t + ih} y2={m.t + ih} />
        {items.map((item, i) => {
          const h = (item.value / max) * ih;
          const x = slot * i + (slot - bw) / 2;
          const top = m.t + ih - h;
          const r = Math.min(4, h, bw / 2);
          return (
            <g key={item.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={slot * i} y={m.t} width={slot} height={ih} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${m.t + ih}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${m.t + ih}Z`}
                  fill={i === peak ? 'var(--accent)' : 'var(--rest)'} opacity={i === peak ? 1 : 0.35}
                />
              )}
              <text className="va-axis" x={slot * i + slot / 2} y={height - 5} textAnchor="middle">{item.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && items[hover] && (
        <div className="va-tip" style={{ transform: `translate(${tipLeft(slot * hover + slot / 2, w)}px, ${Math.max(0, m.t + ih - (items[hover].value / max) * ih - 56)}px) translateX(-50%)` }}>
          <b>{formatMetric(items[hover].value, format)}</b>
          {items[hover].label}
        </div>
      )}
    </div>
  );
}
