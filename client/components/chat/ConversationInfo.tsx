import React from 'react';
import type { ChatConversation, ChatMessage } from '../../lib/chatCache';
import type { ChatApi } from '../../lib/chat/chatMedia';
import { AttachmentThumb } from './MessageMedia';

// The information column for a person-to-person conversation (ported from
// public/js/chat-data.js renderProfile and renderInfoAttachments): profile,
// details, the six latest photos, files, and the report and block actions.
// Same classes as legacy, styled by chats.css.

export const INFO_MEDIA_LIMIT = 6;

/** Photos (latest six) and files shared in the thread; voice notes are not listed. */
export function infoAttachments(messages: ChatMessage[]): { photos: ChatMessage[]; files: ChatMessage[] } {
  const withAttachment = messages.filter((m) => !m.deleted_at && (m.attachment_id || m.attachment) && m.message_type !== 'voice' && !String(m.id).startsWith('optimistic-'));
  return {
    photos: withAttachment.filter((m) => m.message_type === 'photo' || m.attachment?.kind === 'photo').slice(-INFO_MEDIA_LIMIT).reverse(),
    files: withAttachment.filter((m) => m.message_type === 'file' || m.attachment?.kind === 'file').reverse(),
  };
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function ConversationInfo({ conversation, avatar, online, messages, api, onOpenImage, onOpenFile, archived, onArchive, onReport, onBlock }: {
  conversation: ChatConversation;
  /** The avatar element (shared with the inbox). */
  avatar: React.ReactNode;
  /** null until presence has synced. */
  online: boolean | null;
  messages: ChatMessage[];
  api: ChatApi;
  onOpenImage: (url: string, alt: string) => void;
  onOpenFile: (attachmentId: string) => void;
  archived: boolean;
  onArchive: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  const person = conversation.participant || null;
  const name = person?.full_name || person?.username || '';
  const { photos, files } = infoAttachments(messages);
  const memberSince = conversation.created_at
    ? new Date(conversation.created_at).toLocaleDateString([], { month: 'short', year: 'numeric' })
    : '';
  const localTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="profile-block">
        {/* The legacy 76px circle; the avatar fills it. */}
        <div className="avatar-fallback" style={{ background: '#14161c', overflow: 'hidden' }}>
          {avatar || initials(name)}
        </div>
        <div className="p-name">{name}</div>
        {person?.username && <div className="p-line">@{person.username}</div>}
        {online !== null && (
          <div className={`profile-status${online ? ' online' : ''}`}>
            <span className="dot" />
            <span>{online ? 'Online' : 'Offline'}</span>
          </div>
        )}
      </div>

      <section className="info-section profile-details">
        <div className="info-section-head"><span className="label">Details</span></div>
        <div className="detail-list">
          {person?.phone && (
            <div className="detail-row"><svg className="icon"><use href="#i-phone" /></svg><span>Phone</span><span className="detail-value">{person.phone}</span></div>
          )}
          {memberSince && (
            <div className="detail-row"><svg className="icon"><use href="#i-calendar" /></svg><span>Member since</span><span className="detail-value">{memberSince}</span></div>
          )}
          <div className="detail-row"><svg className="icon"><use href="#i-clock" /></svg><span>Local time</span><span className="detail-value">{localTime}</span></div>
        </div>
      </section>

      {photos.length > 0 && (
        <div className="info-section info-media-section">
          <div className="info-section-head"><span className="label">Media</span></div>
          <div className="media-grid">
            {photos.map((m) => (
              <div key={m.id} className="thumb">
                <AttachmentThumb
                  attachmentId={(m.attachment_id || m.attachment?.id) as string}
                  alt={m.attachment?.original_filename || ''}
                  api={api}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onOpen={onOpenImage}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="info-section info-files-section">
          <div className="info-section-head"><span className="label">Files</span></div>
          {files.map((m) => {
            const size = m.attachment?.file_size_bytes || m.attachment?.file_size;
            return (
              <div
                key={m.id}
                className="file-row"
                role="button"
                tabIndex={0}
                onClick={() => onOpenFile((m.attachment_id || m.attachment?.id) as string)}
                onKeyDown={(event) => { if (event.key === 'Enter') onOpenFile((m.attachment_id || m.attachment?.id) as string); }}
              >
                <div className="f-icon" style={{ background: '#e5f0ff', color: '#3b7ce0' }}><svg className="icon"><use href="#i-file-text" /></svg></div>
                <div>
                  <div className="f-name">{m.attachment?.original_filename || m.body || ''}</div>
                  <div className="f-sub">{size ? `${Math.ceil(Number(size) / 1024)} KB` : ''}</div>
                </div>
                <svg className="icon f-dl"><use href="#i-download" /></svg>
              </div>
            );
          })}
        </div>
      )}

      <div className="info-section chat-actions">
        <div className="info-section-head"><span className="label">Actions</span></div>
        <button type="button" className="info-action info-action-archive" onClick={onArchive}>
          <svg className="icon"><use href="#i-archive" /></svg> {archived ? 'Unarchive chat' : 'Archive chat'}
        </button>
        <button type="button" className="info-action info-action-report" onClick={onReport}>
          <svg className="icon"><use href="#i-flag" /></svg> Report User
        </button>
        <button type="button" className="info-action info-action-block" onClick={onBlock}>
          <svg className="icon"><use href="#i-ban" /></svg> Block User
        </button>
      </div>
    </>
  );
}
