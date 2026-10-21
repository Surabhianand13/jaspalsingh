/* ============================================================
   interviews-admin.js  -  Admin > Interview Booking
   Phases (booking rounds) for interview programs (RPSC AE first):
     - create a phase: dates, time windows, slot length, venue -> slots
       are generated automatically
     - open / close booking, send invites, remind learners with slots
       still pending
     - day-wise schedule (print / CSV), block or unblock free slots
     - paid learners with booking status, personal booking links,
       release a learner's slots (refund / emergency)
     - Google Calendar connection check, sample emails
   Backend: routes/interviews.js

   Exposes: window.InterviewsAdmin.load()
   ============================================================ */

(function () {
  'use strict';

  var API = location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  var TZ = 'Asia/Kolkata';
  var state = { overview: null, phaseId: null, tab: 'schedule', schedule: null, learners: null, day: null, filter: '' };

  function token() { return localStorage.getItem('jaspal_admin_token'); }
  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token() ? { Authorization: 'Bearer ' + token() } : {}),
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (r.status === 401) { location.href = '/admin/login'; throw new Error('Session expired'); }
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
        return d;
      });
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function msg(text, type) {
    if (typeof window.showToast === 'function') return window.showToast(text, type);
    alert(text);
  }
  function $(id) { return document.getElementById(id); }
  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).toUpperCase();
  }
  function fmtDay(iso) {
    return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
  }
  function fmtKey(key, opts) {
    return new Date(key + 'T12:00:00+05:30').toLocaleDateString('en-IN', Object.assign({ timeZone: TZ }, opts || { weekday: 'short', day: 'numeric', month: 'short' }));
  }
  function phase() {
    return state.overview && state.overview.phases.filter(function (p) { return p.id === state.phaseId; })[0];
  }

  /* ── Load ── */
  function load() {
    var body = $('interviewsBody');
    if (!body) return;
    if (!state.overview) body.innerHTML = '<p class="admin-empty">Loading… (the server may take up to a minute to wake up)</p>';
    return api('GET', '/api/interviews/admin/overview').then(function (d) {
      state.overview = d;
      if (state.phaseId && !phase()) state.phaseId = null;
      if (!state.phaseId && d.phases.length) {
        var open = d.phases.filter(function (p) { return p.status === 'open'; })[0];
        state.phaseId = (open || d.phases[0]).id;
      }
      render();
      if (state.phaseId) loadDetail();
    }).catch(function (e) { body.innerHTML = '<p class="admin-empty" style="color:#B91C1C;">' + esc(e.message) + '</p>'; });
  }

  function loadDetail() {
    var id = state.phaseId;
    var url = state.tab === 'schedule' ? '/schedule' : '/learners';
    var el = $('ivDetail');
    if (el) el.innerHTML = '<p class="admin-empty">Loading…</p>';
    return api('GET', '/api/interviews/admin/phases/' + id + url).then(function (d) {
      if (id !== state.phaseId) return;
      if (state.tab === 'schedule') {
        state.schedule = d;
        if (!state.day || !d.days.some(function (x) { return x.date === state.day; })) {
          var todayKey = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
          var upcoming = d.days.filter(function (x) { return x.date >= todayKey; })[0];
          state.day = (upcoming || d.days[0] || {}).date || null;
        }
      } else {
        state.learners = d.learners;
      }
      renderDetail();
    }).catch(function (e) { if (el) el.innerHTML = '<p class="admin-empty" style="color:#B91C1C;">' + esc(e.message) + '</p>'; });
  }

  /* ── Render: top + phase cards ── */
  function render() {
    var d = state.overview;
    var cal = d.calendar;
    var html =
      '<div class="iv-bar">' +
        '<div><strong><i class="fab fa-google"></i> Calendar sync:</strong> ' + esc(cal.calendarId) +
          (cal.configured ? '' : ' <span class="iv-badge iv-badge--warn">service account not set on Render</span>') +
          ' <button class="btn-admin-secondary iv-sm" id="ivCalCheck">Check connection</button> <span id="ivCalMsg"></span></div>' +
        '<div class="iv-sample"><input type="email" id="ivSampleTo" placeholder="Send sample emails to…" value="anand.surabhi.a@gmail.com" />' +
          '<button class="btn-admin-secondary iv-sm" id="ivSampleBtn"><i class="fas fa-paper-plane"></i> Send sample emails</button></div>' +
      '</div>' +
      '<div id="ivNewForm" style="display:none;"></div>';

    if (!d.phases.length) {
      html += '<div class="iv-empty"><i class="fas fa-calendar-plus"></i><p>No booking phases yet. Create <strong>Phase 1</strong> to generate the slots.</p>' +
        '<button class="btn" id="ivNewBtn2"><i class="fas fa-plus"></i> Create Phase 1</button></div>';
    } else {
      html += '<div class="iv-phases">' + d.phases.map(phaseCard).join('') + '</div>' +
        '<div class="iv-detail-wrap" id="ivDetailWrap">' +
          '<div class="iv-tabs"><button class="iv-tab' + (state.tab === 'schedule' ? ' is-on' : '') + '" data-tab="schedule"><i class="fas fa-calendar-days"></i> Day-wise schedule</button>' +
          '<button class="iv-tab' + (state.tab === 'learners' ? ' is-on' : '') + '" data-tab="learners"><i class="fas fa-users"></i> Paid learners</button></div>' +
          '<div id="ivDetail"></div>' +
        '</div>';
    }
    $('interviewsBody').innerHTML = html;
    wireTop();
  }

  function stat(n, label, tone) {
    return '<div class="iv-stat' + (tone ? ' iv-stat--' + tone : '') + '"><b>' + n + '</b><span>' + label + '</span></div>';
  }

  function phaseCard(p) {
    var s = p.stats;
    var statusBadge = { draft: '<span class="iv-badge">Draft - not visible to learners</span>', open: '<span class="iv-badge iv-badge--ok">Open for booking</span>', closed: '<span class="iv-badge iv-badge--off">Closed</span>' }[p.status];
    var range = fmtKey(p.date_from, { day: 'numeric', month: 'short' }) + ' - ' + fmtKey(p.date_to, { day: 'numeric', month: 'short', year: 'numeric' });
    var windows = (p.windows || []).map(function (w) { return w.start + '-' + w.end; }).join(', ');
    var actions = [];
    if (p.status === 'draft') actions.push('<button class="btn iv-sm" data-status="open" data-id="' + p.id + '"><i class="fas fa-lock-open"></i> Open booking</button>');
    if (p.status === 'open') {
      actions.push('<button class="btn iv-sm" data-invite="new" data-id="' + p.id + '"' + (s.not_invited ? '' : ' disabled') + '><i class="fas fa-envelope"></i> Send invites (' + s.not_invited + ' new)</button>');
      actions.push('<button class="btn-admin-secondary iv-sm" data-invite="remind" data-id="' + p.id + '"' + (s.invited_pending ? '' : ' disabled') + '><i class="fas fa-bell"></i> Remind pending (' + s.invited_pending + ')</button>');
      actions.push('<button class="btn-admin-secondary iv-sm" data-status="closed" data-id="' + p.id + '"><i class="fas fa-lock"></i> Close booking</button>');
    }
    if (p.status === 'closed') actions.push('<button class="btn-admin-secondary iv-sm" data-status="open" data-id="' + p.id + '"><i class="fas fa-lock-open"></i> Reopen booking</button>');
    if (!s.slots_booked) actions.push('<button class="btn-admin-secondary iv-sm iv-danger" data-delete="' + p.id + '"><i class="fas fa-trash"></i> Delete</button>');

    return '<div class="iv-phase' + (p.id === state.phaseId ? ' is-on' : '') + '" data-pick="' + p.id + '">' +
      '<div class="iv-phase-head"><div><h3>' + esc(p.name) + '</h3><div class="iv-meta">' + esc(range) + ' · ' + esc(windows) + ' · ' + p.slot_minutes + ' min · ' + p.slots_per_learner + ' per learner' + (p.skip_sundays ? ' · no Sundays' : '') + '</div>' +
        '<div class="iv-meta">' + esc(p.venue_name) + ', ' + esc(p.venue_address) + '</div></div>' + statusBadge + '</div>' +
      '<div class="iv-stats">' +
        stat(s.slots_free, 'slots free', 'ok') + stat(s.slots_booked, 'booked') + stat(s.slots_blocked, 'blocked') +
        stat(s.fully_booked, 'learners: all ' + p.slots_per_learner + ' booked', 'ok') + stat(s.partly_booked, 'part booked') + stat(s.not_started, 'not started', s.not_started ? 'warn' : '') +
        stat(s.eligible_learners, 'paid learners') +
        (s.calendar_pending ? stat(s.calendar_pending, 'not on calendar yet', 'warn') : '') +
      '</div>' +
      '<div class="iv-actions">' + actions.join('') + '</div>' +
    '</div>';
  }

  function wireTop() {
    var root = $('interviewsBody');
    var newBtn2 = $('ivNewBtn2'); if (newBtn2) newBtn2.addEventListener('click', showNewForm);
    $('ivCalCheck').addEventListener('click', checkCalendar);
    $('ivSampleBtn').addEventListener('click', sendSamples);
    root.querySelectorAll('[data-pick]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        var id = Number(card.getAttribute('data-pick'));
        if (id === state.phaseId) return;
        state.phaseId = id; state.day = null; state.schedule = null; state.learners = null;
        render(); loadDetail();
      });
    });
    root.querySelectorAll('[data-status]').forEach(function (b) {
      b.addEventListener('click', function () { setStatus(Number(b.getAttribute('data-id')), b.getAttribute('data-status')); });
    });
    root.querySelectorAll('[data-invite]').forEach(function (b) {
      b.addEventListener('click', function () { sendInvites(Number(b.getAttribute('data-id')), b.getAttribute('data-invite')); });
    });
    root.querySelectorAll('[data-delete]').forEach(function (b) {
      b.addEventListener('click', function () { deletePhase(Number(b.getAttribute('data-delete'))); });
    });
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.getAttribute('data-tab');
        root.querySelectorAll('[data-tab]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        loadDetail();
      });
    });
  }

  /* ── Actions ── */
  function checkCalendar() {
    var el = $('ivCalMsg');
    el.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    api('GET', '/api/interviews/admin/calendar-check').then(function (r) {
      el.innerHTML = r.ok
        ? '<span class="iv-badge iv-badge--ok"><i class="fas fa-check"></i> Connected - bookings will appear on the calendar</span>'
        : '<span class="iv-badge iv-badge--warn">' + esc(r.error) + '</span>' +
          (r.serviceAccount ? '<div class="iv-help">Fix: open Google Calendar as <strong>' + esc(r.calendarId) + '</strong> &rarr; Settings &rarr; your calendar &rarr; <em>Share with specific people</em> &rarr; Add <strong>' + esc(r.serviceAccount) + '</strong> with <em>Make changes to events</em>. Then click Check again. Bookings made before this will sync automatically within 15 minutes.</div>' : '');
    }).catch(function (e) { el.textContent = e.message; });
  }

  function sendSamples() {
    var to = $('ivSampleTo').value.trim();
    if (!to) return msg('Enter an email address.', 'error');
    if (!confirm('Send 7 sample emails (with dummy learner data) to ' + to + '?')) return;
    var btn = $('ivSampleBtn');
    btn.disabled = true;
    api('POST', '/api/interviews/admin/sample-emails', { to: to })
      .then(function (r) { msg(r.sent + ' sample emails queued to ' + to + ' - they arrive over the next few seconds.', 'success'); })
      .catch(function (e) { msg(e.message, 'error'); })
      .then(function () { btn.disabled = false; });
  }

  function setStatus(id, status) {
    var p = state.overview.phases.filter(function (x) { return x.id === id; })[0];
    var text = status === 'open'
      ? 'Open "' + p.name + '" for booking?\n\nLearners with the booking link can book right away. Invite emails are NOT sent until you click "Send invites". Learners who pay from now on get the link automatically.'
      : 'Close booking for "' + p.name + '"?\n\nNo new bookings will be possible. Existing bookings stay as they are.';
    if (!confirm(text)) return;
    api('PATCH', '/api/interviews/admin/phases/' + id, { status: status }).then(function () { msg('Updated.', 'success'); load(); }).catch(function (e) { msg(e.message, 'error'); });
  }

  function sendInvites(id, mode) {
    var p = state.overview.phases.filter(function (x) { return x.id === id; })[0];
    var n = mode === 'remind' ? p.stats.invited_pending : p.stats.not_invited;
    var text = mode === 'remind'
      ? 'Send a reminder to ' + n + ' learner(s) who still have slots to book?'
      : 'Email the booking link to ' + n + ' paid learner(s) who have not been invited to "' + p.name + '" yet?\n\nRefunded learners are excluded automatically.';
    if (!confirm(text)) return;
    api('POST', '/api/interviews/admin/phases/' + id + '/invites', { mode: mode }).then(function (r) {
      msg(r.queued + ' email(s) queued. They go out about 2 per second.', 'success');
      setTimeout(load, 1500);
    }).catch(function (e) { msg(e.message, 'error'); });
  }

  function deletePhase(id) {
    var p = state.overview.phases.filter(function (x) { return x.id === id; })[0];
    if (!confirm('Delete "' + p.name + '" and all its slots? This cannot be undone.')) return;
    api('DELETE', '/api/interviews/admin/phases/' + id).then(function () { msg('Phase deleted.', 'success'); state.phaseId = null; load(); }).catch(function (e) { msg(e.message, 'error'); });
  }

  /* ── New phase form ── */
  function showNewForm() {
    var d = state.overview;
    var v = d.defaults.venue;
    var n = d.phases.length + 1;
    var el = $('ivNewForm');
    el.style.display = 'block';
    el.innerHTML =
      '<div class="iv-form">' +
        '<h3>New booking phase</h3>' +
        '<div class="iv-grid">' +
          '<label>Phase name<input id="ivfName" value="Phase ' + n + '" /></label>' +
          '<label>Program slug<input id="ivfProgram" value="' + esc(d.defaults.program_slug) + '" /></label>' +
          '<label>From date<input type="date" id="ivfFrom" value="' + (n === 1 ? '2026-11-02' : '') + '" /></label>' +
          '<label>To date<input type="date" id="ivfTo" value="' + (n === 1 ? '2026-11-07' : '') + '" /></label>' +
          '<label>Morning start<input type="time" id="ivfW1s" value="09:00" /></label>' +
          '<label>Morning end<input type="time" id="ivfW1e" value="13:00" /></label>' +
          '<label>Afternoon start<input type="time" id="ivfW2s" value="14:00" /></label>' +
          '<label>Afternoon end<input type="time" id="ivfW2e" value="18:00" /></label>' +
          '<label>Slot length (minutes)<input type="number" id="ivfMin" value="15" min="5" max="180" /></label>' +
          '<label>Slots per learner<input type="number" id="ivfPer" value="3" min="1" max="10" /></label>' +
          '<label class="iv-check"><input type="checkbox" id="ivfSun" checked /> Skip Sundays</label>' +
          '<span></span>' +
          '<label class="iv-wide">Venue name<input id="ivfVName" value="' + esc(v.name) + '" /></label>' +
          '<label class="iv-wide">Venue address<input id="ivfVAddr" value="' + esc(v.address) + '" /></label>' +
          '<label class="iv-wide">Google Maps link<input id="ivfVMap" value="' + esc(v.mapsLink) + '" /></label>' +
        '</div>' +
        '<p class="iv-help" id="ivfPreview"></p>' +
        '<div class="iv-actions"><button class="btn" id="ivfSave"><i class="fas fa-check"></i> Create phase (as draft)</button><button class="btn-admin-secondary" id="ivfCancel">Cancel</button></div>' +
      '</div>';
    var inputs = el.querySelectorAll('input');
    inputs.forEach(function (i) { i.addEventListener('input', preview); i.addEventListener('change', preview); });
    preview();
    $('ivfCancel').addEventListener('click', function () { el.style.display = 'none'; });
    $('ivfSave').addEventListener('click', createPhase);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function formValues() {
    var windows = [];
    if ($('ivfW1s').value && $('ivfW1e').value) windows.push({ start: $('ivfW1s').value, end: $('ivfW1e').value });
    if ($('ivfW2s').value && $('ivfW2e').value) windows.push({ start: $('ivfW2s').value, end: $('ivfW2e').value });
    return {
      name: $('ivfName').value.trim(), program_slug: $('ivfProgram').value.trim(),
      date_from: $('ivfFrom').value, date_to: $('ivfTo').value, windows: windows,
      slot_minutes: Number($('ivfMin').value), slots_per_learner: Number($('ivfPer').value), skip_sundays: $('ivfSun').checked,
      venue_name: $('ivfVName').value.trim(), venue_address: $('ivfVAddr').value.trim(), maps_link: $('ivfVMap').value.trim(),
    };
  }

  function toMin(hm) { var p = hm.split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function preview() {
    var v = formValues();
    var out = $('ivfPreview');
    if (!v.date_from || !v.date_to || v.date_to < v.date_from || !v.slot_minutes) { out.textContent = 'Pick the dates to see how many slots this creates.'; return; }
    var perDay = v.windows.reduce(function (n, w) { return n + Math.max(0, Math.floor((toMin(w.end) - toMin(w.start)) / v.slot_minutes)); }, 0);
    var days = 0;
    for (var d = new Date(v.date_from + 'T00:00:00Z'); d <= new Date(v.date_to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
      if (!(v.skip_sundays && d.getUTCDay() === 0)) days++;
    }
    var total = perDay * days;
    out.innerHTML = '<strong>' + days + ' days × ' + perDay + ' slots = ' + total + ' slots</strong> - enough for <strong>' + Math.floor(total / (v.slots_per_learner || 1)) + ' learners</strong> at ' + v.slots_per_learner + ' slots each. ' +
      'Learners can book up to 1 slot per day, so each learner needs at least ' + v.slots_per_learner + ' days' + (days < v.slots_per_learner ? ' - <span style="color:#B91C1C;">this phase has fewer days than that, so nobody can book all their slots here</span>' : '') + '.';
  }

  function createPhase() {
    var btn = $('ivfSave');
    btn.disabled = true;
    api('POST', '/api/interviews/admin/phases', formValues()).then(function (r) {
      msg('Phase created with ' + r.slots + ' slots. It is a draft - click "Open booking" when ready.', 'success');
      state.phaseId = r.id;
      $('ivNewForm').style.display = 'none';
      load();
    }).catch(function (e) { msg(e.message, 'error'); btn.disabled = false; });
  }

  /* ── Detail: schedule / learners ── */
  function renderDetail() {
    var el = $('ivDetail');
    if (!el) return;
    if (state.tab === 'schedule') renderSchedule(el); else renderLearners(el);
  }

  function renderSchedule(el) {
    var d = state.schedule;
    if (!d || !d.days.length) { el.innerHTML = '<p class="admin-empty">No slots.</p>'; return; }
    var day = d.days.filter(function (x) { return x.date === state.day; })[0] || d.days[0];
    var tabs = d.days.map(function (x) {
      var booked = x.slots.filter(function (s) { return s.booking_id; }).length;
      return '<button class="iv-day' + (x.date === day.date ? ' is-on' : '') + '" data-day="' + x.date + '"><b>' + esc(fmtKey(x.date)) + '</b><span>' + booked + '/' + x.slots.length + ' booked</span></button>';
    }).join('');
    var rows = day.slots.map(function (s) {
      var status, action = '';
      if (s.booking_id) {
        status = '<span class="iv-badge iv-badge--ok">Booked</span>' + (s.refunded ? ' <span class="iv-badge iv-badge--warn">Refunded</span>' : '');
      } else if (s.is_blocked) {
        status = '<span class="iv-badge iv-badge--off">Blocked</span>';
        action = '<button class="btn-admin-secondary iv-sm" data-block="0" data-slot="' + s.id + '">Unblock</button>';
      } else {
        status = '<span class="iv-badge">Free</span>';
        action = '<button class="btn-admin-secondary iv-sm" data-block="1" data-slot="' + s.id + '">Block</button>';
      }
      var cal = !s.booking_id ? '' : s.calendar_event_id ? '<i class="fas fa-check" style="color:#16a34a;" title="On calendar"></i>' : '<i class="fas fa-triangle-exclamation" style="color:#B45309;" title="' + esc(s.calendar_error || 'Not synced yet') + '"></i>';
      return '<tr class="' + (s.booking_id ? 'iv-row-booked' : '') + '">' +
        '<td><strong>' + esc(fmtTime(s.starts_at)) + '</strong></td><td>' + status + '</td>' +
        '<td>' + (s.booking_id ? '<strong>' + esc(s.student_name) + '</strong><br><span class="iv-meta">' + esc(s.student_phone || '') + '</span>' : '') + '</td>' +
        '<td>' + esc(s.branch || '') + '</td><td>' + esc(s.roll_number || '') + '</td>' +
        '<td>' + (s.booking_id ? 'Interview ' + s.interview_no : '') + '</td><td>' + cal + '</td><td>' + action + '</td></tr>';
    }).join('');
    var bookedCount = day.slots.filter(function (s) { return s.booking_id; }).length;
    el.innerHTML =
      '<div class="iv-days">' + tabs + '</div>' +
      '<div class="iv-actions" style="margin:10px 0;"><strong style="margin-right:auto;">' + esc(fmtKey(day.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + ' - ' + bookedCount + ' interview(s)</strong>' +
        '<button class="btn-admin-secondary iv-sm" id="ivPrint"><i class="fas fa-print"></i> Print this day</button>' +
        '<button class="btn-admin-secondary iv-sm" id="ivCsv"><i class="fas fa-file-csv"></i> CSV (all days)</button></div>' +
      '<div class="iv-table-wrap"><table class="iv-table"><thead><tr><th>Time</th><th>Status</th><th>Learner</th><th>Branch</th><th>Roll no</th><th>#</th><th>Cal</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';

    el.querySelectorAll('[data-day]').forEach(function (b) {
      b.addEventListener('click', function () { state.day = b.getAttribute('data-day'); renderSchedule(el); });
    });
    el.querySelectorAll('[data-block]').forEach(function (b) {
      b.addEventListener('click', function () {
        var blocked = b.getAttribute('data-block') === '1';
        b.disabled = true;
        api('POST', '/api/interviews/admin/slots/' + b.getAttribute('data-slot') + '/block', { blocked: blocked })
          .then(function () { return loadDetail(); }).then(refreshStats)
          .catch(function (e) { msg(e.message, 'error'); b.disabled = false; });
      });
    });
    $('ivPrint').addEventListener('click', function () { printDay(day); });
    $('ivCsv').addEventListener('click', downloadCsv);
  }

  function refreshStats() {
    return api('GET', '/api/interviews/admin/overview').then(function (d) {
      state.overview = d;
      var wrap = document.querySelector('.iv-phases');
      if (wrap) { wrap.innerHTML = d.phases.map(phaseCard).join(''); wireTop(); }
    }).catch(function () {});
  }

  function printDay(day) {
    var p = phase();
    var rows = day.slots.filter(function (s) { return s.booking_id; }).map(function (s) {
      return '<tr><td>' + esc(fmtTime(s.starts_at)) + ' - ' + esc(fmtTime(s.ends_at)) + '</td><td>' + esc(s.student_name) + '</td><td>' + esc(s.branch) + '</td><td>' + esc(s.roll_number || '') + '</td><td>' + esc(s.student_phone || '') + '</td><td>Interview ' + s.interview_no + '</td><td style="width:90px;"></td></tr>';
    }).join('');
    var w = window.open('', '_blank');
    if (!w) return msg('Allow pop-ups to print.', 'error');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Interviews ' + esc(day.date) + '</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#555;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #bbb;padding:7px 8px;text-align:left}th{background:#f1f1f1}</style></head><body>' +
      '<h1>RPSC AE Interviews - ' + esc(fmtKey(day.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '</h1>' +
      '<p>' + esc(p ? p.name + ' · ' + p.venue_name : '') + ' · ' + day.slots.filter(function (s) { return s.booking_id; }).length + ' interviews</p>' +
      '<table><thead><tr><th>Time</th><th>Learner</th><th>Branch</th><th>Roll no</th><th>Phone</th><th>#</th><th>Present</th></tr></thead><tbody>' + (rows || '<tr><td colspan="7">No bookings</td></tr>') + '</tbody></table>' +
      '<script>window.onload=function(){window.print();}<\/script></body></html>');
    w.document.close();
  }

  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function downloadCsv() {
    var d = state.schedule;
    var lines = [['Date', 'Time', 'Learner', 'Branch', 'Roll no', 'Phone', 'Email', 'Interview #', 'Booked at', 'On calendar'].join(',')];
    d.days.forEach(function (day) {
      day.slots.filter(function (s) { return s.booking_id; }).forEach(function (s) {
        lines.push([fmtKey(day.date, { day: 'numeric', month: 'short', year: 'numeric' }), fmtTime(s.starts_at), s.student_name, s.branch, s.roll_number, s.student_phone, s.student_email, s.interview_no,
          new Date(s.booked_at).toLocaleString('en-IN', { timeZone: TZ }), s.calendar_event_id ? 'yes' : 'no'].map(csvCell).join(','));
      });
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'interview-bookings-' + (phase() ? phase().name.toLowerCase().replace(/\s+/g, '-') : 'phase') + '.csv';
    a.click();
  }

  function renderLearners(el) {
    var p = phase();
    var list = state.learners || [];
    var f = state.filter.toLowerCase();
    var shown = list.filter(function (l) {
      return !f || [l.student_name, l.student_email, l.student_phone, l.roll_number].join(' ').toLowerCase().indexOf(f) !== -1;
    });
    var rows = shown.map(function (l) {
      var total = p.slots_per_learner;
      var slots = (l.slots || []).map(function (s) { return esc(fmtDay(s.starts_at)) + ' ' + esc(fmtTime(s.starts_at)); }).join('<br>');
      var status = l.booked_count >= total ? '<span class="iv-badge iv-badge--ok">All ' + total + ' booked</span>'
        : l.booked_count ? '<span class="iv-badge">' + l.booked_count + ' of ' + total + ' booked</span>'
        : '<span class="iv-badge iv-badge--warn">Not booked</span>';
      var invite = l.invited_at ? 'Invited ' + esc(new Date(l.invited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })) + (l.last_reminded_at ? '<br>Reminded ' + esc(new Date(l.last_reminded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })) : '') : '<span class="iv-meta">Not invited to this phase</span>';
      return '<tr><td><strong>' + esc(l.student_name) + '</strong><br><span class="iv-meta">' + esc(l.student_phone || '') + ' · ' + esc(l.student_email || '') + '</span></td>' +
        '<td>' + esc(l.roll_number || '') + '</td><td>' + status + (l.branch ? '<br><span class="iv-meta">' + esc(l.branch) + '</span>' : '') + '</td><td>' + (slots || '') + '</td><td>' + invite + '</td>' +
        '<td class="iv-row-actions"><button class="btn-admin-secondary iv-sm" data-copy="' + esc(l.booking_link) + '" title="Copy this learner\'s personal booking link"><i class="fas fa-link"></i> Copy link</button>' +
          '<a class="btn-admin-secondary iv-sm" href="' + esc(l.booking_link) + '" target="_blank" rel="noopener" title="Book on the learner\'s behalf - they still get the confirmation email"><i class="fas fa-up-right-from-square"></i> Book for them</a>' +
          (l.booked_count ? '<button class="btn-admin-secondary iv-sm iv-danger" data-release="' + l.id + '" data-name="' + esc(l.student_name) + '"><i class="fas fa-rotate-left"></i> Release slots</button>' : '') +
        '</td></tr>';
    }).join('');
    el.innerHTML =
      '<div class="iv-actions" style="margin:4px 0 10px;"><input class="iv-search" id="ivSearch" placeholder="Search name, phone, email, roll no" value="' + esc(state.filter) + '" />' +
        '<span class="iv-meta" style="margin-left:auto;">' + list.length + ' paid learners (refunded excluded)</span></div>' +
      '<div class="iv-table-wrap"><table class="iv-table"><thead><tr><th>Learner</th><th>Roll no</th><th>Status</th><th>Booked slots</th><th>Invite</th><th></th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="6" class="iv-meta">No learners match.</td></tr>') + '</tbody></table></div>';

    var search = $('ivSearch');
    search.addEventListener('input', function () {
      state.filter = search.value;
      var pos = search.selectionStart;
      renderLearners(el);
      var s2 = $('ivSearch'); s2.focus(); s2.setSelectionRange(pos, pos);
    });
    el.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var link = b.getAttribute('data-copy');
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { msg('Booking link copied.', 'success'); }, function () { prompt('Copy this link:', link); });
      });
    });
    el.querySelectorAll('[data-release]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Release ALL booked slots of ' + b.getAttribute('data-name') + '?\n\nTheir slots become free for others and are removed from the calendar. No email is sent to the learner - inform them yourself. Use this only for refunds or emergencies.')) return;
        api('DELETE', '/api/interviews/admin/learners/' + b.getAttribute('data-release') + '/bookings')
          .then(function (r) { msg(r.released + ' slot(s) released.', 'success'); return loadDetail(); }).then(refreshStats)
          .catch(function (e) { msg(e.message, 'error'); });
      });
    });
  }

  window.InterviewsAdmin = { load: load, showNewForm: function () { if (state.overview) showNewForm(); } };
})();
