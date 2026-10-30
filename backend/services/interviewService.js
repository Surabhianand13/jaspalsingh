/* ============================================================
   services/interviewService.js  -  Interview slot booking logic
   (RPSC AE Interview Guidance, but keyed by program_slug so any
   interview program can reuse it).

   Model:
     interview_phases   - a booking round (e.g. Phase 1: 2-7 Nov),
                          with its own dates, time windows and venue.
                          draft -> open (learners can book) -> closed.
     interview_slots    - one row per 15-min slot, generated when the
                          phase is created. One learner per slot.
     interview_bookings - slot_id UNIQUE, so two learners can never
                          hold the same slot even under a race.
     interview_invites  - who was emailed the booking link per phase.

   Rules (confirmed with the owner 2026-10-21):
     - each learner gets slots_per_learner (3) slots in total, never two
       on the same day. They can book 1, 2 or all 3 at a time and come
       back for the rest whenever they like - each booking emails what
       is booked so far and how many are still pending
     - remaining slots can be booked in a later phase too
     - no reschedule / no cancellation by the learner (admin can
       release a learner's slots, e.g. after a refund)
     - no booking deadline - a slot is bookable until it starts
     - interview numbers (Interview 1/2/3) are by date, not by the
       order slots were booked - see withDisplayNumbers()
     - Mock Interview Add-on packs (2026-10-30, config/interviewRules.js)
       raise a learner's limit: 3 + 2 or 4 per paid pack, packs stack.
       Same phases, same one-per-day rule - see extraSlotsFor()
     - "Interviews only" buyers (unlisted /rpsc-ae-mock-interviews/ page)
       bought a pack without the programme: 0 included + their packs.
       Their pack enrollment is what their booking link is signed for -
       see programOf() / slotAllowance()

   Every eligibility check is "paid AND not refunded" - see
   project notes on refunds: enrollments.status stays 'paid' after a
   refund, only refund_status changes.
   ============================================================ */

const jwt = require('jsonwebtoken');
const { pool, query } = require('../config/db');
const { slugsFor, canonicalize } = require('../utils/programSlugAliases');
const calendar = require('./interviewCalendar');
const emails = require('./interviewEmails');
const { SITE } = require('./paymentEmailService');
const { BRANCHES, ADDON_BASE_PROGRAM, ADDON_PACKS, ADDON_SLUGS, addonPack } = require('../config/interviewRules');

/* The interview program an enrollment books under: an add-on pack
   enrollment ("interviews only" buyer) books under RPSC AE Interview. */
function programOf(enrollment) {
  return addonPack(enrollment.program_slug) ? ADDON_BASE_PROGRAM : canonicalize(enrollment.program_slug);
}

const TOKEN_PURPOSE = 'interview-booking';
const PHASE_COLS = `p.id, p.program_slug, p.name, p.status, p.slots_per_learner, p.slot_minutes,
  p.date_from::text AS date_from, p.date_to::text AS date_to, p.windows, p.skip_sundays,
  p.venue_name, p.venue_address, p.maps_link, p.venue_tba, p.venue_announced_at, p.created_at`;

/* ── Schema (called from server.js migrate()) ───────────────── */

async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS interview_phases (
    id                SERIAL PRIMARY KEY,
    program_slug      TEXT NOT NULL,
    name              TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'draft',
    slots_per_learner INTEGER NOT NULL DEFAULT 3,
    slot_minutes      INTEGER NOT NULL DEFAULT 15,
    date_from         DATE NOT NULL,
    date_to           DATE NOT NULL,
    windows           JSONB NOT NULL,
    skip_sundays      BOOLEAN NOT NULL DEFAULT TRUE,
    venue_name        TEXT,
    venue_address     TEXT,
    maps_link         TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS interview_slots (
    id         SERIAL PRIMARY KEY,
    phase_id   INTEGER NOT NULL REFERENCES interview_phases(id) ON DELETE CASCADE,
    starts_at  TIMESTAMPTZ NOT NULL,
    ends_at    TIMESTAMPTZ NOT NULL,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (phase_id, starts_at)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS interview_bookings (
    id                 SERIAL PRIMARY KEY,
    phase_id           INTEGER NOT NULL REFERENCES interview_phases(id) ON DELETE CASCADE,
    slot_id            INTEGER NOT NULL UNIQUE REFERENCES interview_slots(id) ON DELETE CASCADE,
    enrollment_id      INTEGER NOT NULL,
    interview_no       INTEGER NOT NULL,
    branch             TEXT NOT NULL,
    student_name       TEXT,
    student_email      TEXT,
    student_phone      TEXT,
    roll_number        TEXT,
    calendar_event_id  TEXT,
    calendar_error     TEXT,
    calendar_attempts  INTEGER NOT NULL DEFAULT 0,
    reminder_sent_at   TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (enrollment_id, interview_no)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_interview_bookings_enrollment ON interview_bookings (enrollment_id)`);
  // Venue not finalised yet (2026-10-22): learners see "venue details will
  // be shared soon on email" until the admin fills it in and announces it.
  await query(`ALTER TABLE interview_phases ADD COLUMN IF NOT EXISTS venue_tba BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE interview_phases ADD COLUMN IF NOT EXISTS venue_announced_at TIMESTAMPTZ`);
  await query(`CREATE TABLE IF NOT EXISTS interview_invites (
    phase_id         INTEGER NOT NULL REFERENCES interview_phases(id) ON DELETE CASCADE,
    enrollment_id    INTEGER NOT NULL,
    invited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reminded_at TIMESTAMPTZ,
    PRIMARY KEY (phase_id, enrollment_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS interview_digest_log (
    digest_date DATE PRIMARY KEY,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // Who was emailed the Mock Interview Add-on offer (at most once each).
  await query(`CREATE TABLE IF NOT EXISTS interview_addon_offers (
    enrollment_id INTEGER PRIMARY KEY,
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

/* ── Time helpers (IST is a fixed +05:30, no DST) ───────────── */

function istDateKey(d) {
  return new Date(new Date(d).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function generateSlotTimes(phase) {
  const out = [];
  const start = new Date(phase.date_from + 'T00:00:00Z');
  const end = new Date(phase.date_to + 'T00:00:00Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (phase.skip_sundays && d.getUTCDay() === 0) continue;
    const day = d.toISOString().slice(0, 10);
    for (const w of phase.windows) {
      let t = new Date(`${day}T${w.start}:00+05:30`);
      const wEnd = new Date(`${day}T${w.end}:00+05:30`);
      while (t.getTime() + phase.slot_minutes * 60000 <= wEnd.getTime()) {
        const e = new Date(t.getTime() + phase.slot_minutes * 60000);
        out.push({ starts_at: t, ends_at: e });
        t = e;
      }
    }
  }
  return out;
}

/* ── Booking link tokens ────────────────────────────────────── */

function signBookingToken(enrollmentId) {
  return jwt.sign({ purpose: TOKEN_PURPOSE, eid: enrollmentId }, process.env.JWT_SECRET, { expiresIn: '365d' });
}
function bookingLink(enrollmentId) {
  return `${SITE}/book-interview/?t=${encodeURIComponent(signBookingToken(enrollmentId))}`;
}
function verifyBookingToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.purpose !== TOKEN_PURPOSE || !decoded.eid) throw new Error('Wrong token type');
  return decoded.eid;
}

/* Paid + not refunded enrollment by id, or null. */
async function activeEnrollmentById(id) {
  const r = await query(
    `SELECT id, order_id, program_slug, program_name, student_name, student_email, student_phone, roll_number
     FROM enrollments WHERE id = $1 AND status = 'paid' AND refund_status != 'initiated'`,
    [id]
  );
  return r.rows[0] || null;
}

/* ── Mock Interview Add-on allowance ────────────────────────── */

const ADDON_SLOTS_JSON = JSON.stringify(Object.fromEntries(ADDON_PACKS.map(p => [p.slug, p.slots])));

/* Extra slots bought through add-on packs: paid, not refunded, matched
   by email (like bookings), so they count whichever enrollment the
   learner books with. Only the RPSC AE Interview program has add-ons. */
async function extraSlotsFor(programSlug, email, db = { query }) {
  if (!email || canonicalize(programSlug) !== ADDON_BASE_PROGRAM) return 0;
  const r = await db.query(
    `SELECT COALESCE(SUM((($1::jsonb) ->> e.program_slug)::int), 0)::int AS n
     FROM enrollments e
     WHERE e.program_slug = ANY($2::text[]) AND e.status = 'paid' AND e.refund_status != 'initiated'
       AND LOWER(TRIM(e.student_email)) = LOWER(TRIM($3))`,
    [ADDON_SLOTS_JSON, ADDON_SLUGS, email]
  );
  return r.rows[0].n;
}

/* Does this email hold a paid, not refunded RPSC AE Interview enrollment
   (the programme itself, not just an add-on pack)? */
async function hasBaseProgram(email, db = { query }) {
  if (!email) return false;
  const r = await db.query(
    `SELECT 1 FROM enrollments WHERE program_slug = ANY($1::text[]) AND status = 'paid' AND refund_status != 'initiated'
       AND LOWER(TRIM(student_email)) = LOWER(TRIM($2)) LIMIT 1`,
    [slugsFor(ADDON_BASE_PROGRAM), email]
  );
  return r.rows.length > 0;
}

/* Branch chosen at payment (enrollments.engg_branch) for this email:
   the programme order first, else the earliest pack. null for orders
   placed before the branch was asked - the booking page then asks. */
async function branchFor(email) {
  if (!email) return null;
  const r = await query(
    `SELECT engg_branch FROM enrollments
     WHERE (program_slug = ANY($1::text[]) OR program_slug = ANY($2::text[]))
       AND status = 'paid' AND refund_status != 'initiated' AND engg_branch IS NOT NULL
       AND LOWER(TRIM(student_email)) = LOWER(TRIM($3))
     ORDER BY (program_slug = ANY($1::text[])) DESC, paid_at ASC LIMIT 1`,
    [slugsFor(ADDON_BASE_PROGRAM), ADDON_SLUGS, email]
  );
  return r.rows.length ? r.rows[0].engg_branch : null;
}

/* Total interviews for a learner: included slots (only with the
   programme) + add-on packs. Every other program: just baseSlots. */
async function slotAllowance(programSlug, email, baseSlots, db = { query }) {
  if (canonicalize(programSlug) !== ADDON_BASE_PROGRAM) return { included: baseSlots, extra: 0, total: baseSlots };
  const included = (await hasBaseProgram(email, db)) ? baseSlots : 0;
  const extra = await extraSlotsFor(programSlug, email, db);
  return { included, extra, total: included + extra };
}

/* Included slots per learner when no phase is at hand (add-on emails):
   the open phase's setting, else the latest phase's, else 3. */
async function baseSlotsPerLearner(programSlug = ADDON_BASE_PROGRAM) {
  const r = await query(
    `SELECT slots_per_learner FROM interview_phases WHERE program_slug = ANY($1::text[])
     ORDER BY (status = 'open') DESC, date_from DESC LIMIT 1`,
    [slugsFor(canonicalize(programSlug))]
  );
  return r.rows.length ? r.rows[0].slots_per_learner : 3;
}

/* ── Reads ──────────────────────────────────────────────────── */

async function getPhase(id) {
  const r = await query(`SELECT ${PHASE_COLS} FROM interview_phases p WHERE p.id = $1`, [id]);
  return r.rows[0] || null;
}

/* Bookings are stored with interview_no = booking sequence (unique per
   enrollment); learners and the panel see them numbered by date. */
function withDisplayNumbers(bookings) {
  return bookings.slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    .map((b, i) => Object.assign({}, b, { interview_no: i + 1 }));
}

/* All bookings this learner holds for the program (any phase).
   Matches on email too so a duplicate purchase can't book twice. */
async function learnerBookings(enrollment) {
  const r = await query(
    `SELECT b.id, b.phase_id, b.slot_id, b.interview_no, b.branch, s.starts_at, s.ends_at,
            p.name AS phase_name, p.venue_name, p.venue_address, p.maps_link, p.venue_tba, p.slots_per_learner
     FROM interview_bookings b
     JOIN interview_slots s ON s.id = b.slot_id
     JOIN interview_phases p ON p.id = b.phase_id
     WHERE p.program_slug = ANY($3::text[])
       AND (b.enrollment_id = $1 OR LOWER(TRIM(b.student_email)) = LOWER(TRIM($2)))
     ORDER BY s.starts_at`,
    [enrollment.id, enrollment.student_email || '', slugsFor(programOf(enrollment))]
  );
  return withDisplayNumbers(r.rows);
}

/* Open phases for a program, each with its bookable future slots
   grouped by IST day (who booked is never exposed to learners).
   takenDays: IST dates the learner already has a slot on - those days
   are not bookable for them (one slot per day). */
async function openPhasesWithAvailability(programSlug, takenDays = []) {
  const phases = (await query(
    `SELECT ${PHASE_COLS} FROM interview_phases p
     WHERE p.program_slug = ANY($1::text[]) AND p.status = 'open' ORDER BY p.date_from`,
    [slugsFor(addonPack(programSlug) ? ADDON_BASE_PROGRAM : canonicalize(programSlug))]
  )).rows;
  for (const p of phases) {
    const slots = (await query(
      `SELECT s.id, s.starts_at, s.ends_at,
              (NOT s.is_blocked AND b.id IS NULL AND s.starts_at > NOW()) AS available
       FROM interview_slots s LEFT JOIN interview_bookings b ON b.slot_id = s.id
       WHERE s.phase_id = $1 AND s.starts_at > NOW()
       ORDER BY s.starts_at`,
      [p.id]
    )).rows;
    const days = {};
    slots.forEach(s => {
      const k = istDateKey(s.starts_at);
      (days[k] = days[k] || []).push({ id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, available: s.available });
    });
    const taken = new Set(takenDays);
    p.days = Object.keys(days).sort().map(date => ({
      date, slots: days[date], available: days[date].filter(s => s.available).length, taken: taken.has(date),
    }));
    // Bookable for this learner = at least one free slot on a day they
    // don't already have an interview.
    p.bookable = p.days.some(d => d.available > 0 && !d.taken);
  }
  return phases;
}

/* ── Booking (1..remaining slots per submit, all-or-nothing) ── */

class BookingError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

async function bookSlots(enrollment, { phaseId, slotIds, branch }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialise concurrent submits from the same learner (double tap,
    // two tabs). Different learners still race only on slot_id UNIQUE.
    await client.query('SELECT pg_advisory_xact_lock(424242, $1)', [enrollment.id]);

    const phaseRes = await client.query(`SELECT ${PHASE_COLS} FROM interview_phases p WHERE p.id = $1`, [phaseId]);
    const phase = phaseRes.rows[0];
    if (!phase || phase.status !== 'open' || !slugsFor(programOf(enrollment)).includes(phase.program_slug)) {
      throw new BookingError('This booking round is not open.', 409);
    }

    const existing = (await client.query(
      `SELECT b.id, b.slot_id, b.interview_no, b.branch, s.starts_at, s.ends_at
       FROM interview_bookings b JOIN interview_phases p ON p.id = b.phase_id JOIN interview_slots s ON s.id = b.slot_id
       WHERE p.program_slug = $3 AND (b.enrollment_id = $1 OR LOWER(TRIM(b.student_email)) = LOWER(TRIM($2)))`,
      [enrollment.id, enrollment.student_email || '', phase.program_slug]
    )).rows;
    const { total } = await slotAllowance(phase.program_slug, enrollment.student_email, phase.slots_per_learner, client);
    const remaining = total - existing.length;
    if (remaining <= 0) throw new BookingError(`You have already booked all ${total} of your slots.`, 409);

    // Branch is chosen with the first booking and kept for the rest.
    if (existing.length) branch = existing[0].branch;
    if (!branch) branch = await branchFor(enrollment.student_email);
    if (!branch) throw new BookingError('Please choose your branch.');

    const ids = [...new Set((slotIds || []).map(Number).filter(Boolean))];
    if (!ids.length) throw new BookingError('Please pick at least one slot.');
    if (ids.length > remaining) {
      throw new BookingError(`You can book ${remaining} more slot${remaining === 1 ? '' : 's'}.`);
    }

    const slots = (await client.query(
      `SELECT s.id, s.starts_at, s.ends_at, s.is_blocked FROM interview_slots s
       WHERE s.id = ANY($1::int[]) AND s.phase_id = $2 ORDER BY s.starts_at FOR UPDATE`,
      [ids, phase.id]
    )).rows;
    if (slots.length !== ids.length) throw new BookingError('One of the selected slots does not exist. Please refresh and try again.', 409);
    if (slots.some(s => s.is_blocked || new Date(s.starts_at) <= new Date())) {
      throw new BookingError('One of the selected slots is no longer available. Please pick another.', 409);
    }
    const dayKeys = existing.concat(slots).map(s => istDateKey(s.starts_at));
    if (new Set(dayKeys).size !== dayKeys.length) {
      throw new BookingError('You can book only one slot per day. Please pick a day you do not already have an interview on.');
    }

    const seqStart = existing.reduce((m, b) => Math.max(m, b.interview_no), 0);
    const inserted = [];
    for (let i = 0; i < slots.length; i++) {
      const r = await client.query(
        `INSERT INTO interview_bookings (phase_id, slot_id, enrollment_id, interview_no, branch, student_name, student_email, student_phone, roll_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, slot_id, interview_no`,
        [phase.id, slots[i].id, enrollment.id, seqStart + i + 1, branch, enrollment.student_name, enrollment.student_email, enrollment.student_phone, enrollment.roll_number]
      );
      inserted.push(Object.assign(r.rows[0], { starts_at: slots[i].starts_at, ends_at: slots[i].ends_at, branch }));
    }
    await client.query('COMMIT');

    const all = withDisplayNumbers(existing.concat(inserted));
    const newIds = new Set(inserted.map(b => b.id));
    // After commit: confirmation + calendar, never blocking the response.
    afterBooking(enrollment, phase, all, newIds, total).catch(err => console.error('[interview afterBooking]', err.message));
    return { phase, bookings: all, newIds: [...newIds], remaining: total - all.length, total, branch };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      throw new BookingError('Someone just booked one of those slots. The list has been refreshed - please pick again.', 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

async function afterBooking(enrollment, phase, allBookings, newIds, total) {
  if (enrollment.student_email) {
    emails.sendConfirmationEmail({
      to: enrollment.student_email,
      name: enrollment.student_name,
      roll: enrollment.roll_number,
      branch: allBookings[0].branch,
      bookings: allBookings,
      newIds,
      total,
      link: bookingLink(enrollment.id),
      phase,
    }).catch(err => console.error('[interview confirmation email]', err.message));
  }
  for (const id of newIds) await syncCalendar(id);
}

/* ── Calendar sync (retried from the tick until it works) ───── */

async function syncCalendar(bookingId) {
  const r = await query(
    `SELECT b.*, s.starts_at, s.ends_at, p.name AS phase_name, p.venue_name, p.venue_address, p.venue_tba, p.slots_per_learner
     FROM interview_bookings b JOIN interview_slots s ON s.id = b.slot_id JOIN interview_phases p ON p.id = b.phase_id
     WHERE b.id = $1 AND b.calendar_event_id IS NULL`,
    [bookingId]
  );
  const b = r.rows[0];
  if (!b) return;
  try {
    const eventId = await calendar.createEvent(b);
    await query(`UPDATE interview_bookings SET calendar_event_id = $1, calendar_error = NULL WHERE id = $2`, [eventId, b.id]);
  } catch (err) {
    await query(`UPDATE interview_bookings SET calendar_error = $1, calendar_attempts = calendar_attempts + 1 WHERE id = $2`, [String(err.message).slice(0, 500), b.id]);
    console.error(`[interview calendar] booking ${b.id}:`, err.message);
  }
}

/* Admin: free up all of a learner's slots (refund / emergency). */
async function releaseLearner(enrollmentId) {
  const rows = (await query(`DELETE FROM interview_bookings WHERE enrollment_id = $1 RETURNING id, calendar_event_id`, [enrollmentId])).rows;
  for (const r of rows) {
    await calendar.deleteEvent(r.calendar_event_id).catch(err => console.error('[interview calendar delete]', err.message));
  }
  return rows.length;
}

/* ── Venue finalised later ──────────────────────────────────── */

/* After the admin edits a phase's venue: move sir's calendar events
   for every booking in the phase to the new location. */
async function updateCalendarLocations(phase) {
  const rows = (await query(
    `SELECT id, calendar_event_id FROM interview_bookings WHERE phase_id = $1 AND calendar_event_id IS NOT NULL`,
    [phase.id]
  )).rows;
  const location = calendar.locationFor(phase);
  for (const r of rows) {
    await calendar.updateLocation(r.calendar_event_id, location)
      .catch(err => console.error(`[interview calendar location] booking ${r.id}:`, err.message));
  }
  return rows.length;
}

/* Email the (now final) venue to every active learner holding slots in
   this phase, listing their own slots. Background send, like invites. */
async function announceVenue(phase) {
  if (phase.venue_tba || !phase.venue_address) throw new BookingError('Fill in the venue first (untick "Venue not finalised").');
  const rows = (await query(
    `SELECT b.id, b.enrollment_id, b.student_name, b.student_email, b.branch, s.starts_at, s.ends_at
     FROM interview_bookings b
     JOIN interview_slots s ON s.id = b.slot_id
     JOIN enrollments e ON e.id = b.enrollment_id
     WHERE b.phase_id = $1 AND e.status = 'paid' AND e.refund_status != 'initiated' AND e.order_id NOT LIKE 'JSP-ADMINPREVIEW-%'
     ORDER BY s.starts_at`,
    [phase.id]
  )).rows;
  const byLearner = {};
  rows.forEach(r => { (byLearner[r.enrollment_id] = byLearner[r.enrollment_id] || []).push(r); });
  const learners = Object.values(byLearner).filter(list => list[0].student_email);
  await query(`UPDATE interview_phases SET venue_announced_at = NOW() WHERE id = $1`, [phase.id]);

  (async () => {
    for (const list of learners) {
      // Number by date across ALL their bookings, not just this phase.
      const all = (await query(
        `SELECT b.id, s.starts_at FROM interview_bookings b JOIN interview_slots s ON s.id = b.slot_id WHERE b.enrollment_id = $1`,
        [list[0].enrollment_id]
      )).rows;
      const numbers = {};
      withDisplayNumbers(all).forEach(b => { numbers[b.id] = b.interview_no; });
      const bookings = list.map(b => Object.assign({}, b, { interview_no: numbers[b.id] }));
      await emails.sendVenueAnnouncement({ to: list[0].student_email, name: list[0].student_name, bookings, phase })
        .catch(err => console.error(`[interview venue email] ${list[0].student_email}:`, err.message));
    }
    console.log(`[interview venue] announced to ${learners.length} learner(s) for phase ${phase.id}`);
  })();
  return learners.length;
}

/* ── Eligible learners + invites ────────────────────────────── */

/* One row per learner (deduped by email) who has paid and not been
   refunded, with how many slots they hold (any phase) and their invite
   status for the given phase. total_slots = included + add-on slots,
   pending = slots still to book. */
async function eligibleLearners(phase) {
  const r = await query(
    `WITH paid AS (
       -- Programme enrollments + "interviews only" pack buyers, one row per
       -- email, preferring the programme enrollment (has_base) if both.
       SELECT DISTINCT ON (LOWER(TRIM(e.student_email)))
              e.id, e.student_name, e.student_email, e.student_phone, e.roll_number, e.paid_at,
              (e.program_slug = ANY($1::text[])) AS has_base
       FROM enrollments e
       WHERE (e.program_slug = ANY($1::text[]) OR e.program_slug = ANY($5::text[]))
         AND e.status = 'paid' AND e.refund_status != 'initiated'
         AND e.order_id NOT LIKE 'JSP-ADMINPREVIEW-%' -- admin previews: no invites, not counted
       ORDER BY LOWER(TRIM(e.student_email)), (e.program_slug = ANY($1::text[])) DESC, e.paid_at ASC
     )
     SELECT paid.*,
            COALESCE(bk.booked_count, 0) AS booked_count, COALESCE(bk.branch, pb.engg_branch) AS branch, bk.slots,
            inv.invited_at, inv.last_reminded_at, ad.extra_slots
     FROM paid
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS booked_count, MIN(b.branch) AS branch,
              json_agg(json_build_object('starts_at', s.starts_at, 'phase_id', b.phase_id) ORDER BY s.starts_at) AS slots
       FROM interview_bookings b JOIN interview_slots s ON s.id = b.slot_id JOIN interview_phases p ON p.id = b.phase_id
       WHERE p.program_slug = $3 AND (b.enrollment_id = paid.id OR LOWER(TRIM(b.student_email)) = LOWER(TRIM(paid.student_email)))
     ) bk ON TRUE
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM((($4::jsonb) ->> a.program_slug)::int), 0)::int AS extra_slots
       FROM enrollments a
       WHERE a.program_slug = ANY($5::text[]) AND a.status = 'paid' AND a.refund_status != 'initiated'
         AND LOWER(TRIM(a.student_email)) = LOWER(TRIM(paid.student_email))
     ) ad ON TRUE
     LEFT JOIN LATERAL (
       -- Branch asked at payment, for learners who haven't booked yet.
       SELECT x.engg_branch FROM enrollments x
       WHERE (x.program_slug = ANY($1::text[]) OR x.program_slug = ANY($5::text[]))
         AND x.status = 'paid' AND x.refund_status != 'initiated' AND x.engg_branch IS NOT NULL
         AND LOWER(TRIM(x.student_email)) = LOWER(TRIM(paid.student_email))
       ORDER BY (x.program_slug = ANY($1::text[])) DESC, x.paid_at ASC LIMIT 1
     ) pb ON TRUE
     LEFT JOIN interview_invites inv ON inv.phase_id = $2 AND inv.enrollment_id = paid.id
     ORDER BY paid.paid_at ASC`,
    [slugsFor(phase.program_slug), phase.id, phase.program_slug, ADDON_SLOTS_JSON,
     canonicalize(phase.program_slug) === ADDON_BASE_PROGRAM ? ADDON_SLUGS : []]
  );
  return r.rows.map(l => {
    const included = l.has_base ? phase.slots_per_learner : 0;
    const total = included + l.extra_slots;
    return Object.assign(l, { included_slots: included, total_slots: total, pending: Math.max(0, total - l.booked_count) });
  });
}

/* mode 'new'    - everyone with slots still to book, not yet invited to this phase
   mode 'remind' - everyone invited to this phase who still has slots to book
   Emails go out in the background through resendQueue (~0.6s each). */
async function sendInvites(phase, mode) {
  if (phase.status !== 'open') throw new BookingError('Open the phase before sending invites.');
  const learners = (await eligibleLearners(phase)).filter(l => l.pending > 0 && l.student_email);
  const targets = mode === 'remind' ? learners.filter(l => l.invited_at) : learners.filter(l => !l.invited_at);

  (async () => {
    for (const l of targets) {
      try {
        if (mode === 'remind') {
          await emails.sendInviteEmail({ to: l.student_email, name: l.student_name, phase, link: bookingLink(l.id), reminder: true, bookedCount: l.booked_count, total: l.total_slots });
          await query(`UPDATE interview_invites SET last_reminded_at = NOW() WHERE phase_id = $1 AND enrollment_id = $2`, [phase.id, l.id]);
        } else {
          const claim = await query(
            `INSERT INTO interview_invites (phase_id, enrollment_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`,
            [phase.id, l.id]
          );
          if (!claim.rows.length) continue;
          await emails.sendInviteEmail({ to: l.student_email, name: l.student_name, phase, link: bookingLink(l.id), bookedCount: l.booked_count, total: l.total_slots });
        }
      } catch (err) {
        console.error(`[interview invite] ${l.student_email}:`, err.message);
      }
    }
    console.log(`[interview invite] ${mode}: queued ${targets.length} email(s) for phase ${phase.id}`);
  })();

  return targets.length;
}

/* Called from payment.js onEnrollmentPaid (can run several times per
   order - the invite insert makes it send at most once). Learners who
   enroll after the invites went out get the link straight away, as long
   as an open phase still has a free slot. */
async function inviteNewEnrollment(enrollment) {
  if (!enrollment || !enrollment.id || !enrollment.student_email) return;
  if (addonPack(enrollment.program_slug)) return; // the add-on email carries the booking link
  const phases = await openPhasesWithAvailability(enrollment.program_slug);
  const phase = phases.find(p => p.bookable);
  if (!phase) return;
  const fresh = await activeEnrollmentById(enrollment.id);
  if (!fresh) return;
  const { total } = await slotAllowance(phase.program_slug, fresh.student_email, phase.slots_per_learner);
  const bookedCount = (await learnerBookings(fresh)).length;
  if (bookedCount >= total) return;
  const claim = await query(
    `INSERT INTO interview_invites (phase_id, enrollment_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`,
    [phase.id, fresh.id]
  );
  if (!claim.rows.length) return;
  await emails.sendInviteEmail({ to: fresh.student_email, name: fresh.student_name, phase, link: bookingLink(fresh.id), bookedCount, total });
}

/* ── Phase summary (admin list + daily digest) ──────────────── */

async function phaseStats(phase) {
  const s = (await query(
    `SELECT COUNT(*)::int AS slots_total,
            COUNT(*) FILTER (WHERE s.is_blocked)::int AS slots_blocked,
            COUNT(b.id)::int AS slots_booked,
            COUNT(*) FILTER (WHERE NOT s.is_blocked AND b.id IS NULL AND s.starts_at > NOW())::int AS slots_free,
            COUNT(DISTINCT b.enrollment_id)::int AS learners_booked,
            COUNT(b.id) FILTER (WHERE b.calendar_event_id IS NULL)::int AS calendar_pending
     FROM interview_slots s LEFT JOIN interview_bookings b ON b.slot_id = s.id
     WHERE s.phase_id = $1`,
    [phase.id]
  )).rows[0];
  const learners = await eligibleLearners(phase);
  return Object.assign(s, {
    eligible_learners: learners.length,
    fully_booked: learners.filter(l => l.pending === 0).length,
    partly_booked: learners.filter(l => l.pending > 0 && l.booked_count > 0).length,
    not_started: learners.filter(l => l.booked_count === 0).length,
    pending_learners: learners.filter(l => l.pending > 0).length,
    invited_pending: learners.filter(l => l.pending > 0 && l.invited_at).length,
    not_invited: learners.filter(l => l.pending > 0 && !l.invited_at).length,
  });
}

/* ── Background tick (every 15 min from server.js) ──────────── */

async function tick() {
  // 1. Calendar events that failed earlier (e.g. calendar not shared yet).
  const pending = (await query(
    `SELECT id FROM interview_bookings WHERE calendar_event_id IS NULL AND calendar_attempts < 20 ORDER BY id LIMIT 50`
  )).rows;
  for (const p of pending) await syncCalendar(p.id);

  // 2. Day-before reminders. Bookings made inside the last 24h before
  //    the slot are skipped - the confirmation email just went out.
  const due = (await query(
    `UPDATE interview_bookings b SET reminder_sent_at = NOW()
     FROM interview_slots s
     WHERE s.id = b.slot_id AND b.reminder_sent_at IS NULL
       AND s.starts_at > NOW() AND s.starts_at <= NOW() + INTERVAL '24 hours'
     RETURNING b.id, b.phase_id, b.enrollment_id, b.student_name, b.student_email,
               s.starts_at, s.ends_at, (b.created_at > s.starts_at - INTERVAL '24 hours') AS booked_late,
               (SELECT COUNT(*)::int FROM interview_bookings b2 JOIN interview_slots s2 ON s2.id = b2.slot_id
                WHERE b2.enrollment_id = b.enrollment_id AND s2.starts_at <= s.starts_at) AS interview_no`
  )).rows;
  for (const b of due) {
    if (b.booked_late || !b.student_email) continue;
    if (!(await activeEnrollmentById(b.enrollment_id))) continue; // refunded since booking
    const phase = await getPhase(b.phase_id);
    const { total } = await slotAllowance(phase.program_slug, b.student_email, phase.slots_per_learner);
    emails.sendDayBeforeReminder({ to: b.student_email, name: b.student_name, booking: b, phase, total })
      .catch(err => console.error('[interview reminder]', err.message));
  }

  // 3. Owner daily summary, 9 PM IST (catches up later that evening if
  //    the free-tier server was asleep at 9). Claimed in the DB so a
  //    restart never sends it twice.
  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  if (istNow.getUTCHours() >= 21) await maybeSendDigest(istNow.toISOString().slice(0, 10));
}

async function maybeSendDigest(todayIST) {
  const phases = (await query(
    `SELECT ${PHASE_COLS} FROM interview_phases p
     WHERE p.status <> 'draft' AND p.date_to >= ($1::date - 1) ORDER BY p.date_from`,
    [todayIST]
  )).rows;
  if (!phases.length) return;

  const claim = await query(`INSERT INTO interview_digest_log (digest_date) VALUES ($1) ON CONFLICT DO NOTHING RETURNING 1`, [todayIST]);
  if (!claim.rows.length) return;

  const ids = phases.map(p => p.id);
  const newBookings = (await query(
    `SELECT b.*, s.starts_at FROM interview_bookings b JOIN interview_slots s ON s.id = b.slot_id
     WHERE b.phase_id = ANY($1::int[]) AND b.created_at > NOW() - INTERVAL '24 hours' ORDER BY b.created_at`,
    [ids]
  )).rows;
  const tomorrow = (await query(
    `SELECT b.*, s.starts_at FROM interview_bookings b JOIN interview_slots s ON s.id = b.slot_id
     WHERE b.phase_id = ANY($1::int[]) AND (s.starts_at AT TIME ZONE 'Asia/Kolkata')::date = ($2::date + 1)
     ORDER BY s.starts_at`,
    [ids, todayIST]
  )).rows;
  for (const p of phases) Object.assign(p, await phaseStats(p));

  await emails.sendDailyDigest({ newBookings, tomorrow, phases });
  console.log(`[interview digest] sent for ${todayIST}`);
}

/* ── Mock Interview Add-on: offer + purchase emails ──────────── */

/* The enrollment a learner's booking link is signed for: their RPSC AE
   Interview enrollment, else (interviews-only buyer) their first add-on
   pack. Earliest paid, not refunded, matched by email - the same row
   eligibleLearners() picks, so admin links and emails agree. */
async function baseEnrollmentForEmail(email) {
  if (!email) return null;
  const r = await query(
    `SELECT id FROM enrollments
     WHERE (program_slug = ANY($1::text[]) OR program_slug = ANY($3::text[]))
       AND status = 'paid' AND refund_status != 'initiated'
       AND LOWER(TRIM(student_email)) = LOWER(TRIM($2))
     ORDER BY (order_id LIKE 'JSP-ADMINPREVIEW-%'), (program_slug = ANY($1::text[])) DESC, paid_at ASC LIMIT 1`,
    [slugsFor(ADDON_BASE_PROGRAM), email, ADDON_SLUGS]
  );
  return r.rows.length ? activeEnrollmentById(r.rows[0].id) : null;
}

/* Admin summary: packs sold and who has / hasn't had the offer email. */
async function addonSummary() {
  const learners = await eligibleLearners({ id: 0, program_slug: ADDON_BASE_PROGRAM, slots_per_learner: 3 });
  const sold = (await query(
    `SELECT program_slug, COUNT(*)::int AS n FROM enrollments
     WHERE program_slug = ANY($1::text[]) AND status = 'paid' AND refund_status != 'initiated'
       AND order_id NOT LIKE 'JSP-ADMINPREVIEW-%'
     GROUP BY program_slug`,
    [ADDON_SLUGS]
  )).rows;
  const offered = new Set((await query(`SELECT enrollment_id FROM interview_addon_offers`)).rows.map(r => r.enrollment_id));
  const targets = learners.filter(l => l.student_email && l.has_base && !l.extra_slots);
  return {
    packs: ADDON_PACKS.map(p => ({ slug: p.slug, slots: p.slots, sold: (sold.find(x => x.program_slug === p.slug) || {}).n || 0 })),
    buyers: learners.filter(l => l.extra_slots > 0).length,
    interviews_only: learners.filter(l => !l.has_base).length,
    offered: targets.filter(l => offered.has(l.id)).length,
    not_offered: targets.filter(l => !offered.has(l.id)).length,
    // RPSC learners by branch (payment-time branch, else booked branch).
    branches: {
      total: learners.length,
      programme: learners.filter(l => l.has_base).length,
      interviews_only: learners.filter(l => !l.has_base).length,
      rows: BRANCHES.concat([null]).map(b => {
        const ls = learners.filter(l => (l.branch || null) === b);
        return { branch: b, total: ls.length, programme: ls.filter(l => l.has_base).length, interviews_only: ls.filter(l => !l.has_base).length };
      }),
    },
  };
}

/* Email the add-on offer (with their own booking link) to every paid
   learner who hasn't bought a pack or had the offer yet. Background send. */
async function sendAddonOffers() {
  const learners = (await eligibleLearners({ id: 0, program_slug: ADDON_BASE_PROGRAM, slots_per_learner: 3 }))
    .filter(l => l.student_email && l.has_base && !l.extra_slots);
  const offered = new Set((await query(`SELECT enrollment_id FROM interview_addon_offers`)).rows.map(r => r.enrollment_id));
  const targets = learners.filter(l => !offered.has(l.id));
  const prices = await addonPrices();
  (async () => {
    for (const l of targets) {
      try {
        const claim = await query(`INSERT INTO interview_addon_offers (enrollment_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING 1`, [l.id]);
        if (!claim.rows.length) continue;
        await emails.sendAddonOfferEmail({ to: l.student_email, name: l.student_name, link: bookingLink(l.id), packs: prices });
      } catch (err) {
        console.error(`[interview addon offer] ${l.student_email}:`, err.message);
      }
    }
    console.log(`[interview addon offer] queued ${targets.length} email(s)`);
  })();
  return targets.length;
}

/* Live pack prices (programs table, admin-editable) with config fallback. */
async function addonPrices() {
  const rows = (await query(`SELECT slug, price FROM programs WHERE slug = ANY($1::text[])`, [ADDON_SLUGS])).rows;
  return ADDON_PACKS.map(p => {
    const row = rows.find(r => r.slug === p.slug);
    return { slug: p.slug, slots: p.slots, price: row && row.price != null ? Number(row.price) : p.price };
  });
}

/* After an add-on pack is paid (replaces the generic welcome email -
   no form to fill): how many interviews they have now + booking link. */
async function sendAddonPurchasedEmail(addonEnrollment) {
  const base = await baseEnrollmentForEmail(addonEnrollment.student_email);
  if (!base) {
    console.error(`[interview addon] paid add-on ${addonEnrollment.order_id} has no active enrollment for ${addonEnrollment.student_email}`);
    return;
  }
  const pack = ADDON_PACKS.find(p => p.slug === addonEnrollment.program_slug);
  const { included, total } = await slotAllowance(ADDON_BASE_PROGRAM, base.student_email, await baseSlotsPerLearner());
  const booked = (await learnerBookings(base)).length;
  const open = (await openPhasesWithAvailability(ADDON_BASE_PROGRAM)).filter(p => p.status === 'open');
  await emails.sendAddonPurchasedEmail({
    to: base.student_email, name: base.student_name, added: pack ? pack.slots : 0,
    total, booked, interviewsOnly: included === 0, link: bookingLink(base.id), phaseOpen: open.length > 0,
  });
}

module.exports = {
  migrate, generateSlotTimes, istDateKey,
  signBookingToken, bookingLink, verifyBookingToken, activeEnrollmentById,
  getPhase, learnerBookings, withDisplayNumbers, openPhasesWithAvailability, bookSlots, BookingError,
  releaseLearner, updateCalendarLocations, announceVenue, eligibleLearners, sendInvites, inviteNewEnrollment, phaseStats,
  syncCalendar, tick, PHASE_COLS,
  extraSlotsFor, slotAllowance, programOf, branchFor, baseEnrollmentForEmail, addonSummary, addonPrices, sendAddonOffers, sendAddonPurchasedEmail,
};
