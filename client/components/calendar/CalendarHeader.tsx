import React from 'react';
import { MONTH_NAMES } from '../../lib/booking/bookingListing';
import type { CalendarMode } from '../../lib/calendar/calendarView';
import ToggleRow from './ToggleRow';
import MenuButton from '../shell/MenuButton';

// The Calendar's header: a date tile (red month, day number), the full date,
// search, navigation (by day, week or month), the view switch (Day, Week,
// Month, Timeline) and the main actions. On screens narrower than 1280px it also
// opens the filters drawer and the overview panel.

const MODE_LABEL: Record<CalendarMode, string> = { day: 'Day', week: 'Week', month: 'Month', timeline: 'Timeline' };
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Props {
  day: string;
  monthTitle: string;
  mode: CalendarMode;
  modes: CalendarMode[];
  selecting: boolean;
  canSelect: boolean;
  canAdd: boolean;
  onMode: (mode: CalendarMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect: () => void;
  onAdd: () => void;
  onFilters: () => void;
  onOverview: () => void;
  search: React.ReactNode;
}

export default function CalendarHeader({ day, monthTitle, mode, modes, selecting, canSelect, canAdd, onMode, onPrev, onNext, onToday, onSelect, onAdd, onFilters, onOverview, search }: Props) {
  const date = new Date(`${day}T00:00:00Z`);
  const month = MONTH_NAMES[date.getUTCMonth()];
  return (
    <header className="vc-head">
      <div className="vc-head-date">
        <MenuButton />
        <div className="vc-tile" aria-hidden="true"><span>{month.slice(0, 3)}</span><strong>{date.getUTCDate()}</strong></div>
        <div>
          <h1>{`${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`}</h1>
          <p className="vc-muted">{WEEKDAY_NAMES[date.getUTCDay()]}</p>
        </div>
      </div>
      <div className="vc-head-tools">
        {search}
        <button type="button" className="vc-pill vc-only-narrow" onClick={onFilters}>Filters</button>
        <button type="button" className="vc-pill vc-only-narrow" onClick={onOverview}>Overview</button>
        <div className="vc-nav" role="group" aria-label={monthTitle}>
          <button type="button" aria-label={`Previous ${mode === 'timeline' ? 'month' : mode}`} onClick={onPrev}>‹</button>
          <button type="button" onClick={onToday}>Today</button>
          <button type="button" aria-label={`Next ${mode === 'timeline' ? 'month' : mode}`} onClick={onNext}>›</button>
        </div>
        {modes.length > 1 && (
          <ToggleRow label="View" activeKey={mode}>
            {modes.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => onMode(m)}>{MODE_LABEL[m]}</button>
            ))}
          </ToggleRow>
        )}
        {canSelect && (
          <button type="button" className={`vc-pill${selecting ? ' is-on' : ''}`} aria-pressed={selecting} onClick={onSelect}>
            {selecting ? 'Done selecting' : 'Select days'}
          </button>
        )}
        <button type="button" className="vc-pill is-primary vc-add" disabled={!canAdd} onClick={onAdd}>+ Add</button>
      </div>
    </header>
  );
}
