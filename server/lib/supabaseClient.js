require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env — check that server/.env exists and is filled in.'
  );
}

// Server-side client using the service_role key.
// This bypasses Row Level Security — never expose this client or key to the frontend.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

module.exports = supabase;