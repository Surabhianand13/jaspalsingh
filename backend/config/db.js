/* ============================================================
   config/db.js — PostgreSQL Connection Pool
   Uses the pg library. All queries go through this pool.
   ============================================================ */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // In production (Supabase / Railway), SSL is required
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  // Connection pool settings
  max: 10,             // max simultaneous connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test the connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    console.error('   Check DATABASE_URL in your .env file.');
  } else {
    console.log('✅ PostgreSQL connected successfully.');
    release();
  }
});

// Helper: run a query with automatic client release
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
