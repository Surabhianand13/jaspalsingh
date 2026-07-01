/**
 * seed-rssb-je-blogs.js  -  Publish 3 premium RSSB JE 2026 blog posts to jaspalsingh.in
 *
 * Source content: RSSB_JE_Syllabus_Official_JaspalSingh.docx,
 *                  RSSB_JE_2026_Blog_JaspalSingh.docx,
 *                  RSSB_JE_Complete_Strategy_JaspalSingh.docx
 *
 * Usage:
 *   1. Set your admin password below (ADMIN_PASSWORD)
 *   2. Run: node seed-rssb-je-blogs.js
 *
 * This publishes directly through the same /api/blog admin endpoint used by
 * the admin dashboard, so the posts appear there immediately after login.
 */

const https = require('https');
const http  = require('http');

/* ── CONFIG ── change password before running ── */
const ADMIN_EMAIL    = 'biz@solvvai.com';          // admin login email
const ADMIN_PASSWORD = 'YOUR_PASSWORD_HERE';        // ← replace this
const API_BASE       = 'https://jaspalsingh.in';    // production

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
     POST 1: exam-updates
  ══════════════════════════════════════════════════════ */
  {
    title:    'RSSB JE 2026 Notification Out: Vacancy, Eligibility & Important Dates for Civil Engineering Aspirants',
    category: 'exam-updates',
    excerpt:  'The RSSB has officially released the Junior Engineer (JE) 2026 Notification. Here is everything Civil Engineering aspirants need to know - vacancies, eligibility, important dates, and how to start preparing right away.',
    content: `<h2>RSSB JE 2026 - A Golden Opportunity for Civil Engineers in Rajasthan</h2>
<p>The Rajasthan Subordinate and Ministerial Services Board (RSSB) has officially released the <strong>Junior Engineer (JE) 2026 Notification</strong>. This is a significant opportunity for Civil Engineering aspirants across Rajasthan to secure a prestigious government engineering post. In this blog, we cover everything you need to know - vacancies, eligibility criteria, important dates, and how to start your preparation right away.</p>

<h2>RSSB JE 2026 - Quick Snapshot</h2>
<ul>
  <li><strong>Conducting Body:</strong> Rajasthan Subordinate &amp; Ministerial Services Board (RSSB)</li>
  <li><strong>Post Name:</strong> Junior Engineer (JE) - Civil Engineering</li>
  <li><strong>Notification Release:</strong> 2026</li>
  <li><strong>Mode of Exam:</strong> Offline (OMR-based)</li>
  <li><strong>Official Website:</strong> rssb.rajasthan.gov.in</li>
</ul>

<h2>1. RSSB JE 2026 - Total Vacancy Details</h2>
<p>The RSSB JE 2026 notification brings a significant number of vacancies across various departments of the Rajasthan Government. Here is the expected vacancy breakdown for Civil Engineering:</p>
<table>
  <thead><tr><th>Department</th><th>Category</th><th>Vacancies (Expected)</th></tr></thead>
  <tbody>
    <tr><td>Public Works Department (PWD)</td><td>Civil</td><td>To be announced</td></tr>
    <tr><td>Water Resources Department</td><td>Civil</td><td>To be announced</td></tr>
    <tr><td>Panchayati Raj Department</td><td>Civil</td><td>To be announced</td></tr>
    <tr><td>Urban Development</td><td>Civil</td><td>To be announced</td></tr>
  </tbody>
</table>
<blockquote>Candidates are advised to check the official RSSB website for the final confirmed vacancy count per category.</blockquote>

<h2>2. RSSB JE 2026 - Important Dates</h2>
<table>
  <thead><tr><th>Event</th><th>Expected Date</th></tr></thead>
  <tbody>
    <tr><td>Notification Release</td><td>2026 (Released)</td></tr>
    <tr><td>Online Application Start Date</td><td>As per official notification</td></tr>
    <tr><td>Last Date to Apply Online</td><td>As per official notification</td></tr>
    <tr><td>Application Fee Payment Last Date</td><td>As per official notification</td></tr>
    <tr><td>Admit Card Release</td><td>Before Exam Date</td></tr>
    <tr><td>Written Examination Date</td><td>To be announced</td></tr>
    <tr><td>Result Declaration</td><td>After Examination</td></tr>
  </tbody>
</table>
<blockquote>Always verify dates on the official RSSB portal. Do not rely solely on third-party sources.</blockquote>

<h2>3. RSSB JE 2026 - Eligibility Criteria</h2>
<h3>3a. Educational Qualification</h3>
<ul>
  <li>Diploma in Civil Engineering from a recognized institution, OR</li>
  <li>B.Tech / B.E. in Civil Engineering from a recognized University</li>
  <li>Candidates in their final year of qualifying degree may also check eligibility as per notification</li>
</ul>

<h3>3b. Age Limit</h3>
<table>
  <thead><tr><th>Category</th><th>Minimum Age</th><th>Maximum Age</th></tr></thead>
  <tbody>
    <tr><td>General (Male)</td><td>18 Years</td><td>40 Years</td></tr>
    <tr><td>General (Female)</td><td>18 Years</td><td>45 Years</td></tr>
    <tr><td>OBC / BC (Rajasthan)</td><td>18 Years</td><td>45 Years</td></tr>
    <tr><td>SC / ST (Rajasthan)</td><td>18 Years</td><td>45 Years</td></tr>
    <tr><td>PWD Candidates</td><td>18 Years</td><td>As per Rajasthan rules</td></tr>
  </tbody>
</table>
<p>Age relaxation is applicable as per Rajasthan Government rules. Refer to the official notification for exact details.</p>

<h3>3c. Nationality &amp; Domicile</h3>
<ul>
  <li>Candidate must be a citizen of India</li>
  <li>Domicile of Rajasthan is required for state quota seats</li>
</ul>

<h2>4. RSSB JE 2026 - Application Fee</h2>
<table>
  <thead><tr><th>Category</th><th>Application Fee</th></tr></thead>
  <tbody>
    <tr><td>General / OBC (Creamy Layer)</td><td>As per official notification</td></tr>
    <tr><td>OBC / BC Non-Creamy Layer (Rajasthan)</td><td>Concession as per Rajasthan rules</td></tr>
    <tr><td>SC / ST (Rajasthan)</td><td>Concession as per Rajasthan rules</td></tr>
    <tr><td>PWD / Divyaang</td><td>As per Rajasthan rules</td></tr>
  </tbody>
</table>
<p>Payment Mode: Online only (Net Banking / Debit Card / Credit Card / UPI)</p>

<h2>5. How to Apply for RSSB JE 2026 - Step-by-Step</h2>
<ol>
  <li>Visit the official RSSB website: rsmssb.rajasthan.gov.in</li>
  <li>Click on 'Apply Online' for RSSB JE 2026 Civil Engineering</li>
  <li>Register using your mobile number and email ID</li>
  <li>Fill in personal, academic, and professional details carefully</li>
  <li>Upload scanned photograph and signature in the required format</li>
  <li>Pay the application fee online</li>
  <li>Submit the form and download the confirmation receipt</li>
</ol>

<h2>6. RSSB JE 2026 - Selection Process</h2>
<p>The selection process for RSSB JE Civil Engineering consists of the following stages:</p>
<h3>Stage 1 - Written Examination</h3>
<ul>
  <li>Paper 1: General Knowledge, Rajasthan GK, Reasoning &amp; Current Affairs</li>
  <li>Paper 2: Civil Engineering Technical Knowledge (Core Subject)</li>
  <li>Mode: Offline OMR-based</li>
  <li>Negative Marking: As per official notification</li>
</ul>
<h3>Stage 2 - Document Verification</h3>
<ul>
  <li>Shortlisted candidates are called for document verification</li>
  <li>Original certificates of educational qualification must be presented</li>
  <li>Domicile certificate, caste certificate (if applicable) required</li>
  <li>No interview round - merit is based on written exam score</li>
</ul>

<h2>7. Quick Preparation Tips for RSSB JE Civil 2026</h2>
<ul>
  <li>Start with RSSB JE previous year question papers to understand the pattern</li>
  <li>Focus on core Civil Engineering subjects: Structural Analysis, RCC, Soil Mechanics, Fluid Mechanics, Highway Engineering</li>
  <li>Rajasthan GK is a major scoring area - do not ignore it</li>
  <li>Practice mock tests regularly to improve speed and accuracy</li>
  <li>Revise NCERT basics for the General Studies portion</li>
  <li>Join a structured test series to track your progress</li>
</ul>

<h2>Prepare with Dr. Jaspal Singh (Ex-IES) - jaspalsingh.in</h2>
<ul>
  <li>RSSB JE 2026 Crash Course: Complete Civil Engineering syllabus coverage</li>
  <li>Topic-wise &amp; Full-Length Mock Test Series with detailed solutions</li>
  <li>Previous Year Questions analysis with shortcut techniques</li>
  <li>Live doubt sessions &amp; personalized mentorship by an Ex-IES officer</li>
  <li>Offline Batch Available | Online Test Series at jaspalsingh.in</li>
</ul>

<h2>8. Frequently Asked Questions (FAQs)</h2>
<h3>Q1. Is a B.Tech degree required for RSSB JE Civil?</h3>
<p>No. A Diploma in Civil Engineering is also accepted as a qualifying qualification for RSSB JE Civil posts.</p>
<h3>Q2. Is there any negative marking in the RSSB JE exam?</h3>
<p>Negative marking details are mentioned in the official notification. Candidates should verify this before the exam.</p>
<h3>Q3. Can candidates from other states apply for RSSB JE 2026?</h3>
<p>General category posts may be open to candidates from other states, but Rajasthan domicile is mandatory for reserved category seats.</p>
<h3>Q4. How many attempts are allowed for RSSB JE?</h3>
<p>There is no restriction on the number of attempts as long as the candidate meets the age eligibility criteria as on the cut-off date.</p>
<h3>Q5. Where can I find RSSB JE Previous Year Papers?</h3>
<p>Previous year question papers and full-length mock tests are available on jaspalsingh.in as part of the RSSB JE Test Series by Dr. Jaspal Singh (Ex-IES).</p>

<h2>Conclusion</h2>
<p>The RSSB JE 2026 notification is one of the most important government job opportunities for Civil Engineering aspirants in Rajasthan. With the right preparation strategy, structured study material, and consistent practice, cracking this exam is absolutely achievable.</p>
<p>Start your preparation today with Dr. Jaspal Singh's RSSB JE Crash Course and Test Series - crafted specifically for Rajasthan JE aspirants by an Ex-IES officer with decades of experience.</p>
<blockquote>Visit jaspalsingh.in to enroll and start preparing for RSSB JE 2026 today.</blockquote>`,
  },

  /* ══════════════════════════════════════════════════════
     POST 2: subject-tips
  ══════════════════════════════════════════════════════ */
  {
    title:    'RSSB JE Exam Pattern & Syllabus 2026: Complete Subject-wise Breakdown for Civil Engineers',
    category: 'subject-tips',
    excerpt:  'Knowing the official exam pattern and exact syllabus is the most important first step for RSSB JE Civil Engineering 2026. Here is the complete official syllabus, marking scheme, and preparation guidance by Dr. Jaspal Singh (Ex-IES).',
    content: `<h2>Start Your Preparation with the Official Syllabus</h2>
<p>If you are preparing for RSSB JE Civil Engineering 2026, knowing the official exam pattern and exact syllabus is your most important first step. This blog presents the complete, official syllabus as released by the Rajasthan Karmchari Chayan Board (RSSB) for Civil Engineering - both Diploma and Degree level - along with the exam structure, marking scheme, and preparation guidance by Dr. Jaspal Singh (Ex-IES).</p>

<h2>RSSB JE - Exam at a Glance (Official)</h2>
<ul>
  <li><strong>Exam Name:</strong> RSSB Junior Engineer (JE) - Civil Engineering (Diploma / Degree)</li>
  <li><strong>Conducting Body:</strong> Rajasthan Karmchari Chayan Board, Jaipur</li>
  <li><strong>Mode of Exam:</strong> Offline - OMR Based, Objective (MCQ) Type</li>
  <li><strong>Total Papers:</strong> Single Paper (Bhag-A + Bhag-B)</li>
  <li><strong>Total Marks:</strong> 120 Marks</li>
  <li><strong>Exam Duration:</strong> 2 Hours</li>
  <li><strong>Minimum Qualifying Marks:</strong> 40% (candidates scoring below are ineligible for appointment)</li>
</ul>

<h2>1. Official Exam Pattern (Pariksha Ki Scheme)</h2>
<p>The paper is divided into two parts - Bhag-A (General Knowledge) and Bhag-B (Civil Engineering Technical):</p>
<table>
  <thead><tr><th>Section</th><th>Marks</th><th>Total Marks</th><th>Time</th></tr></thead>
  <tbody>
    <tr><td>Bhag-A: Samanya Gyan (Rajasthan History, Art &amp; Culture, Traditions, Heritage, Geography, Political &amp; Administrative System)</td><td>40</td><td rowspan="2">120</td><td rowspan="2">2 Hours</td></tr>
    <tr><td>Bhag-B: Civil Engineering (Diploma Level or Degree Level, as per post applied)</td><td>80</td></tr>
  </tbody>
</table>
<ul>
  <li>All questions are multiple choice (MCQ) type with equal marks for each question</li>
  <li>Minimum qualifying marks are fixed at 40% - candidates scoring below are NOT eligible for appointment</li>
  <li>Negative marking: 1/3rd (one-third) of marks deducted for every wrong answer</li>
  <li>The paper is bilingual - Hindi and English</li>
</ul>

<h2>2. Bhag-A - Samanya Gyan (General Knowledge) Syllabus</h2>
<p>Bhag-A is common to all branches (Civil, Electrical, Mechanical). It carries 40 marks and covers three main areas of Rajasthan-specific General Knowledge:</p>
<h3>2a. History, Art, Culture &amp; Heritage of Rajasthan</h3>
<ul>
  <li>Major sources of Rajasthan history and pre-historic civilizations</li>
  <li>Major dynasties and their achievements; Mugal-Rajput relations</li>
  <li>Features of architecture; important forts, monuments and structures</li>
  <li>Religious movements and folk deities; paintings, styles and handicrafts</li>
  <li>Literature and dialects; fairs, festivals, folk music and dance</li>
  <li>Culture, traditions and heritage; important historical tourist places</li>
  <li>Prominent personalities of Rajasthan</li>
  <li>Rajasthan's princely states, British treaties, and the 1857 uprising</li>
  <li>Peasant and tribal movements, Prajamandal movement</li>
  <li>Unification of Rajasthan; political awakening and development, with special reference to women</li>
</ul>
<h3>2b. Geography of Rajasthan</h3>
<ul>
  <li>Location and extent; major physical divisions - desert, Aravalli hills, plains, plateau regions</li>
  <li>Drainage system; climate; soil; natural vegetation</li>
  <li>Forests and wildlife conservation; environmental and ecological issues; desertification</li>
  <li>Agro-climatic zones and major crops; livestock</li>
  <li>Multipurpose and irrigation projects; water conservation; transportation; mineral resources</li>
</ul>
<h3>2c. Political &amp; Administrative System of Rajasthan</h3>
<ul>
  <li>Local urban self-governance; 74th Constitutional Amendment</li>
  <li>Governor, Rajasthan Vidhan Sabha, Chief Minister, District Administration, Lokayukta</li>
  <li>State Human Rights Commission; State Information Commission; State Election Commission</li>
  <li>Rajasthan Lok Seva Guarantee Adhiniyam, 2011</li>
</ul>

<h2>3. Bhag-B - Civil Engineering (Diploma Level) - Official Syllabus</h2>
<p>This carries 80 marks and covers 7 major subject areas:</p>
<ol>
  <li><strong>Building Technology and Construction Management</strong> - Physical and chemical properties of materials, classification and standard tests, building stones, cement, timber, bituminous materials, paints and varnishes</li>
  <li><strong>Surveying, Estimating &amp; Costing</strong> - Chain surveying, compass and theodolite traversing, leveling, contouring, tachometric survey, curve setting, rate analysis, bar bending schedule, valuation</li>
  <li><strong>Strength of Materials</strong> - Elasticity constants, determinate and indeterminate beams, bending moment and shear force diagrams, moment of inertia, slope deflection, columns, torsion</li>
  <li><strong>Reinforced Concrete Design</strong> - Flexural, shear and bond strength of RCC beams, singly and doubly reinforced beams, T-beams, slabs, footings, columns, staircases, water tanks (Limit State and Working Stress methods)</li>
  <li><strong>Irrigation &amp; Water Resources</strong> - Types and methods of irrigation, hydrology, canal systems, tube wells, weirs and barrages, Kennedy's and Lacey's theories, flood control</li>
  <li><strong>Soil Engineering</strong> - Phase relationships, index properties, permeability, consolidation, shear strength, compaction, earth pressure theories, bearing capacity</li>
  <li><strong>Auto-CAD Civil Engineering Drawing</strong> - Civil engineering drawings using AutoCAD, drawing interpretation and detailing</li>
</ol>

<h2>4. Bhag-B - Civil Engineering (Degree Level) - Official Syllabus</h2>
<p>Degree candidates cover 13 major subjects, all Diploma topics plus additional depth in:</p>
<ol>
  <li><strong>Building Technology and Construction Management</strong> - including CPM/PERT network analysis</li>
  <li><strong>Fluid Mechanics</strong> - properties of fluids, hydrostatics, hydro-kinematics, Bernoulli's equation, flow through pipes, Darcy-Weisbach and Manning's formulas</li>
  <li><strong>Surveying, Estimating, Costing &amp; Field Engineering</strong> - including trigonometric leveling, field astronomy, remote sensing and GIS basics</li>
  <li><strong>Irrigation &amp; Water Resources</strong></li>
  <li><strong>Theory of Structures and Strength of Materials</strong></li>
  <li><strong>Structural Analysis</strong> - static and kinematic indeterminacy, slope-deflection and moment-distribution methods, unit load method</li>
  <li><strong>Soil Mechanics and Foundation Engineering</strong></li>
  <li><strong>Design of R.C. Concrete and Masonry Structures</strong> - including concrete technology and mix design</li>
  <li><strong>Design of Steel Structures</strong> - columns, beams, roof trusses, plate girders</li>
  <li><strong>Construction Technology</strong> - masonry, roofing, flooring, plastering, centering and shuttering</li>
  <li><strong>Auto-CAD Civil Engineering Drawing</strong></li>
  <li><strong>Public Health Engineering</strong> - water supply, sewerage systems, treatment processes</li>
  <li><strong>Highway and Bridges</strong> - highway planning, pavement design, traffic engineering</li>
</ol>

<h2>5. Civil Engineering - Subject-wise Priority for RSSB JE</h2>
<p>Based on the official syllabus and previous year paper trends, here is the priority level for each subject:</p>
<table>
  <thead><tr><th>Subject</th><th>Level</th><th>Priority</th></tr></thead>
  <tbody>
    <tr><td>Reinforced Concrete Design (RCC)</td><td>Diploma &amp; Degree</td><td>Very High</td></tr>
    <tr><td>Soil Mechanics &amp; Foundation Engineering</td><td>Diploma &amp; Degree</td><td>Very High</td></tr>
    <tr><td>Fluid Mechanics</td><td>Diploma &amp; Degree</td><td>High</td></tr>
    <tr><td>Structural Analysis / Theory of Structures</td><td>Degree</td><td>High</td></tr>
    <tr><td>Surveying, Estimating &amp; Costing</td><td>Diploma &amp; Degree</td><td>Medium-High</td></tr>
    <tr><td>Highway and Bridges</td><td>Degree</td><td>Medium-High</td></tr>
    <tr><td>Irrigation &amp; Water Resources</td><td>Diploma &amp; Degree</td><td>Medium</td></tr>
    <tr><td>Building Technology &amp; Construction</td><td>Diploma &amp; Degree</td><td>Medium</td></tr>
    <tr><td>Public Health Engineering</td><td>Degree</td><td>Moderate</td></tr>
    <tr><td>Design of Steel Structures</td><td>Degree</td><td>Moderate</td></tr>
    <tr><td>Rajasthan GK (Bhag-A)</td><td>All</td><td>Very High (Easy Marks)</td></tr>
  </tbody>
</table>

<h2>6. Preparation Strategy by Dr. Jaspal Singh (Ex-IES)</h2>
<h3>Phase 1 - Foundation (Months 1-2)</h3>
<ul>
  <li>Start with RCC Design and Soil Mechanics - highest weightage subjects</li>
  <li>Cover Bhag-A Rajasthan GK: 30 minutes daily (History, Geography, Polity)</li>
  <li>Refer to IS 456:2000 for RCC; Atterberg limits and bearing capacity for Soil</li>
  <li>Make concise notes chapter-wise for quick revision</li>
</ul>
<h3>Phase 2 - Core Technical (Months 3-4)</h3>
<ul>
  <li>Complete Fluid Mechanics, Surveying, Irrigation and Highway Engineering</li>
  <li>Solve RSSB JE Previous Year Question Papers (PYQs) topic-wise</li>
  <li>Take chapter-wise mock tests after every topic</li>
  <li>Identify weak areas and dedicate focused revision sessions</li>
</ul>
<h3>Phase 3 - Revision + Full Mocks (Months 5-6)</h3>
<ul>
  <li>Revise all short notes and formula sheets</li>
  <li>Attempt 2-3 full-length mock tests per week under timed conditions</li>
  <li>Analyse every mock test - focus on accuracy and negative marking avoidance</li>
  <li>Revise Rajasthan current affairs (last 12 months) in the final weeks</li>
  <li>Stop new topics 2 weeks before the exam - only revision</li>
</ul>

<h2>Crack RSSB JE 2026 with Dr. Jaspal Singh (Ex-IES)</h2>
<ul>
  <li>Complete RSSB JE Crash Course covering the full official syllabus (Diploma &amp; Degree)</li>
  <li>Subject-wise video lectures with concept clarity by an Ex-IES officer</li>
  <li>Full-length &amp; chapter-wise mock test series with detailed solutions</li>
  <li>Previous year questions (PYQs) with trick-based analysis</li>
  <li>Live doubt-clearing sessions + offline batch available</li>
  <li>Enroll at jaspalsingh.in</li>
</ul>

<h2>7. Frequently Asked Questions (FAQs)</h2>
<h3>Q1. Is the syllabus different for Diploma and Degree candidates?</h3>
<p>Yes. Bhag-A (General Knowledge) is identical for both. The Bhag-B technical syllabus is different - Diploma candidates have 7 subjects while Degree candidates have 13 subjects with greater depth.</p>
<h3>Q2. What is the negative marking rule in RSSB JE?</h3>
<p>As per the official notification, 1/3rd (one-third) of the marks of that question will be deducted for every wrong answer. So attempt only questions you are confident about.</p>
<h3>Q3. What is the minimum passing percentage in RSSB JE?</h3>
<p>The minimum qualifying marks are fixed at 40%. Candidates scoring below 40% are not eligible for appointment, irrespective of their rank.</p>
<h3>Q4. Which subject has the highest weightage in RSSB JE Civil?</h3>
<p>RCC Design and Soil Mechanics consistently appear as the highest weightage technical subjects. For Bhag-A, Rajasthan GK is a scoring area that should not be neglected.</p>
<h3>Q5. Where can I get full mock tests based on this exact syllabus?</h3>
<p>Dr. Jaspal Singh's RSSB JE Test Series at jaspalsingh.in is designed specifically based on the official RSSB Civil Engineering syllabus - both Diploma and Degree level.</p>

<h2>Conclusion</h2>
<p>The RSSB JE Civil Engineering syllabus is detailed but structured. Bhag-A tests your Rajasthan GK while Bhag-B tests the depth of your engineering knowledge. Whether you are appearing at the Diploma or Degree level, a clear understanding of the official syllabus - as presented in this blog - is the foundation of a winning preparation plan.</p>
<blockquote>Visit jaspalsingh.in and enroll in the RSSB JE Crash Course &amp; Test Series today.</blockquote>`,
  },

  /* ══════════════════════════════════════════════════════
     POST 3: strategy
  ══════════════════════════════════════════════════════ */
  {
    title:    'RSSB JE Civil Engineering Exam Strategy 2026: Vacancy, Cutoff, Syllabus & PYQ Weightage Analysis',
    category: 'strategy',
    excerpt:  'Cracking RSSB JE Civil Engineering requires more than studying - it demands a smart, data-driven strategy. Dr. Jaspal Singh (Ex-IES) breaks down vacancy trends, year-wise cutoffs, PYQ weightage, and the exact books that have produced questions in past papers.',
    content: `<h2>The Only RSSB JE Strategy Blog You Will Need</h2>
<p>Cracking RSSB JE Civil Engineering requires more than just studying - it demands a smart, data-driven strategy. In this blog, Dr. Jaspal Singh (Ex-IES) presents the complete picture: historical vacancy trends, year-wise cutoffs, number of applicants, the official exam pattern, subject-wise PYQ weightage analysis, paper-type breakdown, and the exact books that have produced questions in past papers.</p>

<h2>RSSB JE - Complete Exam Overview</h2>
<ul>
  <li><strong>Conducting Body:</strong> Rajasthan Karmchari Chayan Board (RSMSSB), Jaipur</li>
  <li><strong>Post:</strong> Junior Engineer (JE) - Civil Engineering (Diploma &amp; Degree)</li>
  <li><strong>Exam Mode:</strong> Offline OMR-based, Objective MCQ</li>
  <li><strong>Total Marks:</strong> 120 | Part A (GK): 40 Marks | Part B (Civil Engg): 80 Marks</li>
  <li><strong>Duration:</strong> 2 Hours | Negative Marking: 1/3rd per wrong answer</li>
  <li><strong>Minimum Qualifying Marks:</strong> 40% (candidates below are ineligible for appointment)</li>
</ul>

<h2>1. RSSB JE Civil Engineering - Year-wise Vacancy Details</h2>
<p>Understanding vacancy trends helps you gauge competition and plan accordingly:</p>
<table>
  <thead><tr><th>Year</th><th>Degree</th><th>Diploma</th><th>Total Vacancies</th></tr></thead>
  <tbody>
    <tr><td>2016</td><td>231</td><td>336</td><td>567</td></tr>
    <tr><td>2020</td><td>543</td><td>481</td><td>1,024</td></tr>
    <tr><td>2022</td><td>787</td><td>339</td><td>1,126</td></tr>
  </tbody>
</table>
<blockquote>Vacancies have nearly doubled from 583 (2016) to 1,126 (2022). Degree vacancies grew sharply - 231 (2016) to 787 (2022), a 3.4x increase. If this trend continues, RSSB JE 2026 could see 1,200+ vacancies. TSP (Tribal Sub Plan) vacancies are separate - check eligibility carefully.</blockquote>

<h2>2. Total Applicants - Competition Level Analysis</h2>
<table>
  <thead><tr><th>Year</th><th>Total Applications</th><th>Vacancies</th><th>Approx. Candidates per Post</th></tr></thead>
  <tbody>
    <tr><td>2016</td><td>29,567 (Degree + Diploma)</td><td>567</td><td>~52</td></tr>
    <tr><td>2020</td><td>1,00,496 (Degree + Diploma)</td><td>1,024</td><td>~98</td></tr>
    <tr><td>2022</td><td>80,129</td><td>1,126</td><td>~71</td></tr>
  </tbody>
</table>
<blockquote>RSSB JE is a highly competitive exam - structured preparation is non-negotiable. The difference between selection and rejection is often just 2-3 marks, so accuracy matters as much as knowledge.</blockquote>

<h2>3. Year-wise Official Cutoff Marks Analysis (Out of 120, Non-TSP)</h2>
<table>
  <thead><tr><th>Category</th><th>2016 Degree (M/F)</th><th>2020 Degree (M/F)</th><th>2022 Degree (M/F)</th></tr></thead>
  <tbody>
    <tr><td>General</td><td>74.11 / 63.31</td><td>102.27 / 93.18</td><td>78.81 / 62.06</td></tr>
    <tr><td>OBC</td><td>71.84 / 59.92</td><td>101.22 / 92.20</td><td>77.81 / 58.53</td></tr>
    <tr><td>SC</td><td>66.65 / 52.40</td><td>97.01 / 84.74</td><td>70.95 / 48.38</td></tr>
    <tr><td>ST</td><td>70.88 / 62.14</td><td>100.99 / 91.44</td><td>77.37 / 58.34</td></tr>
  </tbody>
</table>
<blockquote>2016 cutoffs were low because it was early, with fewer serious candidates. 2020 cutoffs jumped sharply as awareness and competition increased. 2022 cutoffs dropped as 2020 was a re-exam cycle with extra preparation time. Diploma cutoffs are historically higher than Degree cutoffs - Diploma is more competitive. Target Score Strategy: aim for 90+ out of 120 to be safe across all categories and both levels.</blockquote>

<h2>4. Official Exam Pattern (Pariksha Ki Scheme)</h2>
<table>
  <thead><tr><th>Parameter</th><th>Details</th></tr></thead>
  <tbody>
    <tr><td>Each Question</td><td>1 Mark</td></tr>
    <tr><td>Negative Marking</td><td>1/3 mark deducted per wrong answer</td></tr>
    <tr><td>Total Questions</td><td>120 MCQs</td></tr>
    <tr><td>Language</td><td>Hindi &amp; English (Bilingual)</td></tr>
    <tr><td>Minimum Qualifying</td><td>40% (below = ineligible for appointment)</td></tr>
    <tr><td>Mode</td><td>Offline - OMR Sheet</td></tr>
  </tbody>
</table>

<h2>5. Subject-wise PYQ Weightage Analysis</h2>
<p>This is the most valuable data for your preparation. Dr. Jaspal Singh has compiled the official subject-wise question distribution from RSSB JE Civil papers held so far:</p>
<table>
  <thead><tr><th>Subject</th><th>Typical Question Count (Diploma)</th><th>Typical Question Count (Degree)</th></tr></thead>
  <tbody>
    <tr><td>Strength of Materials (SOM)</td><td>7-20</td><td>6-14</td></tr>
    <tr><td>RCC Design</td><td>10-18</td><td>4-9</td></tr>
    <tr><td>Building Materials &amp; Construction (BMC)</td><td>8-17</td><td>2-9</td></tr>
    <tr><td>Soil Mechanics</td><td>6-16</td><td>8-11</td></tr>
    <tr><td>Surveying</td><td>7-13</td><td>5-11</td></tr>
    <tr><td>Irrigation</td><td>2-14</td><td>2-8</td></tr>
    <tr><td>Fluid Mechanics</td><td>Not tested</td><td>7-12</td></tr>
    <tr><td>Estimation</td><td>4-7</td><td>0-6</td></tr>
    <tr><td>Highway</td><td>0-5</td><td>0-13</td></tr>
  </tbody>
</table>
<blockquote>RCC Design is consistently high in Diploma - 2022 showed a massive spike to 18 questions. Soil Mechanics is steady across both Diploma and Degree - never skip it. Highway Engineering suddenly jumped to 13 questions in 2022 Degree - be prepared. Fluid Mechanics appears only in Degree papers - Diploma candidates need not study it. Rajasthan GK (Part A) accounts for 33% of total marks - treat it like a technical subject. AutoCAD appears every year - 3-5 easy questions - do not ignore it.</blockquote>

<h2>6. Paper Type Analysis - What Kind of Questions Come?</h2>
<table>
  <thead><tr><th>Question Type</th><th>2022 Degree</th><th>2022 Diploma</th></tr></thead>
  <tbody>
    <tr><td>Theory / Simple MCQs</td><td>35</td><td>67</td></tr>
    <tr><td>Numerical Based Questions</td><td>22</td><td>7</td></tr>
    <tr><td>Image Based Questions</td><td>7</td><td>-</td></tr>
    <tr><td>Statement Based Questions</td><td>8</td><td>3</td></tr>
    <tr><td>IS Code Based Questions</td><td>5</td><td>2</td></tr>
    <tr><td>Total Technical Questions</td><td>80</td><td>80</td></tr>
  </tbody>
</table>
<blockquote>Diploma: 67 out of 80 are simple theory MCQs - conceptual clarity matters more than numericals. Degree: only 35 simple questions - expect more numericals, IS codes and image-based questions. IS Code questions in Degree commonly draw from IS 456, IS 800, and IRC codes - know the key values. Negative marking of 1/3 is significant - attempt only when 70%+ confident.</blockquote>

<h2>7. Official Syllabus Snapshot</h2>
<p>Part A (40 marks) covers Rajasthan History, Art &amp; Culture, Geography, and Political &amp; Administrative System - identical for Diploma and Degree. Part B (80 marks) covers 7 core subjects for Diploma and 13 subjects for Degree, including RCC Design, Soil Engineering, Surveying, Irrigation, Fluid Mechanics (Degree only), Structural Analysis (Degree only), Steel Structures, Highway and Bridges, and Public Health Engineering. For the full official subject-wise breakdown, see our companion syllabus blog on jaspalsingh.in.</p>

<h2>8. Official Paper Source &amp; Recommended Books</h2>
<p>These are the books from which RSSB JE questions have historically been sourced, based on paper analysis:</p>
<table>
  <thead><tr><th>Subject</th><th>Author / Publication</th></tr></thead>
  <tbody>
    <tr><td>Rajasthan GK</td><td>Hindi Granth Akademi series (Bhugol, Itihas-Kala-Sanskriti, Prashasnik evam Rajnitik Vyavastha); Rajasthan Adhyayan (Board Ajmer, Class 9-12)</td></tr>
    <tr><td>BMC (Building Materials &amp; Const.)</td><td>Rangwala</td></tr>
    <tr><td>Surveying</td><td>B.C. Punmia / S.K. Duggal</td></tr>
    <tr><td>Soil Mechanics</td><td>K.R. Arora / B.C. Punmia / Gopal Ranjan &amp; A.S.R. Rao / Dr. P.N. Modi</td></tr>
    <tr><td>Fluid Mechanics</td><td>R.K. Bansal / Modi &amp; Seth</td></tr>
    <tr><td>Irrigation</td><td>S.K. Garg / B.C. Punmia / Dr. P.N. Modi</td></tr>
    <tr><td>Highway &amp; Transportation</td><td>S.K. Khanna &amp; C.E.G. Justo</td></tr>
    <tr><td>Strength of Materials (SOM)</td><td>Barry J. Goodno &amp; James M. Gere / R.K. Bansal</td></tr>
    <tr><td>Structural Analysis (TOS)</td><td>R.C. Hibbeler</td></tr>
    <tr><td>RCC Design</td><td>Pillai &amp; Menon / B.C. Punmia</td></tr>
    <tr><td>Steel Structures</td><td>S.K. Duggal</td></tr>
  </tbody>
</table>
<blockquote>Solving ESE and GATE PYQs is not optional for Degree candidates - questions have been directly reused in past papers (2022 Degree, 2020 Re-Exam). For Diploma, focus on conceptual theory from standard textbooks, since the majority of questions are simple MCQs. Hindi Granth Akademi books remain the primary source for Rajasthan GK - do not rely on generic GK books.</blockquote>

<h2>Complete RSSB JE 2026 Preparation with Dr. Jaspal Singh (Ex-IES)</h2>
<ul>
  <li>Offline classroom batch in Jaipur - complete Civil Engineering + Rajasthan GK coverage</li>
  <li>RSSB JE Test Series - chapter-wise &amp; full-length mocks aligned to PYQ patterns</li>
  <li>ESE &amp; GATE PYQ solving sessions for Degree candidates</li>
  <li>Strategy sessions on cutoff targeting and time management</li>
  <li>Personal mentorship by an Ex-IES officer who knows exactly what RSSB JE demands</li>
  <li>Enroll now at jaspalsingh.in</li>
</ul>

<h2>Conclusion</h2>
<p>RSSB JE Civil Engineering is one of the most rewarding government engineering examinations in Rajasthan. With vacancies growing from 583 in 2016 to 1,126 in 2022, opportunities are expanding - but so is the competition, from around 15,000 applicants in 2016 to over 80,000 in 2022. The difference between a selected candidate and an unsuccessful one often comes down to strategy, not just hard work.</p>
<p>Use this blog as your master reference: know your cutoff targets, prioritize subjects by PYQ weightage, prepare from the right books, and practice under exam conditions.</p>
<blockquote>Visit jaspalsingh.in - Start Smart. Study Right. Crack RSSB JE 2026.</blockquote>`,
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
      console.log('Published');
      success++;
    } else {
      console.log('Failed - ', res.body.error || res.status);
      failed++;
    }

    /* small delay to avoid rate limiting */
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\nDone. ${success} published, ${failed} failed.`);
}

main().catch(console.error);
