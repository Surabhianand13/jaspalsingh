/* ============================================================
   blog.js — Blog Page API Integration
   Dr. Jaspal Singh Website — jaspalsingh.in

   Strategy:
     1. Fetch published posts from /api/blog on page load
     2. First post → replaces featured section
     3. Remaining posts → rendered in #blogGrid
     4. Category filter buttons → new API fetch with ?category=
     5. Falls back to static HTML + client-side filter if API fails
   ============================================================ */

(function () {
  'use strict';

  var api = window.JaspalAPI;

  /* ── DOM refs ─────────────────────────────────────────────── */
  var featured    = document.querySelector('.blog-featured');
  var grid        = document.getElementById('blogGrid');
  var noResults   = document.getElementById('blogNoResults');
  var filterBtns  = document.querySelectorAll('[data-cat]');

  if (!grid) return;

  /* ── Filter state ─────────────────────────────────────────── */
  var activeCategory  = 'all';
  var apiAvailable    = false;
  var staticCards     = [];
  var staticFeatured  = null; /* reference to original featured element */

  /* ── Static fallback setup ────────────────────────────────── */

  function initStaticFallback() {
    staticCards    = Array.from(grid.querySelectorAll('.blog-card'));
    staticFeatured = featured ? featured.cloneNode(true) : null;
  }

  /* ── API fetch ────────────────────────────────────────────── */

  function fetchPosts(category) {
    if (!api) { applyStaticFilter(category); return; }

    var params = { limit: 20, offset: 0 };
    if (category && category !== 'all') params.category = category;

    /* Show skeletons in grid */
    api.utils.showSkeleton(grid, 6, 'blog');

    api.blog.getAll(params).then(function (data) {
      apiAvailable = true;
      var posts = (data && (data.posts || data)) || [];
      renderPosts(posts);
    }).catch(function (err) {
      console.warn('[blog.js] API unavailable, using static content.', err.message);
      apiAvailable = false;
      restoreStaticContent();
      applyStaticFilter(activeCategory);
    });
  }

  /* ── Render API posts ─────────────────────────────────────── */

  function renderPosts(posts) {
    /* Clear grid */
    grid.innerHTML = '';

    if (!posts.length) {
      if (noResults) noResults.style.display = 'block';
      /* Hide featured if no posts in this category */
      if (featured) featured.style.display = 'none';
      return;
    }

    if (noResults) noResults.style.display = 'none';

    /* Determine featured: first post if category = all, otherwise don't replace featured */
    var gridPosts;
    if (activeCategory === 'all' && posts.length > 0) {
      renderFeaturedPost(posts[0]);
      if (featured) featured.style.display = '';
      gridPosts = posts.slice(1);
    } else {
      /* For filtered views, hide the static featured or show first result there */
      if (featured) featured.style.display = 'none';
      gridPosts = posts;
    }

    gridPosts.forEach(function (post) {
      var card = buildBlogCard(post);
      grid.appendChild(card);
    });

    if (!gridPosts.length && noResults) {
      noResults.style.display = 'none'; /* Featured shown, no grid items is fine */
    }
  }

  function renderFeaturedPost(post) {
    if (!featured) return;

    var catLabel = api.utils.catLabel(post.category || '');
    var catClass = api.utils.catClass(post.category || '');
    var title    = api.utils.esc(post.title   || '');
    var excerpt  = api.utils.esc(post.excerpt  || post.summary || '');
    var date     = api.utils.fullDate(post.published_at || post.created_at);
    var slug     = encodeURIComponent(post.slug || String(post.id));
    var imgHtml  = post.cover_image_url
      ? '<img src="' + api.utils.esc(post.cover_image_url) + '" alt="' + title + '" class="blog-featured-photo" />'
      : '<i class="fas fa-bullhorn"></i>';

    featured.href = '/blog-post?slug=' + slug;
    featured.dataset.cat = post.category || '';
    featured.innerHTML =
      '<div class="blog-featured-img" aria-hidden="true">' + imgHtml + '</div>' +
      '<div class="blog-featured-content">' +
        '<span class="blog-cat-badge ' + catClass + '">' + catLabel + '</span>' +
        '<h2 class="blog-featured-title">' + title + '</h2>' +
        '<div class="blog-featured-meta">' +
          (date ? '<span><i class="fas fa-calendar-alt"></i> ' + date + '</span>' : '') +
          (post.read_time ? '<span><i class="fas fa-clock"></i> ' + post.read_time + ' min read</span>' : '') +
        '</div>' +
        (excerpt ? '<p class="blog-featured-excerpt">' + excerpt + '</p>' : '') +
        '<span class="blog-read-more">Read Full Post <i class="fas fa-arrow-right"></i></span>' +
      '</div>';
  }

  function buildBlogCard(post) {
    var catLabel = api.utils.catLabel(post.category || '');
    var catClass = api.utils.catClass(post.category || '');
    var title    = api.utils.esc(post.title  || '');
    var excerpt  = api.utils.esc(post.excerpt || post.summary || '');
    var date     = api.utils.fullDate(post.published_at || post.created_at);
    var slug     = encodeURIComponent(post.slug || String(post.id));
    var imgHtml  = post.cover_image_url
      ? '<img src="' + api.utils.esc(post.cover_image_url) + '" alt="' + title + '" style="width:100%;height:100%;object-fit:cover;" />'
      : '<i class="fas fa-file-alt"></i>';

    var article = document.createElement('article');
    article.className    = 'blog-card';
    article.dataset.cat  = post.category || '';
    article.innerHTML =
      '<div class="blog-card-img" aria-hidden="true">' + imgHtml + '</div>' +
      '<div class="blog-card-body">' +
        '<span class="blog-cat-badge ' + catClass + '" style="font-size:10px;">' + catLabel + '</span>' +
        '<h3 class="blog-card-title">' + title + '</h3>' +
        '<div class="blog-card-meta">' +
          (date ? '<span><i class="fas fa-calendar-alt"></i> ' + date + '</span>' : '') +
          (post.read_time ? '<span><i class="fas fa-clock"></i> ' + post.read_time + ' min</span>' : '') +
        '</div>' +
        (excerpt ? '<p class="blog-card-excerpt">' + excerpt + '</p>' : '') +
        '<a href="/blog-post?slug=' + slug + '" class="blog-read-more" style="margin-top:auto;">Read More <i class="fas fa-arrow-right"></i></a>' +
      '</div>';

    return article;
  }

  /* ── Static fallback helpers ──────────────────────────────── */

  function restoreStaticContent() {
    grid.innerHTML = '';
    staticCards.forEach(function (c) { grid.appendChild(c); });
    /* Restore featured */
    if (featured && staticFeatured) {
      featured.innerHTML  = staticFeatured.innerHTML;
      featured.href       = staticFeatured.href;
      featured.dataset.cat = staticFeatured.dataset.cat;
      featured.style.display = '';
    }
  }

  function applyStaticFilter(category) {
    var active = category || 'all';
    var visible = 0;

    staticCards.forEach(function (card) {
      var show = active === 'all' || card.dataset.cat === active;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    /* Handle featured visibility for static */
    if (featured && staticFeatured) {
      var featCat = staticFeatured.dataset.cat || '';
      featured.style.display = (active === 'all' || featCat === active) ? '' : 'none';
    }

    if (noResults) noResults.style.display = visible === 0 ? 'block' : 'none';
  }

  /* ── Filter button events ─────────────────────────────────── */

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;

      if (apiAvailable && api) {
        fetchPosts(activeCategory);
      } else {
        if (!apiAvailable) applyStaticFilter(activeCategory);
      }
    });
  });

  /* ── Initialise ───────────────────────────────────────────── */
  initStaticFallback();

  if (api) {
    fetchPosts('all');
  }

})();
