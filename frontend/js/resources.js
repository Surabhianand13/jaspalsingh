/* ============================================================
   resources.js — Resources Page API Integration
   Dr. Jaspal Singh Website — jaspalsingh.in

   Strategy:
     1. Capture existing static cards as fallback
     2. Show skeleton → fetch from /api/resources
     3. Render API data dynamically (subject/type/exam/search filters)
     4. Download click → POST /api/resources/download/:id → open URL
     5. If API unreachable, fall back to static cards + client-side filter
   ============================================================ */

(function () {
  'use strict';

  var api = window.JaspalAPI;

  /* ── DOM refs ─────────────────────────────────────────────── */
  var grid        = document.getElementById('resourcesGrid');
  var countEl     = document.getElementById('resourcesCount');
  var searchInput = document.getElementById('searchInput');
  var typeButtons = document.querySelectorAll('[data-filter-type]');
  var subjectOpts = document.querySelectorAll('[data-subject]');
  var examOpts    = document.querySelectorAll('[data-exam]');
  var clearBtn    = document.getElementById('clearFilters');
  var noResults   = document.getElementById('noResults');

  if (!grid) return; /* Safety guard */

  /* ── Filter state ─────────────────────────────────────────── */
  var filters = {
    type:    'all',
    subject: 'all',
    exam:    'all',
    search:  '',
    limit:   60,
    offset:  0,
  };

  var debounceTimer = null;
  var apiAvailable  = false; /* Proven false until first success */
  var staticCards   = [];

  /* ── Static fallback setup ────────────────────────────────── */

  function initStaticFallback() {
    /* Detach noResults from grid temporarily so it isn't captured */
    if (noResults && noResults.parentNode === grid) {
      grid.removeChild(noResults);
    }
    staticCards = Array.from(grid.querySelectorAll('.resource-card'));
    /* Re-attach */
    if (noResults) grid.appendChild(noResults);
    /* Wire download buttons on static cards (best-effort) */
    staticCards.forEach(function (card) {
      var btn = card.querySelector('.btn-download');
      if (btn) bindDownloadButton(btn);
    });
  }

  /* ── API fetch ────────────────────────────────────────────── */

  function fetchResources() {
    if (!api) { applyStaticFilter(); return; }

    var params = { limit: filters.limit, offset: filters.offset };
    if (filters.subject !== 'all') params.subject = filters.subject;
    if (filters.type    !== 'all') params.type    = filters.type;
    if (filters.exam    !== 'all') params.exam    = filters.exam;
    if (filters.search  !== '')   params.search   = filters.search;

    /* Skeleton */
    if (noResults) noResults.style.display = 'none';
    api.utils.showSkeleton(grid, 6, 'resource');
    if (noResults) grid.appendChild(noResults);

    api.resources.getAll(params).then(function (data) {
      apiAvailable = true;
      var items = (data && (data.resources || data)) || [];
      var total = (data && data.total) || items.length;
      renderCards(items, total);
    }).catch(function (err) {
      console.warn('[resources.js] API unavailable, using static cards.', err.message);
      apiAvailable = false;
      restoreStaticCards();
      applyStaticFilter();
    });
  }

  /* ── Render API cards ─────────────────────────────────────── */

  function renderCards(items, total) {
    /* Clear grid, preserve noResults */
    if (noResults && noResults.parentNode === grid) grid.removeChild(noResults);
    grid.innerHTML = '';
    if (noResults) grid.appendChild(noResults);

    if (!items.length) {
      noResults.style.display = 'block';
      countEl.textContent = 'Showing 0 resources';
      return;
    }

    noResults.style.display = 'none';
    countEl.textContent = 'Showing ' + items.length +
      (total > items.length ? ' of ' + total : '') +
      ' resource' + (items.length !== 1 ? 's' : '');

    items.forEach(function (r) {
      var tagClass  = api.utils.subjectClass(r.subject || '');
      var date      = api.utils.monthYear(r.created_at);
      var size      = api.utils.fileSize(r.file_size);
      var dlCount   = api.utils.count(r.download_count || 0);
      var subject   = api.utils.esc(r.subject       || '');
      var type      = api.utils.esc(r.resource_type || r.type || '');
      var title     = api.utils.esc(r.title         || '');
      var desc      = api.utils.esc(r.description   || '');
      var id        = r.id;

      var card = document.createElement('article');
      card.className = 'resource-card';
      card.dataset.id = id;
      card.innerHTML =
        '<div class="resource-card-top">' +
          '<span class="subject-tag ' + tagClass + '">' + subject + '</span>' +
          '<span class="resource-type-badge">' + type + '</span>' +
        '</div>' +
        '<h3 class="resource-title">' + title + '</h3>' +
        '<p class="resource-desc">' + desc + '</p>' +
        '<div class="resource-meta">' +
          (date    ? '<span><i class="fas fa-calendar-alt"></i> ' + date    + '</span>' : '') +
          (size    ? '<span><i class="fas fa-file-pdf"></i> '     + size    + '</span>' : '') +
          '<span><i class="fas fa-download"></i> ' + dlCount + '</span>' +
        '</div>' +
        '<a href="#" class="btn btn-download" data-resource-id="' + id + '">' +
          '<i class="fas fa-download"></i> Download Free' +
        '</a>';

      /* Insert before noResults */
      grid.insertBefore(card, noResults);

      var dlBtn = card.querySelector('.btn-download');
      if (dlBtn) bindDownloadButton(dlBtn);
    });
  }

  /* ── Download handler ─────────────────────────────────────── */

  function bindDownloadButton(btn) {
    if (btn._dlBound) return;
    btn._dlBound = true;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var id = btn.dataset.resourceId;
      if (!id) return;

      var auth = window.LearnerAuth;
      if (auth && !auth.isLoggedIn()) {
        auth.showModal(function () { proceedDownload(id, btn); });
        return;
      }

      proceedDownload(id, btn);
    });
  }

  /* ── Simple toast (public page — no admin.js dependency) ─────── */

  function showToast(msg, type) {
    var t = document.createElement('div');
    t.style.cssText = [
      'position:fixed;bottom:24px;right:24px;z-index:9999',
      'padding:14px 20px;border-radius:10px;font-size:14px;font-weight:600',
      'max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.18)',
      'color:#fff;opacity:0;transition:opacity 0.25s ease',
      'background:' + (type === 'error' ? '#F0345A' : '#10b981'),
    ].join(';');
    t.textContent = msg;
    document.body.appendChild(t);
    /* Fade in */
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    /* Fade out + remove */
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 280);
    }, 4000);
  }

  function proceedDownload(id, btn) {
    if (!api) return;

    var origHTML    = btn.innerHTML;
    var origPointer = btn.style.pointerEvents;

    btn.innerHTML           = '<i class="fas fa-spinner fa-spin"></i> Opening…';
    btn.style.opacity       = '0.7';
    btn.style.pointerEvents = 'none';

    function resetBtn() {
      btn.innerHTML           = origHTML;
      btn.style.opacity       = '';
      btn.style.pointerEvents = origPointer;
    }

    api.resources.download(id).then(function (data) {
      var url = data && data.resource && data.resource.file_url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        showToast('Download link unavailable. Please try again.', 'error');
      }
      resetBtn();
    }).catch(function (err) {
      console.warn('[resources.js] Download error:', err.message);
      showToast('Could not open the file. Please try again in a moment.', 'error');
      resetBtn();
    });
  }

  /* ── Static fallback helpers ──────────────────────────────── */

  function restoreStaticCards() {
    if (noResults && noResults.parentNode === grid) grid.removeChild(noResults);
    grid.innerHTML = '';
    staticCards.forEach(function (card) { grid.appendChild(card); });
    if (noResults) grid.appendChild(noResults);
  }

  function applyStaticFilter() {
    if (!staticCards.length) return;
    var term    = filters.search.toLowerCase();
    var visible = 0;

    staticCards.forEach(function (card) {
      var subjectOk = filters.subject === 'all' || card.dataset.subject === filters.subject;
      var typeOk    = filters.type    === 'all' || card.dataset.type    === filters.type;
      var examOk    = filters.exam    === 'all' || card.dataset.exam    === filters.exam;
      var titleTxt  = (card.querySelector('.resource-title') || {}).textContent || '';
      var descTxt   = (card.querySelector('.resource-desc')  || {}).textContent || '';
      var searchOk  = !term || titleTxt.toLowerCase().indexOf(term) !== -1 ||
                               descTxt.toLowerCase().indexOf(term)  !== -1;
      var show = subjectOk && typeOk && examOk && searchOk;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    countEl.textContent = 'Showing ' + visible + ' resource' + (visible !== 1 ? 's' : '');
    if (noResults) noResults.style.display = visible === 0 ? 'block' : 'none';
  }

  /* ── On any filter change ─────────────────────────────────── */

  function onFilterChange() {
    filters.offset = 0;
    if (apiAvailable && api) {
      fetchResources();
    } else {
      applyStaticFilter();
    }
  }

  /* ── Bind filter controls ─────────────────────────────────── */

  typeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      typeButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      filters.type = btn.dataset.filterType;
      onFilterChange();
    });
  });

  subjectOpts.forEach(function (opt) {
    opt.addEventListener('change', function () {
      subjectOpts.forEach(function (o) { o.classList.remove('active'); });
      opt.classList.add('active');
      filters.subject = opt.dataset.subject;
      onFilterChange();
    });
  });

  examOpts.forEach(function (opt) {
    opt.addEventListener('change', function () {
      examOpts.forEach(function (o) { o.classList.remove('active'); });
      opt.classList.add('active');
      filters.exam = opt.dataset.exam;
      onFilterChange();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      filters.search = searchInput.value.trim();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onFilterChange, 350);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      filters.type = 'all'; filters.subject = 'all';
      filters.exam = 'all'; filters.search  = '';
      if (searchInput) searchInput.value = '';

      typeButtons.forEach(function (b) {
        b.classList.toggle('active', b.dataset.filterType === 'all');
      });
      subjectOpts.forEach(function (o) {
        o.classList.toggle('active', o.dataset.subject === 'all');
        var inp = o.querySelector('input'); if (inp) inp.checked = (o.dataset.subject === 'all');
      });
      examOpts.forEach(function (o) {
        o.classList.toggle('active', o.dataset.exam === 'all');
        var inp = o.querySelector('input'); if (inp) inp.checked = (o.dataset.exam === 'all');
      });
      onFilterChange();
    });
  }

  /* ── Live stats strip ─────────────────────────────────────── */

  function loadLiveStats() {
    var strip  = document.getElementById('resourcesStatsStrip');
    var elRes  = document.getElementById('liveResourceCount');
    var elDl   = document.getElementById('liveTotalDownloads');
    var elLrn  = document.getElementById('liveLearnerCount');
    if (!strip || !api) return;

    var API_BASE = (function () {
      var h = window.location.hostname;
      return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000' : '';
    })();

    fetch(API_BASE + '/api/analytics/public')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (elRes)  elRes.textContent  = api.utils.count(data.total_resources || 0);
        if (elDl)   elDl.textContent   = api.utils.count(data.total_downloads || 0);
        if (elLrn)  elLrn.textContent  = api.utils.count(data.total_learners  || 0);
        strip.style.opacity = '1';
      })
      .catch(function () { /* silently skip — strip stays hidden */ });
  }

  /* ── Initialise ───────────────────────────────────────────── */
  initStaticFallback();
  loadLiveStats();

  if (api) {
    fetchResources();
  }
  /* else: static cards remain with client-side filtering already wired */

})();
