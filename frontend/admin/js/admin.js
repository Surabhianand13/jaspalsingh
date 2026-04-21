/**
 * admin.js — Admin Panel JavaScript
 * jaspalsingh.in — Civil Engineering Educator
 *
 * Vanilla JS, no frameworks.
 * All API calls go through adminFetch() which attaches the admin JWT.
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════
     CONFIG
     ══════════════════════════════════════════════ */
  var API_BASE  = location.hostname === 'localhost' ? 'http://localhost:5000' : '';
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
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        day:   'numeric',
        month: 'short',
        year:  'numeric'
      });
    } catch (e) {
      return '—';
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
    'learners':     'Learners'
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
     TOPBAR — LOGOUT
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
    ['statResources', 'statBlog', 'statTestis', 'statUnread', 'statLearners', 'statDownloads'].forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = '…';
    });

    /* 1. Resources analytics */
    adminFetch('GET', '/api/resources/admin/analytics').then(function (data) {
      var el = $('statResources');
      if (el) el.textContent = data.total || 0;
      var dlEl = $('statDownloads');
      if (dlEl) dlEl.textContent = data.total_downloads || 0;
    }).catch(function () {
      var el = $('statResources');
      if (el) el.textContent = 'Err';
    });

    /* 2. Blog count */
    adminFetch('GET', '/api/blog/admin/all?limit=1').then(function (data) {
      var el = $('statBlog');
      if (el) el.textContent = data.total || (Array.isArray(data) ? data.length : 0);
    }).catch(function () {
      var el = $('statBlog');
      if (el) el.textContent = 'Err';
    });

    /* 3. Testimonials count */
    adminFetch('GET', '/api/testimonials/admin/all').then(function (data) {
      var el = $('statTestis');
      if (el) el.textContent = Array.isArray(data) ? data.length : (data.total || 0);
    }).catch(function () {
      var el = $('statTestis');
      if (el) el.textContent = 'Err';
    });

    /* 4. Unread messages count */
    adminFetch('GET', '/api/contact?unread=true').then(function (data) {
      var count = Array.isArray(data) ? data.length : (data.total || 0);
      var el = $('statUnread');
      if (el) el.textContent = count;
      updateMessagesBadge(count);
    }).catch(function () {
      var el = $('statUnread');
      if (el) el.textContent = 'Err';
    });

    /* 5. Learner stats */
    adminFetch('GET', '/api/learners/stats').then(function (data) {
      var el = $('statLearners');
      if (el) el.textContent = data.total || 0;
      /* Quick stats summary */
      renderQuickStats(data);
    }).catch(function () {
      var el = $('statLearners');
      if (el) el.textContent = 'Err';
    });

    /* 6. Recent messages (3) */
    adminFetch('GET', '/api/contact?limit=3').then(function (data) {
      var items = Array.isArray(data) ? data : (data.messages || data.data || []);
      renderRecentMessages(items.slice(0, 3));
    }).catch(function () {
      var el = $('recentMessagesList');
      if (el) el.innerHTML = '<div class="text-muted text-sm">Could not load messages.</div>';
    });

    /* Load analytics charts */
    bindChartRangeButtons();
    loadDashboardCharts(14);
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
      { label: 'Active (30 days)', value: data.active_30d || 0,       icon: 'fa-user-check',   color: '#67C8E8' },
      { label: 'New This Month',   value: data.new_this_month || 0,   icon: 'fa-user-plus',    color: '#8b5cf6' }
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
          '<td><span class="text-sm">' + escapeHtml(r.subject || '—') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(r.resource_type || r.type || '—') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(r.exam_tag || '—') + '</span></td>' +
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
      var catLabel  = blogCategoryLabels[p.category] || escapeHtml(p.category) || '—';
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
    $('slugPreview').textContent     = isEdit ? (post.slug  || '—') : '—';
    $('blogCategory').value          = isEdit ? (post.category || '') : '';
    $('blogExcerpt').value           = isEdit ? (post.excerpt || '') : '';
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
          if (slugPrev) slugPrev.textContent = s || '—';
        }
      });

      slugInput.addEventListener('input', function () {
        if (slugPrev) slugPrev.textContent = this.value.trim() || '—';
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
          '<td><span class="fw-600">' + escapeHtml(t.student_name || t.name || '—') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(t.exam_type || t.exam || '—') + '</span></td>' +
          '<td><span class="text-sm text-muted">' + escapeHtml(String(t.exam_year || '—')) + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(t.rank_or_result || t.rank || '—') + '</span></td>' +
          '<td>' + (t.is_featured ? '<span class="badge badge-featured"><i class="fas fa-star"></i>Yes</span>' : '<span class="text-muted text-sm">—</span>') + '</td>' +
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
      renderLearnersTable(learnersState.items);
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
      return (
        '<tr data-id="' + (l.id || l.id) + '">' +
          '<td><span class="fw-600">' + escapeHtml(l.name || l.full_name || '—') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(l.email || '—') + '</span></td>' +
          '<td><span class="text-sm">' + escapeHtml(l.exam_target || l.exam || '—') + '</span></td>' +
          '<td><span class="fw-600">' + (l.download_count || 0) + '</span></td>' +
          '<td><span class="text-sm text-muted">' + fmtDate(l.created_at || l.createdAt) + '</span></td>' +
          '<td><span class="text-sm text-muted">' + fmtDate(l.last_login || l.lastLogin) + '</span></td>' +
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

    var headers = ['Name', 'Email', 'Exam Target', 'Downloads', 'Joined', 'Last Login', 'Active'];

    var rows = items.map(function (l) {
      return [
        csvEscape(l.name || l.full_name || ''),
        csvEscape(l.email || ''),
        csvEscape(l.exam_target || l.exam || ''),
        l.download_count || 0,
        csvEscape(fmtDate(l.created_at || l.createdAt)),
        csvEscape(fmtDate(l.last_login || l.lastLogin)),
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

  /** Bind learners section controls */
  function bindLearnersSection() {
    var exportBtn = $('btnExportCSV');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportLearnersCSV);
    }

    /* Live search filter */
    var searchEl = $('learnerSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        var query = this.value.toLowerCase().trim();
        var filtered = query
          ? learnersState.items.filter(function (l) {
              return (l.name || l.full_name || '').toLowerCase().includes(query) ||
                     (l.email || '').toLowerCase().includes(query) ||
                     (l.exam_target || l.exam || '').toLowerCase().includes(query);
            })
          : learnersState.items;
        renderLearnersTable(filtered);
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

  });

})();
