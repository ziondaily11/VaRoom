import React from 'react';

const ELIE_RED = '#D92D3F';

const ElieIcon = React.forwardRef(function ElieIcon(
  { size = 24, className = '', color = 'currentColor', ...props },
  ref
) {
  const classes = [
    ...new Set(
      ['elie-icon', className]
        .filter(Boolean)
        .flatMap((value) => value.split(/\s+/))
    ),
  ].join(' ');

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={classes}
      color={color}
      role={props['aria-label'] ? 'img' : undefined}
      aria-hidden={props['aria-label'] ? undefined : true}
      {...props}
    >
      <path
        d="M16 4.5V2.75"
        stroke={ELIE_RED}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16" cy="2.25" r="1.25" fill={ELIE_RED} />
      <rect
        x="4.25"
        y="6.25"
        width="23.5"
        height="20"
        rx="7"
        fill="#FFFFFF"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.75 13.25h22.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="11" cy="17.25" r="1.6" fill="currentColor" />
      <circle cx="21" cy="17.25" r="1.6" fill="currentColor" />
      <path
        d="M11.5 21c1.25 1 2.55 1.5 4.5 1.5s3.25-.5 4.5-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="6.5" cy="17.5" r="1" fill={ELIE_RED} />
      <circle cx="25.5" cy="17.5" r="1" fill={ELIE_RED} />
    </svg>
  );
});

export default ElieIcon;
