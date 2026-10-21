/* ============================================================
   book-interview.js  -  /book-interview
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   Each learner gets N slots (slots_per_learner, 3 for RPSC AE), never
   two on the same day. They can book 1..remaining at a time and come
   back later (same link) for the rest - every booking emails what is
   booked so far and what is pending. Branch is picked with the first
   booking and kept. Backend: routes/interviews.js.

   Who is booking:
     ?t=<token>       personal link from the invite email (no login)
     logged in        learner token from localStorage, ?program=slug
     ?demo=1          sample data, nothing is sent (linked from the
                      sample emails so the owner can try the flow)
   ============================================================ */

(function () {
  'use strict';

  var API_BASE = (function () {
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  })();
  var TZ = 'Asia/Kolkata';
  var params = new URLSearchParams(window.location.search);
  var TOKEN = params.get('t');
  var PROGRAM = params.get('program') || 'rpsc-ae-interview';
  var DEMO = params.get('demo') === '1';

  var app = document.getElementById('app');
  var bar = document.getElementById('bar');

  var state = { data: null, phase: null, branch: null, day: null, picks: {}, submitting: false };

  /* ── Helpers ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).toUpperCase();
  }
  function fmtDayLong(iso) {
    return new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  }
  function fmtDayShort(key) {
    var d = new Date(key + 'T12:00:00+05:30');
    return {
      wd: d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: TZ }),
      dm: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ }),
    };
  }
  function istHour(iso) {
    return Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }));
  }
  function fmtRange(from, to) {
    var f = fmtDayShort(from), t = fmtDayShort(to);
    return f.dm.split(' ')[1] === t.dm.split(' ')[1] ? f.dm.split(' ')[0] + ' - ' + t.dm : f.dm + ' - ' + t.dm;
  }
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('is-on'); }, 3200);
  }
  function learnerToken() {
    try { return localStorage.getItem('jaspal_learner_token'); } catch (e) { return null; }
  }
  function waLink(text) {
    var base = (state.data && state.data.contact && state.data.contact.whatsapp) || 'https://wa.me/919829133317';
    return base + '?text=' + encodeURIComponent(text);
  }

  function api(method, body) {
    var url = API_BASE + '/api/interviews/booking';
    var headers = { 'Content-Type': 'application/json' };
    if (TOKEN) {
      if (method === 'GET') url += '?t=' + encodeURIComponent(TOKEN);
      else body.t = TOKEN;
    } else {
      var lt = learnerToken();
      if (lt) headers.Authorization = 'Bearer ' + lt;
      if (method === 'GET') url += '?program=' + encodeURIComponent(PROGRAM);
      else body.program = PROGRAM;
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 75000);
    return fetch(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal })
      .then(function (res) {
        clearTimeout(timer);
        return res.json().catch(function () { return {}; }).then(function (d) {
          if (!res.ok) { var e = new Error(d.error || 'Something went wrong (' + res.status + ').'); e.status = res.status; throw e; }
          return d;
        });
      }, function (err) {
        clearTimeout(timer);
        var e = new Error(err.name === 'AbortError' ? 'The server is taking too long to respond.' : 'Could not reach the server. Check your internet connection.');
        e.network = true;
        throw e;
      });
  }

  /* ── Demo data (no network) ── */
  function demoData() {
    var days = [];
    var start = new Date('2026-11-02T00:00:00Z');
    var now = Date.now();
    var seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 6; i++) {
      var key = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
      var slots = [];
      [['09:00', '13:00'], ['14:00', '18:00']].forEach(function (w) {
        var t = new Date(key + 'T' + w[0] + ':00+05:30').getTime();
        var end = new Date(key + 'T' + w[1] + ':00+05:30').getTime();
        for (; t + 900000 <= end; t += 900000) {
          slots.push({ id: t / 1000, starts_at: new Date(t).toISOString(), ends_at: new Date(t + 900000).toISOString(), available: t > now && rnd() > 0.35 });
        }
      });
      days.push({ date: key, slots: slots, available: slots.filter(function (s) { return s.available; }).length });
    }
    return {
      learner: { name: 'Rahul Sharma', roll_number: 'RPSCAE0012', program_name: 'RPSC AE 2024 - Interview Guidance Programme' },
      booked: { branch: null, total: 3, remaining: 3, bookings: [] },
      branches: ['Civil', 'Mechanical', 'Electrical'],
      instructions: [
        'Reach the venue 15 minutes before your slot.',
        'Bring 4 copies of your DAF (Detailed Application Form).',
        'Wear formal attire.',
        'Carry an original photo ID (Aadhaar / PAN / Driving Licence / Passport).',
        'Keep this confirmation with you (printed or on your phone).',
        'Late arrival may lead to losing your slot - the next interview starts on time.',
      ],
      terms: [
        'Slots are subject to availability and allotted on a first-come, first-served basis.',
        'Each learner gets 3 interview slots in total, on 3 different days - book them together or one at a time. Additional slots cannot be booked.',
        'Booked slots cannot be rescheduled, cancelled or exchanged.',
        'A missed slot (no-show or late arrival) is forfeited. No compensation or replacement slot will be given.',
        'Report 15 minutes early in formal attire with 4 copies of your DAF and a valid photo ID.',
        'If an emergency on our side (e.g. faculty unavailability) affects your slot, we will contact you and allot an alternative slot.',
        'Slots are non-transferable. Only the registered learner may attend.',
        'The programme fee is not refundable on the grounds of missed or unbooked slots.',
        'The management\'s decision on slot allotment is final.',
      ],
      contact: { phone: '+91 98291 33317', whatsapp: 'https://wa.me/919829133317' },
      phases: [{
        id: 1, name: 'Phase 1', slots_per_learner: 3, slot_minutes: 15, date_from: '2026-11-02', date_to: '2026-11-07',
        windows: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '18:00' }],
        venue_name: 'WHITE HOUSE',
        venue_address: '33, Tonk Road, Opp. Zone Tech, Madhuvan Colony, Mansingh Pura, Tonk Phatak, Jaipur, Rajasthan 302018',
        maps_link: 'https://maps.app.goo.gl/UiYpXv447AWrfyMX8',
        bookable: true, days: days,
      }],
    };
  }


  /* ── Shared blocks ── */
  function booked() { return state.data.booked; }
  function maxPick() { return booked().remaining; }
  function branchNow() { return booked().branch || state.branch; }
  function plural(n, one, many) { return n === 1 ? one : many; }

  function demoBanner() {
    return DEMO ? '<div class="bi-demo"><i class="fas fa-eye"></i> Demo preview with sample data - nothing is booked and no email is sent.</div>' : '';
  }
  function venueCard(p) {
    if (!p) return '';
    return '<div class="bi-card"><div class="bi-venue"><i class="fas fa-location-dot"></i><div>' +
      '<b>' + esc(p.venue_name) + '</b><span>' + esc(p.venue_address) + '</span>' +
      (p.maps_link ? '<div style="margin-top:8px;"><a href="' + esc(p.maps_link) + '" target="_blank" rel="noopener"><strong>Open in Google Maps &rarr;</strong></a></div>' : '') +
    '</div></div></div>';
  }
  function rulesCard(openInstructions) {
    var d = state.data;
    return '<div class="bi-card">' +
      '<details class="bi-fold" style="border:0;margin:0;padding:0;"' + (openInstructions ? ' open' : '') + '><summary><i class="fas fa-clipboard-check"></i> Bring with you &amp; reporting</summary><ul>' +
        d.instructions.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></details>' +
      '<details class="bi-fold" id="termsFold"><summary><i class="fas fa-file-contract"></i> Slot booking terms &amp; conditions</summary><ol>' +
        d.terms.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></details>' +
    '</div>';
  }
  function helpRow(text) {
    return '<a class="bi-btn bi-btn--wa" href="' + esc(waLink(text)) + '" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> WhatsApp us</a>';
  }
  function helpCard() {
    var l = state.data.learner || {};
    return '<div class="bi-card" style="text-align:center;"><p class="bi-sub" style="margin-bottom:12px;">Questions about your slots? Call or WhatsApp ' + esc(state.data.contact.phone) + '</p>' +
      helpRow('Hi, I have a question about my RPSC AE interview slots' + (l.roll_number ? ' (Roll no ' + l.roll_number + ')' : '') + '.') + '</div>';
  }

  /* ── States ── */
  function showMessage(icon, title, body, actions) {
    bar.hidden = true;
    app.innerHTML = demoBanner() + '<div class="bi-card bi-state"><i class="fas ' + icon + ' big"></i>' +
      '<h1 class="bi-h1">' + title + '</h1><p class="bi-sub">' + body + '</p>' + (actions || '') + '</div>';
  }

  function showError(err) {
    if (err.network) {
      return showMessage('fa-wifi', 'Could not load your booking', esc(err.message),
        '<button class="bi-btn" id="retryBtn"><i class="fas fa-rotate-right"></i> Try again</button>');
    }
    if (err.status === 401) {
      return showMessage('fa-lock', 'Please open your booking link',
        esc(err.message) + '<br>Use the <strong>Book my slots</strong> button in the email we sent you, or log in and open My Programs.',
        '<div class="bi-row" style="margin-top:16px;"><a class="bi-btn" href="/my-programs/">Log in / My Programs</a>' + helpRow('Hi, I need my RPSC AE interview booking link.') + '</div>');
    }
    if (err.status === 403) {
      return showMessage('fa-circle-exclamation', 'No active enrollment',
        esc(err.message) + '<br>If you have paid for the RPSC AE Interview programme, message us and we will sort it out.',
        helpRow('Hi, I paid for RPSC AE Interview Guidance but cannot book my slots.'));
    }
    showMessage('fa-triangle-exclamation', 'Something went wrong', esc(err.message),
      '<button class="bi-btn" id="retryBtn"><i class="fas fa-rotate-right"></i> Try again</button>');
  }

  /* ── Main view ── */
  function bookablePhases() {
    return (state.data.phases || []).filter(function (p) { return p.bookable; });
  }

  function headCard() {
    var b = booked(), l = state.data.learner || {};
    var done = b.remaining === 0, n = b.bookings.length;
    var title = done ? 'All ' + b.total + ' interview slots booked'
      : n ? 'Book your remaining ' + b.remaining + ' ' + plural(b.remaining, 'slot', 'slots')
      : 'Book your interview slots';
    var sub = done ? 'You are all set. See you at the venue!'
      : 'You get ' + b.total + ' slots on ' + b.total + ' different days. Book one now and the rest anytime later - or all together.';
    var dots = '';
    for (var i = 0; i < b.total; i++) {
      dots += '<span style="flex:1;height:6px;border-radius:6px;background:' + (i < n ? '#166534' : '#e5e7eb') + ';"></span>';
    }
    return '<div class="bi-card">' +
      '<h1 class="bi-h1">' + title + '</h1>' +
      '<p class="bi-sub">' + sub + '</p>' +
      '<div style="display:flex;gap:6px;margin:14px 0 6px;">' + dots + '</div>' +
      '<div style="font-size:12.5px;font-weight:700;color:var(--muted);">' + n + ' of ' + b.total + ' booked' + (done ? '' : ' · ' + b.remaining + ' pending') + '</div>' +
      '<div class="bi-learner"><span><i class="fas fa-user"></i> <strong>' + esc(l.name) + '</strong></span>' +
        (l.roll_number ? '<span>Roll no <strong>' + esc(l.roll_number) + '</strong></span>' : '') +
        (b.branch ? '<span>' + esc(b.branch) + '</span>' : '') +
        '<span>' + esc(l.program_name || '') + '</span></div>' +
    '</div>';
  }

  function successCard() {
    if (!state.justBooked) return '';
    var b = booked(), k = state.justBooked.length;
    return '<div class="bi-card" style="border-color:#86efac;background:var(--green-soft);">' +
      '<div class="bi-done-head"><div class="bi-done-icon" style="background:#fff;"><i class="fas fa-check"></i></div>' +
        '<h2 class="bi-h1" style="font-size:19px;">' + (b.remaining === 0 ? 'All slots booked!' : k + ' ' + plural(k, 'slot', 'slots') + ' booked!') + '</h2>' +
        '<p class="bi-sub">' + (DEMO ? 'In the live flow, a confirmation email is sent right away.' : 'A confirmation email is on its way.') +
          (b.remaining ? ' You can book your remaining ' + b.remaining + ' ' + plural(b.remaining, 'slot', 'slots') + ' below now, or anytime later with the link in your email.' : '') + '</p>' +
      '</div></div>';
  }

  function bookedCard() {
    var b = booked();
    if (!b.bookings.length) return '';
    var list = b.bookings.slice().sort(function (x, y) { return new Date(x.starts_at) - new Date(y.starts_at); });
    var fresh = state.justBooked || [];
    var pending = '';
    for (var i = 0; i < b.remaining; i++) {
      pending += '<li style="color:#9ca3af;"><span class="bi-no" style="color:#9ca3af;">Pending</span><span class="bi-when"><b style="color:#9ca3af;">Not booked yet</b></span></li>';
    }
    return '<div class="bi-card">' +
      '<div class="bi-h2"><i class="fas fa-calendar-check" style="color:var(--green);"></i> Your booked slots</div>' +
      '<p class="bi-hint">Interviews are numbered by date.</p>' +
      '<ul class="bi-list">' + list.map(function (x) {
        var isNew = fresh.indexOf(x.id) !== -1;
        return '<li><span class="bi-no">Interview ' + x.interview_no + (isNew ? '<br><span class="bi-chip" style="background:var(--green-soft);color:var(--green);margin-top:4px;cursor:default;">New</span>' : '') + '</span>' +
          '<span class="bi-when"><b>' + esc(fmtDayLong(x.starts_at)) + '</b><span>' + esc(fmtTime(x.starts_at)) + ' - ' + esc(fmtTime(x.ends_at)) + ' · reach by ' + esc(fmtTime(new Date(new Date(x.starts_at).getTime() - 15 * 60000))) + '</span></span></li>';
      }).join('') + pending + '</ul>' +
      '<div class="bi-warn"><i class="fas fa-circle-info"></i> Booked slots are final - they cannot be rescheduled or cancelled.</div>' +
      '<button class="bi-btn bi-btn--ghost bi-btn--block" id="icsBtn"><i class="fas fa-calendar-plus"></i> Add ' + plural(list.length, 'it', 'them') + ' to my calendar</button>' +
    '</div>';
  }

  function render() {
    var b = booked();
    var phases = bookablePhases();
    var html = demoBanner() + headCard() + successCard() + bookedCard();
    var showPicker = b.remaining > 0 && phases.length > 0;

    if (b.remaining > 0 && !phases.length) {
      var anyOpen = (state.data.phases || []).length;
      html += '<div class="bi-card bi-state" style="padding:24px 16px;"><i class="fas fa-calendar-xmark big"></i>' +
        '<h2 class="bi-h1" style="font-size:18px;">' + (anyOpen ? 'No free slots for you right now' : 'Booking is not open yet') + '</h2>' +
        '<p class="bi-sub">' + (anyOpen ? 'All remaining slots in this round are taken (or fall on days you already have an interview). The next phase will open soon - we will email you as soon as it does.'
          : 'We will email you the booking link as soon as the next round opens.') + '</p></div>';
    }

    if (showPicker) {
      if (!state.phase || !phases.some(function (p) { return p.id === state.phase.id; })) {
        state.phase = phases[0]; state.picks = {}; state.day = null;
      } else {
        state.phase = phases.filter(function (p) { return p.id === state.phase.id; })[0];
      }
      var p = state.phase;
      if (!state.day || !p.days.some(function (x) { return x.date === state.day; })) {
        var firstOpen = p.days.filter(function (x) { return x.available > 0 && !x.taken; })[0];
        state.day = firstOpen ? firstOpen.date : p.days[0].date;
      }
      var windowsText = (p.windows || []).map(function (w) {
        return fmtTime(new Date('2026-01-01T' + w.start + ':00+05:30')) + ' - ' + fmtTime(new Date('2026-01-01T' + w.end + ':00+05:30'));
      }).join(', ');
      var step = 1;

      if (phases.length > 1) {
        html += '<div class="bi-card"><div class="bi-h2">Choose a round</div><div class="bi-branches" style="margin-top:10px;">' +
          phases.map(function (x) { return '<button class="bi-branch' + (x.id === p.id ? ' is-on' : '') + '" data-phase="' + x.id + '">' + esc(x.name) + '<br><small>' + esc(fmtRange(x.date_from, x.date_to)) + '</small></button>'; }).join('') +
          '</div></div>';
      }
      if (!b.branch) {
        html += '<div class="bi-card" id="branchCard">' +
          '<div class="bi-h2"><span class="bi-step' + (state.branch ? ' bi-step--done' : '') + '">' + (state.branch ? '<i class="fas fa-check"></i>' : step) + '</span> Your branch</div>' +
          '<p class="bi-hint">Shared with the interview panel so they can prepare.</p>' +
          '<div class="bi-branches">' + state.data.branches.map(function (x) {
            return '<button class="bi-branch' + (state.branch === x ? ' is-on' : '') + '" data-branch="' + esc(x) + '">' + esc(x) + '</button>';
          }).join('') + '</div></div>';
        step++;
      }
      html += '<div class="bi-card" id="slotCard">' +
        '<div class="bi-h2"><span class="bi-step" id="slotStep">' + step + '</span> Pick ' + (maxPick() === 1 ? 'your last slot' : '1 to ' + maxPick() + ' slots') + '</div>' +
        '<p class="bi-hint">' + esc(p.name) + ' · ' + esc(fmtRange(p.date_from, p.date_to)) + ' · ' + esc(windowsText) + ' · ' + p.slot_minutes + ' min each.<br>One slot per day. Tap a day, then a time. Grey times are taken.</p>' +
        '<div class="bi-days" id="days"></div>' +
        '<div id="times"></div>' +
        '<div class="bi-dayrule" id="dayRule"><i class="fas fa-circle-info"></i> You have picked a time on this day - picking another time here replaces it.</div>' +
      '</div>' +
      '<div class="bi-card bi-review" id="reviewCard"></div>';
      state.reviewStep = step + 1;
    }

    var venuePhase = state.phase || (b.bookings[0] ? b.bookings[0] : null);
    html += venueCard(venuePhase) + rulesCard(b.remaining === 0) + helpCard();
    app.innerHTML = html;

    var ics = document.getElementById('icsBtn');
    if (ics) ics.addEventListener('click', function () { downloadIcs(b.bookings, venuePhase); });
    app.querySelectorAll('[data-branch]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.branch = btn.getAttribute('data-branch'); keepScroll(render); });
    });
    app.querySelectorAll('[data-phase]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-phase'));
        state.phase = phases.filter(function (x) { return x.id === id; })[0];
        state.picks = {}; state.day = null;
        keepScroll(render);
      });
    });

    if (showPicker) { renderDays(); renderTimes(); renderBar(); }
    else bar.hidden = true;
  }

  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  function icsText(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function icsDate(d) { return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function downloadIcs(list, p) {
    var loc = p ? [p.venue_name, p.venue_address].filter(Boolean).join(', ') : '';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//jaspalsingh.in//Interview Booking//EN', 'CALSCALE:GREGORIAN'];
    list.forEach(function (b) {
      lines.push('BEGIN:VEVENT', 'UID:interview-' + b.id + '@jaspalsingh.in', 'DTSTAMP:' + icsDate(new Date()),
        'DTSTART:' + icsDate(b.starts_at), 'DTEND:' + icsDate(b.ends_at),
        'SUMMARY:' + icsText('RPSC AE Interview ' + b.interview_no + ' - Dr. Jaspal Singh'),
        'LOCATION:' + icsText(loc),
        'DESCRIPTION:' + icsText('Reach 15 minutes early. Bring 4 copies of your DAF and a photo ID. Formal attire.'),
        'BEGIN:VALARM', 'TRIGGER:-PT90M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText('Interview ' + b.interview_no), 'END:VALARM',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rpsc-ae-interviews.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ── Picker ── */
  function pickedList() {
    return Object.keys(state.picks).sort().map(function (day) { return state.picks[day]; });
  }

  function renderDays() {
    var el = document.getElementById('days');
    el.innerHTML = state.phase.days.map(function (d) {
      var f = fmtDayShort(d.date);
      var cls = 'bi-day' + (d.date === state.day ? ' is-on' : '') + (state.picks[d.date] ? ' has-pick' : '') + (!d.available || d.taken ? ' is-full' : '');
      var label = d.taken ? 'Your interview' : d.available ? d.available + ' free' : 'Full';
      return '<button class="' + cls + '" data-day="' + d.date + '"><span class="bi-tick"><i class="fas fa-check"></i></span><b>' + esc(f.wd) + ', ' + esc(f.dm) + '</b><span>' + label + '</span></button>';
    }).join('');
    el.querySelectorAll('[data-day]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.day = btn.getAttribute('data-day'); renderDays(); renderTimes(); });
    });
    var on = el.querySelector('.is-on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderTimes() {
    var day = state.phase.days.filter(function (d) { return d.date === state.day; })[0];
    var el = document.getElementById('times');
    var rule = document.getElementById('dayRule');
    if (!day) { el.innerHTML = ''; return; }
    if (day.taken) {
      el.innerHTML = '<p class="bi-hint" style="margin:12px 0 0;"><i class="fas fa-circle-check" style="color:var(--green);"></i> You already have an interview on this day. Pick a different day for your next slot.</p>';
      rule.style.display = 'none';
      return;
    }
    var groups = { Morning: [], Afternoon: [] };
    day.slots.forEach(function (s) { (istHour(s.starts_at) < 13 ? groups.Morning : groups.Afternoon).push(s); });
    var pick = state.picks[state.day];
    el.innerHTML = Object.keys(groups).filter(function (g) { return groups[g].length; }).map(function (g) {
      return '<div class="bi-period">' + g + '</div><div class="bi-times">' + groups[g].map(function (s) {
        var on = pick && pick.id === s.id;
        return '<button class="bi-time' + (on ? ' is-on' : '') + '" data-slot="' + s.id + '"' + (s.available || on ? '' : ' disabled aria-label="' + esc(fmtTime(s.starts_at)) + ' taken"') + '>' + esc(fmtTime(s.starts_at)) + '</button>';
      }).join('') + '</div>';
    }).join('') || '<p class="bi-hint">No slots left on this day.</p>';
    rule.style.display = pick ? 'block' : 'none';
    el.querySelectorAll('[data-slot]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-slot'));
        var slot = day.slots.filter(function (s) { return s.id === id; })[0];
        if (state.picks[state.day] && state.picks[state.day].id === id) {
          delete state.picks[state.day];
        } else if (!state.picks[state.day] && pickedList().length >= maxPick()) {
          toast(maxPick() === 1 ? 'You have 1 slot left to book. Remove your pick (at the bottom) to choose a different one.'
            : 'You can pick up to ' + maxPick() + ' slots. Remove one (tap it at the bottom) to choose a different day.');
          return;
        } else {
          state.picks[state.day] = slot;
        }
        hideReview();
        renderDays(); renderTimes(); renderBar();
      });
    });
  }

  function renderBar() {
    var list = pickedList();
    bar.hidden = false;
    var left = maxPick() - list.length;
    document.getElementById('barCount').textContent = !list.length
      ? 'Pick a slot to book'
      : list.length + ' ' + plural(list.length, 'slot', 'slots') + ' selected' + (left ? ' · up to ' + left + ' more' : '') + (branchNow() ? '' : ' · choose branch');
    document.getElementById('barChips').innerHTML = list.map(function (s) {
      var f = fmtDayShort(new Date(new Date(s.starts_at).getTime() + 5.5 * 3600000).toISOString().slice(0, 10));
      return '<button class="bi-chip" data-unpick="' + s.id + '" aria-label="Remove ' + esc(f.dm + ' ' + fmtTime(s.starts_at)) + '">' + esc(f.dm) + ' ' + esc(fmtTime(s.starts_at)) + ' <i class="fas fa-xmark"></i></button>';
    }).join('');
    document.querySelectorAll('[data-unpick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-unpick'));
        Object.keys(state.picks).forEach(function (k) { if (state.picks[k].id === id) delete state.picks[k]; });
        hideReview();
        renderDays(); renderTimes(); renderBar();
      });
    });
    var reviewBtn = document.getElementById('reviewBtn');
    reviewBtn.disabled = !list.length;
    reviewBtn.innerHTML = 'Book ' + (list.length > 1 ? list.length + ' slots' : 'slot') + ' <i class="fas fa-arrow-right"></i>';
    var stepEl = document.getElementById('slotStep');
    if (stepEl) {
      stepEl.className = 'bi-step' + (list.length ? ' bi-step--done' : '');
      stepEl.innerHTML = list.length ? '<i class="fas fa-check"></i>' : String(state.reviewStep - 1);
    }
  }

  function hideReview() {
    var rc = document.getElementById('reviewCard');
    if (rc) rc.style.display = 'none';
  }

  function showReview() {
    if (!branchNow()) { toast('Please choose your branch first.'); document.getElementById('branchCard').scrollIntoView({ behavior: 'smooth' }); return; }
    var list = pickedList();
    var b = booked();
    var left = b.remaining - list.length;
    var rc = document.getElementById('reviewCard');
    rc.innerHTML =
      '<div class="bi-h2"><span class="bi-step">' + state.reviewStep + '</span> Review &amp; confirm</div>' +
      '<p class="bi-hint">Branch: <strong>' + esc(branchNow()) + '</strong>' + (left ? ' · after this you will have <strong>' + left + ' ' + plural(left, 'slot', 'slots') + '</strong> left to book anytime' : ' · this completes your ' + b.total + ' slots') + '</p>' +
      '<ul class="bi-list">' + list.map(function (s) {
        return '<li><span class="bi-no">' + esc(fmtDayShort(new Date(new Date(s.starts_at).getTime() + 5.5 * 3600000).toISOString().slice(0, 10)).wd) + '</span><span class="bi-when"><b>' + esc(fmtDayLong(s.starts_at)) + '</b><span>' + esc(fmtTime(s.starts_at)) + ' - ' + esc(fmtTime(s.ends_at)) + '</span></span></li>';
      }).join('') + '</ul>' +
      '<div class="bi-warn"><i class="fas fa-triangle-exclamation"></i> Once booked, ' + plural(list.length, 'this slot', 'these slots') + ' <strong>cannot be rescheduled or cancelled</strong>. A missed slot is forfeited.</div>' +
      '<label class="bi-agree"><input type="checkbox" id="agree" /> <span>I have read and agree to the <a href="#" id="termsLink">slot booking terms &amp; conditions</a>, and I will reach 15 minutes early with 4 copies of my DAF and a photo ID, in formal attire.</span></label>' +
      '<div class="bi-row"><button class="bi-btn bi-btn--ghost" id="editBtn"><i class="fas fa-pen"></i> Change</button><button class="bi-btn" id="confirmBtn" disabled><i class="fas fa-lock"></i> Confirm booking</button></div>';
    rc.style.display = 'block';
    var agree = document.getElementById('agree');
    var confirmBtn = document.getElementById('confirmBtn');
    agree.addEventListener('change', function () { confirmBtn.disabled = !agree.checked; });
    document.getElementById('termsLink').addEventListener('click', function (e) {
      e.preventDefault();
      var t = document.getElementById('termsFold');
      t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.getElementById('editBtn').addEventListener('click', function () { hideReview(); document.getElementById('slotCard').scrollIntoView({ behavior: 'smooth' }); });
    confirmBtn.addEventListener('click', submit);
    rc.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function afterSuccess(data, newIds) {
    state.data.booked = data.booked;
    state.data.phases = data.phases;
    state.picks = {};
    state.justBooked = newIds;
    state.submitting = false;
    render();
    window.scrollTo(0, 0);
  }

  function demoBook(list) {
    var b = booked();
    var phase = state.phase;
    var ids = [];
    var all = b.bookings.concat(list.map(function (s, i) {
      var id = 'demo-' + s.id; ids.push(id);
      return { id: id, starts_at: s.starts_at, ends_at: s.ends_at, venue_name: phase.venue_name, venue_address: phase.venue_address, maps_link: phase.maps_link };
    })).sort(function (x, y) { return new Date(x.starts_at) - new Date(y.starts_at); })
      .map(function (x, i) { x.interview_no = i + 1; return x; });
    var takenDays = {};
    all.forEach(function (x) { takenDays[new Date(new Date(x.starts_at).getTime() + 5.5 * 3600000).toISOString().slice(0, 10)] = true; });
    phase.days.forEach(function (d) {
      d.slots.forEach(function (s) { if (list.some(function (p) { return p.id === s.id; })) s.available = false; });
      d.available = d.slots.filter(function (s) { return s.available; }).length;
      d.taken = !!takenDays[d.date];
    });
    phase.bookable = phase.days.some(function (d) { return d.available > 0 && !d.taken; });
    var remaining = b.total - all.length;
    return { booked: { branch: branchNow(), total: b.total, remaining: remaining, bookings: all }, phases: remaining ? [phase] : [], new_ids: ids };
  }

  function submit() {
    if (state.submitting) return;
    var btn = document.getElementById('confirmBtn');
    state.submitting = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking…';
    var list = pickedList();

    if (DEMO) {
      setTimeout(function () { var r = demoBook(list); afterSuccess(r, r.new_ids); }, 900);
      return;
    }

    var body = { phase_id: state.phase.id, slot_ids: list.map(function (s) { return s.id; }), agreed: true };
    if (!booked().branch) body.branch = state.branch;
    api('POST', body)
      .then(function (res) { afterSuccess(res, res.new_ids || []); })
      .catch(function (err) {
        state.submitting = false;
        toast(err.message);
        if (err.status === 409) {
          // Someone else took a slot (or the round changed) - refresh
          // availability and keep the picks that are still free.
          return api('GET').then(function (data) {
            var keep = {};
            (data.phases || []).forEach(function (p) { p.days.forEach(function (d) { d.slots.forEach(function (s) { if (s.available && !d.taken) keep[s.id] = true; }); }); });
            Object.keys(state.picks).forEach(function (k) { if (!keep[state.picks[k].id]) delete state.picks[k]; });
            state.data = data;
            keepScroll(render);
          }).catch(showError);
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-lock"></i> Confirm booking';
      });
  }

  document.getElementById('reviewBtn').addEventListener('click', showReview);
  app.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#retryBtn') : null;
    if (t) load();
  });

  /* ── Boot ── */
  function load() {
    bar.hidden = true;
    app.innerHTML = '<div class="bi-card bi-state" id="loading"><i class="fas fa-spinner fa-spin big"></i><div>Loading your booking…</div>' +
      '<div class="bi-slow" id="slowNote">Waking up our server - this can take up to a minute the first time. Please keep this page open.</div></div>';
    var slow = setTimeout(function () { var n = document.getElementById('slowNote'); if (n) n.style.display = 'block'; }, 5000);

    var p = DEMO ? new Promise(function (r) { setTimeout(function () { r(demoData()); }, 500); }) : api('GET');
    p.then(function (data) {
      clearTimeout(slow);
      state.data = data;
      render();
    }).catch(function (err) { clearTimeout(slow); showError(err); });
  }

  if (!DEMO && !TOKEN && !learnerToken()) {
    showError(Object.assign(new Error('You are not logged in.'), { status: 401 }));
  } else {
    load();
  }
})();
