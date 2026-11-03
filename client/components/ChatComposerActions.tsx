import { Liquid } from 'liquid-gooey';
import React, { useEffect, useRef, useState } from 'react';

function Icon({ name }: { name: string }) {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export interface ChatComposerActionsProps {
  isElie: boolean;
  canSend: boolean;
  role: 'host' | 'client' | null;
  onSend: () => void;
  onPhotoClick: () => void;
  onFileClick: () => void;
  onMobileAttach: () => void;
  onShareListing: () => void;
}

// Clients share photos only; hosts also share files and listings (legacy rule).
export default function ChatComposerActions({ isElie, onSend, onPhotoClick, onFileClick, onMobileAttach, onShareListing, canSend, role }: ChatComposerActionsProps) {
  const isHost = role === 'host';
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareMenuAnchorRef = useRef<HTMLDivElement>(null);
  const shareMenuToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!shareMenuOpen) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!shareMenuAnchorRef.current?.contains(event.target as Node)) {
        setShareMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
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
          <button
            className="send-message"
            type="button"
            title="Send message"
            aria-label="Send message"
            aria-disabled={!canSend}
            onClick={canSend ? onSend : undefined}
          >
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
        <button
          className="mobile-attach"
          type="button"
          title="More actions"
          aria-label={isHost ? 'Attach photos, files or a listing' : 'Add photos'}
          aria-haspopup="menu"
          aria-expanded={false}
          aria-controls="mobileAttachMenu"
          onClick={onMobileAttach}
        >
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
            <button
              className="share-photo"
              type="button"
              role="menuitem"
              aria-label="Share photo"
              aria-hidden={!shareMenuOpen}
              tabIndex={shareMenuOpen ? 0 : -1}
              onClick={() => { onPhotoClick(); closeShareMenu(); }}
            >
              <Icon name="image" />
            </button>
          </Liquid.Item>
          <Liquid.Item x={0} y={shareMenuOpen ? -64 : 0} transition="bouncy" delay={40} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: shareMenuOpen ? 'auto' : 'none' }}>
            <button
              className="share-file"
              type="button"
              hidden={!isHost}
              role="menuitem"
              aria-label="Share file"
              aria-hidden={!shareMenuOpen}
              tabIndex={shareMenuOpen ? 0 : -1}
              onClick={() => { onFileClick(); closeShareMenu(); }}
            >
              <Icon name="paperclip" />
            </button>
          </Liquid.Item>
          <Liquid.Item x={shareMenuOpen ? 54 : 0} y={shareMenuOpen ? -34 : 0} transition="bouncy" delay={80} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: shareMenuOpen ? 'auto' : 'none' }}>
            <button
              type="button"
              title="Share listing"
              aria-label="Share listing"
              role="menuitem"
              hidden={!isHost}
              aria-hidden={!shareMenuOpen}
              tabIndex={shareMenuOpen ? 0 : -1}
              onClick={() => { onShareListing(); closeShareMenu(); }}
            >
              <Icon name="share" />
            </button>
          </Liquid.Item>
        </Liquid>
      </div>
      <Liquid.Item className="composer-mobile-send-item">
        <button
          className="send-message"
          type="button"
          title="Send message"
          aria-label="Send message"
          aria-disabled={!canSend}
          onClick={canSend ? onSend : undefined}
        >
          <Icon name="send" />
        </button>
      </Liquid.Item>
    </Liquid>
  );
}
