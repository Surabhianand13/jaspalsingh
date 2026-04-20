/* ============================================================
   api.js — Central API Client
   Dr. Jaspal Singh Website — jaspalsingh.in

   Single source of truth for all backend calls.
   Imported by: resources.js, blog.js, testimonials.js, home.js

   API_BASE automatically adapts:
     • localhost → http://localhost:5000
     • Production → same origin (Vercel proxies /api/* to Railway)
   ============================================================ */

(function (global) {
  'use strict';

  /* ── Base URL ───────────────────────────────────────────────── */

  var API_BASE = (function () {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    /* Production: same origin — Vercel rewrites /api/* to Render */
    return '';
  })();

  /* ── Core fetch wrapper ─────────────────────────────────────── */

  function apiFetch(method, path, body, params) {
    var url = new URL(API_BASE + path, window.location.href);

    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (v !== null && v !== undefined && v !== '' && v !== 'all') {
          url.searchParams.append(k, v);
        }
      });
    }

    var options = {
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };

    /* Auto-attach learner JWT when present (used by download endpoint) */
    var learnerToken = localStorage.getItem('jaspal_learner_token');
    if (learnerToken) {
      options.headers['Authorization'] = 'Bearer ' + learnerToken;
    }

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    return fetch(url.toString(), options).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          var err = new Error(data.error || ('API error: ' + res.status));
          err.status = res.status;
          throw err;
        });
      }
      return res.json();
    });
  }

  /* ── API namespace ──────────────────────────────────────────── */

  var api = {

    /* ── Health ─────────────────────────────────── */
    health: function () {
      return apiFetch('GET', '/api/health');
    },

    /* ── Resources ──────────────────────────────── */
    resources: {
      /**
       * Fetch visible resources.
       * @param {Object} filters — { subject, type, exam, search, limit, offset }
       */
      getAll: function (filters) {
        return apiFetch('GET', '/api/resources', null, filters);
      },

      /** Fetch a single resource by ID */
      getOne: function (id) {
        return apiFetch('GET', '/api/resources/' + id);
      },

      /**
       * Increment download counter and return file_url.
       * Call this before opening the PDF link.
       * @returns {Promise<{resource: {file_url, title}}>}
       */
      download: function (id) {
        return apiFetch('POST', '/api/resources/download/' + id);
      },
    },

    /* ── Blog ───────────────────────────────────── */
    blog: {
      /**
       * @param {Object} filters — { category, search, limit, offset }
       */
      getAll: function (filters) {
        return apiFetch('GET', '/api/blog', null, filters);
      },

      getOne: function (slug) {
        return apiFetch('GET', '/api/blog/' + slug);
      },
    },

    /* ── Testimonials ───────────────────────────── */
    testimonials: {
      /**
       * @param {Object} filters — { exam_type, featured }
       */
      getAll: function (filters) {
        return apiFetch('GET', '/api/testimonials', null, filters);
      },
    },

    /* ── Contact / Messages ─────────────────────── */
    contact: {
      /**
       * Submit a contact / strategy request.
       * @param {Object} data — { name, email, message, subject? }
       */
      submit: function (data) {
        return apiFetch('POST', '/api/contact', data);
      },
    },

    /* ── Learner Auth & Profile ──────────────── */
    learners: {
      /** Register a new learner account */
      register: function (data) {
        return apiFetch('POST', '/api/learners/register', data);
      },
      /** Login — returns { token, learner } */
      login: function (data) {
        return apiFetch('POST', '/api/learners/login', data);
      },
      /** Get current learner's profile (requires learner token) */
      getMe: function () {
        return apiFetch('GET', '/api/learners/me');
      },
      /** Update profile (requires learner token) */
      updateMe: function (data) {
        return apiFetch('PUT', '/api/learners/me', data);
      },
      /** Get download history (requires learner token) */
      getDownloads: function () {
        return apiFetch('GET', '/api/learners/downloads');
      },
    },

  };

  /* ── Shared Helpers (attached to api.utils) ─────────────────── */

  api.utils = {

    /** Format bytes → "2.4 MB" / "890 KB" / "45 KB" */
    fileSize: function (bytes) {
      if (!bytes || bytes === 0) return '—';
      if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
      if (bytes >= 1024)    return Math.round(bytes / 1024)    + ' KB';
      return bytes + ' B';
    },

    /** Format ISO date string → "Apr 2025" */
    monthYear: function (iso) {
      if (!iso) return '';
      var d = new Date(iso);
      return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    },

    /** Format ISO date string → "Apr 10, 2025" */
    fullDate: function (iso) {
      if (!iso) return '';
      var d = new Date(iso);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    /** Format large numbers → "1,240" / "3.2K" */
    count: function (n) {
      if (!n || n === 0) return '0';
      if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
      return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    /** Escape user-supplied HTML to prevent XSS */
    esc: function (str) {
      return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },

    /** Map subject name → CSS tag class */
    subjectClass: function (subject) {
      var map = {
        'Environmental Engineering': 'tag-env',
        'Geotechnical Engineering':  'tag-geo',
        'Engineering Hydrology':     'tag-hyd',
        'Irrigation Engineering':    'tag-irr',
      };
      return map[subject] || 'tag-gen';
    },

    /** Map blog category key → display label */
    catLabel: function (cat) {
      var map = {
        'exam-updates':   'Exam Update',
        'subject-tips':   'Subject Tips',
        'strategy':       'Strategy',
        'student-stories':'Student Stories',
        'personal-notes': 'Personal Notes',
      };
      return map[cat] || cat;
    },

    /** Map blog category key → CSS badge class */
    catClass: function (cat) {
      var map = {
        'exam-updates':   'cat-exam',
        'subject-tips':   'cat-subject',
        'strategy':       'cat-strategy',
        'student-stories':'cat-student',
        'personal-notes': 'cat-personal',
      };
      return map[cat] || '';
    },

    /** Generate initials avatar from name */
    initials: function (name) {
      var parts = (name || '').trim().split(' ');
      return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    },

    /**
     * Render skeleton placeholder cards (pulsing grey boxes).
     * @param {HTMLElement} container
     * @param {number}      count
     * @param {string}      type  'resource' | 'blog' | 'testi'
     */
    showSkeleton: function (container, count, type) {
      var html = '';
      for (var i = 0; i < count; i++) {
        if (type === 'resource') {
          html += '<div class="resource-card skeleton-card" aria-hidden="true">' +
            '<div class="sk-line sk-line--short"></div>' +
            '<div class="sk-line sk-line--title"></div>' +
            '<div class="sk-line"></div><div class="sk-line sk-line--short"></div>' +
            '<div class="sk-btn"></div></div>';
        } else if (type === 'blog') {
          html += '<div class="blog-card skeleton-card" aria-hidden="true">' +
            '<div class="blog-card-img sk-img"></div>' +
            '<div class="blog-card-body">' +
            '<div class="sk-line sk-line--short"></div>' +
            '<div class="sk-line sk-line--title"></div>' +
            '<div class="sk-line"></div><div class="sk-line sk-line--short"></div>' +
            '</div></div>';
        } else if (type === 'testi') {
          html += '<div class="testi-card skeleton-card" aria-hidden="true">' +
            '<div class="sk-line"></div><div class="sk-line"></div>' +
            '<div class="sk-line sk-line--short"></div>' +
            '</div>';
        }
      }
      container.innerHTML = html;
    },
  };

  /* ── Expose globally ─────────────────────────────────────────── */
  global.JaspalAPI = api;

  /* ── Auto-wake backend on every page load ───────────────────── */
  /* Render free tier sleeps after 15 min; this silent ping wakes  */
  /* it up immediately so it's ready by the time a user submits.  */
  (function () {
    var isProd = window.location.hostname !== 'localhost' &&
                 window.location.hostname !== '127.0.0.1';
    if (isProd) {
      fetch('/api/health', { method: 'GET' }).catch(function () {});
    }
  })();

})(window);
