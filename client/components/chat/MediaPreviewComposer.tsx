import React, { useState } from 'react';

// The photo waiting to be sent, over the conversation, with its caption. The
// caption is this component's own state, so typing re-renders only the
// preview, not the whole conversation.

export default function MediaPreviewComposer({ imageUrl, sending, onCancel, onSend }: {
  imageUrl: string | null;
  sending: boolean;
  onCancel: () => void;
  onSend: (caption: string) => void;
}) {
  const [caption, setCaption] = useState('');
  const send = () => { if (!sending) onSend(caption); };

  return (
    <div
      className="chat-media-preview-composer"
      id="chatMediaPreviewModal"
      role="dialog"
      aria-label="Preview image to share"
    >
      <div className="chat-media-preview-header">
        <button
          type="button"
          className="chat-media-preview-close"
          id="chatMediaPreviewClose"
          aria-label="Cancel image share"
          title="Cancel"
          onClick={onCancel}
        >
          <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
        </button>
      </div>
      <div className="chat-media-preview-body">
        <img
          id="chatMediaPreviewImg"
          className="chat-media-preview-image"
          src={imageUrl || undefined}
          alt="Selected image preview"
        />
      </div>
      <div className="chat-media-preview-footer">
        <div className="chat-media-preview-caption-wrap">
          <input
            type="text"
            id="chatMediaPreviewCaption"
            className="chat-media-preview-caption-input"
            placeholder="Type a message"
            aria-label="Type a message"
            value={caption}
            autoFocus
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="chat-media-preview-send-btn"
          id="chatMediaPreviewSend"
          aria-label="Send photo"
          title="Send photo"
          disabled={sending}
          onClick={send}
        >
          <svg className="icon" aria-hidden="true"><use href="#i-send" /></svg>
        </button>
      </div>
    </div>
  );
}
