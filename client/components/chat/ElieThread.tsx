import React, { useEffect, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import ElieIcon from '../ElieIcon';
import { ListingEnquiryCard } from './MessageMedia';
import ElieText from './ElieText';
import ElieAmenities from './ElieAmenities';
import {
  ELIE_SUGGESTED_PROMPTS,
  elieListingSummary,
  formatElieHistoryDate,
  type ElieEntry,
  type ElieSessionSummary,
} from '../../lib/chat/elie';

// Elie's thread and search history (ported from public/js/chat-data.js:
// renderElieIntro, elieRow, appendElieResults, appendElieError and the
// history panel). Same classes as legacy, styled by chats.css.

function ElieAvatar({ working = false }: { working?: boolean }) {
  return (
    <span className="elie-message-avatar">
      <ElieIcon size={36} state={working ? 'working' : 'default'} aria-label="Elie, AI assistant" />
    </span>
  );
}

/** The first questions to try, below the composer before Elie's first question. */
export function ElieSuggestions({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  return (
    <div className="elie-suggestions elie-start-suggestions">
      {ELIE_SUGGESTED_PROMPTS.map((prompt) => (
        <button key={prompt} type="button" onClick={() => onPrompt(prompt)}>{prompt}</button>
      ))}
    </div>
  );
}

/** Elie's first screen: one short question at a time, each fading into the next. */
export const ELIE_START_LINES = [
  'What’s the occasion?',
  'Where are you headed?',
  'What space do you need?',
  'Planning a getaway?',
  'Need a venue for the big day?',
  'Looking for a new office?',
];
export const ELIE_START_LINE_MS = 3200;

function ElieIntro() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setLine((current) => (current + 1) % ELIE_START_LINES.length), ELIE_START_LINE_MS);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section className="elie-intro">
      {/* Screen readers hear one steady sentence; the key restarts the fade. */}
      <h2 aria-label="Ask Elie to find you a space."><span key={line} aria-hidden="true">{ELIE_START_LINES[line]}</span></h2>
    </section>
  );
}

export function ElieThread({ entries, thinking, waking = false, onRetry, onQuickReply, onShowMore }: {
  entries: ElieEntry[];
  thinking: boolean;
  /** The Elie service was asleep and is starting. */
  waking?: boolean;
  onRetry: (entry: Extract<ElieEntry, { kind: 'error' }>) => void;
  /** A tapped quick reply ("Yes"), sent as the next message. */
  onQuickReply?: (text: string) => void;
  /** "Show more" under a search's listings. */
  onShowMore?: (entry: Extract<ElieEntry, { kind: 'listings' }>) => void;
}) {
  const last = entries[entries.length - 1];
  return (
    <>
      {entries.length === 0 && !thinking && <ElieIntro />}
      {entries.map((entry) => {
        switch (entry.kind) {
          case 'user':
            return (
              <div key={entry.id} className="msg-row out elie-message">
                <div className="bubble">{entry.text}</div>
              </div>
            );
          case 'elie':
            return (
              <div key={entry.id} className="msg-row in elie-message">
                <ElieAvatar />
                <div className="elie-message-body">
                  <div className="bubble"><ElieText text={entry.text} /></div>
                  {/* Tap instead of typing; only under Elie's latest message. */}
                  {entry.quickReplies && entry === last && !thinking && onQuickReply && (
                    <div className="elie-quick-replies">
                      {entry.quickReplies.map((reply) => <button type="button" key={reply} onClick={() => onQuickReply(reply)}>{reply}</button>)}
                    </div>
                  )}
                </div>
              </div>
            );
          case 'question':
            // Asked in Elie's message above; answered in the card in place of the composer.
            return null;
          case 'news':
            return (
              <div key={entry.id} className="elie-results">
                {entry.items.map((item, index) => (
                  <a key={index} className="elie-result-card" href={item.source_url || '#'} target="_blank" rel="noopener noreferrer">
                    <strong>{item.title || 'Property news'}</strong>
                    <span>{item.summary || item.source_name || 'Read source'}</span>
                  </a>
                ))}
              </div>
            );
          case 'listings':
            return (
              // The same card as a listing asked about in a chat; an answer
              // about amenities adds the booking page's amenity grid under it.
              <React.Fragment key={entry.id}>
                <div className="elie-results elie-listing-results">
                  {entry.items.map((listing) => {
                    const card = <ListingEnquiryCard key={listing.id} listing={elieListingSummary(listing)} verified={Boolean(listing.verified)} />;
                    return entry.amenities ? (
                      <div key={listing.id} className="elie-listing-detail">
                        {card}
                        <ElieAmenities listing={listing} highlight={entry.amenities.highlight} />
                      </div>
                    ) : card;
                  })}
                </div>
                {entry.more && onShowMore && (
                  <div className="elie-more">
                    <button type="button" disabled={thinking} onClick={() => onShowMore(entry)}>
                      Show {Math.min(8, entry.more.remaining)} more
                    </button>
                  </div>
                )}
              </React.Fragment>
            );
          case 'error':
            return (
              <div key={entry.id} className="msg-row in elie-message elie-error-row">
                <ElieAvatar />
                <div className="bubble elie-error-bubble">
                  <div>{entry.text}</div>
                  {entry.retryText && (
                    <button
                      type="button"
                      className="elie-retry-btn"
                      aria-label="Retry searching with Elie"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, borderRadius: 12, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: 0.9 }}
                      onClick={() => onRetry(entry)}
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            );
          default:
            return null;
        }
      })}
      {thinking && (
        <div className="msg-row in elie-message">
          <ElieAvatar working />
          <div className="bubble elie-thinking-bubble">
            <div className="elie-thinking-pill" role="status" aria-label={waking ? 'Elie is waking up' : 'Elie is thinking'}>
              <span className="elie-thinking-orb-wrap" aria-hidden="true"><ThinkingOrb state="searching" size={20} theme="dark" /></span>
              <span className="elie-thinking-text">{waking ? 'Elie is waking up…' : 'Thinking....'}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The "Search history" panel: the user's last 30 Elie sessions. */
export function ElieHistoryPanel({ open, onClose, listSessions, onOpenSession, onNewSearch, ignoreSelector }: {
  open: boolean;
  onClose: () => void;
  listSessions: () => Promise<ElieSessionSummary[]>;
  onOpenSession: (sessionId: string) => void;
  /** Elie keeps the open search; a new one starts here. */
  onNewSearch: () => void;
  /** Presses on these elements (the toggles) do not count as "outside". */
  ignoreSelector: string;
}) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; sessions: ElieSessionSummary[] }>({ status: 'loading', sessions: [] });
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState({ status: 'loading', sessions: [] });
    listSessions()
      .then((sessions) => { if (!cancelled) setState({ status: 'ready', sessions }); })
      .catch((error) => {
        console.error('Failed to load Elie history:', error);
        if (!cancelled) setState({ status: 'error', sessions: [] });
      });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (panelRef.current && !panelRef.current.contains(target) && !target.closest(ignoreSelector)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <section ref={panelRef} className="elie-history-panel open" id="elieHistoryPanel" aria-label="Search history" aria-hidden={false}>
      <div className="elie-history-head">
        <div className="elie-history-title">
          <svg className="icon"><use href="#i-clock" /></svg>
          <span>Search history</span>
        </div>
        <button type="button" className="elie-history-close" id="elieHistoryClose" aria-label="Close search history" title="Close" onClick={onClose}>
          <svg className="icon"><use href="#i-close" /></svg>
        </button>
      </div>
      <div className="elie-history-list" id="elieHistoryList">
        <button type="button" className="elie-history-item elie-history-new" onClick={() => { onClose(); onNewSearch(); }}>
          <span className="elie-history-item-title">New search</span>
          <svg className="icon elie-history-item-arrow" aria-hidden="true"><use href="#i-plus" /></svg>
        </button>
        {state.status === 'loading' && <div className="elie-history-empty">Loading past searches…</div>}
        {state.status === 'error' && <div className="elie-history-empty">Unable to load search history.</div>}
        {state.status === 'ready' && state.sessions.length === 0 && <div className="elie-history-empty">No past searches yet.</div>}
        {state.status === 'ready' && state.sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className="elie-history-item"
            onClick={() => { onClose(); onOpenSession(session.id); }}
          >
            <div className="elie-history-item-copy">
              <span className="elie-history-item-title">{session.title || 'Search conversation'}</span>
              <span className="elie-history-item-time">{formatElieHistoryDate(session.updated_at || session.created_at)}</span>
            </div>
            <svg className="icon elie-history-item-arrow" aria-hidden="true"><use href="#i-chevron-right" /></svg>
          </button>
        ))}
      </div>
    </section>
  );
}
