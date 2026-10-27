import React from 'react';

export interface ElieIconProps {
  size?: number | string;
  className?: string;
  type?: string;
  face?: string;
  state?: string;
  'aria-label'?: string;
  [key: string]: any;
}

declare const ElieIcon: React.ForwardRefExoticComponent<ElieIconProps & React.RefAttributes<any>>;
export default ElieIcon;
