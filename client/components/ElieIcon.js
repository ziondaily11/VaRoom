import React from 'react';
import { BotAvatar } from 'bot-avatars';

const ElieIcon = React.forwardRef(function ElieIcon(
  {
    size = 24,
    className = 'elie-icon',
    type = 'drop',
    face = 'mouth',
    state = 'default',
    ...props
  },
  ref
) {
  return (
    <BotAvatar
      ref={ref}
      className={className}
      type={type}
      face={face}
      state={state}
      size={size}
      {...props}
    />
  );
});

export default ElieIcon;
