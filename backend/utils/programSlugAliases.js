/* ============================================================
   utils/programSlugAliases.js

   Some programs were sold through checkout links using an older,
   shorter slug (e.g. "rssb-jen-degree-test-series") before the
   frontend/programs/ folder and the programs DB table were renamed to
   a longer canonical slug (e.g.
   "rssb-je-jaspalsirki-testseries-degree-civil"). frontend/_redirects
   301s browser visits from the old slug to the new one, but
   enrollments.program_slug stores whatever the checkout page actually
   sent at purchase time - it was never backfilled. So a learner who
   paid through the old link has an enrollment row keyed to the old
   slug forever, and any lookup keyed only on the canonical slug (the
   Schedule tab, the enrolled-program pages) would incorrectly report
   "no active enrollment" for them.

   Keyed by canonical slug -> every legacy slug known to have been
   used at checkout for that program. Discovered 2026-07-18 by
   cross-referencing each program page's Enroll Now href against
   frontend/programs/<slug>/ and the programs table - if a new legacy
   alias surfaces later, add it here rather than special-casing it
   in each caller.
   ============================================================ */

const LEGACY_ALIASES = {
  'rssb-je-jaspalsirki-testseries-degree-civil':        ['rssb-jen-degree-test-series'],
  'rssb-je-jaspalsirki-testseries-degree-civil-omr':    ['rssb-je-omr-degree-test-series'],
  'rssb-jen-2026-jaspalsirki-testseries-diploma-civil':     ['rssb-jen-diploma-test-series'],
  'rssb-jen-2026-jaspalsirki-testseries-diploma-civil-omr': ['rssb-jen-omr-diploma-test-series'],
};

/** All slugs (canonical + legacy) that should be treated as the same program. */
function slugsFor(canonicalSlug) {
  return [canonicalSlug, ...(LEGACY_ALIASES[canonicalSlug] || [])];
}

/** Given any known slug (canonical or legacy), returns the canonical slug.
    program_schedule/programs rows are always keyed by the canonical slug -
    a request arriving with a legacy slug (e.g. from an old enrollment row)
    must be normalized before querying them, or it'll find zero rows even
    though the schedule exists. Unknown slugs pass through unchanged. */
function canonicalize(slug) {
  if (LEGACY_ALIASES[slug]) return slug; // already canonical
  for (const [canonical, legacyList] of Object.entries(LEGACY_ALIASES)) {
    if (legacyList.includes(slug)) return canonical;
  }
  return slug;
}

module.exports = { LEGACY_ALIASES, slugsFor, canonicalize };
