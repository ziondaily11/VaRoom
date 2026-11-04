// The message of anything thrown or returned as an error: an Error, a
// Supabase/PostgREST error object, or a plain { message } from an API.
// '' when there is none, so callers can write `errorMessage(e) || fallback`.
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}
