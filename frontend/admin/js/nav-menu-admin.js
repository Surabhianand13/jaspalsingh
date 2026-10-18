/* ============================================================
   nav-menu-admin.js  -  Admin > Navigation Menu
   Edit the header exam menu shown on every page: exam names and order,
   dropdown columns, and each link's name / landing page / NEW badge /
   visibility / order. Saved via PUT /api/site-settings/nav-menu and drawn
   on the site by frontend/js/main.js.

   First time (nothing saved yet) the editor starts from the menu that's
   live on the homepage today, parsed from its HTML - so saving without
   edits changes nothing visible.

   Exposes: window.NavMenuAdmin.load()
   ============================================================ */

(function () {
  'use strict';

  var API = location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  var state = { menu: null, savedJson: null, source: '', programs: [] };

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
  function toast(msg, type) {
    if (typeof window.showToast === 'function') return window.showToast(msg, type);
    var el = document.getElementById('navMenuMsg');
    if (el) { el.textContent = msg; el.style.color = type === 'error' ? '#B91C1C' : '#166534'; }
  }

  /* ── Read today's built-in menu from the homepage HTML ── */
  function parseLiveMenu() {
    return fetch('/?navsrc=' + Date.now()).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var drawerIcons = {};
      doc.querySelectorAll('.drawer-accordion-trigger').forEach(function (b) {
        var i = b.querySelector('i.fas');
        var label = b.textContent.trim();
        if (i) drawerIcons[label] = { icon: faName(i), color: (i.getAttribute('style') || '').match(/color:\s*(#[0-9a-f]{3,8})/i) };
      });
      var exams = [];
      doc.querySelectorAll('#mainNav > .nav-it').forEach(function (it) {
        var link = it.querySelector('a.nav-it-btn');
        if (link) {
          exams.push({ key: '', label: link.textContent.trim(), url: link.getAttribute('href'), visible: true, columns: [] });
          return;
        }
        var btn = it.querySelector('button.nav-it-btn');
        if (!btn) return;
        var key = btn.getAttribute('data-key') || '';
        var label = btn.textContent.trim();
        var di = drawerIcons[label] || {};
        var drop = it.querySelector('.exam-drop');
        var columns = [];
        if (drop) drop.querySelectorAll('.dd-column').forEach(function (col) {
          var head = col.querySelector('.dd-col-header');
          var colorMatch = head && head.className.match(/dd-col-header--(\w+)/);
          var items = [];
          col.querySelectorAll('a.dd-card').forEach(function (a) {
            var lab = a.querySelector('.dd-card-label');
            var isNew = !!(lab && lab.querySelector('.badge-new'));
            var text = lab ? Array.prototype.filter.call(lab.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join('').trim() : a.textContent.trim();
            var ic = a.querySelector('.dd-card-icon');
            var st = ic ? (ic.getAttribute('style') || '') : '';
            items.push({
              label: text, url: a.getAttribute('href'), isNew: isNew, visible: true,
              icon: faName(a.querySelector('.dd-card-icon i')) || 'fa-file-alt',
              iconBg: ((st.match(/--icon-bg:\s*(#[0-9a-f]{3,8})/i) || [])[1]) || '#EFF6FF',
              iconColor: ((st.match(/--icon-color:\s*(#[0-9a-f]{3,8})/i) || [])[1]) || '#0284C7',
            });
          });
          columns.push({
            title: ((col.querySelector('.dd-col-header-text') || {}).textContent || 'Programs').trim(),
            color: colorMatch ? colorMatch[1] : 'blue',
            icon: faName(col.querySelector('.dd-col-header-icon i')) || 'fa-clipboard-list',
            items: items,
          });
        });
        exams.push({ key: key, label: label, visible: true, icon: di.icon || 'fa-graduation-cap', iconColor: (di.color && di.color[1]) || '#C81240', columns: columns });
      });
      return { exams: exams };
    });
  }
  function faName(i) {
    if (!i) return '';
    var m = (i.getAttribute('class') || '').match(/\bfa-(?!s\b|solid\b|regular\b|brands\b)[a-z0-9-]+/);
    return m ? m[0] : '';
  }

  /* ── Load ── */
  function load() {
    var body = document.getElementById('navMenuBody');
    if (!body) return;
    body.innerHTML = '<p class="admin-empty">Loading menu…</p>';
    // Active programs for the "pick a program" dropdown on each link.
    fetch(API + '/api/programs').then(function (r) { return r.json(); }).then(function (d) {
      state.programs = (d.programs || []).slice().sort(function (a, b) { return (a.title || '').localeCompare(b.title || ''); });
      if (state.menu) draw();
    }).catch(function () { /* typing the link by hand still works */ });
    api('GET', '/api/site-settings/nav-menu').then(function (d) {
      if (d.menu) return { menu: d.menu, saved: true, source: 'Saved menu (last updated ' + new Date(d.updated_at).toLocaleString('en-IN') + ')' };
      return parseLiveMenu().then(function (m) { return { menu: m, source: 'Not saved yet - showing the menu that is live on the site today. Saving will switch every page to this editable menu.' }; });
    }).then(function (r) {
      state.menu = r.menu;
      state.source = r.source;
      // Nothing saved yet: keep Save enabled so the starting menu can be saved as-is.
      state.savedJson = r.saved ? JSON.stringify(r.menu) : null;
      draw();
    }).catch(function (err) {
      body.innerHTML = '<p class="admin-empty">Could not load the menu: ' + esc(err.message) + '</p>';
    });
  }

  /* ── Editor ── */
  var COLOR_LABEL = { blue: 'Blue', orange: 'Orange', magenta: 'Magenta' };

  function moveBtns(path, idx, len) {
    return '<button type="button" class="btn-admin-secondary btn-admin-sm" data-nm-move="' + path + '" data-dir="-1" ' + (idx === 0 ? 'disabled' : '') + ' title="Move up"><i class="fas fa-arrow-up"></i></button>' +
      '<button type="button" class="btn-admin-secondary btn-admin-sm" data-nm-move="' + path + '" data-dir="1" ' + (idx === len - 1 ? 'disabled' : '') + ' title="Move down"><i class="fas fa-arrow-down"></i></button>' +
      '<button type="button" class="btn-admin-danger btn-admin-sm" data-nm-del="' + path + '" title="Remove"><i class="fas fa-trash"></i></button>';
  }

  /* Picking a program fills the link's landing page (and its name if empty). */
  function programPicker(path) {
    if (!state.programs.length) return '';
    return '<select class="nm-input nm-small nm-pick" data-nm-pick="' + path + '" title="Pick a program to link to"><option value="">Pick program…</option>' +
      state.programs.map(function (p, i) { return '<option value="' + i + '">' + esc(p.short_name || p.title) + '</option>'; }).join('') +
    '</select>';
  }

  function draw() {
    var body = document.getElementById('navMenuBody');
    var exams = state.menu.exams;
    var dirty = JSON.stringify(state.menu) !== state.savedJson;

    body.innerHTML =
      '<p class="nm-source">' + esc(state.source) + '</p>' +
      exams.map(function (e, ei) {
        var hasCols = e.columns && e.columns.length;
        return '<div class="nm-exam' + (e.visible === false ? ' nm-hidden' : '') + '">' +
          '<div class="nm-exam-head">' +
            '<span class="nm-order">' + (ei + 1) + '</span>' +
            '<input class="nm-input nm-exam-label" data-nm-field="exams.' + ei + '.label" value="' + esc(e.label) + '" placeholder="Menu name e.g. RSSB JE" />' +
            (hasCols ? '' : '<input class="nm-input nm-url" data-nm-field="exams.' + ei + '.url" value="' + esc(e.url || '') + '" placeholder="Link e.g. /about" />') +
            '<label class="nm-check"><input type="checkbox" data-nm-bool="exams.' + ei + '.visible" ' + (e.visible !== false ? 'checked' : '') + '> Show</label>' +
            '<span class="nm-actions">' + moveBtns('exams.' + ei, ei, exams.length) + '</span>' +
          '</div>' +
          (e.columns || []).map(function (c, ci) {
            var cp = 'exams.' + ei + '.columns.' + ci;
            return '<div class="nm-col">' +
              '<div class="nm-col-head">' +
                '<i class="fas fa-table-columns"></i>' +
                '<input class="nm-input" data-nm-field="' + cp + '.title" value="' + esc(c.title) + '" placeholder="Column heading e.g. Test Series" />' +
                '<select class="nm-input nm-small" data-nm-field="' + cp + '.color">' + Object.keys(COLOR_LABEL).map(function (k) { return '<option value="' + k + '"' + (c.color === k ? ' selected' : '') + '>' + COLOR_LABEL[k] + '</option>'; }).join('') + '</select>' +
                '<span class="nm-actions">' + moveBtns(cp, ci, e.columns.length) + '</span>' +
              '</div>' +
              '<table class="nm-items"><thead><tr><th>#</th><th>Link name</th><th>Landing page (opens on click)</th><th>NEW</th><th>Show</th><th></th></tr></thead><tbody>' +
                c.items.map(function (it, ii) {
                  var ip = cp + '.items.' + ii;
                  return '<tr class="' + (it.visible === false ? 'nm-hidden' : '') + '">' +
                    '<td class="nm-order-cell">' + (ii + 1) + '</td>' +
                    '<td><input class="nm-input" data-nm-field="' + ip + '.label" value="' + esc(it.label) + '" placeholder="e.g. RSSB JE Diploma" /></td>' +
                    '<td>' + programPicker(ip) + '<input class="nm-input nm-url" data-nm-field="' + ip + '.url" value="' + esc(it.url) + '" placeholder="/programs/... or https://..." />' +
                      (it.url ? ' <a href="' + esc(it.url) + '" target="_blank" rel="noopener" class="nm-open" title="Open landing page"><i class="fas fa-arrow-up-right-from-square"></i></a>' : '') + '</td>' +
                    '<td><input type="checkbox" data-nm-bool="' + ip + '.isNew" ' + (it.isNew ? 'checked' : '') + '></td>' +
                    '<td><input type="checkbox" data-nm-bool="' + ip + '.visible" ' + (it.visible !== false ? 'checked' : '') + '></td>' +
                    '<td class="nm-actions">' + moveBtns(ip, ii, c.items.length) + '</td>' +
                  '</tr>';
                }).join('') +
              '</tbody></table>' +
              '<button type="button" class="btn-admin-secondary btn-admin-sm" data-nm-add-item="' + cp + '"><i class="fas fa-plus"></i> Add link</button>' +
            '</div>';
          }).join('') +
          ((e.columns || []).length < 3 ? '<button type="button" class="btn-admin-secondary btn-admin-sm nm-add-col" data-nm-add-col="exams.' + ei + '"><i class="fas fa-plus"></i> Add dropdown column</button>' : '') +
        '</div>';
      }).join('') +
      '<div class="nm-footer-actions">' +
        '<button type="button" class="btn-admin-secondary" data-nm-add-exam="dropdown"><i class="fas fa-plus"></i> Add exam menu (with dropdown)</button>' +
        '<button type="button" class="btn-admin-secondary" data-nm-add-exam="link"><i class="fas fa-plus"></i> Add plain link (like About)</button>' +
      '</div>';

    var saveBtn = document.getElementById('navMenuSaveBtn');
    if (saveBtn) saveBtn.disabled = !dirty;
    var dirtyEl = document.getElementById('navMenuDirty');
    if (dirtyEl) dirtyEl.style.display = dirty ? '' : 'none';
    wire(body);
  }

  function resolve(path) {
    var parts = path.split('.');
    var obj = state.menu;
    for (var i = 0; i < parts.length - 1; i++) obj = obj[isNaN(parts[i]) ? parts[i] : +parts[i]];
    return { parent: obj, key: isNaN(parts[parts.length - 1]) ? parts[parts.length - 1] : +parts[parts.length - 1] };
  }

  function wire(body) {
    body.querySelectorAll('[data-nm-pick]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var p = state.programs[+sel.value];
        if (!p) return;
        var r = resolve(sel.getAttribute('data-nm-pick'));
        var item = r.parent[r.key];
        item.url = p.detail_url || ('/programs/' + p.slug + '/');
        if (!item.label) item.label = p.short_name || p.title;
        draw();
      });
    });
    body.querySelectorAll('[data-nm-field]').forEach(function (el) {
      el.addEventListener('input', function () {
        var r = resolve(el.getAttribute('data-nm-field'));
        r.parent[r.key] = el.value;
        markDirty();
      });
      el.addEventListener('change', function () { draw(); });
    });
    body.querySelectorAll('[data-nm-bool]').forEach(function (el) {
      el.addEventListener('change', function () {
        var r = resolve(el.getAttribute('data-nm-bool'));
        r.parent[r.key] = el.checked;
        draw();
      });
    });
    body.querySelectorAll('[data-nm-move]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = resolve(b.getAttribute('data-nm-move'));
        var to = r.key + (+b.getAttribute('data-dir'));
        if (to < 0 || to >= r.parent.length) return;
        var tmp = r.parent[r.key]; r.parent[r.key] = r.parent[to]; r.parent[to] = tmp;
        draw();
      });
    });
    body.querySelectorAll('[data-nm-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = resolve(b.getAttribute('data-nm-del'));
        var what = r.parent[r.key] && (r.parent[r.key].label || r.parent[r.key].title) || 'this';
        if (!confirm('Remove "' + what + '" from the menu?')) return;
        r.parent.splice(r.key, 1);
        draw();
      });
    });
    body.querySelectorAll('[data-nm-add-item]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = resolve(b.getAttribute('data-nm-add-item'));
        r.parent[r.key].items.push({ label: '', url: '/programs/', isNew: true, visible: true, icon: 'fa-file-alt', iconBg: '#EFF6FF', iconColor: '#0284C7' });
        draw();
      });
    });
    body.querySelectorAll('[data-nm-add-col]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = resolve(b.getAttribute('data-nm-add-col'));
        var exam = r.parent[r.key];
        exam.columns = exam.columns || [];
        exam.columns.push({ title: 'Test Series', color: 'blue', icon: 'fa-clipboard-list', items: [{ label: '', url: '/programs/', isNew: false, visible: true, icon: 'fa-file-alt', iconBg: '#EFF6FF', iconColor: '#0284C7' }] });
        draw();
      });
    });
    body.querySelectorAll('[data-nm-add-exam]').forEach(function (b) {
      b.addEventListener('click', function () {
        var plain = b.getAttribute('data-nm-add-exam') === 'link';
        state.menu.exams.push(plain
          ? { key: '', label: 'New link', url: '/', visible: true, columns: [] }
          : { key: '', label: 'New exam', visible: true, icon: 'fa-graduation-cap', iconColor: '#C81240', columns: [{ title: 'Test Series', color: 'blue', icon: 'fa-clipboard-list', items: [{ label: '', url: '/programs/', isNew: true, visible: true, icon: 'fa-file-alt', iconBg: '#EFF6FF', iconColor: '#0284C7' }] }] });
        draw();
      });
    });
  }

  function markDirty() {
    var dirty = JSON.stringify(state.menu) !== state.savedJson;
    var saveBtn = document.getElementById('navMenuSaveBtn');
    if (saveBtn) saveBtn.disabled = !dirty;
    var dirtyEl = document.getElementById('navMenuDirty');
    if (dirtyEl) dirtyEl.style.display = dirty ? '' : 'none';
  }

  function save() {
    var btn = document.getElementById('navMenuSaveBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
    api('PUT', '/api/site-settings/nav-menu', { menu: state.menu }).then(function (d) {
      state.menu = d.menu;
      state.savedJson = JSON.stringify(d.menu);
      state.source = 'Saved menu (last updated ' + new Date(d.updated_at).toLocaleString('en-IN') + ')';
      try { localStorage.removeItem('jaspal_nav_menu'); } catch (e) { /* ignore */ }
      toast('Menu saved - live on every page within about a minute.', 'success');
      draw();
    }).catch(function (err) {
      toast(err.message, 'error');
      markDirty();
    }).then(function () {
      btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save menu';
    });
  }

  function resetToBuiltIn() {
    if (!confirm('Go back to the built-in menu on every page? Your saved menu will be deleted.')) return;
    api('DELETE', '/api/site-settings/nav-menu').then(function () {
      try { localStorage.removeItem('jaspal_nav_menu'); } catch (e) { /* ignore */ }
      toast('Reset - every page uses its built-in menu again.', 'success');
      load();
    }).catch(function (err) { toast(err.message, 'error'); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var s = document.getElementById('navMenuSaveBtn');
    if (s) s.addEventListener('click', save);
    var d = document.getElementById('navMenuDiscardBtn');
    if (d) d.addEventListener('click', function () { if (confirm('Discard unsaved changes?')) load(); });
    var r = document.getElementById('navMenuResetBtn');
    if (r) r.addEventListener('click', resetToBuiltIn);
  });

  window.NavMenuAdmin = { load: load };
})();
