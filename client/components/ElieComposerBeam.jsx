import React, { useEffect, useState } from 'react';
import { BorderBeam } from 'border-beam';

export default function ElieComposerBeam({ isElie: initialIsElie } = {}) {
  const [isElie, setIsElie] = useState(() => {
    if (typeof initialIsElie === 'boolean') return initialIsElie;
    if (typeof window === 'undefined') return false;
    return (
      document.querySelector('.chat-input-area')?.classList.contains('is-elie') ||
      document.querySelector('.chat-col')?.classList.contains('is-elie') ||
      document.querySelector('.chat-col')?.getAttribute('data-conversation-type') === 'elie' ||
      window.location.pathname === '/elie' ||
      new URLSearchParams(window.location.search).get('c') === 'elie'
    );
  });

  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    if (typeof initialIsElie === 'boolean') {
      setIsElie(initialIsElie);
      return;
    }

    const checkElieState = () => {
      const active =
        document.querySelector('.chat-input-area')?.classList.contains('is-elie') ||
        document.querySelector('.chat-col')?.classList.contains('is-elie') ||
        document.querySelector('.chat-col')?.getAttribute('data-conversation-type') === 'elie' ||
        window.location.pathname === '/elie' ||
        new URLSearchParams(window.location.search).get('c') === 'elie';
      setIsElie(Boolean(active));

      const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      setTheme(currentTheme);
    };

    checkElieState();

    const handleActiveConversationChanged = (event) => {
      if (event?.detail && typeof event.detail.isElie === 'boolean') {
        setIsElie(event.detail.isElie);
      } else {
        checkElieState();
      }
    };

    window.addEventListener('varoom:active-conversation-changed', handleActiveConversationChanged);
    window.addEventListener('popstate', checkElieState);

    const chatCol = document.querySelector('.chat-col');
    const composer = document.querySelector('.chat-input-area');
    let observer;
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => checkElieState());
      if (chatCol) observer.observe(chatCol, { attributes: true, attributeFilter: ['class', 'data-conversation-type'] });
      if (composer) observer.observe(composer, { attributes: true, attributeFilter: ['class', 'data-composer-mode'] });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    return () => {
      window.removeEventListener('varoom:active-conversation-changed', handleActiveConversationChanged);
      window.removeEventListener('popstate', checkElieState);
      if (observer) observer.disconnect();
    };
  }, [initialIsElie]);

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
