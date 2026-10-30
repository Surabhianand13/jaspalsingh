/* ============================================================
   services/interviewEmails.js  -  Emails for interview slot booking
   (routes/interviews.js, services/interviewService.js)

     sendInviteEmail         - booking link (invite + "not booked yet" reminder)
     sendConfirmationEmail   - all 3 slots in one email, .ics attached
     sendDayBeforeReminder   - ~24h before each slot
     sendDailyDigest         - owner summary, once a day
     sendAddonOfferEmail     - Mock Interview Add-on offer (admin button)
     sendAddonPurchasedEmail - add-on paid: extra interviews added
   All go through resendQueue like every other Resend email.
   ============================================================ */

const { send: resendSend, PRIORITY } = require('./resendQueue');
const { baseHtml, esc, FROM, SITE, ADMIN_EMAIL } = require('./paymentEmailService');
const { CONTACT_PHONE, CONTACT_WA_LINK, INSTRUCTIONS, TERMS } = require('../config/interviewRules');

const TZ = 'Asia/Kolkata';
const RED = '#C81240';

/* ── Formatting ───────────────────────────────────────────── */

function fmtDay(d) {
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).toUpperCase();
}
function fmtSlot(s) {
  return `${fmtDay(s.starts_at)}, ${fmtTime(s.starts_at)} - ${fmtTime(s.ends_at)}`;
}
/* '2026-11-02','2026-11-07' -> '2 - 7 Nov 2026' */
function fmtRange(from, to) {
  const f = new Date(from + 'T12:00:00+05:30');
  const t = new Date(to + 'T12:00:00+05:30');
  const o = (d, opts) => d.toLocaleDateString('en-IN', Object.assign({ timeZone: TZ }, opts));
  if (from === to) return o(f, { day: 'numeric', month: 'short', year: 'numeric' });
  if (o(f, { month: 'short' }) === o(t, { month: 'short' })) {
    return `${o(f, { day: 'numeric' })} - ${o(t, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${o(f, { day: 'numeric', month: 'short' })} - ${o(t, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
/* windows [{start:'09:00',end:'13:00'}] -> '9:00 AM - 1:00 PM and 2:00 PM - 6:00 PM' */
function fmtWindows(windows) {
  const t = hm => fmtTime(new Date(`2026-01-01T${hm}:00+05:30`));
  return (windows || []).map(w => `${t(w.start)} - ${t(w.end)}`).join(' and ');
}

/* ── Shared blocks ────────────────────────────────────────── */

function sectionLabel(text) {
  return `<div style="font-size:12px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px;">${text}</div>`;
}

const VENUE_TBA_TEXT = 'Venue details will be shared soon on email.';

function venueBlock(phase) {
  if (phase.venue_tba) {
    return `
    <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:12px;padding:16px 20px;margin-bottom:22px;">
      ${sectionLabel('Venue')}
      <div style="font-size:15px;font-weight:800;color:#1e3a8a;">📍 ${VENUE_TBA_TEXT}</div>
      <div style="font-size:13px;color:#1e40af;line-height:1.6;margin-top:4px;">Your slot date and time are confirmed - only the venue address is being finalised.</div>
    </div>`;
  }
  return `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:22px;">
      ${sectionLabel('Venue')}
      <div style="font-size:15px;font-weight:800;color:#1A1A2E;margin-bottom:4px;">${esc(phase.venue_name || '')}</div>
      <div style="font-size:14px;color:#374151;line-height:1.6;margin-bottom:10px;">${esc(phase.venue_address || '')}</div>
      ${phase.maps_link ? `<a href="${esc(phase.maps_link)}" style="font-size:14px;font-weight:700;color:${RED};text-decoration:none;">📍 Open in Google Maps &rarr;</a>` : ''}
    </div>`;
}

function instructionsBlock() {
  return `
    <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;margin-bottom:22px;">
      ${sectionLabel('Bring with you &amp; reporting')}
      <ul style="margin:0;padding-left:20px;font-size:14px;color:#374151;line-height:1.8;">
        ${INSTRUCTIONS.map(i => `<li>${esc(i)}</li>`).join('')}
      </ul>
    </div>`;
}

function termsBlock() {
  return `
    <div style="margin-bottom:22px;">
      ${sectionLabel('Slot booking terms &amp; conditions')}
      <ol style="margin:0;padding-left:20px;font-size:12.5px;color:#6b7280;line-height:1.7;">
        ${TERMS.map(t => `<li>${esc(t)}</li>`).join('')}
      </ol>
    </div>`;
}

function helpLine() {
  return `<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.7;text-align:center;">
    Questions about your slot? Call or WhatsApp <a href="${CONTACT_WA_LINK}" style="color:${RED};font-weight:700;text-decoration:none;">${CONTACT_PHONE}</a>
  </p>`;
}

function button(href, label) {
  return `<div style="text-align:center;margin:0 0 24px;">
    <a href="${esc(href)}" style="display:inline-block;background:${RED};color:#fff;border-radius:10px;padding:15px 34px;font-size:16px;font-weight:800;text-decoration:none;">${label}</a>
  </div>`;
}

/* ── .ics (one VEVENT per slot) ───────────────────────────── */

function icsText(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsDate(d) {
  return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function buildIcs(bookings, phase) {
  const now = icsDate(new Date());
  const location = phase.venue_tba ? 'Venue to be announced - details will be shared on email' : [phase.venue_name, phase.venue_address].filter(Boolean).join(', ');
  const events = bookings.map(b => [
    'BEGIN:VEVENT',
    `UID:interview-${b.id || b.slot_id}@jaspalsingh.in`,
    `DTSTAMP:${now}`,
    `DTSTART:${icsDate(b.starts_at)}`,
    `DTEND:${icsDate(b.ends_at)}`,
    `SUMMARY:${icsText(`RPSC AE Interview ${b.interview_no} - Dr. Jaspal Singh`)}`,
    `LOCATION:${icsText(location)}`,
    `DESCRIPTION:${icsText(`Reach 15 minutes early. Bring 4 copies of your DAF and a photo ID. Formal attire.\nHelp: ${CONTACT_PHONE}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT90M', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Interview ${b.interview_no} - leave for the venue`)}`, 'END:VALARM',
    'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//jaspalsingh.in//Interview Booking//EN', 'METHOD:PUBLISH', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
}

/* ── 1. Invite / not-booked-yet reminder ──────────────────── */

async function sendInviteEmail({ to, name, phase, link, reminder = false, bookedCount = 0, total = 0, subjectPrefix = '' }) {
  const firstName = esc((name || 'there').split(' ')[0]);
  total = total || phase.slots_per_learner || 3; // included + add-on slots
  const n = Math.max(1, total - bookedCount); // slots still to book
  const body = `
    <div style="text-align:center;margin-bottom:22px;">
      <div style="display:inline-block;background:${reminder ? '#fef2f2' : '#f0fdf4'};border:1px solid ${reminder ? '#fca5a5' : '#86efac'};border-radius:50px;padding:8px 22px;">
        <span style="font-size:13px;font-weight:700;color:${reminder ? '#991b1b' : '#166534'};">${reminder ? (bookedCount ? `Reminder - ${n} slot${n === 1 ? '' : 's'} still to book` : 'Reminder - you have not booked yet') : 'Interview slot booking is open'}</span>
      </div>
    </div>

    <h2 style="margin:0 0 12px;font-size:22px;color:#1A1A2E;font-weight:800;text-align:center;">${bookedCount ? `Book your remaining ${n} slot${n === 1 ? '' : 's'}, ${firstName}` : `Book your ${total} interview slots, ${firstName}`}</h2>
    <p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">
      Your offline interview sessions for <strong>RPSC AE 2024 - Interview Guidance Programme</strong> (${esc(phase.name)}) are now open for booking.
      ${bookedCount ? `You have booked ${bookedCount} of ${total} slots.` : ''}
      ${reminder ? 'Slots are filling up on a first-come, first-served basis - book yours now.' : 'Slots are first-come, first-served, so book early to get the times you want.'}
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:22px;">
      <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#6b7280;width:38%;">Dates</td><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1A1A2E;font-weight:700;">${esc(fmtRange(phase.date_from, phase.date_to))}</td></tr>
      <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#6b7280;">Timings</td><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1A1A2E;font-weight:700;">${esc(fmtWindows(phase.windows))}</td></tr>
      <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#6b7280;">Each slot</td><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1A1A2E;font-weight:700;">${phase.slot_minutes} minutes, one-to-one</td></tr>
      <tr><td style="padding:12px 16px;font-size:13px;color:#6b7280;">You get</td><td style="padding:12px 16px;font-size:14px;color:#1A1A2E;font-weight:700;">${total} slots, on ${total} different days - book one now and the rest anytime later</td></tr>
    </table>

    ${button(link, bookedCount ? `Book my remaining slot${n === 1 ? '' : 's'} &rarr;` : 'Book my slots &rarr;')}

    <p style="margin:0 0 22px;font-size:13px;color:#991b1b;line-height:1.7;text-align:center;font-weight:600;">
      Please choose carefully - once booked, slots cannot be rescheduled or cancelled.
    </p>

    ${venueBlock(phase)}
    ${instructionsBlock()}
    ${helpLine()}
    <p style="margin:14px 0 0;font-size:11.5px;color:#9ca3af;text-align:center;line-height:1.6;">This booking link is personal to you - please do not share it.<br>Button not working? Copy this link: <span style="word-break:break-all;">${esc(link)}</span></p>
  `;
  return resendSend({
    from: FROM,
    to,
    subject: `${subjectPrefix}${reminder ? 'Reminder: book' : 'Book'} your ${bookedCount ? `remaining ${n} ` : `${total} `}RPSC AE interview slot${n === 1 && bookedCount ? '' : 's'} (${fmtRange(phase.date_from, phase.date_to)})`,
    html: baseHtml(body),
  }, PRIORITY.ACTION_REQUIRED);
}

/* ── 2. Booking confirmation (sent on every booking) ──────────
   Lists every slot booked so far (new ones tagged), and - while slots
   are still pending - how many are left with the booking link. */

async function sendConfirmationEmail({ to, name, roll, branch, bookings, phase, newIds, total, link, subjectPrefix = '' }) {
  const firstName = esc((name || 'there').split(' ')[0]);
  const sorted = bookings.slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  total = total || phase.slots_per_learner || 3;
  const fresh = newIds ? sorted.filter(b => newIds.has(b.id)) : sorted;
  const remaining = Math.max(0, total - sorted.length);
  const complete = remaining === 0;
  const rows = sorted.map(b => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:800;color:${RED};white-space:nowrap;">Interview ${b.interview_no}${fresh.includes(b) && !complete ? '<br><span style="display:inline-block;margin-top:4px;background:#f0fdf4;color:#166534;border-radius:50px;padding:2px 8px;font-size:11px;">NEW</span>' : ''}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1A1A2E;font-weight:700;">${esc(fmtDay(b.starts_at))}<br><span style="font-weight:600;color:#374151;">${esc(fmtTime(b.starts_at))} - ${esc(fmtTime(b.ends_at))}</span></td>
    </tr>`).join('');
  const pendingRows = Array.from({ length: remaining }, () => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:800;color:#9ca3af;white-space:nowrap;">Pending</td>
      <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#9ca3af;">Not booked yet</td>
    </tr>`).join('');

  const headline = complete
    ? `All ${total} slots confirmed, ${firstName}!`
    : `${fresh.length === 1 ? 'Slot' : `${fresh.length} slots`} booked - ${sorted.length} of ${total} done`;

  const body = `
    <div style="text-align:center;margin-bottom:22px;">
      <div style="display:inline-block;background:#f0fdf4;border:1px solid #86efac;border-radius:50px;padding:8px 22px;">
        <span style="font-size:13px;font-weight:700;color:#166534;">✅ ${complete ? 'All slots confirmed' : 'Slot confirmed'}</span>
      </div>
    </div>

    <h2 style="margin:0 0 10px;font-size:22px;color:#1A1A2E;font-weight:800;text-align:center;">${headline}</h2>
    <p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">
      ${complete
        ? `Here are your ${total} interview slots for <strong>RPSC AE 2024 - Interview Guidance Programme</strong>.`
        : `Your slot${fresh.length === 1 ? ' is' : 's are'} confirmed. You have <strong>${remaining} more slot${remaining === 1 ? '' : 's'}</strong> to book - you can book ${remaining === 1 ? 'it' : 'them'} anytime.`}
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;">
      <tr style="background:#f8fafc;">
        <td colspan="2" style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#374151;">
          <strong>${esc(name)}</strong>${roll ? ` &nbsp;·&nbsp; Roll no <strong>${esc(roll)}</strong>` : ''} &nbsp;·&nbsp; ${esc(branch)}
        </td>
      </tr>
      ${rows}${pendingRows}
    </table>
    <p style="margin:0 0 22px;font-size:12.5px;color:#6b7280;text-align:center;">📅 Open the attached <strong>.ics</strong> file to add your booked slot${sorted.length === 1 ? '' : 's'} to your phone calendar.</p>

    ${!complete && link ? `
    <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:12px;padding:18px 20px;margin-bottom:22px;text-align:center;">
      <div style="font-size:15px;font-weight:800;color:#1e3a8a;margin-bottom:6px;">${remaining} slot${remaining === 1 ? '' : 's'} still to book</div>
      <p style="margin:0 0 14px;font-size:13.5px;color:#1e40af;line-height:1.6;">Pick ${remaining === 1 ? 'a day' : 'days'} you don't already have an interview on. Slots are first-come, first-served.</p>
      <a href="${esc(link)}" style="display:inline-block;background:${RED};color:#fff;border-radius:10px;padding:13px 28px;font-size:15px;font-weight:800;text-decoration:none;">Book my remaining slot${remaining === 1 ? '' : 's'} &rarr;</a>
    </div>` : ''}

    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:14px 18px;margin-bottom:22px;">
      <p style="margin:0;font-size:13.5px;color:#7f1d1d;line-height:1.7;font-weight:600;">
        Booked slots are final - they cannot be rescheduled or cancelled. A missed slot is forfeited.
      </p>
    </div>

    ${venueBlock(phase)}
    ${instructionsBlock()}
    ${termsBlock()}
    ${helpLine()}
  `;
  return resendSend({
    from: FROM,
    to,
    subject: complete
      ? `${subjectPrefix}Confirmed: all ${total} RPSC AE interview slots booked`
      : `${subjectPrefix}Confirmed: RPSC AE interview slot booked (${sorted.length} of ${total}) - ${remaining} still to book`,
    html: baseHtml(body),
    attachments: [{ filename: 'rpsc-ae-interviews.ics', content: Buffer.from(buildIcs(sorted, phase)) }],
  }, PRIORITY.INVOICE);
}

/* ── 3. Day-before reminder (one per slot) ────────────────── */

async function sendDayBeforeReminder({ to, name, booking, phase, total = 0, subjectPrefix = '' }) {
  const firstName = esc((name || 'there').split(' ')[0]);
  total = total || phase.slots_per_learner || 3;
  const body = `
    <div style="text-align:center;margin-bottom:22px;">
      <div style="display:inline-block;background:#eff6ff;border:1px solid #93c5fd;border-radius:50px;padding:8px 22px;">
        <span style="font-size:13px;font-weight:700;color:#1e40af;">⏰ Tomorrow</span>
      </div>
    </div>

    <h2 style="margin:0 0 10px;font-size:22px;color:#1A1A2E;font-weight:800;text-align:center;">Interview ${booking.interview_no} of ${total} is tomorrow</h2>
    <p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">Hi ${firstName}, a quick reminder about your slot:</p>

    <div style="border:2px solid ${RED};border-radius:14px;padding:18px 20px;text-align:center;margin-bottom:22px;">
      <div style="font-size:13px;font-weight:800;color:${RED};text-transform:uppercase;letter-spacing:.08em;">Interview ${booking.interview_no}</div>
      <div style="font-size:20px;font-weight:800;color:#1A1A2E;margin:6px 0 4px;">${esc(fmtTime(booking.starts_at))} - ${esc(fmtTime(booking.ends_at))}</div>
      <div style="font-size:14px;color:#374151;">${esc(fmtDay(booking.starts_at))}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:8px;">Please reach by <strong>${esc(fmtTime(new Date(new Date(booking.starts_at).getTime() - 15 * 60000)))}</strong></div>
    </div>

    ${venueBlock(phase)}
    ${instructionsBlock()}
    ${helpLine()}
  `;
  return resendSend({
    from: FROM,
    to,
    subject: `${subjectPrefix}Tomorrow ${fmtTime(booking.starts_at)}: RPSC AE Interview ${booking.interview_no} - reach 15 min early`,
    html: baseHtml(body),
  }, PRIORITY.ACTION_REQUIRED);
}

/* ── 3b. Venue finalised (sent from admin once the venue is set) ── */

async function sendVenueAnnouncement({ to, name, bookings, phase, subjectPrefix = '' }) {
  const firstName = esc((name || 'there').split(' ')[0]);
  const sorted = bookings.slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const rows = sorted.map(b => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:800;color:${RED};white-space:nowrap;">Interview ${b.interview_no}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1A1A2E;font-weight:700;">${esc(fmtDay(b.starts_at))}<br><span style="font-weight:600;color:#374151;">${esc(fmtTime(b.starts_at))} - ${esc(fmtTime(b.ends_at))}</span></td>
    </tr>`).join('');
  const body = `
    <div style="text-align:center;margin-bottom:22px;">
      <div style="display:inline-block;background:#f0fdf4;border:1px solid #86efac;border-radius:50px;padding:8px 22px;">
        <span style="font-size:13px;font-weight:700;color:#166534;">📍 Venue confirmed</span>
      </div>
    </div>

    <h2 style="margin:0 0 10px;font-size:22px;color:#1A1A2E;font-weight:800;text-align:center;">Your interview venue, ${firstName}</h2>
    <p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">
      The venue for your RPSC AE interview slots is now confirmed. Your slot dates and times stay exactly the same.
    </p>

    ${venueBlock(phase)}

    ${sectionLabel('Your booked slots')}
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;">${rows}</table>
    <p style="margin:0 0 22px;font-size:12.5px;color:#6b7280;text-align:center;">📅 The attached <strong>.ics</strong> file updates these slots in your phone calendar with the venue.</p>

    ${instructionsBlock()}
    ${helpLine()}
  `;
  return resendSend({
    from: FROM,
    to,
    subject: `${subjectPrefix}Venue confirmed for your RPSC AE interview slots`,
    html: baseHtml(body),
    attachments: [{ filename: 'rpsc-ae-interviews.ics', content: Buffer.from(buildIcs(sorted, phase)) }],
  }, PRIORITY.ACTION_REQUIRED);
}

/* ── 4. Owner daily summary ───────────────────────────────── */

async function sendDailyDigest({ newBookings, tomorrow, phases, to = ADMIN_EMAIL, subjectPrefix = '' }) {
  const td = 'padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12.5px;color:#1A1A2E;';
  const th = 'padding:8px 10px;font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;';

  // Group new bookings per learner (they book all slots at once).
  const byLearner = {};
  newBookings.forEach(b => {
    const k = b.enrollment_id;
    (byLearner[k] = byLearner[k] || { b, slots: [] }).slots.push(b);
  });
  const newRows = Object.values(byLearner).map(({ b, slots }) => `
    <tr><td style="${td}"><strong>${esc(b.student_name)}</strong><br><span style="color:#64748b;">${esc(b.student_phone || '')}${b.roll_number ? ' · ' + esc(b.roll_number) : ''}</span></td>
    <td style="${td}">${esc(b.branch)}</td>
    <td style="${td}">${slots.sort((x, y) => x.interview_no - y.interview_no).map(s => `${s.interview_no}: ${esc(fmtDay(s.starts_at))} ${esc(fmtTime(s.starts_at))}`).join('<br>')}</td></tr>`).join('');

  const tomorrowRows = tomorrow.map(b => `
    <tr><td style="${td}white-space:nowrap;"><strong>${esc(fmtTime(b.starts_at))}</strong></td>
    <td style="${td}">${esc(b.student_name)} <span style="color:#64748b;">(${esc(b.branch)})</span><br><span style="color:#64748b;">${esc(b.student_phone || '')}${b.roll_number ? ' · ' + esc(b.roll_number) : ''}</span></td>
    <td style="${td}">Interview ${b.interview_no}</td></tr>`).join('');

  const phaseRows = phases.map(p => `
    <tr><td style="${td}"><strong>${esc(p.name)}</strong><br><span style="color:#64748b;">${esc(fmtRange(p.date_from, p.date_to))} · ${esc(p.status)}</span>${p.venue_tba ? '<br><span style="color:#b45309;font-weight:700;">Venue not announced yet</span>' : ''}</td>
    <td style="${td}">${p.fully_booked} all slots booked<br>${p.partly_booked} part booked<br>${p.not_started} not started<br><span style="color:#64748b;">of ${p.eligible_learners} paid learners</span></td>
    <td style="${td}">${p.slots_free} slots free</td></tr>`).join('');

  const tomorrowLabel = fmtDay(new Date(Date.now() + 24 * 3600 * 1000));
  const body = `
    <h2 style="margin:0 0 6px;font-size:20px;color:#1A1A2E;font-weight:800;">Interview bookings - daily summary</h2>
    <p style="margin:0 0 22px;font-size:13px;color:#6b7280;">${Object.keys(byLearner).length} new learner booking${Object.keys(byLearner).length === 1 ? '' : 's'} in the last 24 hours · ${tomorrow.length} interview${tomorrow.length === 1 ? '' : 's'} tomorrow</p>

    ${sectionLabel('Overview')}
    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:22px;">${phaseRows}</table>

    ${sectionLabel(`Tomorrow - ${esc(tomorrowLabel)}`)}
    ${tomorrow.length
      ? `<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:22px;"><tr style="background:#f8fafc;"><td style="${th}">Time</td><td style="${th}">Learner</td><td style="${th}">#</td></tr>${tomorrowRows}</table>`
      : '<p style="margin:0 0 22px;font-size:13px;color:#6b7280;">No interviews tomorrow.</p>'}

    ${sectionLabel('New bookings (last 24 hours)')}
    ${newRows
      ? `<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:22px;"><tr style="background:#f8fafc;"><td style="${th}">Learner</td><td style="${th}">Branch</td><td style="${th}">Slots</td></tr>${newRows}</table>`
      : '<p style="margin:0 0 22px;font-size:13px;color:#6b7280;">No new bookings.</p>'}

    <div style="text-align:center;">
      <a href="${SITE}/admin/dashboard/" style="display:inline-block;background:${RED};color:#fff;border-radius:10px;padding:13px 30px;font-size:14px;font-weight:700;text-decoration:none;">Open Interview Booking &rarr;</a>
    </div>
  `;
  return resendSend({
    from: FROM,
    to,
    subject: `${subjectPrefix}Interview bookings: ${Object.keys(byLearner).length} new today, ${tomorrow.length} tomorrow`,
    html: baseHtml(body),
  }, PRIORITY.ADMIN_NOTIFY);
}

/* ── 6. Mock Interview Add-on ─────────────────────────────── */

function rupees(n) { return '&#8377;' + Number(n).toLocaleString('en-IN'); }

/* Best value pack (lowest price per interview) is highlighted with
   its saving vs buying the same count at the smallest pack's rate. */
function packsTable(packs) {
  const best = packs.reduce((m, p) => (!m || p.price / p.slots < m.price / m.slots ? p : m), null);
  const small = packs.reduce((m, p) => (!m || p.slots < m.slots ? p : m), null);
  return packs.map(p => {
    const isBest = packs.length > 1 && p === best;
    const save = Math.round(p.slots * small.price / small.slots - p.price);
    return `
    <table cellpadding="0" cellspacing="0" style="width:100%;border:${isBest ? '2px solid #7C3AED' : '1px solid #e2e8f0'};background:${isBest ? '#faf5ff' : '#fff'};border-radius:12px;margin-bottom:12px;">
      <tr>
        <td style="padding:14px 16px;font-size:15px;color:#1A1A2E;font-weight:800;">
          ${isBest ? '<span style="display:inline-block;background:#7C3AED;color:#fff;border-radius:50px;padding:2px 10px;font-size:11px;margin-bottom:6px;">⭐ BEST VALUE</span><br>' : ''}
          ${p.slots} Mock Interviews
          <div style="font-size:12.5px;color:#6b7280;font-weight:600;margin-top:2px;">${rupees(Math.round(p.price / p.slots))} per interview${isBest && save > 0 ? ` &nbsp;<span style="color:#166534;font-weight:800;">Save ${rupees(save)}</span>` : ''}</div>
        </td>
        <td style="padding:14px 16px;font-size:20px;color:${isBest ? '#6D28D9' : RED};font-weight:800;text-align:right;white-space:nowrap;">${rupees(p.price)}</td>
      </tr>
    </table>`;
  }).join('') + '<div style="height:10px;"></div>';
}

async function sendAddonOfferEmail({ to, name, link, packs, subjectPrefix = '' }) {
  const firstName = esc((name || 'there').split(' ')[0]);
  const body = `
    <div style="text-align:center;margin-bottom:22px;">
      <div style="display:inline-block;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:50px;padding:8px 22px;">
        <span style="font-size:13px;font-weight:700;color:#5b21b6;">For RPSC AE Interview Guidance learners only</span>
      </div>
    </div>

    <h2 style="margin:0 0 12px;font-size:22px;color:#1A1A2E;font-weight:800;text-align:center;">Want more mock interviews, ${firstName}?</h2>
    <p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">
      Your programme includes 3 one-to-one mock interviews. You can now add more, on top of those 3 - more practice in front of the panel before the real RPSC board.
    </p>

    ${packsTable(packs)}

    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
      <tr><td style="padding:4px 0;font-size:14px;color:#374151;">✅ No form to fill - pay on your booking page and the extra interviews are added instantly</td></tr>
      <tr><td style="padding:4px 0;font-size:14px;color:#374151;">✅ Booked the same way as your included slots, one per day</td></tr>
      <tr><td style="padding:4px 0;font-size:14px;color:#374151;">✅ You can buy more than one pack</td></tr>
    </table>

    ${button(link, 'Add mock interviews &rarr;')}

    ${helpLine()}
    <p style="margin:14px 0 0;font-size:11.5px;color:#9ca3af;text-align:center;line-height:1.6;">This link is personal to you - please do not share it.<br>Button not working? Copy this link: <span style="word-break:break-all;">${esc(link)}</span></p>
  `;
  return resendSend({
    from: FROM,
    to,
    subject: `${subjectPrefix}Add more RPSC AE mock interviews - ${packs.map(p => `${p.slots} for Rs ${Number(p.price).toLocaleString('en-IN')}`).join(' / ')}`,
    html: baseHtml(body),
  }, PRIORITY.DEFAULT); // bulk offer - never delays OTP / invoice emails
}

async function sendAddonPurchasedEmail({ to, name, added, total, booked, link, phaseOpen, subjectPrefix = '' }) {
  const firstName = esc((name || 'there').split(' ')[0]);
  const pending = Math.max(0, total - booked);
  const body = `
    <div style="text-align:center;margin-bottom:22px;">
      <div style="display:inline-block;background:#f0fdf4;border:1px solid #86efac;border-radius:50px;padding:8px 22px;">
        <span style="font-size:13px;font-weight:700;color:#166534;">✅ Payment received</span>
      </div>
    </div>

    <h2 style="margin:0 0 12px;font-size:22px;color:#1A1A2E;font-weight:800;text-align:center;">${added} extra mock interview${added === 1 ? '' : 's'} added, ${firstName}!</h2>
    <p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">
      There is no form to fill. Your new interviews are already on your booking page.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:22px;">
      <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#6b7280;width:45%;">Total mock interviews</td><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:15px;color:#1A1A2E;font-weight:800;">${total}</td></tr>
      <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#6b7280;">Booked so far</td><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:15px;color:#1A1A2E;font-weight:800;">${booked}</td></tr>
      <tr><td style="padding:12px 16px;font-size:13px;color:#6b7280;">Still to book</td><td style="padding:12px 16px;font-size:15px;color:${RED};font-weight:800;">${pending}</td></tr>
    </table>

    ${phaseOpen
      ? button(link, 'Book my slots &rarr;')
      : `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:12px;padding:16px 20px;margin-bottom:22px;text-align:center;">
          <div style="font-size:14px;color:#1e3a8a;line-height:1.7;">No booking round is open right now. We will email you as soon as the next round opens - you can also check anytime with the button below.</div>
        </div>
        ${button(link, 'Open my booking page &rarr;')}`}

    <p style="margin:0 0 22px;font-size:13px;color:#374151;line-height:1.7;text-align:center;">
      Same rules as your included slots: one interview per day, first-come first-served, and booked slots cannot be rescheduled or cancelled.
    </p>

    ${helpLine()}
    <p style="margin:14px 0 0;font-size:11.5px;color:#9ca3af;text-align:center;line-height:1.6;">This booking link is personal to you - please do not share it.<br>Button not working? Copy this link: <span style="word-break:break-all;">${esc(link)}</span></p>
  `;
  return resendSend({
    from: FROM,
    to,
    subject: `${subjectPrefix}${added} extra RPSC AE mock interview${added === 1 ? '' : 's'} added - you now have ${total}`,
    html: baseHtml(body),
  }, PRIORITY.INVOICE);
}

module.exports = { sendInviteEmail, sendConfirmationEmail, sendDayBeforeReminder, sendVenueAnnouncement, sendDailyDigest, sendAddonOfferEmail, sendAddonPurchasedEmail, VENUE_TBA_TEXT, buildIcs, fmtSlot, fmtDay, fmtTime, fmtRange };
