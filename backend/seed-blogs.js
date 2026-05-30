/**
 * seed-blogs.js  -  Publish 10 blog posts (2 per category) to jaspalsingh.in
 *
 * Usage:
 *   1. Set your admin password below (ADMIN_PASSWORD)
 *   2. Run: node seed-blogs.js
 */

const https = require('https');
const http  = require('http');

/* ── CONFIG ── change password before running ── */
const ADMIN_EMAIL    = 'jaspal@jaspalsingh.in';   // your admin email
const ADMIN_PASSWORD = 'YOUR_PASSWORD_HERE';       // ← replace this
const API_BASE       = 'https://jaspalsingh.in';   // production

/* ── helpers ── */
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url     = new URL(API_BASE + path);
    const lib     = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token   ? { 'Authorization': 'Bearer ' + token } : {}),
      },
    };
    const request = lib.request(options, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

/* ── blog posts ── */
const posts = [

  /* ══════════════════════════════════════════════════════
     CATEGORY 1: exam-updates  (2 posts)
  ══════════════════════════════════════════════════════ */
  {
    title:    'ESE 2025 Final Result Declared  -  Check Your Score, Marks & What Comes Next',
    category: 'exam-updates',
    excerpt:  'UPSC has declared the final result of Engineering Services Examination (ESE) 2025. Here is a complete breakdown of the cut-offs, marks, and the personality test process ahead.',
    content: `<h2>ESE 2025 Final Result  -  What You Need to Know</h2>
<p>The Union Public Service Commission (UPSC) has officially declared the final result of <strong>Engineering Services Examination (ESE) 2025</strong>. This is the culmination of a three-stage selection process  -  Preliminary, Mains, and Personality Test (Interview).</p>

<h2>Stages of ESE Selection</h2>
<table>
  <thead><tr><th>Stage</th><th>Nature</th><th>Marks</th></tr></thead>
  <tbody>
    <tr><td>Stage 1  -  Prelims</td><td>Objective (OBJ-I + OBJ-II)</td><td>500 marks</td></tr>
    <tr><td>Stage 2  -  Mains</td><td>Conventional (Paper-I + Paper-II)</td><td>600 marks</td></tr>
    <tr><td>Stage 3  -  Personality Test</td><td>Interview by UPSC Board</td><td>200 marks</td></tr>
  </tbody>
</table>
<p>The final merit list is prepared based on <strong>Mains + Interview (800 marks)</strong>  -  the Prelims score is only used for shortlisting and does NOT count in the final merit.</p>

<h2>Key Points About the Final Result</h2>
<ul>
  <li>Final result is available on <strong>upsc.gov.in</strong> under "Written Results" section.</li>
  <li>Selected candidates are allotted services such as <strong>IRSE, IRSME, IRSEE, IRSSS, Central Engineering Services, and CPWD</strong>.</li>
  <li>Allocation depends on rank, category, and service preference filled during DAF (Detailed Application Form).</li>
  <li>Medical examination and document verification follows the result.</li>
</ul>

<h2>Typical Cut-offs (Civil Engineering  -  General Category)</h2>
<p>While UPSC does not officially release subject-wise cut-offs, based on trends over the past several years:</p>
<ul>
  <li><strong>Prelims cut-off (CE):</strong> approximately 265–290 out of 500</li>
  <li><strong>Mains + Interview (final merit):</strong> top candidates typically score 500–560 out of 800</li>
</ul>
<p>These figures shift year to year depending on paper difficulty and number of vacancies.</p>

<h2>What Happens After the Result?</h2>
<ol>
  <li>UPSC sends offer letters to selected candidates via Speed Post and email.</li>
  <li>Candidates must report for medical examination at the designated government hospital.</li>
  <li>Original document verification is conducted at UPSC office, New Delhi.</li>
  <li>Service allocation is done by DoPT (Department of Personnel and Training).</li>
  <li>Joining formalities and pre-service training begins at the allocated organisation.</li>
</ol>

<h2>Advice for Candidates Who Did Not Clear This Year</h2>
<blockquote>Clearing ESE is not a one-year journey for most aspirants. What separates those who eventually make it is <em>structured revision, consistent practice, and honest self-assessment</em>  -  not the number of hours logged.</blockquote>
<p>If you attempted ESE 2025 and could not make the final list, do not treat this as a failure. Treat it as data. Analyse where you lost marks  -  whether it was the objective papers (Stage 1), the conventional papers (Stage 2), or the interview (Stage 3). Each requires a completely different preparation strategy.</p>
<p>My offline batches and interview guidance programs are specifically designed to address these gaps. If you want personalised guidance, feel free to connect.</p>`,
  },

  {
    title:    'GATE 2026 Civil Engineering  -  Official Notification Released, Exam Pattern & Key Dates',
    category: 'exam-updates',
    excerpt:  'IIT Roorkee has released the official GATE 2026 notification. Here are all the important dates, eligibility criteria, exam pattern, and subject-wise marks distribution for Civil Engineering (CE).',
    content: `<h2>GATE 2026  -  Official Notification by IIT Roorkee</h2>
<p><strong>IIT Roorkee</strong> is the organizing institute for GATE 2026. The official notification has been released on the GATE website (gate2026.iitr.ac.in). GATE 2026 is scheduled for <strong>February 2026</strong>.</p>

<h2>Important Dates  -  GATE 2026</h2>
<table>
  <thead><tr><th>Event</th><th>Tentative Date</th></tr></thead>
  <tbody>
    <tr><td>Online Application Opens</td><td>August 2025</td></tr>
    <tr><td>Last Date to Apply (without late fee)</td><td>September 2025</td></tr>
    <tr><td>Last Date to Apply (with late fee)</td><td>October 2025</td></tr>
    <tr><td>Admit Card Download</td><td>January 2026</td></tr>
    <tr><td>GATE 2026 Exam</td><td>1st, 2nd &amp; 3rd week of February 2026</td></tr>
    <tr><td>Result Declaration</td><td>March 2026</td></tr>
    <tr><td>Score Card Available</td><td>March 2026 (valid for 3 years)</td></tr>
  </tbody>
</table>

<h2>Eligibility Criteria</h2>
<ul>
  <li><strong>Qualification:</strong> B.E. / B.Tech / B.Arch (or currently in final year or pre-final year)</li>
  <li><strong>Age limit:</strong> None  -  there is no upper age limit for GATE</li>
  <li><strong>Attempts:</strong> No restriction on number of attempts</li>
  <li>Diploma holders and M.Sc. graduates in relevant fields may also be eligible  -  check the official notification.</li>
</ul>

<h2>GATE CE Exam Pattern</h2>
<table>
  <thead><tr><th>Section</th><th>Marks</th><th>Questions</th></tr></thead>
  <tbody>
    <tr><td>General Aptitude (GA)</td><td>15</td><td>10</td></tr>
    <tr><td>Engineering Mathematics</td><td>13</td><td>~9</td></tr>
    <tr><td>Civil Engineering Core Subjects</td><td>72</td><td>~46</td></tr>
    <tr><td><strong>Total</strong></td><td><strong>100</strong></td><td><strong>65</strong></td></tr>
  </tbody>
</table>
<p>Duration: <strong>3 hours</strong>. Question types: MCQ (negative marking: −1/3 for 1-mark, −2/3 for 2-mark), MSQ (no negative marking), and NAT  -  Numerical Answer Type (no negative marking).</p>

<h2>Subject-Wise Weightage in GATE CE (Historical Average)</h2>
<table>
  <thead><tr><th>Subject</th><th>Approx. Marks</th></tr></thead>
  <tbody>
    <tr><td>Structural Engineering (SOM + SA + RCC + Steel)</td><td>18–22</td></tr>
    <tr><td>Geotechnical Engineering</td><td>12–15</td></tr>
    <tr><td>Fluid Mechanics &amp; Hydraulics</td><td>10–13</td></tr>
    <tr><td>Transportation Engineering</td><td>8–10</td></tr>
    <tr><td>Environmental Engineering</td><td>6–8</td></tr>
    <tr><td>Surveying &amp; Remote Sensing</td><td>4–6</td></tr>
    <tr><td>Construction Materials &amp; Management</td><td>4–6</td></tr>
    <tr><td>Engineering Mathematics</td><td>13</td></tr>
    <tr><td>General Aptitude</td><td>15</td></tr>
  </tbody>
</table>

<h2>My Recommendation for GATE 2026 Aspirants</h2>
<p>The window between now and February 2026 is adequate to build a strong foundation <em>if</em> you plan correctly. Do not try to study everything equally  -  allocate time proportional to marks weightage. Structural Engineering alone can get you 20+ marks if your concepts are solid.</p>
<p>Start with your weakest high-weightage subject first. Most students do the opposite  -  they revise what they already know well, which gives comfort but not marks.</p>`,
  },

  /* ══════════════════════════════════════════════════════
     CATEGORY 2: subject-tips  (2 posts)
  ══════════════════════════════════════════════════════ */
  {
    title:    'Strength of Materials (SOM) for GATE CE  -  The 5 Concepts That Appear Every Single Year',
    category: 'subject-tips',
    excerpt:  'After analysing 12 years of GATE CE papers, I have identified the 5 SOM concepts that appear in almost every paper. If you master only these, you can score 10+ marks from SOM alone.',
    content: `<h2>Why SOM Is Non-Negotiable in GATE CE</h2>
<p>Strength of Materials (also called Mechanics of Solids) is one of the highest-yielding subjects in GATE CE. It contributes directly to at least <strong>2–3 questions every year</strong>, and indirectly feeds into Structural Analysis and RCC Design. You cannot afford to skip it or treat it lightly.</p>
<p>After teaching this subject for over 15 years and analysing GATE papers from 2012 to 2024, I have identified 5 concepts that appear with near-certainty. Master these, and you have secured 8–12 marks.</p>

<h2>Concept 1: Bending Stress and Section Modulus</h2>
<p>The bending formula <strong>σ = My/I</strong> appears every year, often disguised as a numerical on beams with varying cross-sections. Students who make mistakes here are usually confusing <em>y</em> (distance from neutral axis) with the total depth of the section.</p>
<ul>
  <li>For a rectangular section: <strong>Z = bd²/6</strong></li>
  <li>For a circular section: <strong>Z = πd³/32</strong></li>
  <li>For a hollow section: always subtract the inner moment of inertia before dividing by <em>y</em></li>
</ul>
<blockquote>Common mistake: Students use total depth instead of half-depth for <em>y</em> in symmetric sections. Always locate the neutral axis first.</blockquote>

<h2>Concept 2: Shear Stress Distribution</h2>
<p>The formula <strong>τ = VQ/(Ib)</strong> is simple, but the application requires you to find the first moment of area (Q) correctly. In GATE, questions often test shear stress at the neutral axis versus at the junction of flanges and web.</p>
<ul>
  <li>Maximum shear stress in a rectangle: <strong>1.5 × (V/A)</strong></li>
  <li>Maximum shear stress in a circle: <strong>4/3 × (V/A)</strong></li>
  <li>For I-sections: shear stress is maximum at the neutral axis and minimum at flange tips</li>
</ul>

<h2>Concept 3: Deflection of Beams Using Double Integration &amp; Moment Area Method</h2>
<p>Beam deflection problems appear in GATE almost every year. The Moment Area Method is faster for most configurations:</p>
<ul>
  <li><strong>First Moment Area Theorem:</strong> Slope change between two points = Area of M/EI diagram between them</li>
  <li><strong>Second Moment Area Theorem:</strong> Deflection of B from tangent at A = First moment of M/EI area between A and B about B</li>
</ul>
<p>For standard cases, memorise these formulas (they appear directly in GATE numericals):</p>
<table>
  <thead><tr><th>Beam Type &amp; Load</th><th>Max Deflection</th></tr></thead>
  <tbody>
    <tr><td>Simply supported  -  UDL (w)</td><td>5wL⁴ / 384EI</td></tr>
    <tr><td>Simply supported  -  Central point load (P)</td><td>PL³ / 48EI</td></tr>
    <tr><td>Cantilever  -  Free end point load (P)</td><td>PL³ / 3EI</td></tr>
    <tr><td>Cantilever  -  UDL (w)</td><td>wL⁴ / 8EI</td></tr>
  </tbody>
</table>

<h2>Concept 4: Mohr's Circle  -  Principal Stresses &amp; Maximum Shear</h2>
<p>Mohr's Circle questions test both conceptual understanding and quick calculation. The most common GATE question: given σx, σy, and τxy, find principal stresses and maximum shear stress.</p>
<ul>
  <li>Principal stresses: <strong>σ₁,₂ = (σx+σy)/2 ± √[((σx−σy)/2)² + τxy²]</strong></li>
  <li>Maximum shear stress: <strong>τmax = √[((σx−σy)/2)² + τxy²]</strong></li>
  <li>Angle of principal plane: <strong>tan(2θ) = 2τxy / (σx − σy)</strong></li>
</ul>
<blockquote>GATE 2023 asked Mohr's Circle for a triaxial stress state  -  something many students had not practised. Always extend your preparation to 3D stress states.</blockquote>

<h2>Concept 5: Columns  -  Euler's Formula &amp; Effective Length</h2>
<p>Euler's buckling load <strong>P_cr = π²EI / (Le)²</strong> is standard. What GATE tests is whether you know the <em>effective length</em> for different end conditions:</p>
<table>
  <thead><tr><th>End Condition</th><th>Effective Length (Le)</th></tr></thead>
  <tbody>
    <tr><td>Both ends pinned</td><td>L</td></tr>
    <tr><td>Both ends fixed</td><td>L/2</td></tr>
    <tr><td>One end fixed, other pinned</td><td>L/√2 ≈ 0.7L</td></tr>
    <tr><td>One end fixed, other free (cantilever)</td><td>2L</td></tr>
  </tbody>
</table>
<p>Slenderness ratio λ = Le/r (r = radius of gyration = √(I/A)) is used to judge whether a column is long (Euler's valid) or short (material strength governs).</p>

<h2>How to Practice These 5 Topics</h2>
<ol>
  <li>Solve all previous year GATE CE questions on each concept (2012–2024)  -  minimum 2 times each</li>
  <li>Time yourself: each 1-mark GATE question should take under 90 seconds, each 2-mark under 3 minutes</li>
  <li>After solving, write down the formula used and the conceptual step where you had to think  -  that is your weak spot</li>
</ol>`,
  },

  {
    title:    'How to Master Soil Mechanics for GATE CE  -  A Subject-Wise Framework from a 15-Year Perspective',
    category: 'subject-tips',
    excerpt:  'Soil Mechanics contributes 12–15 marks in GATE CE. Most students lose these marks not because the concepts are hard, but because they skip the derivations. Here is how to approach this subject correctly.',
    content: `<h2>Why Students Struggle with Soil Mechanics</h2>
<p>In 15 years of teaching, I have observed a consistent pattern: students who struggle with Geotechnical Engineering do so not because they lack intelligence, but because they memorise results without understanding derivations. Soil Mechanics is a subject where the <em>why</em> matters as much as the <em>what</em>.</p>
<p>GATE asks clever questions  -  it changes one boundary condition or one parameter and expects you to reason from first principles. If you only know the final formula, you will be stuck.</p>

<h2>Part 1: Index Properties &amp; Classification</h2>
<p>This is the easiest section of Soil Mechanics and should be your guaranteed marks.</p>
<ul>
  <li><strong>Phase diagram</strong>  -  draw it for every problem. It converts abstract relationships into arithmetic. Do not skip this step even in exams.</li>
  <li>Key relationships to derive once, then remember:<br>
    e = n/(1−n) &nbsp;|&nbsp; S·e = w·Gs &nbsp;|&nbsp; γ_sat = (Gs + e)γw / (1 + e)</li>
  <li>Atterberg Limits: Liquid Limit (LL), Plastic Limit (PL), Plasticity Index (PI = LL − PL), Liquidity Index (LI = (w − PL)/PI)</li>
  <li>IS Classification: if PI &gt; 7 and plots above A-line in Plasticity Chart → Clay (C); below A-line → Silt (M)</li>
</ul>

<h2>Part 2: Permeability &amp; Seepage</h2>
<p>Darcy's Law: <strong>v = ki</strong>, where v is seepage velocity, k is coefficient of permeability, i is hydraulic gradient.</p>
<ul>
  <li>Discharge velocity vs seepage velocity: <strong>v_s = v/n</strong> (seepage velocity is higher than discharge velocity)</li>
  <li>For stratified soils:
    <ul>
      <li>Flow parallel to layers: <strong>k_H = (k₁H₁ + k₂H₂ + ...)/H_total</strong>  -  arithmetic mean, so k_H is larger</li>
      <li>Flow perpendicular to layers: <strong>k_V = H_total / (H₁/k₁ + H₂/k₂ + ...)</strong>  -  harmonic mean, so k_V is smaller</li>
    </ul>
  </li>
  <li>Flow nets: <strong>q = k·H·(Nf/Nd)</strong> where Nf = flow channels, Nd = potential drops. This is a favourite GATE question.</li>
</ul>
<blockquote>The most common mistake: students reverse k_H and k_V. Remember  -  water prefers the easier path. Parallel to layers gives higher permeability (harmonic mean would be restrictive), so k_H uses arithmetic mean.</blockquote>

<h2>Part 3: Consolidation  -  The Most Important Topic</h2>
<p>Terzaghi's 1D consolidation theory is the backbone of this section and appears in GATE almost every year.</p>
<ul>
  <li><strong>Coefficient of consolidation:</strong> Cv = k / (mv · γw)</li>
  <li><strong>Time factor:</strong> Tv = Cv · t / d²  (d = drainage path  -  H/2 for double drainage, H for single drainage)</li>
  <li>For degree of consolidation U &lt; 60%: <strong>Tv = π/4 · (U%)²</strong></li>
  <li>For U &gt; 60%: <strong>Tv = 1.781 − 0.933 log(100 − U%)</strong></li>
</ul>
<p>Settlement calculation: <strong>S_c = (Cc / (1 + e₀)) · H · log(σ'₀ + Δσ / σ'₀)</strong></p>
<p>If soil is normally consolidated: use Cc. If over-consolidated and stress does not exceed preconsolidation pressure: use Cs (typically Cs = Cc/5 to Cc/8).</p>

<h2>Part 4: Shear Strength</h2>
<p>Mohr-Coulomb failure criterion: <strong>τ_f = c' + σ' tan(φ')</strong></p>
<ul>
  <li>Three types of triaxial tests and when to use which:
    <ul>
      <li><strong>UU (Unconsolidated Undrained):</strong> φ = 0 concept for saturated clays  -  used for immediate stability problems like embankment failure right after construction</li>
      <li><strong>CU (Consolidated Undrained):</strong> gives both c' and φ' with pore pressure parameters  -  most commonly tested in GATE</li>
      <li><strong>CD (Consolidated Drained):</strong> true effective parameters  -  used for long-term stability</li>
    </ul>
  </li>
  <li>Vane shear test: <strong>S_u = T / [π · D² · H/2 + πD³/6]</strong> for a standard vane where H = 2D</li>
</ul>

<h2>Part 5: Earth Pressure Theories</h2>
<p>Rankine's theory assumptions: wall is smooth, backfill is horizontal, failure is planar. Coulomb's theory accounts for wall friction.</p>
<ul>
  <li>Active earth pressure coefficient: <strong>Ka = (1 − sinφ) / (1 + sinφ) = tan²(45 − φ/2)</strong></li>
  <li>Passive earth pressure coefficient: <strong>Kp = (1 + sinφ) / (1 − sinφ) = tan²(45 + φ/2)</strong></li>
  <li>Note: Kp = 1/Ka</li>
  <li>Resultant active force for cohesionless backfill: <strong>Pa = ½ Ka γ H²</strong>  -  acts at H/3 from base</li>
</ul>

<h2>Part 6: Bearing Capacity</h2>
<p>Terzaghi's general bearing capacity equation for a strip footing:</p>
<p><strong>q_u = c·Nc + q·Nq + 0.5·γ·B·Nγ</strong></p>
<p>where Nc, Nq, Nγ are bearing capacity factors that depend only on φ.</p>
<ul>
  <li>For pure clay (φ = 0, undrained): <strong>q_u = 5.14·Su + γ·Df</strong> (Nc = 5.14 for strip)</li>
  <li>Shape factors, depth factors, and inclination factors apply for real footings  -  Meyerhof's and Hansen's equations are more general</li>
  <li>Net ultimate bearing capacity: <strong>q_net = q_u − γ·Df</strong></li>
  <li>Safe bearing capacity: <strong>q_s = q_net / FOS + γ·Df</strong> (typical FOS = 2.5 to 3)</li>
</ul>

<h2>The Fastest Way to Prepare Soil Mechanics for GATE</h2>
<ol>
  <li>Read each topic once from a standard textbook (Arora or IS: 2720 series for reference)</li>
  <li>Solve GATE PYQs for that topic immediately  -  do not wait to finish the full subject</li>
  <li>Make a one-page formula sheet for each sub-topic in your own handwriting</li>
  <li>Final week: revise only formula sheets + PYQs. Do not re-read textbook in the final week.</li>
</ol>`,
  },

  /* ══════════════════════════════════════════════════════
     CATEGORY 3: strategy  (2 posts)
  ══════════════════════════════════════════════════════ */
  {
    title:    'The 6-Month GATE CE Study Plan That Actually Works  -  Week-by-Week Breakdown',
    category: 'strategy',
    excerpt:  'Most GATE study plans fail because they are theoretical. This is a practical, week-by-week 6-month plan designed for working professionals and college students preparing for GATE CE 2026.',
    content: `<h2>Why Most Study Plans Fail</h2>
<p>I have seen hundreds of students create elaborate study timetables in August and abandon them by October. The reason is not lack of discipline  -  it is that most plans are built around an ideal version of your day, not your actual day. This plan is different. It accounts for fatigue, revision, and mock tests from the very beginning.</p>

<h2>Pre-Condition: Know Your Starting Point</h2>
<p>Before you start, spend one day taking a diagnostic test (any previous year GATE CE paper, full 3 hours). Do not study for it. Just take it and note:</p>
<ul>
  <li>Which subjects you scored in</li>
  <li>Which subjects you left blank</li>
  <li>Your accuracy on questions you attempted</li>
</ul>
<p>This data shapes everything. A student who is weak in Geotechnical needs a different plan than one who is weak in Structural.</p>

<h2>Phase 1  -  Foundation (Months 1–2)</h2>
<p><strong>Goal:</strong> Cover all subjects once, conceptually. No shortcuts.</p>
<table>
  <thead><tr><th>Week</th><th>Subjects to Cover</th><th>Daily Target</th></tr></thead>
  <tbody>
    <tr><td>Week 1–2</td><td>Engineering Mathematics (full syllabus)</td><td>3–4 hours</td></tr>
    <tr><td>Week 3–4</td><td>Structural Analysis + SOM (Basics)</td><td>3–4 hours</td></tr>
    <tr><td>Week 5–6</td><td>Geotechnical Engineering (full)</td><td>3–4 hours</td></tr>
    <tr><td>Week 7–8</td><td>Fluid Mechanics + Hydraulics</td><td>3–4 hours</td></tr>
  </tbody>
</table>
<p><strong>Rule for Phase 1:</strong> After every topic, solve 10–15 GATE PYQs on that topic. Do not move on without doing this.</p>

<h2>Phase 2  -  Depth (Months 3–4)</h2>
<p><strong>Goal:</strong> Cover remaining subjects + go deeper in high-weightage areas.</p>
<table>
  <thead><tr><th>Week</th><th>Focus</th></tr></thead>
  <tbody>
    <tr><td>Week 9–10</td><td>RCC Design + Steel Design (IS 456, IS 800  -  key clauses)</td></tr>
    <tr><td>Week 11</td><td>Transportation Engineering (Highway + Traffic)</td></tr>
    <tr><td>Week 12</td><td>Environmental Engineering (Water + Waste Water)</td></tr>
    <tr><td>Week 13</td><td>Surveying + Construction Materials</td></tr>
    <tr><td>Week 14–16</td><td>Revisit Phase 1 subjects  -  go deeper into SOM, Structural Analysis, Geotechnical</td></tr>
  </tbody>
</table>
<p><strong>Rule for Phase 2:</strong> Start taking subject-wise mock tests (not full paper  -  just 30-minute focused tests on individual subjects).</p>

<h2>Phase 3  -  Mock Tests &amp; Refinement (Months 5–6)</h2>
<p><strong>Goal:</strong> Build exam temperament, eliminate silly mistakes, maximise score.</p>
<ul>
  <li>Take at least <strong>1 full mock test per week</strong> (3 hours, timed, exam conditions)</li>
  <li>After every mock test: 2 hours of error analysis. For every wrong answer, write down <em>why</em> you got it wrong  -  concept gap, calculation error, or misread question</li>
  <li>In the final 3 weeks: do not study new topics. Only revise formula sheets + PYQs + weak areas from mock tests</li>
  <li>General Aptitude: give it 20 minutes every 2 days. It is 15 marks and often ignored.</li>
</ul>

<h2>The Non-Negotiable Rules</h2>
<ol>
  <li><strong>Sleep 7 hours.</strong> A tired brain retains nothing and makes careless errors in exams.</li>
  <li><strong>Solve in pen.</strong> GATE has NAT questions (numerical answer type). Students who only practise MCQs are underprepared for NATs.</li>
  <li><strong>Do not compare with others.</strong> Someone else's preparation speed is irrelevant to your preparation quality.</li>
  <li><strong>Revise General Aptitude.</strong> Every single batch I have taught, students who ignored GA lost 5–10 marks. That is often the difference between getting a PSU and not.</li>
</ol>

<blockquote>The goal of the final two months is not learning new things  -  it is converting your existing knowledge into exam performance. These are different skills.</blockquote>`,
  },

  {
    title:    'How to Crack ESE (IES) Interview  -  What the UPSC Board Actually Tests and How to Prepare',
    category: 'strategy',
    excerpt:  'The ESE Personality Test carries 200 marks. Most candidates prepare for it the wrong way  -  memorising answers. Here is what the UPSC board actually looks for and how to prepare authentically.',
    content: `<h2>The ESE Personality Test  -  Misunderstood by Most Candidates</h2>
<p>The ESE interview (officially called "Personality Test") is not a technical viva. UPSC is not testing whether you remember the exact formula for critical flow in open channels. They are testing something far more important: <strong>whether you will be a good IES officer.</strong></p>
<p>In 15 years of guiding students through this process, I have seen technically brilliant candidates fail the interview and average scorers clear it. The difference is almost always in how they communicate, how they think under pressure, and how honestly they present themselves.</p>

<h2>What the UPSC Board Actually Evaluates</h2>
<table>
  <thead><tr><th>Attribute</th><th>How It Is Tested</th></tr></thead>
  <tbody>
    <tr><td>Mental alertness</td><td>Rapid follow-up questions on whatever you say</td></tr>
    <tr><td>Critical powers of assimilation</td><td>Giving you a situation and asking for your analysis</td></tr>
    <tr><td>Clear and logical exposition</td><td>How you explain technical or general concepts</td></tr>
    <tr><td>Balance of judgement</td><td>Questions with no clear right answer  -  policy, infrastructure, environment trade-offs</td></tr>
    <tr><td>Variety and depth of interest</td><td>Questions from your DAF, home state, current affairs, hobbies</td></tr>
    <tr><td>Social cohesion and leadership</td><td>Situational questions on team management, ethics</td></tr>
  </tbody>
</table>

<h2>The DAF Is Your Bible  -  Read It 50 Times</h2>
<p>Everything in the interview is anchored to your <strong>Detailed Application Form (DAF)</strong>. The board will ask questions about:</p>
<ul>
  <li>Your B.Tech college, projects, internships, and academic gaps (if any)</li>
  <li>Your home state  -  infrastructure projects, geography, rivers, major dams, current development issues</li>
  <li>Your optional hobbies  -  if you wrote "cricket" as a hobby and cannot speak for 2 minutes about its rules and India's recent performance, you are in trouble</li>
  <li>Your previous work experience (if any)</li>
  <li>Any awards, certifications, or extracurricular activities you mentioned</li>
</ul>
<blockquote>Rule: Never write anything in your DAF that you cannot talk about for at least 3 minutes.</blockquote>

<h2>Technical Preparation for the Interview</h2>
<p>Yes, technical questions do come  -  but they are usually conceptual, not numerical. The board wants to see if you understand <em>why</em> things work, not just <em>what</em> the formula is.</p>
<p>Focus your technical revision on:</p>
<ul>
  <li><strong>Design philosophy:</strong> Why do we design for ultimate limit state? What is the philosophy behind limit state design vs working stress design?</li>
  <li><strong>Current codes:</strong> IS 456:2000 (RCC), IS 800:2007 (Steel), IS 1893 (Seismic), IS 875 (Loading)</li>
  <li><strong>Real-world applications:</strong> How is Terzaghi's consolidation theory used in actual pile foundation design?</li>
  <li><strong>National projects:</strong> Be able to speak about infrastructure projects like Atal Tunnel, Bogibeel Bridge, Chenab Rail Bridge  -  their engineering challenges and solutions</li>
</ul>

<h2>Preparing for Current Affairs in the ESE Interview</h2>
<p>The board regularly asks about infrastructure, urban development, climate change, and policy. Read the following regularly in the months before the interview:</p>
<ul>
  <li>PIB (Press Information Bureau)  -  infrastructure announcements</li>
  <li>Ministry of Road Transport &amp; Highways press releases</li>
  <li>Smart Cities Mission updates</li>
  <li>NITI Aayog reports on urban infrastructure</li>
  <li>Key budget announcements related to infrastructure spending</li>
</ul>

<h2>Mock Interviews  -  Non-Negotiable</h2>
<p>I cannot overstate this: <strong>you must do mock interviews.</strong> Talking in front of a panel is a skill that develops only through practice. Reading about it does nothing.</p>
<p>How to do mock interviews effectively:</p>
<ol>
  <li>Find a retired IES officer, an experienced professor, or an interview guidance program to conduct sessions</li>
  <li>Video record yourself and watch it back  -  your body language will tell you more than any feedback</li>
  <li>Do at least 5–6 mock interviews before the actual date</li>
</ol>

<h2>The Day of the Interview</h2>
<ul>
  <li>Dress formally but comfortably  -  formal shirt, tie optional but preferred, polished shoes</li>
  <li>Reach the UPSC building at least 45 minutes early</li>
  <li>Read your DAF one last time in the waiting area  -  very calmly</li>
  <li>When you do not know the answer: say "Sir/Ma'am, I do not know this exactly, but my understanding is..." and give your best reasoning. Never bluff.</li>
  <li>When board members disagree with you: do not immediately capitulate. Politely say "I understand your point, Sir/Ma'am. My reasoning was... but I am open to being corrected." Showing intellectual courage matters.</li>
</ul>`,
  },

  /* ══════════════════════════════════════════════════════
     CATEGORY 4: student-stories  (2 posts)
  ══════════════════════════════════════════════════════ */
  {
    title:    '"I Failed GATE Twice  -  The Third Attempt Changed Everything"  -  Rahul\'s Story',
    category: 'student-stories',
    excerpt:  'Rahul Verma from Lucknow failed GATE CE in 2021 and 2022. In 2023, he cleared with AIR 89. What changed was not his intelligence  -  it was one decision he made about how he studied.',
    content: `<h2>The First Two Attempts</h2>
<p><em>Note: This story is shared with the student's permission. Name used as given.</em></p>
<p>Rahul Verma completed his B.Tech in Civil Engineering from a state university in Uttar Pradesh in 2020. Like thousands of graduates, he set his sights on GATE  -  both for PSU recruitment and as a stepping stone toward IES.</p>
<p>His first attempt in 2021 resulted in a score of 31.4 marks. His second attempt in 2022: 34.6 marks. Both well below the qualifying cutoff for his category and well short of PSU recruitment scores.</p>
<p>When Rahul first connected with me, he said something that I have heard in various forms from hundreds of students: <em>"Sir, I am studying 10 hours a day. I don't know why it's not working."</em></p>

<h2>The Diagnosis</h2>
<p>I asked him to walk me through a typical study day. He described waking at 6 AM, reading notes until noon, watching lecture videos in the afternoon, solving some questions in the evening, and reviewing formulae at night. Ten to eleven hours, easily.</p>
<p>The problem was immediately clear to me: <strong>Rahul was studying but not testing himself.</strong></p>
<p>In two years of preparation, he had never once sat down with a previous year GATE paper, set a 3-hour timer, and attempted it under exam conditions. He had solved hundreds of individual questions, but never practised the <em>exam</em> itself.</p>
<blockquote>Preparing for GATE by only solving individual questions is like preparing for a marathon by doing weight training. Related, but not the same skill.</blockquote>

<h2>What Changed in the Third Attempt</h2>
<p>We restructured his preparation completely. The key changes:</p>
<ol>
  <li><strong>Every Sunday, one full GATE mock test  -  3 hours, pen down, no distractions.</strong> This was non-negotiable from day one.</li>
  <li><strong>After every mock: 2 hours of error analysis.</strong> Not just checking answers  -  but understanding exactly why each wrong answer went wrong. Concept gap? Misread question? Calculation error? Each has a different fix.</li>
  <li><strong>Reduced total study hours from 10 to 6.</strong> Focused, high-quality 6 hours beat exhausted, distracted 10 hours every time.</li>
  <li><strong>Dropped the weakest low-weightage subject entirely.</strong> Rahul was spending disproportionate time on Surveying (3–4 marks). We reallocated that time to Structural Analysis and Geotechnical (25+ marks combined).</li>
</ol>

<h2>The Result</h2>
<p>GATE CE 2023: <strong>AIR 89, Score 756.</strong></p>
<p>Rahul subsequently received interview calls from BHEL, NTPC, and GAIL. He joined NTPC as a GET (Graduate Engineer Trainee) in the Civil discipline.</p>

<h2>What This Story Teaches</h2>
<p>Rahul was never unintelligent. He was never lazy. He was working extremely hard  -  just in the wrong direction. The most common mistake I see among GATE aspirants is confusing <em>input</em> (hours studied) with <em>output</em> (exam performance). They are not the same thing.</p>
<p>If you have been preparing for more than 6 months and your mock test scores are not improving, the problem is almost certainly your practice methodology  -  not your intelligence or effort.</p>`,
  },

  {
    title:    'From Rejection to ESE AIR 12  -  How Priya Rebuilt Her Preparation After Failing Mains',
    category: 'student-stories',
    excerpt:  'Priya Sharma cleared the ESE Prelims in her first attempt but could not qualify Mains. Here is how she identified exactly where the marks were slipping  -  and what she did differently the second time.',
    content: `<h2>Clearing Prelims Is Not Enough</h2>
<p><em>Story shared with student's consent. Name used as given.</em></p>
<p>Priya Sharma from Delhi had always been academically strong. A gold medallist in her B.Tech (Civil Engineering), she took the ESE exam for the first time in 2021 with high confidence. She cleared the Preliminary stage comfortably  -  Paper-I (General Studies &amp; Engineering Aptitude) and Paper-II (Civil Engineering objective). Both in good margins.</p>
<p>Then came Stage 2  -  the Mains. Two conventional papers (Paper-I and Paper-II), each 300 marks, descriptive format. She did not qualify.</p>
<p>The score gap: she needed approximately 300/600 in Mains to advance to the interview stage. She scored 241.</p>

<h2>Identifying the Problem</h2>
<p>When Priya came to me after the Mains result, the first thing I did was ask her to solve a conventional question in front of me. She solved it correctly  -  but it took 14 minutes for a question that should take 8–9 minutes at most.</p>
<p>Her second problem: she was answering questions completely  -  showing full derivations even when not asked. In ESE Mains, <strong>answer what is asked, not everything you know</strong>. A question asking for final design output does not need the complete derivation of Terzaghi's bearing capacity  -  it needs the answer and a clear process.</p>
<p>Third problem: her Environmental Engineering answers were weak. Not wrong, but shallow. She had studied it as a lower-priority subject and it showed.</p>

<h2>The Restructured Preparation</h2>
<p>For the second attempt (ESE 2022), we made three targeted changes:</p>
<ol>
  <li><strong>Timed practice for conventional questions.</strong> Every day: 5 conventional questions, strictly timed. She had to solve each within the allocated exam time (roughly 7–8 minutes per 2-mark equivalent question in the conventional format).</li>
  <li><strong>Answer writing discipline.</strong> She practised writing answers with clear headings, structured steps, final boxed answer, and nothing extraneous. Quality over quantity.</li>
  <li><strong>Environmental Engineering deep-dive.</strong> One full month specifically on Water Supply, Sewage Treatment, and Air/Noise pollution. She went from being able to write 3-page answers in this subject to 8-page answers with numericals, diagrams, and IS code references.</li>
</ol>

<h2>The Outcome</h2>
<p>ESE 2022: <strong>Mains score  -  381/600. Final merit (after interview): AIR 12.</strong></p>
<p>Priya was allotted the <strong>Indian Railway Service of Engineers (IRSE)</strong>  -  one of the most sought-after services in ESE Civil.</p>

<h2>The Broader Lesson</h2>
<p>The ESE Mains is where most serious candidates lose the exam. It is not because the questions are unsolvable  -  they are not. It is because most candidates are not trained for the <em>format</em>. Conventional, descriptive, timed examination is a completely different test than the objective format of Prelims or GATE.</p>
<p>If you cleared Prelims and are now preparing for Mains, here is my direct advice: <strong>stop reading and start writing.</strong> Your pen should be moving for at least 2 hours every day from the time you start Mains preparation.</p>`,
  },

  /* ══════════════════════════════════════════════════════
     CATEGORY 5: personal-notes  (2 posts)
  ══════════════════════════════════════════════════════ */
  {
    title:    'Why I Left a Government Job to Teach  -  A Personal Note from Dr. Jaspal Singh',
    category: 'personal-notes',
    excerpt:  'I was an IES officer with a secure career. The decision to leave and teach full-time was not easy. This is the honest account of why I made that choice  -  and what I have learned since.',
    content: `<h2>A Career That Looked Perfect from the Outside</h2>
<p>I qualified the Engineering Services Examination in my first serious attempt and was allotted the civil engineering services. By most conventional measures, I had made it. The job was secure, the work was meaningful, and the salary and position came with the social recognition that every aspirant dreams about.</p>
<p>But somewhere in the third year of service, I found myself restless  -  not dissatisfied with the work, but feeling that something was missing. That thing, I eventually realised, was the classroom.</p>

<h2>The Moment I Knew</h2>
<p>In 2008, a younger cousin preparing for GATE came to visit. He was struggling with Structural Analysis  -  specifically, the stiffness method. I spent one evening explaining it to him. He understood it completely by the end of that session, and I remember the look on his face when the concept clicked. That moment of understanding  -  I had not experienced anything quite like it in my official duties.</p>
<p>I started taking informal weekend sessions for a small group of GATE aspirants. Within a year, that group had grown to thirty students. Within two years, the results started coming in  -  AIRs in single and double digits, PSU selections, a few ESE qualifications. I was spending more emotional energy on those students than on my official work. That told me something.</p>

<h2>The Actual Decision</h2>
<p>Leaving a permanent government position is not a trivial decision in India. My parents were, to put it mildly, not enthusiastic. My colleagues thought I was making a mistake. My response to all of them was the same: <em>I am not leaving because the job is bad. I am leaving because teaching is better  -  for me.</em></p>
<p>I pursued my PhD from IIT Delhi while teaching part-time, completed it, and then committed to teaching full-time. That was the inflection point.</p>

<h2>What 15 Years of Teaching Has Taught Me</h2>
<p>Looking back, I would make the same choice again  -  not because it has been comfortable, but because it has been meaningful.</p>
<ul>
  <li>The student who cleared ESE after three attempts and sends a one-line message saying "Sir, result aa gaya"  -  that message is worth more to me than any formal recognition.</li>
  <li>Teaching has made me a better engineer. Explaining a concept forces you to understand it at a level that private practice never requires.</li>
  <li>The students who struggle the most and eventually succeed teach me more than the ones who find it easy. Struggle, properly supported, produces resilience that no shortcut can replicate.</li>
</ul>

<h2>Why This Website Exists</h2>
<p>I get this question often: why put so much content online for free when you could monetise it?</p>
<p>The answer is simple. The aspirant preparing in a small town with no access to quality coaching deserves the same conceptual clarity as the one in Delhi who can afford premium programs. The internet makes that possible. I would be wasteful not to use it.</p>
<p>Everything on this website  -  the strategy articles, the subject breakdowns, the resources  -  is free and will remain free. My offline programs are for those who want structured, personalised guidance. But the knowledge itself is not behind a paywall.</p>
<blockquote>Har aspirant deserves a teacher who truly cares. That is not a tagline. That is the reason I show up every day.</blockquote>`,
  },

  {
    title:    'What 15 Years of Teaching GATE CE Has Taught Me About How Engineers Learn',
    category: 'personal-notes',
    excerpt:  'After teaching thousands of GATE and ESE aspirants, I have noticed patterns in how the best students learn  -  and how the struggling ones get stuck. These observations have changed how I teach.',
    content: `<h2>The Student I Remember Most</h2>
<p>Of the thousands of students I have taught, one stands out in my memory not because he was the most brilliant, but because he was the most systematic. Let me call him Arun.</p>
<p>Arun was not the fastest in the batch. There were students who picked up concepts twice as quickly. But Arun had a habit that I have rarely seen replicated: after every class, he would rewrite the key concept in his own words, draw a diagram connecting it to what he already knew, and write down one question that the concept could not yet answer for him. Every day, without fail.</p>
<p>He cleared ESE in his first attempt with AIR 28. The faster students mostly took 2–3 attempts.</p>

<h2>Pattern 1: The Best Students Protect Their Confusion</h2>
<p>Counterintuitive but consistent: high-performing students are more willing to sit with confusion longer before resolving it. They do not immediately search for the answer  -  they first try to understand exactly <em>what</em> they do not understand.</p>
<p>Average students, by contrast, experience confusion as discomfort and immediately reach for the solution. This short-circuits the learning. The struggle itself is where understanding is built.</p>
<p>I now tell every batch: if a concept confuses you, write down your confusion as a precise question before you ask me or look it up. The act of articulating the confusion often resolves it  -  or at least makes the explanation far more useful.</p>

<h2>Pattern 2: Toppers Solve Problems Differently</h2>
<p>I have asked students to solve GATE problems in front of me for 15 years. The difference between a 700+ scorer and a 500-range scorer is not primarily knowledge  -  it is <em>process</em>.</p>
<p>The 700+ scorer:</p>
<ul>
  <li>Reads the question twice before picking up the pen</li>
  <li>Identifies what type of problem it is before choosing a formula</li>
  <li>Writes units at every step</li>
  <li>Estimates the order of magnitude of the answer before calculating, and checks against it at the end</li>
</ul>
<p>The 500-range scorer:</p>
<ul>
  <li>Begins calculating immediately after the first read</li>
  <li>Picks the formula that looks most familiar, not necessarily the right one</li>
  <li>Works through calculation without checking reasonableness</li>
  <li>Is surprised when the answer does not match any option</li>
</ul>
<p>This process difference, applied across 65 questions, produces a 150–200 mark gap.</p>

<h2>Pattern 3: The Quantity vs Quality Trap</h2>
<p>Every year, I see students who solve 5,000 practice problems and score 450. I also see students who solve 1,500 problems very carefully and score 700+.</p>
<p>More problems is not the variable. <em>What you do after a wrong answer</em> is the variable.</p>
<p>A student who solves 20 problems and spends 20 minutes analysing each wrong answer will outperform a student who solves 100 problems and marks the correct answer without understanding why they were wrong. Always.</p>

<h2>Pattern 4: The Final Month Is Almost Never Used Correctly</h2>
<p>In the final 4 weeks before GATE, here is what most students do: they discover topics they have not covered and try to rush through them. This is almost always counterproductive.</p>
<p>In the final month, the correct strategy is:</p>
<ol>
  <li>Full mock test every week  -  review seriously</li>
  <li>Formula sheet revision  -  not reading, revising. There is a difference.</li>
  <li>Focus entirely on the topics you already know well  -  deepen mastery in high-weightage areas</li>
  <li>General Aptitude: 30 minutes every 2 days</li>
  <li>Sleep, exercise, and reduce total daily hours to 5–6 quality hours</li>
</ol>

<h2>What I Have Learned from My Students</h2>
<p>Teaching is supposed to be a one-way transfer of knowledge. After 15 years, I know that is wrong. Every batch teaches me something:</p>
<ul>
  <li>The student who found a faster method for solving indeterminate structure problems that I had not considered</li>
  <li>The student who asked a question about Terzaghi's consolidation theory that took me two days to answer satisfactorily  -  and made me reread the original 1943 paper</li>
  <li>The student who failed four times and succeeded on the fifth, teaching everyone around him what persistence actually looks like</li>
</ul>
<p>I am a better teacher today than I was in 2009. And I expect to be better in 2030 than I am today. That is what keeps this work interesting.</p>`,
  },

];

/* ── main ── */
async function main() {
  console.log('Logging in to jaspalsingh.in admin...');
  const loginRes = await req('POST', '/api/auth/login', {
    email:    ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  if (loginRes.status !== 200 || !loginRes.body.token) {
    console.error('Login failed:', loginRes.body);
    process.exit(1);
  }

  const token = loginRes.body.token;
  console.log('Login successful.\n');

  let success = 0;
  let failed  = 0;

  for (const post of posts) {
    process.stdout.write(`Publishing: "${post.title.substring(0, 60)}..." `);
    const res = await req('POST', '/api/blog', {
      title:        post.title,
      category:     post.category,
      excerpt:      post.excerpt,
      content:      post.content,
      pdf_url:      post.pdf_url || '',
      is_published: 'true',
    }, token);

    if (res.status === 201) {
      console.log('✓ Published');
      success++;
    } else {
      console.log('✗ Failed  - ', res.body.error || res.status);
      failed++;
    }

    /* small delay to avoid rate limiting */
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\nDone. ${success} published, ${failed} failed.`);
}

main().catch(console.error);
