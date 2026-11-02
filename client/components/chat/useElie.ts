import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  ElieRequestError,
  askElie,
  createElieRecorder,
  elieEntryId,
  elieResponseEntries,
  listElieSessions,
  loadElieTurns,
  type ElieEntry,
  type ElieSessionSummary,
  type ElieTurn,
} from '../../lib/chat/elie';

// The Elie conversation: thread entries, the history sent with each question,
// saving turns to the user's search history, and loading past sessions.
// A newer action (new conversation, loaded session) makes in-flight replies stale.

export function useElie(userId: string | null) {
  const [entries, setEntries] = useState<ElieEntry[]>([]);
  const [thinking, setThinking] = useState(false);
  const historyRef = useRef<ElieTurn[]>([]);
  const generationRef = useRef(0);
  const recorderRef = useRef(createElieRecorder(null, null));

  const reset = useCallback(() => {
    generationRef.current += 1;
    historyRef.current = [];
    recorderRef.current = createElieRecorder(getSupabaseClient(), userId);
    setEntries([]);
    setThinking(false);
  }, [userId]);

  // A new account starts a new conversation.
  useEffect(() => { reset(); }, [reset]);

  // `retry`: ask the same question again without adding it to the thread,
  // the history or the saved session a second time.
  const send = useCallback(async (text: string, { retry = false }: { retry?: boolean } = {}) => {
    const question = text.trim();
    if (!question) return;
    const generation = generationRef.current;
    const recorder = recorderRef.current;
    if (!retry) {
      setEntries((prev) => [...prev, { id: elieEntryId(), kind: 'user', text: question }]);
      historyRef.current.push({ role: 'user', text: question });
      void recorder.record('user', question);
    }
    setThinking(true);
    try {
      const client = getSupabaseClient();
      const token = client ? (await client.auth.getSession()).data.session?.access_token ?? null : null;
      const data = await askElie({ message: question, history: historyRef.current, token });
      if (generation !== generationRef.current) return;
      if (data.reply) {
        historyRef.current.push({ role: 'elie', text: data.reply });
        void recorder.record('elie', data.reply);
      }
      if (data.suggestion) void recorder.record('elie', data.suggestion);
      setEntries((prev) => [...prev, ...elieResponseEntries(data)]);
    } catch (error) {
      if (generation !== generationRef.current) return;
      const message = error instanceof ElieRequestError ? error.message : 'Could not reach Elie. Please check your connection and try again.';
      setEntries((prev) => [...prev, { id: elieEntryId(), kind: 'error', text: message, retryText: question }]);
    } finally {
      if (generation === generationRef.current) setThinking(false);
    }
  }, []);

  /** Ask again after an error (the error row is replaced; legacy also repeated the question). */
  const retry = useCallback((entry: Extract<ElieEntry, { kind: 'error' }>) => {
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    void send(entry.retryText, { retry: true });
  }, [send]);

  const listSessions = useCallback(async (): Promise<ElieSessionSummary[]> => {
    const client = getSupabaseClient();
    if (!client || !userId) return [];
    return listElieSessions(client, userId);
  }, [userId]);

  /** Show a past session; new questions continue it. */
  const loadSession = useCallback(async (sessionId: string) => {
    const client = getSupabaseClient();
    if (!client) return;
    generationRef.current += 1;
    const generation = generationRef.current;
    setThinking(false);
    setEntries([]);
    try {
      const turns = await loadElieTurns(client, sessionId);
      if (generation !== generationRef.current) return;
      historyRef.current = turns.slice();
      recorderRef.current = createElieRecorder(client, userId);
      recorderRef.current.resume(sessionId);
      setEntries(turns.map((turn) => ({ id: elieEntryId(), kind: turn.role === 'user' ? 'user' : 'elie', text: turn.text } as ElieEntry)));
    } catch (error) {
      console.error('Unable to load the Elie session:', error);
      if (generation === generationRef.current) {
        setEntries([{ id: elieEntryId(), kind: 'error', text: 'Unable to load this search. Please try again.', retryText: '' }]);
      }
    }
  }, [userId]);

  return { entries, thinking, send, retry, reset, listSessions, loadSession };
}
