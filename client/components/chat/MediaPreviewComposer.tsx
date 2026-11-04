import React, { useState } from 'react';

// The photos waiting to be sent (up to 4), over the conversation, with one
// caption. The caption is this component's own state, so typing re-renders
// only the preview, not the whole conversation.

export default function MediaPreviewComposer({ images, maxImages, sending, onCancel, onSend, onRemove, onAdd }: {
  /** Local URLs of the chosen photos, in sending order. */
  images: string[];
  maxImages: number;
  sending: boolean;
  onCancel: () => void;
  onSend: (caption: string) => void;
  onRemove: (index: number) => void;
  /** Opens the photo picker to add more. */
  onAdd: () => void;
}) {
  const [caption, setCaption] = useState('');
  const [selected, setSelected] = useState(0);
  const send = () => { if (!sending) onSend(caption); };
  const shown = Math.min(selected, images.length - 1);

  return (
    <div
      className="chat-media-preview-composer"
      id="chatMediaPreviewModal"
      role="dialog"
      aria-label={images.length > 1 ? `Preview ${images.length} images to share` : 'Preview image to share'}
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
          src={images[shown] || undefined}
          alt="Selected image preview"
        />
      </div>
      {/* The chosen photos: pick one to view, remove it, or add more (up to the limit) */}
      <div className="chat-media-preview-strip" role="list" aria-label="Photos to send">
        {images.map((url, index) => (
          <div key={url} className={`chat-media-preview-thumb${index === shown ? ' is-selected' : ''}`} role="listitem">
            <button type="button" className="chat-media-preview-thumb-view" aria-label={`View photo ${index + 1}`} aria-pressed={index === shown} onClick={() => setSelected(index)}>
              <img src={url} alt="" />
            </button>
            <button
              type="button"
              className="chat-media-preview-thumb-remove"
              aria-label={`Remove photo ${index + 1}`}
              onClick={() => { onRemove(index); setSelected((current) => Math.max(0, current > index ? current - 1 : current)); }}
            >
              <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
            </button>
          </div>
        ))}
        {images.length < maxImages && (
          <button type="button" className="chat-media-preview-add" aria-label="Add photos" title={`Add photos (up to ${maxImages})`} onClick={onAdd}>
            <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg>
          </button>
        )}
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
          aria-label={images.length > 1 ? `Send ${images.length} photos` : 'Send photo'}
          title={images.length > 1 ? `Send ${images.length} photos` : 'Send photo'}
          disabled={sending}
          onClick={send}
        >
          <svg className="icon" aria-hidden="true"><use href="#i-send" /></svg>
        </button>
      </div>
    </div>
  );
}
