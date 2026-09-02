(function () {
  const SUPABASE_URL = window.VAROOM_SUPABASE_URL || 'https://deaphymimdaygeavhyek.supabase.co';
  const SUPABASE_ANON_KEY = window.VAROOM_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlYXBoeW1pbWRheWdlYXZoeWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjAwNDQsImV4cCI6MjEwMjA5NjA0NH0.rbgVhuZCK1fZP7gKV5oO1OUvIT61ir23VhAYm8739SI';

  window.VAROOM_SUPABASE_URL = SUPABASE_URL;
  window.VAROOM_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

  if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
})();
