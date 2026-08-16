require('dotenv').config();

const express = require('express');
const path = require('path');
const supabaseAdmin = require('./lib/supabaseClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve the frontend (client/) as static files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Placeholder API route — real listing/provider/client routes will live in ./routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'varoom-server' });
});

// Quick way to confirm the Supabase connection actually works once you've
// filled in server/.env and run the schema SQL.
app.get('/api/db-check', async (req, res) => {
  const { error } = await supabaseAdmin.from('listings').select('id').limit(1);
  if (error) {
    return res.status(500).json({ connected: false, error: error.message });
  }
  res.json({ connected: true });
});

// Delete the calling user's own account. Requires the service-role key
// (only available server-side) since a regular client can't delete its
// own auth.users row. The caller must send their Supabase access token
// in the Authorization header — we verify it belongs to a real session
// before deleting, so nobody can delete an account that isn't theirs.
app.post('/api/delete-account', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing access token' });
  }

  const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
  if (verifyError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  // profiles row is deleted automatically via the ON DELETE CASCADE
  // foreign key back to auth.users, set up in the original schema.
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`VaRoom server running at http://localhost:${PORT}`);
});