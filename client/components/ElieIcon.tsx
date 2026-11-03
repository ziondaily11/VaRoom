import React from 'react';
import { BotAvatar, type BotAvatarProps } from 'bot-avatars';

export type ElieIconProps = BotAvatarProps;

const ElieIcon = React.forwardRef<HTMLCanvasElement, ElieIconProps>(function ElieIcon(
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
