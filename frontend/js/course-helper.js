/* ============================================================
   course-helper.js  -  "Need help choosing a course?" chat
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   A guided, rule-based chat (no AI): learners tap through exam ->
   how they want to prepare -> level, and get live program cards
   (price, View details, Enroll) from GET /api/programs, or type a
   question in English, Hindi or Hinglish and get a predefined answer.
   Anything it can't answer (and anything after payment, refunds,
   changing centre) goes to "Chat with Jaspal Sir" on WhatsApp, with
   the learner's question pre-filled - always the last option.

   Loaded by chat-tab.js, so it shows on every page that has the
   WhatsApp chat. Sits above the existing WhatsApp button (desktop)
   and above the "Still unsure?" bar (mobile) without covering them.
   ============================================================ */
(function () {
  'use strict';
  if (window.__courseHelperLoaded) return;
  window.__courseHelperLoaded = true;

  var API_BASE = (function () {
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  })();
  var WA_NUMBER = '919829133317';

  /* ── Exams the finder knows. `match` runs against a program's
     exam + slug + title; `words` against what the learner types. ── */
  var EXAMS = [
    { key: 'rssb',   label: 'RSSB JE',        match: /rssb|\bjen\b|shaurya|शौर्य/i,   words: ['rssb', 'jen', 'rajasthan je', 'आरएसएसबी', 'जेईएन', 'shaurya', 'शौर्य'] },
    { key: 'ukpsc',  label: 'UKPSC AE/JE',    match: /ukpsc|uttarakhand/i,             words: ['ukpsc', 'uttarakhand', 'uk je', 'uk ae', 'उत्तराखंड', 'यूकेपीएससी'] },
    { key: 'ese',    label: 'ESE',            match: /\bese\b|\bies\b/i,               words: ['ese', 'ies', 'upsc ese', 'engineering services', 'ईएसई', 'आईईएस'] },
    { key: 'rpsc',   label: 'RPSC AE',        match: /rpsc/i,                          words: ['rpsc', 'rpsc ae', 'आरपीएससी', 'aen'] },
    { key: 'rvunl',  label: 'RVUNL JE',       match: /rvunl/i,                         words: ['rvunl', 'आरवीयूएनएल', 'bijli', 'vidyut'] },
    { key: 'uppoly', label: 'UP Polytechnic', match: /polytechnic/i,                   words: ['polytechnic', 'lecturer', 'up poly', 'पॉलिटेक्निक', 'लेक्चरर'] },
    { key: 'gate',   label: 'GATE',           match: /\bgate\b/i,                      words: ['gate', 'गेट'] },
  ];

  var CENTRES = ['Ajmer', 'Alwar', 'Anupgarh', 'Balotra', 'Banswara', 'Baran', 'Barmer', 'Beawar', 'Behror', 'Bhadra', 'Bharatpur', 'Bhilwara', 'Bhinmal', 'Bikaner', 'Bundi', 'Chittorgarh', 'Chohtan', 'Chomu', 'Churu', 'Dausa', 'Deeg', 'Dholpur', 'Dungarpur', 'Gangapur City', 'Hanumangarh', 'Hindaun City', 'Jaipur', 'Jaisalmer', 'Jalore', 'Jhalawar', 'Jhunjhunu', 'Jodhpur', 'Kota', 'Kotputli', 'Kuchaman City', 'Merta City', 'Nagaur', 'Nathdwara', 'Neem Ka Thana', 'Nohar', 'Nokha', 'Pali', 'Partapur', 'Phalodi', 'Pratapgarh', 'Rajsamand', 'Sagwara', 'Salasar', 'Sanchore', 'Sardarshahar', 'Sawai Madhopur', 'Shahpura', 'Sikar', 'Sirohi', 'Sri Ganganagar', 'Sumerpur', 'Suratgarh', 'Taranagar', 'Tonk', 'Udaipur'];
  var CITY_HI = { 'जयपुर': 'Jaipur', 'जोधपुर': 'Jodhpur', 'कोटा': 'Kota', 'उदयपुर': 'Udaipur', 'अजमेर': 'Ajmer', 'बीकानेर': 'Bikaner', 'अलवर': 'Alwar', 'सीकर': 'Sikar', 'भीलवाड़ा': 'Bhilwara', 'भरतपुर': 'Bharatpur', 'चूरू': 'Churu', 'झुंझुनू': 'Jhunjhunu', 'नागौर': 'Nagaur', 'पाली': 'Pali', 'बाड़मेर': 'Barmer', 'जैसलमेर': 'Jaisalmer', 'टोंक': 'Tonk', 'दौसा': 'Dausa', 'बूंदी': 'Bundi', 'चित्तौड़गढ़': 'Chittorgarh', 'हनुमानगढ़': 'Hanumangarh', 'श्रीगंगानगर': 'Sri Ganganagar', 'सिरोही': 'Sirohi', 'जालोर': 'Jalore', 'बांसवाड़ा': 'Banswara', 'डूंगरपुर': 'Dungarpur', 'राजसमंद': 'Rajsamand', 'धौलपुर': 'Dholpur', 'करौली': 'Karauli', 'दिल्ली': 'Delhi' };

  /* ── Predefined answers. `en` / `hi`: reply text (hi is used when the
     learner types in Devanagari). `links`: [label, url] buttons.
     `then`: a finder step to run after the answer. `wa`: send straight
     to WhatsApp (topics the team must handle). ── */
  var TOPICS = [
    { id: 'which', words: ['which course', 'which program', 'konsa', 'kaunsa', 'kon sa', 'best course', 'suggest', 'recommend', 'kya lu', 'kya lena', 'कौन सा', 'कौनसा', 'कोर्स', 'सबसे अच्छा', 'course', 'program'],
      en: 'Let\'s find the right program. What are you preparing for?',
      hi: 'चलिए सही प्रोग्राम ढूंढते हैं। आप किस परीक्षा की तैयारी कर रहे हैं?', then: 'exam' },
    { id: 'omr', words: ['omr', 'printed omr', 'offline vs', 'ghar se', 'home se', 'from home', 'difference', 'farak', 'fark', 'antar', 'ओएमआर', 'घर से', 'अंतर', 'फर्क'],
      en: '<b>Offline:</b> attempt the test at a test centre.<br><b>Printed OMR:</b> attempt from home, then upload a photo of your OMR sheet. Same papers.',
      hi: '<b>ऑफलाइन:</b> टेस्ट सेंटर पर जाकर टेस्ट दें।<br><b>प्रिंटेड OMR:</b> घर से टेस्ट दें और फिर अपनी OMR शीट की फोटो अपलोड करें। पेपर वही रहते हैं।' },
    { id: 'level', words: ['degree', 'diploma', 'btech', 'b.tech', 'combo', 'डिग्री', 'डिप्लोमा', 'कॉम्बो'],
      en: 'RSSB JE has separate <b>Degree</b> and <b>Diploma</b> (Civil) papers - pick the one you applied for. The <b>Combo</b> covers both.',
      hi: 'RSSB JE में <b>डिग्री</b> और <b>डिप्लोमा</b> (सिविल) के पेपर अलग होते हैं - जिसके लिए आपने आवेदन किया है वही चुनें। <b>कॉम्बो</b> में दोनों शामिल हैं।', then: 'exam:rssb' },
    { id: 'shaurya', words: ['shaurya', 'शौर्य', 'batch', 'classroom', 'class', 'coaching', 'live class', 'bach', 'बैच', 'क्लास', 'कोचिंग'],
      en: '<b>शौर्य Batch</b> is our offline classroom program for RSSB JE 2026 in Jaipur: Technical (500 hrs Degree / 350 hrs Diploma) + Non-Technical (100 hrs) + Test Series, in 6 combinations. 200 seats only.',
      hi: '<b>शौर्य बैच</b> जयपुर में RSSB JE 2026 का ऑफलाइन क्लासरूम प्रोग्राम है: टेक्निकल (डिग्री 500 घंटे / डिप्लोमा 350 घंटे) + नॉन-टेक्निकल (100 घंटे) + टेस्ट सीरीज़, 6 विकल्पों में। केवल 200 सीटें।',
      links: [['See all शौर्य Batch options', '/programs/shaurya-batch-rssb-je-2026/']] },
    { id: 'price', words: ['fee', 'fees', 'price', 'cost', 'kitne', 'kitna', 'kitni', 'paisa', 'paise', 'rupees', 'rs', 'charges', 'फीस', 'कीमत', 'कितने', 'कितना', 'कितनी', 'शुल्क'],
      en: 'Prices depend on the program. Pick your exam and I\'ll show the current price of each option.',
      hi: 'फीस प्रोग्राम पर निर्भर करती है। अपनी परीक्षा चुनें, मैं हर विकल्प की मौजूदा फीस दिखाता हूँ।', then: 'exam' },
    { id: 'free', words: ['free', 'notes', 'pdf', 'material', 'study material', 'muft', 'फ्री', 'मुफ्त', 'नोट्स', 'सामग्री'],
      en: 'Free PDFs (notes, previous papers and more) are available after you create a free account - open <b>Free Resources</b> in your profile.',
      hi: 'फ्री PDF (नोट्स, पिछले पेपर आदि) एक फ्री अकाउंट बनाने के बाद मिलते हैं - अपनी प्रोफाइल में <b>Free Resources</b> खोलें।',
      links: [['Open Free Resources', '/profile/#free-resources']] },
    { id: 'offer', words: ['offer', 'coupon', 'discount', 'code', 'promo', 'sale', 'chhut', 'छूट', 'ऑफर', 'कूपन', 'डिस्काउंट'],
      en: 'Current offers are shown on the homepage banners. If you have a coupon code, enter it at checkout to see the discounted price before paying.',
      hi: 'मौजूदा ऑफर होमपेज के बैनर पर दिखते हैं। अगर आपके पास कूपन कोड है, तो चेकआउट पर डालें - पेमेंट से पहले छूट वाली कीमत दिख जाएगी।',
      links: [['See current offers', '/']] },
    { id: 'centre', words: ['centre', 'center', 'centres', 'centers', 'kahan', 'kaha', 'where', 'near me', 'nearby', 'city', 'location', 'सेंटर', 'केंद्र', 'कहाँ', 'कहां', 'शहर'],
      en: 'RSSB JE offline tests run at <b>60+ centres across Rajasthan</b>. ESE offline tests are in <b>Jaipur and Delhi</b>. Classroom batches are in <b>Jaipur</b>. You choose your centre at checkout.<br><br>Type your city and I\'ll check it.',
      hi: 'RSSB JE के ऑफलाइन टेस्ट <b>राजस्थान के 60+ सेंटर</b> पर होते हैं। ESE के ऑफलाइन टेस्ट <b>जयपुर और दिल्ली</b> में होते हैं। क्लासरूम बैच <b>जयपुर</b> में हैं। सेंटर आप चेकआउट पर चुनते हैं।<br><br>अपने शहर का नाम लिखें, मैं चेक करता हूँ।',
      chips: ['Show all centres'] },
    { id: 'address', words: ['address', 'pata', 'map', 'directions', 'mansarovar', 'tonk road', 'office', 'पता', 'नक्शा', 'ऑफिस'],
      en: '<b>Jaipur centre:</b> 124/172, Agarwal Farm, Mansarovar, Jaipur, Rajasthan 302020.<br><b>RPSC AE mock interviews:</b> the venue will be communicated on email to learners who book their slots.',
      hi: '<b>जयपुर सेंटर:</b> 124/172, अग्रवाल फार्म, मानसरोवर, जयपुर, राजस्थान 302020।<br><b>RPSC AE मॉक इंटरव्यू:</b> वेन्यू की जानकारी स्लॉट बुक करने वाले छात्रों को ईमेल पर दी जाएगी।' },
    { id: 'schedule', words: ['schedule', 'date', 'dates', 'kab', 'start', 'shuru', 'timetable', 'time table', 'when', 'calendar', 'शेड्यूल', 'कब', 'तारीख', 'शुरू'],
      en: 'Every program page has its full test schedule (dates and syllabus for each test). Pick your exam and I\'ll take you to the right program.',
      hi: 'हर प्रोग्राम पेज पर पूरा टेस्ट शेड्यूल (हर टेस्ट की तारीख और सिलेबस) दिया है। अपनी परीक्षा चुनें, मैं सही प्रोग्राम पर ले चलता हूँ।', then: 'exam' },
    { id: 'timing', words: ['timing', 'timings', 'reporting', 'baje', 'kitne baje', 'what time', 'test time', 'समय', 'बजे', 'टाइमिंग'],
      en: 'The reporting time and test time are printed on your <b>admit card</b>. Reach the centre before the reporting time with your printed admit card and an original photo ID.',
      hi: 'रिपोर्टिंग टाइम और टेस्ट का समय आपके <b>एडमिट कार्ड</b> पर छपा होता है। प्रिंटेड एडमिट कार्ड और ओरिजिनल फोटो ID के साथ रिपोर्टिंग टाइम से पहले सेंटर पहुँचें।' },
    { id: 'ese_same_day', words: ['paper 1', 'paper 2', 'paper1', 'paper2', 'p1', 'p2', 'same day', 'same sunday', 'dono paper', 'दोनों पेपर', 'पेपर 1', 'पेपर 2'],
      en: 'Yes - in our <b>ESE 2027 Prelims</b> offline test series, Paper 1 and Paper 2 (Civil) are held on the <b>same Sunday at the same centre</b> (Jaipur and Delhi), just like the real exam.',
      hi: 'हाँ - हमारी <b>ESE 2027 प्रीलिम्स</b> ऑफलाइन टेस्ट सीरीज़ में पेपर 1 और पेपर 2 (सिविल) <b>एक ही रविवार, एक ही सेंटर</b> (जयपुर और दिल्ली) पर होते हैं, बिल्कुल असली परीक्षा की तरह।', then: 'exam:ese' },
    { id: 'change', wa: true, words: ['change centre', 'change center', 'centre change', 'center change', 'switch', 'transfer', 'badal', 'badalna', 'बदल', 'बदलना', 'ट्रांसफर'],
      en: 'Changing your centre or switching programs needs our team.',
      hi: 'सेंटर बदलने या प्रोग्राम बदलने के लिए हमारी टीम से बात करनी होगी।' },
    { id: 'online', words: ['online', 'recorded', 'recording', 'video', 'lecture', 'youtube', 'app', 'ऑनलाइन', 'रिकॉर्डेड', 'वीडियो', 'लेक्चर'],
      en: 'All our programs are <b>offline</b>: tests at a centre or Printed OMR from home, and classroom batches in Jaipur. There are no recorded video lectures.',
      hi: 'हमारे सभी प्रोग्राम <b>ऑफलाइन</b> हैं: सेंटर पर टेस्ट या घर से प्रिंटेड OMR, और जयपुर में क्लासरूम बैच। रिकॉर्डेड वीडियो लेक्चर नहीं हैं।' },
    { id: 'contact', words: ['contact', 'number', 'phone', 'call', 'mobile', 'email', 'mail', 'sampark', 'baat', 'संपर्क', 'नंबर', 'फोन', 'कॉल', 'ईमेल'],
      en: '<b>Phone / WhatsApp:</b> +91 98291 33317<br><b>Email:</b> team@jaspalsingh.in<br><b>Enquiry hours:</b> 2 - 4 PM daily',
      hi: '<b>फोन / व्हाट्सएप:</b> +91 98291 33317<br><b>ईमेल:</b> team@jaspalsingh.in<br><b>पूछताछ का समय:</b> रोज़ दोपहर 2 - 4 बजे',
      links: [['Call +91 98291 33317', 'tel:+919829133317']] },
    { id: 'about', words: ['jaspal sir', 'jaspal singh', 'about', 'who is', 'kaun hai', 'teacher', 'faculty', 'air', 'ies officer', 'जसपाल', 'कौन हैं', 'शिक्षक'],
      en: '<b>Dr. Jaspal Singh</b> - Ex-IES (ESE AIR-04), GATE AIR-06, PhD in Civil Engineering, 15+ years of teaching.',
      hi: '<b>डॉ. जसपाल सिंह</b> - पूर्व IES (ESE AIR-04), GATE AIR-06, सिविल इंजीनियरिंग में PhD, 15+ वर्षों का शिक्षण अनुभव।',
      links: [['About Jaspal Sir', '/about/']] },
    /* Not answered here on purpose - straight to the team on WhatsApp. */
    { id: 'team', wa: true, words: ['refund', 'cancel', 'money back', 'paisa wapas', 'admit card', 'roll number', 'result', 'rank', 'marks', 'login', 'password', 'upload', 'payment failed', 'payment', 'paid', 'enrolled', 'not showing', 'रिफंड', 'पैसे वापस', 'एडमिट', 'रिजल्ट', 'पासवर्ड', 'पेमेंट'],
      en: 'For this, it\'s best to talk to our team directly.',
      hi: 'इसके लिए हमारी टीम से सीधे बात करना सबसे अच्छा रहेगा।' },
  ];

  /* ── Helpers ── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isHindi(s) { return /[ऀ-ॿ]/.test(s || ''); }
  function norm(s) { return ' ' + String(s || '').toLowerCase().replace(/[?!.,;:()"'\/\\-]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }
  function has(text, word) {
    var w = word.toLowerCase();
    return /[ऀ-ॿ]/.test(w) ? text.indexOf(w) !== -1 : text.indexOf(' ' + w + ' ') !== -1 || (w.indexOf(' ') !== -1 && text.indexOf(w) !== -1);
  }
  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function waLink(q) {
    var msg = 'Hi Jaspal Sir' + (q ? ', ' + q : ', I have a question before enrolling.');
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
  }
  function lang() { return state.hindi ? 'hi' : 'en'; }

  /* ── Live programs (GET /api/programs), cached for the session ── */
  var programsPromise = null;
  function loadPrograms() {
    if (programsPromise) return programsPromise;
    try {
      var c = JSON.parse(sessionStorage.getItem('ch_programs') || 'null');
      if (c && Date.now() - c.at < 10 * 60 * 1000) return (programsPromise = Promise.resolve(c.list));
    } catch (e) { /* private mode */ }
    programsPromise = fetch(API_BASE + '/api/programs').then(function (r) { return r.json(); }).then(function (d) {
      var list = (d.programs || []).filter(function (p) { return p.status !== 'closed'; });
      try { sessionStorage.setItem('ch_programs', JSON.stringify({ at: Date.now(), list: list })); } catch (e) { /* ignore */ }
      return list;
    }).catch(function () { programsPromise = null; return null; });
    return programsPromise;
  }
  function examOf(p) {
    var hay = [p.exam, p.slug, p.title].join(' ');
    for (var i = 0; i < EXAMS.length; i++) if (EXAMS[i].match.test(hay)) return EXAMS[i].key;
    return 'other';
  }
  function modeOf(p) {
    var s = p.slug || '';
    if (p.category === 'interview') return 'interview';
    if (p.category === 'course' || /batch|crash-course|foundation/.test(s)) return 'classroom';
    if (/omr/.test(s)) return 'omr';
    return 'offline';
  }
  var MODE_LABEL = {
    offline:   { en: 'At a test centre (Offline)', hi: 'टेस्ट सेंटर पर (ऑफलाइन)' },
    omr:       { en: 'From home (Printed OMR)',    hi: 'घर से (प्रिंटेड OMR)' },
    classroom: { en: 'Classroom batch / course',   hi: 'क्लासरूम बैच / कोर्स' },
    interview: { en: 'Interview guidance',         hi: 'इंटरव्यू गाइडेंस' },
  };
  function levelOf(p) {
    var s = (p.slug || '') + ' ' + (p.level || '');
    if (/combo|degree \+ diploma/i.test(s)) return 'Degree + Diploma';
    if (/degree/i.test(s)) return 'Degree';
    if (/diploma|jen-2026/i.test(s)) return 'Diploma';
    return p.level || '';
  }

  /* ── State + DOM ── */
  var state = { hindi: false, exam: null, mode: null };
  var root, panel, body, input, btn;

  function css() {
    var st = document.createElement('style');
    st.textContent = [
      '.ch-btn{position:fixed;right:24px;bottom:92px;z-index:9995;display:flex;align-items:center;gap:9px;background:#1A1A2E;color:#fff;border:2px solid #C81240;border-radius:30px;padding:9px 16px 9px 9px;box-shadow:0 8px 26px rgba(26,26,46,.35);font:700 13.5px "Plus Jakarta Sans",Inter,Arial,sans-serif;cursor:pointer;transition:transform .15s}',
      '.ch-btn:hover{transform:translateY(-2px)}',
      '.ch-btn .ch-ico{width:28px;height:28px;border-radius:50%;background:#C81240;display:grid;place-items:center;font-size:14px}',
      '.ch-panel{position:fixed;right:24px;bottom:150px;z-index:9996;width:370px;height:min(600px,calc(100vh - 180px));background:#fff;border-radius:18px;box-shadow:0 18px 60px rgba(26,26,46,.35);overflow:hidden;font-family:Inter,Arial,sans-serif;display:none;flex-direction:column}',
      '.ch-panel.open{display:flex}',
      '.ch-head{background:#1A1A2E;color:#fff;padding:13px 14px;display:flex;align-items:center;gap:10px;border-bottom:3px solid #C81240;flex-shrink:0}',
      '.ch-head img{width:36px;height:36px;border-radius:50%;border:2px solid #C81240;object-fit:cover}',
      '.ch-head b{font:800 14px "Plus Jakarta Sans",Arial,sans-serif;display:block}.ch-head small{font-size:11.5px;color:rgba(255,255,255,.65)}',
      '.ch-close{margin-left:auto;background:none;border:none;color:rgba(255,255,255,.75);font-size:22px;cursor:pointer;line-height:1;padding:4px}',
      '.ch-body{flex:1;overflow-y:auto;padding:14px;background:#F7F7FA;display:flex;flex-direction:column;gap:9px}',
      '.ch-bot{align-self:flex-start;background:#fff;border:1px solid #ECECF2;border-radius:4px 14px 14px 14px;padding:9px 12px;font-size:13px;color:#1A1A2E;max-width:90%;line-height:1.5}',
      '.ch-me{align-self:flex-end;background:#C81240;color:#fff;border-radius:14px 4px 14px 14px;padding:8px 12px;font-size:13px;font-weight:600;max-width:85%;word-wrap:break-word}',
      '.ch-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.ch-chip{border:1.5px solid #0F766E;color:#0F766E;background:#fff;border-radius:16px;padding:6px 11px;font:700 12px Inter,Arial,sans-serif;cursor:pointer}',
      '.ch-chip:hover{background:#0F766E;color:#fff}',
      '.ch-link{display:inline-block;margin-top:2px;border-radius:16px;padding:6px 12px;font:700 12px Inter,Arial,sans-serif;text-decoration:none;background:#0F766E;color:#fff}',
      '.ch-card{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:11px 12px;font-size:12.5px;color:#374151;align-self:stretch}',
      '.ch-card b{display:block;color:#1A1A2E;font-size:13px;margin-bottom:3px;line-height:1.35}',
      '.ch-card .ch-p{color:#C81240;font-weight:800;font-size:15px}.ch-card s{color:#9999b0;font-size:12px;margin-left:5px}',
      '.ch-card .ch-row{display:flex;gap:6px;margin-top:8px}',
      '.ch-card .ch-row a{flex:1;text-align:center;border-radius:16px;padding:7px 0;font-weight:700;font-size:12px;text-decoration:none}',
      '.ch-card .ch-v{border:1.5px solid #0F766E;color:#0F766E}.ch-card .ch-e{background:#C81240;color:#fff}',
      '.ch-wa{align-self:stretch;text-align:center;font-size:11.5px;color:#6b6b8a;border-top:1px dashed #DDD;padding-top:8px;margin-top:2px}',
      '.ch-wa a{color:#16A34A;font-weight:700;text-decoration:none}',
      '.ch-wa-big{display:flex;align-items:center;justify-content:center;gap:8px;background:#25D366;color:#fff;border-radius:20px;padding:9px 14px;font:700 13px Inter,Arial,sans-serif;text-decoration:none;align-self:flex-start}',
      '.ch-input{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #EEE;background:#fff;flex-shrink:0}',
      '.ch-input input{flex:1;border:1.5px solid #E5E7EB;border-radius:20px;padding:9px 13px;font:13px Inter,Arial,sans-serif;outline:none;min-width:0}',
      '.ch-input input:focus{border-color:#C81240}',
      '.ch-input button{width:38px;height:38px;border-radius:50%;background:#C81240;border:none;color:#fff;font-size:15px;cursor:pointer;flex-shrink:0}',
      '@media(max-width:768px){',
      '  .ch-btn{right:14px;bottom:16px;padding:8px 14px 8px 8px;font-size:12.5px}',
      '  .ch-panel{right:0;left:0;top:0;bottom:0;width:auto;height:auto;border-radius:0}',
      '}',
    ].join('\n');
    document.head.appendChild(st);
  }

  /* Keep clear of the existing WhatsApp items: the desktop float
     button (bottom-right) and the mobile "Still unsure?" bar. */
  function positionButton() {
    if (!btn) return;
    if (window.innerWidth <= 768) {
      var bar = document.getElementById('jctMobile');
      // offsetParent is always null for position:fixed, so check layout instead.
      var barUp = bar && getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().height > 0;
      btn.style.bottom = barUp ? (bar.offsetHeight + 10) + 'px' : '';
    } else {
      btn.style.bottom = '';
    }
  }

  function build() {
    css();
    root = document.createElement('div');
    root.innerHTML =
      '<button class="ch-btn" type="button" aria-label="Need help choosing a course? Open chat"><span class="ch-ico">💬</span><span class="ch-btn-t">Need help choosing a course?</span></button>' +
      '<div class="ch-panel" role="dialog" aria-label="Course Helper">' +
        '<div class="ch-head"><img src="/assets/images/jaspal-hero.png" alt="" onerror="this.style.display=\'none\'"><div><b>Course Helper</b><small>Find the right program in a few taps</small></div>' +
          '<button class="ch-close" type="button" aria-label="Close">&times;</button></div>' +
        '<div class="ch-body"></div>' +
        '<form class="ch-input"><input type="text" placeholder="Type your question… (English / हिंदी)" aria-label="Type your question" maxlength="200"><button type="submit" aria-label="Send">➤</button></form>' +
      '</div>';
    document.body.appendChild(root);
    btn = root.querySelector('.ch-btn');
    panel = root.querySelector('.ch-panel');
    body = root.querySelector('.ch-body');
    input = root.querySelector('.ch-input input');

    btn.addEventListener('click', toggle);
    root.querySelector('.ch-close').addEventListener('click', toggle);
    root.querySelector('.ch-input').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      input.value = '';
      ask(q);
    });
    body.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-ch]');
      if (!chip) return;
      var parts = chip.getAttribute('data-ch').split(':');
      me(chip.textContent);
      if (parts[0] === 'exam') pickExam(parts[1]);
      else if (parts[0] === 'mode') pickMode(parts[1]);
      else if (parts[0] === 'level') pickLevel(parts.slice(1).join(':'));
      else if (parts[0] === 'topic') answerTopic(TOPICS.filter(function (t) { return t.id === parts[1]; })[0], chip.textContent);
      else if (parts[0] === 'centres') showCentres();
      else if (parts[0] === 'menu') menu();
    });

    positionButton();
    window.addEventListener('resize', positionButton);
    document.addEventListener('click', function () { setTimeout(positionButton, 60); });
    setTimeout(positionButton, 1500);
  }

  var started = false;
  function toggle() {
    var open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    btn.style.display = open && window.innerWidth <= 768 ? 'none' : '';
    btn.querySelector('.ch-btn-t').textContent = open ? 'Close' : 'Need help choosing a course?';
    if (open && !started) { started = true; loadPrograms(); greet(); }
    if (!open) { btn.style.display = ''; positionButton(); }
  }

  /* ── Message helpers ── */
  function scroll() { body.scrollTop = body.scrollHeight; }
  function bot(html) { var d = document.createElement('div'); d.className = 'ch-bot'; d.innerHTML = html; body.appendChild(d); scroll(); return d; }
  function me(text) { var d = document.createElement('div'); d.className = 'ch-me'; d.textContent = text; body.appendChild(d); scroll(); }
  function chips(list) {
    var d = document.createElement('div'); d.className = 'ch-chips';
    d.innerHTML = list.map(function (c) { return '<button type="button" class="ch-chip" data-ch="' + esc(c[1]) + '">' + esc(c[0]) + '</button>'; }).join('');
    body.appendChild(d); scroll();
  }
  function links(list) {
    var d = document.createElement('div'); d.className = 'ch-chips';
    d.innerHTML = list.map(function (l) {
      var ext = /^https?:/.test(l[1]);
      return '<a class="ch-link" href="' + esc(l[1]) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l[0]) + '</a>';
    }).join('');
    body.appendChild(d); scroll();
  }
  function waFooter(q) {
    var d = document.createElement('div'); d.className = 'ch-wa';
    d.innerHTML = (state.hindi ? 'अभी भी सवाल है? ' : 'Still have a question? ') +
      '<a href="' + esc(waLink(q)) + '" target="_blank" rel="noopener">' + (state.hindi ? 'जसपाल सर से WhatsApp पर बात करें' : 'Chat with Jaspal Sir on WhatsApp') + '</a>';
    body.appendChild(d); scroll();
  }
  function waBig(q) {
    var a = document.createElement('a'); a.className = 'ch-wa-big'; a.href = waLink(q); a.target = '_blank'; a.rel = 'noopener';
    a.textContent = state.hindi ? 'जसपाल सर से WhatsApp पर बात करें' : 'Chat with Jaspal Sir on WhatsApp';
    body.appendChild(a); scroll();
  }

  /* ── Conversation ── */
  function greet() {
    bot('Hi! 👋 I can help you find the right program, prices, centres and schedules.<br><span style="color:#6b6b8a">नमस्ते! हिंदी में भी पूछ सकते हैं।</span>');
    bot('What are you preparing for?');
    examChips();
    chips([['Offline vs Printed OMR', 'topic:omr'], ['Centres', 'topic:centre'], ['Contact', 'topic:contact']]);
  }
  function menu() {
    bot(state.hindi ? 'और क्या जानना चाहेंगे?' : 'What else would you like to know?');
    chips([['Find a program', 'topic:which'], ['Offline vs Printed OMR', 'topic:omr'], ['Centres', 'topic:centre'], ['Schedule', 'topic:schedule'], ['Free resources', 'topic:free'], ['Offers', 'topic:offer'], ['Contact', 'topic:contact']]);
    waFooter();
  }
  function examChips() { chips(EXAMS.map(function (e) { return [e.label, 'exam:' + e.key]; }).concat([['Other', 'exam:other']])); }

  function pickExam(key) {
    state.exam = key; state.mode = null;
    var t = bot(state.hindi ? 'प्रोग्राम लोड हो रहे हैं…' : 'Loading programs…');
    loadPrograms().then(function (list) {
      t.remove();
      if (!list) {
        bot(state.hindi ? 'अभी प्रोग्राम लोड नहीं हो पाए। सभी प्रोग्राम यहाँ देखें:' : 'I couldn\'t load programs right now. You can see all of them here:');
        links([[state.hindi ? 'सभी प्रोग्राम देखें' : 'Browse all programs', '/programs/']]);
        waFooter(); return;
      }
      var mine = list.filter(function (p) { return examOf(p) === key; });
      if (!mine.length) {
        bot(state.hindi ? 'इस परीक्षा के लिए अभी कोई प्रोग्राम उपलब्ध नहीं है।' : 'We don\'t have a program for this exam open right now.');
        links([[state.hindi ? 'सभी प्रोग्राम देखें' : 'Browse all programs', '/programs/']]);
        waFooter(); return;
      }
      var modes = uniq(mine.map(modeOf));
      if (modes.length > 1) {
        bot(state.hindi ? 'आप कैसे तैयारी करना चाहते हैं?' : 'How do you want to prepare?');
        chips(modes.map(function (m) { return [MODE_LABEL[m][lang()], 'mode:' + m]; }));
      } else {
        pickMode(modes[0], true);
      }
    });
  }
  function pickMode(mode, silent) {
    state.mode = mode;
    loadPrograms().then(function (list) {
      var mine = (list || []).filter(function (p) { return examOf(p) === state.exam && modeOf(p) === mode; });
      var levels = uniq(mine.map(levelOf).filter(Boolean));
      if (levels.length > 1) {
        bot(state.hindi ? 'कौन सा लेवल / पेपर?' : 'Which level / paper?');
        chips(levels.map(function (l) { return [l, 'level:' + l]; }).concat([[state.hindi ? 'सभी दिखाएँ' : 'Show all', 'level:*']]));
      } else {
        showCards(mine);
      }
    });
  }
  function pickLevel(level) {
    loadPrograms().then(function (list) {
      showCards((list || []).filter(function (p) {
        return examOf(p) === state.exam && modeOf(p) === state.mode && (level === '*' || levelOf(p) === level);
      }));
    });
  }
  function showCards(progs) {
    if (!progs.length) { bot(state.hindi ? 'कोई प्रोग्राम नहीं मिला।' : 'No programs found.'); waFooter(); return; }
    bot(progs.length === 1 ? (state.hindi ? 'यह आपके लिए सही रहेगा:' : 'Here\'s the best match for you:') : (state.hindi ? 'ये विकल्प हैं:' : 'Here are your options:'));
    progs.slice(0, 6).forEach(function (p) {
      var url = p.detail_url || ('/programs/' + p.slug + '/');
      var soon = p.status === 'coming_soon' || p.price == null;
      var meta = [levelOf(p), p.total_tests ? p.total_tests + ' tests' : '', MODE_LABEL[modeOf(p)].en].filter(Boolean).join(' · ');
      var d = document.createElement('div'); d.className = 'ch-card';
      d.innerHTML = '<b>' + esc(p.title) + '</b>' + esc(meta) + '<br>' +
        (soon ? '<span class="ch-p" style="font-size:13px;color:#B45309;">Coming soon</span>'
              : '<span class="ch-p">' + inr(p.price) + '</span>' + (p.mrp && p.mrp > p.price ? '<s>' + inr(p.mrp) + '</s>' : '')) +
        '<div class="ch-row"><a class="ch-v" href="' + esc(url) + '">View details</a>' +
        (soon ? '' : '<a class="ch-e" href="/checkout/?program=' + encodeURIComponent(p.slug) + '">Enroll now</a>') + '</div>';
      body.appendChild(d);
    });
    if (progs.length > 6) links([[state.hindi ? 'सभी प्रोग्राम देखें' : 'See all programs', '/programs/']]);
    var extra = [[state.hindi ? 'दूसरी परीक्षा' : 'Another exam', 'topic:which']];
    if (state.mode === 'omr' || state.mode === 'offline') extra.unshift(['Offline vs Printed OMR', 'topic:omr']);
    extra.push([state.hindi ? 'सेंटर' : 'Centres', 'topic:centre'], [state.hindi ? 'कुछ और पूछें' : 'Ask something else', 'menu']);
    chips(extra);
    waFooter();
  }

  function answerTopic(t, q) {
    if (!t) return fallback(q);
    if (t.wa) {
      bot(t[lang()]);
      waBig(q);
      chips([[state.hindi ? 'कुछ और पूछें' : 'Ask something else', 'menu']]);
      return;
    }
    if (t.id === 'which') { bot(t[lang()]); examChips(); return; }
    bot(t[lang()]);
    if (t.links) links(t.links);
    if (t.chips && t.id === 'centre') chips([[state.hindi ? 'सभी सेंटर दिखाएँ' : 'Show all centres', 'centres']]);
    if (t.then === 'exam') { examChips(); return; }
    if (t.then && t.then.indexOf('exam:') === 0) { chips([[state.hindi ? 'प्रोग्राम दिखाएँ' : 'Show programs', t.then]]); }
    chips([[state.hindi ? 'कुछ और पूछें' : 'Ask something else', 'menu']]);
  }
  function showCentres() {
    bot('<b>RSSB JE offline test centres (60+):</b><br>' + CENTRES.join(' · '));
    chips([[state.hindi ? 'प्रोग्राम ढूंढें' : 'Find a program', 'topic:which'], [state.hindi ? 'कुछ और पूछें' : 'Ask something else', 'menu']]);
    waFooter();
  }
  function fallback(q) {
    bot(state.hindi ? 'माफ़ कीजिए, इसका जवाब मेरे पास नहीं है। जसपाल सर से सीधे पूछें:' : 'Sorry, I don\'t have an answer for that. You can ask Jaspal Sir directly:');
    waBig(q);
    chips([[state.hindi ? 'प्रोग्राम ढूंढें' : 'Find a program', 'topic:which'], [state.hindi ? 'कुछ और पूछें' : 'Ask something else', 'menu']]);
  }

  /* Typed question: city -> exam -> best-scoring topic -> WhatsApp. */
  function ask(q) {
    me(q);
    state.hindi = isHindi(q);
    var text = norm(q);

    // A centre city ("jodhpur me centre hai?", "कोटा")
    var city = null;
    CENTRES.forEach(function (c) { if (has(text, c)) city = c; });
    Object.keys(CITY_HI).forEach(function (h) { if (text.indexOf(h) !== -1) city = CITY_HI[h]; });
    if (city) {
      var ok = CENTRES.indexOf(city) !== -1;
      if (city === 'Delhi') bot(state.hindi ? 'दिल्ली में ESE 2027 प्रीलिम्स के ऑफलाइन टेस्ट होते हैं।' : 'Delhi has a centre for the <b>ESE 2027 Prelims</b> offline tests.');
      else if (ok) bot(state.hindi ? 'हाँ! <b>' + esc(city) + '</b> में RSSB JE ऑफलाइन टेस्ट का सेंटर है। सेंटर आप चेकआउट पर चुनते हैं।' : 'Yes! <b>' + esc(city) + '</b> is one of our RSSB JE offline test centres. You choose it at checkout.');
      else bot(state.hindi ? esc(city) + ' में अभी सेंटर नहीं है। आप घर से <b>प्रिंटेड OMR</b> विकल्प ले सकते हैं।' : 'We don\'t have a centre in ' + esc(city) + ' yet. You can take the <b>Printed OMR</b> option from home.');
      chips([[state.hindi ? 'प्रोग्राम ढूंढें' : 'Find a program', 'topic:which'], [state.hindi ? 'सभी सेंटर दिखाएँ' : 'Show all centres', 'centres']]);
      waFooter(q);
      return;
    }

    // Best topic by keyword hits (longer phrases count more)
    var best = null, bestScore = 0;
    TOPICS.forEach(function (t) {
      var score = 0;
      t.words.forEach(function (w) { if (has(text, w)) score += w.length > 6 ? 2 : 1; });
      if (score > bestScore) { best = t; bestScore = score; }
    });

    // An exam name, with or without a topic ("ese fees", "rssb omr")
    var exam = null;
    EXAMS.forEach(function (e) { e.words.forEach(function (w) { if (has(text, w)) exam = e.key; }); });

    if (best && best.wa) return answerTopic(best, q);
    if (exam && (!best || ['which', 'price', 'schedule', 'level', 'omr', 'shaurya'].indexOf(best.id) !== -1)) {
      if (best && best.id !== 'which' && best.id !== 'price' && best.id !== 'schedule') bot(best[lang()]);
      return pickExam(exam);
    }
    if (best) return answerTopic(best, q);
    fallback(q);
  }

  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
