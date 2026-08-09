/* ============================================================
   app.js  -  Offline CBT exam app logic
   Dr. Jaspal Singh - jaspalsingh.in

   Runs 100% locally - no network calls during login or the exam
   itself. ROSTER/EXAM come from data.js (plain <script src>, not
   fetch, since fetching a local JSON file is blocked when this page
   is opened via file:// - which is how staff will open it).

   Results queue lives in localStorage until a staff member triggers
   a sync while this machine has internet (hotspot). Sync posts to
   the real jaspalsingh.in backend at /api/cbt/sync.
   ============================================================ */

(function () {
  'use strict';

  var SYNC_API = 'https://jaspalsingh.onrender.com/api/cbt/sync';
  var QUEUE_KEY = 'cbt_pending_results_v1';
  var STAFF_PIN = '1947'; // change this before real use - shared with staff only, never shown to learners

  var state = {
    learner: null,
    answers: {},      // question id -> selected option index
    current: 0,
    timeLeft: EXAM.duration_minutes * 60,
    timerHandle: null,
    startedAt: null,
  };

  function $(id) { return document.getElementById(id); }
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $(id).classList.add('active');
  }

  /* ── Login ── */
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var mobile = $('mobileInput').value.trim();
    var match = ROSTER.filter(function (r) { return r.mobile === mobile; })[0];
    var err = $('loginError');
    if (!match) {
      err.textContent = 'Mobile number not found in today\'s roster. Please check with the desk.';
      err.style.display = 'block';
      return;
    }
    err.style.display = 'none';
    state.learner = match;
    $('confirmName').textContent = match.name;
    $('confirmDetail').textContent = 'Roll No: ' + match.roll_number + ' · ' + match.program;
    showScreen('confirmScreen');
  });

  $('confirmNo').addEventListener('click', function () {
    $('mobileInput').value = '';
    showScreen('loginScreen');
    $('mobileInput').focus();
  });

  $('confirmYes').addEventListener('click', function () {
    $('startTitle').textContent = EXAM.title;
    $('startMeta').textContent = EXAM.questions.length + ' questions · ' + EXAM.duration_minutes + ' minutes';
    showScreen('startScreen');
  });

  /* ── Start exam ── */
  $('startBtn').addEventListener('click', function () {
    state.answers = {};
    state.current = 0;
    state.timeLeft = EXAM.duration_minutes * 60;
    state.startedAt = new Date().toISOString();
    $('learnerNameTag').textContent = state.learner.name;
    $('learnerRollTag').textContent = state.learner.roll_number;
    renderPalette();
    renderQuestion();
    startTimer();
    showScreen('examScreen');
  });

  /* ── Timer ── */
  function startTimer() {
    clearInterval(state.timerHandle);
    updateTimerDisplay();
    state.timerHandle = setInterval(function () {
      state.timeLeft--;
      updateTimerDisplay();
      if (state.timeLeft <= 0) {
        clearInterval(state.timerHandle);
        submitExam(true);
      }
    }, 1000);
  }
  function updateTimerDisplay() {
    var m = Math.floor(state.timeLeft / 60), s = state.timeLeft % 60;
    var el = $('timerDisplay');
    el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    el.classList.toggle('warn', state.timeLeft <= 60);
  }

  /* ── Question rendering ── */
  function renderQuestion() {
    var q = EXAM.questions[state.current];
    $('qCount').textContent = 'Question ' + (state.current + 1) + ' of ' + EXAM.questions.length;
    $('qText').textContent = q.text;
    var lettters = ['A', 'B', 'C', 'D', 'E'];
    $('optionsWrap').innerHTML = q.options.map(function (opt, i) {
      var sel = state.answers[q.id] === i;
      return '<div class="option' + (sel ? ' selected' : '') + '" data-i="' + i + '">' +
        '<span class="letter">' + lettters[i] + '</span><span>' + escHtml(opt) + '</span></div>';
    }).join('');
    document.querySelectorAll('.option').forEach(function (el) {
      el.addEventListener('click', function () {
        state.answers[q.id] = parseInt(el.getAttribute('data-i'), 10);
        renderQuestion();
        renderPalette();
      });
    });
    $('prevBtn').style.visibility = state.current === 0 ? 'hidden' : 'visible';
    $('nextBtn').textContent = state.current === EXAM.questions.length - 1 ? 'Review & Submit' : 'Next';
  }

  function renderPalette() {
    $('paletteGrid').innerHTML = EXAM.questions.map(function (q, i) {
      var answered = state.answers[q.id] !== undefined;
      var isCurrent = i === state.current;
      return '<div class="palette-cell' + (answered ? ' answered' : '') + (isCurrent ? ' current' : '') +
        '" data-i="' + i + '">' + (i + 1) + '</div>';
    }).join('');
    document.querySelectorAll('.palette-cell').forEach(function (el) {
      el.addEventListener('click', function () {
        state.current = parseInt(el.getAttribute('data-i'), 10);
        renderQuestion();
        renderPalette();
      });
    });
    var answeredCount = Object.keys(state.answers).length;
    $('answeredCount').textContent = answeredCount + ' of ' + EXAM.questions.length + ' answered';
  }

  $('prevBtn').addEventListener('click', function () {
    if (state.current > 0) { state.current--; renderQuestion(); renderPalette(); }
  });
  $('nextBtn').addEventListener('click', function () {
    if (state.current < EXAM.questions.length - 1) {
      state.current++; renderQuestion(); renderPalette();
    } else {
      $('submitConfirm').classList.add('open');
    }
  });
  $('submitBtnHeader').addEventListener('click', function () { $('submitConfirm').classList.add('open'); });
  $('submitCancelBtn').addEventListener('click', function () { $('submitConfirm').classList.remove('open'); });
  $('submitYesBtn').addEventListener('click', function () { submitExam(false); });

  /* ── Submit + local scoring ── */
  function submitExam(autoSubmitted) {
    clearInterval(state.timerHandle);
    $('submitConfirm').classList.remove('open');

    var score = 0;
    EXAM.questions.forEach(function (q) {
      if (state.answers[q.id] === q.correct) score++;
    });

    var result = {
      id: state.learner.mobile + '_' + EXAM.test_id + '_' + Date.now(),
      mobile: state.learner.mobile,
      name: state.learner.name,
      roll_number: state.learner.roll_number,
      program: state.learner.program,
      test_id: EXAM.test_id,
      test_title: EXAM.title,
      answers: state.answers,
      score: score,
      total: EXAM.questions.length,
      auto_submitted: autoSubmitted,
      started_at: state.startedAt,
      submitted_at: new Date().toISOString(),
      synced: false,
    };
    saveToQueue(result);

    // Score is stored locally for later admin review only - never shown
    // to the learner here, per "results announced separately, not on
    // the spot".
    showScreen('submittedScreen');
  }

  $('nextLearnerBtn').addEventListener('click', function () {
    state.learner = null;
    $('mobileInput').value = '';
    showScreen('loginScreen');
  });

  /* ── Local results queue (localStorage) ── */
  function getQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveToQueue(result) {
    var q = getQueue();
    q.push(result);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  /* ── Staff sync panel ── */
  var logoClicks = 0, logoClickTimer = null;
  $('hiddenTrigger').addEventListener('click', function () {
    logoClicks++;
    clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(function () { logoClicks = 0; }, 1500);
    if (logoClicks >= 5) { logoClicks = 0; openStaffPanel(); }
  });

  function openStaffPanel() {
    var pin = prompt('Staff PIN:');
    if (pin !== STAFF_PIN) { if (pin !== null) alert('Incorrect PIN.'); return; }
    renderStaffPanel();
    $('staffPanel').classList.add('open');
  }
  $('staffCloseBtn').addEventListener('click', function () { $('staffPanel').classList.remove('open'); });

  function renderStaffPanel() {
    var q = getQueue();
    var pending = q.filter(function (r) { return !r.synced; });
    $('staffCount').textContent = pending.length + ' result(s) waiting to sync on this machine';
    $('staffList').innerHTML = q.length
      ? q.map(function (r) {
          return '<div class="pending-row"><span>' + escHtml(r.name) + ' (' + escHtml(r.roll_number) + ')</span>' +
            '<span class="tag ' + (r.synced ? 'synced">Synced' : 'pending">Pending') + '</span></div>';
        }).join('')
      : '<p style="font-size:13px;color:#9999b0;">No results recorded on this machine yet.</p>';
    checkOnline();
  }

  function checkOnline() {
    var statusEl = $('staffStatus');
    statusEl.textContent = 'Checking connection…';
    statusEl.className = 'staff-status';
    fetch('https://jaspalsingh.onrender.com/api/health', { mode: 'cors', cache: 'no-store' })
      .then(function (r) { return r.ok; })
      .then(function (ok) {
        statusEl.textContent = ok ? 'Online - ready to sync' : 'Reached server but it’s not responding normally.';
        statusEl.className = 'staff-status ' + (ok ? 'online' : 'offline');
        $('syncBtn').disabled = !ok;
      })
      .catch(function () {
        statusEl.textContent = 'Offline - connect this machine to the hotspot, then try again.';
        statusEl.className = 'staff-status offline';
        $('syncBtn').disabled = true;
      });
  }
  $('recheckBtn').addEventListener('click', checkOnline);

  $('syncBtn').addEventListener('click', function () {
    var q = getQueue();
    var pending = q.filter(function (r) { return !r.synced; });
    if (!pending.length) { alert('Nothing to sync on this machine.'); return; }
    $('syncBtn').disabled = true;
    $('syncBtn').textContent = 'Syncing…';
    fetch(SYNC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cbt-sync-key': SYNC_KEY },
      body: JSON.stringify({ results: pending }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Sync failed.');
        // mark everything we just sent as synced
        var sentIds = pending.map(function (r) { return r.id; });
        var updated = q.map(function (r) {
          return sentIds.indexOf(r.id) !== -1 ? Object.assign({}, r, { synced: true }) : r;
        });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
        renderStaffPanel();
        alert('Synced ' + pending.length + ' result(s) successfully.');
      })
      .catch(function (err) {
        alert('Sync failed: ' + err.message + '\nNothing was lost - try again once connected.');
      })
      .finally(function () {
        $('syncBtn').disabled = false;
        $('syncBtn').textContent = 'Sync Now';
      });
  });

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  showScreen('loginScreen');
})();
