/* ============================================================
   my-programs.js  -  My Tests & Programs page
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   Same dashboard as the top of /profile (js/learner-dashboard.js),
   on its own page so old links/bookmarks to /my-programs keep working.
   Requires learner-auth.js, schedule-modal.js and learner-dashboard.js
   to be loaded first.
   ============================================================ */

(function () {
  'use strict';

  function init() {
    if (!window.LearnerAuth || !window.LearnerAuth.isLoggedIn()) {
      document.getElementById('profileNotLoggedIn').style.display = 'block';
      return;
    }
    document.getElementById('profileContent').style.display = 'block';
    var body = document.getElementById('enrolledBody');
    window.LearnerDashboard.render(body, {
      hideHeading: true,
      onEmpty: function () {
        body.innerHTML = '<p class="profile-empty"><i class="fas fa-graduation-cap"></i> No enrolled programs yet.<br>' +
          '<a href="/programs">Browse programs &rarr;</a></p>';
      },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
