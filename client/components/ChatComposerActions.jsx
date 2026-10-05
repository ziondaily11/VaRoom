import { Liquid } from 'liquid-gooey';

function Icon({ name }) {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export default function ChatComposerActions() {
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
      <Liquid.Item>
        <button className="share-photo">
          <Icon name="image" />
        </button>
      </Liquid.Item>
      <Liquid.Item>
        <button className="share-file">
          <Icon name="paperclip" />
        </button>
      </Liquid.Item>
      <Liquid.Item>
        <button type="button" title="Share listing" aria-label="Share listing">
          <Icon name="share" />
        </button>
      </Liquid.Item>
      <Liquid.Item>
        <button className="send-message" type="button" title="Send message" aria-label="Send message" aria-disabled="true">
          <Icon name="send" />
        </button>
      </Liquid.Item>
    </Liquid>
  );
}
