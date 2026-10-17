/* ============================================================
   MAIN.JS  -  Global JavaScript
   Dr. Jaspal Singh Personal Website  -  jaspalsingh.in
   Handles: sticky header, mobile drawer menu
   ============================================================ */

(function () {
  'use strict';

  /* --- Sticky Header --- */
  const header = document.getElementById('siteHeader');

  if (header) {
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 24);
    }, { passive: true });
  }

  /* --- Mobile Hamburger Drawer --- */
  const hamburger    = document.getElementById('hamburger');
  const drawer       = document.getElementById('mobileDrawer');
  const overlay      = document.getElementById('drawerOverlay');
  const drawerClose  = document.getElementById('drawerClose');

  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('active');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('active');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (hamburger && drawer && overlay) {
    hamburger.addEventListener('click', openDrawer);
    drawerClose.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    /* Close when a nav link inside the drawer is clicked */
    drawer.querySelectorAll('.drawer-link').forEach(function (link) {
      link.addEventListener('click', closeDrawer);
    });

    /* Close on Escape key */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  /* --- Mark active nav link based on current page --- */
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';

  document.querySelectorAll('.nav-it-btn[href], .drawer-link').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '/' && (href === '/' || href === '/index.html'))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  /* --- Admin-managed exam menu ---
     Admin -> Navigation Menu saves the whole header menu (exam names,
     dropdown columns, links, NEW badges, order). It's drawn here into the
     desktop mega-menu and the mobile drawer on every page. Last copy is
     cached for an instant first paint (the API can cold-start); if no menu
     was ever saved, or the API is unreachable, the page's built-in HTML
     menu stays as is. See backend/routes/site-settings.js. */
  var NAV_CACHE_KEY = 'jaspal_nav_menu';
  var NAV_API = (function () {
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  })();

  function navEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var NEW_DRAWER_BADGE = ' <span style="font-size:8px;font-weight:800;color:#C81240;background:rgba(200,18,64,.1);border-radius:6px;padding:1px 5px;">NEW</span>';

  function renderNavMenu(menu) {
    var mainNavEl = document.getElementById('mainNav');
    var drawerNav = document.querySelector('#mobileDrawer .drawer-nav');
    if (!menu || !Array.isArray(menu.exams) || (!mainNavEl && !drawerNav)) return false;

    var exams = menu.exams.filter(function (e) { return e.visible !== false; });
    var dropExams = exams.filter(function (e) { return e.columns && e.columns.length; });
    var lastDropKeys = dropExams.slice(-2).map(function (e) { return e.key; });

    var desktop = '', drawer = '<a href="/" class="drawer-link">Home</a>';
    exams.forEach(function (e) {
      var cols = (e.columns || []).map(function (c) {
        return { title: c.title, color: c.color, icon: c.icon, items: (c.items || []).filter(function (it) { return it.visible !== false; }) };
      }).filter(function (c) { return c.items.length; });

      if (!cols.length) {
        if (!e.url) return;
        desktop += '<div class="nav-it"><a href="' + navEsc(e.url) + '" class="nav-it-btn">' + navEsc(e.label) + '</a></div>';
        drawer += '<a href="' + navEsc(e.url) + '" class="drawer-link">' + navEsc(e.label) + '</a>';
        return;
      }

      var dropCls = 'exam-drop' + (cols.length === 2 ? ' grid2' : cols.length >= 3 ? ' grid3' : '') + (lastDropKeys.indexOf(e.key) !== -1 ? ' exam-drop--end' : '');
      desktop += '<div class="nav-it">' +
        '<button class="nav-it-btn" data-key="' + navEsc(e.key) + '" aria-haspopup="true" aria-expanded="false">' + navEsc(e.label) + ' <i class="fas fa-chevron-down dd-caret"></i></button>' +
        '<div class="' + dropCls + '" id="drop-' + navEsc(e.key) + '">' +
          cols.map(function (c) {
            return '<div class="dd-column">' +
              '<div class="dd-col-header dd-col-header--' + navEsc(c.color || 'blue') + '"><span class="dd-col-header-icon"><i class="fas ' + navEsc(c.icon) + '"></i></span><span class="dd-col-header-text">' + navEsc(c.title) + '</span></div>' +
              '<div class="dd-cards">' + c.items.map(function (it) {
                return '<a href="' + navEsc(it.url) + '" class="dd-card"><span class="dd-card-icon" style="--icon-bg:' + navEsc(it.iconBg) + ';--icon-color:' + navEsc(it.iconColor) + '"><i class="fas ' + navEsc(it.icon) + '"></i></span>' +
                  '<span class="dd-card-label">' + navEsc(it.label) + (it.isNew ? ' <span class="badge-new">NEW</span>' : '') + '</span></a>';
              }).join('') + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';

      drawer += '<div class="drawer-accordion">' +
        '<button class="drawer-accordion-trigger" aria-expanded="false">' +
          '<i class="fas ' + navEsc(e.icon) + '" style="color:' + navEsc(e.iconColor) + ';width:16px;text-align:center;margin-right:4px;"></i> ' + navEsc(e.label) + ' <i class="fas fa-chevron-down drawer-acc-caret"></i>' +
        '</button>' +
        '<div class="drawer-accordion-body">' + cols.map(function (c) {
          return '<div class="drawer-acc-section"><span class="drawer-acc-title">' + navEsc(c.title) + '</span>' +
            c.items.map(function (it) {
              return '<a href="' + navEsc(it.url) + '" class="drawer-acc-link">' + navEsc(it.label) + (it.isNew ? NEW_DRAWER_BADGE : '') + '</a>';
            }).join('') + '</div>';
        }).join('') + '</div>' +
      '</div>';
    });

    if (mainNavEl) mainNavEl.innerHTML = desktop;
    if (drawerNav) drawerNav.innerHTML = drawer;
    return true;
  }

  /* Paint from cache now; refresh from the API and repaint only if changed. */
  (function loadNavMenu() {
    var cachedRaw = null;
    try { cachedRaw = localStorage.getItem(NAV_CACHE_KEY); } catch (e) { /* storage blocked */ }
    if (cachedRaw) {
      try { renderNavMenu(JSON.parse(cachedRaw)); } catch (e) { /* bad cache - ignore */ }
    }
    fetch(NAV_API + '/api/site-settings/nav-menu').then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      if (!data) return;
      if (!data.menu) {
        // Admin reset to the built-in menu: drop the cache (takes effect next load).
        try { localStorage.removeItem(NAV_CACHE_KEY); } catch (e) { /* ignore */ }
        return;
      }
      var fresh = JSON.stringify(data.menu);
      try { localStorage.setItem(NAV_CACHE_KEY, fresh); } catch (e) { /* ignore */ }
      if (fresh !== cachedRaw && renderNavMenu(data.menu)) wireNavMenus();
    }).catch(function () { /* offline / cold start - keep current menu */ });
  })();

  /* --- Desktop Exam Mega-Menu (hover + click) + mobile drawer accordion ---
     Re-runnable: called again after renderNavMenu() replaces the markup. */
  var openKey = null;
  var closeTimer = null;
  function navRoot() { return document.getElementById('mainNav'); }

  function openExamDrop(key) {
    var nav = navRoot();
    if (!nav) return;
    if (openKey && openKey !== key) closeExamDrop(true);
    openKey = key;
    var btn = nav.querySelector('.nav-it-btn[data-key="' + key + '"]');
    var drop = document.getElementById('drop-' + key);
    if (btn) { btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    if (drop) drop.classList.add('vis');
  }

  function closeExamDrop() {
    var nav = navRoot();
    if (!openKey || !nav) return;
    var btn = nav.querySelector('.nav-it-btn[data-key="' + openKey + '"]');
    var drop = document.getElementById('drop-' + openKey);
    if (btn) { btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    if (drop) drop.classList.remove('vis');
    openKey = null;
  }

  function wireNavMenus() {
    openKey = null;
    var nav = navRoot();
    if (nav) {
      nav.querySelectorAll('.nav-it-btn[data-key]').forEach(function (btn) {
        var key = btn.dataset.key;
        var drop = document.getElementById('drop-' + key);
        var navIt = btn.closest('.nav-it');

        btn.addEventListener('mouseenter', function () {
          clearTimeout(closeTimer);
          openExamDrop(key);
        });
        btn.addEventListener('click', function () {
          openKey === key ? closeExamDrop() : openExamDrop(key);
        });
        if (navIt) {
          navIt.addEventListener('mouseleave', function () {
            closeTimer = setTimeout(closeExamDrop, 200);
          });
        }
        if (drop) {
          drop.addEventListener('mouseenter', function () { clearTimeout(closeTimer); });
          drop.addEventListener('mouseleave', function () {
            closeTimer = setTimeout(closeExamDrop, 200);
          });
        }
      });
    }

    document.querySelectorAll('.drawer-accordion-trigger').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var body = this.nextElementSibling;
        var isOpen = this.classList.contains('acc-open');
        this.classList.toggle('acc-open', !isOpen);
        if (body) body.classList.toggle('acc-open', !isOpen);
      });
    });

    /* Auto-open first accordion if on a programs page */
    if (currentPath.startsWith('/programs')) {
      var accTrigger = document.querySelector('.drawer-accordion-trigger');
      var accBody = accTrigger && accTrigger.nextElementSibling;
      if (accTrigger && accBody) {
        accTrigger.classList.add('acc-open');
        accBody.classList.add('acc-open');
      }
    }

    if (drawer) {
      drawer.querySelectorAll('.drawer-link, .drawer-acc-link').forEach(function (link) {
        link.addEventListener('click', closeDrawer);
      });
    }
  }

  if (navRoot()) {
    document.addEventListener('click', function (e) {
      var nav = navRoot();
      if (nav && !nav.contains(e.target)) closeExamDrop();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeExamDrop();
    });
  }
  wireNavMenus();

})();

/* ============================================================
   HOME BANNER CAROUSEL
   ============================================================ */
(function () {
  var wrap = document.getElementById('homeCarousel');
  if (!wrap) return;

  var track = wrap.querySelector('.carousel-track');
  var slides = wrap.querySelectorAll('.carousel-slide');
  var dots   = wrap.querySelectorAll('.carousel-dot-btn');
  var prev   = wrap.querySelector('.carousel-prev');
  var next   = wrap.querySelector('.carousel-next');
  var total  = slides.length;
  var current = 0;
  var timer;
  var DELAY = 5000;

  function goTo(idx) {
    current = (idx + total) % total;
    track.style.transform = 'translateX(-' + (current * 100) + '%)';
    dots.forEach(function (d, i) { d.classList.toggle('active', i === current); });
  }

  function startAuto() {
    clearInterval(timer);
    timer = setInterval(function () { goTo(current + 1); }, DELAY);
  }

  if (prev) prev.addEventListener('click', function () { goTo(current - 1); startAuto(); });
  if (next) next.addEventListener('click', function () { goTo(current + 1); startAuto(); });

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { goTo(i); startAuto(); });
  });

  /* Pause on hover */
  wrap.addEventListener('mouseenter', function () { clearInterval(timer); });
  wrap.addEventListener('mouseleave', startAuto);

  /* Touch swipe - prevent horizontal page scroll while swiping carousel */
  var touchStartX = 0;
  var touchStartY = 0;
  wrap.addEventListener('touchstart', function (e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  wrap.addEventListener('touchmove', function (e) {
    var dx = e.touches[0].clientX - touchStartX;
    var dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
  }, { passive: false });
  wrap.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) { goTo(dx < 0 ? current + 1 : current - 1); startAuto(); }
  }, { passive: true });

  goTo(0);
  startAuto();
})();

/* ── Programs horizontal carousel arrows ─────────────── */
(function () {
  var carousel = document.getElementById('progsCarousel');
  if (!carousel) return;
  var prevBtn = document.querySelector('.progs-prev');
  var nextBtn = document.querySelector('.progs-next');
  var scrollAmt = 320;

  if (nextBtn) nextBtn.addEventListener('click', function () {
    carousel.scrollBy({ left: scrollAmt, behavior: 'smooth' });
  });
  if (prevBtn) prevBtn.addEventListener('click', function () {
    carousel.scrollBy({ left: -scrollAmt, behavior: 'smooth' });
  });
})();
