import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ElieRequestError,
  askElie,
  createElieSession,
  elieEntryId,
  elieResponseEntries,
  elieTurnEntries,
  listElieSessions,
  loadElieTurns,
  saveElieTurns,
  type ElieEntry,
  type ElieSessionSummary,
  type ElieStoredTurn,
  type ElieTurn,
} from './elie';
import { fetchVcoins, type VcoinWallet } from './vcoins';

// Elie's conversation for the signed-in account, kept outside the Chats page:
// opening another chat or another page and coming back keeps the thread, and a
// question still being answered lands when its answer arrives. The Elie
// service saves each answered question to the session, so after a reload or a
// closed window the open search is reloaded, and an answer still on its way is
// waited for (ELIE_PENDING_MS). Another account starts empty; nothing of one
// account is shown to another.

export interface ElieState {
  userId: string | null;
  entries: ElieEntry[];
  thinking: boolean;
  wallet: VcoinWallet | null;
  /** Counts Elie's top-up requests: the V-Coin meter opens on a change. */
  topupSignal: number;
}

export const EMPTY_ELIE_STATE: ElieState = Object.freeze({ userId: null, entries: [], thinking: false, wallet: null, topupSignal: 0 }) as ElieState;
/** How long an answer asked for before a reload is waited for. */
export const ELIE_PENDING_MS = 90 * 1000;
export const ELIE_POLL_MS = 3000;
/** The open search is reopened for a day. */
export const ELIE_RESTORE_MS = 24 * 60 * 60 * 1000;
export const elieStorageKey = (userId: string) => `varoom_elie:v1:${userId}`;

interface SavedSearch { sessionId: string; savedAt: number; pending: { question: string; askedAt: number } | null }

export interface ElieStoreDeps {
  getClient: () => SupabaseClient | null;
  getStorage: () => Storage | null;
  getToken: () => Promise<string | null>;
  ask?: typeof askElie;
  fetchWallet?: (token: string) => Promise<VcoinWallet>;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}

const userEntry = (text: string): ElieEntry => ({ id: elieEntryId(), kind: 'user', text });
const errorEntry = (text: string, retryText: string): ElieEntry => ({ id: elieEntryId(), kind: 'error', text, retryText });
const textTurns = (turns: ElieStoredTurn[]): ElieTurn[] => turns.map(({ role, text }) => ({ role, text }));
/** The pending question was answered: it and an answer are the last two saved turns. */
const answered = (turns: ElieStoredTurn[], question: string) => turns.length >= 2
  && turns[turns.length - 1].role === 'elie' && turns[turns.length - 2].role === 'user' && turns[turns.length - 2].text === question;

export function createElieStore(deps: ElieStoreDeps) {
  const ask = deps.ask || askElie;
  const now = deps.now || Date.now;
  const wait = deps.wait || ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const fetchWallet = deps.fetchWallet || (async (token: string) => {
    const result = await fetchVcoins(token);
    return { balance: result.balance, included: result.included };
  });

  let state: ElieState = EMPTY_ELIE_STATE;
  const listeners = new Set<() => void>();
  let history: ElieTurn[] = [];
  let sessionId: string | null = null;
  // A new search, an opened session or another account makes older work stale.
  let generation = 0;
  // A new question ends waiting for an answer asked before a reload.
  let restoreRun = 0;
  let walletFor: string | null = null;

  const set = (patch: Partial<ElieState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const readSaved = (userId: string): SavedSearch | null => {
    try {
      const raw = deps.getStorage()?.getItem(elieStorageKey(userId));
      return raw ? JSON.parse(raw) as SavedSearch : null;
    } catch { return null; }
  };
  /** Remembers the open search (and a question waiting for its answer), or forgets it. */
  const remember = (userId: string, pending: SavedSearch['pending'] = null) => {
    try {
      const storage = deps.getStorage();
      if (!storage) return;
      if (sessionId) storage.setItem(elieStorageKey(userId), JSON.stringify({ sessionId, savedAt: now(), pending }));
      else storage.removeItem(elieStorageKey(userId));
    } catch { /* Reopening the search after a reload is a convenience. */ }
  };

  const show = (turns: ElieStoredTurn[]) => {
    history = textTurns(turns);
    set({ entries: elieTurnEntries(turns) });
  };

  async function restore(userId: string, mine: number) {
    const saved = readSaved(userId);
    const client = deps.getClient();
    if (!saved || !saved.sessionId || !client || now() - saved.savedAt > ELIE_RESTORE_MS) return;
    let turns: ElieStoredTurn[];
    try { turns = await loadElieTurns(client, saved.sessionId); } catch { return; }
    if (mine !== generation) return;
    sessionId = saved.sessionId;
    show(turns);
    const { pending } = saved;
    if (!pending || answered(turns, pending.question)) { if (pending) remember(userId); return; }
    // Asked before the reload: the Elie service saves the answer when it is ready.
    const run = ++restoreRun;
    history.push({ role: 'user', text: pending.question });
    set({ entries: [...state.entries, userEntry(pending.question)], thinking: true });
    while (now() - pending.askedAt < ELIE_PENDING_MS) {
      await wait(ELIE_POLL_MS);
      if (mine !== generation || run !== restoreRun) return;
      try {
        const next = await loadElieTurns(client, saved.sessionId);
        if (mine !== generation || run !== restoreRun) return;
        if (answered(next, pending.question)) { show(next); set({ thinking: false }); remember(userId); return; }
      } catch { /* Checked again. */ }
    }
    if (mine !== generation || run !== restoreRun) return;
    set({ thinking: false, entries: [...state.entries, errorEntry("Elie's answer didn't arrive. Please ask again.", pending.question)] });
    remember(userId);
  }

  const store = {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getState: () => state,
    getServerState: () => EMPTY_ELIE_STATE,

    /** The signed-in account. Another account starts empty, then reopens its own open search. */
    setUser(userId: string | null) {
      if (userId === state.userId) return;
      generation += 1;
      restoreRun += 1;
      history = [];
      sessionId = null;
      walletFor = null;
      set({ ...EMPTY_ELIE_STATE, userId });
      if (userId) void restore(userId, generation);
    },

    /** `retry`: ask the same question again without adding it to the thread a second time. */
    async send(text: string, { retry = false }: { retry?: boolean } = {}) {
      const question = text.trim();
      const userId = state.userId;
      if (!question || !userId) return;
      restoreRun += 1;
      const mine = generation;
      if (!retry) {
        history.push({ role: 'user', text: question });
        set({ entries: [...state.entries, userEntry(question)] });
      }
      set({ thinking: true });
      const client = deps.getClient();
      let askedIn: string | null = null;
      try {
        if (!sessionId && client) {
          try {
            const created = await createElieSession(client, userId, question);
            if (mine === generation) sessionId = created;
          } catch (error) { console.warn('Elie session creation failed:', error); }
        }
        askedIn = mine === generation ? sessionId : null;
        if (askedIn) remember(userId, { question, askedAt: now() });
        const data = await ask({ message: question, history: history.slice(), token: await deps.getToken(), sessionId: askedIn });
        if (state.userId !== userId) return;
        if (data.vcoins) set({ wallet: { balance: Number(data.vcoins.balance) || 0, included: data.vcoins.included === true } });
        if (askedIn && !data.saved && client) {
          saveElieTurns(client, { sessionId: askedIn, userId, question, data }).catch((error) => console.warn('Elie history save failed:', error));
        }
        if (askedIn && askedIn === sessionId) remember(userId);
        if (mine !== generation) return;
        if (data.reply) history.push({ role: 'elie', text: data.reply });
        set({
          entries: [...state.entries, ...elieResponseEntries(data)],
          topupSignal: data.needs_topup ? state.topupSignal + 1 : state.topupSignal,
        });
      } catch (error) {
        if (state.userId !== userId) return;
        if (askedIn && askedIn === sessionId) remember(userId);
        if (mine !== generation) return;
        const message = error instanceof ElieRequestError ? error.message : 'Could not reach Elie. Please check your connection and try again.';
        set({ entries: [...state.entries, errorEntry(message, question)] });
      } finally {
        if (mine === generation && state.userId === userId) set({ thinking: false });
      }
    },

    /** Ask again after an error (the error row is replaced). */
    retry(entry: Extract<ElieEntry, { kind: 'error' }>) {
      set({ entries: state.entries.filter((item) => item.id !== entry.id) });
      if (entry.retryText) void store.send(entry.retryText, { retry: history.some((turn) => turn.role === 'user' && turn.text === entry.retryText) });
    },

    /** A new, empty search. */
    newSearch() {
      generation += 1;
      restoreRun += 1;
      history = [];
      sessionId = null;
      if (state.userId) remember(state.userId);
      set({ entries: [], thinking: false });
    },

    async listSessions(): Promise<ElieSessionSummary[]> {
      const client = deps.getClient();
      return client && state.userId ? listElieSessions(client, state.userId) : [];
    },

    /** Show a past session; new questions continue it. */
    async loadSession(id: string) {
      const client = deps.getClient();
      const userId = state.userId;
      if (!client || !userId) return;
      generation += 1;
      restoreRun += 1;
      const mine = generation;
      set({ entries: [], thinking: false });
      try {
        const turns = await loadElieTurns(client, id);
        if (mine !== generation) return;
        sessionId = id;
        show(turns);
        remember(userId);
      } catch (error) {
        console.error('Unable to load the Elie session:', error);
        if (mine === generation) set({ entries: [errorEntry('Unable to load this search. Please try again.', '')] });
      }
    },

    /** Loads the V-Coin wallet once per account; answers keep it current after that. */
    async loadWallet() {
      const userId = state.userId;
      if (!userId || walletFor === userId) return;
      walletFor = userId;
      try {
        const token = await deps.getToken();
        if (!token) throw new Error('No session');
        const wallet = await fetchWallet(token);
        if (state.userId === userId) set({ wallet });
      } catch (error) {
        if (walletFor === userId) walletFor = null;
        console.warn('Unable to load V-Coins:', error);
      }
    },

    setWallet(wallet: VcoinWallet) { set({ wallet }); },
  };
  return store;
}

export type ElieStore = ReturnType<typeof createElieStore>;
