/* ============================================================
   utils/testDate.js  -  Which IST calendar day a scheduled test is on.

   program_schedule.test_date is free text typed by admin ("3 Oct 2026",
   "Sun, 4 Oct", "04/10/2026", "2026-10-04"...), so it can't be filtered
   in SQL. paper_release_at (set via Configure) is exact, so it wins when
   present; otherwise the text is parsed. Returns 'YYYY-MM-DD' or null.
   Used by the admin Test Day board (routes/programs.js).
   ============================================================ */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function pad(n) { return String(n).padStart(2, '0'); }
function key(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return `${y}-${pad(m)}-${pad(d)}`;
}
function istKey(date) {
  return new Date(new Date(date).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/* No year typed ("Sun, 4 Oct"): pick the year that puts the date
   closest to today, so a December schedule viewed in January still
   lands in the right year. */
function nearestYear(m, d, now) {
  const y = now.getUTCFullYear();
  let best = null, bestDiff = Infinity;
  [y - 1, y, y + 1].forEach(yy => {
    const k = key(yy, m, d);
    if (!k) return;
    const diff = Math.abs(new Date(k + 'T00:00:00Z') - now);
    if (diff < bestDiff) { best = k; bestDiff = diff; }
  });
  return best;
}

function parseTestDateText(text, now = new Date()) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  let m;
  if ((m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) return key(+m[1], +m[2], +m[3]);
  if ((m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/))) {           // DD/MM/YYYY (India)
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return key(y, +m[2], +m[1]);
  }
  if ((m = t.match(/\b(\d{1,2}) ([a-z]{3,9})'?(?: (\d{2,4}))?\b/)) && MONTHS[m[2].slice(0, 3)]) {  // 4 Oct 2026
    const mon = MONTHS[m[2].slice(0, 3)];
    if (m[3]) return key(m[3].length === 2 ? 2000 + +m[3] : +m[3], mon, +m[1]);
    return nearestYear(mon, +m[1], now);
  }
  if ((m = t.match(/\b([a-z]{3,9}) (\d{1,2})(?: (\d{4}))?\b/)) && MONTHS[m[1].slice(0, 3)]) {  // Oct 4 2026
    const mon = MONTHS[m[1].slice(0, 3)];
    return m[3] ? key(+m[3], mon, +m[2]) : nearestYear(mon, +m[2], now);
  }
  return null;
}

/* row: { paper_release_at, test_date } */
function testDayKey(row, now = new Date()) {
  if (row.paper_release_at) return istKey(row.paper_release_at);
  return parseTestDateText(row.test_date, now);
}

module.exports = { testDayKey, parseTestDateText, istKey };
