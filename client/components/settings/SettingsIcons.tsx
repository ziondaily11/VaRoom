import React from 'react';

// Icons used across Settings, unchanged from legacy-pages/settings.html.

const icon = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export const ChevronRight = ({ size = 18 }: { size?: number }) => icon(size, <path d="m9 18 6-6-6-6" />);
export const BackChevron = () => icon(20, <path d="m15 18-6-6 6-6" />);
export const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
);
export const MenuIcon = () => icon(22, <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>);

export const CAT_ICONS: Record<string, React.ReactNode> = {
  account: icon(20, <><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></>),
  notifications: icon(20, <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>),
  display: icon(20, <><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>),
  privacy: icon(20, <><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" /></>),
  support: icon(20, <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 3.5" /><path d="M12 17h.01" /></>),
  'login-accounts': icon(20, <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>),
  payments: icon(20, <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></>),
};

export const INFO_ICONS = {
  user: icon(16, <><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></>),
  mail: icon(16, <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>),
  phone: icon(16, <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />),
  lock: icon(16, <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  alert: icon(16, <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>),
  trash: icon(16, <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />),
  help: icon(16, <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 3.5" /><path d="M12 17h.01" /></>),
  chat: icon(16, <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" />),
  warning: icon(16, <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></>),
  shield: icon(16, <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" />),
  file: icon(16, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></>),
};

export const LockLarge = () => icon(20, <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>);
export const EyeIcon = () => icon(17, <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>);
export const EyeOffIcon = () => icon(17, <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></>);

export const THEME_ICONS = {
  light: icon(16, <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  dark: icon(16, <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />),
  system: icon(16, <><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>),
};

/** The section header with its back button (to the list on phones). */
export function DetailHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="detail-head">
      <button type="button" className="detail-back" onClick={onBack}><BackChevron /></button>
      <span className="detail-title">{title}</span>
    </div>
  );
}

/** An info row: icon, label and value, optionally a chevron (clickable). */
export function InfoRow({ icon: rowIcon, label, value, danger, onClick, id, valueStyle }: {
  icon: React.ReactNode; label: string; value?: React.ReactNode; danger?: boolean; onClick?: () => void; id?: string; valueStyle?: React.CSSProperties;
}) {
  return (
    <div className={`info-row${onClick ? ' clickable' : ''}${danger ? ' danger' : ''}`} id={id} onClick={onClick}>
      <span className="info-icon">{rowIcon}</span>
      <span className="info-main">
        <span className="info-label">{label}</span>
        {value !== undefined && <span className="info-value" style={valueStyle}>{value}</span>}
      </span>
      {onClick && <span className="info-chevron"><ChevronRight size={16} /></span>}
    </div>
  );
}
