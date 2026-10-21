/* ============================================================
   services/interviewCalendar.js  -  Google Calendar sync for
   interview slot bookings (routes/interviews.js).

   Every booked slot becomes an event on Jaspal sir's personal
   calendar (INTERVIEW_CALENDAR_ID, default jaspalsingh.pec@gmail.com)
   so the time shows as busy there. Uses the same service account as
   googleSheetsService.js. One-time manual setup: in Google Calendar,
   Settings > the calendar > "Share with specific people" > add
   GOOGLE_SERVICE_ACCOUNT_EMAIL with "Make changes to events".
   Service accounts have zero access until that share exists.

   No attendees are added - a service account cannot send invites
   without Workspace domain-wide delegation. Learners get their own
   .ics file in the confirmation email instead.
   ============================================================ */

const { google } = require('googleapis');

const TZ = 'Asia/Kolkata';

function calendarId() {
  return process.env.INTERVIEW_CALENDAR_ID || 'jaspalsingh.pec@gmail.com';
}

function isConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

function client() {
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/calendar.events']
  );
  return google.calendar({ version: 'v3', auth });
}

/* booking: interview_bookings row joined with slot starts_at/ends_at and
   phase venue fields. Returns the created event id. */
async function createEvent(b) {
  if (!isConfigured()) throw new Error('Google service account env vars are not set.');
  const res = await client().events.insert({
    calendarId: calendarId(),
    requestBody: {
      // No "Interview 1/2/3" in the title: learners can book slots in any
      // order over time, so the number (by date) can change after this
      // event is created.
      summary: `RPSC AE Interview - ${b.student_name} (${b.branch})${b.roll_number ? ' - ' + b.roll_number : ''}`,
      location: [b.venue_name, b.venue_address].filter(Boolean).join(', '),
      description: [
        `Learner: ${b.student_name}`,
        `Branch: ${b.branch}`,
        b.roll_number ? `Roll no: ${b.roll_number}` : null,
        `Phone: ${b.student_phone || '-'}`,
        `Email: ${b.student_email || '-'}`,
        `${b.phase_name} - ${b.slots_per_learner || 3} slots per learner`,
        '',
        'Booked via jaspalsingh.in',
      ].filter(v => v !== null).join('\n'),
      start: { dateTime: new Date(b.starts_at).toISOString(), timeZone: TZ },
      end:   { dateTime: new Date(b.ends_at).toISOString(),   timeZone: TZ },
      transparency: 'opaque', // shows as busy - blocks the time on sir's calendar
      colorId: '11',
    },
  });
  return res.data.id;
}

async function deleteEvent(eventId) {
  if (!eventId || !isConfigured()) return;
  try {
    await client().events.delete({ calendarId: calendarId(), eventId });
  } catch (err) {
    // Already deleted by hand on the calendar - nothing left to do.
    if (err.code === 404 || err.code === 410) return;
    throw err;
  }
}

/* Admin "Check calendar" button - proves the share is in place. */
async function checkAccess() {
  if (!isConfigured()) return { ok: false, calendarId: calendarId(), error: 'Google service account env vars are not set on Render.' };
  try {
    await client().events.list({ calendarId: calendarId(), maxResults: 1, timeMin: new Date().toISOString() });
    return { ok: true, calendarId: calendarId(), serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL };
  } catch (err) {
    return {
      ok: false,
      calendarId: calendarId(),
      serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      error: (err.code === 404 || err.code === 403)
        ? `The calendar is not shared with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} yet (needs "Make changes to events").`
        : err.message,
    };
  }
}

module.exports = { createEvent, deleteEvent, checkAccess, isConfigured, calendarId };
