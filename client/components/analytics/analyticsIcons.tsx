import type { ReactElement } from 'react';

// Line icons for the analytics tiles and cards (24px grid, 1.8 stroke).

const paths: Record<string, ReactElement> = {
  value: <><path d="M3 7.5h18v11H3z" /><path d="M3 10.5h18" /><circle cx="12" cy="14.5" r="1.8" /></>,
  money: <><circle cx="12" cy="12" r="8.5" /><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2.1 2.9.9 2.9 2.2-1.3 2-2.9 2c-1.3 0-2.4-.6-2.9-1.5M12 6.2v1.6M12 16.2v1.6" /></>,
  nights: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />,
  occupancy: <><path d="M3 18.5V9l9-5 9 5v9.5" /><path d="M7 18.5v-5h10v5M3 18.5h18" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  cancel: <><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M16 5.6a3 3 0 0 1 0 5.8M18.2 14.4c1.5.8 2.5 2.4 2.8 4.6" /></>,
  chat: <path d="M20.5 11.5a8 8 0 0 1-11.6 7.2L4 20l1.3-4.4A8 8 0 1 1 20.5 11.5Z" />,
  phone: <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />,
  heart: <path d="M12 20s-7.5-4.5-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.5 12 20 12 20Z" />,
  share: <><circle cx="17.5" cy="5.5" r="2.5" /><circle cx="6.5" cy="12" r="2.5" /><circle cx="17.5" cy="18.5" r="2.5" /><path d="m8.7 10.8 6.6-4M8.7 13.2l6.6 4" /></>,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.3 2.6 2.6 5-5.3" /></>,
  inbox: <><path d="M3.5 13.5 6 5.5h12l2.5 8v5h-17z" /><path d="M3.5 13.5h5l1.2 2.2h4.6l1.2-2.2h5" /></>,
  ruler: <><path d="M4 17 17 4l3 3L7 20z" /><path d="m8 13 1.5 1.5M11 10l1.5 1.5M14 7l1.5 1.5" /></>,
  percent: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.3" /><circle cx="17" cy="17" r="2.3" /></>,
  bolt: <path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z" />,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />,
  table: <><path d="M4 9h16M6 9v10M18 9v10M8.5 9l1-4h5l1 4" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  receipt: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8.5h6M9 12h6" /></>,
};

const KPI_ICON: Record<string, string> = {
  value: 'money', leaseValue: 'money', average: 'value', nightly: 'value', monthlyRent: 'key',
  nights: 'nights', stayLength: 'nights', occupancy: 'occupancy', utilisation: 'occupancy', daysBooked: 'calendar',
  lead: 'calendar', hours: 'clock', cancellation: 'cancel', bookingResponse: 'bolt', chatResponse: 'bolt',
  views: 'eye', viewers: 'users', enquiries: 'chat', contacts: 'phone', interest: 'heart', shares: 'share',
  enquiryRate: 'percent', requests: 'inbox', approved: 'check', leaseRequests: 'inbox', leaseApproved: 'check',
  leaseLength: 'ruler',
};

export function Icon({ name, size = 18, filled = false }: { name: string; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.value}
    </svg>
  );
}

export const kpiIcon = (key: string) => KPI_ICON[key] || 'value';
