import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_MEDIA, isVideoFile } from '../../lib/listWizard/api';

// Step 3's photo and video picker, the preview tiles (drag to reorder, first
// is the cover) and the click-to-preview lightbox (unchanged from
// legacy-pages/list.html). Object URLs are released when a file leaves the
// list or the page unmounts; the lightbox stops its video on close.

/** One object URL per file, revoked when the file goes away. */
export function useObjectUrls(files: File[]): Map<File, string> {
  const cache = useRef(new Map<File, string>());
  const urls = useMemo(() => {
    const next = new Map<File, string>();
    files.forEach((file) => next.set(file, cache.current.get(file) || URL.createObjectURL(file)));
    cache.current.forEach((url, file) => { if (!next.has(file)) URL.revokeObjectURL(url); });
    cache.current = next;
    return next;
  }, [files]);
  useEffect(() => () => { cache.current.forEach((url) => URL.revokeObjectURL(url)); cache.current = new Map(); }, []);
  return urls;
}

export type LightboxItem = { url: string; video: boolean } | null;

export function PhotoLightbox({ item, onClose }: { item: LightboxItem; onClose: () => void }) {
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);
  return (
    <div className={`photo-lightbox${item ? ' show' : ''}`} id="photo-lightbox" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <button type="button" className="photo-lightbox-close" id="photo-lightbox-close" aria-label="Close preview" onClick={onClose}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
      {/* Unmounting the media on close stops a playing video. */}
      <div className="photo-lightbox-media" id="photo-lightbox-media">
        {item && (item.video ? <video src={item.url} controls autoPlay playsInline /> : <img src={item.url} alt="Preview" />)}
      </div>
    </div>
  );
}

export function MediaPicker({ files, urls, existingPhotos, editMode, hint, error, onAdd, onRemove, onMove, onPreview }: {
  files: File[];
  urls: Map<File, string>;
  existingPhotos: Array<{ url: string }>;
  editMode: boolean;
  hint: string;
  error: string | null;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onPreview: (item: LightboxItem) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  // list.html drew the tiles (and the Add tile) only once a file had been chosen or removed.
  const [drawn, setDrawn] = useState(files.length > 0);
  useEffect(() => { if (files.length) setDrawn(true); }, [files.length]);
  const dropzoneText = editMode ? 'Photos are locked while editing this listing'
    : files.length === 0 ? 'Click to choose photos or videos, or drag them here'
      : `${files.length} of ${MAX_MEDIA} photos/videos selected — drag to reorder, first is the cover`;

  return (
    <div className="field">
      <p className="photo-hint" id="photo-hint">{hint}</p>
      <label
        className={`photo-dropzone${dragOver ? ' dragover' : ''}`}
        id="photo-dropzone"
        htmlFor="photo-input"
        aria-disabled={editMode ? 'true' : undefined}
        onDragOver={(event) => { if (editMode) return; event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => { event.preventDefault(); setDragOver(false); if (!editMode) { setDrawn(true); onAdd(Array.from(event.dataTransfer.files)); } }}
      >
        <span id="dropzone-text">{dropzoneText}</span>
        <input
          ref={input}
          type="file"
          id="photo-input"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
          multiple
          disabled={editMode}
          onChange={(event) => { setDrawn(true); onAdd(Array.from(event.target.files || [])); event.target.value = ''; }}
        />
      </label>
      <p className={`photo-error${error ? ' show' : ''}`} id="photo-error">{error || ''}</p>
      <div className="photo-preview-grid" id="photo-preview">
        {editMode ? existingPhotos.map((photo, index) => (
          <div className="photo-thumb" data-index={index} key={photo.url} onClick={() => onPreview({ url: photo.url, video: false })}>
            <img src={photo.url} alt={index === 0 ? 'Existing listing cover photo' : 'Existing listing photo'} />
            {index === 0 && <span className="cover-tag">Cover</span>}
          </div>
        )) : (
          <>
            {files.map((file, index) => {
              const url = urls.get(file) || '';
              return (
                <div
                  key={`${file.name}:${file.size}:${file.lastModified}`}
                  className={`photo-thumb${overIndex === index ? ' drag-over' : ''}`}
                  draggable
                  data-index={index}
                  onClick={() => onPreview({ url, video: isVideoFile(file) })}
                  onDragStart={() => { dragFrom.current = index; }}
                  onDragOver={(event) => { event.preventDefault(); setOverIndex(index); }}
                  onDragLeave={() => setOverIndex(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setOverIndex(null);
                    const from = dragFrom.current;
                    dragFrom.current = null;
                    if (from === null || from === index) return;
                    onMove(from, index);
                  }}
                >
                  {isVideoFile(file)
                    ? <video src={url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <img src={url} alt="Selected photo" />}
                  {index === 0 && <span className="cover-tag">Cover</span>}
                  <button type="button" className="remove-photo" data-index={index} aria-label="Remove photo" onClick={(event) => { event.stopPropagation(); onRemove(index); }}>&times;</button>
                </div>
              );
            })}
            {drawn && files.length < MAX_MEDIA && (
              <button type="button" className="photo-thumb add-tile" aria-label="Add another photo or video" onClick={() => input.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg><span>Add</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
