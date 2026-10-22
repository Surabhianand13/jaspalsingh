/* ============================================================
   routes/interviews.js  -  Interview slot booking
   Logic lives in services/interviewService.js.

   Learner (booking link token ?t=... from the invite email, OR a
   logged-in learner JWT + ?program=slug from My Programs):
     GET  /api/interviews/booking          - my booked slots + open slots to pick
     POST /api/interviews/booking          - book 1..remaining slots

   Admin (protect):
     GET    /api/interviews/admin/overview
     GET    /api/interviews/admin/calendar-check
     POST   /api/interviews/admin/phases                 - create + generate slots
     PATCH  /api/interviews/admin/phases/:id             - status / name / venue (+ venue_tba)
     DELETE /api/interviews/admin/phases/:id             - only with no bookings
     GET    /api/interviews/admin/phases/:id/schedule    - day-wise slots + learners
     GET    /api/interviews/admin/phases/:id/learners    - paid learners + status + links
     POST   /api/interviews/admin/phases/:id/invites     - { mode: 'new' | 'remind' }
     POST   /api/interviews/admin/phases/:id/announce-venue - email the final venue to booked learners
     POST   /api/interviews/admin/slots/:id/block        - { blocked: bool }
     DELETE /api/interviews/admin/learners/:enrollmentId/bookings - release a learner
     POST   /api/interviews/admin/sample-emails          - { to } dummy copies of every email
   ============================================================ */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { protect } = require('../middleware/auth');
const { getActiveEnrollment } = require('../utils/enrollmentAccess');
const { canonicalize } = require('../utils/programSlugAliases');
const svc = require('../services/interviewService');
const calendar = require('../services/interviewCalendar');
const emails = require('../services/interviewEmails');
const { SITE } = require('../services/paymentEmailService');
const { BRANCHES, INSTRUCTIONS, TERMS, CONTACT_PHONE, CONTACT_WA_LINK, DEFAULT_VENUE } = require('../config/interviewRules');

const DEFAULT_PROGRAM = 'rpsc-ae-interview';

/* ── Learner identity ───────────────────────────────────────── */

async function resolveEnrollment(req) {
  const token = (req.body && req.body.t) || req.query.t;
  if (token) {
    let eid;
    try { eid = svc.verifyBookingToken(token); }
    catch (e) { throw new svc.BookingError('This booking link is invalid or has expired. Please log in to book, or message us on WhatsApp.', 401); }
    const enr = await svc.activeEnrollmentById(eid);
    if (!enr) throw new svc.BookingError('No active enrollment found for this booking link.', 403);
    return enr;
  }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) throw new svc.BookingError('Please log in to book your slots.', 401);
  let decoded;
  try { decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET); }
  catch (e) { throw new svc.BookingError('Session expired. Please log in again.', 401); }
  if (!decoded.learner && decoded.role !== 'learner') throw new svc.BookingError('Please log in to book your slots.', 401);

  const lr = await query('SELECT id, email, phone FROM learners WHERE id = $1', [decoded.id]);
  const learner = lr.rows[0];
  if (!learner) throw new svc.BookingError('Please log in to book your slots.', 401);
  const program = canonicalize(String((req.body && req.body.program) || req.query.program || DEFAULT_PROGRAM));
  const active = await getActiveEnrollment(learner.id, learner.email, learner.phone, program);
  if (!active) throw new svc.BookingError('No active enrollment for this program.', 403);
  return svc.activeEnrollmentById(active.id);
}

function sendError(res, next, err) {
  if (err instanceof svc.BookingError) return res.status(err.status).json({ error: err.message });
  next(err);
}

function publicPhase(p) {
  return {
    id: p.id, name: p.name, slots_per_learner: p.slots_per_learner, slot_minutes: p.slot_minutes,
    date_from: p.date_from, date_to: p.date_to, windows: p.windows,
    venue_tba: !!p.venue_tba,
    venue_name: p.venue_tba ? null : p.venue_name, venue_address: p.venue_tba ? null : p.venue_address, maps_link: p.venue_tba ? null : p.maps_link,
  };
}

const STATIC_INFO = { branches: BRANCHES, instructions: INSTRUCTIONS, terms: TERMS, contact: { phone: CONTACT_PHONE, whatsapp: CONTACT_WA_LINK } };

/* What the booking page needs: slots booked so far (numbered by date,
   with their venue) and - while any are pending - the open phases with
   the learner's already-booked days marked as taken. */
async function bookingState(enr) {
  const bookings = await svc.learnerBookings(enr);
  const phases = await svc.openPhasesWithAvailability(enr.program_slug, bookings.map(b => svc.istDateKey(b.starts_at)));
  const firstPhase = bookings.length ? await svc.getPhase(bookings[0].phase_id) : phases[0];
  const total = (firstPhase && firstPhase.slots_per_learner) || 3;
  const remaining = Math.max(0, total - bookings.length);
  return {
    booked: {
      branch: bookings.length ? bookings[0].branch : null,
      total,
      remaining,
      bookings: bookings.map(b => ({
        id: b.id, interview_no: b.interview_no, starts_at: b.starts_at, ends_at: b.ends_at, phase_name: b.phase_name,
        venue_tba: !!b.venue_tba,
        venue_name: b.venue_tba ? null : b.venue_name, venue_address: b.venue_tba ? null : b.venue_address, maps_link: b.venue_tba ? null : b.maps_link,
      })),
    },
    phases: remaining ? phases.map(p => Object.assign(publicPhase(p), { bookable: p.bookable, days: p.days })) : [],
  };
}

/* ── GET /booking ───────────────────────────────────────────── */

router.get('/booking', async (req, res, next) => {
  try {
    const enr = await resolveEnrollment(req);
    const learner = { name: enr.student_name, roll_number: enr.roll_number, program_name: enr.program_name };
    res.json(Object.assign({ learner }, await bookingState(enr), STATIC_INFO));
  } catch (err) { sendError(res, next, err); }
});

/* ── POST /booking ──────────────────────────────────────────── */

router.post('/booking', async (req, res, next) => {
  try {
    const enr = await resolveEnrollment(req);
    const { phase_id, slot_ids, branch, agreed } = req.body || {};
    // Branch is only sent with the first booking - later ones reuse it.
    if (branch !== undefined && branch !== null && !BRANCHES.includes(branch)) return res.status(400).json({ error: 'Please choose your branch.' });
    if (agreed !== true) return res.status(400).json({ error: 'Please accept the slot booking terms.' });
    const result = await svc.bookSlots(enr, { phaseId: Number(phase_id), slotIds: slot_ids, branch: branch || null });
    res.status(201).json(Object.assign({ ok: true, new_ids: result.newIds }, await bookingState(enr)));
  } catch (err) { sendError(res, next, err); }
});

/* ══════════════════════ ADMIN ══════════════════════════════ */

router.get('/admin/overview', protect, async (req, res, next) => {
  try {
    const phases = (await query(`SELECT ${svc.PHASE_COLS} FROM interview_phases p ORDER BY p.date_from DESC, p.id DESC`)).rows;
    for (const p of phases) p.stats = await svc.phaseStats(p);
    res.json({
      phases,
      calendar: { configured: calendar.isConfigured(), calendarId: calendar.calendarId(), serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || null },
      defaults: { program_slug: DEFAULT_PROGRAM, venue: DEFAULT_VENUE },
    });
  } catch (err) { next(err); }
});

router.get('/admin/calendar-check', protect, async (req, res, next) => {
  try { res.json(await calendar.checkAccess()); } catch (err) { next(err); }
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

router.post('/admin/phases', protect, async (req, res, next) => {
  try {
    const b = req.body || {};
    const phase = {
      program_slug: canonicalize(String(b.program_slug || DEFAULT_PROGRAM).trim()),
      name: String(b.name || '').trim(),
      date_from: b.date_from, date_to: b.date_to,
      windows: Array.isArray(b.windows) ? b.windows.filter(w => w && w.start && w.end) : [],
      slot_minutes: parseInt(b.slot_minutes, 10) || 15,
      slots_per_learner: parseInt(b.slots_per_learner, 10) || 3,
      skip_sundays: b.skip_sundays !== false,
      // Venue not finalised: learners see "venue details will be shared
      // soon on email" until it is filled in from Edit venue.
      venue_tba: b.venue_tba === true,
      venue_name: String(b.venue_name || '').trim(),
      venue_address: String(b.venue_address || '').trim(),
      maps_link: String(b.maps_link || '').trim(),
    };
    if (!phase.venue_tba && !phase.venue_address) return res.status(400).json({ error: 'Enter the venue address, or tick "Venue not finalised yet".' });
    if (!phase.name) return res.status(400).json({ error: 'Phase name is required.' });
    if (!DATE_RE.test(phase.date_from || '') || !DATE_RE.test(phase.date_to || '') || phase.date_to < phase.date_from) {
      return res.status(400).json({ error: 'Pick a valid From and To date.' });
    }
    if ((new Date(phase.date_to) - new Date(phase.date_from)) / 86400000 > 31) return res.status(400).json({ error: 'A phase can be at most 31 days long.' });
    if (!phase.windows.length || phase.windows.some(w => !HM_RE.test(w.start) || !HM_RE.test(w.end) || w.end <= w.start)) {
      return res.status(400).json({ error: 'Each time window needs a valid start and end time (end after start).' });
    }
    if (phase.slot_minutes < 5 || phase.slot_minutes > 180) return res.status(400).json({ error: 'Slot length must be 5-180 minutes.' });
    if (phase.slots_per_learner < 1 || phase.slots_per_learner > 10) return res.status(400).json({ error: 'Slots per learner must be 1-10.' });

    const times = svc.generateSlotTimes(phase);
    if (!times.length) return res.status(400).json({ error: 'These settings produce no slots.' });

    const ins = await query(
      `INSERT INTO interview_phases (program_slug, name, status, slots_per_learner, slot_minutes, date_from, date_to, windows, skip_sundays, venue_name, venue_address, maps_link, venue_tba)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [phase.program_slug, phase.name, phase.slots_per_learner, phase.slot_minutes, phase.date_from, phase.date_to,
       JSON.stringify(phase.windows), phase.skip_sundays, phase.venue_name, phase.venue_address, phase.maps_link, phase.venue_tba]
    );
    const id = ins.rows[0].id;
    await query(
      `INSERT INTO interview_slots (phase_id, starts_at, ends_at)
       SELECT $1, x.s, x.e FROM UNNEST($2::timestamptz[], $3::timestamptz[]) AS x(s, e)`,
      [id, times.map(t => t.starts_at.toISOString()), times.map(t => t.ends_at.toISOString())]
    );
    res.status(201).json({ id, slots: times.length });
  } catch (err) { next(err); }
});

router.patch('/admin/phases/:id', protect, async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [], vals = [];
    if (b.status !== undefined) {
      if (!['draft', 'open', 'closed'].includes(b.status)) return res.status(400).json({ error: 'Invalid status.' });
      vals.push(b.status); sets.push(`status = $${vals.length}`);
    }
    ['name', 'venue_name', 'venue_address', 'maps_link'].forEach(k => {
      if (b[k] !== undefined) { vals.push(String(b[k]).trim()); sets.push(`${k} = $${vals.length}`); }
    });
    if (b.venue_tba !== undefined) { vals.push(b.venue_tba === true); sets.push(`venue_tba = $${vals.length}`); }
    if (b.venue_tba === false && b.venue_address !== undefined && !String(b.venue_address).trim()) {
      return res.status(400).json({ error: 'Enter the venue address, or tick "Venue not finalised yet".' });
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    vals.push(req.params.id);
    const r = await query(`UPDATE interview_phases SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`, vals);
    if (!r.rows.length) return res.status(404).json({ error: 'Phase not found.' });

    // Venue changed: move existing calendar events to the new location
    // (background), and tell the admin how many learners could be emailed.
    const venueChanged = ['venue_name', 'venue_address', 'maps_link', 'venue_tba'].some(k => b[k] !== undefined);
    let bookedLearners = 0;
    if (venueChanged) {
      const phase = await svc.getPhase(req.params.id);
      svc.updateCalendarLocations(phase).catch(err => console.error('[interview calendar location]', err.message));
      bookedLearners = (await query(`SELECT COUNT(DISTINCT enrollment_id)::int AS n FROM interview_bookings WHERE phase_id = $1`, [phase.id])).rows[0].n;
    }
    res.json({ ok: true, booked_learners: bookedLearners });
  } catch (err) { next(err); }
});

router.delete('/admin/phases/:id', protect, async (req, res, next) => {
  try {
    const n = await query(`SELECT COUNT(*)::int AS n FROM interview_bookings WHERE phase_id = $1`, [req.params.id]);
    if (n.rows[0].n) return res.status(409).json({ error: 'This phase has bookings - close it instead of deleting.' });
    await query(`DELETE FROM interview_phases WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/admin/phases/:id/schedule', protect, async (req, res, next) => {
  try {
    const phase = await svc.getPhase(req.params.id);
    if (!phase) return res.status(404).json({ error: 'Phase not found.' });
    const rows = (await query(
      `SELECT s.id, s.starts_at, s.ends_at, s.is_blocked,
              b.id AS booking_id, b.enrollment_id, b.branch,
              (SELECT COUNT(*)::int FROM interview_bookings b2 JOIN interview_slots s2 ON s2.id = b2.slot_id
                WHERE b2.enrollment_id = b.enrollment_id AND s2.starts_at <= s.starts_at) AS interview_no, b.student_name, b.student_phone, b.student_email,
              b.roll_number, b.calendar_event_id, b.calendar_error, b.created_at AS booked_at,
              (e.refund_status = 'initiated') AS refunded
       FROM interview_slots s
       LEFT JOIN interview_bookings b ON b.slot_id = s.id
       LEFT JOIN enrollments e ON e.id = b.enrollment_id
       WHERE s.phase_id = $1 ORDER BY s.starts_at`,
      [phase.id]
    )).rows;
    const days = {};
    rows.forEach(r => { const k = svc.istDateKey(r.starts_at); (days[k] = days[k] || []).push(r); });
    res.json({ phase, days: Object.keys(days).sort().map(date => ({ date, slots: days[date] })) });
  } catch (err) { next(err); }
});

router.get('/admin/phases/:id/learners', protect, async (req, res, next) => {
  try {
    const phase = await svc.getPhase(req.params.id);
    if (!phase) return res.status(404).json({ error: 'Phase not found.' });
    const learners = await svc.eligibleLearners(phase);
    res.json({ learners: learners.map(l => Object.assign(l, { booking_link: svc.bookingLink(l.id) })) });
  } catch (err) { next(err); }
});

router.post('/admin/phases/:id/announce-venue', protect, async (req, res, next) => {
  try {
    const phase = await svc.getPhase(req.params.id);
    if (!phase) return res.status(404).json({ error: 'Phase not found.' });
    const count = await svc.announceVenue(phase);
    res.json({ ok: true, queued: count });
  } catch (err) { sendError(res, next, err); }
});

router.post('/admin/phases/:id/invites', protect, async (req, res, next) => {
  try {
    const phase = await svc.getPhase(req.params.id);
    if (!phase) return res.status(404).json({ error: 'Phase not found.' });
    const mode = req.body && req.body.mode === 'remind' ? 'remind' : 'new';
    const count = await svc.sendInvites(phase, mode);
    res.json({ ok: true, queued: count });
  } catch (err) { sendError(res, next, err); }
});

router.post('/admin/slots/:id/block', protect, async (req, res, next) => {
  try {
    const blocked = !!(req.body && req.body.blocked);
    const r = await query(
      `UPDATE interview_slots s SET is_blocked = $1
       WHERE s.id = $2 AND NOT EXISTS (SELECT 1 FROM interview_bookings b WHERE b.slot_id = s.id) RETURNING id`,
      [blocked, req.params.id]
    );
    if (!r.rows.length) return res.status(409).json({ error: 'This slot is booked - release the learner first.' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/admin/learners/:enrollmentId/bookings', protect, async (req, res, next) => {
  try {
    const released = await svc.releaseLearner(req.params.enrollmentId);
    res.json({ ok: true, released });
  } catch (err) { next(err); }
});

/* Dummy copies of every learner email (+ the owner summary) to one
   address, so the owner can see exactly what learners will receive.
   Uses an existing phase's settings when one exists, else Phase 1. */
router.post('/admin/sample-emails', protect, async (req, res, next) => {
  try {
    const to = String((req.body && req.body.to) || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Enter a valid email address.' });

    const existing = (await query(`SELECT ${svc.PHASE_COLS} FROM interview_phases p ORDER BY (p.status = 'open') DESC, p.date_from LIMIT 1`)).rows[0];
    const phase = existing || {
      id: 0, name: 'Phase 1', status: 'open', slots_per_learner: 3, slot_minutes: 15,
      date_from: '2026-11-02', date_to: '2026-11-07',
      windows: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }],
      venue_name: DEFAULT_VENUE.name, venue_address: DEFAULT_VENUE.address, maps_link: DEFAULT_VENUE.mapsLink,
    };
    const at = (day, hm) => new Date(`${day}T${hm}:00+05:30`);
    const plus = (d, m) => new Date(d.getTime() + m * 60000);
    const d0 = new Date(phase.date_from + 'T00:00:00Z');
    const day = n => new Date(d0.getTime() + n * 86400000).toISOString().slice(0, 10);
    const slots = [at(day(0), '10:15'), at(day(2), '14:30'), at(day(4), '11:00')];
    const all = svc.withDisplayNumbers(slots.map((s, i) => ({ id: 'sample-' + i, starts_at: s, ends_at: plus(s, phase.slot_minutes) })));
    const name = 'Rahul Sharma';
    const prefix = '[SAMPLE] ';
    const demoLink = `${SITE}/book-interview/?demo=1${phase.venue_tba ? '&tba=1' : ''}`;
    const learner = { to, name, roll: 'RPSCAE0012', branch: 'Mechanical', phase, total: phase.slots_per_learner, link: demoLink, subjectPrefix: prefix };

    // 1. invite  2. "not booked yet" reminder
    await emails.sendInviteEmail({ to, name, phase, link: demoLink, subjectPrefix: prefix });
    await emails.sendInviteEmail({ to, name, phase, link: demoLink, reminder: true, subjectPrefix: prefix });
    // 3. first booking: 1 of 3 booked, 2 pending
    await emails.sendConfirmationEmail(Object.assign({ bookings: [all[1]], newIds: new Set([all[1].id]) }, learner, { bookings: svc.withDisplayNumbers([all[1]]) }));
    // 4. "still to book" reminder for someone who has 1 of 3
    await emails.sendInviteEmail({ to, name, phase, link: demoLink, reminder: true, bookedCount: 1, subjectPrefix: prefix });
    // 5. later booking that completes the set: all 3 booked
    await emails.sendConfirmationEmail(Object.assign({}, learner, { bookings: all, newIds: new Set([all[0].id, all[2].id]) }));
    // 6. day-before reminder
    await emails.sendDayBeforeReminder({ to, name, booking: all[1], phase, subjectPrefix: prefix });
    // 7. owner daily summary
    await emails.sendDailyDigest({
      to, subjectPrefix: prefix,
      newBookings: all.map(b => Object.assign({ enrollment_id: 1, student_name: name, student_phone: '98XXXXXX10', roll_number: 'RPSCAE0012', branch: 'Mechanical' }, b)),
      tomorrow: [Object.assign({ student_name: name, student_phone: '98XXXXXX10', roll_number: 'RPSCAE0012', branch: 'Mechanical' }, all[1])],
      phases: [Object.assign({}, phase, { fully_booked: 1, partly_booked: 4, not_started: 59, eligible_learners: 64, slots_free: 180 })],
    });
    // 8. venue confirmed (sent later from "Email venue to booked learners")
    const finalVenue = phase.venue_tba || !phase.venue_address
      ? Object.assign({}, phase, { venue_tba: false, venue_name: DEFAULT_VENUE.name, venue_address: DEFAULT_VENUE.address, maps_link: DEFAULT_VENUE.mapsLink })
      : phase;
    await emails.sendVenueAnnouncement({ to, name, bookings: all, phase: finalVenue, subjectPrefix: prefix });
    res.json({ ok: true, sent: 8 });
  } catch (err) { next(err); }
});

module.exports = router;
