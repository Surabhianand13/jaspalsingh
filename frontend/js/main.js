/* ============================================================
   MAIN.JS — Global JavaScript
   Dr. Jaspal Singh Personal Website — jaspalsingh.in
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

  document.querySelectorAll('.nav-link, .drawer-link').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '/' && (href === '/' || href === '/index.html'))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

})();
