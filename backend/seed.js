/* ============================================================
   seed.js — Create Admin User
   Dr. Jaspal Singh Website — jaspalsingh.in

   Run ONCE after setting up the database:
     cd backend
     node seed.js

   This creates the admin login for the admin panel.
   Reads ADMIN_EMAIL and ADMIN_PASSWORD from your .env file.
   ============================================================ */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./config/db');

async function seed() {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('❌  ADMIN_EMAIL and ADMIN_PASSWORD must be set in your .env file.');
    process.exit(1);
  }

  try {
    // Hash the password with bcrypt (12 salt rounds)
    const hash = await bcrypt.hash(password, 12);

    // Insert admin — on conflict (email already exists), update the hash
    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id, email, created_at`,
      [email.toLowerCase().trim(), hash]
    );

    console.log('\n✅  Admin user ready:');
    console.log('    ID    :', result.rows[0].id);
    console.log('    Email :', result.rows[0].email);
    console.log('\n    You can now log in to the admin panel at /admin/login.html\n');

  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    console.error('    Make sure the schema has been applied (backend/models/schema.sql)');
  } finally {
    await pool.end();
  }
}

seed();
