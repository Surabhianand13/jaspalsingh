/**
 * admin.js  -  Admin Panel JavaScript
 * jaspalsingh.in  -  Civil Engineering Educator
 *
 * Vanilla JS, no frameworks.
 * All API calls go through adminFetch() which attaches the admin JWT.
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════
     CONFIG
     ══════════════════════════════════════════════ */
  var API_BASE  = location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  var TOKEN_KEY = 'jaspal_admin_token';

  /* ══════════════════════════════════════════════
     AUTH HELPERS
     ══════════════════════════════════════════════ */

  /** Return the stored admin JWT, or null. */
  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  /** Clear auth and redirect to login page. */
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    location.href = '/admin/login';
  }

  /* ══════════════════════════════════════════════
     ADMIN API CLIENT
     ══════════════════════════════════════════════ */

  /**
   * adminFetch(method, path, body)
   *
   * @param {string} method  - HTTP verb: 'GET', 'POST', 'PUT', 'DELETE'
   * @param {string} path    - API path, e.g. '/api/resources/admin/all'
   * @param {Object|FormData|null} body - Request payload
   * @returns {Promise<any>}  Resolves with parsed JSON; rejects on HTTP errors.
   */
  function adminFetch(method, path, body) {
    var token = getToken();
    var headers = {
      'Authorization': 'Bearer ' + token
    };

    var init = {
      method:  method,
      headers: headers
    };

    if (body) {
      if (body instanceof FormData) {
        /* Browser sets Content-Type + boundary automatically */
        init.body = body;
      } else {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
    }

    return fetch(API_BASE + path, init).then(function (res) {
      if (res.status === 401) {
        logout();
        return Promise.reject(new Error('Session expired. Please log in again.'));
      }
      if (!res.ok) {
        return res.json().then(function (data) {
          return Promise.reject(new Error(data.message || data.error || 'Request failed (' + res.status + ')'));
        }, function () {
          return Promise.reject(new Error('Request failed (' + res.status + ')'));
        });
      }
      /* 204 No Content */
      if (res.status === 204) return null;
      return res.json();
    });
  }

  /* ══════════════════════════════════════════════
     TOAST NOTIFICATIONS
     ══════════════════════════════════════════════ */

  /**
   * showToast(msg, type)
   * @param {string} msg   - Message text
   * @param {string} type  - 'success' | 'error' | 'info'
   */
  function showToast(msg, type) {
    type = type || 'success';
    var container = document.getElementById('toastContainer');
    if (!container) return;

    var icons = {
      success: 'fa-circle-check',
      error:   'fa-circle-exclamation',
      info:    'fa-circle-info'
    };

    var toast = document.createElement('div');
    toast.className = 'admin-toast toast-' + type;
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      '<i class="fas ' + (icons[type] || icons.success) + ' toast-icon"></i>' +
      '<span>' + escapeHtml(msg) + '</span>';

    container.appendChild(toast);

    /* Auto-remove after 3.5s with fade-out */
    var removeTimer = setTimeout(function () {
      dismissToast(toast);
    }, 3500);

    /* Allow click to dismiss early */
    toast.addEventListener('click', function () {
      clearTimeout(removeTimer);
      dismissToast(toast);
    });
  }

  function dismissToast(toast) {
    if (!toast.parentNode) return;
    toast.classList.add('toast-out');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 320);
  }

  /* ══════════════════════════════════════════════
     UTILITY HELPERS
     ══════════════════════════════════════════════ */

  /** Escape HTML special chars to prevent XSS */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Format an ISO date string for display.
   * e.g. "20 Jan 2024"
   */
  function fmtDate(iso) {
    if (!iso) return ' - ';
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        day:   'numeric',
        month: 'short',
        year:  'numeric'
      });
    } catch (e) {
      return ' - ';
    }
  }

  /**
   * Generate a URL slug from a title string.
   * Lowercase, spaces → hyphens, strip special chars.
   */
  function autoSlug(title) {
    if (!title) return '';
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')   /* remove special chars */
      .replace(/\s+/g, '-')            /* spaces → hyphens */
      .replace(/-+/g, '-')             /* collapse multiple hyphens */
      .replace(/^-|-$/g, '');          /* trim leading/trailing hyphens */
  }

  /** Get element by ID (shorthand) */
  function $(id) { return document.getElementById(id); }

  /* ══════════════════════════════════════════════
     SECTION SWITCHING
     ══════════════════════════════════════════════ */

  var currentSection = 'dashboard';

  var sectionTitles = {
    'dashboard':    'Dashboard',
    'resources':    'Resources',
    'blog':         'Blog',
    'testimonials': 'Testimonials',
    'messages':     'Messages',
    'learners':     'Learners',
    'programs':     'Programs',
    'enrollments':  'Enrollments',
    'paidlearners': 'Paid Learners',
    'referralpayouts': 'Referral Payouts',
    'programleads': 'Interest / Leads',
    'banners':      'Banners & Promo Images',
    'analytics':    'Analytics',
    'omr-checker':  'OMR Test Checker',
    'omr-papers':   'Send OMR Content',
    'coupons':      'Coupons',
    'homepage':     'Homepage Content'
  };

  /**
   * Show a named section, hide all others.
   * Updates sidebar active state + topbar page title.
   */
  function showSection(name) {
    /* Hide all sections */
    var sections = document.querySelectorAll('.admin-section');
    sections.forEach(function (sec) { sec.classList.remove('active'); });

    /* Show target */
    var target = document.getElementById('section-' + name);
    if (target) target.classList.add('active');

    /* Update sidebar active link */
    var links = document.querySelectorAll('.admin-nav-link');
    links.forEach(function (link) {
      var isActive = link.getAttribute('data-section') === name;
      link.classList.toggle('active', isActive);
      link.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    /* Update page title */
    var titleEl = $('pageTitle');
    if (titleEl) titleEl.textContent = sectionTitles[name] || name;

    currentSection = name;

    /* Close sidebar on mobile after navigation */
    closeSidebar();

    /* Load section data */
    switch (name) {
      case 'dashboard':    loadDashboard();    break;
      case 'resources':    loadResources();    break;
      case 'blog':         loadBlog();         break;
      case 'testimonials': loadTestimonials(); break;
      case 'messages':     loadMessages();     break;
      case 'learners':     loadLearners();     break;
      case 'programs':     loadPrograms();     break;
      case 'enrollments':  loadEnrollments();  break;
      case 'paidlearners': loadPaidLearners(); break;
      case 'referralpayouts': loadReferralPayouts(); loadReferralCodesAdmin(); break;
      case 'programleads': loadProgramLeads(); break;
      case 'banners':      loadBanners();      break;
      case 'analytics':    loadBizAnalytics(); break;
      case 'omr-checker':  loadOmrChecker();   break;
      case 'coupons':      loadCoupons();      break;
      case 'homepage':     loadHomepageContent('carousel'); loadHomepageContent('ticker'); loadHomepageContent('quicklinks'); break;
    }
  }

  /** Bind all sidebar nav link click events */
  function bindSidebarNav() {
    document.querySelectorAll('.admin-nav-link[data-section]').forEach(function (link) {
      link.addEventListener('click', function () {
        var section = this.getAttribute('data-section');
        if (section) showSection(section);
      });
    });
  }

  /* ══════════════════════════════════════════════
     SIDEBAR MOBILE TOGGLE
     ══════════════════════════════════════════════ */

  function openSidebar() {
    var sidebar  = document.getElementById('adminSidebar');
    var overlay  = document.getElementById('sidebarOverlay');
    if (sidebar)  sidebar.classList.add('open');
    if (overlay)  overlay.classList.add('open');
  }

  function closeSidebar() {
    var sidebar  = document.getElementById('adminSidebar');
    var overlay  = document.getElementById('sidebarOverlay');
    if (sidebar)  sidebar.classList.remove('open');
    if (overlay)  overlay.classList.remove('open');
  }

  function bindSidebarToggle() {
    var toggleBtn = $('sidebarToggle');
    var overlay   = $('sidebarOverlay');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var sidebar = document.getElementById('adminSidebar');
        if (sidebar && sidebar.classList.contains('open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    }

    if (overlay) {
      overlay.addEventListener('click', closeSidebar);
    }
  }

  /* ══════════════════════════════════════════════
     TOPBAR  -  LOGOUT
     ══════════════════════════════════════════════ */

  function bindTopbarLogout() {
    var btn = $('btnLogout');
    if (btn) {
      btn.addEventListener('click', function () {
        if (confirm('Are you sure you want to log out?')) {
          logout();
        }
      });
    }
  }

  /* ══════════════════════════════════════════════
     MODALS
     ══════════════════════════════════════════════ */

  /** Open a modal overlay by ID */
  function openModal(id) {
    var overlay = $(id);
    if (overlay) {
      overlay.classList.add('open');
      /* Focus first input */
      setTimeout(function () {
        var firstInput = overlay.querySelector('input:not([type="file"]):not([type="checkbox"]), select, textarea');
        if (firstInput) firstInput.focus();
      }, 80);
    }
  }

  /** Close a modal overlay by ID */
  function closeModal(id) {
    var overlay = $(id);
    if (overlay) overlay.classList.remove('open');
  }

  /** Bind all "close modal" buttons (data-modal="...") */
  function bindModalCloseButtons() {
    document.querySelectorAll('[data-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeModal(this.getAttribute('data-modal'));
      });
    });

    /* Close on overlay backdrop click */
    document.querySelectorAll('.admin-modal-overlay').forEach(function (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });

    /* Close on Escape key */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.admin-modal-overlay.open').forEach(function (o) {
          closeModal(o.id);
        });
      }
    });
  }

  /* ══════════════════════════════════════════════
     SECTION: DASHBOARD
     ══════════════════════════════════════════════ */

  function loadDashboard() {
    /* Refresh button */
    var refreshBtn = $('btnRefreshDash');
    if (refreshBtn && !refreshBtn._bound) {
      refreshBtn._bound = true;
      refreshBtn.addEventListener('click', loadDashboard);
    }

    /* Reset stat displays */
    ['statRevenue', 'statTodayRevenue', 'statEnrollments', 'statWeekLearners', 'statLearners', 'statBlog'].forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = '…';
    });

    /* 1. Enrollment revenue stats */
    adminFetch('GET', '/api/enrollment/admin/all?status=paid').then(function (data) {
      var enrollments = data.enrollments || [];
      var todayStr = new Date().toISOString().slice(0, 10);
      var totalRevenue = 0;
      var todayRevenue = 0;
      enrollments.forEach(function (en) {
        if (en.refund_status === 'initiated') return; // excluded from revenue - refund flagged
        var amt = parseInt(en.amount) || 0;
        totalRevenue += amt;
        if (en.paid_at && en.paid_at.slice(0, 10) === todayStr) {
          todayRevenue += amt;
        }
      });
      var elRev = $('statRevenue');
      if (elRev) elRev.textContent = inrIndian(totalRevenue);
      var elToday = $('statTodayRevenue');
      if (elToday) elToday.textContent = inrIndian(todayRevenue);
      var elEnroll = $('statEnrollments');
      if (elEnroll) elEnroll.textContent = enrollments.length;
      /* Render recent enrollments list */
      renderRecentEnrollments(enrollments.slice(0, 5));
    }).catch(function () {
      ['statRevenue', 'statTodayRevenue', 'statEnrollments'].forEach(function (id) {
        var el = $(id); if (el) el.textContent = 'Err';
      });
    });

    /* 2. Blog count */
    adminFetch('GET', '/api/blog/admin/all?limit=1').then(function (data) {
      var el = $('statBlog');
      if (el) el.textContent = data.total || (Array.isArray(data) ? data.length : 0);
    }).catch(function () {
      var el = $('statBlog');
      if (el) el.textContent = 'Err';
    });

    /* 3. Learner stats */
    adminFetch('GET', '/api/learners/stats').then(function (data) {
      var el = $('statLearners');
      if (el) el.textContent = data.total || 0;
      var elWeek = $('statWeekLearners');
      if (elWeek) elWeek.textContent = data.last_7d || 0;
    }).catch(function () {
      ['statLearners', 'statWeekLearners'].forEach(function (id) {
        var el = $(id); if (el) el.textContent = 'Err';
      });
    });

    /* Load analytics charts */
    bindChartRangeButtons();
    loadDashboardCharts(14);
  }

  /** Render the 5 most recent paid enrollments in the dashboard card */
  function renderRecentEnrollments(items) {
    var el = $('recentEnrollmentsList');
    if (!el) return;

    if (!items || items.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:24px;"><i class="fas fa-inbox"></i><p>No enrollments yet.</p></div>';
      return;
    }

    var rows = items.map(function (en) {
      var prog = (en.program_name || '').slice(0, 30) + ((en.program_name || '').length > 30 ? '…' : '');
      return '<tr>' +
        '<td style="font-size:13px;">' + escapeHtml(en.student_name || '-') + '</td>' +
        '<td style="font-size:12px;color:#6b6b8a;">' + escapeHtml(prog) + '</td>' +
        '<td style="font-size:13px;font-weight:600;color:#16a34a;">Rs ' + escapeHtml(String(en.amount || 0)) + '</td>' +
        '<td style="font-size:12px;color:#9999b0;">' + fmtDate(en.paid_at || en.created_at) + '</td>' +
        '</tr>';
    }).join('');

    el.innerHTML = '<div class="admin-table-wrap"><table class="admin-table" style="font-size:13px;">' +
      '<thead><tr><th>Name</th><th>Program</th><th>Amount</th><th>Date</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  /** Render the 3 most recent messages in the dashboard card */
  function renderRecentMessages(items) {
    var el = $('recentMessagesList');
    if (!el) return;

    if (!items || items.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:24px;"><i class="fas fa-inbox"></i><p>No messages yet.</p></div>';
      return;
    }

    el.innerHTML = items.map(function (m) {
      var initial = (m.name || m.full_name || 'U')[0].toUpperCase();
      var preview = (m.message || '').slice(0, 80);
      return (
        '<div class="msg-item">' +
          '<div class="msg-avatar">' + escapeHtml(initial) + '</div>' +
          '<div class="msg-info">' +
            '<div class="msg-name">' + escapeHtml(m.name || m.full_name || 'Unknown') + '</div>' +
            '<div class="msg-preview">' + escapeHtml(preview) + (preview.length < (m.message || '').length ? '…' : '') + '</div>' +
          '</div>' +
          '<div class="msg-time">' + fmtDate(m.created_at || m.createdAt) + '</div>' +
        '</div>'
      );
    }).join('');
  }

  /** Update the Messages sidebar badge with unread count */
  function updateMessagesBadge(count) {
    var navMsg = $('navMessages');
    if (!navMsg) return;

    /* Remove existing badge */
    var existing = navMsg.querySelector('.nav-badge');
    if (existing) navMsg.removeChild(existing);

    if (count > 0) {
      var badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.textContent = count > 99 ? '99+' : count;
      navMsg.appendChild(badge);
    }
  }

  /* ══════════════════════════════════════════════
     ANALYTICS CHARTS (Phase 7)
     ══════════════════════════════════════════════ */

  var _chartDownloads    = null;
  var _chartLearners     = null;
  var _chartTopResources = null;
  var _chartExamDonut    = null;

  var CHART_COLORS = {
    magenta:   '#F0345A',
    sky:       '#67C8E8',
    green:     '#10b981',
    amber:     '#f59e0b',
    purple:    '#8b5cf6',
    navy:      '#1A1A2E',
  };

  /* Shared chart defaults */
  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { maxTicksLimit: 10, font: { size: 11 } } },
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { precision: 0, font: { size: 11 } }, beginAtZero: true },
      },
    };
  }

  function formatChartDate(isoDate) {
    var d = new Date(isoDate);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  /* Load + render all analytics charts */
  function loadDashboardCharts(days) {
    days = days || 14;
    loadDownloadsChart(days);
    loadLearnersChart(days);
    loadTopResourcesChart();
    loadExamDonut();
  }

  function loadDownloadsChart(days) {
    adminFetch('GET', '/api/analytics/downloads/trend?days=' + days)
      .then(function (data) {
        var labels  = (data.trend || []).map(function (r) { return formatChartDate(r.date); });
        var values  = (data.trend || []).map(function (r) { return r.downloads; });
        var ctx     = document.getElementById('chartDownloads');
        if (!ctx) return;
        if (_chartDownloads) _chartDownloads.destroy();
        _chartDownloads = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Downloads',
              data:  values,
              borderColor:     CHART_COLORS.magenta,
              backgroundColor: 'rgba(240,52,90,0.08)',
              borderWidth: 2.5,
              pointRadius: 3,
              fill: true,
              tension: 0.35,
            }],
          },
          options: chartDefaults(),
        });
      }).catch(function () {});
  }

  function loadLearnersChart(days) {
    adminFetch('GET', '/api/analytics/learners/trend?days=' + days)
      .then(function (data) {
        var labels = (data.trend || []).map(function (r) { return formatChartDate(r.date); });
        var values = (data.trend || []).map(function (r) { return r.signups; });
        var ctx    = document.getElementById('chartLearners');
        if (!ctx) return;
        if (_chartLearners) _chartLearners.destroy();
        _chartLearners = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'New Signups',
              data:  values,
              borderColor:     CHART_COLORS.green,
              backgroundColor: 'rgba(16,185,129,0.08)',
              borderWidth: 2.5,
              pointRadius: 3,
              fill: true,
              tension: 0.35,
            }],
          },
          options: chartDefaults(),
        });
      }).catch(function () {});
  }

  function loadTopResourcesChart() {
    adminFetch('GET', '/api/analytics/top-resources?limit=8')
      .then(function (data) {
        var items  = data.resources || [];
        var labels = items.map(function (r) {
          var t = r.title || '';
          return t.length > 30 ? t.slice(0, 28) + '…' : t;
        });
        var values = items.map(function (r) { return r.download_count || 0; });
        var ctx    = document.getElementById('chartTopResources');
        if (!ctx) return;
        if (_chartTopResources) _chartTopResources.destroy();
        _chartTopResources = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Downloads',
              data:  values,
              backgroundColor: 'rgba(103,200,232,0.7)',
              borderColor:     CHART_COLORS.sky,
              borderWidth: 1.5,
              borderRadius: 5,
            }],
          },
          options: Object.assign({}, chartDefaults(), {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
              y: { ticks: { font: { size: 11 } } },
            },
          }),
        });
      }).catch(function () {});
  }

  function loadExamDonut() {
    adminFetch('GET', '/api/learners/stats')
      .then(function (data) {
        var revData = data.by_program_revenue || [];
        /* Render quick text stats - revenue actually collected per program
           category, derived from paid enrollments rather than the learner's
           self-picked target_exam, so a newly launched program (e.g. ESE)
           shows up here the moment it has a sale, with no manual mapping. */
        var el = $('quickStats');
        if (el) {
          var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
          revData.forEach(function (row) {
            html += '<div style="display:flex;justify-content:space-between;font-size:13px;">' +
                    '<span>' + escapeHtml(row.category || 'Other') + '</span>' +
                    '<strong>' + inrIndian(row.revenue || 0) + ' <span style="color:var(--admin-text-muted,#888);font-weight:400;">(' + (row.count || 0) + ')</span></strong></div>';
          });
          html += '</div>';
          el.innerHTML = html;
        }
        /* Donut chart */
        if (!revData.length) return;
        var labels   = revData.map(function (r) { return r.category || 'Other'; });
        var values   = revData.map(function (r) { return r.revenue || 0; });
        var bgColors = [CHART_COLORS.magenta, CHART_COLORS.sky, CHART_COLORS.green, CHART_COLORS.amber, CHART_COLORS.purple];
        var ctx = document.getElementById('chartExamDonut');
        if (!ctx) return;
        if (_chartExamDonut) _chartExamDonut.destroy();
        _chartExamDonut = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: values,
              backgroundColor: bgColors.slice(0, values.length),
              borderWidth: 2,
              borderColor: '#fff',
            }],
          },
          options: {
            responsive: true,
            cutout: '62%',
            plugins: {
              legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
              tooltip: { callbacks: { label: function (ctx) { return ctx.label + ': ' + inrIndian(ctx.parsed); } } },
            },
          },
        });
      }).catch(function () {});
  }

  /* Bind chart range buttons */
  function bindChartRangeButtons() {
    document.querySelectorAll('.chart-range-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.chart-range-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadDownloadsChart(parseInt(btn.dataset.days, 10));
      });
    });
    document.querySelectorAll('.chart-range-btn-l').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.chart-range-btn-l').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadLearnersChart(parseInt(btn.dataset.days, 10));
      });
    });
  }

  /* ══════════════════════════════════════════════
     SECTION: RESOURCES
     ══════════════════════════════════════════════ */

  var resourcesState = {
    items:   [],
    editing: null   /* resource object being edited, or null for new */
  };

  /** Load all resources from API and render table */
  function loadResources() {
    var tbody = $('resourcesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7"><div class="admin-table-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></td></tr>';

    adminFetch('GET', '/api/resources/admin/all').then(function (data) {
      resourcesState.items = Array.isArray(data) ? data : (data.resources || data.data || []);
      renderResourcesTable(resourcesState.items);
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="admin-table-empty"><i class="fas fa-triangle-exclamation"></i><p>' + escapeHtml(err.message) + '</p></div></td></tr>';
    });
  }

  /** Render resources into the table body */
  function renderResourcesTable(items) {
    var tbody = $('resourcesTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="admin-table-empty"><i class="fas fa-file-pdf"></i><p>No resources found.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function (r) {
      return (
        '<tr data-id="' + r.id + '">' +
          '<td><span class="cell-truncate" style="max-width:220px;display:block;" title="' + escapeHtml(r.title) + '">' + escapeHtml(r.title) + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(r.subject || ' - ') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(r.resource_type || r.type || ' - ') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(r.exam_tag || ' - ') + '</span></td>' +
          '<td><span class="fw-600">' + (r.download_count || 0) + '</span></td>' +
          '<td>' + (r.is_visible ? '<span class="badge badge-visible"><i class="fas fa-eye"></i>Yes</span>' : '<span class="badge badge-hidden"><i class="fas fa-eye-slash"></i>No</span>') + '</td>' +
          '<td class="col-actions">' +
            '<button class="btn-icon primary btn-admin-sm res-edit-btn" data-id="' + r.id + '" title="Edit" aria-label="Edit ' + escapeHtml(r.title) + '">' +
              '<i class="fas fa-pen"></i>' +
            '</button>' +
            ' ' +
            '<button class="btn-icon danger btn-admin-sm res-delete-btn" data-id="' + r.id + '" title="Delete" aria-label="Delete ' + escapeHtml(r.title) + '">' +
              '<i class="fas fa-trash"></i>' +
            '</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    /* Bind edit and delete buttons */
    tbody.querySelectorAll('.res-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        var resource = resourcesState.items.find(function (r) { return r.id === id; });
        if (resource) openResourceModal(resource);
      });
    });

    tbody.querySelectorAll('.res-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        deleteResource(id);
      });
    });
  }

  /** Open resource add/edit modal */
  function openResourceModal(resource) {
    resourcesState.editing = resource || null;
    var isEdit = !!resource;

    /* Set modal title */
    $('resourceModalTitle').textContent = isEdit ? 'Edit Resource' : 'Add Resource';

    /* Populate fields */
    $('resTitle').value       = isEdit ? (resource.title || '') : '';
    $('resSubject').value     = isEdit ? (resource.subject || '') : '';
    $('resType').value        = isEdit ? (resource.resource_type || resource.type || '') : '';
    var examTagEl = $('resExamTag');
    var savedTags = isEdit ? (resource.exam_tag || '').split(',').map(function(t){ return t.trim(); }) : [];
    Array.from(examTagEl.options).forEach(function(opt){ opt.selected = savedTags.indexOf(opt.value) !== -1; });
    $('resDescription').value = isEdit ? (resource.description || '') : '';
    $('resVisible').checked   = isEdit ? !!resource.is_visible : true;

    /* File size (read-only, edit mode only) */
    var fsGroup = $('resFileSizeGroup');
    if (isEdit && resource.file_size) {
      $('resFileSize').value = resource.file_size;
      if (fsGroup) fsGroup.style.display = 'block';
    } else {
      if (fsGroup) fsGroup.style.display = 'none';
    }

    /* PDF field hint: required for new, optional for edit */
    var pdfReq  = $('resPdfRequired');
    var pdfHint = $('resPdfHint');
    if (pdfReq)  pdfReq.style.display  = isEdit ? 'none' : 'inline';
    if (pdfHint) pdfHint.style.display = isEdit ? 'block' : 'none';

    /* Clear file input display */
    var pdfSel = $('resPdfSelected');
    if (pdfSel) { pdfSel.textContent = ''; pdfSel.style.display = 'none'; }
    $('resPdfFile').value = '';

    openModal('resourceModal');
  }

  /** Save resource (POST new or PUT edit) */
  function saveResource() {
    var title   = $('resTitle').value.trim();
    var subject = $('resSubject').value;
    var type    = $('resType').value;
    var file    = $('resPdfFile').files[0];
    var isEdit  = !!resourcesState.editing;

    if (!title)   { showToast('Title is required.', 'error'); return; }
    if (!subject) { showToast('Subject is required.', 'error'); return; }
    if (!type)    { showToast('Resource type is required.', 'error'); return; }
    if (!isEdit && !file) { showToast('PDF file is required.', 'error'); return; }

    var fd = new FormData();
    fd.append('title',         title);
    fd.append('subject',       subject);
    fd.append('resource_type', type);
    fd.append('exam_tag',      Array.from($('resExamTag').selectedOptions).map(function(o){ return o.value; }).join(','));
    fd.append('description',   $('resDescription').value.trim());
    fd.append('is_visible',    $('resVisible').checked ? 'true' : 'false');

    /* Only attach file if one was selected */
    if (file) {
      fd.append('file', file);
    }

    var method = isEdit ? 'PUT' : 'POST';
    var path   = isEdit ? '/api/resources/' + resourcesState.editing.id : '/api/resources';

    var btn = $('btnSaveResource');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    adminFetch(method, path, fd).then(function () {
      showToast(isEdit ? 'Resource updated.' : 'Resource added.', 'success');
      closeModal('resourceModal');
      loadResources();
    }).catch(function (err) {
      showToast(err.message, 'error');
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save Resource'; }
    });
  }

  /** Delete a resource by ID */
  function deleteResource(id) {
    var resource = resourcesState.items.find(function (r) { return r.id === id; });
    var name     = resource ? resource.title : 'this resource';

    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;

    adminFetch('DELETE', '/api/resources/' + id).then(function () {
      showToast('Resource deleted.', 'success');
      loadResources();
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  }

  /** Bind add resource button + search */
  function bindResourcesSection() {
    var addBtn = $('btnAddResource');
    if (addBtn) {
      addBtn.addEventListener('click', function () { openResourceModal(null); });
    }

    var saveBtn = $('btnSaveResource');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveResource);
    }

    /* Live search filter */
    var searchEl = $('resourceSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        var query = this.value.toLowerCase().trim();
        var filtered = query
          ? resourcesState.items.filter(function (r) {
              return (r.title || '').toLowerCase().includes(query) ||
                     (r.subject || '').toLowerCase().includes(query) ||
                     (r.resource_type || '').toLowerCase().includes(query);
            })
          : resourcesState.items;
        renderResourcesTable(filtered);
      });
    }

    /* File selected display */
    var pdfInput = $('resPdfFile');
    if (pdfInput) {
      pdfInput.addEventListener('change', function () {
        var sel = $('resPdfSelected');
        if (!sel) return;
        if (this.files && this.files[0]) {
          sel.textContent = this.files[0].name;
          sel.style.display = 'block';
        } else {
          sel.style.display = 'none';
        }
      });
    }
  }

  /* ══════════════════════════════════════════════
     SECTION: BLOG
     ══════════════════════════════════════════════ */

  var quillInstance = null;

  var blogState = {
    items:   [],
    editing: null
  };

  var blogCategoryLabels = {
    'exam-updates':   'Exam Updates',
    'subject-tips':   'Subject Tips',
    'strategy':       'Strategy',
    'student-stories':'Student Stories',
    'personal-notes': 'Personal Notes'
  };

  /** Load all blog posts from API */
  function loadBlog() {
    var tbody = $('blogTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5"><div class="admin-table-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></td></tr>';

    var catFilter = $('blogCategoryFilter') ? $('blogCategoryFilter').value : '';
    var path      = '/api/blog/admin/all' + (catFilter ? '?category=' + encodeURIComponent(catFilter) : '');

    adminFetch('GET', path).then(function (data) {
      blogState.items = Array.isArray(data) ? data : (data.posts || data.data || []);
      renderBlogTable(blogState.items);
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="admin-table-empty"><i class="fas fa-triangle-exclamation"></i><p>' + escapeHtml(err.message) + '</p></div></td></tr>';
    });
  }

  /** Render blog table body */
  function renderBlogTable(items) {
    var tbody = $('blogTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="admin-table-empty"><i class="fas fa-pen-to-square"></i><p>No posts found.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function (p) {
      var status    = p.is_published ? '<span class="badge badge-published"><i class="fas fa-circle-dot"></i>Published</span>' : '<span class="badge badge-draft"><i class="fas fa-clock"></i>Draft</span>';
      var catLabel  = blogCategoryLabels[p.category] || escapeHtml(p.category) || ' - ';
      var dateStr   = fmtDate(p.published_at || p.created_at || p.createdAt);

      return (
        '<tr data-id="' + p.id + '">' +
          '<td><span class="cell-truncate" style="max-width:260px;display:block;" title="' + escapeHtml(p.title) + '">' + escapeHtml(p.title) + '</span></td>' +
          '<td><span class="text-sm">' + catLabel + '</span></td>' +
          '<td>' + status + '</td>' +
          '<td><span class="text-sm text-muted">' + dateStr + '</span></td>' +
          '<td class="col-actions">' +
            '<button class="btn-icon primary btn-admin-sm blog-edit-btn" data-id="' + p.id + '" title="Edit" aria-label="Edit ' + escapeHtml(p.title) + '">' +
              '<i class="fas fa-pen"></i>' +
            '</button>' +
            ' ' +
            '<button class="btn-icon danger btn-admin-sm blog-delete-btn" data-id="' + p.id + '" title="Delete" aria-label="Delete ' + escapeHtml(p.title) + '">' +
              '<i class="fas fa-trash"></i>' +
            '</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    tbody.querySelectorAll('.blog-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id   = this.getAttribute('data-id');
        var post = blogState.items.find(function (p) { return String(p.id) === id; });
        if (post) openBlogModal(post);
      });
    });

    tbody.querySelectorAll('.blog-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        deleteBlog(id);
      });
    });
  }

  /** Open blog add/edit modal, initialise Quill */
  function openBlogModal(post) {
    blogState.editing = post || null;
    var isEdit = !!post;

    $('blogModalTitle').textContent  = isEdit ? 'Edit Post' : 'New Blog Post';
    $('blogTitle').value             = isEdit ? (post.title || '') : '';
    $('blogSlug').value              = isEdit ? (post.slug  || '') : '';
    $('slugPreview').textContent     = isEdit ? (post.slug  || ' - ') : ' - ';
    $('blogCategory').value          = isEdit ? (post.category || '') : '';
    $('blogExcerpt').value           = isEdit ? (post.excerpt || '') : '';
    $('blogPdfUrl').value            = isEdit ? (post.pdf_url || '') : '';
    $('blogPublished').checked       = isEdit ? !!post.is_published : false;

    var coverSel = $('blogCoverSelected');
    if (coverSel) { coverSel.textContent = ''; coverSel.style.display = 'none'; }
    $('blogCover').value = '';

    openModal('blogModal');

    /* Init or re-init Quill after modal is visible */
    setTimeout(function () {
      var editorEl = $('quillEditor');
      if (!editorEl) return;

      /* Destroy previous instance if exists */
      if (quillInstance) {
        try { editorEl.innerHTML = ''; } catch (e) {}
      }

      quillInstance = new Quill('#quillEditor', {
        theme:   'snow',
        placeholder: 'Write your post content here…',
        modules: {
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'],
            ['clean']
          ]
        }
      });

      /* Set existing content on edit */
      if (isEdit && post.content) {
        quillInstance.root.innerHTML = post.content;
      }
    }, 80);
  }

  /** Save blog post (POST or PUT with FormData) */
  function saveBlog() {
    var title     = $('blogTitle').value.trim();
    var slug      = $('blogSlug').value.trim();
    var category  = $('blogCategory').value;
    var content   = quillInstance ? quillInstance.root.innerHTML : '';
    var isEdit    = !!blogState.editing;
    var coverFile = $('blogCover').files[0];

    if (!title)    { showToast('Title is required.', 'error'); return; }
    if (!slug)     { showToast('Slug is required.', 'error'); return; }
    if (!category) { showToast('Category is required.', 'error'); return; }
    if (!content || content === '<p><br></p>') { showToast('Content cannot be empty.', 'error'); return; }

    var fd = new FormData();
    fd.append('title',        title);
    fd.append('slug',         slug);
    fd.append('category',     category);
    fd.append('excerpt',      $('blogExcerpt').value.trim());
    fd.append('pdf_url',      $('blogPdfUrl').value.trim());
    fd.append('content',      content);
    fd.append('is_published', $('blogPublished').checked ? 'true' : 'false');

    if (coverFile) {
      fd.append('cover_image', coverFile);
    }

    var method = isEdit ? 'PUT' : 'POST';
    var path   = isEdit ? '/api/blog/' + blogState.editing.id : '/api/blog';

    var btn = $('btnSaveBlog');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    adminFetch(method, path, fd).then(function () {
      showToast(isEdit ? 'Post updated.' : 'Post published.', 'success');
      closeModal('blogModal');
      loadBlog();
    }).catch(function (err) {
      showToast(err.message, 'error');
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save Post'; }
    });
  }

  /** Delete a blog post by ID */
  function deleteBlog(id) {
    var post = blogState.items.find(function (p) { return String(p.id) === id; });
    var name = post ? post.title : 'this post';

    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;

    adminFetch('DELETE', '/api/blog/' + id).then(function () {
      showToast('Post deleted.', 'success');
      loadBlog();
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  }

  /** Bind blog section controls */
  function bindBlogSection() {
    var addBtn = $('btnAddBlog');
    if (addBtn) {
      addBtn.addEventListener('click', function () { openBlogModal(null); });
    }

    var saveBtn = $('btnSaveBlog');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveBlog);
    }

    /* Auto-generate slug from title */
    var titleInput = $('blogTitle');
    var slugInput  = $('blogSlug');
    var slugPrev   = $('slugPreview');

    if (titleInput && slugInput) {
      titleInput.addEventListener('input', function () {
        /* Only auto-generate if not in edit mode or slug is empty */
        if (!blogState.editing || !slugInput.value.trim()) {
          var s = autoSlug(this.value);
          slugInput.value = s;
          if (slugPrev) slugPrev.textContent = s || ' - ';
        }
      });

      slugInput.addEventListener('input', function () {
        if (slugPrev) slugPrev.textContent = this.value.trim() || ' - ';
      });
    }

    /* Category filter */
    var catFilter = $('blogCategoryFilter');
    if (catFilter) {
      catFilter.addEventListener('change', loadBlog);
    }

    /* Cover image display */
    var coverInput = $('blogCover');
    if (coverInput) {
      coverInput.addEventListener('change', function () {
        var sel = $('blogCoverSelected');
        if (!sel) return;
        if (this.files && this.files[0]) {
          sel.textContent = this.files[0].name;
          sel.style.display = 'block';
        } else {
          sel.style.display = 'none';
        }
      });
    }
  }

  /* ══════════════════════════════════════════════
     SECTION: TESTIMONIALS
     ══════════════════════════════════════════════ */

  var testiState = {
    items:   [],
    editing: null
  };

  /** Load all testimonials */
  function loadTestimonials() {
    var tbody = $('testiTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7"><div class="admin-table-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></td></tr>';

    adminFetch('GET', '/api/testimonials/admin/all').then(function (data) {
      testiState.items = Array.isArray(data) ? data : (data.testimonials || data.data || []);
      renderTestiTable(testiState.items);
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="admin-table-empty"><i class="fas fa-triangle-exclamation"></i><p>' + escapeHtml(err.message) + '</p></div></td></tr>';
    });
  }

  /** Render testimonials table body */
  function renderTestiTable(items) {
    var tbody = $('testiTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="admin-table-empty"><i class="fas fa-star"></i><p>No testimonials found.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function (t) {
      return (
        '<tr data-id="' + t.id + '">' +
          '<td><span class="fw-600">' + escapeHtml(t.student_name || t.name || ' - ') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(t.exam_type || t.exam || ' - ') + '</span></td>' +
          '<td><span class="text-sm text-muted">' + escapeHtml(String(t.exam_year || ' - ')) + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(t.rank_or_result || t.rank || ' - ') + '</span></td>' +
          '<td>' + (t.is_featured ? '<span class="badge badge-featured"><i class="fas fa-star"></i>Yes</span>' : '<span class="text-muted text-sm"> - </span>') + '</td>' +
          '<td>' + (t.is_visible ? '<span class="badge badge-visible"><i class="fas fa-eye"></i>Yes</span>' : '<span class="badge badge-hidden"><i class="fas fa-eye-slash"></i>No</span>') + '</td>' +
          '<td class="col-actions">' +
            '<button class="btn-icon primary btn-admin-sm testi-edit-btn" data-id="' + t.id + '" title="Edit" aria-label="Edit testimonial">' +
              '<i class="fas fa-pen"></i>' +
            '</button>' +
            ' ' +
            '<button class="btn-icon danger btn-admin-sm testi-delete-btn" data-id="' + t.id + '" title="Delete" aria-label="Delete testimonial">' +
              '<i class="fas fa-trash"></i>' +
            '</button>' +
          '</td>' +
        '</tr>'
      );
    }).join('');

    tbody.querySelectorAll('.testi-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id   = this.getAttribute('data-id');
        var tsti = testiState.items.find(function (t) { return t.id === id; });
        if (tsti) openTestiModal(tsti);
      });
    });

    tbody.querySelectorAll('.testi-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        deleteTesti(id);
      });
    });
  }

  /** Open testimonial add/edit modal */
  function openTestiModal(testi) {
    testiState.editing = testi || null;
    var isEdit = !!testi;

    $('testiModalTitle').textContent = isEdit ? 'Edit Testimonial' : 'Add Testimonial';
    $('testiName').value             = isEdit ? (testi.student_name || testi.name || '') : '';
    $('testiExam').value             = isEdit ? (testi.exam_type || testi.exam || '') : '';
    $('testiYear').value             = isEdit ? (testi.exam_year || '') : '';
    $('testiRank').value             = isEdit ? (testi.rank_or_result || testi.rank || '') : '';
    $('testiQuote').value            = isEdit ? (testi.quote || '') : '';
    $('testiFeatured').checked       = isEdit ? !!testi.is_featured : false;
    $('testiVisible').checked        = isEdit ? !!testi.is_visible : true;

    var photoSel  = $('testiPhotoSelected');
    var photoHint = $('testiPhotoHint');
    if (photoSel)  { photoSel.textContent = ''; photoSel.style.display = 'none'; }
    if (photoHint) photoHint.style.display = isEdit ? 'block' : 'none';
    $('testiPhoto').value = '';

    openModal('testiModal');
  }

  /** Save testimonial */
  function saveTesti() {
    var name    = $('testiName').value.trim();
    var exam    = $('testiExam').value;
    var rank    = $('testiRank').value.trim();
    var quote   = $('testiQuote').value.trim();
    var isEdit  = !!testiState.editing;
    var photo   = $('testiPhoto').files[0];

    if (!name)  { showToast('Student name is required.', 'error'); return; }
    if (!exam)  { showToast('Exam type is required.', 'error'); return; }
    if (!rank)  { showToast('Rank / Result is required.', 'error'); return; }
    if (!quote) { showToast('Quote is required.', 'error'); return; }

    var fd = new FormData();
    fd.append('student_name',   name);
    fd.append('exam_type',      exam);
    fd.append('exam_year',      $('testiYear').value.trim());
    fd.append('rank_or_result', rank);
    fd.append('quote',          quote);
    fd.append('is_featured',    $('testiFeatured').checked ? 'true' : 'false');
    fd.append('is_visible',     $('testiVisible').checked  ? 'true' : 'false');

    if (photo) {
      fd.append('photo', photo);
    }

    var method = isEdit ? 'PUT' : 'POST';
    var path   = isEdit ? '/api/testimonials/' + testiState.editing.id : '/api/testimonials';

    var btn = $('btnSaveTesti');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    adminFetch(method, path, fd).then(function () {
      showToast(isEdit ? 'Testimonial updated.' : 'Testimonial added.', 'success');
      closeModal('testiModal');
      loadTestimonials();
    }).catch(function (err) {
      showToast(err.message, 'error');
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Save Testimonial'; }
    });
  }

  /** Delete a testimonial */
  function deleteTesti(id) {
    var testi = testiState.items.find(function (t) { return t.id === id; });
    var name  = testi ? (testi.student_name || testi.name) : 'this testimonial';

    if (!confirm('Delete testimonial by "' + name + '"? This cannot be undone.')) return;

    adminFetch('DELETE', '/api/testimonials/' + id).then(function () {
      showToast('Testimonial deleted.', 'success');
      loadTestimonials();
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  }

  /** Bind testimonials section controls */
  function bindTestimonialsSection() {
    var addBtn = $('btnAddTesti');
    if (addBtn) {
      addBtn.addEventListener('click', function () { openTestiModal(null); });
    }

    var saveBtn = $('btnSaveTesti');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveTesti);
    }

    var photoInput = $('testiPhoto');
    if (photoInput) {
      photoInput.addEventListener('change', function () {
        var sel = $('testiPhotoSelected');
        if (!sel) return;
        if (this.files && this.files[0]) {
          sel.textContent    = this.files[0].name;
          sel.style.display  = 'block';
        } else {
          sel.style.display = 'none';
        }
      });
    }
  }

  /* ══════════════════════════════════════════════
     SECTION: MESSAGES
     ══════════════════════════════════════════════ */

  var messagesState = {
    items:  [],
    filter: 'all'   /* 'all' | 'unread' */
  };

  /** Load messages with current filter applied */
  function loadMessages() {
    var container = $('messagesContainer');
    if (!container) return;

    container.innerHTML = '<div class="text-muted text-sm" style="padding:20px 0;"><i class="fas fa-spinner fa-spin"></i> Loading messages…</div>';

    var path = '/api/contact' + (messagesState.filter === 'unread' ? '?unread=true' : '');

    adminFetch('GET', path).then(function (data) {
      messagesState.items = Array.isArray(data) ? data : (data.messages || data.data || []);
      renderMessages(messagesState.items);

      /* Update unread badge */
      var unreadCount = messagesState.items.filter(function (m) { return !m.is_read; }).length;
      updateMessagesBadge(unreadCount);
    }).catch(function (err) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><p>' + escapeHtml(err.message) + '</p></div>';
    });
  }

  /** Render message cards */
  function renderMessages(items) {
    var container = $('messagesContainer');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><h3>No messages</h3><p>No messages found for the current filter.</p></div>';
      return;
    }

    var html = '<div class="messages-grid">';

    items.forEach(function (m) {
      var id       = m.id;
      var name     = escapeHtml(m.name || m.full_name || 'Anonymous');
      var email    = escapeHtml(m.email || '');
      var subject  = escapeHtml(m.subject || '');
      var msg      = m.message || '';
      var preview  = escapeHtml(msg.slice(0, 120)) + (msg.length > 120 ? '…' : '');
      var fullMsg  = escapeHtml(msg);
      var date     = fmtDate(m.created_at || m.createdAt);
      var isUnread = !m.is_read;
      var cardCls  = 'message-card ' + (isUnread ? 'unread' : 'read');
      var readBadge = isUnread
        ? '<span class="badge badge-unread"><i class="fas fa-circle" style="font-size:7px;"></i>Unread</span>'
        : '<span class="badge badge-read"><i class="fas fa-check"></i>Read</span>';

      html +=
        '<div class="' + cardCls + '" id="msg-' + id + '" data-id="' + id + '">' +
          '<div class="message-card-header">' +
            '<div class="message-card-meta">' +
              '<div class="message-card-name">' + name + '</div>' +
              '<div class="message-card-email">' + email + '</div>' +
            '</div>' +
            '<div class="message-card-actions">' +
              readBadge +
              (isUnread ? '<button class="btn-icon primary btn-admin-sm msg-mark-read-btn" data-id="' + id + '" title="Mark as read" aria-label="Mark as read"><i class="fas fa-envelope-open"></i></button>' : '') +
              '<button class="btn-icon danger btn-admin-sm msg-delete-btn" data-id="' + id + '" title="Delete" aria-label="Delete message"><i class="fas fa-trash"></i></button>' +
            '</div>' +
          '</div>' +
          (subject ? '<div class="message-card-subject">' + subject + '</div>' : '') +
          '<div class="message-card-preview">' + preview + '</div>' +
          '<div class="message-card-full" id="msgfull-' + id + '">' + fullMsg + '</div>' +
          '<div class="message-card-date"><i class="fas fa-clock" style="font-size:10px;"></i>' + date + '</div>' +
        '</div>';
    });

    html += '</div>';
    container.innerHTML = html;

    /* Bind card click (expand/collapse) */
    container.querySelectorAll('.message-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        /* Don't expand on button click */
        if (e.target.closest('button')) return;
        this.classList.toggle('expanded');
      });
    });

    /* Bind mark-read buttons */
    container.querySelectorAll('.msg-mark-read-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        markRead(id);
      });
    });

    /* Bind delete buttons */
    container.querySelectorAll('.msg-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = this.getAttribute('data-id');
        deleteMessage(id);
      });
    });
  }

  /** Mark a message as read */
  function markRead(id) {
    adminFetch('PUT', '/api/contact/' + id + '/read').then(function () {
      /* Update state locally */
      var msg = messagesState.items.find(function (m) { return m.id === id; });
      if (msg) msg.is_read = true;
      /* Reload to refresh badges */
      loadMessages();
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  }

  /** Delete a message */
  function deleteMessage(id) {
    if (!confirm('Delete this message? This cannot be undone.')) return;

    adminFetch('DELETE', '/api/contact/' + id).then(function () {
      showToast('Message deleted.', 'success');
      loadMessages();
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  }

  /** Bind messages section controls */
  function bindMessagesSection() {
    /* Filter tabs */
    document.querySelectorAll('.filter-tab[data-filter]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        /* Update active tab */
        document.querySelectorAll('.filter-tab[data-filter]').forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');

        messagesState.filter = this.getAttribute('data-filter');
        loadMessages();
      });
    });
  }

  /* ══════════════════════════════════════════════
     SECTION: LEARNERS
     ══════════════════════════════════════════════ */

  var learnersState = {
    items: []
  };

  /** Load learners from API */
  function loadLearners() {
    var tbody = $('learnersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8"><div class="admin-table-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></td></tr>';

    adminFetch('GET', '/api/learners').then(function (data) {
      learnersState.items = Array.isArray(data) ? data : (data.learners || data.data || []);
      applyLearnerPeriodFilter();
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="admin-table-empty"><i class="fas fa-triangle-exclamation"></i><p>' + escapeHtml(err.message) + '</p></div></td></tr>';
    });
  }

  /** Render learners table body */
  function renderLearnersTable(items) {
    var tbody = $('learnersTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="admin-table-empty"><i class="fas fa-users"></i><p>No learners found.</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function (l) {
      var isActive = l.is_active !== undefined ? l.is_active : true;
      var lastLogin = (l.last_login || l.lastLogin) ? fmtDate(l.last_login || l.lastLogin) : 'Never';
      var paidCount = parseInt(l.paid_count || 0, 10);
      var statusCell;
      if (paidCount > 0) {
        var prog = l.paid_program || '';
        var slug = l.paid_slug || '';
        var tier = slug.includes('degree') ? 'Degree' : slug.includes('diploma') ? 'Diploma' : '';
        var label = tier ? prog.replace('RSSB JE 2026 - Jaspal Sir Ki Test Series Offline', 'RSSB JE Test Series') + ' [' + tier + ']' : prog;
        statusCell = '<span style="display:inline-block;background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">Paid</span>' +
          '<div style="font-size:11px;color:#6b7280;margin-top:3px;max-width:140px;line-height:1.3;">' + escapeHtml(label) + '</div>';
      } else {
        statusCell = '<span style="display:inline-block;background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;">Free</span>';
      }
      return (
        '<tr data-id="' + l.id + '">' +
          '<td><span class="fw-600">' + escapeHtml(l.name || l.full_name || '-') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(l.email || '-') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(l.phone || '-') + '</span></td>' +
          '<td>' + statusCell + '</td>' +
          '<td><span class="text-sm">' + escapeHtml(l.target_exam || l.exam_target || l.exam || '-') + '</span></td>' +
          '<td><span class="text-sm text-muted">' + fmtDate(l.created_at || l.createdAt) + '</span></td>' +
          '<td>' + (isActive ? '<span class="badge badge-visible">Active</span>' : '<span class="badge badge-hidden">Inactive</span>') + '</td>' +
          '<td><button type="button" class="btn-admin-secondary btn-edit-learner-email" data-learner-id="' + l.id + '" data-learner-email="' + escapeHtml(l.email || '') + '" data-learner-name="' + escapeHtml(l.name || l.full_name || '') + '" style="padding:4px 10px;font-size:12px;"><i class="fas fa-pen"></i> Edit Email</button></td>' +
        '</tr>'
      );
    }).join('');
  }

  /**
   * Export learners as CSV and trigger download.
   * Builds CSV from learnersState.items in the browser.
   */
  function exportLearnersCSV() {
    var items = learnersState.items;

    if (!items || items.length === 0) {
      showToast('No learner data to export.', 'error');
      return;
    }

    var headers = ['Name', 'Email', 'Phone', 'Status', 'Program', 'Exam', 'Joined', 'Active'];

    var rows = items.map(function (l) {
      var status = l.paid_program ? 'Paid' : 'Free';
      var program = l.paid_program || '';
      return [
        csvEscape(l.name || ''),
        csvEscape(l.email || ''),
        csvEscape(l.phone || ''),
        csvEscape(status),
        csvEscape(program),
        csvEscape(l.target_exam || ''),
        csvEscape(fmtDate(l.created_at)),
        (l.is_active !== false) ? 'Yes' : 'No'
      ].join(',');
    });

    var csv = [headers.join(',')].concat(rows).join('\r\n');

    /* Trigger download */
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'learners_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('CSV exported (' + items.length + ' learners).', 'success');
  }

  /** Escape a value for CSV (wrap in quotes if needed) */
  function csvEscape(val) {
    var s = String(val || '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /** Filter learners by period based on created_at */
  function applyLearnerPeriodFilter() {
    var activeBtn = document.querySelector('#learnerPeriodTabs .filter-tab.active');
    var period = activeBtn ? activeBtn.getAttribute('data-lperiod') : 'all';
    var now = new Date();
    var filtered = learnersState.items.filter(function (l) {
      if (period === 'all') return true;
      var d = new Date(l.created_at || l.createdAt);
      if (isNaN(d)) return false;
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (period === 'today') return d >= todayStart;
      if (period === 'yesterday') {
        var yStart = new Date(todayStart); yStart.setDate(yStart.getDate() - 1);
        return d >= yStart && d < todayStart;
      }
      if (period === '3days') { var t3 = new Date(todayStart); t3.setDate(t3.getDate() - 3); return d >= t3; }
      if (period === 'week') { var tw = new Date(todayStart); tw.setDate(tw.getDate() - 7); return d >= tw; }
      return true;
    });
    /* Also apply search filter if active */
    var searchEl = $('learnerSearch');
    var query = searchEl ? searchEl.value.toLowerCase().trim() : '';
    if (query) {
      filtered = filtered.filter(function (l) {
        return (l.name || l.full_name || '').toLowerCase().includes(query) ||
               (l.email || '').toLowerCase().includes(query) ||
               (l.phone || '').toLowerCase().includes(query) ||
               (l.exam_target || l.exam || '').toLowerCase().includes(query);
      });
    }
    renderLearnersTable(filtered);
  }

  /** Bind learners section controls */
  function bindLearnersSection() {
    var exportBtn = $('btnExportCSV');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportLearnersCSV);
    }

    /* Period filter tabs */
    var periodTabs = document.querySelectorAll('#learnerPeriodTabs .filter-tab');
    periodTabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        periodTabs.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        applyLearnerPeriodFilter();
      });
    });

    /* Live search filter */
    var searchEl = $('learnerSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        applyLearnerPeriodFilter();
      });
    }

    /* Edit-email button (event delegation - table body re-renders on filter) */
    var tbody = $('learnersTableBody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('.btn-edit-learner-email');
        if (!btn) return;
        $('editEmailLearnerId').value = btn.getAttribute('data-learner-id');
        $('editEmailLearnerName').textContent = btn.getAttribute('data-learner-name') || '-';
        $('editEmailCurrent').textContent = btn.getAttribute('data-learner-email') || '-';
        $('editEmailNew').value = '';
        $('editEmailMsg').textContent = '';
        openModal('editEmailModal');
      });
    }

    var saveEmailBtn = $('btnSaveLearnerEmail');
    if (saveEmailBtn) {
      saveEmailBtn.addEventListener('click', function () {
        var id       = $('editEmailLearnerId').value;
        var newEmail = $('editEmailNew').value.trim();
        var msgEl    = $('editEmailMsg');
        msgEl.textContent = '';
        msgEl.style.color = '#dc2626';
        if (!newEmail) { msgEl.textContent = 'Please enter a new email address.'; return; }

        saveEmailBtn.disabled = true;
        adminFetch('PATCH', '/api/learners/' + id + '/email', { email: newEmail }).then(function () {
          closeModal('editEmailModal');
          showToast('Email updated.', 'success');
          loadLearners();
        }).catch(function (err) {
          msgEl.textContent = err.message;
        }).finally(function () {
          saveEmailBtn.disabled = false;
        });
      });
    }
  }

  /* ══════════════════════════════════════════════
     INITIALISATION
     ══════════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function () {

    /* ── Auth guard ────────────────────────────── */
    if (!getToken()) {
      location.href = '/admin/login';
      return;
    }

    /* ── Bind all controls ─────────────────────── */
    bindSidebarNav();
    bindSidebarToggle();
    bindTopbarLogout();
    bindModalCloseButtons();
    bindResourcesSection();
    bindBlogSection();
    bindTestimonialsSection();
    bindMessagesSection();
    bindLearnersSection();
    bindPaidLearnersSection();

    /* ── Show initial section ──────────────────── */
    showSection('dashboard');

    bindBizSections();
  });

  /* ============================================================
     BUSINESS SECTIONS  -  programs, enrollments, leads, banners, analytics
     ============================================================ */
  function e(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function inr(n){ return '₹' + Number(n||0).toLocaleString('en-IN'); }
  function inrIndian(n){ return Number(n||0).toLocaleString('en-IN'); }
  /* (uses the existing top-level fmtDate helper) */

  var STATUS_LABELS = { enrolling:'Enrolling', coming_soon:'Coming Soon', closed:'Closed' };

  /* ── PROGRAMS ── */
  function loadPrograms() {
    var body = document.getElementById('programsBody');
    adminFetch('GET', '/api/programs/admin/all').then(function(d){
      var ps = d.programs || [];
      if (!ps.length) { body.innerHTML = '<p class="admin-empty">No programs yet.</p>'; return; }
      var rows = ps.map(function(p){
        return '<tr>' +
          '<td><strong>'+e(p.title)+'</strong><br><span style="color:#9999b0;font-size:12px;">'+e(p.slug)+'</span></td>' +
          '<td>'+e(p.category)+'</td>' +
          '<td>'+(p.price?inr(p.price):'-')+(p.mrp?' <s style="color:#aaa">'+inr(p.mrp)+'</s>':'')+'</td>' +
          '<td><span class="admin-badge admin-badge--'+(p.status==='enrolling'?'green':p.status==='coming_soon'?'orange':'grey')+'">'+(STATUS_LABELS[p.status]||p.status)+'</span></td>' +
          '<td><label class="admin-switch"><input type="checkbox" data-prog-vis="'+p.id+'" '+(p.is_visible?'checked':'')+'><span></span></label></td>' +
          '<td><button class="btn btn-sm" data-prog-edit="'+p.id+'">Edit</button> <button class="btn btn-sm btn-ghost" data-prog-schedule="'+e(p.slug)+'" data-prog-title="'+e(p.title)+'">Schedule</button> <button class="btn btn-sm btn-ghost" data-prog-content="'+e(p.slug)+'" data-prog-title="'+e(p.title)+'">Page Content</button> <button class="btn btn-sm btn-ghost" data-prog-del="'+p.id+'">Delete</button></td>' +
          '</tr>';
      }).join('');
      body.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Program</th><th>Type</th><th>Price</th><th>Status</th><th>Visible</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      body._data = ps;
      bindProgramRowActions(ps);
    }).catch(function(err){ body.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  function bindProgramRowActions(ps){
    document.querySelectorAll('[data-prog-vis]').forEach(function(cb){
      cb.addEventListener('change', function(){
        adminFetch('PATCH','/api/programs/'+cb.getAttribute('data-prog-vis')+'/visibility',{is_visible:cb.checked})
          .then(function(){ showToast('Visibility updated','success'); })
          .catch(function(e){ showToast(e.message,'error'); cb.checked=!cb.checked; });
      });
    });
    document.querySelectorAll('[data-prog-edit]').forEach(function(b){
      b.addEventListener('click', function(){ var p = ps.filter(function(x){return x.id==b.getAttribute('data-prog-edit');})[0]; openProgramModal(p); });
    });
    document.querySelectorAll('[data-prog-del]').forEach(function(b){
      b.addEventListener('click', function(){
        if (!confirm('Delete this program? This cannot be undone.')) return;
        adminFetch('DELETE','/api/programs/'+b.getAttribute('data-prog-del')).then(function(){ showToast('Deleted','success'); loadPrograms(); }).catch(function(e){ showToast(e.message,'error'); });
      });
    });
    document.querySelectorAll('[data-prog-schedule]').forEach(function(b){
      b.addEventListener('click', function(){
        var p = ps.filter(function(x){ return x.slug === b.getAttribute('data-prog-schedule'); })[0] || {};
        openScheduleModal(b.getAttribute('data-prog-schedule'), b.getAttribute('data-prog-title'), p.omr_categories || []);
      });
    });
    document.querySelectorAll('[data-prog-content]').forEach(function(b){
      b.addEventListener('click', function(){
        var p = ps.filter(function(x){ return x.slug === b.getAttribute('data-prog-content'); })[0] || {};
        openContentModal(b.getAttribute('data-prog-content'), b.getAttribute('data-prog-title'), p);
      });
    });
  }

  /* ── PROGRAM PAGE CONTENT ("Who Is This For" + FAQ) ──
     Free text, admin-authored - "Who Is This For" is one bullet per line;
     FAQ is Q:/A: blocks separated by a blank line. Both are optional and
     the generic detail page simply omits the section if empty. */
  function parseWhoFor(text){
    return text.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
  }
  function parseFaqs(text){
    var blocks = text.split(/\n\s*\n/);
    var faqs = [];
    blocks.forEach(function(block){
      var qMatch = block.match(/Q:\s*(.+)/i);
      var aMatch = block.match(/A:\s*([\s\S]+)/i);
      if (qMatch && aMatch) faqs.push({ question: qMatch[1].trim(), answer: aMatch[1].trim() });
    });
    return faqs;
  }
  function openContentModal(slug, title, p){
    p = p || {};
    var whoForText = (p.who_for || []).join('\n');
    var faqsText = (p.faqs || []).map(function(f){ return 'Q: ' + f.question + '\nA: ' + f.answer; }).join('\n\n');
    document.getElementById('scheduleModalTitle').textContent = 'Page Content - ' + title;
    document.getElementById('scheduleModalBody').innerHTML =
      '<label class="admin-field"><span>Who Is This For (one bullet per line, optional)</span></label>' +
      '<textarea class="admin-input" id="pc_whofor" rows="4" style="width:100%;">'+e(whoForText)+'</textarea>' +
      '<label class="admin-field" style="margin-top:12px;"><span>FAQ (optional)</span></label>' +
      '<div class="admin-form-hint" style="margin-top:-6px;">One Q&amp;A per block, separated by a blank line:<br><code>Q: Your question&lt;br&gt;A: Your answer</code></div>' +
      '<textarea class="admin-input" id="pc_faqs" rows="8" style="width:100%;font-family:monospace;font-size:12.5px;">'+e(faqsText)+'</textarea>' +
      '<button class="btn" id="pc_save" style="margin-top:12px;">Save Page Content</button>';
    document.getElementById('scheduleModal').style.display = 'flex';
    document.getElementById('pc_save').onclick = function(){
      var payload = {
        who_for: parseWhoFor(document.getElementById('pc_whofor').value),
        faqs: parseFaqs(document.getElementById('pc_faqs').value),
      };
      adminFetch('PUT', '/api/programs/' + encodeURIComponent(slug) + '/content', payload)
        .then(function(d){ showToast(d.message || 'Saved', 'success'); document.getElementById('scheduleModal').style.display = 'none'; })
        .catch(function(e){ showToast(e.message, 'error'); });
    };
  }

  /* ── PROGRAM SCHEDULE (bulk upload + per-test assets) ──
     Paste one test per line as "Test Number | Date | Syllabus | Questions"
     (Questions optional) - upserts by test number (see backend comment on
     POST .../schedule/bulk), so uploaded assets on an existing test number
     survive a re-paste.
     Used by frontend/programs/view/index.html's generic detail page; the
     13 hand-built program pages have their own hardcoded schedule tables
     and don't read from this.

     Each row also carries the self-serve learner-facing assets (question
     paper / blank OMR / solution PDFs, uploaded straight to R2), the
     release/upload-deadline dates that gate them, and - for OMR-course
     tests only - a link to the omr_tests row that grades it. This is the
     admin side of the learner Profile > Purchased Programs > Schedule tab. */
  var ASSET_KINDS = [
    { kind: 'paper',      label: 'Question Paper', col: 'question_paper_url' },
    { kind: 'blank-omr',  label: 'Blank OMR',      col: 'blank_omr_url' },
    { kind: 'solution',   label: 'Solution',       col: 'solution_url' },
  ];

  /* Combo programs (RSSB Degree/Diploma, ESE Civil/General Studies) bundle
     two tracks under one program_slug - see server.js's category comment
     on program_schedule. Human-readable labels for known slugs, falling
     back to a title-cased version of the raw value for anything else. */
  var CATEGORY_LABELS = {
    'degree': 'Degree', 'diploma': 'Diploma',
    'civil': 'Civil (Paper 2)', 'general-studies': 'General Studies (Paper 1)',
  };
  function categoryLabel(cat){
    return CATEGORY_LABELS[cat] || cat.replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }

  /* Rounded pill buttons matching the site's brand style (e.g. the
     "Submit Referral Claim" button on Profile), used throughout the
     schedule modal instead of the plain bordered .btn/.btn-ghost boxes. */
  var PILL_VARIANTS = {
    solid:   'background:#0F766E;color:#fff;',
    dark:    'background:#1A1A2E;color:#fff;',
    outline: 'background:#f4f4f7;color:#444;',
    danger:  'background:transparent;color:#C81240;border:1px solid #C81240;',
  };
  function pillBtn(attrs, label, variant, extraStyle){
    return '<button '+attrs+' style="display:inline-block;border-radius:20px;padding:7px 16px;font-size:11.5px;font-weight:700;border:none;cursor:pointer;white-space:nowrap;'+(PILL_VARIANTS[variant]||PILL_VARIANTS.outline)+(extraStyle||'')+'">'+label+'</button>';
  }

  /* datetime-local inputs carry no timezone - the business runs on IST
     (UTC+5:30), so every gating date typed here must be sent with an
     explicit +05:30 offset, or Postgres's UTC session default silently
     shifts it 5.5 hours later than intended. isoToIstInput does the
     reverse for pre-filling the input when a row is reopened. */
  function istInputToIso(localStr){
    return localStr ? localStr + ':00+05:30' : null;
  }
  function isoToIstInput(iso){
    if (!iso) return '';
    var ist = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().slice(0, 16);
  }

  function uploadScheduleAsset(rowId, kind, slug, category){
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/pdf';
    input.onchange = function(){
      if (!input.files[0]) return;
      var fd = new FormData(); fd.append('file', input.files[0]);
      showToast('Uploading…', 'success');
      adminFetch('POST', '/api/programs/schedule/'+rowId+'/assets/'+kind, fd)
        .then(function(){ showToast('Uploaded', 'success'); loadScheduleRows(slug, category); })
        .catch(function(e){ showToast(e.message, 'error'); });
    };
    input.click();
  }

  /* No auto-grading: the deadline just opens/closes the upload window and
     gates when Solution unlocks. Admin reviews uploads manually via
     "View uploads" and posts ranks separately (e.g. on WhatsApp). */
  function openGatingPanel(row, slug, category){
    var panel = document.getElementById('sch_gating_'+row.id);
    if (!panel) return;
    panel.innerHTML =
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin:8px 0;padding:12px;background:rgba(0,0,0,.03);border-radius:8px;">' +
        '<label style="font-size:11.5px;">Paper release (IST)<br><input type="datetime-local" class="admin-input" id="gt_release_'+row.id+'" value="'+isoToIstInput(row.paper_release_at)+'"></label>' +
        '<label style="font-size:11.5px;">Upload deadline / solution unlock (IST)<br><input type="datetime-local" class="admin-input" id="gt_deadline_'+row.id+'" value="'+isoToIstInput(row.omr_upload_deadline)+'"></label>' +
        '<label style="font-size:11.5px;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="gt_requires_'+row.id+'" '+(row.requires_omr_upload?'checked':'')+'> Learners upload their answer sheet (photo/PDF) for this test</label>' +
        pillBtn('id="gt_save_'+row.id+'"', 'Save', 'solid') +
        (row.requires_omr_upload ? pillBtn('id="gt_uploads_'+row.id+'"', 'View uploads', 'outline') + pillBtn('id="gt_downloadall_'+row.id+'"', 'Download All', 'outline') : '') +
      '</div>' +
      '<div id="gt_uploads_list_'+row.id+'"></div>';

    document.getElementById('gt_save_'+row.id).onclick = function(){
      var requiresUpload = document.getElementById('gt_requires_'+row.id).checked;
      var deadlineLocal = document.getElementById('gt_deadline_'+row.id).value || null;
      if (requiresUpload && !deadlineLocal) { showToast('Upload deadline is required when self-serve upload is on', 'error'); return; }
      adminFetch('PUT', '/api/programs/schedule/'+row.id+'/gating', {
        paper_release_at: istInputToIso(document.getElementById('gt_release_'+row.id).value || null),
        omr_upload_deadline: istInputToIso(deadlineLocal),
        requires_omr_upload: requiresUpload,
      }).then(function(){ showToast('Saved', 'success'); loadScheduleRows(slug, category); })
        .catch(function(e){ showToast(e.message, 'error'); });
    };
    var uploadsBtn = document.getElementById('gt_uploads_'+row.id);
    if (uploadsBtn) {
      uploadsBtn.onclick = function(){
        var listEl = document.getElementById('gt_uploads_list_'+row.id);
        listEl.innerHTML = '<p class="admin-empty">Loading…</p>';
        adminFetch('GET', '/api/programs/schedule/'+row.id+'/uploads').then(function(d){
          var uploads = d.uploads || [];
          if (!uploads.length) { listEl.innerHTML = '<p class="admin-empty">No uploads yet.</p>'; return; }
          listEl.innerHTML = '<div class="admin-table-wrap" style="margin-top:8px;"><table class="admin-table"><thead><tr><th>Learner</th><th>Contact</th><th>Uploaded</th><th></th></tr></thead><tbody>' +
            uploads.map(function(u){
              return '<tr><td>'+e(u.learner_name||'-')+'</td><td>'+e(u.learner_email||u.learner_phone||'-')+'</td>' +
                '<td>'+new Date(u.uploaded_at).toLocaleString('en-IN')+'</td>' +
                '<td><a href="'+e(u.file_url)+'" target="_blank" rel="noopener">Download</a></td></tr>';
            }).join('') + '</tbody></table></div>';
        }).catch(function(e){ listEl.innerHTML = '<p class="admin-empty">'+e.message+'</p>'; });
      };
    }
    var downloadAllBtn = document.getElementById('gt_downloadall_'+row.id);
    if (downloadAllBtn) {
      downloadAllBtn.onclick = function(){
        var originalLabel = downloadAllBtn.textContent;
        downloadAllBtn.textContent = 'Zipping…';
        downloadAllBtn.disabled = true;
        fetch(API_BASE + '/api/programs/schedule/'+row.id+'/uploads/download-all', {
          headers: { 'Authorization': 'Bearer ' + getToken() }
        }).then(function(res){
          if (!res.ok) return res.json().then(function(d){ throw new Error(d.error || 'Download failed'); });
          return res.blob();
        }).then(function(blob){
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = 'test-'+row.id+'-uploads.zip';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('Downloaded successfully.', 'success');
        }).catch(function(e){ showToast(e.message || 'Download failed', 'error'); })
          .finally(function(){ downloadAllBtn.textContent = originalLabel; downloadAllBtn.disabled = false; });
      };
    }
  }

  function loadScheduleRows(slug, category){
    var listEl = document.getElementById('sch_list');
    adminFetch('GET', '/api/programs/'+encodeURIComponent(slug)+'/schedule/admin').then(function(d){
      var rows = (d.schedule || []).filter(function(r){ return (r.category||null) === (category||null); });
      if (!rows.length) { listEl.innerHTML = '<p class="admin-empty">No schedule yet - paste rows above, or use "Add one test".</p>'; return; }
      listEl.innerHTML = '<div class="admin-table-wrap" style="overflow-x:auto;"><table class="admin-table" style="min-width:640px;"><thead><tr><th>Test</th><th>Date</th><th style="min-width:160px;">Syllabus</th><th>Qs</th><th style="min-width:150px;">Assets</th><th style="min-width:100px;"></th></tr></thead><tbody>' +
        rows.map(function(r){
          var assetBtns = '<div style="display:flex;flex-direction:column;gap:5px;">' + ASSET_KINDS.map(function(a){
            var has = !!r[a.col];
            return pillBtn('data-asset-upload="'+r.id+'" data-asset-kind="'+a.kind+'"', (has?'&#10003; ':'+ ')+a.label, has?'solid':'outline', 'text-align:left;');
          }).join('') + '</div>';
          return '<tr><td>'+r.test_number+'</td><td>'+e(r.test_date||'-')+'</td><td>'+e(r.syllabus||'-')+'</td><td>'+(r.questions||'-')+'</td>' +
            '<td>'+assetBtns+'</td>' +
            '<td><div style="display:flex;flex-direction:column;gap:5px;">'+
              pillBtn('data-sch-configure="'+r.id+'"', 'Configure', 'dark') +
              pillBtn('data-sch-del="'+r.id+'"', 'Delete', 'danger') +
            '</div></td></tr>' +
            '<tr><td colspan="6"><div id="sch_gating_'+r.id+'"></div></td></tr>';
        }).join('') + '</tbody></table></div>';

      listEl.querySelectorAll('[data-asset-upload]').forEach(function(b){
        b.addEventListener('click', function(){ uploadScheduleAsset(b.getAttribute('data-asset-upload'), b.getAttribute('data-asset-kind'), slug, category); });
      });
      listEl.querySelectorAll('[data-sch-configure]').forEach(function(b){
        b.addEventListener('click', function(){
          var rowId = parseInt(b.getAttribute('data-sch-configure'), 10);
          var row = rows.filter(function(r){ return r.id === rowId; })[0];
          openGatingPanel(row, slug, category);
        });
      });
      listEl.querySelectorAll('[data-sch-del]').forEach(function(b){
        b.addEventListener('click', function(){
          adminFetch('DELETE', '/api/programs/'+encodeURIComponent(slug)+'/schedule/'+b.getAttribute('data-sch-del'))
            .then(function(){ showToast('Deleted','success'); loadScheduleRows(slug, category); }).catch(function(e){ showToast(e.message,'error'); });
        });
      });
    }).catch(function(err){ listEl.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }
  function renderScheduleForms(slug, category){
    document.getElementById('scheduleModalBody').innerHTML =
      (categoriesForModal.length ?
        '<div style="display:flex;gap:6px;margin-bottom:14px;">' +
          categoriesForModal.map(function(c){
            return pillBtn('data-sch-cat="'+e(c)+'"', categoryLabel(c), c===category?'dark':'outline');
          }).join('') +
        '</div>'
      : '') +
      '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;padding:10px;background:rgba(15,118,110,.06);border-radius:8px;">' +
        '<label style="font-size:11.5px;">Test no.<br><input type="number" class="admin-input" id="sch_add_num" style="width:80px;"></label>' +
        '<label style="font-size:11.5px;">Date<br><input class="admin-input" id="sch_add_date" placeholder="26 July 2026" style="width:140px;"></label>' +
        '<label style="font-size:11.5px;">Syllabus<br><input class="admin-input" id="sch_add_syllabus" style="width:220px;"></label>' +
        '<label style="font-size:11.5px;">Qs<br><input type="number" class="admin-input" id="sch_add_questions" style="width:70px;"></label>' +
        pillBtn('id="sch_add_btn"', 'Add one test', 'solid') +
      '</div>' +
      '<div class="admin-form-hint" style="margin-bottom:8px;">Or paste several at once, one per line: <code>Test Number | Date | Syllabus | Questions</code> (Questions is optional). Re-pasting the same test number updates that row (assets/settings are kept); a test number no longer in the paste is removed.'+(category?' Applies to the <strong>'+categoryLabel(category)+'</strong> track selected above.':'')+'</div>' +
      '<textarea class="admin-input" id="sch_paste" rows="6" style="width:100%;font-family:monospace;font-size:12.5px;" placeholder="1 | 26 July 2026 | Rajasthan GK + Building Technology | 120\n2 | 2 August 2026 | Surveying + Fluid Mechanics | 120"></textarea>' +
      '<div style="margin-top:10px;">'+pillBtn('id="sch_save"', 'Save Pasted Schedule', 'dark')+'</div>' +
      '<div style="margin-top:20px;border-top:1px dashed rgba(26,26,46,.15);padding-top:14px;"><strong style="font-size:13px;">Current schedule'+(category?' - '+categoryLabel(category):'')+'</strong><div class="admin-form-hint">Once a row exists, upload its Question Paper / Blank OMR / Solution and click Configure to set release/deadline dates.</div><div id="sch_list" style="margin-top:10px;"><p class="admin-empty">Loading…</p></div></div>';

    document.querySelectorAll('[data-sch-cat]').forEach(function(b){
      b.addEventListener('click', function(){ renderScheduleForms(slug, b.getAttribute('data-sch-cat')); });
    });

    document.getElementById('sch_add_btn').onclick = function(){
      var num = document.getElementById('sch_add_num').value;
      if (!num) { showToast('Test number is required', 'error'); return; }
      adminFetch('POST', '/api/programs/'+encodeURIComponent(slug)+'/schedule', {
        test_number: num,
        test_date: document.getElementById('sch_add_date').value,
        syllabus: document.getElementById('sch_add_syllabus').value,
        questions: document.getElementById('sch_add_questions').value,
        category: category || null,
      }).then(function(){
        showToast('Added', 'success');
        ['sch_add_num','sch_add_date','sch_add_syllabus','sch_add_questions'].forEach(function(id){ document.getElementById(id).value = ''; });
        loadScheduleRows(slug, category);
      }).catch(function(e){ showToast(e.message, 'error'); });
    };

    document.getElementById('sch_save').onclick = function(){
      var lines = document.getElementById('sch_paste').value.split('\n').map(function(l){return l.trim();}).filter(Boolean);
      if (!lines.length) { showToast('Paste at least one row','error'); return; }
      var rows = [];
      for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].split('|').map(function(p){return p.trim();});
        if (!parts[0] || isNaN(parseInt(parts[0],10))) { showToast('Line '+(i+1)+': first column must be a test number','error'); return; }
        rows.push({ test_number: parseInt(parts[0],10), test_date: parts[1]||'', syllabus: parts[2]||'', questions: parts[3]||'' });
      }
      adminFetch('POST', '/api/programs/'+encodeURIComponent(slug)+'/schedule/bulk', { rows: rows, category: category || null })
        .then(function(d){ showToast(d.message||'Saved','success'); document.getElementById('sch_paste').value=''; loadScheduleRows(slug, category); })
        .catch(function(e){ showToast(e.message,'error'); });
    };
    loadScheduleRows(slug, category);
  }

  var categoriesForModal = [];
  function openScheduleModal(slug, title, categories){
    categoriesForModal = categories || [];
    document.getElementById('scheduleModalTitle').textContent = 'Schedule - ' + title;
    document.getElementById('scheduleModal').style.display = 'flex';
    renderScheduleForms(slug, categoriesForModal[0] || null);
  }

  function openProgramModal(p){
    p = p || {};
    var isEdit = !!p.id;
    var lc = p.launch_config || null;
    document.getElementById('programModalTitle').textContent = isEdit ? 'Edit Program' : 'New Program';
    var body = document.getElementById('programModalBody');
    body.innerHTML =
      fld('Slug (URL)','pm_slug',p.slug||'', isEdit) +
      fld('Title','pm_title',p.title||'') +
      fld('Short name (used internally, e.g. payment notes)','pm_shortname',p.short_name||'') +
      sel('Category','pm_category',['test-series','interview','course'],p.category||'test-series') +
      fld('Exam','pm_exam',p.exam||'') +
      fld('Level','pm_level',p.level||'') +
      sel('Status','pm_status',['enrolling','coming_soon','closed'],p.status||'enrolling') +
      fld('Price (blank = hide)','pm_price',p.price||'') +
      fld('MRP','pm_mrp',p.mrp||'') +
      fld('Thumbnail / banner image URL','pm_thumb',p.thumbnail_url||'') +
      '<div class="admin-form-hint" style="margin-top:-8px;">For the same "premium" look as the other live programs (Jaspal Sir\'s photo banner), upload an image the same way you would for a Banner (Homepage Content &gt; Banners, or your usual image host) and paste its URL here. Leave blank to fall back to a plain accent-colour tile with an icon.</div>' +
      fld('Icon (Font Awesome class, e.g. fa-clipboard-list)','pm_icon',p.icon_class||'') +
      sel('Accent colour','pm_accent',['blue','teal','purple','indigo','orange','green'],p.accent||'blue') +
      tagCheckboxes('pm_tag', p.tags||[]) +
      fld('Feature bullets shown on the card (comma separated, e.g. Subject-wise Mock Tests, Full-Length Papers, Expert Review)','pm_features', (p.tags||[]).filter(function(t){ return !PRESET_TAGS[t]; }).join(', ')) +
      fld('Sort order','pm_sort',p.sort_order||0) +
      '<div style="border-top:1px dashed rgba(26,26,46,.15);margin:14px 0;padding-top:14px;">' +
        '<label class="admin-field" style="flex-direction:row;align-items:center;gap:10px;"><input type="checkbox" id="pm_omr" style="width:auto;"'+(p.omr_enabled?' checked':'')+'> <span>OMR / Home-Based program (shows up in the OMR sending picker)</span></label>' +
        fld('Total tests in this series','pm_total_tests',p.total_tests||'') +
        fld('Categories for combo programs (comma separated, e.g. degree, diploma - leave blank if not a combo)','pm_omr_categories',(p.omr_categories||[]).join(', ')) +
      '</div>' +
      '<div style="border-top:1px dashed rgba(26,26,46,.15);margin:14px 0;padding-top:14px;">' +
        '<label class="admin-field" style="flex-direction:row;align-items:center;gap:10px;"><input type="checkbox" id="pm_launch_enabled" style="width:auto;"'+(lc?' checked':'')+'> <span>Enable self-serve Tally intake (no code needed to go live)</span></label>' +
        '<div class="admin-form-hint" style="margin:-4px 0 10px;">Point this program\'s Tally form webhook at: <code>/api/tally-generic/'+e(p.slug||'&lt;slug&gt;')+'</code></div>' +
        fld('Series name shown on admit card & emails','pm_lc_series',(lc&&lc.seriesName)||'') +
        fld('Tally form URL (the learner fills this in after paying) *','pm_lc_tallyurl',(lc&&lc.tallyFormUrl)||'') +
        sel('Mode','pm_lc_mode',['home','offline'],(lc&&lc.mode)||'home') +
        fld('Roll number prefix (e.g. GEN)','pm_lc_prefix',(lc&&lc.rollPrefix)||'') +
        fld('WhatsApp group link (optional)','pm_lc_wa',(lc&&lc.waGroupUrl)||'') +
        fld('Last test date text shown on admit card (optional)','pm_lc_lasttest',(lc&&lc.lastTestDate)||'') +
        '<div class="admin-form-hint" style="margin:10px 0 -2px;">If Mode is "offline", fill in the test centre - every learner\'s admit card will show this address, regardless of what they type on the Tally form:</div>' +
        fld('Centre name (e.g. Jaipur)','pm_lc_centre_name',(lc&&lc.centre&&lc.centre.name)||'') +
        fld('Centre address','pm_lc_centre_address',(lc&&lc.centre&&lc.centre.address)||'') +
        fld('Centre Google Maps link','pm_lc_centre_maps',(lc&&lc.centre&&lc.centre.mapsLink)||'') +
      '</div>' +
      (isEdit ?
        '<div style="border-top:1px dashed rgba(26,26,46,.15);margin:14px 0;padding-top:14px;">' +
          '<span style="font-size:13px;font-weight:600;">Workbook (shared across every test in this program)</span><br>' +
          (p.workbook_url ? '<a href="'+e(p.workbook_url)+'" target="_blank" rel="noopener" style="font-size:12px;">Current workbook &rarr;</a> ' : '<span class="admin-form-hint">No workbook uploaded yet.</span> ') +
          '<button class="btn btn-sm btn-ghost" id="pm_workbook_upload" type="button" style="margin-left:6px;">'+(p.workbook_url?'Replace':'Upload')+'</button>' +
        '</div>'
      : '') +
      '<button class="btn" id="pm_save" style="margin-top:8px;">'+(isEdit?'Save Changes':'Create Program')+'</button>';
    document.getElementById('programModal').style.display='flex';
    if (isEdit) {
      document.getElementById('pm_workbook_upload').onclick = function(){
        var input = document.createElement('input');
        input.type = 'file'; input.accept = 'application/pdf';
        input.onchange = function(){
          if (!input.files[0]) return;
          var fd = new FormData(); fd.append('file', input.files[0]);
          showToast('Uploading…', 'success');
          adminFetch('POST', '/api/programs/'+p.id+'/workbook', fd)
            .then(function(d){ showToast('Uploaded', 'success'); p.workbook_url = d.program.workbook_url; openProgramModal(p); })
            .catch(function(e){ showToast(e.message, 'error'); });
        };
        input.click();
      };
    }
    document.getElementById('pm_save').onclick = function(){
      var launchEnabled = checked('pm_launch_enabled');
      var payload = {
        slug: val('pm_slug'), title: val('pm_title'), short_name: val('pm_shortname'),
        category: val('pm_category'), exam: val('pm_exam'), level: val('pm_level'), status: val('pm_status'),
        price: val('pm_price')||'', mrp: val('pm_mrp')||'', thumbnail_url: val('pm_thumb'),
        icon_class: val('pm_icon'), accent: val('pm_accent'),
        tags: collectTagCheckboxes('pm_tag').concat(
          val('pm_features').split(',').map(function(t){return t.trim();}).filter(Boolean)
        ),
        sort_order: parseInt(val('pm_sort')||'0',10),
        omr_enabled: checked('pm_omr'),
        total_tests: val('pm_total_tests') ? parseInt(val('pm_total_tests'),10) : '',
        omr_categories: val('pm_omr_categories') ? val('pm_omr_categories').split(',').map(function(c){return c.trim();}).filter(Boolean) : null,
        launch_config: launchEnabled ? {
          seriesName: val('pm_lc_series') || val('pm_title'),
          tallyFormUrl: val('pm_lc_tallyurl'),
          mode: val('pm_lc_mode'),
          rollPrefix: val('pm_lc_prefix') || 'GEN',
          waGroupUrl: val('pm_lc_wa') || null,
          lastTestDate: val('pm_lc_lasttest') || null,
          centre: val('pm_lc_centre_name') ? {
            name: val('pm_lc_centre_name'),
            address: val('pm_lc_centre_address') || 'To be announced - contact us on WhatsApp for details',
            mapsLink: val('pm_lc_centre_maps') || 'https://wa.me/919829133317',
          } : null,
        } : null,
      };
      if (launchEnabled && !payload.launch_config.tallyFormUrl) {
        showToast('Tally form URL is required when self-serve Tally intake is enabled', 'error'); return;
      }
      if (launchEnabled && payload.launch_config.mode === 'offline' && !payload.launch_config.centre) {
        showToast('Centre name is required for an offline program', 'error'); return;
      }
      var req = isEdit ? adminFetch('PUT','/api/programs/'+p.id,payload) : adminFetch('POST','/api/programs',payload);
      req.then(function(){ showToast(isEdit?'Saved':'Created','success'); document.getElementById('programModal').style.display='none'; loadPrograms(); })
         .catch(function(e){ showToast(e.message,'error'); });
    };
  }

  /* ── ENROLLMENTS ── */
  var allEnrollments = []; // cached for client-side filtering

  function applyEnrollFilters() {
    var program  = (document.getElementById('enrollProgramFilter')||{}).value || '';
    var status   = (document.getElementById('enrollFilter')||{}).value || '';
    var dateFrom = (document.getElementById('enrollDateFrom')||{}).value || '';
    var dateTo   = (document.getElementById('enrollDateTo')||{}).value || '';
    var body = document.getElementById('enrollmentsBody');

    var filtered = allEnrollments.filter(function(x) {
      if (program && x.program_slug !== program) return false;
      if (status  && x.status !== status) return false;
      if (dateFrom || dateTo) {
        var d = new Date((x.paid_at || x.created_at || '').split('T')[0]);
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo   && d > new Date(dateTo))   return false;
      }
      return true;
    });

    if (!filtered.length) {
      body.innerHTML = '<p class="admin-empty">No enrollments match the selected filters.</p>';
      return;
    }
    renderEnrollmentRows(filtered, body);
  }

  function renderEnrollmentRows(es, body) {
      var rows = es.map(function(x){
        var formBadge = x.status !== 'paid' ? '' :
          x.form_used
            ? '<span class="admin-badge admin-badge--green" title="'+fmtDate(x.form_used_at)+'">Form submitted</span>'
            : x.form_token
              ? '<span class="admin-badge admin-badge--orange">Awaiting form</span>'
              : '<span class="admin-badge" style="background:#f1f5f9;color:#64748b;">No token yet</span>';
        var emailBadge = (x.status === 'paid' && x.welcome_sent === false)
          ? '<br><span class="admin-badge" style="background:#fef2f2;color:#b91c1c;font-size:10px;" title="Welcome email failed - will retry on next payment-success page load">Email not sent</span>'
          : '';
        var reissueBtn = (x.status === 'paid')
          ? '<button class="btn-admin-secondary btn-admin-sm" style="margin-top:6px;font-size:11px;" data-reissue="'+x.id+'" title="Reset form token and resend welcome email">Re-issue form link</button>'
          : '';
        var markBtn = (x.status === 'paid' && !x.form_used)
          ? '<button class="btn-admin-secondary btn-admin-sm" style="margin-top:4px;font-size:11px;color:#059669;border-color:#059669;" data-marksubmit="'+x.id+'" title="Manually mark as submitted (use when learner filled form but webhook failed)">Mark as submitted</button>'
          : '';
        var admitBtn = (x.status === 'paid' && x.form_used)
          ? '<button class="btn-admin-secondary btn-admin-sm" style="margin-top:4px;font-size:11px;color:#7c3aed;border-color:#7c3aed;" data-admitcard="'+x.id+'" data-slug="'+(x.program_slug||'')+'" title="Generate and resend admit card PDF">Send Admit Card</button>'
          : '';
        var markPaidBtn = (x.status === 'pending')
          ? '<button class="btn-admin-secondary btn-admin-sm" style="margin-top:4px;font-size:11px;color:#059669;border-color:#059669;" data-markpaid="'+x.id+'" title="Mark as paid without a Razorpay payment - sends the welcome email with the enrollment form link">Mark as Paid</button>'
          : '';
        return '<tr><td>'+e(x.student_name)+'<br><span style="color:#9999b0;font-size:12px;">'+e(x.student_phone)+(x.student_email?' · '+e(x.student_email):'')+
          ' <a href="#" data-edit-enroll-email="'+x.id+'" data-current-email="'+e(x.student_email||'')+'" style="color:#4f46e5;">edit</a></span></td>' +
          '<td>'+e(x.program_label||x.program_name)+'</td><td>'+inr(x.amount)+(x.coupon_code?'<br><span style="color:#16a34a;font-size:11px;">'+e(x.coupon_code)+'</span>':'')+'</td>' +
          '<td><span class="admin-badge admin-badge--'+(x.status==='paid'?'green':x.status==='pending'?'orange':'grey')+'">'+e(x.status)+'</span></td>' +
          '<td>'+formBadge+emailBadge+reissueBtn+markBtn+admitBtn+markPaidBtn+'</td>'+
          '<td>'+fmtDate(x.paid_at||x.created_at)+'</td><td style="font-size:11px;color:#9999b0;">'+e(x.order_id)+'</td></tr>';
      }).join('');
      body.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Student</th><th>Program</th><th>Amount</th><th>Status</th><th>Form</th><th>Date</th><th>Order</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      // Wire up re-issue buttons
      body.querySelectorAll('[data-reissue]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var id = btn.getAttribute('data-reissue');
          if (!confirm('Re-issue a new form link for this learner? Their previous link will be invalidated and a new welcome email will be sent.')) return;
          btn.disabled = true; btn.textContent = 'Sending...';
          adminFetch('POST', '/api/enrollment/admin/reissue-form', { enrollment_id: parseInt(id) })
            .then(function(d){ showToast(d.message || 'Form link re-issued', 'success'); loadEnrollments(); })
            .catch(function(err){ showToast(err.message || 'Failed', 'error'); btn.disabled = false; btn.textContent = 'Re-issue form link'; });
        });
      });
      // Wire up mark-as-submitted buttons
      body.querySelectorAll('[data-marksubmit]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var id = btn.getAttribute('data-marksubmit');
          if (!confirm('Mark this enrollment as form submitted? Use this only if you have verified the learner\'s details manually.')) return;
          btn.disabled = true; btn.textContent = 'Saving...';
          adminFetch('POST', '/api/enrollment/admin/mark-submitted', { enrollment_id: parseInt(id) })
            .then(function(d){ showToast(d.message || 'Marked as submitted', 'success'); loadEnrollments(); })
            .catch(function(err){ showToast(err.message || 'Failed', 'error'); btn.disabled = false; btn.textContent = 'Mark as submitted'; });
        });
      });
      // Wire up per-enrollment email edit links
      body.querySelectorAll('[data-edit-enroll-email]').forEach(function(link){
        link.addEventListener('click', function(evt){
          evt.preventDefault();
          var id = link.getAttribute('data-edit-enroll-email');
          var current = link.getAttribute('data-current-email') || '';
          var next = prompt('Corrected email for this enrollment:', current);
          if (next === null) return;
          next = next.trim();
          if (!next || next === current) return;
          adminFetch('PATCH', '/api/enrollment/admin/' + id + '/email', { email: next })
            .then(function(d){ showToast(d.message || 'Email updated', 'success'); loadEnrollments(); })
            .catch(function(err){ showToast(err.message || 'Failed', 'error'); });
        });
      });
      // Wire up send-admit-card buttons
      body.querySelectorAll('[data-admitcard]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var id   = btn.getAttribute('data-admitcard');
          var slug = btn.getAttribute('data-slug') || '';
          showAdmitCardModal(parseInt(id), slug.includes('degree'), slug.includes('omr'));
        });
      });
      // Wire up mark-as-paid buttons (manual/corrected enrollments, no Razorpay)
      body.querySelectorAll('[data-markpaid]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var id = btn.getAttribute('data-markpaid');
          if (!confirm('Mark this enrollment as paid? This sends the welcome email with the enrollment form link immediately - only do this once you have actually collected payment.')) return;
          btn.disabled = true; btn.textContent = 'Saving...';
          adminFetch('POST', '/api/enrollment/admin/' + id + '/mark-paid')
            .then(function(d){ showToast(d.message || 'Marked as paid', 'success'); loadEnrollments(); })
            .catch(function(err){ showToast(err.message || 'Failed', 'error'); btn.disabled = false; btn.textContent = 'Mark as Paid'; });
        });
      });
  }

  /* ── Add Enrollment (manual/corrected, no Razorpay) ──
     Used to fix a learner who paid for the wrong program: create a row
     here for the correct program, then use "Mark as Paid" on it to send
     the welcome email with that program's Tally form link. Cancelling
     the original wrong enrollment is a separate manual step (refund flag
     on that row) - this tool doesn't touch it automatically. */
  function openAddEnrollmentModal(){
    var body = document.getElementById('addEnrollmentModalBody');
    body.innerHTML = '<p class="admin-empty">Loading programs…</p>';
    document.getElementById('addEnrollmentModal').style.display = 'flex';
    adminFetch('GET', '/api/programs/admin/all').then(function(d){
      var ps = (d.programs || []).filter(function(p){ return p.price != null; });
      var progOpts = ps.map(function(p){ return '<option value="'+e(p.slug)+'" data-price="'+(p.price||'')+'">'+e(p.title)+' ('+inr(p.price)+')</option>'; }).join('');
      body.innerHTML =
        '<label class="admin-field"><span>Program</span><select class="admin-input" id="ae_program">'+progOpts+'</select></label>' +
        fld('Student Name','ae_name','') +
        fld('Email (optional)','ae_email','') +
        fld('Phone','ae_phone','') +
        fld('Amount (defaults to program price)','ae_amount', ps.length ? ps[0].price : '') +
        '<div class="admin-form-hint" style="margin-top:-8px;">Creates a <strong>pending</strong> enrollment. Use "Mark as Paid" on the Enrollments list to actually trigger the welcome email once you\'ve confirmed payment.</div>' +
        '<button class="btn" id="ae_save" style="margin-top:12px;">Create Enrollment</button>';
      var progSel = document.getElementById('ae_program');
      if (progSel) progSel.addEventListener('change', function(){
        var opt = progSel.options[progSel.selectedIndex];
        var amtEl = document.getElementById('ae_amount');
        if (opt && amtEl) amtEl.value = opt.getAttribute('data-price') || '';
      });
      document.getElementById('ae_save').onclick = function(){
        var payload = {
          program_slug: val('ae_program'), student_name: val('ae_name'),
          student_email: val('ae_email'), student_phone: val('ae_phone'),
          amount: val('ae_amount') || '',
        };
        if (!payload.program_slug || !payload.student_name || !payload.student_phone) {
          showToast('Program, name and phone are required', 'error'); return;
        }
        adminFetch('POST', '/api/enrollment/admin/create', payload)
          .then(function(d){ showToast(d.message || 'Enrollment created', 'success'); document.getElementById('addEnrollmentModal').style.display = 'none'; loadEnrollments(); })
          .catch(function(err){ showToast(err.message || 'Failed', 'error'); });
      };
    }).catch(function(err){ body.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  function loadEnrollments(){
    var periodBtn = document.querySelector('#enrollPeriodTabs .filter-tab.active');
    var period = periodBtn ? periodBtn.getAttribute('data-period') : 'all';
    var body = document.getElementById('enrollmentsBody');
    var qs = [];
    if (period && period !== 'all') qs.push('period=' + period);
    body.innerHTML = '<p class="admin-empty">Loading...</p>';
    adminFetch('GET', '/api/enrollment/admin/all' + (qs.length ? ('?' + qs.join('&')) : '')).then(function(d){
      var s = d.summary||{};
      document.getElementById('enrollSummary').innerHTML =
        statCard('Revenue', inr(s.revenue)) + statCard('Paid', s.paid_count||0) + statCard('Pending', s.pending_count||0) +
        (s.refunded_count ? statCard('Refunded', s.refunded_count) : '');

      allEnrollments = d.enrollments || [];

      // Populate program dropdown from unique programs in this dataset
      var progSel = document.getElementById('enrollProgramFilter');
      if (progSel) {
        var currentProg = progSel.value;
        var seen = {};
        var opts = '<option value="">All Programs</option>';
        allEnrollments.forEach(function(x){
          if (x.program_slug && !seen[x.program_slug]) {
            seen[x.program_slug] = true;
            // Shorten label: use slug-based short name
            var label = x.program_label || x.program_name || x.program_slug;
            if (label.length > 40) label = label.slice(0, 40) + '...';
            opts += '<option value="'+e(x.program_slug)+'"'+(currentProg===x.program_slug?' selected':'')+'>'+e(label)+'</option>';
          }
        });
        progSel.innerHTML = opts;
      }

      applyEnrollFilters();
    }).catch(function(err){ body.innerHTML='<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  /* ── PAID LEARNERS ── */
  var allPaidLearners = []; // cached for CSV export

  function bigStatCard(icon, color, bg, label, value) {
    return '<div class="stat-card" style="--stat-color:'+color+';--stat-bg:'+bg+';">' +
      '<div class="stat-card-icon"><i class="fas '+icon+'"></i></div>' +
      '<div class="stat-card-label">'+e(label)+'</div>' +
      '<div class="stat-card-value">'+value+'</div>' +
      '</div>';
  }

  function loadPaidLearners() {
    var tabBtn = document.querySelector('#paidLearnerProgramTabs .filter-tab.active');
    var program = tabBtn ? tabBtn.getAttribute('data-program') : '';
    var searchEl = $('paidLearnerSearch');
    var search = searchEl ? searchEl.value.trim() : '';
    var body = $('paidLearnersBody');
    var qs = [];
    if (program) qs.push('program=' + encodeURIComponent(program));
    if (search)  qs.push('search=' + encodeURIComponent(search));
    body.innerHTML = '<p class="admin-empty">Loading...</p>';

    adminFetch('GET', '/api/enrollment/admin/paid-learners' + (qs.length ? ('?' + qs.join('&')) : '')).then(function (d) {
      allPaidLearners = d.learners || [];
      var s = d.summary || {};
      var byProgram = d.byProgram || [];

      var statsHtml =
        bigStatCard('fa-user-graduate', '#7c3aed', 'rgba(124,58,237,0.1)', 'Total Paid Learners', s.total_paid || 0) +
        bigStatCard('fa-indian-rupee-sign', '#16a34a', 'rgba(22,163,74,0.1)', 'Net Revenue (Rs)', inrIndian(s.net_revenue || 0)) +
        bigStatCard('fa-rotate-left', '#dc2626', 'rgba(220,38,38,0.1)', 'Refunds Initiated', s.refunded_count || 0);
      byProgram.forEach(function (p) {
        statsHtml += bigStatCard('fa-layer-group', '#0891b2', 'rgba(8,145,178,0.1)', p.program_label, p.count);
      });
      $('paidLearnersStats').innerHTML = statsHtml;

      if (!allPaidLearners.length) {
        body.innerHTML = '<p class="admin-empty">No paid learners match the selected filters.</p>';
        return;
      }
      renderPaidLearnerRows(allPaidLearners, body);
    }).catch(function (err) { body.innerHTML = '<p class="admin-empty">' + e(err.message) + '</p>'; });
  }

  function renderPaidLearnerRows(rows, body) {
    var html = rows.map(function (x) {
      var refunded = x.refund_status === 'initiated';
      var refundBadge = refunded
        ? '<span class="admin-badge admin-badge--red" title="'+e(x.refund_reason||'')+'">Refund Initiated</span>'
        : '<span class="admin-badge admin-badge--grey">-</span>';
      var refundAction = refunded
        ? '<button class="btn-admin-secondary btn-admin-sm" style="font-size:11px;" data-clearrefund="'+e(x.order_id)+'" data-name="'+e(x.student_name)+'">Clear Refund</button>'
        : '<button class="btn-admin-secondary btn-admin-sm" style="font-size:11px;color:#b91c1c;border-color:#b91c1c;" data-refund="'+e(x.order_id)+'" data-name="'+e(x.student_name)+'" data-amount="'+(x.amount||0)+'">Mark Refund</button>';

      return '<tr>' +
        '<td>'+e(x.student_name)+'<br><span style="color:#9999b0;font-size:12px;">'+e(x.student_phone)+(x.student_email?' · '+e(x.student_email):'')+'</span></td>' +
        '<td>'+e(x.program_label||x.program_name)+'</td>' +
        '<td>'+inr(x.amount)+'</td>' +
        '<td>'+(x.referred_by?e(x.referred_by):'<span style="color:#c7c7d6;">-</span>')+'</td>' +
        '<td>'+(x.coupon_code?e(x.coupon_code):'<span style="color:#c7c7d6;">-</span>')+'</td>' +
        '<td style="font-size:11px;color:#9999b0;">'+e(x.order_id)+(x.cf_payment_id?'<br>'+e(x.cf_payment_id):'')+'</td>' +
        '<td>'+fmtDate(x.paid_at)+'</td>' +
        '<td>'+refundBadge+'</td>' +
        '<td>'+refundAction+'</td>' +
        '</tr>';
    }).join('');

    body.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>Learner</th><th>Program</th><th>Amount</th><th>Referral Code</th><th>Coupon</th><th>Order / Payment ID</th><th>Purchase Date</th><th>Refund</th><th>Action</th>' +
      '</tr></thead><tbody>'+html+'</tbody></table></div>';

    body.querySelectorAll('[data-refund]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showRefundModal(btn.getAttribute('data-refund'), btn.getAttribute('data-name'), btn.getAttribute('data-amount'));
      });
    });
    body.querySelectorAll('[data-clearrefund]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var orderId = btn.getAttribute('data-clearrefund');
        var name = btn.getAttribute('data-name');
        if (!confirm('Clear the refund flag for ' + name + '? Their purchase amount will count toward sales again.')) return;
        btn.disabled = true; btn.textContent = 'Clearing...';
        adminFetch('POST', '/api/enrollment/admin/' + encodeURIComponent(orderId) + '/refund', { action: 'clear' })
          .then(function (d) { showToast(d.message || 'Refund flag cleared', 'success'); loadPaidLearners(); })
          .catch(function (err) { showToast(err.message || 'Failed', 'error'); btn.disabled = false; btn.textContent = 'Clear Refund'; });
      });
    });
  }

  /** Mark-refund modal - internal tracking flag only, does not call Razorpay or move money */
  function showRefundModal(orderId, studentName, amount) {
    var existing = document.getElementById('refundModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'refundModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
          '<h3 style="margin:0;font-size:17px;color:#1A1A2E;">Mark Refund - '+e(studentName)+'</h3>' +
          '<button id="refundModalClose" style="border:none;background:none;font-size:22px;cursor:pointer;color:#9ca3af;">&times;</button>' +
        '</div>' +
        '<p style="font-size:13px;color:#6b7280;margin:0 0 20px;">This only records the refund internally and removes the amount from sales totals. It does <strong>not</strong> move any money - process the actual refund via Razorpay or bank transfer separately.</p>' +
        '<div style="display:flex;flex-direction:column;gap:12px;">' +
          '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">Reason *</label>' +
            '<textarea id="rf_reason" rows="3" placeholder="e.g. Learner requested cancellation within refund window" style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;resize:vertical;"></textarea></div>' +
          '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">Refund Amount (Rs)</label>' +
            '<input id="rf_amount" type="number" min="0" value="'+e(amount)+'" style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;"/></div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;margin-top:24px;">' +
          '<button id="refundModalSubmit" style="flex:1;background:#dc2626;color:#fff;border:none;border-radius:9px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;">Mark Refund Initiated</button>' +
          '<button id="refundModalCancel" style="background:#f1f5f9;color:#374151;border:none;border-radius:9px;padding:12px 18px;font-size:14px;font-weight:600;cursor:pointer;">Cancel</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    document.getElementById('refundModalClose').onclick  = function () { modal.remove(); };
    document.getElementById('refundModalCancel').onclick = function () { modal.remove(); };
    modal.addEventListener('click', function (ev) { if (ev.target === modal) modal.remove(); });

    document.getElementById('refundModalSubmit').addEventListener('click', function () {
      var reason = document.getElementById('rf_reason').value.trim();
      var amt = document.getElementById('rf_amount').value;
      if (!reason) { showToast('A reason is required', 'error'); return; }

      var submitBtn = document.getElementById('refundModalSubmit');
      submitBtn.disabled = true; submitBtn.textContent = 'Saving...';

      adminFetch('POST', '/api/enrollment/admin/' + encodeURIComponent(orderId) + '/refund', { action: 'initiate', reason: reason, amount: amt })
        .then(function (d) {
          modal.remove();
          showToast(d.message || 'Refund marked as initiated', 'success');
          loadPaidLearners();
        })
        .catch(function (err) {
          showToast(err.message || 'Failed to mark refund', 'error');
          submitBtn.disabled = false; submitBtn.textContent = 'Mark Refund Initiated';
        });
    });
  }

  /** Export paid learners as CSV, built client-side from the last loaded page. */
  function exportPaidLearnersCSV() {
    if (!allPaidLearners.length) { showToast('No paid learner data to export.', 'error'); return; }

    var headers = ['Name', 'Email', 'Phone', 'Program', 'Amount', 'Purchase Date', 'Referral Code', 'Coupon Code', 'Order ID', 'Payment ID', 'Refund Status'];
    var rows = allPaidLearners.map(function (x) {
      return [
        csvEscape(x.student_name || ''),
        csvEscape(x.student_email || ''),
        csvEscape(x.student_phone || ''),
        csvEscape(x.program_label || x.program_name || ''),
        x.amount || 0,
        csvEscape(fmtDate(x.paid_at)),
        csvEscape(x.referred_by || ''),
        csvEscape(x.coupon_code || ''),
        csvEscape(x.order_id || ''),
        csvEscape(x.cf_payment_id || ''),
        csvEscape(x.refund_status === 'initiated' ? 'Refund Initiated' : 'None')
      ].join(',');
    });

    var csv = [headers.join(',')].concat(rows).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url;
    a.download = 'paid_learners_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('CSV exported (' + allPaidLearners.length + ' learners).', 'success');
  }

  /** Bind Paid Learners section controls */
  function bindPaidLearnersSection() {
    var refreshBtn = $('btnRefreshPaidLearners');
    if (refreshBtn) refreshBtn.addEventListener('click', loadPaidLearners);

    var exportBtn = $('btnExportPaidLearnersCSV');
    if (exportBtn) exportBtn.addEventListener('click', exportPaidLearnersCSV);

    var searchEl = $('paidLearnerSearch');
    if (searchEl) {
      var searchTimer;
      searchEl.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadPaidLearners, 350);
      });
    }

    var tabs = document.querySelectorAll('#paidLearnerProgramTabs .filter-tab');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadPaidLearners();
      });
    });
  }

  /* ── Admit Card modal ── */
  function showAdmitCardModal(enrollmentId, isDegree, isOmr) {
    var existing = document.getElementById('admitCardModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'admitCardModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    var centreFieldHtml = isOmr
      ? '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">Mode</label>' +
          '<input type="text" value="Online (Home Based)" disabled style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;background:#f9fafb;color:#6b7280;"/></div>'
      : '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">Test Centre *</label>' +
          '<select id="ac_centre" style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;">' +
            '<option value="">Select centre...</option>' +
            '<option value="jaipur">Jaipur</option><option value="kota">Kota</option>' +
            '<option value="bikaner">Bikaner</option><option value="sikar">Sikar</option>' +
            '<option value="jodhpur">Jodhpur</option><option value="alwar">Alwar</option><option value="ajmer">Ajmer</option>' +
          '</select></div>';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">' +
          '<h3 style="margin:0;font-size:17px;color:#1A1A2E;">Send Admit Card</h3>' +
          '<button id="admitCardClose" style="border:none;background:none;font-size:22px;cursor:pointer;color:#9ca3af;">&times;</button>' +
        '</div>' +
        '<p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Fill in details from the Tally form responses (Google Sheet). The PDF will be generated and emailed to the learner.</p>' +
        '<div style="display:flex;flex-direction:column;gap:12px;">' +
          '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">Full Name (as on Govt ID) *</label>' +
            '<input id="ac_name" type="text" placeholder="e.g. Tanu Sharma" style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;"/></div>' +
          '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">Govt ID number (optional)</label>' +
            '<input id="ac_govtid" type="text" placeholder="Aadhaar / Voter ID number" style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;"/></div>' +
          centreFieldHtml +
          '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">Program Type *</label>' +
            '<select id="ac_type" style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;">' +
              '<option value="' + (isDegree ? 'degree' : 'diploma') + '">' + (isDegree ? 'Degree' : 'Diploma') + '</option>' +
              '<option value="' + (isDegree ? 'diploma' : 'degree') + '">' + (isDegree ? 'Diploma' : 'Degree') + '</option>' +
            '</select></div>' +
          '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">Photo URL from Tally (optional)</label>' +
            '<input id="ac_photo" type="text" placeholder="https://..." style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;"/></div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;margin-top:24px;">' +
          '<button id="admitCardSend" style="flex:1;background:#7c3aed;color:#fff;border:none;border-radius:9px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;">Generate &amp; Send Admit Card</button>' +
          '<button id="admitCardCancel" style="background:#f1f5f9;color:#374151;border:none;border-radius:9px;padding:12px 18px;font-size:14px;font-weight:600;cursor:pointer;">Cancel</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    document.getElementById('admitCardClose').onclick  = function(){ modal.remove(); };
    document.getElementById('admitCardCancel').onclick = function(){ modal.remove(); };
    modal.addEventListener('click', function(ev){ if (ev.target === modal) modal.remove(); });

    document.getElementById('admitCardSend').addEventListener('click', function(){
      var name    = document.getElementById('ac_name').value.trim();
      var govtId  = document.getElementById('ac_govtid').value.trim();
      var centreEl = document.getElementById('ac_centre');
      var centre  = centreEl ? centreEl.value : '';
      var type    = document.getElementById('ac_type').value;
      var photo   = document.getElementById('ac_photo').value.trim();

      if (!name || (!isOmr && !centre)) { showToast(isOmr ? 'Name is required' : 'Name and centre are required', 'error'); return; }

      var sendBtn = document.getElementById('admitCardSend');
      sendBtn.disabled = true; sendBtn.textContent = 'Generating...';

      var payload = { enrollment_id: enrollmentId, name: name, program_type: type };
      if (centre) payload.centre = centre;
      if (govtId) payload.govt_id  = govtId;
      if (photo)  payload.photo_url = photo;

      adminFetch('POST', '/api/enrollment/admin/resend-admit-card', payload)
        .then(function(d){
          modal.remove();
          showToast((d.message || 'Admit card sent') + (d.roll_number ? ' | Roll: ' + d.roll_number : ''), 'success');
        })
        .catch(function(err){
          showToast(err.message || 'Failed to send admit card', 'error');
          sendBtn.disabled = false; sendBtn.textContent = 'Generate & Send Admit Card';
        });
    });
  }

  /* ── LEADS ── */
  function loadProgramLeads(){
    var body = document.getElementById('programLeadsBody');
    adminFetch('GET','/api/leads/admin/all').then(function(d){
      var ls = d.leads||[];
      if (!ls.length){ body.innerHTML='<p class="admin-empty">No interest leads yet.</p>'; return; }
      var rows = ls.map(function(x){
        var srcLabel = x.source === 'checkout_abandon'
          ? '<span class="admin-badge admin-badge--orange" title="Filled checkout but did not pay">Abandoned</span>'
          : '<span class="admin-badge admin-badge--blue">Interest</span>';
        return '<tr><td>'+e(x.name||'-')+'</td><td>'+e(x.phone)+'</td><td>'+e(x.email||'-')+'</td><td>'+e(x.program_name)+'</td><td>'+srcLabel+'</td><td>'+fmtDate(x.created_at)+'</td></tr>';
      }).join('');
      body.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Program</th><th>Source</th><th>Date</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
    }).catch(function(err){ body.innerHTML='<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  /* ── REFERRAL PAYOUTS ── */
  function loadReferralPayouts(){
    var body = document.getElementById('referralPayoutsBody');
    var statusSel = document.getElementById('referralPayoutFilter');
    var status = statusSel ? statusSel.value : 'pending';
    body.innerHTML = '<p class="admin-empty">Loading...</p>';
    var qs = status ? ('?status=' + encodeURIComponent(status)) : '';
    adminFetch('GET', '/api/payment/admin/referral-credits' + qs).then(function(d){
      var cs = d.credits || [];
      if (!cs.length){ body.innerHTML = '<p class="admin-empty">No referral payouts'+(status?(' ('+status+')'):'')+'.</p>'; return; }
      var rows = cs.map(function(c){
        var payAction = c.status === 'pending'
          ? '<button class="btn btn-sm" data-ref-paid="'+c.id+'">Mark Paid</button> <button class="btn btn-sm btn-ghost" data-ref-reject="'+c.id+'">Reject</button>'
          : c.status === 'paid'
            ? '<span class="admin-badge admin-badge--blue">Paid</span>'
            : '<span class="admin-badge admin-badge--orange">Rejected</span>';
        return '<tr><td>'+e(c.referrer_name)+'<br><span style="font-size:11px;color:#6b6b8a;">'+e(c.referrer_phone)+'</span></td>' +
          '<td>'+e(c.referred_name)+'<br><span style="font-size:11px;color:#6b6b8a;">'+e(c.referred_program)+'</span></td>' +
          '<td>'+inr(c.amount)+'</td><td>'+fmtDate(c.created_at)+'</td><td>'+payAction+'</td></tr>';
      }).join('');
      body.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Pay To (Referrer)</th><th>Referred Friend</th><th>Amount</th><th>Earned On</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      document.querySelectorAll('[data-ref-paid]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var id = btn.getAttribute('data-ref-paid');
          btn.disabled = true; btn.textContent = 'Saving...';
          adminFetch('PATCH', '/api/payment/admin/referral-credits/'+id+'/mark-paid').then(function(){
            showToast('Marked as paid', 'success');
            loadReferralPayouts();
          }).catch(function(err){ showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Mark Paid'; });
        });
      });
      document.querySelectorAll('[data-ref-reject]').forEach(function(btn){
        btn.addEventListener('click', function(){
          if (!confirm('Reject this referral claim? This cannot be undone.')) return;
          var id = btn.getAttribute('data-ref-reject');
          btn.disabled = true; btn.textContent = 'Saving...';
          adminFetch('PATCH', '/api/payment/admin/referral-credits/'+id+'/reject').then(function(){
            showToast('Claim rejected', 'success');
            loadReferralPayouts();
          }).catch(function(err){ showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Reject'; });
        });
      });
    }).catch(function(err){ body.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  /* ── REFERRAL CODES (all paid learners, manual email trigger) ── */
  function loadReferralCodesAdmin(){
    var body = document.getElementById('referralCodesBody');
    if (!body) return;
    body.innerHTML = '<p class="admin-empty">Loading...</p>';
    adminFetch('GET', '/api/payment/admin/referral-codes').then(function(d){
      var ls = d.learners || [];
      if (!ls.length){ body.innerHTML = '<p class="admin-empty">No paid learners with referral codes yet.</p>'; return; }
      var rows = ls.map(function(x){
        var sentLabel = x.referral_email_sent
          ? '<span class="admin-badge admin-badge--blue">Sent ' + fmtDate(x.referral_email_sent_at) + '</span>'
          : '<span class="admin-badge admin-badge--orange">Not sent</span>';
        return '<tr><td>'+e(x.student_name)+'<br><span style="font-size:11px;color:#6b6b8a;">'+e(x.student_phone)+'</span></td>' +
          '<td>'+e(x.student_email)+'</td>' +
          '<td style="font-family:monospace;">'+e(x.referral_code)+'</td>' +
          '<td>'+sentLabel+'</td>' +
          '<td><button class="btn btn-sm" data-refcode-send="'+e(x.order_id)+'">Send Email</button></td></tr>';
      }).join('');
      body.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Learner</th><th>Email</th><th>Code</th><th>Email Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      document.querySelectorAll('[data-refcode-send]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var orderId = btn.getAttribute('data-refcode-send');
          btn.disabled = true; btn.textContent = 'Sending...';
          adminFetch('POST', '/api/payment/admin/referral-codes/'+encodeURIComponent(orderId)+'/send-email').then(function(){
            showToast('Email sent', 'success');
            loadReferralCodesAdmin();
          }).catch(function(err){
            showToast(err.message, 'error');
            btn.disabled = false; btn.textContent = 'Send Email';
          });
        });
      });
    }).catch(function(err){ body.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  /* ── BANNERS ── */
  function loadBanners(){
    var body = document.getElementById('bannersBody');
    adminFetch('GET','/api/banners/admin/all').then(function(d){
      var bs = d.banners||[];
      if (!bs.length){ body.innerHTML='<p class="admin-empty">No banners yet. Add one with the button above.</p>'; return; }
      var rows = bs.map(function(b){
        return '<tr><td><img src="'+e(b.image_url)+'" style="width:90px;height:48px;object-fit:cover;border-radius:6px;"></td>' +
          '<td>'+e(b.title||'-')+'</td><td>'+e(b.placement)+'</td><td>'+b.sort_order+'</td>' +
          '<td><label class="admin-switch"><input type="checkbox" data-ban-vis="'+b.id+'" '+(b.is_visible?'checked':'')+'><span></span></label></td>' +
          '<td><button class="btn btn-sm" data-ban-edit="'+b.id+'">Edit</button> <button class="btn btn-sm btn-ghost" data-ban-del="'+b.id+'">Delete</button></td></tr>';
      }).join('');
      body.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Image</th><th>Title</th><th>Placement</th><th>Order</th><th>Visible</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      bindBannerRowActions(bs);
    }).catch(function(err){ body.innerHTML='<p class="admin-empty">'+e(err.message)+'</p>'; });
  }
  function bindBannerRowActions(bs){
    document.querySelectorAll('[data-ban-vis]').forEach(function(cb){
      cb.addEventListener('change', function(){ adminFetch('PATCH','/api/banners/'+cb.getAttribute('data-ban-vis')+'/visibility',{is_visible:cb.checked}).then(function(){showToast('Updated','success');}).catch(function(e){showToast(e.message,'error');cb.checked=!cb.checked;}); });
    });
    document.querySelectorAll('[data-ban-edit]').forEach(function(b){ b.addEventListener('click', function(){ openBannerModal(bs.filter(function(x){return x.id==b.getAttribute('data-ban-edit');})[0]); }); });
    document.querySelectorAll('[data-ban-del]').forEach(function(b){ b.addEventListener('click', function(){ if(!confirm('Delete this banner?'))return; adminFetch('DELETE','/api/banners/'+b.getAttribute('data-ban-del')).then(function(){showToast('Deleted','success');loadBanners();}).catch(function(e){showToast(e.message,'error');}); }); });
  }
  function openBannerModal(b){
    b = b || {}; var isEdit = !!b.id;
    var isVisible = b.is_visible !== undefined ? b.is_visible : true;
    document.getElementById('bannerModalTitle').textContent = isEdit?'Edit Banner':'New Banner';
    document.getElementById('bannerModalBody').innerHTML =
      fld('Image URL *','bm_img',b.image_url||'') +
      '<div class="admin-form-hint" style="margin-top:-8px;margin-bottom:12px;">Paste a Cloudinary URL or any direct image link.</div>' +
      fld('Title (optional)','bm_title',b.title||'') +
      fld('Link URL (optional)','bm_link',b.link_url||'') +
      sel('Placement','bm_place',['home_carousel','program_page','announcement'],b.placement||'home_carousel') +
      fld('Sort Order (lower = first)','bm_sort',b.sort_order||0) +
      '<label class="admin-field" style="flex-direction:row;align-items:center;gap:10px;">' +
        '<input type="checkbox" id="bm_visible"' + (isVisible?' checked':'') + ' style="width:auto;"> ' +
        '<span>Visible</span>' +
      '</label>' +
      '<button class="btn" id="bm_save" style="margin-top:12px;">'+(isEdit?'Save Changes':'Create Banner')+'</button>';
    document.getElementById('bannerModal').style.display='flex';
    document.getElementById('bm_save').onclick=function(){
      var visibleEl = document.getElementById('bm_visible');
      var payload={
        image_url: val('bm_img'),
        title: val('bm_title'),
        link_url: val('bm_link'),
        placement: val('bm_place'),
        sort_order: parseInt(val('bm_sort')||'0',10),
        is_visible: visibleEl ? visibleEl.checked : true
      };
      if(!payload.image_url){showToast('Image URL is required','error');return;}
      var req=isEdit?adminFetch('PUT','/api/banners/'+b.id,payload):adminFetch('POST','/api/banners',payload);
      req.then(function(){showToast(isEdit?'Saved':'Created','success');document.getElementById('bannerModal').style.display='none';loadBanners();}).catch(function(e){showToast(e.message,'error');});
    };
  }

  /* ── COUPONS ── */
  function couponScopeText(c){
    if (c.type === 'program_price_map') return Object.keys(c.program_prices||{}).length + ' program(s), fixed price';
    var slugs = c.program_slugs;
    return (slugs && slugs.length) ? (slugs.length + ' program(s)') : 'All programs';
  }
  function couponUsageText(c){
    var used = c.used_count || 0;
    if (c.max_uses == null) return used + ' used / unlimited';
    return used + ' / ' + c.max_uses + ' used';
  }
  function loadCoupons(){
    var body = document.getElementById('couponsBody');
    adminFetch('GET','/api/coupons/admin/all').then(function(d){
      var cs = d.coupons||[];
      if (!cs.length){ body.innerHTML='<p class="admin-empty">No coupons yet. Add one with the button above.</p>'; return; }
      var rows = cs.map(function(c){
        return '<tr><td><strong>'+e(c.code)+'</strong>'+(c.label?'<br><span style="color:#9999b0;font-size:12px;">'+e(c.label)+'</span>':'')+'</td>' +
          '<td>'+e(c.type)+'</td>' +
          '<td>'+couponScopeText(c)+'</td>' +
          '<td>'+couponUsageText(c)+'</td>' +
          '<td>'+(c.exclusive?'<span class="admin-badge admin-badge--orange">Blocks referral</span>':'-')+'</td>' +
          '<td><label class="admin-switch"><input type="checkbox" data-cpn-active="'+c.id+'" '+(c.is_active?'checked':'')+'><span></span></label></td>' +
          '<td><button class="btn btn-sm" data-cpn-edit="'+c.id+'">Edit</button> <button class="btn btn-sm btn-ghost" data-cpn-del="'+c.id+'">Delete</button></td></tr>';
      }).join('');
      body.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Code</th><th>Type</th><th>Scope</th><th>Usage</th><th>Referral</th><th>Active</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      bindCouponRowActions(cs);
    }).catch(function(err){ body.innerHTML='<p class="admin-empty">'+e(err.message)+'</p>'; });
  }
  function bindCouponRowActions(cs){
    document.querySelectorAll('[data-cpn-active]').forEach(function(cb){
      cb.addEventListener('change', function(){
        adminFetch('PATCH','/api/coupons/'+cb.getAttribute('data-cpn-active')+'/active',{is_active:cb.checked})
          .then(function(){ showToast('Updated','success'); }).catch(function(e){ showToast(e.message,'error'); cb.checked=!cb.checked; });
      });
    });
    document.querySelectorAll('[data-cpn-edit]').forEach(function(b){
      b.addEventListener('click', function(){ openCouponModal(cs.filter(function(x){return x.id==b.getAttribute('data-cpn-edit');})[0]); });
    });
    document.querySelectorAll('[data-cpn-del]').forEach(function(b){
      b.addEventListener('click', function(){
        if (!confirm('Delete this coupon? Existing orders that used it keep their price - only future use is blocked.')) return;
        adminFetch('DELETE','/api/coupons/'+b.getAttribute('data-cpn-del')).then(function(){ showToast('Deleted','success'); loadCoupons(); }).catch(function(e){ showToast(e.message,'error'); });
      });
    });
  }
  function openCouponModal(c){
    c = c || {}; var isEdit = !!c.id;
    document.getElementById('couponModalTitle').textContent = isEdit ? 'Edit Coupon' : 'New Coupon';
    document.getElementById('couponModalBody').innerHTML =
      fld('Code','cp_code',c.code||'', isEdit) +
      sel('Type','cp_type',['fixed_discount','flat_price','program_price_map'],c.type||'fixed_discount') +
      '<div class="admin-form-hint" style="margin-top:-8px;">fixed_discount = rupees off &middot; flat_price = every eligible program costs this flat price &middot; program_price_map = a specific final price per program (paste JSON below)</div>' +
      fld('Discount amount / flat price (rupees)','cp_amount',c.discount_amount||'') +
      fld('Program price map (JSON, e.g. {"slug-a":999,"slug-b":1499}) - only for program_price_map type','cp_pricemap', c.program_prices?JSON.stringify(c.program_prices):'') +
      fld('Restrict to these program slugs (comma separated, blank = all programs)','cp_scope',(c.program_slugs||[]).join(', ')) +
      fld('Usage limit (blank = unlimited, 1 = one-time-use, N = limited)','cp_maxuses',c.max_uses==null?'':c.max_uses) +
      fld('Label shown to buyer','cp_label',c.label||'') +
      fld('Expires at (YYYY-MM-DD, optional)','cp_expiry',c.expires_at?String(c.expires_at).slice(0,10):'') +
      '<label class="admin-field" style="flex-direction:row;align-items:center;gap:10px;"><input type="checkbox" id="cp_exclusive" style="width:auto;"'+(c.exclusive?' checked':'')+'> <span>Exclusive - blocks stacking with a referral code</span></label>' +
      '<label class="admin-field" style="flex-direction:row;align-items:center;gap:10px;"><input type="checkbox" id="cp_active" style="width:auto;"'+(c.is_active!==false?' checked':'')+'> <span>Active</span></label>' +
      '<button class="btn" id="cp_save" style="margin-top:8px;">'+(isEdit?'Save Changes':'Create Coupon')+'</button>';
    document.getElementById('couponModal').style.display='flex';
    document.getElementById('cp_save').onclick = function(){
      var payload = {
        code: val('cp_code'), type: val('cp_type'),
        discount_amount: val('cp_amount') ? parseInt(val('cp_amount'),10) : '',
        program_slugs: val('cp_scope') ? val('cp_scope').split(',').map(function(s){return s.trim();}).filter(Boolean) : [],
        max_uses: val('cp_maxuses') ? parseInt(val('cp_maxuses'),10) : '',
        exclusive: checked('cp_exclusive'),
        is_active: checked('cp_active'),
        label: val('cp_label'),
        expires_at: val('cp_expiry') || null,
      };
      var pmRaw = val('cp_pricemap');
      if (pmRaw) {
        try { payload.program_prices = JSON.parse(pmRaw); }
        catch(err) { showToast('Program price map must be valid JSON','error'); return; }
      }
      var req = isEdit ? adminFetch('PUT','/api/coupons/'+c.id,payload) : adminFetch('POST','/api/coupons',payload);
      req.then(function(){ showToast(isEdit?'Saved':'Created','success'); document.getElementById('couponModal').style.display='none'; loadCoupons(); })
         .catch(function(e){ showToast(e.message,'error'); });
    };
  }

  /* ── HOMEPAGE CONTENT (carousel, ticker, quick links) ──
     All 3 sections share the same admin table + modal shape, driven by
     /api/homepage-content/:section, so one set of generic functions
     handles all of them instead of tripling near-identical code. */
  var HOMEPAGE_SECTIONS = {
    carousel:   { label: 'Carousel Slide', fields: [
      { id:'image_url',  label:'Image URL', required:true },
      { id:'link_url',   label:'Link URL' },
      { id:'title',      label:'Title (optional overlay text)' },
      { id:'badge',      label:'Badge (e.g. New)' },
    ]},
    ticker:     { label: 'Ticker Item', fields: [
      { id:'text',      label:'Text', required:true },
      { id:'link_url',  label:'Link URL' },
      { id:'badge',     label:'Badge (e.g. New)' },
    ]},
    quicklinks: { label: 'Quick Link', fields: [
      { id:'label',      label:'Label', required:true },
      { id:'link_url',   label:'Link URL', required:true },
      { id:'badge',      label:'Badge (e.g. New)' },
      { id:'group_name', label:'Group name (default: "default")' },
    ]},
  };
  function loadHomepageContent(section){
    var body = document.getElementById('homepage_' + section + '_Body');
    if (!body) return;
    adminFetch('GET','/api/homepage-content/'+section+'/admin/all').then(function(d){
      var items = d.items||[];
      if (!items.length){ body.innerHTML='<p class="admin-empty">Nothing here yet. Add one with the button above.</p>'; return; }
      var cfg = HOMEPAGE_SECTIONS[section];
      var rows = items.map(function(it){
        var primary = it[cfg.fields[0].id] || '';
        return '<tr><td>'+e(primary)+'</td><td>'+e(it.badge||'-')+'</td><td>'+it.sort_order+'</td>' +
          '<td><label class="admin-switch"><input type="checkbox" data-hc-vis="'+it.id+'" '+(it.is_visible?'checked':'')+'><span></span></label></td>' +
          '<td><button class="btn btn-sm" data-hc-edit="'+it.id+'">Edit</button> <button class="btn btn-sm btn-ghost" data-hc-del="'+it.id+'">Delete</button></td></tr>';
      }).join('');
      body.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>'+e(cfg.fields[0].label)+'</th><th>Badge</th><th>Order</th><th>Visible</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      bindHomepageRowActions(section, items);
    }).catch(function(err){ body.innerHTML='<p class="admin-empty">'+e(err.message)+'</p>'; });
  }
  function bindHomepageRowActions(section, items){
    document.querySelectorAll('[data-hc-vis]').forEach(function(cb){
      cb.addEventListener('change', function(){
        adminFetch('PATCH','/api/homepage-content/'+section+'/'+cb.getAttribute('data-hc-vis')+'/visibility',{is_visible:cb.checked})
          .then(function(){ showToast('Updated','success'); }).catch(function(e){ showToast(e.message,'error'); cb.checked=!cb.checked; });
      });
    });
    document.querySelectorAll('[data-hc-edit]').forEach(function(b){
      b.addEventListener('click', function(){ openHomepageModal(section, items.filter(function(x){return x.id==b.getAttribute('data-hc-edit');})[0]); });
    });
    document.querySelectorAll('[data-hc-del]').forEach(function(b){
      b.addEventListener('click', function(){
        if (!confirm('Delete this item?')) return;
        adminFetch('DELETE','/api/homepage-content/'+section+'/'+b.getAttribute('data-hc-del')).then(function(){ showToast('Deleted','success'); loadHomepageContent(section); }).catch(function(e){ showToast(e.message,'error'); });
      });
    });
  }
  function openHomepageModal(section, it){
    it = it || {}; var isEdit = !!it.id;
    var cfg = HOMEPAGE_SECTIONS[section];
    document.getElementById('homepageModalTitle').textContent = (isEdit?'Edit ':'New ') + cfg.label;
    document.getElementById('homepageModalBody').innerHTML =
      cfg.fields.map(function(f){ return fld(f.label + (f.required?' *':''), 'hc_'+f.id, it[f.id]||''); }).join('') +
      fld('Sort order (lower = first)','hc_sort',it.sort_order||0) +
      '<label class="admin-field" style="flex-direction:row;align-items:center;gap:10px;"><input type="checkbox" id="hc_visible" style="width:auto;"'+(it.is_visible!==false?' checked':'')+'> <span>Visible</span></label>' +
      '<button class="btn" id="hc_save" style="margin-top:8px;">'+(isEdit?'Save Changes':'Create')+'</button>';
    document.getElementById('homepageModal').style.display='flex';
    document.getElementById('hc_save').onclick = function(){
      var payload = { sort_order: parseInt(val('hc_sort')||'0',10), is_visible: checked('hc_visible') };
      var missing = null;
      cfg.fields.forEach(function(f){
        payload[f.id] = val('hc_'+f.id);
        if (f.required && !payload[f.id]) missing = f.label;
      });
      if (missing) { showToast(missing+' is required','error'); return; }
      var req = isEdit ? adminFetch('PUT','/api/homepage-content/'+section+'/'+it.id,payload) : adminFetch('POST','/api/homepage-content/'+section,payload);
      req.then(function(){ showToast(isEdit?'Saved':'Created','success'); document.getElementById('homepageModal').style.display='none'; loadHomepageContent(section); })
         .catch(function(e){ showToast(e.message,'error'); });
    };
  }

  /* ── ANALYTICS ── */
  function loadBizAnalytics(){
    var activeBtn = document.querySelector('.anal-period.active');
    var body = document.getElementById('analyticsBody');
    var qs, label;
    if (activeBtn && activeBtn.getAttribute('data-period')) {
      var period = activeBtn.getAttribute('data-period');
      qs    = 'period=' + period;
      label = period.charAt(0).toUpperCase() + period.slice(1);
    } else {
      var days = activeBtn ? (activeBtn.getAttribute('data-days') || '7') : '7';
      qs    = 'days=' + days;
      label = days + 'd';
    }
    body.innerHTML = '<p class="admin-empty">Loading...</p>';
    adminFetch('GET','/api/events/summary?' + qs).then(function(d){
      var f = d.funnel||{};
      var byType = {}; (d.by_type||[]).forEach(function(r){ byType[r.type]=r.count; });
      var cards =
        statCard('Active now (30m)', d.active_now||0) +
        statCard('Page views', byType.page_view||0) +
        statCard('Program views', f.program_views||0) +
        statCard('WhatsApp clicks', byType.whatsapp_click||0) +
        statCard('Call clicks', byType.call_click||0) +
        statCard('Enquiry clicks', byType.enquiry_click||0);
      var funnel =
        '<h3 style="margin:24px 0 12px;font-size:16px;">Checkout Funnel ('+label+')</h3><div class="admin-stat-row">' +
        statCard('Program views', f.program_views||0) +
        statCard('Checkout started', f.checkout_starts||0) +
        statCard('Checkout exited', f.checkout_exits||0) +
        statCard('Payments', f.payments||0) + '</div>';
      var typeRows = (d.by_type||[]).map(function(r){ return '<tr><td>'+e(r.type)+'</td><td>'+r.count+'</td></tr>'; }).join('');
      var emptyMsg = typeRows ? '' : '<tr><td colspan="2" style="color:#9ca3af;padding:16px;text-align:center;">No events recorded for this period</td></tr>';
      body.innerHTML = '<div class="admin-stat-row">'+cards+'</div>'+funnel +
        '<h3 style="margin:24px 0 12px;font-size:16px;">All events ('+label+')</h3>' +
        '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Event</th><th>Count</th></tr></thead><tbody>'+typeRows+emptyMsg+'</tbody></table></div>';
    }).catch(function(err){ body.innerHTML='<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  /* ── small UI helpers ── */
  function fld(label,id,v,disabled){ return '<label class="admin-field"><span>'+e(label)+'</span><input class="admin-input" id="'+id+'" value="'+e(v)+'"'+(disabled?' disabled':'')+'></label>'; }
  function sel(label,id,opts,cur){ return '<label class="admin-field"><span>'+e(label)+'</span><select class="admin-input" id="'+id+'">'+opts.map(function(o){return '<option value="'+o+'"'+(o===cur?' selected':'')+'>'+(STATUS_LABELS[o]||o)+'</option>';}).join('')+'</select></label>'; }
  function val(id){ var el=document.getElementById(id); return el?el.value.trim():''; }
  function checked(id){ var el=document.getElementById(id); return el?!!el.checked:false; }
  function statCard(label,v){ return '<div class="admin-stat-card"><div class="admin-stat-val">'+e(v)+'</div><div class="admin-stat-lbl">'+e(label)+'</div></div>'; }

  /* ── PRESET TAG BADGES ──
     Same fixed list + colour map used for program cards, so admins
     pick from a known set instead of free-typing inconsistent tags. */
  var PRESET_TAGS = {
    'New':             '#C81240',
    'Bestseller':      '#B45309',
    'Highest Enrolled':'#166534',
    'Limited Seats':   '#9A3412',
    'Closing Soon':    '#6D28D9',
  };
  function tagCheckboxes(idPrefix, current){
    current = current || [];
    return '<label class="admin-field"><span>Tags</span><div style="display:flex;flex-wrap:wrap;gap:12px;padding:8px 0;">' +
      Object.keys(PRESET_TAGS).map(function(t){
        var cid = idPrefix + '_' + t.replace(/\s+/g,'');
        return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;">' +
          '<input type="checkbox" id="'+cid+'" data-tag="'+e(t)+'"'+(current.indexOf(t)!==-1?' checked':'')+'> '+e(t) +
          '</label>';
      }).join('') + '</div></label>';
  }
  function collectTagCheckboxes(idPrefix){
    return Object.keys(PRESET_TAGS).filter(function(t){
      var cid = idPrefix + '_' + t.replace(/\s+/g,'');
      return checked(cid);
    });
  }
  function tagBadgesHtml(tags){
    return (tags||[]).map(function(t){
      var color = PRESET_TAGS[t] || '#6b6b8a';
      return '<span style="font-size:9px;font-weight:800;color:'+color+';background:'+color+'1a;border-radius:8px;padding:2px 7px;margin-right:4px;vertical-align:middle;">'+e(t)+'</span>';
    }).join('');
  }

  function bindBizSections(){
    /* OMR Papers - send test papers to enrolled learners (or a single test address when `sample` is set) */
    function sendOmrPapers(slug, testNum, qpUrl, omrUrl, btn, resultEl, sample, category) {
      if (!testNum) { alert('Please select a test number.'); return; }
      if (!qpUrl || !qpUrl.startsWith('http')) { alert('Please enter a valid Question Paper Google Drive URL.'); return; }
      if (!omrUrl || !omrUrl.startsWith('http')) { alert('Please enter a valid OMR Sheet Google Drive URL.'); return; }
      var idleLabel = sample ? '<i class="fas fa-vial"></i> Send Sample' : '<i class="fas fa-paper-plane"></i> Send Papers';
      if (sample) {
        if (!sample.email) { alert('Please enter a test email to send a sample.'); return; }
      } else if (!confirm('Send Test ' + String(testNum).padStart(2,'0') + ' papers to ALL enrolled learners for this program? This cannot be undone.')) {
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      resultEl.style.display = 'none';
      var body = { program_slug: slug, test_number: testNum, question_paper_url: qpUrl, omr_sheet_url: omrUrl };
      if (category) body.category = category;
      if (sample) { body.sample_email = sample.email; if (sample.phone) body.sample_phone = sample.phone; }
      fetch(API_BASE + '/api/enrollment/admin/send-omr-papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify(body),
      })
      .then(function(r){ return r.json(); })
      .then(function(data){
        resultEl.style.display = 'block';
        if (data.error) {
          resultEl.style.background = '#fef2f2'; resultEl.style.border = '1px solid #fca5a5'; resultEl.style.color = '#991b1b';
          resultEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error: ' + data.error;
          btn.disabled = false; btn.innerHTML = idleLabel;
        } else {
          resultEl.style.background = '#f0fdf4'; resultEl.style.border = '1px solid #86efac'; resultEl.style.color = '#166534';
          resultEl.innerHTML = '<i class="fas fa-check-circle"></i> ' + (data.message || 'Sending in background...');
          if (sample) { btn.disabled = false; btn.innerHTML = idleLabel; }
          else        { btn.innerHTML = '<i class="fas fa-check"></i> Sent'; }
        }
      })
      .catch(function(){
        resultEl.style.display = 'block';
        resultEl.style.background = '#fef2f2'; resultEl.style.border = '1px solid #fca5a5'; resultEl.style.color = '#991b1b';
        resultEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Network error. Please try again.';
        btn.disabled = false; btn.innerHTML = idleLabel;
      });
    }

    /* ── Generic program picker shared by both the Papers and Analysis
       cards: populated from every OMR-enabled program in the DB, instead
       of the old hardcoded Degree/Diploma/Combo dropdowns. Selecting a
       combo program (one with omr_categories set) reveals a Category
       picker so the admin can send the Degree paper vs the Diploma
       paper (or Paper 1 vs Paper 2) separately, same as before. ── */
    var omrProgramsCache = [];
    function loadOmrProgramPicker() {
      var sel = document.getElementById('omrProgramSelect');
      if (!sel) return;
      adminFetch('GET', '/api/programs/admin/all').then(function(d) {
        omrProgramsCache = (d.programs || []).filter(function(p) { return p.omr_enabled; });
        sel.innerHTML = '<option value="">-- Select Program --</option>' +
          omrProgramsCache.map(function(p) { return '<option value="' + p.slug + '">' + e(p.title) + '</option>'; }).join('');
        updateOmrCategoryPicker();
      }).catch(function(err) { sel.innerHTML = '<option value="">Failed to load programs</option>'; showToast(err.message, 'error'); });
    }
    function selectedOmrProgram() {
      var sel = document.getElementById('omrProgramSelect');
      var slug = sel ? sel.value : '';
      return omrProgramsCache.filter(function(p) { return p.slug === slug; })[0] || null;
    }
    function updateOmrCategoryPicker() {
      var p = selectedOmrProgram();
      var row = document.getElementById('omrCategoryRow');
      var catSel = document.getElementById('omrCategorySelect');
      if (!row || !catSel) return;
      var cats = (p && Array.isArray(p.omr_categories)) ? p.omr_categories : [];
      if (cats.length) {
        catSel.innerHTML = cats.map(function(c) { return '<option value="' + e(c) + '">' + e(c.charAt(0).toUpperCase() + c.slice(1)) + '</option>'; }).join('');
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
      var totalEl = document.getElementById('omrTestNum');
      if (totalEl) totalEl.max = (p && p.total_tests) ? p.total_tests : '';
    }
    var omrProgramSelectEl = document.getElementById('omrProgramSelect');
    if (omrProgramSelectEl) omrProgramSelectEl.addEventListener('change', updateOmrCategoryPicker);

    /* ── Send Test Papers (generic) ── */
    var btnSendOmrPapers = document.getElementById('btnSendOmrPapers');
    if (btnSendOmrPapers) {
      btnSendOmrPapers.addEventListener('click', function() {
        var p = selectedOmrProgram();
        if (!p) { alert('Please select a program.'); return; }
        var catSel = document.getElementById('omrCategorySelect');
        var category = (document.getElementById('omrCategoryRow').style.display !== 'none' && catSel) ? catSel.value : null;
        sendOmrPapers(p.slug,
          document.getElementById('omrTestNum').value,
          document.getElementById('omrQpUrl').value,
          document.getElementById('omrSheetUrl').value,
          btnSendOmrPapers, document.getElementById('omrPapersResult'), null, category);
      });
    }
    var btnSendOmrPapersSample = document.getElementById('btnSendOmrPapersSample');
    if (btnSendOmrPapersSample) {
      btnSendOmrPapersSample.addEventListener('click', function() {
        var p = selectedOmrProgram();
        if (!p) { alert('Please select a program.'); return; }
        var catSel = document.getElementById('omrCategorySelect');
        var category = (document.getElementById('omrCategoryRow').style.display !== 'none' && catSel) ? catSel.value : null;
        sendOmrPapers(p.slug,
          document.getElementById('omrTestNum').value,
          document.getElementById('omrQpUrl').value,
          document.getElementById('omrSheetUrl').value,
          btnSendOmrPapersSample, document.getElementById('omrPapersResult'),
          { email: document.getElementById('omrPapersTestEmail').value.trim(), phone: document.getElementById('omrPapersTestPhone').value.trim() },
          category);
      });
    }

    /* Multi-link Drive URL groups (Detailed Analysis & Solutions / Analysis Workbook can each be more than one file) */
    function addOmrUrlRow(containerId, inputClass) {
      var container = document.getElementById(containerId);
      if (!container) return;
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;';
      var input = document.createElement('input');
      input.type = 'url';
      input.className = inputClass;
      input.placeholder = 'https://drive.google.com/file/d/...';
      input.style.cssText = 'flex:1;min-width:0;padding:9px 12px;border:1.5px solid rgba(26,26,46,.12);border-radius:8px;font-size:13px;box-sizing:border-box;';
      row.appendChild(input);
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.innerHTML = '<i class="fas fa-times"></i>';
      removeBtn.title = 'Remove this link';
      removeBtn.style.cssText = 'background:none;border:none;color:#9ca3af;cursor:pointer;font-size:14px;padding:4px 8px;';
      removeBtn.addEventListener('click', function(){ row.remove(); });
      row.appendChild(removeBtn);
      container.appendChild(row);
      input.focus();
    }
    function collectOmrUrls(inputClass) {
      return Array.prototype.slice.call(document.getElementsByClassName(inputClass))
        .map(function(el){ return el.value.trim(); })
        .filter(function(v){ return v && v.startsWith('http'); });
    }
    [
      ['btnAddAnalysisAnalysisUrl', 'analysisAnalysisUrls', 'analysisAnalysisUrlInput'],
      ['btnAddAnalysisWorkbookUrl', 'analysisWorkbookUrls', 'analysisWorkbookUrlInput'],
    ].forEach(function(cfg) {
      var btn = document.getElementById(cfg[0]);
      if (btn) btn.addEventListener('click', function(){ addOmrUrlRow(cfg[1], cfg[2]); });
    });

    /* OMR Analysis - send Detailed Analysis & Solutions + Workbook (each may be multiple files) to enrolled learners (or a single test address when `sample` is set) */
    function sendOmrAnalysis(slug, testNum, analysisUrls, workbookUrls, btn, resultEl, sample, category) {
      if (!testNum) { alert('Please select a test number.'); return; }
      if (!analysisUrls.length) { alert('Please enter at least one valid Detailed Analysis & Solutions Google Drive URL.'); return; }
      if (!workbookUrls.length)  { alert('Please enter at least one valid Analysis Workbook Google Drive URL.'); return; }
      var idleLabel = sample ? '<i class="fas fa-vial"></i> Send Sample' : '<i class="fas fa-paper-plane"></i> Send Analysis';
      if (sample) {
        if (!sample.email) { alert('Please enter a test email to send a sample.'); return; }
      } else if (!confirm('Send Test ' + String(testNum).padStart(2,'0') + ' analysis & workbook to ALL enrolled learners for this program? This cannot be undone.')) {
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      resultEl.style.display = 'none';
      var body = { program_slug: slug, test_number: testNum, analysis_urls: analysisUrls, workbook_urls: workbookUrls };
      if (category) body.category = category;
      if (sample) { body.sample_email = sample.email; if (sample.phone) body.sample_phone = sample.phone; }
      fetch(API_BASE + '/api/enrollment/admin/send-omr-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify(body),
      })
      .then(function(r){ return r.json(); })
      .then(function(data){
        resultEl.style.display = 'block';
        if (data.error) {
          resultEl.style.background = '#fef2f2'; resultEl.style.border = '1px solid #fca5a5'; resultEl.style.color = '#991b1b';
          resultEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error: ' + data.error;
          btn.disabled = false; btn.innerHTML = idleLabel;
        } else {
          resultEl.style.background = '#f0fdf4'; resultEl.style.border = '1px solid #86efac'; resultEl.style.color = '#166534';
          resultEl.innerHTML = '<i class="fas fa-check-circle"></i> ' + (data.message || 'Sending in background...');
          if (sample) { btn.disabled = false; btn.innerHTML = idleLabel; }
          else        { btn.innerHTML = '<i class="fas fa-check"></i> Sent'; }
        }
      })
      .catch(function(){
        resultEl.style.display = 'block';
        resultEl.style.background = '#fef2f2'; resultEl.style.border = '1px solid #fca5a5'; resultEl.style.color = '#991b1b';
        resultEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Network error. Please try again.';
        btn.disabled = false; btn.innerHTML = idleLabel;
      });
    }

    /* ── Send Analysis & Workbook (generic) - reuses the same program/category/test-number picker as the Papers card above ── */
    var btnSendOmrAnalysis = document.getElementById('btnSendOmrAnalysis');
    if (btnSendOmrAnalysis) {
      btnSendOmrAnalysis.addEventListener('click', function() {
        var p = selectedOmrProgram();
        if (!p) { alert('Please select a program.'); return; }
        var catSel = document.getElementById('omrCategorySelect');
        var category = (document.getElementById('omrCategoryRow').style.display !== 'none' && catSel) ? catSel.value : null;
        sendOmrAnalysis(p.slug,
          document.getElementById('omrTestNum').value,
          collectOmrUrls('analysisAnalysisUrlInput'),
          collectOmrUrls('analysisWorkbookUrlInput'),
          btnSendOmrAnalysis, document.getElementById('analysisResult'), null, category);
      });
    }
    var btnSendOmrAnalysisSample = document.getElementById('btnSendOmrAnalysisSample');
    if (btnSendOmrAnalysisSample) {
      btnSendOmrAnalysisSample.addEventListener('click', function() {
        var p = selectedOmrProgram();
        if (!p) { alert('Please select a program.'); return; }
        var catSel = document.getElementById('omrCategorySelect');
        var category = (document.getElementById('omrCategoryRow').style.display !== 'none' && catSel) ? catSel.value : null;
        sendOmrAnalysis(p.slug,
          document.getElementById('omrTestNum').value,
          collectOmrUrls('analysisAnalysisUrlInput'),
          collectOmrUrls('analysisWorkbookUrlInput'),
          btnSendOmrAnalysisSample, document.getElementById('analysisResult'),
          { email: document.getElementById('analysisTestEmail').value.trim(), phone: document.getElementById('analysisTestPhone').value.trim() },
          category);
      });
    }

    loadOmrProgramPicker();

    var np=document.getElementById('btnNewProgram'); if(np) np.onclick=function(){openProgramModal(null);};
    var nb=document.getElementById('btnNewBanner'); if(nb) nb.onclick=function(){openBannerModal(null);};
    var pc=document.getElementById('programModalClose'); if(pc) pc.onclick=function(){document.getElementById('programModal').style.display='none';};
    var bc=document.getElementById('bannerModalClose'); if(bc) bc.onclick=function(){document.getElementById('bannerModal').style.display='none';};
    var ncp=document.getElementById('btnNewCoupon'); if(ncp) ncp.onclick=function(){openCouponModal(null);};
    var cpc=document.getElementById('couponModalClose'); if(cpc) cpc.onclick=function(){document.getElementById('couponModal').style.display='none';};
    ['carousel','ticker','quicklinks'].forEach(function(section){
      var btn = document.getElementById('btnNewHomepage_' + section);
      if (btn) btn.onclick = function(){ openHomepageModal(section, null); };
    });
    var hmc=document.getElementById('homepageModalClose'); if(hmc) hmc.onclick=function(){document.getElementById('homepageModal').style.display='none';};
    // Status filter triggers client-side filter (no reload needed)
    var rpf=document.getElementById('referralPayoutFilter'); if(rpf) rpf.onchange=loadReferralPayouts;
    var bbf=document.getElementById('btnBackfillReferralCodes'); if(bbf) bbf.onclick=function(){
      bbf.disabled = true; bbf.textContent = 'Generating...';
      adminFetch('POST', '/api/payment/admin/backfill-referral-codes').then(function(d){
        showToast('Generated codes for '+d.assigned+' learner(s)', 'success');
        bbf.disabled = false; bbf.textContent = 'Generate codes for past learners';
        loadReferralCodesAdmin();
      }).catch(function(err){
        showToast(err.message, 'error');
        bbf.disabled = false; bbf.textContent = 'Generate codes for past learners';
      });
    };
    var ef=document.getElementById('enrollFilter'); if(ef) ef.onchange=applyEnrollFilters;
    var pf=document.getElementById('enrollProgramFilter'); if(pf) pf.onchange=applyEnrollFilters;
    var df=document.getElementById('enrollDateFrom'); if(df) df.onchange=applyEnrollFilters;
    var dt=document.getElementById('enrollDateTo'); if(dt) dt.onchange=applyEnrollFilters;
    var cf=document.getElementById('enrollClearFilters');
    if(cf) cf.onclick=function(){
      var pf2=document.getElementById('enrollProgramFilter'); if(pf2) pf2.value='';
      var ef2=document.getElementById('enrollFilter'); if(ef2) ef2.value='';
      var df2=document.getElementById('enrollDateFrom'); if(df2) df2.value='';
      var dt2=document.getElementById('enrollDateTo'); if(dt2) dt2.value='';
      applyEnrollFilters();
    };
    var re=document.getElementById('btnRefreshEnrollments'); if(re) re.onclick=loadEnrollments;
    var ae=document.getElementById('btnAddEnrollment'); if(ae) ae.onclick=openAddEnrollmentModal;
    var aec=document.getElementById('addEnrollmentModalClose'); if(aec) aec.onclick=function(){document.getElementById('addEnrollmentModal').style.display='none';};
    var scc=document.getElementById('scheduleModalClose'); if(scc) scc.onclick=function(){document.getElementById('scheduleModal').style.display='none';};

    /* Enrollment period tabs */
    var enrollPeriodBtns = document.querySelectorAll('#enrollPeriodTabs .filter-tab');
    enrollPeriodBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        enrollPeriodBtns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        loadEnrollments();
      });
    });

    /* Analytics period buttons */
    var analBtns = document.querySelectorAll('.anal-period');
    analBtns.forEach(function(btn){
      btn.addEventListener('click', function(){
        analBtns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        loadBizAnalytics();
      });
    });
  }

  /* ══════════════════════════════════════════════
     OMR TEST CHECKER (admin-only bubble-sheet grading)
     Distinct from the "OMR Papers"/"OMR Analysis" sections above, which
     only email question-paper PDFs and have nothing to do with grading.
     ══════════════════════════════════════════════ */

  var omrCheckerTab = 'templates';
  var omrCheckerData = { templates: [], tests: [], currentTemplate: null, currentTestId: null };
  var omrCal = null; // active calibration-canvas wizard state

  function loadOmrChecker(){
    document.querySelectorAll('.omr-check-tab').forEach(function(btn){
      btn.onclick = function(){
        document.querySelectorAll('.omr-check-tab').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        omrCheckerTab = btn.getAttribute('data-omr-tab');
        omrRenderCheckerTab();
      };
    });
    omrRenderCheckerTab();
  }

  function omrRenderCheckerTab(){
    if (omrCheckerTab === 'templates') omrLoadTemplates();
    else if (omrCheckerTab === 'tests') omrLoadTests();
    else omrLoadSubmissionsTab();
  }

  /* ── Templates ── */

  function omrLoadTemplates(){
    var body = document.getElementById('omrCheckerBody');
    body.innerHTML = '<p class="admin-empty">Loading…</p>';
    adminFetch('GET','/api/omr-check/templates').then(function(d){
      omrCheckerData.templates = d.templates || [];
      omrRenderTemplatesList();
    }).catch(function(err){ body.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  function omrRenderTemplatesList(){
    var body = document.getElementById('omrCheckerBody');
    var rows = omrCheckerData.templates.map(function(t){
      var calibrated = (t.question_blocks && t.question_blocks.length)
        ? '<span class="badge badge-visible">Calibrated</span>'
        : '<span class="badge badge-hidden">Not calibrated</span>';
      var thumb = t.reference_image_url
        ? '<img src="'+e(t.reference_image_url)+'" style="width:50px;height:70px;object-fit:cover;border-radius:6px;">'
        : '-';
      return '<tr><td>'+e(t.name)+'</td><td>'+thumb+'</td><td>'+calibrated+'</td><td>'+(t.test_count||0)+'</td>' +
        '<td><button class="btn btn-sm" data-tpl-cal="'+t.id+'">Calibrate</button> ' +
        '<button class="btn btn-sm btn-ghost" data-tpl-del="'+t.id+'">Delete</button></td></tr>';
    }).join('');

    body.innerHTML =
      '<div style="margin-bottom:14px;"><button class="btn" id="btnNewOmrTemplate"><i class="fas fa-plus"></i> New Template</button></div>' +
      (omrCheckerData.templates.length
        ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Name</th><th>Reference</th><th>Status</th><th>Tests</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'
        : '<p class="admin-empty">No templates yet. Create one to calibrate a physical OMR sheet design - it can be reused across many tests.</p>');

    document.getElementById('btnNewOmrTemplate').addEventListener('click', omrOpenNewTemplateForm);
    document.querySelectorAll('[data-tpl-cal]').forEach(function(b){
      b.addEventListener('click', function(){
        var t = omrCheckerData.templates.filter(function(x){ return x.id == b.getAttribute('data-tpl-cal'); })[0];
        omrOpenCalibration(t);
      });
    });
    document.querySelectorAll('[data-tpl-del]').forEach(function(b){
      b.addEventListener('click', function(){
        if (!confirm('Delete this template? Tests using it must be removed first.')) return;
        adminFetch('DELETE','/api/omr-check/templates/'+b.getAttribute('data-tpl-del'))
          .then(function(){ showToast('Deleted','success'); omrLoadTemplates(); })
          .catch(function(err){ showToast(err.message,'error'); });
      });
    });
  }

  function omrOpenNewTemplateForm(){
    var body = document.getElementById('omrCheckerBody');
    body.innerHTML =
      '<div class="admin-card" style="max-width:480px;">' +
        '<h3 style="margin-top:0;">New OMR Template</h3>' +
        '<label class="admin-field"><span>Template Name</span><input class="admin-input" id="tplName" placeholder="e.g. RSSB JE - Candidate Copy (bubble roll no.)"></label>' +
        '<label class="admin-field"><span>Reference Sheet Image (blank or filled sample)</span><input type="file" id="tplRefImage" accept="image/*"></label>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button class="btn" id="tplSaveBtn">Create &amp; Continue to Calibration</button>' +
          '<button class="btn btn-ghost" id="tplCancelBtn">Cancel</button>' +
        '</div>' +
      '</div>';

    document.getElementById('tplCancelBtn').addEventListener('click', omrLoadTemplates);
    document.getElementById('tplSaveBtn').addEventListener('click', function(){
      var name = document.getElementById('tplName').value.trim();
      var file = document.getElementById('tplRefImage').files[0];
      if (!name) { showToast('Name is required','error'); return; }
      if (!file) { showToast('Reference image is required','error'); return; }

      var btn = this;
      btn.disabled = true; btn.textContent = 'Creating...';
      adminFetch('POST','/api/omr-check/templates', { name: name }).then(function(d){
        var fd = new FormData();
        fd.append('image', file);
        return adminFetch('POST','/api/omr-check/templates/'+d.template.id+'/reference-image', fd);
      }).then(function(d2){
        showToast('Template created - now calibrate it','success');
        omrOpenCalibration(d2.template);
      }).catch(function(err){
        showToast(err.message,'error');
        btn.disabled = false; btn.textContent = 'Create & Continue to Calibration';
      });
    });
  }

  function omrCalOptionLetters(n){ return ['A','B','C','D','E'].slice(0, n); }

  function omrOpenCalibration(template){
    omrCheckerData.currentTemplate = template;
    omrCal = null;
    var body = document.getElementById('omrCheckerBody');
    body.innerHTML =
      '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">' +
        '<button class="btn btn-ghost btn-sm" id="omrCalBack">&larr; Back to Templates</button>' +
        '<h3 style="margin:0;">Calibrate: '+e(template.name)+'</h3>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;">' +
        '<label class="admin-field" style="width:130px;"><span>Blocks (columns)</span><input class="admin-input" id="omrCalBlocks" type="number" value="4" min="1"></label>' +
        '<label class="admin-field" style="width:160px;"><span>Questions per block</span><input class="admin-input" id="omrCalPerBlock" type="number" value="30" min="1"></label>' +
        '<label class="admin-field" style="width:120px;"><span>Options (A-?)</span><input class="admin-input" id="omrCalOptions" type="number" value="5" min="2" max="5"></label>' +
        '<label class="admin-field" style="flex-direction:row;align-items:center;gap:8px;width:auto;display:flex;"><input type="checkbox" id="omrCalHasRoll" style="width:auto;"> <span>Bubble-grid roll number</span></label>' +
        '<label class="admin-field" style="width:120px;"><span>Roll no. digits</span><input class="admin-input" id="omrCalRollDigits" type="number" value="5" min="1"></label>' +
        '<button class="btn btn-sm" id="omrCalStartBtn">Start Calibration</button>' +
      '</div>' +
      '<div id="omrCalInstruction" style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:10px 14px;font-size:13px;color:#4338CA;font-weight:700;margin-bottom:10px;display:none;"></div>' +
      '<div class="omr-cal-canvas-wrap">' +
        '<img id="omrCalImage" src="'+e(template.reference_image_url)+'">' +
        '<canvas id="omrCalCanvas" class="omr-cal-canvas"></canvas>' +
      '</div>' +
      '<div style="margin-top:14px;display:flex;gap:8px;">' +
        '<button class="btn btn-ghost btn-sm" id="omrCalUndoBtn" disabled>Undo Last Click</button>' +
        '<button class="btn btn-sm" id="omrCalPreviewBtn" disabled>Preview</button>' +
        '<button class="btn" id="omrCalSaveBtn" disabled>Save Calibration</button>' +
      '</div>';

    document.getElementById('omrCalBack').addEventListener('click', omrLoadTemplates);

    var img = document.getElementById('omrCalImage');
    var canvas = document.getElementById('omrCalCanvas');
    function sizeCanvas(){
      canvas.width  = img.naturalWidth  || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.style.width  = img.clientWidth  + 'px';
      canvas.style.height = img.clientHeight + 'px';
      if (omrCal) omrCalRedraw();
    }
    if (img.complete && img.naturalWidth) sizeCanvas(); else img.addEventListener('load', sizeCanvas);
    window.addEventListener('resize', sizeCanvas);

    document.getElementById('omrCalStartBtn').addEventListener('click', function(){
      var numBlocks  = parseInt(document.getElementById('omrCalBlocks').value, 10) || 4;
      var perBlock   = parseInt(document.getElementById('omrCalPerBlock').value, 10) || 30;
      var optCount   = parseInt(document.getElementById('omrCalOptions').value, 10) || 5;
      var hasRoll    = document.getElementById('omrCalHasRoll').checked;
      var rollDigits = parseInt(document.getElementById('omrCalRollDigits').value, 10) || 5;
      omrCalStart(numBlocks, perBlock, optCount, hasRoll, rollDigits, canvas);
      this.disabled = true;
    });
  }

  function omrCalStart(numBlocks, perBlock, optCount, hasRoll, rollDigits, canvas){
    var optionLetters = omrCalOptionLetters(optCount);
    var steps = [];
    for (var b = 0; b < numBlocks; b++){
      var startQ = b*perBlock + 1, endQ = (b+1)*perBlock;
      steps.push({ kind:'question_anchor', block:b, question:startQ, option:optionLetters[0],
        label:'Click Q'+startQ+' option '+optionLetters[0]+' (block '+(b+1)+' of '+numBlocks+')' });
      steps.push({ kind:'question_anchor', block:b, question:endQ, option:optionLetters[optionLetters.length-1],
        label:'Click Q'+endQ+' option '+optionLetters[optionLetters.length-1]+' (block '+(b+1)+' of '+numBlocks+')' });
    }
    ['Top-left','Top-right','Bottom-right','Bottom-left'].forEach(function(corner){
      steps.push({ kind:'corner', label:'Click the sheet’s '+corner+' outer (paper) corner' });
    });
    if (hasRoll){
      steps.push({ kind:'roll_anchor', which:'start', label:'Click Roll Number digit 1, value 0' });
      steps.push({ kind:'roll_anchor', which:'end', label:'Click Roll Number last digit ('+rollDigits+'), value 9' });
    }

    omrCal = {
      numBlocks:numBlocks, perBlock:perBlock, optCount:optCount, optionLetters:optionLetters,
      hasRoll:hasRoll, rollDigits:rollDigits, steps:steps, stepIndex:0, clicks:[], canvas:canvas,
    };

    document.getElementById('omrCalInstruction').style.display = 'block';
    omrCalShowInstruction();

    canvas.onclick = function(ev){
      if (!omrCal || omrCal.stepIndex >= omrCal.steps.length) return;
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      var x = (ev.clientX - rect.left) * scaleX;
      var y = (ev.clientY - rect.top) * scaleY;
      omrCal.clicks.push({ step: omrCal.steps[omrCal.stepIndex], x:x, y:y });
      omrCal.stepIndex++;
      omrCalRedraw();
      omrCalShowInstruction();
      document.getElementById('omrCalUndoBtn').disabled = omrCal.clicks.length === 0;
      var done = omrCal.stepIndex >= omrCal.steps.length;
      document.getElementById('omrCalPreviewBtn').disabled = !done;
      document.getElementById('omrCalSaveBtn').disabled = !done;
    };

    document.getElementById('omrCalUndoBtn').addEventListener('click', function(){
      if (!omrCal.clicks.length) return;
      omrCal.clicks.pop();
      omrCal.stepIndex = Math.max(0, omrCal.stepIndex - 1);
      omrCalRedraw();
      omrCalShowInstruction();
      this.disabled = omrCal.clicks.length === 0;
      document.getElementById('omrCalPreviewBtn').disabled = true;
      document.getElementById('omrCalSaveBtn').disabled = true;
    });

    document.getElementById('omrCalPreviewBtn').addEventListener('click', omrCalPreview);
    document.getElementById('omrCalSaveBtn').addEventListener('click', omrCalSave);
  }

  function omrCalShowInstruction(){
    var el = document.getElementById('omrCalInstruction');
    if (omrCal.stepIndex >= omrCal.steps.length){
      el.textContent = 'All anchors captured. Click Preview to double-check alignment, then Save Calibration.';
    } else {
      el.textContent = 'Step '+(omrCal.stepIndex+1)+' of '+omrCal.steps.length+': '+omrCal.steps[omrCal.stepIndex].label;
    }
  }

  function omrCalRedraw(){
    var canvas = omrCal.canvas;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    omrCal.clicks.forEach(function(c){
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8, 0, Math.PI*2);
      ctx.fillStyle = c.step.kind === 'corner' ? 'rgba(59,130,246,0.85)'
        : (c.step.kind === 'roll_anchor' ? 'rgba(234,179,8,0.9)' : 'rgba(220,38,38,0.85)');
      ctx.fill();
    });
  }

  function omrCalBuildPayload(){
    var blocks = [];
    for (var b = 0; b < omrCal.numBlocks; b++){
      var startQ = b*omrCal.perBlock + 1, endQ = (b+1)*omrCal.perBlock;
      var startClick = omrCal.clicks.filter(function(c){ return c.step.kind==='question_anchor' && c.step.block===b && c.step.question===startQ; })[0];
      var endClick   = omrCal.clicks.filter(function(c){ return c.step.kind==='question_anchor' && c.step.block===b && c.step.question===endQ; })[0];
      blocks.push({
        start_question: startQ, end_question: endQ,
        top_left_anchor:     { question: startQ, option: startClick.step.option, x: startClick.x, y: startClick.y },
        bottom_right_anchor: { question: endQ,   option: endClick.step.option,   x: endClick.x,   y: endClick.y },
        option_order: omrCal.optionLetters,
      });
    }

    var cornerClicks = omrCal.clicks.filter(function(c){ return c.step.kind === 'corner'; });
    var corner_points = cornerClicks.map(function(c){ return { x:c.x, y:c.y }; });

    var roll_number_grid = null;
    if (omrCal.hasRoll){
      var rollStart = omrCal.clicks.filter(function(c){ return c.step.kind==='roll_anchor' && c.step.which==='start'; })[0];
      var rollEnd   = omrCal.clicks.filter(function(c){ return c.step.kind==='roll_anchor' && c.step.which==='end'; })[0];
      roll_number_grid = {
        digit_count: omrCal.rollDigits,
        top_left_anchor:     { digit:1, value:0, x: rollStart.x, y: rollStart.y },
        bottom_right_anchor: { digit: omrCal.rollDigits, value:9, x: rollEnd.x, y: rollEnd.y },
      };
    }

    return { corner_points:corner_points, question_blocks:blocks, roll_number_grid:roll_number_grid, option_count:omrCal.optCount };
  }

  function omrCalPreview(){
    var payload = omrCalBuildPayload();
    var btn = document.getElementById('omrCalPreviewBtn');
    btn.disabled = true; btn.textContent = 'Loading...';
    adminFetch('POST','/api/omr-check/templates/'+omrCheckerData.currentTemplate.id+'/calibration-preview', {
      corner_points: payload.corner_points, question_blocks: payload.question_blocks,
    }).then(function(d){
      document.getElementById('omrCalImage').src = 'data:image/jpeg;base64,'+d.preview_image_base64;
      btn.disabled = false; btn.textContent = 'Preview';
    }).catch(function(err){
      showToast(err.message,'error');
      btn.disabled = false; btn.textContent = 'Preview';
    });
  }

  function omrCalSave(){
    var payload = omrCalBuildPayload();
    var btn = document.getElementById('omrCalSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving...';
    adminFetch('PUT','/api/omr-check/templates/'+omrCheckerData.currentTemplate.id+'/calibration', payload).then(function(){
      showToast('Calibration saved','success');
      omrLoadTemplates();
    }).catch(function(err){
      showToast(err.message,'error');
      btn.disabled = false; btn.textContent = 'Save Calibration';
    });
  }

  /* ── Tests (answer key + marking scheme) ── */

  function omrParseAnswerKey(text, totalQuestions){
    var letters = text.indexOf(',') !== -1
      ? text.split(',').map(function(s){ return s.trim().toUpperCase(); })
      : text.replace(/\s+/g,'').toUpperCase().split('');
    var key = {};
    for (var i = 0; i < totalQuestions; i++){ key[String(i+1)] = letters[i] || null; }
    return key;
  }

  function omrFormatAnswerKey(key, totalQuestions){
    var out = [];
    for (var i = 1; i <= totalQuestions; i++){ out.push(key[String(i)] || ''); }
    return out.join(',');
  }

  function omrLoadTests(){
    var body = document.getElementById('omrCheckerBody');
    body.innerHTML = '<p class="admin-empty">Loading…</p>';
    Promise.all([
      adminFetch('GET','/api/omr-check/tests'),
      adminFetch('GET','/api/omr-check/templates'),
    ]).then(function(results){
      omrCheckerData.tests = results[0].tests || [];
      omrCheckerData.templates = results[1].templates || [];
      omrRenderTestsList();
    }).catch(function(err){ body.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  function omrRenderTestsList(){
    var body = document.getElementById('omrCheckerBody');
    var rows = omrCheckerData.tests.map(function(t){
      return '<tr><td>'+e(t.name)+'</td><td>'+e(t.template_name)+'</td><td>'+t.total_questions+'</td>' +
        '<td>+'+t.marks_per_correct+' / -'+t.negative_marking+'</td>' +
        '<td>'+(t.submission_count||0)+' ('+(t.finalized_count||0)+' finalized)</td>' +
        '<td><span class="badge '+(t.status==='active'?'badge-visible':'badge-hidden')+'">'+e(t.status)+'</span></td>' +
        '<td><button class="btn btn-sm" data-test-edit="'+t.id+'">Edit</button> ' +
        '<button class="btn btn-sm" data-test-subs="'+t.id+'">Submissions</button></td></tr>';
    }).join('');

    body.innerHTML =
      '<div style="margin-bottom:14px;"><button class="btn" id="btnNewOmrTest"'+(omrCheckerData.templates.length?'':' disabled title="Create a calibrated template first"')+'><i class="fas fa-plus"></i> New Test</button></div>' +
      (omrCheckerData.tests.length
        ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Name</th><th>Template</th><th>Questions</th><th>Marking</th><th>Submissions</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'
        : '<p class="admin-empty">No tests yet.'+(omrCheckerData.templates.length?'':' Create a calibrated template first.')+'</p>');

    document.getElementById('btnNewOmrTest').addEventListener('click', function(){ omrOpenTestForm(null); });
    document.querySelectorAll('[data-test-edit]').forEach(function(b){
      b.addEventListener('click', function(){
        var t = omrCheckerData.tests.filter(function(x){ return x.id == b.getAttribute('data-test-edit'); })[0];
        omrOpenTestForm(t);
      });
    });
    document.querySelectorAll('[data-test-subs]').forEach(function(b){
      b.addEventListener('click', function(){
        omrCheckerData.currentTestId = parseInt(b.getAttribute('data-test-subs'), 10);
        omrCheckerTab = 'submissions';
        document.querySelectorAll('.omr-check-tab').forEach(function(x){ x.classList.toggle('active', x.getAttribute('data-omr-tab')==='submissions'); });
        omrLoadSubmissionsTab();
      });
    });
  }

  function omrOpenTestForm(test){
    var isEdit = !!test;
    var body = document.getElementById('omrCheckerBody');
    var templateOptions = omrCheckerData.templates.map(function(t){
      return '<option value="'+t.id+'"'+(test && test.template_id==t.id?' selected':'')+'>'+e(t.name)+'</option>';
    }).join('');
    var answerKeyText = (test && test.answer_key) ? omrFormatAnswerKey(test.answer_key, test.total_questions) : '';
    var savedSheetId = (test && test.google_sheet_id) || localStorage.getItem('omr_shared_sheet_id') || '';

    body.innerHTML =
      '<div class="admin-card" style="max-width:640px;">' +
        '<h3 style="margin-top:0;">'+(isEdit?'Edit Test':'New Test')+'</h3>' +
        '<label class="admin-field"><span>Test Name</span><input class="admin-input" id="testName" value="'+e(test?test.name:'')+'" placeholder="e.g. RSSB JE Degree Mock Test 12"></label>' +
        '<label class="admin-field"><span>Template</span><select class="admin-input" id="testTemplate">'+templateOptions+'</select></label>' +
        '<div style="display:flex;gap:10px;">' +
          '<label class="admin-field" style="flex:1;"><span>Total Questions</span><input class="admin-input" id="testTotalQ" type="number" value="'+(test?test.total_questions:120)+'"></label>' +
          '<label class="admin-field" style="flex:1;"><span>Marks per Correct</span><input class="admin-input" id="testMarksCorrect" type="number" step="0.01" value="'+(test?test.marks_per_correct:1)+'"></label>' +
          '<label class="admin-field" style="flex:1;"><span>Negative Marking</span><input class="admin-input" id="testNegMark" type="number" step="0.01" value="'+(test?test.negative_marking:0)+'"></label>' +
        '</div>' +
        '<label class="admin-field"><span>Google Sheet ID (same shared spreadsheet for every test - paste once)</span><input class="admin-input" id="testSheetId" value="'+e(savedSheetId)+'" placeholder="the long ID in the sheet\'s URL"></label>' +
        '<label class="admin-field"><span>Google Sheet Tab Name (unique per test)</span><input class="admin-input" id="testSheetTab" value="'+e(test?test.google_sheet_tab:'')+'" placeholder="e.g. Mock Test 12"></label>' +
        '<label class="admin-field"><span>Answer Key (one letter per question, comma-separated or plain string, in order 1..N)</span>' +
          '<textarea class="admin-input" id="testAnswerKey" rows="4" placeholder="A,C,B,E,D,...">'+e(answerKeyText)+'</textarea>' +
        '</label>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button class="btn" id="testSaveBtn">'+(isEdit?'Save Changes':'Create Test')+'</button>' +
          '<button class="btn btn-ghost" id="testCancelBtn">Cancel</button>' +
        '</div>' +
      '</div>';

    document.getElementById('testCancelBtn').addEventListener('click', omrLoadTests);
    document.getElementById('testSaveBtn').addEventListener('click', function(){
      var totalQ = parseInt(document.getElementById('testTotalQ').value, 10);
      var name = document.getElementById('testName').value.trim();
      var templateId = document.getElementById('testTemplate').value;
      var keyText = document.getElementById('testAnswerKey').value;
      if (!name){ showToast('Name is required','error'); return; }
      if (!templateId){ showToast('Please select a template','error'); return; }
      if (!keyText.trim()){ showToast('Answer key is required','error'); return; }

      var answerKey = omrParseAnswerKey(keyText, totalQ);
      var missing = Object.keys(answerKey).filter(function(k){ return !answerKey[k]; }).length;
      if (missing && !confirm(missing+' question(s) have no answer letter set - continue anyway?')) return;

      var sheetId = document.getElementById('testSheetId').value.trim();
      if (sheetId) localStorage.setItem('omr_shared_sheet_id', sheetId);

      var payload = {
        name: name, template_id: templateId, total_questions: totalQ,
        marks_per_correct: parseFloat(document.getElementById('testMarksCorrect').value) || 1,
        negative_marking: parseFloat(document.getElementById('testNegMark').value) || 0,
        google_sheet_id: sheetId || null,
        google_sheet_tab: document.getElementById('testSheetTab').value.trim() || name,
        answer_key: answerKey,
      };

      var btn = this;
      btn.disabled = true; btn.textContent = 'Saving...';
      var req = isEdit ? adminFetch('PUT','/api/omr-check/tests/'+test.id, payload) : adminFetch('POST','/api/omr-check/tests', payload);
      req.then(function(){
        showToast(isEdit?'Saved':'Test created','success');
        omrLoadTests();
      }).catch(function(err){
        showToast(err.message,'error');
        btn.disabled = false; btn.textContent = isEdit?'Save Changes':'Create Test';
      });
    });
  }

  /* ── Submissions + Review ── */

  var OMR_STATUS_LABELS = {
    uploaded:'Uploaded', processing:'Processing', needs_review:'Needs Review',
    reviewed:'Reviewed', finalized:'Finalized', failed:'Detection Failed',
  };
  var OMR_STATUS_BADGE = {
    finalized:'badge-visible', reviewed:'badge-visible', failed:'badge-hidden', needs_review:'badge-hidden', uploaded:'badge-hidden', processing:'badge-hidden',
  };

  function omrLoadSubmissionsTab(){
    var body = document.getElementById('omrCheckerBody');
    body.innerHTML = '<p class="admin-empty">Loading…</p>';
    adminFetch('GET','/api/omr-check/tests').then(function(d){
      omrCheckerData.tests = d.tests || [];
      omrRenderSubmissionsTestSelector();
    }).catch(function(err){ body.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  function omrRenderSubmissionsTestSelector(){
    var body = document.getElementById('omrCheckerBody');
    if (!omrCheckerData.tests.length){
      body.innerHTML = '<p class="admin-empty">No tests yet. Create one in the Tests tab first.</p>';
      return;
    }
    if (!omrCheckerData.currentTestId || !omrCheckerData.tests.some(function(t){ return t.id === omrCheckerData.currentTestId; })){
      omrCheckerData.currentTestId = omrCheckerData.tests[0].id;
    }
    var options = omrCheckerData.tests.map(function(t){
      return '<option value="'+t.id+'"'+(t.id===omrCheckerData.currentTestId?' selected':'')+'>'+e(t.name)+'</option>';
    }).join('');

    body.innerHTML =
      '<div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:16px;">' +
        '<label class="admin-field" style="width:320px;margin-bottom:0;"><span>Test</span><select class="admin-input" id="omrSubsTestSelect">'+options+'</select></label>' +
        '<button class="btn btn-sm" id="btnNewOmrSubmission"><i class="fas fa-upload"></i> Upload Photo</button>' +
      '</div>' +
      '<div id="omrSubsListWrap"><p class="admin-empty">Loading…</p></div>';

    document.getElementById('omrSubsTestSelect').addEventListener('change', function(){
      omrCheckerData.currentTestId = parseInt(this.value, 10);
      omrLoadSubmissionsList();
    });
    document.getElementById('btnNewOmrSubmission').addEventListener('click', omrOpenUploadSubmissionForm);
    omrLoadSubmissionsList();
  }

  function omrLoadSubmissionsList(){
    var wrap = document.getElementById('omrSubsListWrap');
    wrap.innerHTML = '<p class="admin-empty">Loading…</p>';
    adminFetch('GET','/api/omr-check/tests/'+omrCheckerData.currentTestId+'/submissions').then(function(d){
      omrRenderSubmissionsList(d.submissions || []);
    }).catch(function(err){ wrap.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  function omrRenderSubmissionsList(subs){
    var wrap = document.getElementById('omrSubsListWrap');
    if (!subs.length){ wrap.innerHTML = '<p class="admin-empty">No submissions yet for this test.</p>'; return; }
    var rows = subs.map(function(s){
      var badgeClass = OMR_STATUS_BADGE[s.status] || 'badge-hidden';
      return '<tr><td>'+e(s.student_name)+'</td><td>'+e(s.roll_number||'-')+'</td>' +
        '<td><span class="badge '+badgeClass+'">'+(OMR_STATUS_LABELS[s.status]||s.status)+'</span></td>' +
        '<td>'+(s.score!=null?s.score:'-')+'</td>' +
        '<td><button class="btn btn-sm" data-sub-review="'+s.id+'">Review</button> ' +
        (s.status!=='finalized' ? '<button class="btn btn-sm btn-ghost" data-sub-del="'+s.id+'">Delete</button>' : '') +
        '</td></tr>';
    }).join('');
    wrap.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Student</th><th>Roll No.</th><th>Status</th><th>Score</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>';

    document.querySelectorAll('[data-sub-review]').forEach(function(b){
      b.addEventListener('click', function(){ omrOpenReviewScreen(b.getAttribute('data-sub-review')); });
    });
    document.querySelectorAll('[data-sub-del]').forEach(function(b){
      b.addEventListener('click', function(){
        if (!confirm('Delete this submission?')) return;
        adminFetch('DELETE','/api/omr-check/submissions/'+b.getAttribute('data-sub-del'))
          .then(function(){ showToast('Deleted','success'); omrLoadSubmissionsList(); })
          .catch(function(err){ showToast(err.message,'error'); });
      });
    });
  }

  function omrOpenUploadSubmissionForm(){
    var wrap = document.getElementById('omrSubsListWrap');
    wrap.innerHTML =
      '<div class="admin-card" style="max-width:480px;">' +
        '<h3 style="margin-top:0;">Upload OMR Photo</h3>' +
        '<label class="admin-field"><span>Student Name</span><input class="admin-input" id="subStudentName"></label>' +
        '<label class="admin-field"><span>Email (optional)</span><input class="admin-input" id="subStudentEmail"></label>' +
        '<label class="admin-field"><span>Phone (optional)</span><input class="admin-input" id="subStudentPhone"></label>' +
        '<label class="admin-field"><span>Roll Number (optional - auto-detected if the template has a bubble grid)</span><input class="admin-input" id="subRollNumber"></label>' +
        '<label class="admin-field"><span>Photo</span><input type="file" id="subPhoto" accept="image/*"></label>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button class="btn" id="subUploadBtn">Upload &amp; Detect</button>' +
          '<button class="btn btn-ghost" id="subCancelBtn">Cancel</button>' +
        '</div>' +
      '</div>';

    document.getElementById('subCancelBtn').addEventListener('click', omrLoadSubmissionsList);
    document.getElementById('subUploadBtn').addEventListener('click', function(){
      var name = document.getElementById('subStudentName').value.trim();
      var file = document.getElementById('subPhoto').files[0];
      if (!name){ showToast('Student name is required','error'); return; }
      if (!file){ showToast('Photo is required','error'); return; }

      var fd = new FormData();
      fd.append('student_name', name);
      fd.append('student_email', document.getElementById('subStudentEmail').value.trim());
      fd.append('student_phone', document.getElementById('subStudentPhone').value.trim());
      fd.append('roll_number', document.getElementById('subRollNumber').value.trim());
      fd.append('photo', file);

      var btn = this;
      btn.disabled = true; btn.textContent = 'Uploading & detecting (may take a moment)...';
      adminFetch('POST','/api/omr-check/tests/'+omrCheckerData.currentTestId+'/submissions', fd).then(function(d){
        showToast('Uploaded - opening review','success');
        omrOpenReviewScreen(d.submission.id);
      }).catch(function(err){
        showToast(err.message,'error');
        btn.disabled = false; btn.textContent = 'Upload & Detect';
      });
    });
  }

  /* Mirrors detector/geometry.py::build_question_positions purely for rendering
     marker overlays client-side - no image processing happens in the browser. */
  function omrBuildQuestionPositions(questionBlocks, optionCount){
    var positions = {};
    (questionBlocks || []).forEach(function(block){
      var startQ = block.start_question, endQ = block.end_question;
      var tl = block.top_left_anchor, br = block.bottom_right_anchor;
      var optionOrder = block.option_order || ['A','B','C','D','E'].slice(0, optionCount);
      var nRows = endQ - startQ;
      var nCols = optionOrder.length - 1;
      var rowPitch = nRows ? (br.y - tl.y) / nRows : 0;
      var colPitch = nCols ? (br.x - tl.x) / nCols : 0;
      for (var q = startQ; q <= endQ; q++){
        var baseY = tl.y + rowPitch * (q - startQ);
        var opts = {};
        optionOrder.forEach(function(opt, colIndex){ opts[opt] = { x: tl.x + colPitch*colIndex, y: baseY }; });
        positions[String(q)] = opts;
      }
    });
    return positions;
  }

  var omrReview = null;

  function omrOpenReviewScreen(submissionId){
    var wrap = document.getElementById('omrSubsListWrap');
    wrap.innerHTML = '<p class="admin-empty">Loading…</p>';
    adminFetch('GET','/api/omr-check/submissions/'+submissionId).then(function(d){
      omrRenderReviewScreen(d.submission);
    }).catch(function(err){ wrap.innerHTML = '<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  function omrReviewMarkerColor(status){
    if (status === 'confident') return '#16a34a';
    if (status === 'ambiguous' || status === 'out_of_bounds') return '#eab308';
    return '#9ca3af';
  }

  function omrRenderReviewScreen(sub){
    omrReview = {
      submission: sub,
      answers: JSON.parse(JSON.stringify(sub.corrected_answers || sub.detected_answers || {})),
      positions: omrBuildQuestionPositions(sub.question_blocks, sub.option_count),
    };

    var wrap = document.getElementById('omrSubsListWrap');
    var imageUrl = sub.rectified_image_url || sub.photo_url;
    var warningBanner = '';
    if (sub.status === 'failed') {
      warningBanner = '<div style="background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px;">' +
        'Detection failed: '+e(sub.detector_error||'unknown error')+'. Showing the original photo - mark answers manually below, or use Re-run Detection below once the issue is fixed (e.g. the OMR service was just deployed/configured), or delete and re-upload a clearer photo.</div>';
    }

    wrap.innerHTML =
      '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">' +
        '<button class="btn btn-ghost btn-sm" id="omrReviewBack">&larr; Back to List</button>' +
        '<h3 style="margin:0;">Review: '+e(sub.student_name)+' - '+e(sub.test_name)+'</h3>' +
      '</div>' +
      warningBanner +
      '<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">' +
        '<div class="omr-review-image-wrap" id="omrReviewImageWrap">' +
          '<img id="omrReviewImage" src="'+e(imageUrl)+'">' +
        '</div>' +
        '<div style="min-width:220px;">' +
          '<label class="admin-field"><span>Roll Number</span><input class="admin-input" id="omrReviewRoll" value="'+e(sub.roll_number||'')+'"></label>' +
          '<div style="font-size:12px;color:var(--body-color);line-height:1.9;margin-bottom:14px;">' +
            '<span class="omr-legend-dot" style="background:#16a34a;"></span> Confident<br>' +
            '<span class="omr-legend-dot" style="background:#eab308;"></span> Ambiguous / multi-mark<br>' +
            '<span class="omr-legend-dot" style="background:#9ca3af;"></span> Blank<br>' +
            '<span style="color:#4338CA;">Click any marker to change the answer.</span>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-direction:column;">' +
            (sub.status === 'failed' ? '<button class="btn btn-ghost btn-sm" id="omrReviewRerun">Re-run Detection</button>' : '') +
            '<button class="btn btn-sm" id="omrReviewSaveDraft">Save Draft</button>' +
            '<button class="btn" id="omrReviewFinalize">Finalize &amp; Push to Sheet</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('omrReviewBack').addEventListener('click', omrLoadSubmissionsList);

    var img = document.getElementById('omrReviewImage');
    if (img.complete && img.naturalWidth) omrReviewDrawMarkers(); else img.addEventListener('load', omrReviewDrawMarkers);
    window.addEventListener('resize', omrReviewDrawMarkers);

    document.getElementById('omrReviewSaveDraft').addEventListener('click', function(){ omrReviewSave(false); });
    document.getElementById('omrReviewFinalize').addEventListener('click', function(){ omrReviewSave(true); });
    var rerunBtn = document.getElementById('omrReviewRerun');
    if (rerunBtn) rerunBtn.addEventListener('click', function(){ omrReviewRerunDetection(sub.id); });
  }

  function omrReviewRerunDetection(submissionId){
    var btn = document.getElementById('omrReviewRerun');
    btn.disabled = true; btn.textContent = 'Re-running...';
    adminFetch('POST','/api/omr-check/submissions/'+submissionId+'/rerun-detection').then(function(d){
      showToast(d.submission.status === 'failed' ? 'Still failed - see the error above' : 'Detection re-run - answers updated','success');
      /* rerun-detection returns only the raw submission row - re-fetch the full
         joined detail (template/test fields) the review screen needs to render. */
      omrOpenReviewScreen(submissionId);
    }).catch(function(err){
      showToast(err.message,'error');
      btn.disabled = false; btn.textContent = 'Re-run Detection';
    });
  }

  function omrReviewDrawMarkers(){
    if (!omrReview) return;
    var img = document.getElementById('omrReviewImage');
    var wrap = document.getElementById('omrReviewImageWrap');
    if (!img || !wrap) return;
    wrap.querySelectorAll('.omr-bubble-marker').forEach(function(m){ m.remove(); });

    var sub = omrReview.submission;
    var scaleX = img.clientWidth  / (sub.canonical_width  || img.naturalWidth  || 1);
    var scaleY = img.clientHeight / (sub.canonical_height || img.naturalHeight || 1);

    Object.keys(omrReview.positions).forEach(function(qStr){
      if (parseInt(qStr, 10) > sub.total_questions) return;
      var opts = omrReview.positions[qStr];
      var current = omrReview.answers[qStr];
      var currentLetter = current && typeof current === 'object' ? current.answer : current;
      var status = current && typeof current === 'object' ? current.status : (currentLetter ? 'confident' : 'blank');
      var pos = (currentLetter && opts[currentLetter]) ? opts[currentLetter] : opts[Object.keys(opts)[0]];

      var marker = document.createElement('div');
      marker.className = 'omr-bubble-marker';
      marker.style.left = (pos.x * scaleX) + 'px';
      marker.style.top  = (pos.y * scaleY) + 'px';
      marker.style.borderColor = omrReviewMarkerColor(status);
      marker.title = 'Q'+qStr+': '+(currentLetter || 'blank');
      marker.textContent = qStr;
      marker.addEventListener('click', function(ev){
        ev.stopPropagation();
        omrReviewOpenPicker(qStr, opts, marker, scaleX, scaleY);
      });
      wrap.appendChild(marker);
    });
  }

  function omrReviewOpenPicker(qStr, opts, markerEl, scaleX, scaleY){
    var existing = document.getElementById('omrReviewPicker');
    if (existing) existing.remove();

    var picker = document.createElement('div');
    picker.id = 'omrReviewPicker';
    picker.className = 'omr-review-picker';
    picker.style.left = markerEl.style.left;
    picker.style.top  = markerEl.style.top;

    Object.keys(opts).forEach(function(opt){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt;
      btn.addEventListener('click', function(ev){
        ev.stopPropagation();
        var prevRatios = (omrReview.answers[qStr] && omrReview.answers[qStr].fill_ratios) || {};
        omrReview.answers[qStr] = { answer: opt, status: 'confident', fill_ratios: prevRatios };
        picker.remove();
        omrReviewDrawMarkers();
      });
      picker.appendChild(btn);
    });

    var blankBtn = document.createElement('button');
    blankBtn.type = 'button';
    blankBtn.textContent = 'Blank';
    blankBtn.className = 'omr-review-picker-blank';
    blankBtn.addEventListener('click', function(ev){
      ev.stopPropagation();
      omrReview.answers[qStr] = { answer: null, status: 'blank', fill_ratios: {} };
      picker.remove();
      omrReviewDrawMarkers();
    });
    picker.appendChild(blankBtn);

    document.getElementById('omrReviewImageWrap').appendChild(picker);
    setTimeout(function(){
      document.addEventListener('click', function closePicker(){
        if (picker.parentNode) picker.remove();
        document.removeEventListener('click', closePicker);
      });
    }, 0);
  }

  function omrReviewSave(thenFinalize){
    var roll = document.getElementById('omrReviewRoll').value.trim();
    var btn = thenFinalize ? document.getElementById('omrReviewFinalize') : document.getElementById('omrReviewSaveDraft');
    var origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = thenFinalize ? 'Finalizing...' : 'Saving...';

    adminFetch('PUT','/api/omr-check/submissions/'+omrReview.submission.id+'/review', {
      corrected_answers: omrReview.answers, roll_number: roll || null,
    }).then(function(){
      if (!thenFinalize) {
        showToast('Draft saved','success');
        btn.disabled = false; btn.textContent = origText;
        return null;
      }
      return adminFetch('POST','/api/omr-check/submissions/'+omrReview.submission.id+'/finalize').then(function(d){
        showToast(d.warning || 'Finalized and pushed to Google Sheet','success');
        omrLoadSubmissionsList();
      });
    }).catch(function(err){
      showToast(err.message,'error');
      btn.disabled = false; btn.textContent = origText;
    });
  }

})();
