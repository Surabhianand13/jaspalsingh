/* ============================================================
   utils/programBatches.js  -  "Batch 1 (28 Sep 2026)" labels for
   programs that take new enrollments in rounds on the same page
   (2026-10-31, शौर्य Offline Practice Batch).

   programs.batches is a list of start dates ('YYYY-MM-DD', admin-
   editable in Programs > Edit). A paid enrollment belongs to the last
   batch that started on or before its payment date (IST); anything paid
   before Batch 1 started is Batch 1. Worked out at read time from
   paid_at, so no enrollment row is ever written or changed - existing
   learners are untouched. Programs without batches get no label.
   ============================================================ */

const { query } = require('../config/db');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cleanBatches(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(d => String(d || '').trim()).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

function labelFor(no, start) {
  const [y, m, d] = start.split('-').map(Number);
  return `Batch ${no} (${d} ${MONTHS[m - 1]} ${y})`;
}

function istDay(ts) {
  return new Date(new Date(ts).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/* batches: sorted start dates. Returns { batch_no, batch_label } or null. */
function batchOf(batches, paidAt) {
  if (!batches || !batches.length || !paidAt) return null;
  const day = istDay(paidAt);
  let i = 0;
  batches.forEach((start, idx) => { if (start <= day) i = idx; });
  return { batch_no: i + 1, batch_label: labelFor(i + 1, batches[i]) };
}

async function loadBatchMap() {
  const r = await query(`SELECT slug, batches FROM programs WHERE batches IS NOT NULL`);
  const map = {};
  r.rows.forEach(p => { const b = cleanBatches(p.batches); if (b.length) map[p.slug] = b; });
  return map;
}

/* Adds batch_no / batch_label to enrollment rows (paid_at, program_slug). */
async function attachBatches(rows) {
  const map = await loadBatchMap();
  rows.forEach(r => {
    const b = r.status && r.status !== 'paid' ? null : batchOf(map[r.program_slug], r.paid_at);
    r.batch_no = b ? b.batch_no : null;
    r.batch_label = b ? b.batch_label : null;
  });
  return rows;
}

module.exports = { cleanBatches, batchOf, attachBatches };
