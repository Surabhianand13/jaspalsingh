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

  /* --- Desktop Exam Mega-Menu (hover + click) --- */
  var mainNav = document.getElementById('mainNav');
  if (mainNav) {
    var openKey = null;
    var closeTimer = null;

    function openExamDrop(key) {
      if (openKey && openKey !== key) closeExamDrop(true);
      openKey = key;
      var btn = mainNav.querySelector('.nav-it-btn[data-key="' + key + '"]');
      var drop = document.getElementById('drop-' + key);
      if (btn) { btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
      if (drop) drop.classList.add('vis');
    }

    function closeExamDrop(instant) {
      if (!openKey) return;
      var btn = mainNav.querySelector('.nav-it-btn[data-key="' + openKey + '"]');
      var drop = document.getElementById('drop-' + openKey);
      if (btn) { btn.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
      if (drop) drop.classList.remove('vis');
      openKey = null;
    }

    mainNav.querySelectorAll('.nav-it-btn[data-key]').forEach(function (btn) {
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

    document.addEventListener('click', function (e) {
      if (mainNav && !mainNav.contains(e.target)) closeExamDrop();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeExamDrop();
    });
  }

  /* --- Mobile Drawer Accordion --- */
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
