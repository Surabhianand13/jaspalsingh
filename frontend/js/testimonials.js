/* ============================================================
   testimonials.js — Testimonials Page API Integration
   Dr. Jaspal Singh Website — jaspalsingh.in

   Strategy:
     1. Fetch visible testimonials from /api/testimonials on load
     2. Render testi-cards in #testiGrid
     3. exam_type filter buttons → new API fetch with ?exam_type=
     4. Falls back to static HTML + client-side filter if API fails
   ============================================================ */

(function () {
  'use strict';

  var api = window.JaspalAPI;

  /* ── DOM refs ─────────────────────────────────────────────── */
  var grid       = document.getElementById('testiGrid');
  var noResults  = document.getElementById('testiNoResults');
  var filterBtns = document.querySelectorAll('[data-tfilter]');

  if (!grid) return;

  /* ── State ────────────────────────────────────────────────── */
  var activeFilter = 'all';
  var apiAvailable = false;
  var staticCards  = [];

  /* ── Static fallback setup ────────────────────────────────── */

  function initStaticFallback() {
    staticCards = Array.from(grid.querySelectorAll('.testi-card'));
  }

  /* ── API fetch ────────────────────────────────────────────── */

  function fetchTestimonials(examType) {
    if (!api) { applyStaticFilter(examType); return; }

    var params = {};
    if (examType && examType !== 'all') params.exam_type = examType;

    /* Show skeletons */
    api.utils.showSkeleton(grid, 6, 'testi');

    api.testimonials.getAll(params).then(function (data) {
      apiAvailable = true;
      var items = (data && (data.testimonials || data)) || [];
      renderCards(items);
    }).catch(function (err) {
      console.warn('[testimonials.js] API unavailable, using static content.', err.message);
      apiAvailable = false;
      restoreStaticCards();
      applyStaticFilter(activeFilter);
    });
  }

  /* ── Render API cards ─────────────────────────────────────── */

  function renderCards(items) {
    grid.innerHTML = '';

    if (!items.length) {
      if (noResults) noResults.style.display = 'block';
      return;
    }

    if (noResults) noResults.style.display = 'none';

    items.forEach(function (t) {
      var name      = api.utils.esc(t.student_name || t.name || '');
      var quote     = api.utils.esc(t.quote        || '');
      var examType  = api.utils.esc(t.exam_type    || '');
      var examYear  = t.exam_year  ? ' ' + t.exam_year  : '';
      var rank      = api.utils.esc(t.rank_or_score || t.rank || '');
      var initials  = api.utils.initials(t.student_name || t.name || '?');
      var isFeatured = t.is_featured || t.featured;
      var photoUrl  = t.photo_url || '';

      var avatarHtml = photoUrl
        ? '<img src="' + api.utils.esc(photoUrl) + '" alt="' + name + '" class="testi-avatar-img" />'
        : initials;

      var examTag = examType ? examType + examYear : '';
      var detail  = examType + (examYear ? examYear : '') +
                    (rank ? ' · <span class="testi-rank">' + rank + '</span>' : '');

      var card = document.createElement('blockquote');
      card.className  = 'testi-card' + (isFeatured ? ' highlighted' : '');
      card.dataset.tfilter = examType || 'General';
      card.innerHTML =
        (examTag ? '<span class="testi-exam-tag">' + examTag + '</span>' : '') +
        '<p class="testi-quote">"' + quote + '"</p>' +
        '<footer class="testi-author">' +
          '<div class="testi-avatar">' + avatarHtml + '</div>' +
          '<div>' +
            '<span class="testi-name">' + name + '</span>' +
            '<span class="testi-detail">' + detail + '</span>' +
          '</div>' +
        '</footer>';

      grid.appendChild(card);
    });
  }

  /* ── Static fallback helpers ──────────────────────────────── */

  function restoreStaticCards() {
    grid.innerHTML = '';
    staticCards.forEach(function (c) { grid.appendChild(c); });
  }

  function applyStaticFilter(examType) {
    var active  = examType || 'all';
    var visible = 0;

    staticCards.forEach(function (card) {
      var show = active === 'all' || card.dataset.tfilter === active;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    if (noResults) noResults.style.display = visible === 0 ? 'block' : 'none';
  }

  /* ── Filter button events ─────────────────────────────────── */

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeFilter = btn.dataset.tfilter;

      if (apiAvailable && api) {
        fetchTestimonials(activeFilter);
      } else {
        applyStaticFilter(activeFilter);
      }
    });
  });

  /* ── Initialise ───────────────────────────────────────────── */
  initStaticFallback();

  if (api) {
    fetchTestimonials('all');
  }

})();
