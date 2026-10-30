/* ============================================================
   learner-dashboard.js  -  Paid learner dashboard
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   One place for a paid learner to see, per purchased program:
     - what to do next (admit card form, upload due, result out)
     - admit card status / download
     - every test with its live status and direct actions
     - how tests work for THIS program (Printed OMR vs test centre)
   Rendered at the top of /profile and on /my-programs.

   Requires learner-auth.js (token) and schedule-modal.js (upload /
   result detail view) to be loaded first.

   Exposes: window.LearnerDashboard.render(containerEl, opts)
     opts.onEmpty()        - called when the learner has no paid programs
     opts.onHasPrograms()  - called once paid programs are found
     opts.hideHeading      - skip the section heading (page already has one)
   ============================================================ */

(function () {
  'use strict';

  var API_BASE = (function () {
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  })();
  var WA_HELP = 'https://wa.me/919829133317';

  function authFetch(path) {
    var token = window.LearnerAuth ? window.LearnerAuth.getToken() : localStorage.getItem('jaspal_learner_token');
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + path, { headers: headers }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) { var e = new Error(data.error || 'Request failed (' + res.status + ')'); e.status = res.status; throw e; }
        return data;
      });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtWhen(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
    });
  }

  function fmtDay(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* "in 3 hours" / "in 2 days" - only for the near future, where urgency matters. */
  function relative(iso) {
    if (!iso) return '';
    var ms = new Date(iso) - new Date();
    if (ms <= 0) return '';
    var h = Math.round(ms / 3600000);
    if (h < 1) return 'in under an hour';
    if (h < 48) return 'in ' + h + ' hour' + (h === 1 ? '' : 's');
    return 'in ' + Math.round(h / 24) + ' days';
  }

  var CATEGORY_LABELS = {
    'degree': 'Degree', 'diploma': 'Diploma',
    'civil': 'Civil (Paper 2)', 'general-studies': 'General Studies (Paper 1)',
  };
  function categoryLabel(cat) {
    return CATEGORY_LABELS[cat] || String(cat).replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /* ── Test status: one source of truth for chips, "next up" and action items ──
     tone: green (done/result) | blue (submitted) | amber (act now) | grey (later) | red (missed) */
  function testStatus(t) {
    var now = new Date();
    var deadline = t.omr_upload_deadline ? new Date(t.omr_upload_deadline) : null;
    var release  = t.paper_release_at ? new Date(t.paper_release_at) : null;

    if (t.result) {
      var bits = [];
      // Marks / rank can be text like "Absent" - only add "marks"/"Rank" to numbers.
      var isNum = function (v) { return /^-?\d+(\.\d+)?$/.test(String(v)); };
      if (t.result.total_marks != null) bits.push(isNum(t.result.total_marks) ? t.result.total_marks + ' marks' : t.result.total_marks);
      if (t.result.rank != null && String(t.result.rank) !== String(t.result.total_marks)) bits.push(isNum(t.result.rank) ? 'Rank ' + t.result.rank : t.result.rank);
      return { key: 'result', tone: 'green', icon: 'fa-chart-simple', label: 'Result out' + (bits.length ? ': ' + bits.join(' · ') : ''), done: true };
    }
    if (t.requires_omr_upload) {
      if (t.my_upload) {
        return { key: 'submitted', tone: 'blue', icon: 'fa-check', label: 'Answer sheet submitted', done: true };
      }
      if (t.upload_open) {
        return { key: 'upload', tone: 'amber', icon: 'fa-upload', label: 'Upload due ' + fmtWhen(t.omr_upload_deadline), urgent: true };
      }
      if (deadline && now > deadline) {
        return { key: 'missed', tone: 'red', icon: 'fa-xmark', label: 'Not submitted', done: true };
      }
      if (release && now < release) {
        return { key: 'soon', tone: 'violet', icon: 'fa-lock-open', label: 'Paper unlocks ' + fmtWhen(t.paper_release_at) };
      }
      if (t.paper_available) {
        // Released with no upload window set: the learner can practise it, but
        // there is nothing to submit - informational, never an action item
        // (otherwise every old test in a series shows up as "action needed").
        return { key: 'paper', tone: 'blue', icon: 'fa-file-lines', label: 'Paper available' };
      }
      return { key: 'soon', tone: 'grey', icon: 'fa-clock', label: 'Upcoming' };
    }
    // Test-centre (offline) test: no upload step.
    if (t.solution_available) {
      return { key: 'done', tone: 'green', icon: 'fa-check', label: 'Completed · solution available', done: true };
    }
    return { key: 'soon', tone: 'grey', icon: 'fa-calendar', label: t.test_date ? 'On ' + t.test_date : 'Upcoming' };
  }

  function chip(st) {
    return '<span class="ld-chip ld-chip--' + st.tone + '"><i class="fas ' + st.icon + '"></i> ' + esc(st.label) + '</span>';
  }

  /* Home-OMR vs test-centre is decided by the schedule itself (the
     authoritative per-test flag), falling back to the slug only when no
     tests are scheduled yet. */
  function programMode(e, tests) {
    if (e.program_category === 'interview') return 'interview';
    if (tests.some(function (t) { return t.requires_omr_upload; })) return 'omr';
    var slug = (e.canonical_slug || e.program_slug || '');
    if (slug.indexOf('omr') !== -1) return 'omr';
    if (slug.indexOf('batch') !== -1) return 'batch';
    return 'centre';
  }

  var MODE_INFO = {
    omr: {
      chip: '<i class="fas fa-file-pen"></i> Printed OMR Offline',
      steps: [
        '<strong>Paper unlocks here</strong> at the release time shown on each test - download the question paper and the blank OMR sheet.',
        '<strong>Take the test</strong> within the time limit. Mark your answers on the OMR sheet (print the blank sheet, or use the printed one you received).',
        '<strong>Upload a clear photo or PDF</strong> of your filled OMR sheet here before the deadline. You can re-upload until the deadline closes.',
        '<strong>Solutions unlock</strong> after the deadline. Your marks and rank appear here once results are published.',
      ],
    },
    centre: {
      chip: '<i class="fas fa-building"></i> Offline · at test centre',
      steps: [
        '<strong>Get your admit card</strong> (step 2 above) - it has your roll number and test centre.',
        '<strong>Carry a printed admit card and an original photo ID</strong> to the centre on every test date.',
        '<strong>Reach before the reporting time</strong> printed on your admit card. Tests are taken on OMR sheets at the centre - nothing to upload.',
        '<strong>Solutions and results</strong> appear here after each test.',
      ],
    },
    batch: {
      chip: '<i class="fas fa-chalkboard-teacher"></i> Offline batch',
      steps: [
        '<strong>Classes run at the centre</strong> - timetable and updates come on your batch WhatsApp group.',
        '<strong>Study materials</strong> (DPPs, formula sheets) are under the Study Materials button.',
        '<strong>Tests</strong> included in your batch are listed below with their status.',
      ],
    },
    interview: {
      chip: '<i class="fas fa-user-tie"></i> Interview program',
      steps: [
        '<strong>Book your interview slots</strong> with the Book / view slots button above - 3 are included (plus any add-on interviews you buy), each on a different day.',
        'Book them together or one at a time - you get a confirmation email every time, with how many are still pending.',
        'The interview venue is shared on email. Reach 15 minutes early in formal attire with 4 copies of your DAF and a photo ID. Slots cannot be rescheduled or cancelled.',
      ],
    },
  };

  /* ── Admit card step ── */
  function admitStep(e) {
    if (e.program_category === 'interview') return null;
    if (e.admit_card_status === 'approved' && e.admit_card_pdf_url) {
      return { state: 'done', label: 'Admit card ready', action: '<a class="ld-btn ld-btn--primary" href="' + esc(e.admit_card_pdf_url) + '" target="_blank" rel="noopener"><i class="fas fa-download"></i> Download admit card</a>' };
    }
    if (e.admit_card_status === 'pending') {
      return { state: 'wait', label: 'Admit card under review', note: 'We have your details. Your admit card will be ready here shortly.' };
    }
    if (e.admit_card_status === 'rejected') {
      return { state: 'todo', label: 'Admit card needs a fix', urgent: true,
        note: (e.admit_card_rejection_reason ? esc(e.admit_card_rejection_reason) + ' - ' : '') + 'please message us and we will sort it out.',
        action: '<a class="ld-btn ld-btn--wa" href="' + WA_HELP + '" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> WhatsApp us</a>' };
    }
    if (e.roll_number) {
      return { state: 'done', label: 'Admit card issued', note: 'Sent to your email. Roll no: ' + rollDisplay(e.roll_number) };
    }
    if (e.admit_form_url) {
      return { state: 'todo', label: 'Fill admit card form', urgent: true,
        note: 'Needed for your roll number and test centre. Takes 2 minutes - keep a photo ready.',
        action: '<a class="ld-btn ld-btn--primary" href="' + esc(e.admit_form_url) + '" target="_blank" rel="noopener"><i class="fas fa-pen-to-square"></i> Fill admit card form</a>' };
    }
    if (e.form_submitted) {
      return { state: 'wait', label: 'Details received', note: 'Your admit card is being prepared.' };
    }
    return { state: 'wait', label: 'Admit card coming', note: 'Our team will contact you on WhatsApp for your details.' };
  }

  function rollDisplay(roll) {
    var parts = String(roll).split('|');
    return parts.length === 2
      ? 'Degree <strong class="ld-mono">' + esc(parts[0]) + '</strong> · Diploma <strong class="ld-mono">' + esc(parts[1]) + '</strong>'
      : '<strong class="ld-mono">' + esc(roll) + '</strong>';
  }

  /* ── Data loading ── */
  function loadSchedule(slug) {
    var base = '/api/schedule/' + encodeURIComponent(slug);
    // Materials come back as [] for every non-शौर्य-Batch program - only
    // used to decide whether to show the Study Materials button.
    var materials = authFetch(base + '/materials').then(function (d) { return (d.materials || []).length; }).catch(function () { return 0; });
    return Promise.all([loadTests(base), materials]).then(function (r) { r[0].materialsCount = r[1]; return r[0]; });
  }

  function loadTests(base) {
    return authFetch(base).then(function (data) {
      var cats = data.categories || [];
      if (!cats.length) return { tests: data.tests || [], categories: [] };
      // Combo programs: fetch every track and merge, tagging each test.
      return Promise.all(cats.map(function (c) {
        return authFetch(base + '?category=' + encodeURIComponent(c)).then(function (d) {
          return (d.tests || []).map(function (t) { t.category = c; return t; });
        }).catch(function () { return []; });
      })).then(function (lists) {
        return { tests: [].concat.apply([], lists), categories: cats };
      });
    }).catch(function () { return { tests: [], categories: [], unavailable: true }; });
  }

  /* Interview programs have no test schedule - just the online copy of the
     RPSC AE Interview Guidance Book from Free Resources (the RPSC AE-gated
     PDF; paid interview learners skip the application-number check). */
  function loadInterview(slug) {
    var bookP = authFetch('/api/free-resources').then(function (list) {
      var rpsc = (list || []).filter(function (r) { return r.gating_type === 'rpsc_ae'; });
      var book = rpsc.filter(function (r) { return /book|guidance|question/i.test(r.title || ''); })[0] || rpsc[0] ||
        (list || []).filter(function (r) { return /rpsc/i.test(r.title || '') && /interview/i.test(r.title || ''); })[0];
      return book ? book.id : null;
    }).catch(function () { return null; });
    // Slots booked so far + Mock Interview Add-on packs (same data as the
    // booking page). Optional - the card still renders without it.
    var slotsP = authFetch('/api/interviews/booking?program=' + encodeURIComponent(slug)).then(function (d) {
      return { total: d.booked.total, included: d.booked.included, extra: d.booked.extra || 0, booked: d.booked.bookings.length, remaining: d.booked.remaining, packs: d.addons ? d.addons.packs : null };
    }).catch(function () { return null; });
    return Promise.all([bookP, slotsP]).then(function (r) {
      return { tests: [], categories: [], materialsCount: 0, bookId: r[0], slots: r[1] };
    });
  }

  /* ── Mock Interview Add-on (RPSC AE): same packs as the booking page,
     bought here with the learner's login - POST /api/interviews/addon-order
     then the normal /api/payment/verify. Packs stack. ── */
  function rupees(n) { return '\u20B9' + Number(n).toLocaleString('en-IN'); }

  function addonBlock(e, sched) {
    var sl = sched.slots;
    if (!sl || !sl.packs || !sl.packs.length) return '';
    var best = sl.packs.reduce(function (m, p) { return !m || p.price / p.slots < m.price / m.slots ? p : m; }, null);
    var small = sl.packs.reduce(function (m, p) { return !m || p.slots < m.slots ? p : m; }, null);
    var slug = e.canonical_slug || e.program_slug;
    return '<div class="ld-addon" data-ld-addon-card="' + esc(slug) + '">' +
      '<div class="ld-addon-tag">For RPSC AE Interview learners only</div>' +
      '<div class="ld-addon-title"><i class="fas fa-user-tie"></i> ' + (sl.extra ? 'Add even more mock interviews' : 'Want more mock interviews?') + '</div>' +
      '<p class="ld-addon-sub">' + (sl.extra
        ? 'You have <strong>' + sl.extra + ' add-on interview' + (sl.extra === 1 ? '' : 's') + '</strong> on top of your ' + sl.included + ' included ones. Packs stack - buy another anytime.'
        : 'Your programme includes ' + (sl.included || 3) + ' one-to-one mock interviews. Get more practice in front of the panel before the real RPSC board.') + '</p>' +
      '<div class="ld-packs">' + sl.packs.map(function (p) {
        var isBest = sl.packs.length > 1 && p === best;
        var save = Math.round(p.slots * small.price / small.slots - p.price);
        return '<div class="ld-pack' + (isBest ? ' is-best' : '') + '">' + (isBest ? '<span class="ld-pack-best"><i class="fas fa-star"></i> Best value</span>' : '') +
          '<b>' + p.slots + ' Mock Interviews</b>' +
          '<div class="ld-pack-price">' + rupees(p.price) + '</div>' +
          '<small>' + rupees(Math.round(p.price / p.slots)) + ' per interview</small>' +
          (isBest && save > 0 ? '<span class="ld-pack-save">Save ' + rupees(save) + '</span>' : '') +
          '<button class="ld-btn ' + (isBest ? 'ld-btn--best' : 'ld-btn--ghost') + '" data-ld-addon="' + esc(p.slug) + '" data-ld-slots="' + p.slots + '" data-ld-program="' + esc(slug) + '"><i class="fas fa-lock"></i> Buy now</button>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="ld-addon-msg" hidden></div>' +
      '<p class="ld-addon-note">No form to fill - pay and the interviews are added instantly. Book them with Book / view slots, one per day, in the same booking rounds.</p>' +
    '</div>';
  }

  var rzpLoading = null;
  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    if (!rzpLoading) {
      rzpLoading = new Promise(function (resolve, reject) {
        var sc = document.createElement('script');
        sc.src = 'https://checkout.razorpay.com/v1/checkout.js';
        sc.onload = resolve;
        sc.onerror = function () { rzpLoading = null; reject(new Error('Could not load the payment window. Check your internet connection.')); };
        document.head.appendChild(sc);
      });
    }
    return rzpLoading;
  }

  function postJson(path, body, withAuth) {
    var headers = { 'Content-Type': 'application/json' };
    var token = window.LearnerAuth ? window.LearnerAuth.getToken() : localStorage.getItem('jaspal_learner_token');
    if (withAuth && token) headers.Authorization = 'Bearer ' + token;
    return fetch(API_BASE + path, { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (d) {
        if (!res.ok) throw new Error(d.error || 'Something went wrong (' + res.status + ').');
        return d;
      });
    });
  }

  function buyAddon(btn) {
    var card = btn.closest('.ld-addon');
    var msgEl = card.querySelector('.ld-addon-msg');
    var slots = Number(btn.getAttribute('data-ld-slots'));
    var label = btn.innerHTML;
    function say(text, ok) { msgEl.hidden = false; msgEl.className = 'ld-addon-msg' + (ok ? ' is-ok' : ''); msgEl.innerHTML = text; }
    function reset() { btn.disabled = false; btn.innerHTML = label; }
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening payment…';
    msgEl.hidden = true;
    Promise.all([postJson('/api/interviews/addon-order', { pack: btn.getAttribute('data-ld-addon'), program: btn.getAttribute('data-ld-program') }, true), loadRazorpay()]).then(function (r) {
      var o = r[0];
      var rzp = new window.Razorpay({
        key: o.razorpay_key_id, amount: o.amount * 100, currency: 'INR',
        name: 'Dr. Jaspal Singh', description: o.program_name, order_id: o.razorpay_order_id,
        prefill: o.prefill, theme: { color: '#C81240' },
        handler: function (resp) {
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Confirming payment…';
          postJson('/api/payment/verify', { order_id: o.order_id, razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }).then(function (v) {
            if (!v.paid) throw new Error('verify');
            reset();
            say('<i class="fas fa-circle-check"></i> Payment received - ' + slots + ' extra mock interviews added. A confirmation email is on its way. Use <strong>Book / view slots</strong> to book them.', true);
            if (lastRender) _render(lastRender.container, lastRender.opts); // refresh slot counts
          }).catch(function () {
            reset();
            say('Payment received but we could not confirm it here. Refresh in a minute, or WhatsApp us your payment ID ' + esc(resp.razorpay_payment_id) + '.');
          });
        },
        modal: { ondismiss: reset },
      });
      rzp.on('payment.failed', function (resp) { reset(); say('Payment failed: ' + esc((resp.error && resp.error.description) || 'Please try again.')); });
      rzp.open();
    }).catch(function (err) { reset(); say(esc(err.message)); });
  }

  /* ── Rendering ── */
  function testActions(e, t, compact) {
    var slug = e.canonical_slug || e.program_slug;
    var html = '';
    if (t.question_paper_url) html += '<a class="ld-btn ld-btn--ghost" href="' + esc(t.question_paper_url) + '" target="_blank" rel="noopener"><i class="fas fa-file-lines"></i> Paper</a>';
    if (t.blank_omr_url && !t.my_upload) html += '<a class="ld-btn ld-btn--ghost" href="' + esc(t.blank_omr_url) + '" target="_blank" rel="noopener"><i class="fas fa-table-cells"></i> Blank OMR</a>';
    if (t.upload_open) {
      html += '<button class="ld-btn ' + (t.my_upload ? 'ld-btn--ghost' : 'ld-btn--primary') + '" data-ld-open="' + t.id + '" data-ld-slug="' + esc(slug) + '" data-ld-cat="' + esc(t.category || '') + '" data-ld-name="' + esc(e.program_name) + '">' +
        '<i class="fas fa-upload"></i> ' + (t.my_upload ? 'Re-upload' : 'Upload answer sheet') + '</button>';
    }
    if (t.solution_url) html += '<a class="ld-btn ld-btn--ghost" href="' + esc(t.solution_url) + '" target="_blank" rel="noopener"><i class="fas fa-lightbulb"></i> Solution</a>';
    if (t.result) {
      html += '<button class="ld-btn ld-btn--ghost" data-ld-open="' + t.id + '" data-ld-slug="' + esc(slug) + '" data-ld-cat="' + esc(t.category || '') + '" data-ld-name="' + esc(e.program_name) + '"><i class="fas fa-chart-simple"></i> ' + (compact ? 'Result' : 'Full result') + '</button>';
    }
    return html;
  }

  /* "Test 1 · <name>" - the syllabus is effectively the test's name, so it
     sits in the title; the line below keeps date / questions / time. */
  function testTitle(t, showTrack) {
    return 'Test ' + t.test_number +
      (t.syllabus ? ' <span class="ld-test-name">&middot; ' + esc(t.syllabus) + '</span>' : '') +
      (showTrack && t.category ? ' <span class="ld-track">' + esc(categoryLabel(t.category)) + '</span>' : '');
  }

  function testMeta(t) {
    return [
      t.test_date ? esc(t.test_date) : '',
      t.questions ? t.questions + ' Qs' : '',
      t.duration_minutes ? t.duration_minutes + ' min' : '',
    ].filter(Boolean).join(' · ');
  }

  function pickNext(tests) {
    // 1) anything needing action now, 2) the next upcoming test,
    // 3) the most recently released paper - never an old Test 1.
    var withSt = tests.map(function (t) { return { t: t, st: testStatus(t) }; });
    var urgent = withSt.filter(function (x) { return x.st.urgent; });
    if (urgent.length) return urgent[0].t;
    var soon = withSt.filter(function (x) { return x.st.key === 'soon'; });
    if (soon.length) return soon[0].t;
    var papers = withSt.filter(function (x) { return x.st.key === 'paper'; });
    return papers.length ? papers[papers.length - 1].t : null;
  }

  var INTERVIEW_SESSIONS = [
    ['Sessions 1-3', '3 Technical Sessions', 'Branch-wise technical sessions - Civil candidates get Civil Engineering technical, Electrical candidates get Electrical Engineering technical and Mechanical candidates get Mechanical Engineering technical - with subject-wise question patterns, model answers and what the board expects to hear.'],
    ['Session 4', '1 Non-Technical Session', 'Preparation for non-technical questions - your background, service choices, Rajasthan-specific current affairs, state projects, policies and situational questions.'],
    ['Session 5', '1 Personality Development Session', 'Body language, confident articulation, structured response framing, dress code and board etiquette - aspects that directly influence interview scores.'],
  ];

  /* WhatsApp group (session dates/timings), the 5-session plan and the
     Interview Guidance Book - interview programs only. */
  function interviewBlock(e, sched) {
    var groups = e.wa_groups || [];
    var waBlock =
      '<div class="ld-info ld-info--wa">' +
        '<div class="ld-info-text"><i class="fab fa-whatsapp"></i><div><strong>Session dates and timings are shared on the WhatsApp group</strong>' +
          '<span>Join the RPSC AE Interview group to get the schedule of every session, venue updates and reminders.</span></div></div>' +
        (groups.length
          ? groups.map(function (g) { return '<a class="ld-btn ld-btn--wa" href="' + esc(g.link) + '" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Join WhatsApp group</a>'; }).join('')
          : '<a class="ld-btn ld-btn--wa" href="' + WA_HELP + '?text=' + encodeURIComponent('Hi, please add me to the ' + e.program_name + ' WhatsApp group') + '" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Ask for group link</a>') +
      '</div>';

    var bookBlock =
      '<div class="ld-info ld-info--book">' +
        '<div class="ld-info-text"><i class="fas fa-book"></i><div><strong>RPSC AE Interview Guidance Book <span class="ld-tag">Offline copy provided</span></strong>' +
          '<span>A dedicated interview guidance book with 2500+ practice questions covering technical, non-technical and personality questions commonly asked by RPSC boards - your complete revision resource for the interview. ' +
          'Your printed copy is given to you at the Jaipur centre' + (sched.bookId ? '; you can also read it online now.' : '.') + '</span></div></div>' +
        (sched.bookId ? '<a class="ld-btn ld-btn--ghost" href="/profile/?open_resource=' + encodeURIComponent(sched.bookId) + '#free-resources"><i class="fas fa-book-open"></i> View online</a>' : '') +
      '</div>';

    var plan =
      '<details class="ld-fold" open>' +
        '<summary><i class="fas fa-calendar-days"></i> Session details (5 sessions)</summary>' +
        '<div class="ld-plan">' + INTERVIEW_SESSIONS.map(function (d) {
          return '<div class="ld-plan-row"><span class="ld-plan-day">' + d[0] + '</span>' +
            '<div class="ld-plan-body"><div class="ld-plan-title">' + d[1] + '</div><div class="ld-plan-focus">' + d[2] + '</div></div></div>';
        }).join('') + '</div>' +
        '<p class="ld-plan-note"><i class="fab fa-whatsapp"></i> Sessions can run on the same day. Exact dates and timings for each session are posted on the WhatsApp group. Your mock interviews are separate - book them with the Book / view slots button above.</p>' +
      '</details>';

    return addonBlock(e, sched) + waBlock + bookBlock + plan;
  }

  function renderProgram(e, sched, idx) {
    var tests = sched.tests;
    var mode = programMode(e, tests);
    var info = MODE_INFO[mode];
    var admit = admitStep(e);
    var showTrack = sched.categories.length > 1;
    var doneCount = tests.filter(function (t) { return testStatus(t).done; }).length;
    var next = pickNext(tests);

    var steps =
      '<ol class="ld-steps">' +
        '<li class="ld-step ld-step--done"><span class="ld-step-dot"><i class="fas fa-check"></i></span><span>Enrolled<small>' + esc(fmtDay(e.paid_at)) + '</small></span></li>' +
        (admit ? '<li class="ld-step ld-step--' + admit.state + '"><span class="ld-step-dot">' + (admit.state === 'done' ? '<i class="fas fa-check"></i>' : '2') + '</span><span>' + esc(admit.label) + '</span></li>' : '') +
        (mode !== 'interview' ? '<li class="ld-step ' + (tests.length && doneCount === tests.length ? 'ld-step--done' : 'ld-step--wait') + '"><span class="ld-step-dot">' + (admit ? '3' : '2') + '</span><span>Tests<small>' + (sched.loading ? 'loading…' : tests.length ? doneCount + ' of ' + tests.length + ' done' : 'schedule soon') + '</small></span></li>' : '') +
      '</ol>';

    var admitBlock = admit && (admit.note || admit.action)
      ? '<div class="ld-admit ld-admit--' + admit.state + '">' +
          '<div class="ld-admit-text"><i class="fas fa-id-card"></i><div><strong>' + esc(admit.label) + '</strong>' + (admit.note ? '<span>' + admit.note + '</span>' : '') + '</div></div>' +
          (admit.action || '') +
        '</div>'
      : '';

    var nextBlock = '';
    if (next) {
      var st = testStatus(next);
      var rel = st.key === 'upload' ? relative(next.omr_upload_deadline) : st.key === 'soon' ? relative(next.paper_release_at) : '';
      nextBlock =
        '<div class="ld-next">' +
          '<div class="ld-next-label">Next up</div>' +
          '<div class="ld-next-row">' +
            '<div class="ld-next-info">' +
              '<div class="ld-test-title">' + testTitle(next, showTrack) + '</div>' +
              (testMeta(next) ? '<div class="ld-test-meta">' + testMeta(next) + '</div>' : '') +
              '<div class="ld-next-status">' + chip(st) + (rel ? ' <span class="ld-rel">' + rel + '</span>' : '') + '</div>' +
            '</div>' +
            '<div class="ld-actions">' + testActions(e, next, true) + '</div>' +
          '</div>' +
        '</div>';
    } else if (sched.loading) {
      nextBlock = '<div class="ld-next ld-next--empty"><i class="fas fa-spinner fa-spin"></i> Loading your tests…</div>';
    } else if (sched.unavailable || !tests.length) {
      var sl = sched.slots;
      var slotTitle = !sl ? 'Book your offline mock interview slots'
        : !sl.remaining ? 'All ' + sl.total + ' mock interviews booked'
        : sl.booked ? sl.booked + ' of ' + sl.total + ' booked - ' + sl.remaining + ' still to book'
        : 'Book your ' + sl.total + ' offline mock interview slots';
      nextBlock = mode === 'interview'
        ? '<div class="ld-next">' +
            '<div class="ld-next-label">Interview slots</div>' +
            '<div class="ld-next-row">' +
              '<div class="ld-next-info"><div class="ld-test-title">' + esc(slotTitle) + '</div>' +
                '<div class="ld-test-meta">' + (sl && sl.extra ? sl.included + ' included + ' + sl.extra + ' add-on. ' : '') + 'One per day. Venue details are shared on email. Book one now and the rest anytime.</div></div>' +
              '<div class="ld-actions"><a class="ld-btn ld-btn--primary" href="/book-interview/?program=' + encodeURIComponent(e.canonical_slug || e.program_slug) + '"><i class="fas fa-calendar-check"></i> Book / view slots</a></div>' +
            '</div>' +
          '</div>'
        : '<div class="ld-next ld-next--empty"><i class="fas fa-calendar-plus"></i> Your test schedule will appear here as soon as it is published.</div>';
    } else {
      nextBlock = '<div class="ld-next ld-next--empty"><i class="fas fa-trophy"></i> All tests done - great work! Review solutions and results below.</div>';
    }

    var interviewInfo = mode === 'interview' ? interviewBlock(e, sched) : '';

    var testList = tests.length
      ? '<details class="ld-fold"' + (tests.length <= 3 ? ' open' : '') + '>' +
          '<summary><i class="fas fa-list-check"></i> All tests (' + tests.length + ')</summary>' +
          '<div class="ld-tests">' + tests.map(function (t) {
            var st = testStatus(t);
            return '<div class="ld-test">' +
              '<div class="ld-test-info">' +
                '<div class="ld-test-title">' + testTitle(t, showTrack) + '</div>' +
                (testMeta(t) ? '<div class="ld-test-meta">' + testMeta(t) + '</div>' : '') +
                '<div>' + chip(st) + '</div>' +
              '</div>' +
              '<div class="ld-actions">' + testActions(e, t, true) + '</div>' +
            '</div>';
          }).join('') + '</div>' +
        '</details>'
      : '';

    var howTo =
      '<details class="ld-fold">' +
        '<summary><i class="fas fa-circle-question"></i> ' + (mode === 'interview' ? 'How interview slots work' : 'How tests work for this program') + '</summary>' +
        '<ol class="ld-howto">' + info.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '</details>';

    var wa = mode === 'interview' ? '' : (e.wa_groups || []).map(function (g) {
      return '<a class="ld-btn ld-btn--wa" href="' + esc(g.link) + '" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> ' + (g.label ? 'Join ' + esc(g.label) + ' group' : 'Join batch WhatsApp group') + '</a>';
    }).join('');

    var footer =
      '<div class="ld-footer">' +
        wa +
        (sched.materialsCount ? '<button class="ld-btn ld-btn--ghost" data-ld-schedule="' + esc(e.canonical_slug || e.program_slug) + '" data-ld-name="' + esc(e.program_name) + '"><i class="fas fa-book-open"></i> Study materials (' + sched.materialsCount + ')</button>' : '') +
        '<a class="ld-btn ld-btn--link" href="' + WA_HELP + '?text=' + encodeURIComponent('Hi, I need help with ' + e.program_name + (e.roll_number ? ' (Roll no ' + e.roll_number + ')' : '')) + '" target="_blank" rel="noopener"><i class="fas fa-headset"></i> Need help?</a>' +
      '</div>';

    return '<article class="ld-program" id="' + esc(programAnchor(e)) + '">' +
      '<header class="ld-program-head">' +
        '<div>' +
          '<h3 class="ld-program-name">' + esc(e.program_name) + '</h3>' +
          '<div class="ld-program-sub">' + (sched.loading ? '' : '<span class="ld-mode">' + info.chip + '</span>') +
            (e.roll_number ? '<span class="ld-roll">Roll no: ' + rollDisplay(e.roll_number) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</header>' +
      steps + admitBlock + nextBlock + interviewInfo + testList + (sched.loading ? '' : howTo) + footer +
    '</article>';
  }

  function programAnchor(e) {
    return 'ld-' + String(e.canonical_slug || e.program_slug || e.order_id).replace(/[^a-z0-9-]/gi, '');
  }

  /* Cross-program "do this now" list, shown in the header notification bell
     (login-wall.js). Only things the learner can act on right now. */
  function actionItems(enrollments, schedules) {
    var items = [];
    enrollments.forEach(function (e, i) {
      var anchor = programAnchor(e);
      var admit = admitStep(e);
      if (admit && admit.urgent) items.push({ anchor: anchor, icon: 'fa-id-card', text: admit.label, sub: e.program_name });
      schedules[i].tests.forEach(function (t) {
        if (testStatus(t).key === 'upload') {
          items.push({ anchor: anchor, icon: 'fa-upload', text: 'Upload Test ' + t.test_number + ' answer sheet - due ' + fmtWhen(t.omr_upload_deadline), sub: e.program_name });
        }
      });
    });
    return items;
  }

  /* Cached for the header bell on every other page, and broadcast so a bell
     already on screen updates immediately. */
  var ACTIONS_KEY = 'jaspal_learner_actions';
  function publishActions(items, hasPrograms) {
    try { localStorage.setItem(ACTIONS_KEY, JSON.stringify({ at: Date.now(), items: items, hasPrograms: !!hasPrograms })); } catch (e) { /* private mode */ }
    try { window.dispatchEvent(new CustomEvent('learner:actions', { detail: items })); } catch (e) { /* old browsers */ }
  }

  function loadAll() {
    return authFetch('/api/enrollment/my-enrollments').then(function (data) {
      var enrollments = data.enrollments || [];
      return Promise.all(enrollments.map(function (e) {
        if (e.program_category === 'interview') return loadInterview(e.canonical_slug || e.program_slug);
        return loadSchedule(e.canonical_slug || e.program_slug);
      })).then(function (schedules) { return { enrollments: enrollments, schedules: schedules }; });
    });
  }

  /* Header bell on non-dashboard pages: data only, no rendering. */
  function refreshActions() {
    return loadAll().then(function (d) {
      var items = actionItems(d.enrollments, d.schedules);
      publishActions(items, d.enrollments.length > 0);
      return items;
    });
  }

  function wire(container) {
    container.querySelectorAll('[data-ld-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!window.ScheduleModal) return;
        window.ScheduleModal.openTest(btn.getAttribute('data-ld-slug'), btn.getAttribute('data-ld-name'), btn.getAttribute('data-ld-cat') || null, btn.getAttribute('data-ld-open'));
      });
    });
    container.querySelectorAll('[data-ld-schedule]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.ScheduleModal) window.ScheduleModal.openMaterials(btn.getAttribute('data-ld-schedule'), btn.getAttribute('data-ld-name'));
      });
    });
    container.querySelectorAll('[data-ld-addon]').forEach(function (btn) {
      btn.addEventListener('click', function () { buyAddon(btn); });
    });
  }

  /* ── Fast first paint ──
     The API runs on a free Render instance that cold-starts (can take up
     to a minute), and a full load is 1 + 2-4 requests per program. So:
       1. paint the last dashboard this browser saw, instantly;
       2. paint program cards as soon as the enrollment list arrives,
          with a "Loading your tests" line per card;
       3. swap each card in as its own schedule arrives.
     Cached per login token, cleared on logout. ── */
  var DASH_KEY = 'jaspal_learner_dash';
  var DASH_MAX_AGE = 7 * 24 * 3600 * 1000;

  function tokenTag() {
    var t = (window.LearnerAuth && window.LearnerAuth.getToken()) || localStorage.getItem('jaspal_learner_token') || '';
    return t.slice(-24);
  }
  function readDashCache() {
    try {
      var c = JSON.parse(localStorage.getItem(DASH_KEY));
      if (!c || c.tok !== tokenTag() || Date.now() - c.at > DASH_MAX_AGE) return null;
      return c;
    } catch (e) { return null; }
  }
  function writeDashCache(enrollments, schedules) {
    try { localStorage.setItem(DASH_KEY, JSON.stringify({ tok: tokenTag(), at: Date.now(), enrollments: enrollments, schedules: schedules })); }
    catch (e) { /* quota / private mode - just no instant paint next time */ }
  }

  function headingHtml(opts) {
    return opts.hideHeading ? '' : '<div class="ld-head"><h2><i class="fas fa-graduation-cap"></i> My Enrolled Courses &amp; Programs</h2>' +
      '<p class="ld-sub">See all your enrolled offline test series, Printed OMR tests, batches and admit cards here.</p></div>';
  }

  function paint(container, opts, enrollments, schedules) {
    container.innerHTML = headingHtml(opts) +
      enrollments.map(function (e, i) { return renderProgram(e, schedules[i], i); }).join('');
    wire(container);
  }

  /* Replace one program card in place, keeping any folds the learner opened. */
  function repaintCard(container, e, sched, idx) {
    var old = document.getElementById(programAnchor(e));
    var tmp = document.createElement('div');
    tmp.innerHTML = renderProgram(e, sched, idx);
    var fresh = tmp.firstChild;
    if (old) {
      var wasOpen = Array.prototype.map.call(old.querySelectorAll('details'), function (d) { return d.open; });
      fresh.querySelectorAll('details').forEach(function (d, i) { if (wasOpen[i]) d.open = true; });
      old.parentNode.replaceChild(fresh, old);
    } else {
      container.appendChild(fresh);
    }
    wire(fresh);
  }

  function scrollToHash() {
    var target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    if (target) setTimeout(function () { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  }

  function render(container, opts) {
    opts = opts || {};
    var cached = readDashCache();
    var painted = false;

    if (cached && cached.enrollments.length) {
      if (opts.onHasPrograms) opts.onHasPrograms(cached.enrollments);
      paint(container, opts, cached.enrollments, cached.schedules);
      painted = true;
      scrollToHash();
    } else {
      container.innerHTML = headingHtml(opts) +
        '<div class="ld-next ld-next--empty"><i class="fas fa-spinner fa-spin"></i> Loading your programs and tests… the first load can take up to a minute.</div>';
    }

    authFetch('/api/enrollment/my-enrollments').then(function (data) {
      var enrollments = data.enrollments || [];
      if (!enrollments.length) {
        container.innerHTML = '';
        publishActions([], false);
        try { localStorage.removeItem(DASH_KEY); } catch (e) { /* ignore */ }
        if (opts.onEmpty) opts.onEmpty();
        return;
      }
      if (!painted && opts.onHasPrograms) opts.onHasPrograms(enrollments);

      // Reuse cached schedules for programs already known (no flash back to
      // "loading"); brand-new programs show the loading line.
      var known = {};
      if (cached) cached.enrollments.forEach(function (e, i) { known[e.order_id] = cached.schedules[i]; });
      var schedules = enrollments.map(function (e) {
        return known[e.order_id] || { loading: true, tests: [], categories: [], materialsCount: 0 };
      });
      var sameSet = painted && cached.enrollments.length === enrollments.length &&
        enrollments.every(function (e) { return !!known[e.order_id]; });
      if (!sameSet) {
        paint(container, opts, enrollments, schedules);
        if (!painted) scrollToHash();
      }

      return Promise.all(enrollments.map(function (e, i) {
        var p = e.program_category === 'interview'
          ? loadInterview(e.canonical_slug || e.program_slug)
          : loadSchedule(e.canonical_slug || e.program_slug);
        return p.then(function (sched) {
          schedules[i] = sched;
          repaintCard(container, e, sched, i);
        });
      })).then(function () {
        publishActions(actionItems(enrollments, schedules), true);
        writeDashCache(enrollments, schedules);
      });
    }).catch(function (err) {
      if (painted) return; // keep showing the last known dashboard
      container.innerHTML = '<p class="profile-empty">Could not load your programs. ' +
        (err && err.status === 401 ? 'Please log in again.' : 'Please refresh the page.') + '</p>';
    });
  }

  /* After an upload in the modal, quietly refresh the cards behind it so
     the chip flips to "submitted" without a page reload. */
  var lastRender = null;
  var _render = render;
  render = function (container, opts) { lastRender = { container: container, opts: opts }; _render(container, opts); };
  window.addEventListener('learner:upload-done', function () {
    if (lastRender) _render(lastRender.container, lastRender.opts);
  });

  window.LearnerDashboard = { render: render, testStatus: testStatus, refreshActions: refreshActions };
})();
