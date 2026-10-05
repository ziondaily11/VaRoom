import { Liquid } from 'liquid-gooey';
import { useEffect, useRef, useState } from 'react';

function Icon({ name }) {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export default function ChatComposerActions() {
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareMenuAnchorRef = useRef(null);
  const shareMenuToggleRef = useRef(null);

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

  return (
    <Liquid
      className="chat-control-liquid"
      blur={6}
      contrast={18}
      fill="var(--composer-liquid-fill, #fff)"
      shadow="0 1px 2px rgba(20,22,28,.05)"
    >
      <Liquid.Item>
        <button className="mobile-plus" type="button" title="Emoji and stickers" aria-label="Emoji and stickers">
          <Icon name="sticker" />
        </button>
      </Liquid.Item>
      <Liquid.Item>
        <button className="mobile-attach" type="button" title="Attach" aria-label="Add photos" aria-haspopup="menu" aria-expanded="false">
          <Icon name="paperclip" />
        </button>
      </Liquid.Item>
      <div className="composer-desktop-action-anchor" ref={shareMenuAnchorRef}>
        <Liquid.Item>
          <button
            className="composer-actions-toggle"
            type="button"
            title="More sharing actions"
            aria-label="More sharing actions"
            aria-haspopup="menu"
            aria-expanded={shareMenuOpen}
            aria-controls="composerShareMenu"
            ref={shareMenuToggleRef}
            onClick={() => setShareMenuOpen((open) => !open)}
          >
            <Icon name="plus" />
          </button>
        </Liquid.Item>
        <div
          className="composer-share-menu"
          id="composerShareMenu"
          role="menu"
          aria-label="Sharing actions"
          hidden={!shareMenuOpen}
        >
          <Liquid.Item>
            <button className="share-photo" type="button" role="menuitem" aria-label="Share photo" onClick={closeShareMenu}>
              <Icon name="image" />
            </button>
          </Liquid.Item>
          <Liquid.Item>
            <button className="share-file" type="button" role="menuitem" aria-label="Share file" onClick={closeShareMenu}>
              <Icon name="paperclip" />
            </button>
          </Liquid.Item>
          <Liquid.Item>
            <button type="button" title="Share listing" aria-label="Share listing" role="menuitem" onClick={closeShareMenu}>
              <Icon name="share" />
            </button>
          </Liquid.Item>
        </div>
      </div>
      <Liquid.Item>
        <button className="send-message" type="button" title="Send message" aria-label="Send message" aria-disabled="true">
          <Icon name="send" />
        </button>
      </Liquid.Item>
    </Liquid>
  );
}
