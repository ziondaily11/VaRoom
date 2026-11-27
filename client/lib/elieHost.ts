import { ApiError, apiFetch } from './api';

// Host Elie (server/lib/elieHost.js): Elie's away answers, @reply, reply
// drafts and "Write with Elie" are for plans that include Elie, each using
// one of the host's monthly Elie actions.

export interface ElieHostUsage { included: boolean; used: number; limit: number; plansUrl: string }

/** Why the server refused an Elie action (no plan with Elie, or the month's actions are used). */
export interface ElieHostDenial { reason: 'plan' | 'limit'; used: number; limit: number; plansUrl: string }

export type ElieWriteField = 'summary' | 'description';

export function elieHostDenial(error: unknown): ElieHostDenial | null {
  if (!(error instanceof ApiError)) return null;
  const elie = error.body.elie as Partial<ElieHostDenial> | undefined;
  return elie && (elie.reason === 'plan' || elie.reason === 'limit')
    ? { reason: elie.reason, used: Number(elie.used) || 0, limit: Number(elie.limit) || 0, plansUrl: elie.plansUrl || '/pricing' }
    : null;
}

/** The usage line in Chat Settings. */
export function elieUsageText(usage: ElieHostUsage): string {
  return usage.included
    ? `Elie answers guests while you’re away · ${usage.used} of ${usage.limit} Elie actions this month`
    : 'Your away message is sent. Elie’s answers come with plans that include Elie.';
}

export const fetchElieHostUsage = () => apiFetch<ElieHostUsage>('/api/elie/host');

/** Elie's reply to the guest, for the host to edit and send (not sent). */
export const requestElieDraft = (conversationId: string) =>
  apiFetch<{ reply: string; skipped: boolean }>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/draft`, { method: 'POST', body: {} });

/** Elie's automatic answer saved as a draft for the host (Chat Settings → Elie), or null. */
export const loadElieSavedDraft = (conversationId: string) =>
  apiFetch<{ draft: { reply: string; createdAt: string } | null }>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/elie-draft`).then((result) => result.draft);

export const discardElieSavedDraft = (conversationId: string) =>
  apiFetch<{ discarded: boolean }>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/elie-draft`, { method: 'DELETE' });

/** A summary highlight or description written from the listing's details (improving `current` when given). */
export const writeWithElie = (input: { field: ElieWriteField; category: string; facts: Record<string, string>; current: string }) =>
  apiFetch<{ text: string }>('/api/elie/write', { method: 'POST', body: input }).then((result) => result.text);
