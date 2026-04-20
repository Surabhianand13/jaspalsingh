/* ============================================================
   HOME.JS — Homepage JavaScript
   Dr. Jaspal Singh Personal Website — jaspalsingh.in
   Handles: stat counters, scroll fade-in animations
   ============================================================ */

(function () {
  'use strict';

  /* --- Animated Stat Counters --- */

  function animateCounter(el, target, duration) {
    var startTime = null;

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed  = timestamp - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var value    = Math.floor(easeOutCubic(progress) * target);
      el.textContent = value;
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  /* Observe the stats bar — trigger counters once when it enters view */
  var statNums        = document.querySelectorAll('.stat-num[data-target]');
  var countersStarted = false;

  if (statNums.length && 'IntersectionObserver' in window) {
    var statsBar = document.querySelector('.stats-bar');

    var statsObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !countersStarted) {
          countersStarted = true;
          statNums.forEach(function (el) {
            animateCounter(el, parseInt(el.dataset.target, 10), 1800);
          });
        }
      });
    }, { threshold: 0.4 });

    if (statsBar) statsObserver.observe(statsBar);
  }

  /* --- Scroll Fade-in for Cards --- */

  var animatables = document.querySelectorAll(
    '.why-card, .resource-card, .testimonial-card, .community-btn, .stat-item'
  );

  /* Set initial hidden state */
  animatables.forEach(function (el) {
    el.style.opacity  = '0';
    el.style.transform = el.style.transform
      ? el.style.transform + ' translateY(22px)'
      : 'translateY(22px)';
    el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
  });

  if ('IntersectionObserver' in window) {
    var cardObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el    = entry.target;
          var delay = parseInt(el.dataset.animDelay || '0', 10);
          setTimeout(function () {
            el.style.opacity   = '1';
            el.style.transform = el.style.transform.replace('translateY(22px)', 'translateY(0)');
          }, delay);
          cardObserver.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    /* Stagger siblings within the same grid */
    var grids = ['.why-cards', '.resources-grid', '.testimonials-grid', '.community-grid', '.stats-inner'];
    grids.forEach(function (selector) {
      var grid = document.querySelector(selector);
      if (!grid) return;
      var children = grid.querySelectorAll('.why-card, .resource-card, .testimonial-card, .community-btn, .stat-item');
      children.forEach(function (el, i) {
        el.dataset.animDelay = String(i * 90);
      });
    });

    animatables.forEach(function (el) { cardObserver.observe(el); });
  } else {
    /* Fallback for browsers without IntersectionObserver */
    animatables.forEach(function (el) {
      el.style.opacity   = '1';
      el.style.transform = '';
    });
  }

})();
