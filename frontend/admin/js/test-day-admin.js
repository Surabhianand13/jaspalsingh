/* ============================================================
   test-day-admin.js  -  Admin > Test Day
   One screen for the ops manager across every program:
     - all tests on a date / date range (default: this Sunday),
       optionally one exam (programs.exam tag)
     - question paper / blank OMR / solution: uploaded or missing, and
       the uploaded file's name
     - learner answer-sheet count per test
     - one zip of every learner answer sheet for the filtered tests,
       one folder per test
   Backend: GET /api/programs/admin/test-day(/omr-zip)

   Exposes: window.TestDayAdmin.load()
   ============================================================ */

(function () {
  'use strict';

  var API = location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  var TZ = 'Asia/Kolkata';
  var state = { from: null, to: null, exam: '', onlyMissing: false, data: null, loading: false };

  function token() { return localStorage.getItem('jaspal_admin_token'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function msg(text, type) {
    if (typeof window.showToast === 'function') return window.showToast(text, type);
    alert(text);
  }
  function $(id) { return document.getElementById(id); }

  /* ── Dates (IST) ── */
  function istToday() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
  function addDays(key, n) { var d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekday(key) { return new Date(key + 'T00:00:00Z').getUTCDay(); }
  function thisSunday() { var t = istToday(); return addDays(t, (7 - weekday(t)) % 7); }
  function weekRange() { var t = istToday(); var mon = addDays(t, -((weekday(t) + 6) % 7)); return [mon, addDays(mon, 6)]; }
  function fmtDay(key) {
    return new Date(key + 'T12:00:00+05:30').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
  }
  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
  }

  /* ── Load ── */
  function load() {
    if (!state.from) { state.from = state.to = thisSunday(); }
    renderShell();
    fetchData();
  }

  function query() {
    return 'from=' + state.from + '&to=' + state.to + (state.exam ? '&exam=' + encodeURIComponent(state.exam) : '');
  }

  function fetchData() {
    var body = $('tdBody');
    if (!body) return;
    state.loading = true;
    body.innerHTML = '<p class="admin-empty">Loading… (the server may take up to a minute to wake up)</p>';
    fetch(API + '/api/programs/admin/test-day?' + query(), { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) {
        if (r.status === 401) { location.href = '/admin/login'; throw new Error('Session expired'); }
        return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Request failed'); return d; });
      })
      .then(function (d) { state.data = d; state.loading = false; renderExams(); renderBody(); })
      .catch(function (e) { state.loading = false; body.innerHTML = '<p class="admin-empty" style="color:#B91C1C;">' + esc(e.message) + '</p>'; });
  }

  /* ── Shell: filters ── */
  function renderShell() {
    var root = $('testDayRoot');
    if (!root) return;
    root.innerHTML =
      '<div class="td-filters">' +
        '<div class="td-quick">' +
          '<button class="btn-admin-secondary td-sm" data-quick="sunday">This Sunday</button>' +
          '<button class="btn-admin-secondary td-sm" data-quick="today">Today</button>' +
          '<button class="btn-admin-secondary td-sm" data-quick="week">This week</button>' +
          '<button class="btn-admin-secondary td-sm" data-quick="next">Next Sunday</button>' +
        '</div>' +
        '<label>From<input type="date" id="tdFrom" value="' + state.from + '"></label>' +
        '<label>To<input type="date" id="tdTo" value="' + state.to + '"></label>' +
        '<label>Exam<select id="tdExam"><option value="">All exams</option></select></label>' +
        '<label class="td-check"><input type="checkbox" id="tdMissing"' + (state.onlyMissing ? ' checked' : '') + '> Only tests with something missing</label>' +
      '</div>' +
      '<div id="tdBody"></div>';

    root.querySelectorAll('[data-quick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = b.getAttribute('data-quick'), r;
        if (q === 'sunday') r = [thisSunday(), thisSunday()];
        else if (q === 'today') r = [istToday(), istToday()];
        else if (q === 'next') r = [addDays(thisSunday(), 7), addDays(thisSunday(), 7)];
        else r = weekRange();
        state.from = r[0]; state.to = r[1];
        $('tdFrom').value = state.from; $('tdTo').value = state.to;
        fetchData();
      });
    });
    $('tdFrom').addEventListener('change', function () {
      state.from = this.value;
      if (!state.to || state.to < state.from) { state.to = state.from; $('tdTo').value = state.to; }
      fetchData();
    });
    $('tdTo').addEventListener('change', function () {
      state.to = this.value;
      if (state.to < state.from) { state.from = state.to; $('tdFrom').value = state.from; }
      fetchData();
    });
    $('tdExam').addEventListener('change', function () { state.exam = this.value; fetchData(); });
    $('tdMissing').addEventListener('change', function () { state.onlyMissing = this.checked; renderBody(); });
  }

  function renderExams() {
    var sel = $('tdExam');
    if (!sel || !state.data) return;
    sel.innerHTML = '<option value="">All exams</option>' + state.data.exams.map(function (x) {
      return '<option value="' + esc(x) + '"' + (x === state.exam ? ' selected' : '') + '>' + esc(x) + '</option>';
    }).join('');
  }

  /* ── Body ── */
  function missingFor(t) {
    var m = [];
    if (!t.paper_file) m.push('Question paper');
    if (t.requires_omr_upload && !t.blank_omr_file) m.push('Blank OMR');
    if (!t.solution_file) m.push('Solution');
    return m;
  }

  function assetCell(file, needed) {
    if (file) return '<span class="td-ok"><i class="fas fa-check"></i> ' + esc(file) + '</span>';
    if (!needed) return '<span class="td-na">Not needed</span>';
    return '<span class="td-miss"><i class="fas fa-xmark"></i> Missing</span>';
  }

  function renderBody() {
    var body = $('tdBody');
    var d = state.data;
    if (!body || !d) return;
    var all = d.tests;
    var tests = state.onlyMissing ? all.filter(function (t) { return missingFor(t).length; }) : all;
    var rangeText = state.from === state.to ? fmtDay(state.from) : fmtDay(state.from) + ' to ' + fmtDay(state.to);

    if (!all.length) {
      body.innerHTML = '<div class="td-empty"><i class="fas fa-calendar-xmark"></i><p>No tests found on <strong>' + esc(rangeText) + '</strong>' + (state.exam ? ' for ' + esc(state.exam) : '') + '.</p>' +
        '<p class="td-meta">Tests are matched by their release time, or by the Date column of the schedule if no release time is set. A test whose date cannot be read (e.g. "TBA") is not shown.</p></div>';
      return;
    }

    var papers = all.filter(function (t) { return t.paper_file; }).length;
    var omrNeeded = all.filter(function (t) { return t.requires_omr_upload; });
    var omrs = omrNeeded.filter(function (t) { return t.blank_omr_file; }).length;
    var sols = all.filter(function (t) { return t.solution_file; }).length;
    var sheets = all.reduce(function (n, t) { return n + t.omr_files; }, 0);
    var stat = function (n, total, label) {
      var tone = total === undefined ? '' : n === total ? ' td-stat--ok' : ' td-stat--warn';
      return '<div class="td-stat' + tone + '"><b>' + n + (total !== undefined ? '<small>/' + total + '</small>' : '') + '</b><span>' + label + '</span></div>';
    };

    var html =
      '<div class="td-summary">' +
        '<div class="td-range"><strong>' + esc(rangeText) + '</strong>' + (state.exam ? ' · ' + esc(state.exam) : ' · all exams') + '</div>' +
        '<div class="td-stats">' +
          stat(all.length, undefined, 'tests') +
          stat(papers, all.length, 'question papers') +
          stat(omrs, omrNeeded.length, 'blank OMRs') +
          stat(sols, all.length, 'solutions') +
          stat(sheets, undefined, 'learner answer sheets') +
        '</div>' +
        '<div class="td-actions">' +
          '<button class="btn" id="tdZip"' + (sheets ? '' : ' disabled title="No learner answer sheets uploaded for these tests yet"') + '><i class="fas fa-file-zipper"></i> Download all learner OMR sheets (' + sheets + ')</button>' +
          '<button class="btn-admin-secondary" id="tdCsv"><i class="fas fa-file-csv"></i> Upload status CSV</button>' +
        '</div>' +
      '</div>';

    // Group: day -> exam
    var groups = [];
    tests.forEach(function (t) {
      var g = groups[groups.length - 1];
      var label = t.day + '|' + (t.exam || '');
      if (!g || g.label !== label) groups.push(g = { label: label, day: t.day, exam: t.exam, tests: [] });
      g.tests.push(t);
    });

    html += groups.map(function (g) {
      return '<div class="td-group">' +
        '<h3>' + esc(fmtDay(g.day)) + ' <span class="td-exam">' + esc(g.exam || 'No exam tag') + '</span> <small>' + g.tests.length + ' test' + (g.tests.length === 1 ? '' : 's') + '</small></h3>' +
        '<div class="td-table-wrap"><table class="td-table"><thead><tr>' +
          '<th>Program</th><th>Test</th><th>Question paper</th><th>Blank OMR</th><th>Solution</th><th>Paper releases</th><th>Learner sheets</th>' +
        '</tr></thead><tbody>' +
        g.tests.map(function (t) {
          var miss = missingFor(t);
          return '<tr class="' + (miss.length ? 'td-row-miss' : '') + '">' +
            '<td><strong>' + esc(t.program_short_name || t.program_title) + '</strong>' + (t.category ? ' <span class="td-track">' + esc(t.category) + '</span>' : '') +
              (t.is_visible === false ? ' <span class="td-track">hidden</span>' : '') + '<div class="td-meta">' + esc(t.program_slug) + '</div></td>' +
            '<td><strong>Test ' + t.test_number + '</strong><div class="td-meta">' + esc(t.syllabus || '') + (t.test_date ? ' · ' + esc(t.test_date) : '') + '</div></td>' +
            '<td>' + assetCell(t.paper_file, true) + '</td>' +
            '<td>' + assetCell(t.blank_omr_file, t.requires_omr_upload) + '</td>' +
            '<td>' + assetCell(t.solution_file, true) + '</td>' +
            '<td>' + (t.paper_release_at ? esc(fmtTime(t.paper_release_at)) : '<span class="td-na">Not set</span>') + '</td>' +
            '<td>' + (t.requires_omr_upload ? '<strong>' + t.omr_files + '</strong>' + (t.omr_uploads > t.omr_files ? '<div class="td-meta">' + (t.omr_uploads - t.omr_files) + ' erased</div>' : '') : '<span class="td-na">Centre test</span>') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div></div>';
    }).join('') || '<p class="admin-empty">Nothing missing - every test in this range has its files uploaded.</p>';

    body.innerHTML = html;
    var zip = $('tdZip');
    if (zip) zip.addEventListener('click', downloadZip);
    $('tdCsv').addEventListener('click', downloadCsv);
  }

  /* ── Downloads ── */
  function downloadZip() {
    var btn = $('tdZip');
    var label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing zip… (large downloads take a few minutes)';
    fetch(API + '/api/programs/admin/test-day/omr-zip?' + query(), { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || 'Download failed (' + r.status + ')'); });
        var cd = r.headers.get('Content-Disposition') || '';
        var m = cd.match(/filename="([^"]+)"/);
        return r.blob().then(function (b) { return { blob: b, name: m ? m[1] : 'omr-sheets.zip' }; });
      })
      .then(function (x) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(x.blob);
        a.download = x.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        msg('Zip downloaded.', 'success');
      })
      .catch(function (e) { msg(e.message, 'error'); })
      .then(function () { btn.disabled = false; btn.innerHTML = label; });
  }

  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function downloadCsv() {
    var rows = [['Date', 'Exam', 'Program', 'Track', 'Test', 'Syllabus', 'Question paper', 'Blank OMR', 'Solution', 'Paper releases', 'Learner sheets']];
    state.data.tests.forEach(function (t) {
      rows.push([t.day, t.exam || '', t.program_short_name || t.program_title, t.category || '', t.test_number, t.syllabus || '',
        t.paper_file || 'MISSING', t.requires_omr_upload ? (t.blank_omr_file || 'MISSING') : 'not needed', t.solution_file || 'MISSING',
        t.paper_release_at ? fmtTime(t.paper_release_at) : 'not set', t.requires_omr_upload ? t.omr_files : 'centre test']);
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n')], { type: 'text/csv' }));
    a.download = 'test-day-' + state.from + (state.to !== state.from ? '_to_' + state.to : '') + '.csv';
    a.click();
  }

  window.TestDayAdmin = { load: load };
})();
