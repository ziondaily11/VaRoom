import React, { useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  deleteQuickReply, QUICK_REPLY_BODY_MAX, QUICK_REPLY_MAX, QUICK_REPLY_TITLE_MAX, quickReplyProblem, saveQuickReply, type QuickReply,
} from '../../lib/chat/quickReplies';
import { useQuickReplies } from './useQuickReplies';

// Chat Settings → Quick replies: add, edit and delete saved answers (at most
// QUICK_REPLY_MAX). They are used in the composer with "/" or its button.

type Draft = { id?: string; title: string; body: string };

export default function QuickRepliesEditor({ userId }: { userId: string | null }) {
  const replies = useQuickReplies(userId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    const client = getSupabaseClient();
    if (!client || !userId || busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!draft) return;
    const problem = quickReplyProblem(draft.title, draft.body);
    if (problem) { setError(problem); return; }
    void run(async () => { await saveQuickReply(getSupabaseClient()!, userId!, draft); setDraft(null); });
  };
  const remove = (reply: QuickReply) => {
    if (!window.confirm(`Delete the quick reply “${reply.title}”?`)) return;
    void run(() => deleteQuickReply(getSupabaseClient()!, userId!, reply.id));
  };

  const form = draft && (
    <div className="cs-qr-form">
      <input className="cs-qr-input" placeholder="Title, e.g. Check-in time" aria-label="Quick reply title" maxLength={QUICK_REPLY_TITLE_MAX} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
      <textarea className="cs-qr-input" rows={3} placeholder="The reply, e.g. Check-in is from 2pm…" aria-label="Quick reply text" maxLength={QUICK_REPLY_BODY_MAX} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
      <div className="cs-qr-actions">
        <button type="button" className="cs-qr-btn" onClick={() => { setDraft(null); setError(''); }}>Cancel</button>
        <button type="button" className="cs-qr-btn cs-qr-btn--primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );

  return (
    <div className="cs-qr">
      <p className="cs-row__desc">Save answers you send often. In a chat, type “/” or use the quick-reply button to add one.</p>
      {replies.map((reply) => (draft && draft.id === reply.id ? <React.Fragment key={reply.id}>{form}</React.Fragment> : (
        <div key={reply.id} className="cs-qr-item">
          <div className="cs-row__text">
            <span className="cs-row__label">{reply.title}</span>
            <p className="cs-row__desc cs-qr-snippet">{reply.body}</p>
          </div>
          <button type="button" className="cs-qr-btn" onClick={() => { setDraft({ ...reply }); setError(''); }}>Edit</button>
          <button type="button" className="cs-qr-btn cs-qr-btn--danger" aria-label={`Delete ${reply.title}`} onClick={() => remove(reply)}>Delete</button>
        </div>
      )))}
      {draft && !draft.id && form}
      {error && <p className="cs-qr-error" role="alert">{error}</p>}
      {!draft && replies.length < QUICK_REPLY_MAX && (
        <button type="button" className="cs-qr-add" onClick={() => setDraft({ title: '', body: '' })}>+ Add quick reply</button>
      )}
      {replies.length >= QUICK_REPLY_MAX && <p className="cs-row__desc">You have {QUICK_REPLY_MAX} quick replies, the most you can keep.</p>}
    </div>
  );
}
