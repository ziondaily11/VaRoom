import React from 'react';

const ELIE_PROFILE_IMAGE = '/assets/elielogo.jpg';

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
    <img
      ref={ref}
      className={classes}
      src={ELIE_PROFILE_IMAGE}
      alt={props['aria-label'] || ''}
      width={size}
      height={size}
      {...props}
    />
  );
});

export default ElieIcon;
