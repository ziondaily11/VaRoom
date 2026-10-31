import { getSupabaseClient } from './supabase/client';

// Shared helper for calls to the Express API (/api/*). Attaches the current
// session's bearer token so callers no longer repeat getSession + headers.

export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Require a signed-in session (default true). */
  auth?: boolean;
  cache?: RequestCache;
}

export async function getAccessToken(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token || null;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, auth = true, cache } = options;
  const headers: Record<string, string> = { ...(options.headers || {}) };

  if (auth) {
    const token = await getAccessToken();
    if (!token) throw new ApiError('Authentication is required.', 401, {});
    headers.Authorization = 'Bearer ' + token;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    method,
    headers,
    signal,
    cache,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let result: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') result = parsed as Record<string, unknown>;
  } catch {
    // Empty or non-JSON body.
  }

  if (!response.ok) {
    const message = typeof result.error === 'string' && result.error ? result.error : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, result);
  }
  return result as T;
}
