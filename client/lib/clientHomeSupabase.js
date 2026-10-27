// These fallbacks deliberately match public/js/supabase-client.js.  Native
// Client Home must not drift onto a different anonymous credential, because
// Supabase rejects every authenticated profile query when the JWT is invalid.
const FALLBACK_URL = 'https://deaphymimdaygeavhyek.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlYXBoeW1pbWRheWdlYXZoeWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjAwNDQsImV4cCI6MjEwMjA5NjA0NH0.rbgVhuZCK1fZP7gKV5oO1OUvIT61ir23VhAYm8739SI';

function getClientHomeSupabaseConfig(root) {
  return {
    url: (root && root.VAROOM_SUPABASE_URL) || FALLBACK_URL,
    anonKey: (root && root.VAROOM_SUPABASE_ANON_KEY) || FALLBACK_ANON_KEY,
  };
}

module.exports = { FALLBACK_URL, FALLBACK_ANON_KEY, getClientHomeSupabaseConfig };
