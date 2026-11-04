import { useEffect, useRef, useState } from 'react';
import { fmtDate, formatMetric, label, num, short } from '../../lib/analytics/format';
import type { FunnelStep, TrendMetric } from '../../lib/analytics/niche';
import type { Granularity, StatusCount, TrendPoint } from '../../lib/analytics/types';

// Charts for the analytics page: SVG and CSS only, no chart library.

export const tone = (s: string) =>
  (({ approved: 'good', paid: 'good', succeeded: 'good', completed: 'good', pending: 'warn', requested: 'warn', contacted: 'info', closed: 'mute', declined: 'bad', cancelled: 'bad', expired: 'mute', failed: 'bad' }) as Record<string, string>)[s.toLowerCase()] ?? 'mute';

/** Width of a container, from one ResizeObserver per chart. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function StatusBar({ items }: { items: StatusCount[] }) {
  const shown = items.filter((i) => i.count > 0);
  if (!shown.length) return null;
  return (
    <>
      <div className="va-seg" role="img" aria-label={shown.map((i) => `${label(i.status)} ${i.count}`).join(', ')}>
        {shown.map((i) => <span key={i.status} className={`t-${tone(i.status)}`} style={{ flex: `${i.count} 1 0` }} />)}
      </div>
      <ul className="va-legend">
        {items.map((i) => (
          <li key={i.status}><i className={`t-${tone(i.status)}`} />{label(i.status)} <b>{num.format(i.count)}</b></li>
        ))}
      </ul>
    </>
  );
}

export function TrendChart({ points, g, metrics }: { points: TrendPoint[]; g: Granularity; metrics: TrendMetric[] }) {
  const [metricKey, setMetricKey] = useState(metrics[0].key);
  const metric = metrics.find((m) => m.key === metricKey) || metrics[0];
  const [hover, setHover] = useState<number | null>(null);
  const [ref, w] = useWidth();
  const H = 220, m = { t: 12, r: 12, b: 26, l: 46 };
  const vals = points.map((p) => p[metric.key]);
  const max = Math.max(1, ...vals), iw = w - m.l - m.r, ih = H - m.t - m.b;
  const x = (i: number) => m.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(vals.length - 1).toFixed(1)},${m.t + ih}L${x(0).toFixed(1)},${m.t + ih}Z`;
  const fmt = (n: number) => formatMetric(n, metric.format);
  const every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 72)));
  const total = vals.reduce((s, v) => s + v, 0);
  const readout = hover !== null && points[hover] ? `${fmtDate(points[hover].bucket, g)}: ${fmt(vals[hover])}` : `Total ${fmt(total)}`;

  return (
    <div>
      <div className="va-row">
        <div className="va-tabs" role="group" aria-label="Chart metric">
          {metrics.map((item) => (
            <button key={item.key} type="button" aria-pressed={metric.key === item.key} onClick={() => setMetricKey(item.key)}>{item.label}</button>
          ))}
        </div>
        <p className="va-readout" aria-live="polite">{readout}</p>
      </div>
      <div ref={ref}>
        <svg
          width={w} height={H} role="img" aria-label={`${metric.label} over time. ${readout}`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = points.length < 2 ? 0 : Math.round(((e.clientX - r.left - m.l) / iw) * (points.length - 1));
            setHover(Math.min(points.length - 1, Math.max(0, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((t) => (
            <g key={t}>
              <line className="va-grid" x1={m.l} x2={w - m.r} y1={y(t * max)} y2={y(t * max)} />
              <text className="va-axis" x={m.l - 8} y={y(t * max) + 4} textAnchor="end">{short(t * max)}</text>
            </g>
          ))}
          <path className="va-area" d={area} />
          <path className="va-line" d={line} />
          {points.map((p, i) => i % every === 0 && (
            <text key={p.bucket} className="va-axis" x={x(i)} y={H - 6} textAnchor="middle">{fmtDate(p.bucket, g)}</text>
          ))}
          {hover !== null && points[hover] && (
            <g>
              <line className="va-grid" x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} />
              <circle className="va-dot" cx={x(hover)} cy={y(vals[hover])} r={4.5} />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="va-funnel">
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const rate = prev ? step.value / prev : null;
        return (
          <li key={step.key}>
            <span>{step.label}{rate !== null && <small>{formatMetric(rate, 'percent')} of the step before</small>}</span>
            <span className="va-track" aria-hidden="true"><i style={{ width: `${(step.value / top) * 100}%` }} /></span>
            <span className="num"><b>{num.format(step.value)}</b></span>
          </li>
        );
      })}
    </ol>
  );
}

export function WeekdayBars({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="va-days" role="img" aria-label={`Requests by weekday: ${counts.join(', ')} (Monday first)`}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
        <div key={day}><span style={{ height: `${(counts[i] / max) * 100}%` }} /><small>{day}</small></div>
      ))}
    </div>
  );
}

export function HourBars({ hours }: { hours: { hour: number; count: number }[] }) {
  if (!hours.length) return null;
  const first = Math.min(...hours.map((h) => h.hour));
  const last = Math.max(...hours.map((h) => h.hour));
  const slots = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const counts = new Map(hours.map((h) => [h.hour, h.count]));
  const max = Math.max(1, ...hours.map((h) => h.count));
  const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return (
    <div className="va-hours" role="img" aria-label={`Requested times: ${hours.map((h) => `${hourLabel(h.hour)} ${h.count}`).join(', ')}`}>
      {slots.map((h) => (
        <div key={h}><span style={{ height: `${((counts.get(h) || 0) / max) * 100}%` }} /><small>{hourLabel(h)}</small></div>
      ))}
    </div>
  );
}
