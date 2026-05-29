/* ============================================================
   HOME.JS — Homepage JavaScript (Gen-Z Premium Edition)
   Dr. Jaspal Singh Personal Website — jaspalsingh.in
   ============================================================ */

(function () {
  'use strict';

  /* ── Reading progress bar ─────────────────────────────── */
  var progressBar = document.getElementById('readingProgress');
  if (progressBar) {
    window.addEventListener('scroll', function () {
      var scrollTop  = window.scrollY;
      var docHeight  = document.documentElement.scrollHeight - window.innerHeight;
      var pct        = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progressBar.style.width = pct + '%';
    }, { passive: true });
  }

  /* ── Cursor glow (desktop only) ───────────────────────── */
  var cursorGlow = document.getElementById('cursorGlow');
  if (cursorGlow && window.innerWidth > 768) {
    var glowX = 0, glowY = 0;
    var targetX = 0, targetY = 0;
    var glowRaf;

    document.addEventListener('mousemove', function (e) {
      targetX = e.clientX;
      targetY = e.clientY;
    }, { passive: true });

    function animateGlow() {
      glowX += (targetX - glowX) * 0.08;
      glowY += (targetY - glowY) * 0.08;
      cursorGlow.style.left = glowX + 'px';
      cursorGlow.style.top  = glowY + 'px';
      glowRaf = requestAnimationFrame(animateGlow);
    }
    glowRaf = requestAnimationFrame(animateGlow);

    /* Hide glow when mouse leaves */
    document.addEventListener('mouseleave', function () {
      cursorGlow.style.opacity = '0';
    });
    document.addEventListener('mouseenter', function () {
      cursorGlow.style.opacity = '1';
    });
  }

  /* ── Hero particle canvas ─────────────────────────────── */
  (function initParticles() {
    var canvas = document.getElementById('heroParticles');
    if (!canvas) return;
    var ctx    = canvas.getContext('2d');
    var particles = [];
    var COUNT  = window.innerWidth < 768 ? 28 : 55;

    function resize() {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    function rand(min, max) { return Math.random() * (max - min) + min; }

    function Particle() {
      this.reset();
    }
    Particle.prototype.reset = function () {
      this.x    = rand(0, canvas.width);
      this.y    = rand(canvas.height * 0.2, canvas.height);
      this.size = rand(1, 2.5);
      this.speedY = rand(0.25, 0.75);
      this.speedX = rand(-0.2, 0.2);
      this.alpha  = rand(0.2, 0.7);
      this.hue    = Math.random() > 0.6 ? '200,18,64' : '103,200,232';
    };
    Particle.prototype.update = function () {
      this.y -= this.speedY;
      this.x += this.speedX;
      this.alpha -= 0.0018;
      if (this.alpha <= 0 || this.y < 0) this.reset();
    };
    Particle.prototype.draw = function () {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.fillStyle   = 'rgba(' + this.hue + ',' + this.alpha + ')';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    for (var i = 0; i < COUNT; i++) {
      var p = new Particle();
      p.y = rand(0, canvas.height); /* distribute initial positions */
      particles.push(p);
    }

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(function (p) { p.update(); p.draw(); });
      requestAnimationFrame(loop);
    }
    loop();
  })();

  /* ── Animated Stat Counters ───────────────────────────── */
  var statNums        = document.querySelectorAll('.stat-num[data-target]');
  var countersStarted = false;

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function animateCounter(el, target, duration) {
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var elapsed  = ts - startTime;
      var progress = Math.min(elapsed / duration, 1);
      el.textContent = Math.floor(easeOutExpo(progress) * target);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  /* ── Scroll-reveal — [data-reveal] & [data-stagger] ───── */
  var revealEls   = document.querySelectorAll('[data-reveal]');
  var staggerEls  = document.querySelectorAll('[data-stagger]');
  var statsBar    = document.querySelector('.stats-bar');

  if ('IntersectionObserver' in window) {

    /* Single-element reveals */
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    revealEls.forEach(function (el) { revealObs.observe(el); });

    /* Staggered child reveals */
    var staggerObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          staggerObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    staggerEls.forEach(function (el) { staggerObs.observe(el); });

    /* Stat counters */
    if (statsBar) {
      var statsObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !countersStarted) {
            countersStarted = true;
            statNums.forEach(function (el) {
              animateCounter(el, parseInt(el.dataset.target, 10), 2000);
            });
          }
        });
      }, { threshold: 0.4 });
      statsObs.observe(statsBar);
    }

  } else {
    /* Fallback: show everything immediately */
    revealEls.forEach(function (el)  { el.classList.add('is-visible'); });
    staggerEls.forEach(function (el) { el.classList.add('is-visible'); });
    statNums.forEach(function (el) {
      el.textContent = el.dataset.target;
    });
  }

  /* ── Legacy card fade-in (for elements not in data-stagger) */
  var legacyCards = document.querySelectorAll(
    '.why-card:not([data-stagger] *), .resource-card:not([data-stagger] *), .testimonial-card:not([data-stagger] *)'
  );
  if (legacyCards.length && 'IntersectionObserver' in window) {
    var legacyObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity   = '1';
          entry.target.style.transform = 'translateY(0)';
          legacyObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    legacyCards.forEach(function (el) {
      el.style.opacity    = '0';
      el.style.transform  = 'translateY(24px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      legacyObs.observe(el);
    });
  }

  /* ── Magnetic CTA buttons ─────────────────────────────── */
  if (window.innerWidth > 1024) {
    document.querySelectorAll('.btn-primary, .cs-cta').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var rect = btn.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width  / 2;
        var y = e.clientY - rect.top  - rect.height / 2;
        btn.style.transform = 'translate(' + (x * 0.18) + 'px, ' + (y * 0.18) + 'px) scale(1.04)';
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.transform = '';
      });
    });
  }

  /* ── Exam chip selector ───────────────────────────────── */
  window.examSelect = function (exam) {
    document.querySelectorAll('.hero-exam-chip').forEach(function (c) {
      c.classList.remove('active');
    });
    var classMap = { 'ssc-je': 'chip-sscje', 'raj-ae': 'chip-rajae', 'gate': 'chip-gate', 'ese': 'chip-ese' };
    var chip = document.querySelector('.' + classMap[exam]);
    if (chip) chip.classList.add('active');

    var targetSel = (exam === 'gate' || exam === 'ese') ? '.resources-section' : '.offline-progs-section';
    var target = document.querySelector(targetSel);
    if (target) {
      var y = target.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }

    var jaMap = { 'ssc-je': 'ssc', 'raj-ae': 'raj-ae', 'gate': 'gate', 'ese': 'ese' };
    var jaExam = jaMap[exam];
    if (jaExam) {
      var jaBtn = document.querySelector('.ja-filter-btn.f-' + jaExam);
      if (jaBtn) jaFilter(jaBtn, jaExam);
    }
  };

})();

/* ── Scroll Journey Companion ───────────────────────────── */
(function () {
  var journey  = document.getElementById('scrollJourney');
  var traveler = document.getElementById('sjTraveler');
  var fill     = document.getElementById('sjFill');
  if (!journey || !traveler || !fill) return;

  var stops    = Array.from(journey.querySelectorAll('.sj-stop'));
  var sections = stops.map(function (btn) {
    return document.querySelector(btn.dataset.section);
  });
  var heroSection = document.querySelector('.hero-section');

  /* Click a dot → smooth scroll to that section */
  stops.forEach(function (btn, i) {
    btn.addEventListener('click', function () {
      var target = sections[i];
      if (target) {
        var y = target.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    });
  });

  function update() {
    var scrollY = window.scrollY;
    var viewH   = window.innerHeight;

    /* Show only after scrolling past the hero */
    var heroBottom = heroSection ? (heroSection.offsetTop + heroSection.offsetHeight * 0.6) : 400;
    if (scrollY < heroBottom) {
      journey.classList.remove('sj-visible');
      return;
    }
    journey.classList.add('sj-visible');

    /* Find which section is currently active */
    var current = 0;
    sections.forEach(function (sec, i) {
      if (sec && scrollY + viewH * 0.45 >= sec.offsetTop) current = i;
    });

    /* Update active dot */
    stops.forEach(function (btn, i) {
      btn.classList.toggle('sj-active', i === current);
    });

    /* Move traveler to the active dot's position within the journey element */
    var activeDot = stops[current] ? stops[current].querySelector('.sj-dot') : null;
    if (activeDot) {
      var journeyRect = journey.getBoundingClientRect();
      var dotRect     = activeDot.getBoundingClientRect();
      var relativeTop = dotRect.top - journeyRect.top + dotRect.height / 2;
      traveler.style.top = relativeTop + 'px';
    }

    /* Fill the track proportionally */
    var pct = sections.length > 1 ? (current / (sections.length - 1)) * 100 : 0;
    fill.style.height = pct + '%';

    /* Swap emoji per section for fun */
    var emojis = ['📊', '🎯', '📚', '❤️', '🤝', '⭐'];
    traveler.textContent = emojis[current] || '📖';
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
})();

/* ── Job Alerts filter ──────────────────────────────────── */
function jaFilter(btn, exam) {
  document.querySelectorAll('.ja-filter-btn').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  document.querySelectorAll('.ja-card').forEach(function (card) {
    card.style.display = (exam === 'all' || card.dataset.exam === exam) ? '' : 'none';
  });
}
