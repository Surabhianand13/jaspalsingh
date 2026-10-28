/* ============================================================
   home-programs-admin.js  -  Admin > Homepage Programs
   Choose which program cards appear on the homepage and in what order:
     - "Offline Test Series" carousel: tabs (e.g. ESE 2027 / RSSB JE /
       More Programs), each with its own ordered list of programs
     - "Offline Batches" carousel: one ordered list
   Programs are picked from a dropdown of active (visible) programs, so
   nothing is typed by hand. Saved via PUT /api/site-settings/homepage-
   programs and applied by the homepage script in frontend/index.html.

   First time (nothing saved yet) the editor starts from what the
   homepage shows today, so saving without edits changes nothing.

   Exposes: window.HomeProgramsAdmin.load()
   ============================================================ */

(function () {
  'use strict';

  var API = location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  var state = { config: null, savedJson: null, programs: [], bySlug: {}, staticSlugs: {}, source: '' };

  function token() { return localStorage.getItem('jaspal_admin_token'); }
  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token() ? { Authorization: 'Bearer ' + token() } : {}),
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().then(function (d) {
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
    var el = document.getElementById('homeProgMsg');
    if (el) { el.textContent = text; el.style.color = type === 'error' ? '#B91C1C' : '#166534'; }
  }
  function slugFromCard(card) {
    if (card.getAttribute('data-slug')) return card.getAttribute('data-slug');
    var cta = card.querySelector('.op-card-cta');
    var href = cta ? cta.getAttribute('href') : '';
    var m = (href || '').match(/[?&]slug=([^&]+)/) || (href || '').match(/\/programs\/([^\/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  /* ── Today's homepage, reproduced exactly (same rules as its built-in mode) ── */
  var PINNED = ['rssb-je-2026-15nov-flt-degree-offline', 'rssb-je-2026-15nov-flt-diploma-offline', 'rssb-je-2026-15nov-flt-degree-omr', 'rssb-je-2026-15nov-flt-diploma-omr', 'rssb-je-2026-4oct-flt-degree-offline', 'rssb-je-2026-4oct-flt-diploma-offline', 'rssb-je-2026-4oct-flt-degree-omr', 'rssb-je-2026-4oct-flt-diploma-omr'];
  var HIDDEN = ['shaurya-offline-rssb-je-2026-degree', 'shaurya-offline-rssb-je-2026-diploma', 'shaurya-omr-rssb-je-2026-degree', 'shaurya-omr-rssb-je-2026-diploma'];
  function bucketFor(t) {
    t = (t || '').toLowerCase();
    if (t.indexOf('rssb') !== -1 || t.indexOf('rpsc') !== -1) return 'rssb';
    if (t.indexOf('ese') !== -1) return 'ese';
    return 'other';
  }
  function liveDefault(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var buckets = { ese: [], rssb: [], other: [] };
    var inTests = {};
    doc.querySelectorAll('#progsCarousel .op-card').forEach(function (card) {
      var slug = slugFromCard(card);
      if (!slug) return;
      state.staticSlugs[slug] = true;
      inTests[slug] = true;
      if (!state.bySlug[slug]) return;
      var exam = card.querySelector('.op-thumb-exam');
      buckets[bucketFor(exam ? exam.textContent : '')].push(slug);
    });
    state.programs.forEach(function (p) {
      if (inTests[p.slug] || HIDDEN.indexOf(p.slug) !== -1) return;
      buckets[bucketFor(p.exam)].push(p.slug);
    });
    buckets.rssb.sort(function (a, b) {
      var ia = PINNED.indexOf(a), ib = PINNED.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    var batchSlugs = [];
    doc.querySelectorAll('#batchesCarousel .op-card').forEach(function (card) {
      var slug = slugFromCard(card);
      if (!slug) return;
      state.staticSlugs[slug] = true;
      if (state.bySlug[slug] && batchSlugs.indexOf(slug) === -1) batchSlugs.push(slug);
    });
    var tabs = [
      { key: 'ese', label: 'ESE 2027', slugs: buckets.ese },
      { key: 'rssb', label: 'RSSB JE / RPSC AE', slugs: buckets.rssb },
      { key: 'other', label: 'More Programs', slugs: buckets.other },
    ].filter(function (t) { return t.slugs.length; });
    return { tests: { tabs: tabs }, batches: { slugs: batchSlugs } };
  }

  function load() {
    var body = document.getElementById('homeProgBody');
    if (!body) return;
    body.innerHTML = '<p class="admin-empty">Loading…</p>';
    Promise.all([
      api('GET', '/api/programs'),
      api('GET', '/api/site-settings/homepage-programs'),
      fetch('/?homesrc=' + Date.now()).then(function (r) { return r.text(); }),
    ]).then(function (r) {
      state.programs = (r[0].programs || []);
      state.bySlug = {};
      state.programs.forEach(function (p) { state.bySlug[p.slug] = p; });
      state.staticSlugs = {};
      var def = liveDefault(r[2]); // also fills staticSlugs
      if (r[1].config) {
        state.config = r[1].config;
        state.source = 'Saved layout (last updated ' + new Date(r[1].updated_at).toLocaleString('en-IN') + ')';
      } else {
        state.config = def;
        state.source = 'Not saved yet - showing what the homepage shows today. Saving switches the homepage to this layout.';
      }
      // Nothing saved yet: keep Save enabled so the starting layout can be saved as-is.
      state.savedJson = r[1].config ? JSON.stringify(state.config) : null;
      draw();
    }).catch(function (err) {
      body.innerHTML = '<p class="admin-empty">Could not load: ' + esc(err.message) + '</p>';
    });
  }

  /* ── Editor ── */
  var CAT_GROUPS = [['test-series', 'Test Series'], ['interview', 'Interview'], ['course', 'Courses & Batches']];
  var STATUS_LABEL = { enrolling: 'Enrolling', coming_soon: 'Coming soon', closed: 'Closed' };

  function pickerHtml(path, taken) {
    var groups = CAT_GROUPS.map(function (g) {
      var opts = state.programs.filter(function (p) { return (p.category || 'test-series') === g[0]; })
        .sort(function (a, b) { return (a.title || '').localeCompare(b.title || ''); })
        .map(function (p) {
          var dis = taken.indexOf(p.slug) !== -1;
          return '<option value="' + esc(p.slug) + '"' + (dis ? ' disabled' : '') + '>' + esc(p.title) + (dis ? '  (already added)' : '') + '</option>';
        }).join('');
      return opts ? '<optgroup label="' + g[1] + '">' + opts + '</optgroup>' : '';
    }).join('');
    return '<select class="hp-picker" data-hp-add="' + path + '"><option value="">+ Add a program…</option>' + groups + '</select>';
  }

  function listHtml(path, slugs) {
    var rows = slugs.map(function (slug, i) {
      var p = state.bySlug[slug];
      var meta = p
        ? '<span class="hp-chip hp-chip--' + esc(p.status || 'enrolling') + '">' + esc(STATUS_LABEL[p.status] || p.status || 'Enrolling') + '</span>' +
          '<span class="hp-chip">' + (state.staticSlugs[slug] ? 'Custom card' : 'Standard card') + '</span>'
        : '<span class="hp-chip hp-chip--closed">Hidden or deleted - will not show</span>';
      return '<li class="hp-row' + (p ? '' : ' hp-row--gone') + '">' +
        '<span class="hp-num">' + (i + 1) + '</span>' +
        '<span class="hp-title">' + esc(p ? p.title : slug) + '<small>' + esc(slug) + '</small></span>' +
        '<span class="hp-meta">' + meta + '</span>' +
        '<span class="hp-actions">' +
          '<button type="button" class="btn-admin-secondary btn-admin-sm" data-hp-move="' + path + '" data-i="' + i + '" data-dir="-1" ' + (i === 0 ? 'disabled' : '') + ' title="Move up"><i class="fas fa-arrow-up"></i></button>' +
          '<button type="button" class="btn-admin-secondary btn-admin-sm" data-hp-move="' + path + '" data-i="' + i + '" data-dir="1" ' + (i === slugs.length - 1 ? 'disabled' : '') + ' title="Move down"><i class="fas fa-arrow-down"></i></button>' +
          '<button type="button" class="btn-admin-danger btn-admin-sm" data-hp-del="' + path + '" data-i="' + i + '" title="Remove from homepage"><i class="fas fa-xmark"></i></button>' +
        '</span>' +
      '</li>';
    }).join('');
    return '<ol class="hp-list">' + (rows || '<li class="hp-empty">No programs yet - add one below.</li>') + '</ol>' + pickerHtml(path, slugs);
  }

  function draw() {
    var body = document.getElementById('homeProgBody');
    var tabs = state.config.tests.tabs;
    body.innerHTML =
      '<p class="nm-source">' + esc(state.source) + '</p>' +
      '<div class="hp-section">' +
        '<h3><i class="fas fa-clipboard-list"></i> Offline Test Series <small>(tabbed carousel near the top of the homepage)</small></h3>' +
        tabs.map(function (t, ti) {
          return '<div class="hp-tab">' +
            '<div class="hp-tab-head">' +
              '<span class="nm-order">' + (ti + 1) + '</span>' +
              '<input class="nm-input hp-tab-label" data-hp-label="' + ti + '" value="' + esc(t.label) + '" placeholder="Tab name e.g. ESE 2027" />' +
              '<span class="hp-count">' + t.slugs.length + ' program' + (t.slugs.length === 1 ? '' : 's') + '</span>' +
              '<span class="nm-actions">' +
                '<button type="button" class="btn-admin-secondary btn-admin-sm" data-hp-tabmove="' + ti + '" data-dir="-1" ' + (ti === 0 ? 'disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
                '<button type="button" class="btn-admin-secondary btn-admin-sm" data-hp-tabmove="' + ti + '" data-dir="1" ' + (ti === tabs.length - 1 ? 'disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
                '<button type="button" class="btn-admin-danger btn-admin-sm" data-hp-tabdel="' + ti + '" title="Remove tab"><i class="fas fa-trash"></i></button>' +
              '</span>' +
            '</div>' +
            listHtml('tab.' + ti, t.slugs) +
          '</div>';
        }).join('') +
        (tabs.length < 6 ? '<button type="button" class="btn-admin-secondary" id="hpAddTab"><i class="fas fa-plus"></i> Add tab</button>' : '') +
      '</div>' +
      '<div class="hp-section">' +
        '<h3><i class="fas fa-chalkboard-teacher"></i> Offline Batches <small>(second carousel on the homepage)</small></h3>' +
        listHtml('batches', state.config.batches.slugs) +
      '</div>';
    markDirty();
    wire(body);
  }

  function listFor(path) {
    if (path === 'batches') return state.config.batches.slugs;
    return state.config.tests.tabs[+path.split('.')[1]].slugs;
  }

  function wire(body) {
    body.querySelectorAll('[data-hp-add]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        var list = listFor(sel.getAttribute('data-hp-add'));
        if (list.indexOf(sel.value) === -1) list.push(sel.value);
        draw();
      });
    });
    body.querySelectorAll('[data-hp-move]').forEach(function (b) {
      b.addEventListener('click', function () {
        var list = listFor(b.getAttribute('data-hp-move'));
        var i = +b.getAttribute('data-i'), j = i + (+b.getAttribute('data-dir'));
        if (j < 0 || j >= list.length) return;
        var t = list[i]; list[i] = list[j]; list[j] = t;
        draw();
      });
    });
    body.querySelectorAll('[data-hp-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        listFor(b.getAttribute('data-hp-del')).splice(+b.getAttribute('data-i'), 1);
        draw();
      });
    });
    body.querySelectorAll('[data-hp-label]').forEach(function (inp) {
      inp.addEventListener('input', function () { state.config.tests.tabs[+inp.getAttribute('data-hp-label')].label = inp.value; markDirty(); });
    });
    body.querySelectorAll('[data-hp-tabmove]').forEach(function (b) {
      b.addEventListener('click', function () {
        var tabs = state.config.tests.tabs, i = +b.getAttribute('data-hp-tabmove'), j = i + (+b.getAttribute('data-dir'));
        if (j < 0 || j >= tabs.length) return;
        var t = tabs[i]; tabs[i] = tabs[j]; tabs[j] = t;
        draw();
      });
    });
    body.querySelectorAll('[data-hp-tabdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = state.config.tests.tabs[+b.getAttribute('data-hp-tabdel')];
        if (!confirm('Remove the "' + t.label + '" tab and its ' + t.slugs.length + ' program card(s) from the homepage?')) return;
        state.config.tests.tabs.splice(+b.getAttribute('data-hp-tabdel'), 1);
        draw();
      });
    });
    var addTab = document.getElementById('hpAddTab');
    if (addTab) addTab.addEventListener('click', function () {
      state.config.tests.tabs.push({ key: '', label: 'New tab', slugs: [] });
      draw();
    });
  }

  function markDirty() {
    var dirty = JSON.stringify(state.config) !== state.savedJson;
    var s = document.getElementById('homeProgSaveBtn');
    if (s) s.disabled = !dirty;
    var d = document.getElementById('homeProgDirty');
    if (d) d.style.display = dirty ? '' : 'none';
  }

  function save() {
    var btn = document.getElementById('homeProgSaveBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
    api('PUT', '/api/site-settings/homepage-programs', { config: state.config }).then(function (d) {
      state.config = d.config;
      state.savedJson = JSON.stringify(d.config);
      state.source = 'Saved layout (last updated ' + new Date(d.updated_at).toLocaleString('en-IN') + ')';
      try { localStorage.removeItem('jaspal_home_progs'); } catch (e) { /* ignore */ }
      msg('Saved - live on the homepage within about a minute.', 'success');
      draw();
    }).catch(function (err) { msg(err.message, 'error'); markDirty(); })
      .then(function () { btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save layout'; });
  }

  function reset() {
    if (!confirm('Go back to the built-in homepage layout? Your saved layout will be deleted.')) return;
    api('DELETE', '/api/site-settings/homepage-programs').then(function () {
      try { localStorage.removeItem('jaspal_home_progs'); } catch (e) { /* ignore */ }
      msg('Reset - the homepage uses its built-in layout again.', 'success');
      load();
    }).catch(function (err) { msg(err.message, 'error'); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var s = document.getElementById('homeProgSaveBtn');
    if (s) s.addEventListener('click', save);
    var d = document.getElementById('homeProgDiscardBtn');
    if (d) d.addEventListener('click', function () { if (confirm('Discard unsaved changes?')) load(); });
    var r = document.getElementById('homeProgResetBtn');
    if (r) r.addEventListener('click', reset);
  });

  window.HomeProgramsAdmin = { load: load };
})();
