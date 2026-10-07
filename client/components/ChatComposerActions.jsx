import { Liquid } from 'liquid-gooey';
import { useEffect, useRef, useState } from 'react';

function Icon({ name }) {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export default function ChatComposerActions({ isElie: initialIsElie } = {}) {
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
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
  const shareMenuAnchorRef = useRef(null);
  const shareMenuToggleRef = useRef(null);

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
    if (typeof MutationObserver !== 'undefined' && (chatCol || composer)) {
      observer = new MutationObserver(() => checkElieState());
      if (chatCol) observer.observe(chatCol, { attributes: true, attributeFilter: ['class', 'data-conversation-type'] });
      if (composer) observer.observe(composer, { attributes: true, attributeFilter: ['class', 'data-composer-mode'] });
    }

    return () => {
      window.removeEventListener('varoom:active-conversation-changed', handleActiveConversationChanged);
      window.removeEventListener('popstate', checkElieState);
      if (observer) observer.disconnect();
    };
  }, [initialIsElie]);

  useEffect(() => {
    if (!shareMenuOpen) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (!shareMenuAnchorRef.current?.contains(event.target)) {
        setShareMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setShareMenuOpen(false);
      shareMenuToggleRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [shareMenuOpen]);

  const closeShareMenu = () => setShareMenuOpen(false);

  if (isElie) {
    return (
      <Liquid
        className="chat-control-liquid"
        blur={6}
        contrast={18}
        fill="var(--composer-liquid-fill, #fff)"
        shadow="0 1px 2px rgba(20,22,28,.05)"
      >
        <Liquid.Item className="composer-mobile-send-item">
          <button className="send-message" type="button" title="Send message" aria-label="Send message" aria-disabled="true">
            <Icon name="send" />
          </button>
        </Liquid.Item>
      </Liquid>
    );
  }

  return (
    <Liquid
      className="chat-control-liquid"
      blur={6}
      contrast={18}
      fill="var(--composer-liquid-fill, #fff)"
      shadow="0 1px 2px rgba(20,22,28,.05)"
    >
      <Liquid.Item className="composer-mobile-attach-item">
        <button className="mobile-attach" type="button" title="More actions" aria-label="Add photos" aria-haspopup="menu" aria-expanded="false" aria-controls="mobileAttachMenu">
          <Icon name="plus" />
        </button>
      </Liquid.Item>
      <div className="composer-desktop-action-anchor" ref={shareMenuAnchorRef}>
        <Liquid
          className="composer-share-group"
          id="composerShareMenu"
          role="menu"
          aria-label="Sharing actions"
          blur={6}
          contrast={18}
          fill="var(--bg-soft)"
          shadow="0 2px 6px rgba(0,0,0,.16)"
        >
          <Liquid.Item x={0} y={0} transition="bouncy" style={{ position: 'absolute', left: 0, top: 0 }}>
            <button
              className={`composer-actions-toggle${shareMenuOpen ? ' is-open' : ''}`}
              type="button"
              title={shareMenuOpen ? 'Close sharing actions' : 'More sharing actions'}
              aria-label={shareMenuOpen ? 'Close sharing actions' : 'More sharing actions'}
              aria-haspopup="menu"
              aria-expanded={shareMenuOpen}
              aria-controls="composerShareMenu"
              ref={shareMenuToggleRef}
              onClick={() => setShareMenuOpen((open) => !open)}
            >
              <Icon name={shareMenuOpen ? 'close' : 'plus'} />
            </button>
          </Liquid.Item>
          <Liquid.Item x={shareMenuOpen ? -54 : 0} y={shareMenuOpen ? -34 : 0} transition="bouncy" delay={10} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: shareMenuOpen ? 'auto' : 'none' }}>
            <button className="share-photo" type="button" role="menuitem" aria-label="Share photo" aria-hidden={!shareMenuOpen} tabIndex={shareMenuOpen ? 0 : -1} onClick={closeShareMenu}>
              <Icon name="image" />
            </button>
          </Liquid.Item>
          <Liquid.Item x={0} y={shareMenuOpen ? -64 : 0} transition="bouncy" delay={40} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: shareMenuOpen ? 'auto' : 'none' }}>
            <button className="share-file" type="button" role="menuitem" aria-label="Share file" aria-hidden={!shareMenuOpen} tabIndex={shareMenuOpen ? 0 : -1} onClick={closeShareMenu}>
              <Icon name="paperclip" />
            </button>
          </Liquid.Item>
          <Liquid.Item x={shareMenuOpen ? 54 : 0} y={shareMenuOpen ? -34 : 0} transition="bouncy" delay={80} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: shareMenuOpen ? 'auto' : 'none' }}>
            <button type="button" title="Share listing" aria-label="Share listing" role="menuitem" aria-hidden={!shareMenuOpen} tabIndex={shareMenuOpen ? 0 : -1} onClick={closeShareMenu}>
              <Icon name="share" />
            </button>
          </Liquid.Item>
        </Liquid>
      </div>
      <Liquid.Item className="composer-mobile-send-item">
        <button className="send-message" type="button" title="Send message" aria-label="Send message" aria-disabled="true">
          <Icon name="send" />
        </button>
      </Liquid.Item>
    </Liquid>
  );
}
