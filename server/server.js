require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const supabase = require('./lib/supabaseClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve the client/ folder as static files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Basic liveness check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Confirms the Supabase connection works end-to-end
app.get('/api/db-check', async (req, res) => {
  try {
    const { data, error } = await supabase.from('listings').select('id').limit(1);

    if (error) {
      return res.status(500).json({ connected: false, error: error.message });
    }

    res.json({ connected: true });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});