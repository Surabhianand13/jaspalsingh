/* ============================================================
   scripts/fix-dusshera-coupon-type.js
   One-time fix: update DUSSHERA coupon type from fixed_discount
   to percent_discount so it correctly deducts 5% instead of Rs 5.

   Run once from backend folder on Render shell:
     node scripts/fix-dusshera-coupon-type.js
   ============================================================ */

require('dotenv').config();
const { query } = require('../config/db');

async function run() {
  const check = await query(
    `SELECT id, code, type, discount_amount FROM coupons WHERE code = 'DUSSHERA'`
  );

  if (!check.rows.length) {
    console.error('DUSSHERA coupon not found.');
    process.exit(1);
  }

  const c = check.rows[0];
  console.log('Current:', c);

  if (c.type === 'percent_discount') {
    console.log('Already percent_discount - nothing to do.');
    process.exit(0);
  }

  const result = await query(
    `UPDATE coupons SET type = 'percent_discount', updated_at = NOW()
     WHERE code = 'DUSSHERA' AND type = 'fixed_discount'
     RETURNING id, code, type, discount_amount`
  );

  console.log('Updated:', result.rows[0]);
  console.log('Done - DUSSHERA now gives', result.rows[0].discount_amount + '% off.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
