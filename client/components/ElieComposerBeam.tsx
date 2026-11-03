import React, { useEffect, useState } from 'react';
import { BorderBeam } from 'border-beam';

const currentTheme = (): 'dark' | 'light' => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

// The beam round the composer in Elie's conversation; follows the page theme.
export default function ElieComposerBeam({ isElie }: { isElie: boolean }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (typeof window === 'undefined' ? 'dark' : currentTheme()));

  useEffect(() => {
    if (!isElie || typeof MutationObserver === 'undefined') return undefined;
    setTheme(currentTheme());
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [isElie]);

  if (!isElie) return null;

  return (
    <div
      className="elie-composer-beam-container"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        borderRadius: 'inherit',
        overflow: 'hidden',
        zIndex: 1,
      }}
      aria-hidden="true"
    >
      <BorderBeam
        size="md"
        colorVariant="colorful"
        strength={0.7}
        active={isElie}
        theme={theme}
        borderRadius={16}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
        }}
      >
        <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
      </BorderBeam>
    </div>
  );
}
