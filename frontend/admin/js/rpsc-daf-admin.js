/* ============================================================
   rpsc-daf-admin.js  -  Admin > Free Resources > DAF submissions
   FREE personalised RPSC AE interview questions: every DAF a
   learner submitted, View DAF, reply with typed questions and/or a
   PDF (shown on the learner's profile; first send emails them a
   link), search / filters / CSV, and the one-time announcement.
   Backend: routes/rpsc-daf.js
   Exposes: window.RpscDafAdmin.load()
   ============================================================ */

(function () {
  'use strict';

  var API = location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  var state = { data: null, q: '', branch: '', status: '', open: null };

  function token() { return localStorage.getItem('jaspal_admin_token'); }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function msg(text, type) {
    if (typeof window.showToast === 'function') return window.showToast(text, type);
    alert(text);
  }
  function req(method, path, body, isForm) {
    var headers = { Authorization: 'Bearer ' + token() };
    if (body && !isForm) headers['Content-Type'] = 'application/json';
    return fetch(API + path, { method: method, headers: headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined }).then(function (r) {
      if (r.status === 401) { location.href = '/admin/login'; throw new Error('Session expired'); }
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
        return d;
      });
    });
  }
  function openFile(path) {
    var w = window.open('', '_blank');
    if (w) w.document.write('<p style="font-family:sans-serif;padding:24px;">Opening…</p>');
    fetch(API + path, { headers: { Authorization: 'Bearer ' + token() } }).then(function (r) {
      if (!r.ok) throw new Error('Could not open the file.');
      return r.blob();
    }).then(function (b) { var u = URL.createObjectURL(b); if (w) w.location.href = u; else location.href = u; })
      .catch(function (e) { if (w) w.close(); msg(e.message, 'error'); });
  }
  function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '';
  }
  var STATUS = {
    new: '<span class="rda-b rda-b--new">New</span>',
    in_progress: '<span class="rda-b rda-b--prog">In progress</span>',
    answered: '<span class="rda-b rda-b--ok">Answered</span>',
  };

  function load() {
    var root = $('rpscDafAdmin');
    if (!root) return;
    if (!state.data) root.innerHTML = '<p class="admin-empty">Loading…</p>';
    return req('GET', '/api/rpsc-daf/admin').then(function (d) {
      state.data = d;
      render();
    }).catch(function (e) { root.innerHTML = '<p class="admin-empty" style="color:#B91C1C;">' + esc(e.message) + '</p>'; });
  }

  function filtered() {
    var q = state.q.toLowerCase();
    return state.data.submissions.filter(function (s) {
      if (state.branch && s.branch !== state.branch) return false;
      if (state.status && s.status !== state.status) return false;
      if (q && [s.name, s.phone, s.email, s.roll_no, s.application_number].join(' ').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function render() {
    var root = $('rpscDafAdmin'), d = state.data, c = d.counts, a = d.announce;
    var list = filtered();
    root.innerHTML =
      '<div class="rda-bar"><div><strong><i class="fas fa-bullhorn"></i> Announcement email</strong> <span class="rda-meta">(RPSC AE verified + paid RPSC AE learners who have not submitted, once each) · sent to ' + a.sent + '</span></div>' +
        '<div class="rda-row"><input id="rdaTo" type="email" value="biz@solvvai.com" placeholder="your email for a sample">' +
        '<button class="btn-admin-secondary rda-sm" id="rdaSample"><i class="fas fa-eye"></i> Send sample</button>' +
        '<button class="btn-admin-primary rda-sm" id="rdaAll"' + (a.pending ? '' : ' disabled') + '><i class="fas fa-paper-plane"></i> Send to all (' + a.pending + ')</button></div></div>' +
      teamBar(d.team || {}) +
      '<div class="rda-row" style="margin:12px 0;">' +
        '<input id="rdaQ" type="search" placeholder="Search name / phone / roll / application no." value="' + esc(state.q) + '" style="min-width:260px;">' +
        '<select id="rdaBranch"><option value="">All branches</option>' + ['Civil', 'Mechanical', 'Electrical'].map(function (b) { return '<option' + (state.branch === b ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select>' +
        '<select id="rdaStatus"><option value="">All status</option>' + [['new', 'New'], ['in_progress', 'In progress'], ['answered', 'Answered']].map(function (x) { return '<option value="' + x[0] + '"' + (state.status === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
        '<button class="btn-admin-secondary rda-sm" id="rdaCsv"><i class="fas fa-download"></i> CSV</button>' +
        '<span class="rda-meta"><strong>' + c.new + '</strong> new · <strong>' + c.in_progress + '</strong> in progress · <strong>' + c.answered + '</strong> answered · showing ' + list.length + '</span>' +
      '</div>' +
      (list.length
        ? '<div class="rda-wrap"><table class="rda-table"><thead><tr><th>Submitted</th><th>Learner</th><th>Branch</th><th>Roll / application no.</th><th>DAF</th><th>Status</th><th></th></tr></thead><tbody>' +
          list.map(rowHtml).join('') + '</tbody></table></div>'
        : '<p class="admin-empty">' + (d.submissions.length ? 'No submissions match these filters.' : 'No DAF submissions yet.') + '</p>');
    wire(root);
  }

  function teamBar(t) {
    return '<div class="rda-bar" style="margin-top:12px;"><div><strong><i class="fas fa-users"></i> Send DAFs to content team</strong> <span class="rda-meta">(PDFs attached, named Learner Name_Paid / _Free; each click sends only DAFs not sent before)' +
        (t.last_at ? ' · last sent ' + esc(fmtDate(t.last_at)) : '') + '</span></div>' +
      '<div class="rda-row"><input id="rdaTeamTo" type="text" value="' + esc(t.emails || '') + '" placeholder="content team email(s), comma separated" style="min-width:300px;">' +
        '<button class="btn-admin-primary rda-sm" id="rdaTeam"' + (t.pending && !t.sending ? '' : ' disabled') + '><i class="fas fa-paper-plane"></i> ' +
          (t.sending ? 'Sending…' : 'Send new DAFs (' + (t.pending || 0) + ')') + '</button></div></div>';
  }

  function rowHtml(s) {
    var row = '<tr' + (state.open === s.id ? ' class="rda-on"' : '') + '>' +
      '<td>' + esc(fmtDate(s.created_at)) + (s.updated_at && s.updated_at !== s.created_at && s.status !== 'answered' ? '<br><span class="rda-meta">updated ' + esc(fmtDate(s.updated_at)) + '</span>' : '') + '</td>' +
      '<td><strong>' + esc(s.name) + '</strong> ' + (s.paid ? '<span class="rda-b rda-b--paid">Paid</span>' : '<span class="rda-b">Free</span>') +
        '<br><span class="rda-meta">' + esc(s.phone || '') + ' · ' + esc(s.email || '') + '</span></td>' +
      '<td>' + esc(s.branch || '') + '</td>' +
      '<td>' + esc(s.roll_no || '') + '<br><span class="rda-meta">' + esc(s.application_number || '') + '</span></td>' +
      '<td><button class="rda-link" data-daf="' + s.id + '">View DAF</button>' +
        (s.team_pending ? '<br><span class="rda-meta">not sent to team</span>' : '<br><span class="rda-meta"><i class="fas fa-check"></i> team ' + esc(fmtDate(s.team_sent_at)) + '</span>') + '</td>' +
      '<td>' + (STATUS[s.status] || esc(s.status)) + (s.replied_at ? '<br><span class="rda-meta">' + esc(fmtDate(s.replied_at)) + '</span>' : '') + '</td>' +
      '<td><button class="btn-admin-secondary rda-sm" data-respond="' + s.id + '">' + (s.status === 'answered' ? 'Edit reply' : s.status === 'in_progress' ? 'Continue' : 'Respond') + '</button></td>' +
    '</tr>';
    if (state.open === s.id) row += '<tr class="rda-edit"><td colspan="7">' + editorHtml(s) + '</td></tr>';
    return row;
  }

  function editorHtml(s) {
    return '<div class="rda-form">' +
      '<div style="margin-bottom:8px;"><strong>Reply to ' + esc(s.name) + '</strong> <span class="rda-meta">' + esc(s.branch || '') + ' · Roll ' + esc(s.roll_no || '') + '</span> <button class="rda-link" data-daf="' + s.id + '">View DAF</button></div>' +
      '<label>Questions - type one per line (the learner sees them as a numbered list)<textarea id="rdaText" rows="8">' + esc(s.reply_text || '') + '</textarea></label>' +
      '<label>And / or a PDF from Jaspal Sir<input id="rdaPdf" type="file" accept="application/pdf"></label>' +
      (s.has_reply_pdf ? '<p class="rda-meta" style="margin:4px 0 0;"><button class="rda-link" data-replypdf="' + s.id + '">Open current PDF</button> · <label style="display:inline-flex;gap:4px;align-items:center;font-weight:600;"><input type="checkbox" id="rdaRemovePdf"> remove it</label> · a new file replaces it</p>' : '') +
      '<div class="rda-row" style="margin-top:10px;">' +
        (s.status === 'answered'
          ? '<button class="btn-admin-primary rda-sm" data-save="send"><i class="fas fa-check"></i> Update reply</button><span class="rda-meta">Already sent - the learner sees the update right away (no new email).</span>'
          : '<button class="btn-admin-secondary rda-sm" data-save="save"><i class="fas fa-floppy-disk"></i> Save as in progress</button>' +
            '<button class="btn-admin-primary rda-sm" data-save="send"><i class="fas fa-paper-plane"></i> Send to learner</button>' +
            '<span class="rda-meta">Send shows the reply on their profile and emails them a "View my questions" link.</span>') +
        '<button class="btn-admin-secondary rda-sm" id="rdaClose">Close</button>' +
      '</div></div>';
  }

  function wire(root) {
    $('rdaQ').addEventListener('input', function (e) { state.q = e.target.value; var pos = e.target.selectionStart; render(); var i = $('rdaQ'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) {} });
    $('rdaBranch').addEventListener('change', function (e) { state.branch = e.target.value; render(); });
    $('rdaStatus').addEventListener('change', function (e) { state.status = e.target.value; render(); });
    $('rdaCsv').addEventListener('click', csv);
    root.querySelectorAll('[data-daf]').forEach(function (b) {
      b.addEventListener('click', function () { openFile('/api/rpsc-daf/admin/' + b.getAttribute('data-daf') + '/daf'); });
    });
    root.querySelectorAll('[data-replypdf]').forEach(function (b) {
      b.addEventListener('click', function () { openFile('/api/rpsc-daf/admin/' + b.getAttribute('data-replypdf') + '/reply-pdf'); });
    });
    root.querySelectorAll('[data-respond]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = Number(b.getAttribute('data-respond'));
        state.open = state.open === id ? null : id;
        render();
      });
    });
    if ($('rdaClose')) $('rdaClose').addEventListener('click', function () { state.open = null; render(); });
    root.querySelectorAll('[data-save]').forEach(function (b) {
      b.addEventListener('click', function () { save(b.getAttribute('data-save'), b); });
    });
    $('rdaSample').addEventListener('click', function () {
      var to = $('rdaTo').value.trim(), btn = this;
      btn.disabled = true;
      req('POST', '/api/rpsc-daf/admin/announce', { mode: 'sample', to: to })
        .then(function () { msg('Sample sent to ' + to + '.', 'success'); })
        .catch(function (e) { msg(e.message, 'error'); })
        .then(function () { btn.disabled = false; });
    });
    $('rdaAll').addEventListener('click', function () {
      var n = state.data.announce.pending, btn = this;
      if (!confirm('Email the "FREE personalised RPSC AE interview questions" announcement to ' + n + ' RPSC AE learner(s)?\n\nEach learner gets it only once. Learners who already submitted their DAF are skipped.')) return;
      btn.disabled = true;
      req('POST', '/api/rpsc-daf/admin/announce', { mode: 'all' }).then(function (r) {
        msg('Announcement queued to ' + r.queued + ' learner(s) - emails go out over the next few minutes.', 'success');
        load();
      }).catch(function (e) { msg(e.message, 'error'); btn.disabled = false; });
    });
    $('rdaTeam').addEventListener('click', function () {
      var n = (state.data.team || {}).pending, to = $('rdaTeamTo').value.trim(), btn = this;
      if (!to) return msg('Enter the content team email address first.', 'error');
      if (!confirm('Email ' + n + ' new DAF(s) to ' + to + '?\n\nDAFs already sent to the team are not sent again (a learner who replaces their DAF counts as new).')) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
      req('POST', '/api/rpsc-daf/admin/send-to-team', { to: to }).then(function (r) {
        var t = r.sent ? r.sent + ' DAF(s) sent to the content team in ' + r.emails + ' email(s).' : 'No new DAFs to send.';
        if (r.failed && r.failed.length) t += ' Not sent (try again): ' + r.failed.join(', ');
        msg(t, r.failed && r.failed.length ? 'error' : 'success');
        load();
      }).catch(function (e) { msg(e.message, 'error'); load(); });
    });
  }

  function save(action, btn) {
    var id = state.open;
    var text = $('rdaText').value;
    var file = $('rdaPdf').files[0];
    var remove = $('rdaRemovePdf') && $('rdaRemovePdf').checked;
    var s = state.data.submissions.filter(function (x) { return x.id === id; })[0];
    if (action === 'send' && !text.trim() && !file && !(s.has_reply_pdf && !remove)) return msg('Type the questions or attach a PDF before sending.', 'error');
    if (action === 'send' && s.status !== 'answered' && !confirm('Send the reply to ' + s.name + '?\n\nIt appears on their profile and they get an email with a "View my questions" link.')) return;
    var fd = new FormData();
    fd.append('reply_text', text);
    fd.append('action', action);
    if (remove) fd.append('remove_pdf', 'true');
    if (file) fd.append('pdf', file);
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
    req('POST', '/api/rpsc-daf/admin/' + id + '/reply', fd, true).then(function (r) {
      msg(r.status === 'answered' ? (r.emailed ? 'Reply sent - the learner has been emailed.' : 'Reply updated.') : 'Saved as in progress.', 'success');
      state.open = null;
      return load();
    }).catch(function (e) { msg(e.message, 'error'); btn.disabled = false; btn.textContent = 'Try again'; });
  }

  function csv() {
    var cell = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = [['Submitted', 'Name', 'Phone', 'Email', 'Branch', 'Roll no', 'Application no', 'Paid learner', 'Status', 'Replied at', 'Sent to team'].join(',')];
    filtered().forEach(function (s) {
      lines.push([fmtDate(s.created_at), s.name, s.phone, s.email, s.branch, s.roll_no, s.application_number, s.paid ? 'yes' : 'no', s.status, fmtDate(s.replied_at), s.team_pending ? '' : fmtDate(s.team_sent_at)].map(cell).join(','));
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'rpsc-ae-daf-submissions.csv';
    a.click();
  }

  window.RpscDafAdmin = { load: load };
})();
