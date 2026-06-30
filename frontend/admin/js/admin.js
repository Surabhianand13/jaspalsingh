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
    'referralpayouts': 'Referral Payouts',
    'programleads': 'Interest / Leads',
    'banners':      'Banners & Promo Images',
    'analytics':    'Analytics'
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
      case 'referralpayouts': loadReferralPayouts(); break;
      case 'programleads': loadProgramLeads(); break;
      case 'banners':      loadBanners();      break;
      case 'analytics':    loadBizAnalytics(); break;
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
      /* Quick stats summary */
      renderQuickStats(data);
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

  /** Render quick stats card */
  function renderQuickStats(data) {
    var el = $('quickStats');
    if (!el) return;

    var rows = [
      { label: 'Total Learners',   value: data.total || 0,           icon: 'fa-users',        color: '#10b981' },
      { label: 'New (Last 7 Days)', value: data.last_7d || 0,          icon: 'fa-user-check',   color: '#67C8E8' },
      { label: 'New This Month',   value: data.new_this_month || data.last_7d || 0, icon: 'fa-user-plus', color: '#8b5cf6' }
    ];

    el.innerHTML = rows.map(function (r) {
      return (
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--admin-border);">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:32px;height:32px;border-radius:8px;background:' + r.color + '1a;display:flex;align-items:center;justify-content:center;color:' + r.color + ';font-size:13px;">' +
              '<i class="fas ' + r.icon + '"></i>' +
            '</div>' +
            '<span style="font-size:13.5px;font-weight:500;color:var(--admin-text);">' + escapeHtml(r.label) + '</span>' +
          '</div>' +
          '<span style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:18px;font-weight:700;color:var(--admin-text);">' + r.value + '</span>' +
        '</div>'
      );
    }).join('') + '<div style="height:1px;"></div>';
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
        var examData = data.by_exam || [];
        /* Render quick text stats */
        var el = $('quickStats');
        if (el) {
          var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
          examData.forEach(function (row) {
            html += '<div style="display:flex;justify-content:space-between;font-size:13px;">' +
                    '<span>' + escapeHtml(row.target_exam || 'General') + '</span>' +
                    '<strong>' + (row.count || 0) + '</strong></div>';
          });
          html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e8e8f0;display:flex;justify-content:space-between;font-size:13px;">' +
                  '<span>Signups this week</span><strong>' + (data.last_7d || 0) + '</strong></div>';
          html += '</div>';
          el.innerHTML = html;
        }
        /* Donut chart */
        if (!examData.length) return;
        var labels   = examData.map(function (r) { return r.target_exam || 'General'; });
        var values   = examData.map(function (r) { return r.count || 0; });
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
        var post = blogState.items.find(function (p) { return p.id === id; });
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
    var post = blogState.items.find(function (p) { return p.id === id; });
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

    tbody.innerHTML = '<tr><td colspan="7"><div class="admin-table-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div></td></tr>';

    adminFetch('GET', '/api/learners').then(function (data) {
      learnersState.items = Array.isArray(data) ? data : (data.learners || data.data || []);
      applyLearnerPeriodFilter();
    }).catch(function (err) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="admin-table-empty"><i class="fas fa-triangle-exclamation"></i><p>' + escapeHtml(err.message) + '</p></div></td></tr>';
    });
  }

  /** Render learners table body */
  function renderLearnersTable(items) {
    var tbody = $('learnersTableBody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="admin-table-empty"><i class="fas fa-users"></i><p>No learners found.</p></div></td></tr>';
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
          '<td><button class="btn btn-sm" data-prog-edit="'+p.id+'">Edit</button> <button class="btn btn-sm btn-ghost" data-prog-del="'+p.id+'">Delete</button></td>' +
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
  }

  function openProgramModal(p){
    p = p || {};
    var isEdit = !!p.id;
    document.getElementById('programModalTitle').textContent = isEdit ? 'Edit Program' : 'New Program';
    var body = document.getElementById('programModalBody');
    body.innerHTML =
      fld('Slug (URL)','pm_slug',p.slug||'', isEdit) +
      fld('Title','pm_title',p.title||'') +
      sel('Category','pm_category',['test-series','interview','course'],p.category||'test-series') +
      fld('Exam','pm_exam',p.exam||'') +
      fld('Level','pm_level',p.level||'') +
      sel('Status','pm_status',['enrolling','coming_soon','closed'],p.status||'enrolling') +
      fld('Price (blank = hide)','pm_price',p.price||'') +
      fld('MRP','pm_mrp',p.mrp||'') +
      fld('Thumbnail URL','pm_thumb',p.thumbnail_url||'') +
      fld('Tags (comma separated)','pm_tags',(p.tags||[]).join(', ')) +
      fld('Sort order','pm_sort',p.sort_order||0) +
      '<button class="btn" id="pm_save" style="margin-top:8px;">'+(isEdit?'Save Changes':'Create Program')+'</button>';
    document.getElementById('programModal').style.display='flex';
    document.getElementById('pm_save').onclick = function(){
      var payload = {
        slug: val('pm_slug'), title: val('pm_title'), category: val('pm_category'),
        exam: val('pm_exam'), level: val('pm_level'), status: val('pm_status'),
        price: val('pm_price')||'', mrp: val('pm_mrp')||'', thumbnail_url: val('pm_thumb'),
        tags: val('pm_tags').split(',').map(function(t){return t.trim();}).filter(Boolean),
        sort_order: parseInt(val('pm_sort')||'0',10)
      };
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
        return '<tr><td>'+e(x.student_name)+'<br><span style="color:#9999b0;font-size:12px;">'+e(x.student_phone)+(x.student_email?' · '+e(x.student_email):'')+'</span></td>' +
          '<td>'+e(x.program_name)+'</td><td>'+inr(x.amount)+(x.coupon_code?'<br><span style="color:#16a34a;font-size:11px;">'+e(x.coupon_code)+'</span>':'')+'</td>' +
          '<td><span class="admin-badge admin-badge--'+(x.status==='paid'?'green':'orange')+'">'+e(x.status)+'</span></td>' +
          '<td>'+formBadge+emailBadge+reissueBtn+markBtn+admitBtn+'</td>'+
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
      // Wire up send-admit-card buttons
      body.querySelectorAll('[data-admitcard]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var id   = btn.getAttribute('data-admitcard');
          var slug = btn.getAttribute('data-slug') || '';
          showAdmitCardModal(parseInt(id), slug.includes('degree'));
        });
      });
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
        statCard('Revenue', inr(s.revenue)) + statCard('Paid', s.paid_count||0) + statCard('Pending', s.pending_count||0);

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
            var label = x.program_name || x.program_slug;
            if (label.length > 40) label = label.slice(0, 40) + '...';
            opts += '<option value="'+e(x.program_slug)+'"'+(currentProg===x.program_slug?' selected':'')+'>'+e(label)+'</option>';
          }
        });
        progSel.innerHTML = opts;
      }

      applyEnrollFilters();
    }).catch(function(err){ body.innerHTML='<p class="admin-empty">'+e(err.message)+'</p>'; });
  }

  /* ── Admit Card modal ── */
  function showAdmitCardModal(enrollmentId, isDegree) {
    var existing = document.getElementById('admitCardModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'admitCardModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
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
          '<div><label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:4px;">Test Centre *</label>' +
            '<select id="ac_centre" style="width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;">' +
              '<option value="">Select centre...</option>' +
              '<option value="jaipur">Jaipur</option><option value="kota">Kota</option>' +
              '<option value="bikaner">Bikaner</option><option value="sikar">Sikar</option>' +
              '<option value="jodhpur">Jodhpur</option><option value="alwar">Alwar</option><option value="ajmer">Ajmer</option>' +
            '</select></div>' +
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
      var name   = document.getElementById('ac_name').value.trim();
      var govtId = document.getElementById('ac_govtid').value.trim();
      var centre = document.getElementById('ac_centre').value;
      var type   = document.getElementById('ac_type').value;
      var photo  = document.getElementById('ac_photo').value.trim();

      if (!name || !centre) { showToast('Name and centre are required', 'error'); return; }

      var sendBtn = document.getElementById('admitCardSend');
      sendBtn.disabled = true; sendBtn.textContent = 'Generating...';

      var payload = { enrollment_id: enrollmentId, name: name, centre: centre, program_type: type };
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
          ? '<button class="btn btn-sm" data-ref-paid="'+c.id+'">Mark Paid</button>'
          : '<span class="admin-badge admin-badge--blue">Paid</span>';
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
  function statCard(label,v){ return '<div class="admin-stat-card"><div class="admin-stat-val">'+e(v)+'</div><div class="admin-stat-lbl">'+e(label)+'</div></div>'; }

  function bindBizSections(){
    /* OMR Papers - send test papers to enrolled learners */
    function sendOmrPapers(slug, testNum, qpUrl, omrUrl, btn, resultEl) {
      if (!testNum) { alert('Please select a test number.'); return; }
      if (!qpUrl || !qpUrl.startsWith('http')) { alert('Please enter a valid Question Paper Google Drive URL.'); return; }
      if (!omrUrl || !omrUrl.startsWith('http')) { alert('Please enter a valid OMR Sheet Google Drive URL.'); return; }
      if (!confirm('Send Test ' + String(testNum).padStart(2,'0') + ' papers to ALL enrolled learners for this program? This cannot be undone.')) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      resultEl.style.display = 'none';
      fetch(API_BASE + '/api/enrollment/admin/send-omr-papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ program_slug: slug, test_number: testNum, question_paper_url: qpUrl, omr_sheet_url: omrUrl }),
      })
      .then(function(r){ return r.json(); })
      .then(function(data){
        resultEl.style.display = 'block';
        if (data.error) {
          resultEl.style.background = '#fef2f2'; resultEl.style.border = '1px solid #fca5a5'; resultEl.style.color = '#991b1b';
          resultEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error: ' + data.error;
          btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Papers';
        } else {
          resultEl.style.background = '#f0fdf4'; resultEl.style.border = '1px solid #86efac'; resultEl.style.color = '#166534';
          resultEl.innerHTML = '<i class="fas fa-check-circle"></i> ' + (data.message || 'Sending in background...');
          btn.innerHTML = '<i class="fas fa-check"></i> Sent';
        }
      })
      .catch(function(){
        resultEl.style.display = 'block';
        resultEl.style.background = '#fef2f2'; resultEl.style.border = '1px solid #fca5a5'; resultEl.style.color = '#991b1b';
        resultEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> Network error. Please try again.';
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Papers';
      });
    }

    var btnDegreeOmr = document.getElementById('btnSendDegreeOmr');
    if (btnDegreeOmr) {
      btnDegreeOmr.addEventListener('click', function() {
        sendOmrPapers('rssb-je-omr-degree-test-series',
          document.getElementById('omrDegreeTestNum').value,
          document.getElementById('omrDegreeQpUrl').value,
          document.getElementById('omrDegreeOmrUrl').value,
          btnDegreeOmr, document.getElementById('omrDegreeResult'));
      });
    }
    var btnDiplomaOmr = document.getElementById('btnSendDiplomaOmr');
    if (btnDiplomaOmr) {
      btnDiplomaOmr.addEventListener('click', function() {
        sendOmrPapers('rssb-jen-omr-diploma-test-series',
          document.getElementById('omrDiplomaTestNum').value,
          document.getElementById('omrDiplomaQpUrl').value,
          document.getElementById('omrDiplomaOmrUrl').value,
          btnDiplomaOmr, document.getElementById('omrDiplomaResult'));
      });
    }

    var np=document.getElementById('btnNewProgram'); if(np) np.onclick=function(){openProgramModal(null);};
    var nb=document.getElementById('btnNewBanner'); if(nb) nb.onclick=function(){openBannerModal(null);};
    var pc=document.getElementById('programModalClose'); if(pc) pc.onclick=function(){document.getElementById('programModal').style.display='none';};
    var bc=document.getElementById('bannerModalClose'); if(bc) bc.onclick=function(){document.getElementById('bannerModal').style.display='none';};
    // Status filter triggers client-side filter (no reload needed)
    var rpf=document.getElementById('referralPayoutFilter'); if(rpf) rpf.onchange=loadReferralPayouts;
    var bbf=document.getElementById('btnBackfillReferralCodes'); if(bbf) bbf.onclick=function(){
      bbf.disabled = true; bbf.textContent = 'Generating...';
      adminFetch('POST', '/api/payment/admin/backfill-referral-codes').then(function(d){
        showToast('Generated codes for '+d.assigned+' learner(s)', 'success');
        bbf.disabled = false; bbf.textContent = 'Generate codes for past learners';
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

})();
