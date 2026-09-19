import { useState } from 'react';

const loadingFrameStyle = {
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  background: '#050505',
};

const spinnerStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: 26,
  height: 26,
  margin: '-13px 0 0 -13px',
  border: '2px solid rgba(255, 255, 255, 0.2)',
  borderTopColor: 'rgba(255, 255, 255, 0.85)',
  borderRadius: '50%',
  animation: 'varoom-video-react-spin 0.8s linear infinite',
  pointerEvents: 'none',
};

const errorStyle = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  color: '#d0d0d0',
  background: '#111',
  fontSize: 12,
  textAlign: 'center',
};

export default function VideoMedia({ src, title, className, style, ...videoProps }) {
  const [state, setState] = useState('loading');
  const isLoading = state === 'loading';

  return (
    <div
      className={className}
      style={{ ...loadingFrameStyle, ...style }}
      data-video-state={state}
    >
      <video
        {...videoProps}
        src={src}
        aria-label={title}
        onLoadedMetadata={(event) => {
          videoProps.onLoadedMetadata?.(event);
        }}
        onCanPlay={(event) => {
          setState('ready');
          videoProps.onCanPlay?.(event);
        }}
        onPlaying={(event) => {
          setState('ready');
          videoProps.onPlaying?.(event);
        }}
        onWaiting={(event) => {
          setState('loading');
          videoProps.onWaiting?.(event);
        }}
        onError={(event) => {
          setState('error');
          videoProps.onError?.(event);
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          background: '#050505',
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 160ms ease',
        }}
      />
      {isLoading && <span style={spinnerStyle} role="status" aria-label="Loading video" />}
      {state === 'error' && <div style={errorStyle}>Video unavailable</div>}
      <style>{'@keyframes varoom-video-react-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
