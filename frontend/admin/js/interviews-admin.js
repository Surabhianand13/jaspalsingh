/* ============================================================
   interviews-admin.js  -  Admin > Interview Booking
   Phases (booking rounds) for interview programs (RPSC AE first):
     - create a phase: dates, time windows, slot length, venue -> slots
       are generated automatically
     - open / close booking, send invites, remind learners with slots
       still pending
     - day-wise schedule (print / CSV), block or unblock free slots
     - per interview: attendance (present / absent / shifted), marks out
       of 72 + feedback or a note, and the recording's Drive link
       (shared only with that learner; shows on their My Programs card)
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
  var state = { overview: null, phaseId: null, tab: 'schedule', schedule: null, learners: null, day: null, filter: '', edit: null };

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
      '</div>' + branchBar(d.addon) + addonBar(d.addon) + dafBar(d.daf) +
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

  /* RPSC AE learners (programme + interviews only) by branch. Branch is
     asked at payment; older orders fall back to the branch they booked. */
  function branchBar(a) {
    var b = a && a.branches;
    if (!b) return '';
    var cell = function (label, r) {
      return '<div class="iv-stat"><b>' + r.total + '</b><span>' + label +
        (r.interviews_only ? '<br><small>' + r.programme + ' programme · ' + r.interviews_only + ' interviews only</small>' : '') + '</span></div>';
    };
    return '<div class="iv-bar" style="display:block;"><div style="margin-bottom:8px;"><strong><i class="fas fa-users"></i> RPSC AE learners by branch</strong></div>' +
      '<div class="iv-stats" style="margin:0;">' +
        cell('Total RPSC', b) +
        b.rows.map(function (r) { return r.branch || r.total ? cell(r.branch || 'Branch not given', r) : ''; }).join('') +
      '</div></div>';
  }

  /* Mock Interview Add-on packs: sales + the one-time offer email. */
  function addonBar(a) {
    if (!a) return '';
    return '<div class="iv-bar"><div><strong><i class="fas fa-user-tie"></i> Mock Interview Add-on:</strong> ' +
        a.packs.map(function (p) { return p.sold + ' × ' + p.slots + '-interview pack'; }).join(' · ') +
        ' · <strong>' + a.buyers + '</strong> learner' + (a.buyers === 1 ? '' : 's') + ' bought' +
        (a.interviews_only ? ' (' + a.interviews_only + ' interviews-only, not enrolled)' : '') +
        (a.offered ? ' · offer emailed to ' + a.offered : '') + '</div>' +
      '<div><button class="btn-admin-secondary iv-sm" id="ivAddonOffer"' + (a.not_offered ? '' : ' disabled') + '><i class="fas fa-bullhorn"></i> Email add-on offer (' + a.not_offered + ' learners)</button></div></div>';
  }

  /* One-time blank DAF PDF email to all active RPSC AE learners. */
  function dafBar(f) {
    if (!f) return '';
    return '<div class="iv-bar"><div><strong><i class="fas fa-file-pdf"></i> Blank DAF email:</strong> ' +
        '<a href="/assets/docs/rpsc-ae-daf-blank.pdf" target="_blank" rel="noopener">view PDF</a> · sent to <strong>' + f.sent + '</strong> of ' + f.total + ' learners</div>' +
      '<div class="iv-sample"><input id="ivDafTo" type="email" placeholder="your email for a sample" value="biz@solvvai.com">' +
        '<button class="btn-admin-secondary iv-sm" id="ivDafSample"><i class="fas fa-eye"></i> Send sample</button>' +
        '<button class="btn iv-sm" id="ivDafAll"' + (f.pending ? '' : ' disabled') + '><i class="fas fa-paper-plane"></i> Send to all (' + f.pending + ' learners)</button></div></div>';
  }
  function wireDaf() {
    // wireTop() also runs after stats refreshes - wire these only once.
    if (!$('ivDafSample') || $('ivDafSample').getAttribute('data-wired')) return;
    $('ivDafSample').setAttribute('data-wired', '1');
    if ($('ivDafSample')) $('ivDafSample').addEventListener('click', function () {
      var b = this, to = $('ivDafTo').value.trim();
      b.disabled = true;
      api('POST', '/api/interviews/admin/daf-email', { mode: 'sample', to: to })
        .then(function () { msg('Sample DAF email sent to ' + to + '.', 'success'); })
        .catch(function (e) { msg(e.message, 'error'); })
        .then(function () { b.disabled = false; });
    });
    if ($('ivDafAll')) $('ivDafAll').addEventListener('click', function () {
      var f = state.overview.daf;
      if (!confirm('Email the blank DAF PDF to ' + f.pending + ' active RPSC AE learner(s)?\n\nEach learner gets it only once. Refunded learners are skipped.')) return;
      this.disabled = true;
      api('POST', '/api/interviews/admin/daf-email', { mode: 'all' }).then(function (r) {
        msg('DAF email queued to ' + r.queued + ' learner(s) - emails go out over the next few minutes.', 'success');
        load();
      }).catch(function (e) { msg(e.message, 'error'); });
    });
  }

  function sendAddonOffers() {
    var a = state.overview.addon;
    if (!confirm('Email the Mock Interview Add-on offer (2 / 4 extra interviews) to ' + a.not_offered + ' paid RPSC AE learner(s)?\n\nEach learner gets it only once. Learners who already bought a pack, and refunded learners, are skipped.')) return;
    api('POST', '/api/interviews/admin/addon-offers').then(function (r) {
      msg('Add-on offer queued to ' + r.queued + ' learner(s) - emails go out over the next few minutes.', 'success');
      load();
    }).catch(function (e) { msg(e.message, 'error'); });
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
    actions.push('<button class="btn-admin-secondary iv-sm" data-venue-edit="' + p.id + '"><i class="fas fa-location-dot"></i> Edit venue</button>');
    if (!p.venue_tba && s.learners_booked) actions.push('<button class="btn-admin-secondary iv-sm" data-venue-mail="' + p.id + '"><i class="fas fa-envelope-open-text"></i> Email venue to booked learners (' + s.learners_booked + ')</button>');
    if (!s.slots_booked) actions.push('<button class="btn-admin-secondary iv-sm iv-danger" data-delete="' + p.id + '"><i class="fas fa-trash"></i> Delete</button>');

    return '<div class="iv-phase' + (p.id === state.phaseId ? ' is-on' : '') + '" data-pick="' + p.id + '">' +
      '<div class="iv-phase-head"><div><h3>' + esc(p.name) + '</h3><div class="iv-meta">' + esc(range) + ' · ' + esc(windows) + ' · ' + p.slot_minutes + ' min · ' + p.slots_per_learner + ' per learner' + (p.skip_sundays ? ' · no Sundays' : '') + '</div>' +
        '<div class="iv-meta">' + (p.venue_tba
          ? '<span class="iv-badge iv-badge--warn"><i class="fas fa-location-dot"></i> Venue not finalised - learners see "details will be shared soon on email"</span>'
          : '<i class="fas fa-location-dot"></i> ' + esc(p.venue_name) + ', ' + esc(p.venue_address) +
            (p.venue_announced_at ? ' <span class="iv-badge iv-badge--ok">Venue emailed ' + esc(new Date(p.venue_announced_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })) + '</span>' : '')) +
        '</div></div>' + statusBadge + '</div>' +
      '<div id="ivVenueEdit' + p.id + '"></div>' +
      '<div class="iv-stats">' +
        stat(s.slots_free, 'slots free', 'ok') + stat(s.slots_booked, 'booked') + stat(s.slots_blocked, 'blocked') +
        stat(s.fully_booked, 'learners: all booked', 'ok') + stat(s.partly_booked, 'part booked') + stat(s.not_started, 'not started', s.not_started ? 'warn' : '') +
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
    if ($('ivAddonOffer')) $('ivAddonOffer').addEventListener('click', sendAddonOffers);
    wireDaf();
    root.querySelectorAll('[data-pick]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        var id = Number(card.getAttribute('data-pick'));
        if (id === state.phaseId) return;
        state.phaseId = id; state.day = null; state.schedule = null; state.learners = null; state.edit = null;
        render(); loadDetail();
      });
    });
    root.querySelectorAll('[data-status]').forEach(function (b) {
      b.addEventListener('click', function () { setStatus(Number(b.getAttribute('data-id')), b.getAttribute('data-status')); });
    });
    root.querySelectorAll('[data-invite]').forEach(function (b) {
      b.addEventListener('click', function () { sendInvites(Number(b.getAttribute('data-id')), b.getAttribute('data-invite')); });
    });
    root.querySelectorAll('[data-venue-edit]').forEach(function (b) {
      b.addEventListener('click', function () { editVenue(Number(b.getAttribute('data-venue-edit'))); });
    });
    root.querySelectorAll('[data-venue-mail]').forEach(function (b) {
      b.addEventListener('click', function () { announceVenue(Number(b.getAttribute('data-venue-mail'))); });
    });
    root.querySelectorAll('[data-delete]').forEach(function (b) {
      b.addEventListener('click', function () { deletePhase(Number(b.getAttribute('data-delete'))); });
    });
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.getAttribute('data-tab'); state.edit = null;
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
    if (!confirm('Send 10 sample emails (with dummy learner data) to ' + to + '?')) return;
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

  /* ── Venue: edit + announce ── */
  function editVenue(id) {
    var p = state.overview.phases.filter(function (x) { return x.id === id; })[0];
    var el = $('ivVenueEdit' + id);
    if (el.innerHTML) { el.innerHTML = ''; return; }
    var d = state.overview.defaults.venue;
    // Pre-fill the usual centre when the venue was never filled in.
    var v = p.venue_address || !d.address ? p : Object.assign({}, p, { venue_name: d.name, venue_address: d.address, maps_link: d.mapsLink });
    el.innerHTML = '<div class="iv-form" style="margin:12px 0 0;border-width:1.5px;">' +
      '<div class="iv-grid">' + venueFields('ive' + id, v) + '</div>' +
      '<p class="iv-help">Saving updates the booking page, every future email and sir\'s calendar events right away. Learners who already booked are only emailed when you click "Email venue to booked learners".</p>' +
      '<div class="iv-actions"><button class="btn iv-sm" id="iveSave' + id + '"><i class="fas fa-check"></i> Save venue</button><button class="btn-admin-secondary iv-sm" id="iveCancel' + id + '">Cancel</button></div></div>';
    wireVenueFields('ive' + id);
    $('iveCancel' + id).addEventListener('click', function () { el.innerHTML = ''; });
    $('iveSave' + id).addEventListener('click', function () {
      var body = venueValues('ive' + id);
      if (!body.venue_tba && !body.venue_address) return msg('Enter the venue address, or tick "Venue not finalised yet".', 'error');
      if (body.venue_tba) { delete body.venue_name; delete body.venue_address; delete body.maps_link; }
      this.disabled = true;
      api('PATCH', '/api/interviews/admin/phases/' + id, body).then(function (r) {
        msg('Venue saved.', 'success');
        if (!body.venue_tba && r.booked_learners && confirm('Venue saved.\n\n' + r.booked_learners + ' learner(s) have already booked slots in "' + p.name + '". Email them the venue now?')) {
          return api('POST', '/api/interviews/admin/phases/' + id + '/announce-venue').then(function (a) {
            msg('Venue email queued to ' + a.queued + ' learner(s).', 'success');
          });
        }
      }).catch(function (e) { msg(e.message, 'error'); }).then(load);
    });
  }

  function announceVenue(id) {
    var p = state.overview.phases.filter(function (x) { return x.id === id; })[0];
    var again = p.venue_announced_at ? '\n\nNote: the venue was already emailed on ' + new Date(p.venue_announced_at).toLocaleString('en-IN', { timeZone: TZ }) + '. Only send again if it changed.' : '';
    if (!confirm('Email the venue (' + p.venue_name + ') to the ' + p.stats.learners_booked + ' learner(s) who booked slots in "' + p.name + '"?' + again)) return;
    api('POST', '/api/interviews/admin/phases/' + id + '/announce-venue').then(function (a) {
      msg('Venue email queued to ' + a.queued + ' learner(s).', 'success');
      setTimeout(load, 1200);
    }).catch(function (e) { msg(e.message, 'error'); });
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
          venueFields('ivf', { venue_tba: !v.address, venue_name: v.name, venue_address: v.address, maps_link: v.mapsLink }) +
        '</div>' +
        '<p class="iv-help" id="ivfPreview"></p>' +
        '<div class="iv-actions"><button class="btn" id="ivfSave"><i class="fas fa-check"></i> Create phase (as draft)</button><button class="btn-admin-secondary" id="ivfCancel">Cancel</button></div>' +
      '</div>';
    var inputs = el.querySelectorAll('input');
    inputs.forEach(function (i) { i.addEventListener('input', preview); i.addEventListener('change', preview); });
    wireVenueFields('ivf');
    preview();
    $('ivfCancel').addEventListener('click', function () { el.style.display = 'none'; });
    $('ivfSave').addEventListener('click', createPhase);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function formValues() {
    var windows = [];
    if ($('ivfW1s').value && $('ivfW1e').value) windows.push({ start: $('ivfW1s').value, end: $('ivfW1e').value });
    if ($('ivfW2s').value && $('ivfW2e').value) windows.push({ start: $('ivfW2s').value, end: $('ivfW2e').value });
    return Object.assign({
      name: $('ivfName').value.trim(), program_slug: $('ivfProgram').value.trim(),
      date_from: $('ivfFrom').value, date_to: $('ivfTo').value, windows: windows,
      slot_minutes: Number($('ivfMin').value), slots_per_learner: Number($('ivfPer').value), skip_sundays: $('ivfSun').checked,
    }, venueValues('ivf'));
  }

  /* ── Venue fields (new phase + Edit venue) ──
     "Venue not finalised yet" makes learners see "Venue details will be
     shared soon on email" everywhere until it is filled in. */
  function venueFields(prefix, v) {
    return '<label class="iv-check iv-wide"><input type="checkbox" id="' + prefix + 'Tba"' + (v.venue_tba ? ' checked' : '') + ' /> Venue not finalised yet - learners see "Venue details will be shared soon on email"</label>' +
      '<label class="iv-wide">Venue name<input id="' + prefix + 'VName" value="' + esc(v.venue_name || '') + '" /></label>' +
      '<label class="iv-wide">Venue address<input id="' + prefix + 'VAddr" value="' + esc(v.venue_address || '') + '" /></label>' +
      '<label class="iv-wide">Google Maps link<input id="' + prefix + 'VMap" value="' + esc(v.maps_link || '') + '" /></label>';
  }
  function wireVenueFields(prefix) {
    var tba = $(prefix + 'Tba');
    function sync() {
      ['VName', 'VAddr', 'VMap'].forEach(function (k) {
        var i = $(prefix + k);
        i.disabled = tba.checked;
        i.parentNode.style.opacity = tba.checked ? '.45' : '1';
      });
    }
    tba.addEventListener('change', sync);
    sync();
  }
  function venueValues(prefix) {
    var tba = $(prefix + 'Tba').checked;
    return {
      venue_tba: tba,
      venue_name: $(prefix + 'VName').value.trim(), venue_address: $(prefix + 'VAddr').value.trim(), maps_link: $(prefix + 'VMap').value.trim(),
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
      var res = resultCells(s, d);
      var cal = !s.booking_id ? '' : s.calendar_event_id ? '<i class="fas fa-check" style="color:#16a34a;" title="On calendar"></i>' : '<i class="fas fa-triangle-exclamation" style="color:#B45309;" title="' + esc(s.calendar_error || 'Not synced yet') + '"></i>';
      return '<tr class="' + (s.booking_id ? 'iv-row-booked' : '') + '">' +
        '<td><strong>' + esc(fmtTime(s.starts_at)) + '</strong></td><td>' + status + '</td>' +
        '<td>' + (s.booking_id ? '<strong>' + esc(s.student_name) + '</strong><br><span class="iv-meta">' + esc(s.student_phone || '') + '</span>' : '') + '</td>' +
        '<td>' + esc(s.branch || '') + '</td><td>' + esc(s.roll_number || '') + '</td>' +
        '<td>' + (s.booking_id ? 'Interview ' + s.interview_no : '') + '</td><td>' + cal + '</td>' +
        '<td>' + res.attendance + '</td><td class="iv-fb-cell">' + res.feedback + '</td><td>' + res.recording + '</td>' +
        '<td>' + action + '</td></tr>' +
        (s.booking_id && state.edit && state.edit.id === s.booking_id ? '<tr class="iv-edit-row"><td colspan="11">' + editorHtml(s, d) + '</td></tr>' : '');
    }).join('');
    var bookedCount = day.slots.filter(function (s) { return s.booking_id; }).length;
    el.innerHTML =
      '<div class="iv-days">' + tabs + '</div>' +
      '<div class="iv-actions" style="margin:10px 0;"><strong style="margin-right:auto;">' + esc(fmtKey(day.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + ' - ' + bookedCount + ' interview(s)</strong>' +
        '<button class="btn-admin-secondary iv-sm" id="ivPrint"><i class="fas fa-print"></i> Print this day</button>' +
        '<button class="btn-admin-secondary iv-sm" id="ivCsv"><i class="fas fa-file-csv"></i> CSV (all days)</button></div>' +
      '<div class="iv-table-wrap"><table class="iv-table"><thead><tr><th>Time</th><th>Status</th><th>Learner</th><th>Branch</th><th>Roll no</th><th>#</th><th>Cal</th><th>Attendance</th><th>Feedback</th><th>Recording</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';

    el.querySelectorAll('[data-day]').forEach(function (b) {
      b.addEventListener('click', function () { state.day = b.getAttribute('data-day'); state.edit = null; renderSchedule(el); });
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
    wireResults(el);
  }

  /* ── Attendance / feedback / recording (per booked interview) ── */
  var ATT = {
    present: '<span class="iv-badge iv-badge--ok">Present</span>',
    absent: '<span class="iv-badge iv-badge--bad">Absent</span>',
    shifted: '<span class="iv-badge iv-badge--info">Shifted</span>',
  };
  function findSlot(bookingId) {
    var out = null;
    (state.schedule ? state.schedule.days : []).forEach(function (day) {
      day.slots.forEach(function (s) { if (s.booking_id === bookingId) out = s; });
    });
    return out;
  }
  function clip(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; }

  function resultCells(s, d) {
    if (!s.booking_id) return { attendance: '', feedback: '', recording: '' };
    var id = s.booking_id, a = s.attendance;
    var attendance = a
      ? ATT[a] + (a === 'absent' && s.absent_emailed_at ? ' <i class="fas fa-envelope-circle-check" style="color:#16a34a;" title="Absent email sent"></i>' : '') + ' <button class="iv-link" data-res-edit="' + id + '" data-kind="result">change</button>'
      : '<select class="iv-att-select" data-att-pick="' + id + '"><option value="">Mark…</option><option value="present">Present</option><option value="absent">Absent</option><option value="shifted">Shifted</option></select>';
    var feedback;
    if (!a) feedback = '<span class="iv-meta">Mark attendance first</span>';
    else if (a === 'present') {
      feedback = (s.marks != null ? '<b>' + esc(Number(s.marks)) + ' / ' + d.max_marks + '</b><br>' : '') +
        (s.feedback ? '<span class="iv-meta">' + esc(clip(s.feedback, 60)) + '</span><br>' : '') +
        '<button class="btn-admin-secondary iv-sm" data-res-edit="' + id + '" data-kind="result">' + (s.marks != null || s.feedback ? 'Edit' : 'Add feedback') + '</button>';
    } else {
      feedback = (s.note ? '<span class="iv-meta">' + (a === 'shifted' ? 'Note: ' : 'Reason: ') + esc(clip(s.note, 60)) + '</span><br>' : '') +
        '<button class="btn-admin-secondary iv-sm" data-res-edit="' + id + '" data-kind="result">' + (s.note ? 'Edit' : 'Add ' + (a === 'shifted' ? 'note' : 'reason')) + '</button>';
    }
    var recording;
    if (a !== 'present') recording = a ? '<span class="iv-meta">Not needed</span>' : '<span class="iv-meta">-</span>';
    else if (s.recording_url && s.recording_shared_at) recording = '<span class="iv-badge iv-badge--ok"><i class="fas fa-lock"></i> Shared with learner</span><br><a class="iv-link" href="' + esc(s.recording_url) + '" target="_blank" rel="noopener">open</a> · <button class="iv-link" data-res-edit="' + id + '" data-kind="rec">change</button>';
    else if (s.recording_url) recording = '<span class="iv-badge iv-badge--warn" title="' + esc(s.recording_error || '') + '"><i class="fas fa-triangle-exclamation"></i> Not shared</span><br><span class="iv-meta">' + esc(clip(s.recording_error, 70)) + '</span><br><button class="btn-admin-secondary iv-sm" data-res-edit="' + id + '" data-kind="rec">Retry / change</button>';
    else recording = '<span class="iv-badge">Pending</span><br><button class="btn-admin-secondary iv-sm" data-res-edit="' + id + '" data-kind="rec">Add link</button>';
    return { attendance: attendance, feedback: feedback, recording: recording };
  }

  function editorHtml(s, d) {
    var e = state.edit, a = e.attendance;
    var head = '<div class="iv-edit-head"><strong>' + esc(s.student_name) + ' - Interview ' + s.interview_no + '</strong> <span class="iv-meta">' + esc(fmtDay(s.starts_at)) + ', ' + esc(fmtTime(s.starts_at)) + '</span></div>';
    if (e.kind === 'rec') {
      var gmail = /@(gmail|googlemail)\.com$/i.test(s.student_email || '');
      return '<div class="iv-form iv-edit">' + head +
        '<div class="iv-grid"><label class="iv-wide">Google Drive link of the recording<input id="ivRecUrl" placeholder="https://drive.google.com/file/d/..." value="' + esc(s.recording_url || '') + '"></label></div>' +
        '<p class="iv-help"><i class="fas fa-lock"></i> Shared view only (no download) with <strong>' + esc(s.student_email || 'no email') + '</strong> only. Keep the file itself restricted, never "Anyone with the link".' +
          (gmail ? '' : '<br><span style="color:#B45309;">This is not a Gmail address. If it has no Google account, the learner clicks "Request access" on the video and you approve it.</span>') +
          (d.drive_configured ? '' : '<br><span style="color:#B91C1C;">Google service account is not set up on the server.</span>') + '</p>' +
        '<div class="iv-actions"><button class="btn iv-sm" id="ivRecSave"><i class="fas fa-share-nodes"></i> Save and share</button>' +
          (s.recording_url ? '<button class="btn-admin-secondary iv-sm iv-danger" id="ivRecRemove">Remove from dashboard</button>' : '') +
          '<button class="btn-admin-secondary iv-sm" id="ivEditCancel">Cancel</button></div></div>';
    }
    var pick = '<label>Attendance<select id="ivAtt">' +
      ['present', 'absent', 'shifted'].map(function (k) { return '<option value="' + k + '"' + (a === k ? ' selected' : '') + '>' + k.charAt(0).toUpperCase() + k.slice(1) + '</option>'; }).join('') + '</select></label>';
    var fields = a === 'present'
      ? '<label>Marks (out of ' + d.max_marks + ')<input id="ivMarks" type="number" min="0" max="' + d.max_marks + '" step="0.5" value="' + (s.marks != null ? esc(Number(s.marks)) : '') + '"></label>' +
        '<label class="iv-wide">Detailed feedback (the learner sees this)<textarea id="ivFeedback" rows="5">' + esc(s.feedback || '') + '</textarea></label>'
      : '<label class="iv-wide">' + (a === 'shifted' ? 'Note, e.g. new date / slot (admin only, the learner does not see this)' : 'Reason (the learner sees this, also in the absent email)') +
        '<textarea id="ivNote" rows="3">' + esc(s.note || '') + '</textarea></label>';
    var absentHelp = a !== 'absent' ? '' : s.absent_emailed_at
      ? '<p class="iv-help"><i class="fas fa-envelope-circle-check"></i> Absent email already sent - it is not sent again.</p>'
      : '<p class="iv-help"><i class="fas fa-envelope"></i> Saving emails the learner that they were marked absent (no rescheduling). Write the reason first.</p>';
    return '<div class="iv-form iv-edit">' + head + '<div class="iv-grid">' + pick + fields + '</div>' + absentHelp +
      '<div class="iv-actions"><button class="btn iv-sm" id="ivResSave"><i class="fas fa-check"></i> Save</button>' +
        (s.attendance ? '<button class="btn-admin-secondary iv-sm iv-danger" id="ivResClear">Clear attendance</button>' : '') +
        '<button class="btn-admin-secondary iv-sm" id="ivEditCancel">Cancel</button></div></div>';
  }

  function openEditor(id, kind, attendance) {
    var s = findSlot(id);
    if (!s) return;
    state.edit = { id: id, kind: kind, attendance: attendance || s.attendance || 'present' };
    renderSchedule($('ivDetail'));
    var row = document.querySelector('.iv-edit-row');
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function closeEditor() { state.edit = null; renderSchedule($('ivDetail')); }
  function saveResult(id, body, btn) {
    if (btn) btn.disabled = true;
    return api('PATCH', '/api/interviews/admin/bookings/' + id + '/result', body).then(function () {
      var s = findSlot(id);
      if (s) {
        s.attendance = body.attendance;
        s.marks = body.attendance === 'present' && body.marks !== '' && body.marks != null ? Number(body.marks) : null;
        s.feedback = body.attendance === 'present' ? (body.feedback || '').trim() || null : null;
        s.note = body.attendance === 'absent' || body.attendance === 'shifted' ? (body.note || '').trim() || null : null;
      }
      state.edit = null;
      msg(body.attendance === 'absent' && !(s && s.absent_emailed_at) ? 'Saved - absent email is being sent to the learner.' : 'Saved.', 'success');
      renderSchedule($('ivDetail'));
      // Pick up the "absent email sent" tick once the server has sent it.
      if (body.attendance === 'absent') setTimeout(function () { if (!state.edit) loadDetail(); }, 4000);
    }).catch(function (e) { msg(e.message, 'error'); if (btn) btn.disabled = false; });
  }

  function wireResults(el) {
    el.querySelectorAll('[data-att-pick]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = Number(sel.getAttribute('data-att-pick'));
        if (sel.value) openEditor(id, 'result', sel.value);
      });
    });
    el.querySelectorAll('[data-res-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(Number(b.getAttribute('data-res-edit')), b.getAttribute('data-kind')); });
    });
    if (!state.edit) return;
    var id = state.edit.id;
    var cancel = $('ivEditCancel');
    if (cancel) cancel.addEventListener('click', closeEditor);
    var att = $('ivAtt');
    if (att) att.addEventListener('change', function () { state.edit.attendance = att.value; renderSchedule($('ivDetail')); });
    var save = $('ivResSave');
    if (save) save.addEventListener('click', function () {
      var a = $('ivAtt').value, body = { attendance: a };
      if (a === 'present') {
        body.marks = $('ivMarks').value.trim();
        body.feedback = $('ivFeedback').value;
        var max = state.schedule.max_marks;
        if (body.marks !== '' && (isNaN(Number(body.marks)) || Number(body.marks) < 0 || Number(body.marks) > max)) return msg('Marks must be between 0 and ' + max + '.', 'error');
      } else {
        body.note = $('ivNote').value;
      }
      saveResult(id, body, save);
    });
    var clear = $('ivResClear');
    if (clear) clear.addEventListener('click', function () {
      if (!confirm('Clear attendance, marks and feedback / note for this interview?')) return;
      saveResult(id, { attendance: null }, clear);
    });
    var recSave = $('ivRecSave');
    if (recSave) recSave.addEventListener('click', function () {
      var url = $('ivRecUrl').value.trim();
      if (!url) return msg('Paste the Google Drive link first.', 'error');
      recSave.disabled = true;
      recSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sharing…';
      api('POST', '/api/interviews/admin/bookings/' + id + '/recording', { url: url }).then(function (r) {
        msg(r.ok ? 'Recording shared with the learner.' : 'Saved, but not shared: ' + r.error, r.ok ? 'success' : 'error');
        state.edit = null;
        return loadDetail();
      }).catch(function (e) { msg(e.message, 'error'); recSave.disabled = false; recSave.innerHTML = '<i class="fas fa-share-nodes"></i> Save and share'; });
    });
    var recRemove = $('ivRecRemove');
    if (recRemove) recRemove.addEventListener('click', function () {
      if (!confirm('Remove the recording from this learner\'s dashboard?\n\nDrive access already given is not removed - remove it in Google Drive if needed.')) return;
      recRemove.disabled = true;
      api('POST', '/api/interviews/admin/bookings/' + id + '/recording', { url: '' }).then(function () {
        msg('Recording removed from the dashboard.', 'success');
        state.edit = null;
        return loadDetail();
      }).catch(function (e) { msg(e.message, 'error'); recRemove.disabled = false; });
    });
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
    var lines = [['Date', 'Time', 'Learner', 'Branch', 'Roll no', 'Phone', 'Email', 'Interview #', 'Booked at', 'On calendar', 'Attendance', 'Marks', 'Feedback / note', 'Recording shared'].join(',')];
    d.days.forEach(function (day) {
      day.slots.filter(function (s) { return s.booking_id; }).forEach(function (s) {
        lines.push([fmtKey(day.date, { day: 'numeric', month: 'short', year: 'numeric' }), fmtTime(s.starts_at), s.student_name, s.branch, s.roll_number, s.student_phone, s.student_email, s.interview_no,
          new Date(s.booked_at).toLocaleString('en-IN', { timeZone: TZ }), s.calendar_event_id ? 'yes' : 'no',
          s.attendance || '', s.marks != null ? Number(s.marks) : '', s.attendance === 'present' ? (s.feedback || '') : (s.note || ''), s.recording_shared_at ? 'yes' : 'no'].map(csvCell).join(','));
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
      var total = l.total_slots || p.slots_per_learner; // included + add-on
      var slots = (l.slots || []).map(function (s) { return esc(fmtDay(s.starts_at)) + ' ' + esc(fmtTime(s.starts_at)); }).join('<br>');
      var status = l.booked_count >= total ? '<span class="iv-badge iv-badge--ok">All ' + total + ' booked</span>'
        : l.booked_count ? '<span class="iv-badge">' + l.booked_count + ' of ' + total + ' booked</span>'
        : '<span class="iv-badge iv-badge--warn">Not booked</span>';
      var invite = l.invited_at ? 'Invited ' + esc(new Date(l.invited_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })) + (l.last_reminded_at ? '<br>Reminded ' + esc(new Date(l.last_reminded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })) : '') : '<span class="iv-meta">Not invited to this phase</span>';
      return '<tr><td><strong>' + esc(l.student_name) + '</strong><br><span class="iv-meta">' + esc(l.student_phone || '') + ' · ' + esc(l.student_email || '') + '</span></td>' +
        '<td>' + esc(l.roll_number || '') + '</td><td>' + status + (l.extra_slots ? ' <span class="iv-badge" style="background:#ede9fe;color:#5b21b6;">' + (l.has_base ? 'Add-on +' + l.extra_slots : 'Interviews only (' + l.extra_slots + ')') + '</span>' : '') + (l.branch ? '<br><span class="iv-meta">' + esc(l.branch) + '</span>' : '') + '</td><td>' + (slots || '') + '</td><td>' + invite + '</td>' +
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
