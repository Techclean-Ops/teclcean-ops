/* TechClean H&S app — Phase 1 (pilot)
   Today screen, fit for work, sign on / off (D13), ARCP / SWMS sign (D1), supervisor pre-start (D5),
   incident / hazard report (D12), visitor sign in (D14). Offline first: every record is saved on the phone
   with its PDF and sent when there is signal. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var S = { me: null, job: null, people: [], jobs: [], gps: null, onBack: null, fakeOffline: false };

  /* ---------- storage (IndexedDB) ---------- */
  var DB = (function () {
    var dbp = null;
    function open() {
      if (!dbp) dbp = new Promise(function (res, rej) {
        var r = indexedDB.open('techclean-hs', 1);
        r.onupgradeneeded = function () {
          var db = r.result;
          if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
      });
      return dbp;
    }
    function tx(store, mode, fn) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s);
          t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
          t.onerror = function () { rej(t.error); };
        });
      });
    }
    return {
      put: function (rec) { return tx('records', 'readwrite', function (s) { s.put(rec); }); },
      all: function () { return tx('records', 'readonly', function (s) { return s.getAll(); }); },
      clear: function () { return tx('records', 'readwrite', function (s) { s.clear(); }); },
      setMeta: function (k, v) { return tx('meta', 'readwrite', function (s) { s.put(v, k); }); }
    };
  })();

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hm(t) { var d = new Date(t); var h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + pad(m) + (h < 12 ? 'am' : 'pm'); }
  function hhmm() { var d = new Date(); return pad(d.getHours()) + pad(d.getMinutes()); }
  function longDate() { return new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' }); }
  function uid() { return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); }
  /* ---------- certificates: expired = warning; expired fit test = stop work ---------- */
  function certList(p) {
    var cs = (p && p.certs) || {};
    return CERT_TYPES.filter(function (t) { return cs[t.id]; }).map(function (t) {
      var e = typeof cs[t.id] === 'string' ? { date: cs[t.id] } : cs[t.id];   // { date, file, url } from the back end
      var days = t.noExpiry ? 99999 : Math.floor((new Date(e.date + 'T23:59') - new Date()) / 864e5);
      return { id: t.id, name: t.name, date: e.date, file: e.file || null, url: e.url || null, days: days, expired: days < 0, soon: days >= 0 && days <= CERT_WARN_DAYS, stopWork: !!t.stopWork, dateOnly: !!t.dateOnly, noExpiry: !!t.noExpiry };
    });
  }
  function certWarnings(p) { return certList(p).filter(function (c) { return c.expired; }); }
  function certDate(d) { return new Date(d + 'T12:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fitTestFor(p, mask) {
    var cs = certList(p), half = cs.filter(function (c) { return c.id === 'ffhalf'; })[0], full = cs.filter(function (c) { return c.id === 'fffull'; })[0];
    if (mask === 'half') return { ok: !!half && !half.expired, cert: half, label: 'half face' };
    if (mask === 'full') return { ok: !!full && !full.expired, cert: full, label: 'full face' };
    var any = [half, full].filter(function (c) { return c && !c.expired; })[0];   // powered respirator: needs a current fit test for the mask in use
    return { ok: !!any, cert: any || full || half, label: 'face' };
  }
  function warnChip(pid) {
    var w = certWarnings(person(pid)).filter(function (c) { return !c.stopWork; });
    return w.length ? '<span class="chip new" style="margin-left:6px">⚠ ' + esc(w.map(function (c) { return c.name; }).join(', ')) + ' expired</span>' : '';
  }
  function worker() { return S.actAs ? person(S.actAs) : S.me; }
  function person(id) { for (var i = 0; i < S.people.length; i++) if (S.people[i].id === id) return S.people[i]; return null; }
  function first(n) { return String(n || '').split(' ')[0]; }
  function isOnline() { return navigator.onLine && !S.fakeOffline; }
  function $(sel) { return app.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(app.querySelectorAll(sel)); }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function enter(onBack) { S.atHome = false; S.onBack = onBack || null; history.pushState({ v: 1 }, ''); window.scrollTo(0, 0); }
  window.addEventListener('popstate', function () { var b = S.onBack; S.onBack = null; if (b) b(); else renderToday(); });

  function getGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (p) {
      S.gps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() };
    }, function () {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
  }
  function gpsNow() { return S.gps && Date.now() - S.gps.at < 15 * 60000 ? S.gps : null; }

  /* ---------- data: today's jobs and people ---------- */
  function loadData() {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem('tc.data') || 'null'); } catch (e) {}
    if (!CONFIG.API_URL) { cached = JSON.parse(JSON.stringify(DEMO)); applyDemoOverrides(cached); setData(cached); return Promise.resolve(); }
    if (cached) setData(cached);
    if (!isOnline()) return Promise.resolve();
    var me = localStorage.getItem('tc.token') || '';
    return fetch(CONFIG.API_URL + '?action=today&token=' + encodeURIComponent(me)).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.jobs) { var recs = d.records; delete d.records; localStorage.setItem('tc.data', JSON.stringify(d)); setData(d); return mergeRemote(recs); }
    }).catch(function () {});
  }
  function applyDemoOverrides(d) {
    var st = localStorage.getItem('tc.demo.status');
    if (st) d.jobs.forEach(function (j) { j.status = st; });
    var cl = localStorage.getItem('tc.demo.cls');
    if (cl) d.jobs.forEach(function (j) { j.cls = cl; });
  }
  function setData(d) { S.people = d.people || []; S.jobs = d.jobs || []; S.library = d.library || LIBRARY_DEMO; if (d.me) S.meFromServer = d.me; }
  async function fetchDocFile(r) {
    try {
      var res = await fetch(CONFIG.API_URL + '?action=docFile&token=' + encodeURIComponent(localStorage.getItem('tc.token') || '') + '&id=' + encodeURIComponent(r.id));
      var d = await res.json(); if (!d.ok) return false;
      r.file = 'data:' + d.mime + ';base64,' + d.b64; r.data.mime = d.mime; await DB.put(r); return true;
    } catch (e) { return false; }
  }
  /* Records made on other phones for the same jobs (from the back end): kept here so every phone sees the whole job, even with no signal. */
  async function mergeRemote(list) {
    if (!list || !list.length) return;
    var have = {}, changed = false; RECS.forEach(function (r) { have[r.id] = r; });
    for (var i = 0; i < list.length; i++) {
      var r = list[i]; if (have[r.id]) continue;
      r.status = 'sent'; r.remote = true; await DB.put(r); have[r.id] = r; changed = true;
    }
    if (!changed) return;
    // key documents are kept on the phone so they open with no signal on site
    for (var k2 in have) { var d = have[k2]; if (d.form === 'DOC' && !d.file && !d.supersededBy && ['arcp', 'survey', 'wsn', 'swms'].indexOf((d.data || {}).type) >= 0) fetchDocFile(d); }
    for (var k in have) { var x = have[k]; if (x.supersedes && have[x.supersedes] && !have[x.supersedes].supersededBy) { have[x.supersedes].supersededBy = x.id; await DB.put(have[x.supersedes]); } }
    await refreshRecs();
  }

  function resolveMe() {
    var id = localStorage.getItem('tc.me');
    if (S.meFromServer) id = S.meFromServer.id;
    S.me = id ? person(id) : null;
  }
  function resolveJob() {
    var want = S.qrJob ? String(S.qrJob).trim().toUpperCase() : null, j = null, i;
    for (i = 0; i < S.jobs.length; i++) {
      var x = S.jobs[i], keys = [x.jobKey, x.jobNo, x.id].filter(Boolean).map(function (k) { return String(k).toUpperCase(); });
      if (want ? keys.indexOf(want) >= 0 : (S.me && x.crewIds.indexOf(S.me.id) >= 0)) { j = x; if (want) break; }
    }
    if (j) applyHandover(j);
    S.job = j;
    S.notRostered = !!(j && S.me && j.crewIds.indexOf(S.me.id) < 0 && !MGR_ROLES[S.me.role]);   // scanned / tapped a job they're not crewed on today
  }

  /* ---------- records and status ---------- */
  var RECS = [];
  function refreshRecs() { return DB.all().then(function (r) { RECS = r || []; }); }
  function mine(form, pid) {
    pid = pid || (S.me && S.me.id);
    return RECS.filter(function (r) { return !r.supersededBy && r.form === form && r.personId === pid && r.date === today() && S.job && r.jobNo === S.job.jobNo; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; })[0] || null;
  }
  function statusFor(pid) {
    var ffw = mine('FFW', pid), d13 = mine('D13', pid);
    var d1 = RECS.filter(function (r) { return !r.supersededBy && r.form === 'D1' && r.personId === pid && S.job && r.jobNo === S.job.jobNo && r.data.rev === arcpRev() && sameSwms(r.data.swms); })[0] || null;
    return { ffw: ffw, d13: d13, d1: d1 };
  }
  /* Uploaded job documents (ARCP, survey, WSN …). The latest ARCP upload sets the revision crew must sign. */
  var DOC_TYPES = [['arcp', '📕', 'ARCP / SSSP', 'ARCP'], ['survey', '🔬', 'Asbestos survey / report', 'Survey'], ['wsn', '🏛️', 'WorkSafe notification', 'WSN'],
    ['swms', '📑', 'SWMS', 'H&S/Documents'], ['air', '🌬️', 'Air monitoring results', 'H&S/Documents'], ['clear', '✅', 'Clearance certificate', 'H&S/Documents'],
    ['sds', '🧪', 'Safety data sheet', 'H&S/Documents'], ['plan', '🗺️', 'Site plan / drawing', 'Drawing'],
    ['permit', '🪪', 'Permit — heights, hot work, isolation', 'H&S/Documents'], ['photos', '📸', 'Site photos', 'Photos'], ['variation', '✉️', 'Client instruction / variation', 'Documents'],
    ['plantcert', '🔧', 'Plant / equipment certificate', 'H&S/Documents'], ['other', '📄', 'Other', 'H&S/Documents']];
  function docType(k) { return DOC_TYPES.filter(function (t) { return t[0] === k; })[0] || DOC_TYPES[DOC_TYPES.length - 1]; }
  function jobDocs() { return RECS.filter(function (r) { return r.form === 'DOC' && S.job && r.jobNo === S.job.jobNo && !r.supersededBy; }).sort(function (x, y) { return DOC_TYPES.indexOf(docType(x.data.type)) - DOC_TYPES.indexOf(docType(y.data.type)) || y.createdAt - x.createdAt; }); }
  function arcpRev() {
    var d = RECS.filter(function (r) { return r.form === 'DOC' && S.job && r.jobNo === S.job.jobNo && !r.supersededBy && r.data.type === 'arcp' && r.data.rev; })[0];
    return d ? d.data.rev : CONFIG.ARCP_REV;
  }
  function outboxCount() { return RECS.filter(function (r) { return r.status !== 'sent'; }).length; }

  function jobDetails(extra) {
    var j = S.job, sup = person(j.supervisorId);
    var rows = [['Job number', j.jobNo], ['Site', j.street + ', ' + j.suburb], ['Class of work', 'Class ' + j.cls],
      ['Branch', j.branch || ''], ['Site Supervisor', sup ? sup.name : ''], ['Date', new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })]];
    return rows.concat(extra || []);
  }
  function fileName(rec, label, who) {
    return rec.date + ' ' + label + ' – ' + who + '.pdf';
  }
  function folderFor(j) {
    return CONFIG.JOB_FOLDER.replace('{library}', CONFIG.BRANCH_LIBRARY[j.branch] || ('TCL - ' + j.branch))
      .replace('{folderNo}', j.folderNo || j.jobNo).replace('{address}', j.street + ', ' + j.suburb);
  }

  async function saveRecord(rec) {
    var old = null;
    if (S.amend && S.amend.old.form === rec.form && !rec.id) { old = S.amend.old; applyAmend(rec, old, S.amend.reason); }
    rec.id = rec.id || uid();
    if (!rec.formRev && FORMS[rec.form]) rec.formRev = FORMS[rec.form].rev;   // the form version this record was filled in on
    rec.createdAt = rec.createdAt || Date.now();
    if (S.job && rec.jobNo === S.job.jobNo && S.job.id) rec.scheduleId = S.job.id;   // still matches if the Job No is added to the schedule later
    rec.updatedAt = Date.now();
    rec.date = rec.date || today();
    rec.gps = rec.gps || gpsNow();
    rec.arcpRev = arcpRev();
    rec.status = 'saved';
    rec.device = navigator.userAgent.slice(0, 120);
    if (rec.form === 'DOC') { await DB.put(rec); await refreshRecs(); sendOutbox(); return rec; }
    await DB.put(rec); // save the answers straight away; the PDF is added next (rebuilt later if the app closes first)
    if (old) { old.supersededBy = rec.id; old.supersededAt = Date.now(); await DB.put(old); }
    try {
      var doc = await PDF.build(rec);
      rec.pdf = doc.output('datauristring');
    } catch (e) { rec.pdf = null; rec.pdfError = String(e); }
    await DB.put(rec);
    if (old) { old.supersededBy = rec.id; old.supersededAt = Date.now(); await DB.put(old); S.amend = null; }
    await refreshRecs();
    sendOutbox();
    return rec;
  }
  /* New version of a record: the old one is kept (marked superseded) and the new PDF says what it replaces and why. */
  function applyAmend(rec, old, reason) {
    var n = (old.version || 1) + 1;
    rec.version = n; rec.supersedes = old.id; rec.rootId = old.rootId || old.id; rec.reason = reason;
    rec.date = old.date; rec.personId = old.personId;
    rec.amendedBy = S.me ? S.me.name : '';
    rec.formTitle = rec.formTitle + ' (version ' + n + ')';
    rec.details = (rec.details || []).concat([['Version', n + ' — replaces version ' + (old.version || 1) + ' (record ' + old.id + ')'],
      ['Reason for new version', reason], ['New version made by', rec.amendedBy + ', ' + new Date().toLocaleString('en-NZ')]]);
    rec.fileName = (old.fileName || rec.fileName).replace(/( v\d+)?\.pdf$/, ' v' + n + '.pdf');
  }

  /* ---------- sending ---------- */
  var sending = false;
  async function sendOutbox() {
    if (!CONFIG.API_URL || sending || !isOnline()) return;
    sending = true;
    try {
      var waiting = RECS.filter(function (r) { return r.status !== 'sent'; });
      for (var i = 0; i < waiting.length; i++) {
        var r = waiting[i];
        if (!r.pdf && r.form !== 'DOC') { try { r.pdf = (await PDF.build(r)).output('datauristring'); await DB.put(r); } catch (e) {} }
        var body = JSON.stringify({ action: 'submit', token: localStorage.getItem('tc.token') || '', record: stripForSend(r), pdf: r.pdf || r.file, fileName: r.fileName, folder: r.folder });
        var res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body });
        var j = await res.json();
        if (j && j.ok) { r.status = 'sent'; r.sentAt = Date.now(); r.filedTo = j.filedTo || ''; await DB.put(r); }
        else break;
      }
    } catch (e) { /* no signal or server down: try again later */ }
    sending = false;
    await refreshRecs();
    updateOutboxChip();
  }
  function stripForSend(r) { var o = {}; for (var k in r) if (k !== 'pdf' && k !== 'file') o[k] = r[k]; return o; }
  function registerSync() {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (reg) {
      if (reg.sync) reg.sync.register('tc-outbox').catch(function () {});
    });
  }
  window.addEventListener('online', function () { sendOutbox(); renderBanner(); });
  window.addEventListener('offline', renderBanner);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { getGps(); sendOutbox(); } });
  setInterval(sendOutbox, 60000);

  /* ---------- shared UI pieces ---------- */
  function top(title, sub, back) {
    return '<div class="top">' + (back ? '<div class="row"><button class="back" data-back aria-label="Back">←</button><div>' : '<div>') +
      (back ? '' : '<img class="logo" src="logo-white.png" alt="TechClean">') +
      '<h1>' + esc(title) + '</h1>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' + (back ? '</div>' : '') + '</div>' +
      '<div id="banner"></div>';
  }
  function bindBack() { $$('[data-back]').forEach(function (b) { b.onclick = function () { history.back(); }; }); }
  function renderBanner() {
    var b = document.getElementById('banner'); if (!b) return;
    var n = outboxCount();
    if (!isOnline()) b.innerHTML = '<div class="banner">📵 No signal — saving on your phone, sends later' + (n ? ' (' + n + ' waiting)' : '') + '</div>';
    else if (n && CONFIG.API_URL) b.innerHTML = '<div class="banner ok">⇪ Sending ' + n + ' record' + (n > 1 ? 's' : '') + '…</div>';
    else b.innerHTML = '';
  }
  function updateOutboxChip() { renderBanner(); var c = document.getElementById('outbox'); if (c) c.textContent = outboxLabel(); }
  function outboxLabel() {
    var n = outboxCount();
    if (!CONFIG.API_URL) return 'Demo mode — ' + RECS.filter(function (r) { return r.date === today(); }).length + ' records saved on this phone';
    return n ? n + ' waiting to send' : 'All records sent ✓';
  }
  function jobSub() { return S.job.street + ' · Class ' + S.job.cls; }

  /* Voice-to-text on a textarea (Android Chrome; elsewhere the keyboard mic works) */
  function bindVoice(scope) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    (scope || app).querySelectorAll('.voice').forEach(function (w) {
      var ta = w.querySelector('textarea'), mic = w.querySelector('.mic');
      if (!SR) { mic.classList.add('hidden'); return; }
      var rec = null;
      mic.onclick = function () {
        if (rec) { rec.stop(); return; }
        rec = new SR(); rec.lang = 'en-NZ'; rec.interimResults = false; rec.continuous = false;
        mic.classList.add('on');
        rec.onresult = function (e) { var t = e.results[0][0].transcript; ta.value = (ta.value ? ta.value + ' ' : '') + t; ta.dispatchEvent(new Event('input')); };
        rec.onend = function () { mic.classList.remove('on'); rec = null; };
        rec.onerror = function () { mic.classList.remove('on'); rec = null; toast('Couldn’t hear that — try again or type'); };
        rec.start();
      };
    });
  }
  function voiceBox(id, ph, val) {
    return '<div class="voice"><textarea id="' + id + '" placeholder="' + esc(ph) + '">' + esc(val || '') + '</textarea><button class="mic" type="button" aria-label="Speak">🎤</button></div>';
  }

  /* Evidence photos: live in-app camera only (no gallery), stamped with name, job, time and GPS. */
  function photoBox(id) { return '<div class="photo" id="' + id + '" role="button"><span>📷 Tap to take photo</span><input type="file" accept="image/*" capture="environment" class="hidden"></div>'; }
  function bindPhotos(box, list, onChange) {
    var input = box.querySelector('input');
    function draw() {
      var html = list.map(function (p, i) { return '<span style="position:relative;display:inline-block"><img src="' + p.img + '" alt=""><button type="button" data-rm="' + i + '" style="position:absolute;top:-6px;right:-6px;width:28px;height:28px;border-radius:50%;border:0;background:#111;color:#fff;font-weight:800">×</button></span>'; }).join('');
      box.querySelector('span').outerHTML = '<span>' + (html ? html + ' <b style="font-size:28px;vertical-align:middle">＋</b>' : '📷 Tap to take photo') + '</span>';
      box.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); list.splice(+b.getAttribute('data-rm'), 1); draw(); if (onChange) onChange(); }; });
    }
    box.onclick = function () {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        openCamera().then(function (d) { if (d) { list.push({ img: d, caption: 'Taken live ' + hm(Date.now()), live: true, at: Date.now() }); draw(); if (onChange) onChange(); } });
      } else input.click();   // very old phones: the camera via the system picker
    };
    input.onchange = function () {
      var f = input.files && input.files[0]; if (!f) return;
      shrink(f).then(function (d) { list.push({ img: d, caption: hm(Date.now()) }); draw(); input.value = ''; if (onChange) onChange(); });
    };
    draw();
  }
  function openCamera() {
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:20;display:flex;flex-direction:column';
      ov.innerHTML = '<video playsinline autoplay muted style="flex:1;width:100%;object-fit:contain;min-height:0"></video><div id="camerr" style="color:#fff;padding:8px 16px;font-weight:700"></div>' +
        '<div style="display:flex;gap:10px;padding:12px 14px calc(14px + env(safe-area-inset-bottom,0px))"><button class="btn sec" id="camx" style="flex:1">Cancel</button><button class="btn" id="camok" style="flex:2">📸 Take photo</button></div>';
      document.body.appendChild(ov);
      var v = ov.querySelector('video'), stream = null;
      function close(val) { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); ov.remove(); resolve(val); }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 } }, audio: false }).then(function (s) { stream = s; v.srcObject = s; v.play().catch(function () {}); })
        .catch(function () { ov.querySelector('#camerr').textContent = 'Camera blocked. Allow camera access for this app in your phone settings.'; });
      ov.querySelector('#camx').onclick = function () { close(null); };
      ov.querySelector('#camok').onclick = function () {
        if (!stream || !v.videoWidth) return;
        var c = document.createElement('canvas'), k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); stampPhoto(c, stampLines());
        close(c.toDataURL('image/jpeg', 0.75));
      };
    });
  }
  function shrink(file) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 1280, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* Live camera (fit for work face photo): no gallery uploads. The photo is stamped with name, job, time and GPS. */
  var camStream = null;
  function stopCam() { if (camStream) { camStream.getTracks().forEach(function (t) { t.stop(); }); camStream = null; } }
  function stampPhoto(canvas, lines) {
    var ctx = canvas.getContext('2d'), h = Math.round(canvas.height * 0.13), fs = Math.round(h / 3.2);
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, canvas.height - h, canvas.width, h);
    ctx.fillStyle = '#E8192C'; ctx.fillRect(0, canvas.height - h, canvas.width, Math.max(3, h * 0.05));
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + fs + 'px Arial, sans-serif';
    ctx.fillText(lines[0], fs * 0.6, canvas.height - h + fs * 1.35);
    ctx.font = fs * 0.85 + 'px Arial, sans-serif';
    ctx.fillText(lines[1], fs * 0.6, canvas.height - h + fs * 2.55);
  }
  function stampLines() {
    var g = gpsNow(), d = new Date();
    return [(worker() ? worker().name : 'Visitor') + ' · ' + (S.job ? S.job.jobNo + ' ' + S.job.street : ''),
      d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
      ' · ' + (g ? g.lat.toFixed(5) + ', ' + g.lng.toFixed(5) : 'GPS not available') + ' · live camera'];
  }
  function bindSelfie(a, onChange) {
    var v = $('#camv'), snap = $('#snap'), msg = $('#cammsg');
    function show() {
      var img = a.photos[0];
      $('#camimg').innerHTML = img ? '<img src="' + img.img + '" style="width:100%;border-radius:14px;display:block">' : '';
      v.classList.toggle('hidden', !!img); snap.textContent = img ? '↺ Retake' : '📸 Take photo';
    }
    function start() {
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { msg.textContent = 'This phone can\u2019t open the camera inside the app. Talk to your supervisor.'; snap.disabled = true; return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false }).then(function (s) {
        camStream = s; v.srcObject = s; v.play().catch(function () {}); msg.textContent = '';
      }).catch(function () { msg.textContent = 'Camera blocked. Allow camera access for this app in your phone settings, then try again.'; });
    }
    snap.onclick = function () {
      if (a.photos[0]) { a.photos.length = 0; a.v = null; show(); onChange(); if (!camStream) start(); return; }
      if (!camStream || !v.videoWidth) { toast('Camera not ready yet'); return; }
      var c = document.createElement('canvas'), k = Math.min(1, 1024 / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      stampPhoto(c, stampLines());
      a.photos.length = 0; a.photos.push({ img: c.toDataURL('image/jpeg', 0.8), caption: 'Taken live ' + hm(Date.now()), live: true, at: Date.now() });
      a.v = 'taken'; stopCam(); show(); onChange();
    };
    show(); if (!a.photos[0]) start();
  }

  /* Signature pad */
  function sigBox() { return '<div class="sigwrap"><canvas></canvas><button class="clear" type="button">Clear</button><div class="hint">Sign here with your finger</div></div>'; }
  function bindSig(wrap, onChange) {
    var c = wrap.querySelector('canvas'), ctx, drawing = false, empty = true, last = null;
    function size() {
      var r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr; c.height = r.height * dpr; ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    }
    size();
    function pt(e) { var r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    c.addEventListener('pointerdown', function (e) { drawing = true; last = pt(e); c.setPointerCapture(e.pointerId); wrap.querySelector('.hint').classList.add('hidden'); });
    c.addEventListener('pointermove', function (e) {
      if (!drawing) return; var p = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p;
      if (empty) { empty = false; if (onChange) onChange(); }
    });
    c.addEventListener('pointerup', function () { drawing = false; if (!empty && onChange) onChange(); });
    c.addEventListener('pointercancel', function () { drawing = false; });
    wrap.querySelector('.clear').onclick = function () { ctx.clearRect(0, 0, c.width, c.height); empty = true; wrap.querySelector('.hint').classList.remove('hidden'); if (onChange) onChange(); };
    return { isEmpty: function () { return empty; }, data: function () { return c.toDataURL('image/png'); } };
  }

  /* ---------- screens ---------- */
  function renderToday() {
    stopCam(); S.onBack = null; S.amend = null; S.atHome = true;
    if (!S.me) return S.qrJob ? renderQrNoPerson() : renderSetup();
    if (isMgr() && (!S.job || S.job.crewIds.indexOf(S.me.id) < 0)) return renderMgrToday();
    if (!S.job) {
      app.innerHTML = top('Kia ora ' + first(S.me.name), longDate()) +
        '<div class="body"><div class="card"><h2 style="margin:0 0 6px">No job for you today</h2><div class="small">If you think this is wrong, talk to your supervisor.</div></div>' + footLinks() + '</div>';
      renderBanner(); bindFootLinks(); return;
    }
    var j = S.job, sup = person(j.supervisorId), st = statusFor(S.me.id), isSup = S.me.id === j.supervisorId;
    S.seq = null; S.actAs = null;
    if (isSup && j.status === 'open') return renderSupToday();
    var h = top('Kia ora ' + first(S.me.name), longDate() + ' · start ' + j.start) + '<div class="body">';
    h += '<div class="card job"><h2>' + esc(j.street) + ', ' + esc(j.suburb) + '</h2><div class="meta"><span class="chip cls">Class ' + esc(j.cls) + '</span>' +
      esc(j.jobNo) + ' · Supervisor ' + esc(sup ? sup.name : '') + '</div></div>';

    if (S.notRostered && j.status === 'open') h += '<div class="banner warn">You’re not on today’s crew for this job. You can still sign on — it’s marked “not rostered” and ' + esc(first(sup ? sup.name : 'the supervisor')) + ' is told.</div>';
    if (j.status === 'hold') {
      h += '<div class="card"><div class="big">⏸️</div><h2 class="center" style="margin:0">On hold — start TBC</h2><p class="center small">Nothing to do on this job today.</p></div>' + tile('file', '📁', 'b', 'Site file', '');
    } else if (j.status === 'closed') {
      h += '<div class="card"><div class="big">🔒</div><h2 class="center" style="margin:0">Job closed</h2><p class="center small">Talk to your supervisor. Anything already filled in will still send.</p></div>' + tile('file', '📁', 'b', 'Site file (read only)', '');
    } else {
      var ffwPass = st.ffw && st.ffw.data.result === 'pass', ffwFail = st.ffw && st.ffw.data.result === 'fail';
      h += tile('ffw', '🧑‍🔧', 'g', 'Fit for work', ffwPass ? chip('done', 'Done ' + hm(st.ffw.createdAt)) : ffwFail ? chip('todo', 'Not fit — see supervisor') : chip('todo', 'To do'));
      var signedIn = st.d13 && st.d13.data.in, signedOut = st.d13 && st.d13.data.out;
      h += tile('d13', signedIn && !signedOut ? '🚪' : '✅', 'g', signedIn && !signedOut ? 'Sign off site' : 'Sign on to site',
        signedOut ? chip('done', 'Off ' + hm(st.d13.data.out)) : signedIn ? chip('done', 'On ' + hm(st.d13.data.in)) : ffwPass ? chip('todo', 'To do') : chip('lock', 'Fit check first'));
      if (isSup) {
        var d5 = mine('D5');
        h += tile('d5', '📋', 'r', 'Pre-start', d5 ? chip('done', 'Done ' + hm(d5.createdAt)) : chip('todo', 'To do'));
      }
      h += tile('d1', '✍️', 'y', 'Sign ARCP / SWMS', st.d1 ? chip('done', 'Signed') : chip('new', '1 new'));
      h += tile('d12', '⚠️', 'p', 'Report incident / hazard', '');
      if (!isSup && S.me.role === 'supervisor') h += tile('take', '🤝', 'y', 'Take over as supervisor', '');
      if (isSup) h += tile('forms', '🗂️', 'y', 'Job forms', chip('wait', 'D2–D11'));
      h += tile('file', '📁', 'b', 'Site file', chip('wait', onSiteNow().length + ' on site'));
      if (isSup) h += crewCard();
    }
    h += footLinks() + '</div>';
    app.innerHTML = h; renderBanner();
    $$('.tile').forEach(function (t) { t.onclick = function () { go(t.getAttribute('data-go')); }; });
    $$('[data-nudge]').forEach(function (b) { b.onclick = function () { nudge(b.getAttribute('data-nudge')); }; });
    bindFootLinks();
  }
  function tile(go, icon, col, text, chipHtml) {
    return '<button class="tile" data-go="' + go + '"><span class="ic ' + col + '">' + icon + '</span><span class="tx">' + esc(text) + '</span>' + chipHtml + '</button>';
  }
  function chip(cls, t) { return '<span class="chip ' + cls + '">' + esc(t) + '</span>'; }
  function crewCard() {
    var j = S.job, h = '<div class="card"><div class="lbl" style="margin-top:0">Crew today</div><div class="list">';
    j.crewIds.forEach(function (pid) {
      if (pid === S.me.id) return;
      var p = person(pid), st = statusFor(pid), c;
      if (st.ffw && st.ffw.data.result === 'fail') c = chip('todo', 'Not fit');
      else if (st.d13 && st.d13.data.in) c = chip('done', 'On ' + hm(st.d13.data.in));
      else if (st.ffw) c = chip('wait', 'Fit ✓ not on');
      else c = '<button class="chip todo" style="border:0" data-nudge="' + pid + '">Nudge</button>';
      h += '<div class="it"><span style="font-weight:700">' + esc(p.name) + '</span>' + c + '</div>';
    });
    return h + '</div><div class="small" style="margin-top:8px">Live crew status comes from the server once it’s connected. In the demo it shows what was done on this phone.</div></div>';
  }
  function nudge(pid) {
    var p = person(pid);
    if (!CONFIG.API_URL) { toast('Demo: reminder would go to ' + first(p.name)); return; }
    fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'nudge', token: localStorage.getItem('tc.token') || '', personId: pid, jobNo: S.job.jobNo }) })
      .then(function () { toast('Reminder sent to ' + first(p.name)); }).catch(function () { toast('No signal — try again soon'); });
  }
  function footLinks() {
    return '<div class="demo"><div class="small" id="outbox">' + esc(outboxLabel()) + '</div><button class="link" data-recs>Today’s records</button>' +
      (CONFIG.API_URL ? '' : '<button class="link" data-demo>Demo settings</button>') + '</div>';
  }
  function bindFootLinks() {
    var r = $('[data-recs]'); if (r) r.onclick = function () { enter(); renderRecords(); };
    var d = $('[data-demo]'); if (d) d.onclick = function () { enter(); renderDemo(); };
  }
  function go(what) {
    var st = statusFor(S.me.id);
    if (what === 'ffw') { enter(); startFlow('FFW'); }
    else if (what === 'd13') {
      if (!isMgr() && !(st.ffw && st.ffw.data.result === 'pass')) { enter(); renderNeedFfw(); return; }
      enter(); renderSignOn();
    }
    else if (what === 'd5') { enter(); startFlow('D5'); }
    else if (what === 'd1') { enter(); renderD1(); }
    else if (what === 'd12') { enter(); renderReport(); }
    else if (what === 'file') { enter(); renderSiteFile(); }
    else if (what === 'forms') { enter(); renderJobForms(); }
    else if (what === 'aud') { enter(); renderAudit(); }
    else if (what === 'add') { history.pushState({ v: 1 }, ''); renderAddDoc(function () { renderToday(); }); }
    else if (what === 'lib') { enter(); renderLibrary(); }
    else if (what === 'take') { enter(); renderHandover('in'); }
    else if (what === 'acts') { enter(); S.actsFrom = null; renderActions(); }
  }

  /* ---------- management: PM / Branch Manager / HSC / GM Ops on the job QR code or link ---------- */
  function renderMgrToday() {
    var j = S.job;
    if (!j) {   // opened the app without a job link: today's jobs in their branch
      var list = S.jobs.filter(function (x) { return S.me.role === 'admin' || S.me.role === 'hsc' || !x.branch || x.branch === S.me.branch; });
      var h0 = top('Kia ora ' + first(S.me.name), longDate() + ' · ' + roleName(S.me)) + '<div class="body"><div class="lbl" style="margin-top:0">Today’s jobs — tap one for a site visit or audit</div>';
      if (!list.length) h0 += '<div class="card"><div class="small">No jobs on today.</div></div>';
      list.forEach(function (x) {
        var sp = person(x.supervisorId);
        h0 += '<button class="card job" style="width:100%;text-align:left;border-top:0;border-right:0;border-bottom:0" data-j="' + esc(x.jobKey || x.jobNo) + '"><h2>' + esc(x.street) + (x.suburb ? ', ' + esc(x.suburb) : '') + '</h2><div class="meta"><span class="chip cls">Class ' + esc(x.cls) + '</span>' +
          esc(x.jobNo) + (sp ? ' · ' + esc(sp.name) : '') + (x.status === 'hold' ? ' · on hold' : x.status === 'closed' ? ' · closed' : '') + '</div></button>';
      });
      app.innerHTML = h0 + footLinks() + '</div>'; renderBanner(); bindFootLinks();
      $$('[data-j]').forEach(function (b) { b.onclick = function () { S.qrJob = b.getAttribute('data-j'); resolveJob(); history.replaceState(null, '', location.pathname + '?job=' + encodeURIComponent(S.qrJob)); renderToday(); }; });
      return;
    }
    var sup = person(j.supervisorId), st = statusFor(S.me.id), on = st.d13 && st.d13.data.in && !st.d13.data.out;
    var aud = RECS.filter(function (r) { return r.form === 'AUD' && r.jobNo === j.jobNo && !r.supersededBy; }).sort(function (x, y) { return y.createdAt - x.createdAt; })[0];
    var h = top('Kia ora ' + first(S.me.name), longDate() + ' · ' + roleName(S.me)) + '<div class="body">' +
      '<div class="card job"><h2>' + esc(j.street) + ', ' + esc(j.suburb) + '</h2><div class="meta"><span class="chip cls">Class ' + esc(j.cls) + '</span>' +
      esc(j.jobNo) + ' · Supervisor ' + esc(sup ? sup.name : '') + '</div></div>';
    h += formsNews();
    if (j.status === 'closed') h += '<div class="banner">Job closed — site file is read only.</div>';
    else if (j.status === 'hold') h += '<div class="banner">On hold — start TBC.</div>';
    if (j.status !== 'closed') {
      h += tile('d13', on ? '🚪' : '✅', 'g', on ? 'Sign off site' : 'Sign on — site visit', on ? chip('done', 'On ' + hm(st.d13.data.in)) : st.d13 && st.d13.data.out ? chip('done', 'Off ' + hm(st.d13.data.out)) : chip('todo', 'To do'));
      var ac = actCounts();
      h += tile('acts', '🛠️', 'y', 'Corrective actions', ac.overdue ? chip('todo', ac.overdue + ' overdue') : ac.awaiting ? chip('wait', ac.awaiting + ' to check') : ac.open ? chip('new', ac.open + ' open') : chip('done', ac.total ? 'All closed' : 'None'));
      h += tile('aud', '🔎', 'r', 'Site audit', aud ? chip('done', 'Last ' + (aud.date === today() ? hm(aud.createdAt) : certDate(aud.date))) : chip('new', 'Start'));
    }
    h += tile('file', '📁', 'b', 'Site file', chip('wait', onSiteNow().length + ' on site'));
    if (j.status !== 'closed') h += tile('add', '➕', 'g', 'Add to job', '<span class="small">documents, photos, permits</span>');
    h += tile('lib', '📚', 'y', 'SWMS library', chip('wait', jobSwms().length + ' on job'));
    if (j.status !== 'closed') {
      h += tile('d12', '⚠️', 'p', 'Report incident / hazard', '');
      h += tile('ffw', '🧑‍🔧', 'y', 'Fit for work', '<span class="small">only if entering the work area</span>');
    }
    h += '<p class="small center">Opened from the job’s QR code or link. ' + (S.jobs.length > 1 ? '<button class="link" id="other">Other jobs today</button>' : '') + '</p>';
    app.innerHTML = h + footLinks() + '</div>'; renderBanner(); bindFootLinks();
    $$('[data-go]').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-go')); }; });
    var o = $('#other'); if (o) o.onclick = function () { S.qrJob = null; S.job = null; history.replaceState(null, '', location.pathname); renderMgrToday(); };
    bindFormsNews();
  }

  /* ---------- Answers the app already has: filled in from records and certificates, shown to the supervisor and printed on the PDF ---------- */
  function weekRecs(form) { var from = addDays(-6); return live(form).filter(function (r) { return r.date >= from; }); }
  function crewCertRows(section) {
    var rows = [], cls = S.job.cls;
    S.job.crewIds.forEach(function (pid) {
      var p = person(pid); if (!p) return;
      var cl = certList(p), has = function (id) { return cl.filter(function (c) { return c.id === id && !c.expired; })[0]; };
      var lic = cls === 'A' ? (has('aclass') || has('supervise')) : (has('bclass') || has('aclass') || has('supervise'));
      var fts = cl.filter(function (c) { return (c.id === 'ffhalf' || c.id === 'fffull') && !c.expired; });
      var med = cl.filter(function (c) { return c.id === 'medical'; })[0];
      rows.push({ section: section, label: p.name + ' — licence / unit standard (Class ' + cls + ')', value: lic ? 'Yes — ' + lic.name : 'Not on record', flag: lic ? 'good' : 'bad' });
      rows.push({ section: section, label: p.name + ' — face fit test', value: fts.length ? fts.map(function (c) { return c.name.replace('Face fit test — ', '') + ' to ' + c.date; }).join(', ') : 'No current fit test — stop work', flag: fts.length ? 'good' : 'bad' });
      rows.push({ section: section, label: p.name + ' — health monitoring (asbestos medical)', value: med ? (med.expired ? 'Expired ' : 'Current to ') + med.date : 'Not on record', flag: med && !med.expired ? 'good' : 'bad' });
    });
    return rows;
  }
  function autoRows(F) {
    var c = F.code, sec = 'Filled in from the app’s records', rows = [];
    if (c === 'D2') {
      var issues = crewCertRows('x').filter(function (r) { return r.flag === 'bad'; });
      rows.push({ section: sec, label: 'Every crew member current on fit test, training for the class of work and health monitoring', value: issues.length ? issues.length + ' problem(s): ' + issues.map(function (r) { return r.label + ' ' + r.value; }).join('; ') : 'Yes — all current', flag: issues.length ? 'bad' : 'good' });
      rows.push({ section: sec, label: 'Clean-shaven as per face fit', value: 'Checked for each person on fit for work every day (live photo)', flag: '' });
      rows.push({ section: sec, label: 'Inductions, ARCP / SSSP signing and the toolbox talk', value: 'Recorded as their own steps in the job sequence (D4, D1, D5)', flag: '' });
      rows.push({ section: sec, label: 'Isolations, site plan, signage and barriers, boundaries, baseline air monitoring', value: 'Recorded on the set-up check (D6, set-up stage)', flag: '' });
    }
    if (c === 'D3') rows = crewCertRows('Site personnel register — from certificates');
    if (c === 'D6' && (F.a.stage || {}).v === 'setup') {
      var d7 = live('D7').filter(function (r) { var a = r.data.answers || {}; return ((a.retest || {}).v || (a.sres || {}).v) === 'pass'; })[0];
      rows.push({ section: sec, label: 'Smoke test passed and recorded on Form D7', value: S.job.cls !== 'A' ? 'N/A — Class B' : d7 ? 'Yes — passed ' + niceDate(d7.date) : 'No passed smoke test on record', flag: S.job.cls !== 'A' ? '' : d7 ? 'good' : 'bad' });
    }
    if (c === 'D8') {
      var days = {}; weekRecs('D13').forEach(function (r) { days[r.date] = 1; }); var worked = Object.keys(days).length;
      var unsigned = S.job.crewIds.filter(function (pid) { return !statusFor(pid).d1; }).map(function (pid) { return (person(pid) || {}).name; });
      rows.push({ section: sec, label: 'ARCP / SWMS signed by everyone on the crew (current revision)', value: unsigned.length ? 'Not signed: ' + unsigned.join(', ') : 'Yes', flag: unsigned.length ? 'bad' : 'good' });
      var noOut = weekRecs('D13').filter(function (r) { return r.date < today() && r.data.in && !r.data.out; }).length;
      rows.push({ section: sec, label: 'Sign in / out register complete this week', value: worked + ' day(s) worked' + (noOut ? ' — ' + noOut + ' sign-out(s) missing' : ' — complete'), flag: noOut ? 'bad' : 'good' });
      var d5 = weekRecs('D5'), d5days = {}; d5.forEach(function (r) { d5days[r.date] = 1; });
      rows.push({ section: sec, label: 'Daily pre-start done every day worked', value: Object.keys(d5days).length + ' of ' + worked + ' day(s)', flag: Object.keys(d5days).length >= worked ? 'good' : 'bad' });
      var faults = []; d5.forEach(function (r) { var a = r.data.answers || {}; ['enclok', 'vac', 'dcu', 'wet', 'tags', 'plant'].forEach(function (k) { if ((a[k] || {}).v === 'fault') faults.push(niceDate(r.date) + ' ' + k); }); if ((a.exit || {}).v === 'no') faults.push(niceDate(r.date) + ' exit not shown'); if ((a.air || {}).v === 'no') faults.push(niceDate(r.date) + ' air results not shared'); });
      rows.push({ section: sec, label: 'Daily checks this week — enclosure and pressure, test and tag, emergency exit, air results shared', value: faults.length ? faults.length + ' fault(s): ' + faults.join('; ') + ' — check each was closed out' : 'No faults recorded', flag: faults.length ? 'bad' : 'good' });
      if (S.job.cls === 'A') { var d6 = weekRecs('D6').filter(function (r) { return ((r.data.answers || {}).stage || {}).v === 'during'; }); rows.push({ section: sec, label: 'Enclosure and negative pressure checks logged (D6 during removal)', value: d6.length + ' this week for ' + worked + ' day(s) worked', flag: d6.length >= worked ? 'good' : 'bad' }); }
      var ffw = weekRecs('FFW'), fails = ffw.filter(function (r) { return r.data.result !== 'pass'; }).length;
      rows.push({ section: sec, label: 'Everyone clean-shaven as per face fit (fit for work, live photo)', value: ffw.length + ' check(s) this week' + (fails ? ' — ' + fails + ' failed (not allowed on)' : ' — all passed'), flag: fails ? 'bad' : 'good' });
    }
    return rows;
  }
  function autoCard(F) {
    var r = autoRows(F); if (!r.length) return '';
    return '<div class="card"><div class="lbl" style="margin-top:0">' + esc(r[0].section) + '</div><div class="list">' + r.map(function (x) {
      return '<div class="it"><span style="flex:1">' + esc(x.label) + '<br><span class="small">' + esc(x.value) + '</span></span>' + (x.flag === 'good' ? chip('done', '✓') : x.flag === 'bad' ? chip('todo', 'Check') : '') + '</div>';
    }).join('') + '</div><div class="small" style="margin-top:6px">Not asked again — taken from today’s records and the certificates. Anything marked Check needs sorting before you sign.</div></div>';
  }

  /* ---------- Site audit TC-QA-AUD-001 (management) ---------- */
  function audKey() { return 'tc.draft.AUD.' + S.job.jobNo + '.' + today() + '.' + S.me.id; }
  function audSave(AU) { var c = {}; for (var k in AU) if (k !== 'photos' && k !== 'sigImg') c[k] = AU[k]; try { localStorage.setItem(audKey(), JSON.stringify(c)); } catch (e) {} }
  function audItems(AU) {   // the items that apply to the class of work being audited
    var cls = AU.det.cls;
    return AUDIT.sections.map(function (s) { return { n: s.n, title: s.title, items: s.items.filter(function (it) { return cls === 'ACD' || it.cls === 'A+B' || it.cls === cls; }) }; });
  }
  /* What the app's own records say about an audit point — shown to the auditor as evidence, never answers it for them. */
  function audHint(id) {
    var docs = jobDocs(), doc = function (t) { return docs.filter(function (d) { return d.data.type === t; })[0]; };
    var crew = crewCertRows('x'), bad = function (word) { return crew.filter(function (r) { return r.flag === 'bad' && r.label.indexOf(word) >= 0; }).map(function (r) { return r.label.split(' — ')[0]; }); };
    var d5 = live('D5'), d7 = live('D7').filter(function (r) { var a = r.data.answers || {}; return ((a.retest || {}).v || (a.sres || {}).v) === 'pass'; })[0];
    var clr = live('D6').filter(function (r) { return ((r.data.answers || {}).c9 || {}).v === 'yes'; })[0];
    switch (id) {
      case '2.1': var sv = doc('survey'); return sv ? 'Survey in the site file: ' + sv.data.title : 'No survey uploaded to the site file';
      case '2.2': var ar = doc('arcp'); return ar ? 'ARCP in the site file' + (ar.data.rev ? ' — Rev ' + ar.data.rev : '') : 'No ARCP uploaded to the site file';
      case '2.5': var ws = doc('wsn'); return ws ? 'WorkSafe notification in the site file' : (S.job.worksafeNotification ? 'Schedule: notification ' + S.job.worksafeNotification : 'No notification on record');
      case '2.9': return d5.length + ' pre-start record(s) on this job, last ' + (d5[0] ? niceDate(d5[0].date) : '—');
      case '3.6': var t = bad('licence'); return t.length ? 'Training not on record: ' + t.join(', ') : 'Training on record for all crew';
      case '3.7': return 'Certificates are in the app — Site file › crew tickets';
      case '3.8': var m = bad('health'); return m.length ? 'Medical expired or missing: ' + m.join(', ') : 'Asbestos medicals current for all crew';
      case '5.2': return S.job.cls !== 'A' ? '' : d7 ? 'Smoke test passed ' + niceDate(d7.date) + ' (D7)' : 'No passed smoke test on record';
      case '7.2': var f = live('FFW').filter(function (r) { return r.date === today(); }); return f.length + ' fit for work check(s) today with clean-shaven photo';
      case '7.3': var ft = bad('face fit'); return ft.length ? 'No current fit test: ' + ft.join(', ') : 'Fit tests current for all crew';
      case '10.7': var d10 = live('D10'); return d10.length + ' waste load(s) recorded, ' + d10.filter(function (r) { return ((r.data.answers || {}).docket || {}).v; }).length + ' with docket numbers';
      case '12.6': return clr ? 'Clearance certificate recorded ' + niceDate(clr.date) + ' (D6)' : 'No clearance certificate recorded yet';
    }
    return '';
  }
  function audCrit(id) { return AUDIT.critical.indexOf(id) >= 0; }
  function addDays(n) { var d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  var SEV_DAYS = { Critical: 0, Major: 1, Minor: 7 };
  function audCounts(AU) {
    var c = 0, nc = 0, na = 0, crit = 0, maj = 0;
    audItems(AU).forEach(function (s) { s.items.forEach(function (it) { var a = AU.a[it.id] || {}; if (a.v === 'c') c++; else if (a.v === 'na') na++; else if (a.v === 'nc') { nc++; if (a.sev === 'Critical') crit++; else if (a.sev === 'Major') maj++; } }); });
    var total = 0; AUDIT.sections.forEach(function (s) { total += s.items.length; });
    var shown = 0; audItems(AU).forEach(function (s) { shown += s.items.length; });
    return { c: c, nc: nc, na: na, naClass: total - shown, crit: crit, maj: maj, pct: c + nc ? Math.round(c / (c + nc) * 100) : 100 };
  }
  function renderAudit() {
    getGps();
    var j = S.job, sup = person(j.supervisorId), AU = null;
    try { AU = JSON.parse(localStorage.getItem(audKey()) || 'null'); } catch (e) {}
    if (!AU) AU = { p: 0, start: Date.now(), det: { cls: j.cls === 'A' ? 'A' : 'B', type: '', client: j.client || '', notif: j.worksafeNotification || '', notifiedOn: '', workStart: j.startDate || '', scope: j.scope || '' }, a: {}, rating: '', positives: '', summary: '' };
    AU.photos = AU.photos || {};
    var SECS = function () { return audItems(AU); };
    var last = 1 + AUDIT.sections.length;   // pages: 0 details, 1..11 sections, last = result, last+1 = sign off
    function page() {
      var y = window.scrollY, sameP = page.lastP === AU.p; page.lastP = AU.p;
      S.onBack = AU.p > 0 ? function () { AU.p--; audSave(AU); page(); window.scrollTo(0, 0); } : null;
      var h = top('Site audit', j.street + ' · ' + j.jobNo, true) + '<div class="body"><div class="progress"><i style="width:' + Math.round(AU.p / (last + 1) * 100) + '%"></i></div>', ok = true;
      if (AU.p === 0) {
        h += '<div class="small">' + AUDIT.doc + ' Rev ' + AUDIT.rev + ' · ' + esc(AUDIT.title) + '</div><div class="lbl">Audit type</div><div class="chips">' +
          ['Announced', 'Unannounced', 'Follow-up'].map(function (t) { return '<button data-ty="' + t + '" class="' + (AU.det.type === t ? 'on' : '') + '">' + t + '</button>'; }).join('') + '</div>' +
          '<div class="lbl">Removal class</div><div class="chips">' + [['A', 'Class A (friable)'], ['B', 'Class B (non-friable)'], ['ACD', 'ACD']].map(function (t) { return '<button data-cl="' + t[0] + '" class="' + (AU.det.cls === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
          '<div class="lbl">Client / PCBU</div><input type="text" id="d-client" value="' + esc(AU.det.client) + '">' +
          '<div class="lbl">Scope of work — ACM type, location, quantity, method</div>' + voiceBox('d-scope', 'e.g. textured ceiling, lounge and hall, 60 m², wet scrape', AU.det.scope) +
          '<div class="lbl">WorkSafe notification no.</div><input type="text" id="d-notif" value="' + esc(AU.det.notif) + '">' +
          '<div class="lbl">Notified on</div><input type="date" id="d-non" value="' + esc(AU.det.notifiedOn) + '">' +
          '<div class="lbl">Work start date</div><input type="date" id="d-ws" value="' + esc(AU.det.workStart) + '">' +
          '<div class="card" style="margin-top:14px"><div class="small">Auto-filled: job ' + esc(j.jobNo) + ' · ' + esc(j.branch || '') + ' · supervisor ' + esc(sup ? sup.name : '') + ' · auditor ' + esc(S.me.name) + ' (' + esc(roleName(S.me)) + ') · on site from ' + hm(AU.start) +
          ' · workers on site now: ' + esc(onSiteNow().map(function (r) { return regName(r); }).join(', ') || 'none signed in') + '</div></div>';
        ok = !!AU.det.type;
      } else if (AU.p <= AUDIT.sections.length) {
        var sec = SECS()[AU.p - 1];
        h += '<div class="lbl" style="margin-top:0">Section ' + AU.p + ' of ' + AUDIT.sections.length + '</div><h2 style="margin:0 0 4px">' + sec.n + '. ' + esc(sec.title) + '</h2>' +
          '<p class="help">C = conforms · NC = non-conformance · N/A = not applicable to this job.' + (sec.items.length < AUDIT.sections[AU.p - 1].items.length ? ' Items for the other class are hidden.' : '') + '</p>';
        if (!sec.items.length) h += '<div class="card"><div class="small">Nothing in this section applies to Class ' + esc(AU.det.cls) + ' — tap Next.</div></div>';
        sec.items.forEach(function (it) {
          var a = AU.a[it.id] || {}, k = it.id.replace('.', '_');
          h += '<div class="card" id="it' + k + '"><div class="small"><b>' + it.id + '</b> · ' + it.cls + (audCrit(it.id) ? ' · <b style="color:#fca5a5">critical — stop-work trigger</b>' : '') + '</div><p style="margin:6px 0 0;font-size:17px">' + esc(it.q) + '</p>' + (audHint(it.id) ? '<div class="small" style="margin-top:6px;color:#d9f05a">📎 ' + esc(audHint(it.id)) + '</div>' : '') +
            '<div class="yn" style="margin-top:10px"><button data-a="' + it.id + '" data-v="c" class="good' + (a.v === 'c' ? ' on' : '') + '" style="min-height:60px">C</button><button data-a="' + it.id + '" data-v="nc" class="bad' + (a.v === 'nc' ? ' on' : '') + '" style="min-height:60px">NC</button><button data-a="' + it.id + '" data-v="na" class="na' + (a.v === 'na' ? ' on' : '') + '" style="min-height:60px">N/A</button></div>';
          if (it.unit) h += '<div class="lbl">Reading (' + it.unit + ')</div><input type="text" inputmode="decimal" data-rd="' + it.id + '" value="' + esc(a.read || '') + '">';
          if (a.v === 'nc') {
            h += '<div class="lbl">Non-conformance — what’s wrong (required)</div>' + voiceBox('n' + k, 'What you found', a.note) +
              '<div class="lbl">Severity</div><div class="chips">' + ['Critical', 'Major', 'Minor'].map(function (sv) { return '<button data-sv="' + it.id + '" data-s="' + sv + '" class="' + (a.sev === sv ? 'on' : '') + '"' + (audCrit(it.id) && sv !== 'Critical' ? ' disabled' : '') + '>' + sv + '</button>'; }).join('') + '</div>' +
              '<div class="lbl">Corrective action required</div>' + voiceBox('x' + k, 'What has to be done', a.action) +
              '<div class="lbl">Responsible</div><input type="text" data-who="' + it.id + '" value="' + esc(a.who || '') + '">' +
              '<div class="lbl">Due</div><input type="date" data-due="' + it.id + '" value="' + esc(a.due || '') + '">' +
              '<div class="lbl">Photo (recommended)</div>' + photoBox('p' + k);
            if (!(a.note || '').trim()) ok = false;
          }
          h += '</div>';
          if (!a.v) ok = false;
        });
      } else if (AU.p === last) {
        var c = audCounts(AU), sug = c.crit ? 'stop' : c.maj ? 'major' : c.nc ? 'minor' : 'ok';
        if (!AU.rating) AU.rating = sug;
        h += '<h2 style="margin:0 0 8px">13. Audit result</h2><div class="card"><div class="list">' +
          [['Conforms', c.c], ['Non-conformances', c.nc], ['Not applicable', c.na + (c.naClass ? ' (+' + c.naClass + ' other class)' : '')], ['Critical NCs', c.crit], ['Conformance %', c.pct + '%']].map(function (r) { return '<div class="it"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') +
          '</div><div class="small" style="margin-top:8px">Conformance % = conforms ÷ (conforms + non-conformances). Any critical non-conformance fails the audit regardless of score.</div></div>';
        if (c.crit) h += '<div class="stop" style="margin:12px 0"><h2>STOP WORK</h2>Critical non-conformance. Halt work now and notify the Branch Manager and GM Operations immediately. Saving this audit alerts them.</div>';
        h += '<div class="lbl">Overall rating</div><div class="chips">' + AUDIT.ratings.map(function (r) { return '<button data-rt="' + r[0] + '" class="' + (AU.rating === r[0] ? 'on' : '') + '">' + r[1] + '</button>'; }).join('') + '</div>' +
          (c.crit ? '<div class="small" style="margin-top:6px">Audit FAILED — critical non-conformance.</div>' : '') +
          '<div class="lbl">Positives observed</div>' + voiceBox('pos', 'What’s going well', AU.positives) +
          '<div class="lbl">Auditor summary</div>' + voiceBox('sum', 'Summary for the branch', AU.summary);
        var acts = audActions(AU);
        h += '<div class="lbl">14. Corrective actions (' + acts.length + ')</div>';
        if (!acts.length) h += '<div class="card"><div class="small">No non-conformances — no actions.</div></div>';
        acts.forEach(function (x, i) { h += '<div class="card"><div class="small"><b>' + (i + 1) + '. Item ' + x.id + '</b> · ' + x.sev + ' · due ' + (x.due ? certDate(x.due) : '—') + ' · ' + esc(x.who || 'responsible not set') + '</div><div>' + esc(x.note) + (x.action ? '<br><i>' + esc(x.action) + '</i>' : '') + '</div></div>'; });
        ok = !!AU.rating;
      } else {
        h += '<h2 style="margin:0 0 8px">15. Sign-off</h2><div class="lbl">Auditor — ' + esc(S.me.name) + ', ' + esc(roleName(S.me)) + '</div>' + sigBox() +
          '<div class="lbl">Site supervisor — findings received' + (sup ? ' (' + esc(sup.name) + ')' : '') + '</div><div class="chips" style="margin-bottom:8px"><button id="noSup" class="' + (AU.supAbsent ? 'on' : '') + '">Supervisor not on site</button></div>' +
          (AU.supAbsent ? '' : '<div id="sup2">' + sigBox() + '</div>') +
          '<p class="small">Branch Manager (actions accepted)' + (audCounts(AU).crit ? ' and GM Operations (critical NC review)' : '') + ' sign off later — the audit shows as pending for them.</p>';
        ok = false;
      }
      var isLast = AU.p === last + 1;
      h += '</div><div class="foot"><button class="btn" id="nx"' + (ok ? '' : ' disabled') + '>' + (isLast ? 'Save audit' : 'Next →') + '</button></div>';
      app.innerHTML = h; bindBack(); renderBanner(); bindVoice();
      if (sameP) window.scrollTo(0, y);
      var nx = $('#nx');
      function recheck() { page(); }
      // details
      $$('[data-ty]').forEach(function (b) { b.onclick = function () { AU.det.type = b.getAttribute('data-ty'); audSave(AU); recheck(); }; });
      $$('[data-cl]').forEach(function (b) { b.onclick = function () { AU.det.cls = b.getAttribute('data-cl'); audSave(AU); recheck(); }; });
      [['d-client', 'client'], ['d-scope', 'scope'], ['d-notif', 'notif'], ['d-non', 'notifiedOn'], ['d-ws', 'workStart']].forEach(function (f) { var el = $('#' + f[0]); if (el) el.oninput = el.onchange = function () { AU.det[f[1]] = el.value; audSave(AU); }; });
      // items
      $$('[data-a]').forEach(function (b) { b.onclick = function () {
        var id = b.getAttribute('data-a'), a = AU.a[id] = AU.a[id] || {}; a.v = b.getAttribute('data-v');
        if (a.v === 'nc' && !a.sev) { a.sev = audCrit(id) ? 'Critical' : 'Minor'; a.due = a.due || addDays(SEV_DAYS[a.sev]); a.who = a.who || (sup ? sup.name : ''); }
        audSave(AU); recheck();
      }; });
      $$('[data-sv]').forEach(function (b) { b.onclick = function () { var a = AU.a[b.getAttribute('data-sv')]; a.sev = b.getAttribute('data-s'); a.due = addDays(SEV_DAYS[a.sev]); audSave(AU); recheck(); }; });
      $$('[data-rd]').forEach(function (el) { el.oninput = function () { var a = AU.a[el.getAttribute('data-rd')] = AU.a[el.getAttribute('data-rd')] || {}; a.read = el.value; audSave(AU); }; });
      $$('[data-who]').forEach(function (el) { el.oninput = function () { AU.a[el.getAttribute('data-who')].who = el.value; audSave(AU); }; });
      $$('[data-due]').forEach(function (el) { el.onchange = function () { AU.a[el.getAttribute('data-due')].due = el.value; audSave(AU); }; });
      if (AU.p >= 1 && AU.p <= AUDIT.sections.length) SECS()[AU.p - 1].items.forEach(function (it) {
        var a = AU.a[it.id]; if (!a || a.v !== 'nc') return;
        var k = it.id.replace('.', '_'), n = $('#n' + k), x = $('#x' + k);
        n.oninput = function () { a.note = n.value; audSave(AU); var all = SECS()[AU.p - 1].items.every(function (i2) { var q = AU.a[i2.id]; return q && q.v && (q.v !== 'nc' || (q.note || '').trim()); }); nx.disabled = !all; };
        x.oninput = function () { a.action = x.value; audSave(AU); };
        AU.photos[it.id] = AU.photos[it.id] || [];
        bindPhotos($('#p' + k), AU.photos[it.id], function () { AU.photos[it.id].forEach(function (ph) { ph.caption = 'Item ' + it.id + ' — ' + (a.note || ''); }); });
      });
      // result
      $$('[data-rt]').forEach(function (b) { b.onclick = function () { AU.rating = b.getAttribute('data-rt'); audSave(AU); recheck(); }; });
      var pos = $('#pos'), sum = $('#sum');
      if (pos) pos.oninput = function () { AU.positives = pos.value; audSave(AU); };
      if (sum) sum.oninput = function () { AU.summary = sum.value; audSave(AU); };
      // sign-off
      var s1 = null, s2 = null;
      if (isLast) {
        var wraps = $$('.sigwrap');
        var chk = function () { nx.disabled = !(s1 && !s1.isEmpty() && (AU.supAbsent || (s2 && !s2.isEmpty()))); };
        s1 = bindSig(wraps[0], chk); if (wraps[1]) s2 = bindSig(wraps[1], chk);
        $('#noSup').onclick = function () { AU.supAbsent = !AU.supAbsent; audSave(AU); recheck(); };
      }
      nx.onclick = async function () {
        if (!isLast) { AU.p++; audSave(AU); history.pushState({ v: 1 }, ''); page(); window.scrollTo(0, 0); return; }
        nx.disabled = true;
        var rec = await saveAudit(AU, s1.data(), s2 && !AU.supAbsent ? s2.data() : null);
        localStorage.removeItem(audKey());
        history.replaceState({ v: 1 }, ''); S.onBack = null;
        var cc = audCounts(AU);
        app.innerHTML = top('Audit saved', j.street) + '<div class="body"><div class="card center"><div class="big">' + (cc.crit ? '🛑' : '✅') + '</div><h2 style="margin:0">' +
          (cc.crit ? 'STOP WORK — Branch Manager and GM Ops alerted' : cc.nc ? cc.nc + ' corrective action' + (cc.nc > 1 ? 's' : '') + ' raised' : 'Compliant — no actions') + '</h2>' +
          '<p class="small">' + cc.pct + '% conformance · ' + (isOnline() && CONFIG.API_URL ? 'filed to the job’s H&S folder' : 'saved — files when there’s signal') + '</p></div></div>' +
          '<div class="foot"><button class="btn" id="pdf">View PDF</button><button class="btn sec" id="home">Back to today</button></div>';
        renderBanner(); $('#home').onclick = function () { renderToday(); }; $('#pdf').onclick = function () { openPdf(rec); };
      };
    }
    page();
  }
  function audActions(AU) {
    var out = [];
    audItems(AU).forEach(function (s) { s.items.forEach(function (it) { var a = AU.a[it.id]; if (a && a.v === 'nc') out.push({ id: it.id, note: a.note || '', action: a.action || '', who: a.who || '', sev: a.sev || 'Minor', due: a.due || '' }); }); });
    return out;
  }
  async function saveAudit(AU, auditorSig, supSig) {
    var j = S.job, sup = person(j.supervisorId), c = audCounts(AU), acts = audActions(AU), rows = [], photos = [];
    var rl = AUDIT.ratings.filter(function (r) { return r[0] === AU.rating; })[0];
    audItems(AU).forEach(function (s) {
      s.items.forEach(function (it) {
        var a = AU.a[it.id] || {};
        rows.push({ section: s.n + ' ' + s.title, label: it.id + '  ' + it.q + (audCrit(it.id) ? ' (critical)' : ''),
          value: (a.v === 'c' ? 'C' : a.v === 'nc' ? 'NC — ' + (a.sev || '') + ': ' + (a.note || '') : 'N/A') + (a.read ? ' · reading ' + a.read + ' ' + it.unit : ''), flag: a.v === 'c' ? 'good' : a.v === 'nc' ? 'bad' : '' });
        (AU.photos[it.id] || []).forEach(function (ph) { photos.push({ img: ph.img, caption: 'Item ' + it.id + ' — ' + (a.note || '') }); });
      });
    });
    if (c.naClass) rows.push({ section: 'Items not applicable to this class', label: c.naClass + ' item' + (c.naClass > 1 ? 's' : '') + ' for the other class of work', value: 'N/A', flag: '' });
    rows.push({ section: '13 Audit result', label: 'Conforms', value: String(c.c), flag: '' }, { section: '13 Audit result', label: 'Non-conformances', value: String(c.nc), flag: c.nc ? 'bad' : '' },
      { section: '13 Audit result', label: 'Not applicable', value: String(c.na + c.naClass), flag: '' }, { section: '13 Audit result', label: 'Critical NCs', value: String(c.crit), flag: c.crit ? 'bad' : '' },
      { section: '13 Audit result', label: 'Conformance %', value: c.pct + '%' + (c.crit ? ' — FAILED (critical NC)' : ''), flag: c.crit ? 'bad' : 'good' },
      { section: '13 Audit result', label: 'Overall rating', value: rl ? rl[1] : '', flag: AU.rating === 'ok' ? 'good' : 'bad' });
    if (AU.positives) rows.push({ section: '13 Audit result', label: 'Positives observed', value: AU.positives, flag: '' });
    if (AU.summary) rows.push({ section: '13 Audit result', label: 'Auditor summary', value: AU.summary, flag: '' });
    acts.forEach(function (x, i) { rows.push({ section: '14 Corrective action register', label: (i + 1) + '. Item ' + x.id + ' — ' + x.note + (x.action ? ' — Action: ' + x.action : ''), value: x.sev + ' · ' + (x.who || '—') + ' · due ' + (x.due || '—') + ' · open', flag: 'bad' }); });
    rows.push({ section: '15 Sign-off', label: 'Site supervisor — findings received', value: AU.supAbsent ? 'Supervisor not on site — to be given the findings' : 'Signed', flag: '' },
      { section: '15 Sign-off', label: 'Branch Manager — actions accepted', value: 'Pending', flag: '' });
    if (c.crit) rows.push({ section: '15 Sign-off', label: 'GM Operations — review (critical NC)', value: 'Pending', flag: '' });
    var sigs = [{ name: S.me.name, label: 'Auditor — ' + roleName(S.me), time: Date.now(), img: auditorSig }];
    if (supSig) sigs.push({ name: sup ? sup.name : 'Site supervisor', label: 'Site supervisor — findings received', time: Date.now(), img: supSig });
    var det = AU.det;
    var rec = { form: 'AUD', formTitle: 'Asbestos site audit — ' + det.type + (c.crit ? ' — STOP WORK' : ''), formRef: AUDIT.doc + ' Rev ' + AUDIT.rev + ' — ' + AUDIT.title, jobNo: j.jobNo, personId: S.me.id,
      data: { det: det, answers: AU.a, rating: AU.rating, counts: c, actions: acts, positives: AU.positives, summary: AU.summary, supAbsent: !!AU.supAbsent },
      details: jobDetails([['Client / PCBU', det.client || '—'], ['Time on site', hm(AU.start) + ' – ' + hm(Date.now())], ['Workers on site', onSiteNow().map(regName).join(', ') || '—'],
        ['Auditor', S.me.name + ', ' + roleName(S.me)], ['Audit type', det.type], ['Removal class', det.cls === 'ACD' ? 'ACD' : 'Class ' + det.cls], ['Scope of work', det.scope || '—'],
        ['WorkSafe notif. no.', det.notif || '—'], ['Notified on', det.notifiedOn || '—'], ['Work start date', det.workStart || '—'], ['Class A licence', AUDIT.licence]]).filter(function (r) { return r[0] !== 'Class of work'; }),
      rows: rows, photos: photos, sigs: sigs, alert: c.crit > 0 || AU.rating === 'stop' };
    rec.fileName = fileName({ date: today() }, 'Site audit' + (c.crit ? ' – STOP WORK' : ''), S.me.name); rec.folder = folderFor(j);
    await saveRecord(rec);
    return rec;
  }

  /* ---------- "Forms updated" note for supervisors and managers ---------- */
  function formsNews() {
    var seen = null; try { seen = JSON.parse(localStorage.getItem('tc.formRevs') || 'null'); } catch (e) {}
    var now = {}; Object.keys(FORMS).forEach(function (c) { now[c] = FORMS[c].rev; });
    if (!seen) { try { localStorage.setItem('tc.formRevs', JSON.stringify(now)); } catch (e) {} return ''; }   // first use: nothing to announce
    var changed = FORM_LOG.filter(function (x) { return seen[x.code] !== now[x.code] && now[x.code] === x.rev; });
    if (!changed.length) return '';
    return '<div class="card" id="fnews"><div class="lbl" style="margin-top:0">📝 Forms updated</div>' + changed.map(function (x) {
      return '<div style="margin-bottom:8px"><b>' + esc((FORMS[x.code].short || x.code) + ' — ' + (x.code.charAt(0) === 'D' ? 'Form ' + x.code + ' ' : '') + 'Rev ' + x.rev) + '</b><br><span class="small">' + esc(x.what) + '</span></div>';
    }).join('') + '<button class="btn sec" id="fnok" style="min-height:48px;font-size:17px;padding:10px">Got it</button></div>';
  }
  function bindFormsNews() { var b = $('#fnok'); if (b) b.onclick = function () { var now = {}; Object.keys(FORMS).forEach(function (c) { now[c] = FORMS[c].rev; }); try { localStorage.setItem('tc.formRevs', JSON.stringify(now)); } catch (e) {} var c = $('#fnews'); if (c) c.remove(); }; }

  /* ---------- Corrective actions: register, follow-up and close-out ---------- */
  function allActions() {
    var out = [];
    jobRecs(['AUD']).filter(function (r) { return !r.supersededBy; }).forEach(function (r) {
      (r.data.actions || []).forEach(function (x) {
        out.push({ key: r.id + ':' + x.id, src: 'Site audit ' + niceDate(r.date) + ' — item ' + x.id, item: x.id, finding: x.note, action: x.action, who: x.who, sev: x.sev, due: x.due,
          raisedBy: (person(r.personId) || {}).name || '', raisedAt: r.createdAt, photos: (r.photos || []).filter(function (p) { return (p.caption || '').indexOf('Item ' + x.id + ' ') === 0; }), recId: r.id });
      });
    });
    jobRecs(['CAR']).filter(function (r) { return !r.supersededBy; }).forEach(function (r) {
      var d = r.data;
      out.push({ key: r.id, src: d.source + (d.ref ? ' — ' + d.ref : ''), item: '', finding: d.finding, action: d.action, who: d.who, sev: d.sev, due: d.due,
        raisedBy: (person(r.personId) || {}).name || '', raisedAt: r.createdAt, photos: r.photos || [], recId: r.id });
    });
    out.forEach(function (a) { actState(a); });
    var rank = { overdue: 0, open: 1, escalated: 1, progress: 2, awaiting: 3, closed: 4 };
    return out.sort(function (x, y) { return (rank[x.state] - rank[y.state]) || ((x.due || '') > (y.due || '') ? 1 : -1); });
  }
  function actState(a) {
    var fus = jobRecs(['CAF']).filter(function (r) { return r.data.key === a.key && !r.supersededBy; }).sort(function (x, y) { return x.createdAt - y.createdAt; });
    var st = 'open', due = a.due;
    fus.forEach(function (r) {
      var d = r.data;
      if (d.kind === 'verify') st = d.verify === 'accept' ? 'closed' : 'open';
      else if (d.status === 'fixed') st = d.verified ? 'closed' : 'awaiting';
      else if (d.status === 'progress') { st = 'progress'; if (d.newDue) due = d.newDue; }
      else if (d.status === 'escalate') st = 'escalated';
    });
    if ((st === 'open' || st === 'progress' || st === 'escalated') && due && due < today()) st = 'overdue';
    a.state = st; a.curDue = due; a.history = fus; return a;
  }
  function actCounts() {
    var l = allActions(), c = { total: l.length, open: 0, overdue: 0, awaiting: 0, closed: 0 };
    l.forEach(function (a) { if (a.state === 'closed') c.closed++; else if (a.state === 'awaiting') c.awaiting++; else { c.open++; if (a.state === 'overdue') c.overdue++; } });
    return c;
  }
  var ACT_CHIP = { overdue: ['todo', 'Overdue'], open: ['new', 'Open'], escalated: ['todo', 'Escalated'], progress: ['wait', 'In progress'], awaiting: ['wait', 'Awaiting check'], closed: ['done', 'Closed'] };
  function canAct() { return (isSup() || isMgr()) && S.job; }
  function renderActions() {
    var l = allActions(), c = actCounts();
    S.onBack = S.actsFrom === 'file' ? function () { renderSiteFile(); } : null;
    var h = top('Corrective actions', S.job.street + ' · ' + S.job.jobNo, true) + '<div class="body">' +
      '<p class="help">' + c.open + ' open' + (c.overdue ? ' (' + c.overdue + ' overdue)' : '') + ' · ' + c.awaiting + ' awaiting a manager’s check · ' + c.closed + ' closed</p>';
    if (!l.length) h += '<div class="card"><div class="small">No corrective actions on this job. They’re raised from site audits, or below.</div></div>';
    l.forEach(function (a) {
      var ch = ACT_CHIP[a.state];
      h += '<button class="card" style="width:100%;text-align:left;border:0" data-ak="' + esc(a.key) + '"><div class="it" style="border:0;padding:0"><span class="small"><b>' + esc(a.sev || '') + '</b> · ' + esc(a.src) + '</span>' + chip(ch[0], ch[1]) + '</div>' +
        '<div style="margin-top:6px;font-weight:700">' + esc(a.finding || '') + '</div><div class="small">' + esc(a.who || 'No one assigned') + ' · due ' + (a.curDue ? certDate(a.curDue) : '—') + '</div></button>';
    });
    h += '</div>' + (canAct() && S.job.status !== 'closed' ? '<div class="foot"><button class="btn sec" id="raise">＋ Raise an action</button></div>' : '');
    app.innerHTML = h; bindBack(); renderBanner();
    $$('[data-ak]').forEach(function (b) { b.onclick = function () { enter(); renderAction(b.getAttribute('data-ak')); }; });
    var r = $('#raise'); if (r) r.onclick = function () { enter(function () { renderActions(); }); renderRaise(); };
  }
  function actByKey(k) { return allActions().filter(function (a) { return a.key === k; })[0]; }
  function renderAction(k) {
    var a = actByKey(k), ch = ACT_CHIP[a.state];
    S.onBack = function () { renderActions(); };
    var h = top('Corrective action', S.job.street + ' · ' + S.job.jobNo, true) + '<div class="body"><div class="card"><div class="it" style="border:0;padding:0"><span class="small"><b>' + esc(a.sev || '') + '</b> · ' + esc(a.src) + '</span>' + chip(ch[0], ch[1]) + '</div>' +
      '<h2 style="margin:8px 0 4px">' + esc(a.finding || '') + '</h2>' + (a.action ? '<div><b>Action required:</b> ' + esc(a.action) + '</div>' : '') +
      '<div class="small" style="margin-top:6px">Responsible: ' + esc(a.who || '—') + ' · due ' + (a.curDue ? certDate(a.curDue) : '—') + (a.curDue !== a.due && a.due ? ' (was ' + certDate(a.due) + ')' : '') + ' · raised by ' + esc(a.raisedBy) + '</div>' +
      (a.sev === 'Critical' && a.state !== 'closed' ? '<div class="stop" style="margin-top:10px;padding:12px">Critical — work on this stays stopped until the fix is checked and closed by a manager.</div>' : '') +
      (a.photos.length ? '<div class="thumbs" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' + a.photos.map(function (p) { return '<img src="' + p.img + '" style="width:31%;border-radius:10px">'; }).join('') + '</div>' : '') + '</div>';
    h += '<div class="lbl">Follow-up history</div>';
    if (!a.history.length) h += '<div class="card"><div class="small">Nothing recorded yet.</div></div>';
    a.history.forEach(function (r) {
      var d = r.data, who = (person(r.personId) || {}).name || '';
      var what = d.kind === 'verify' ? (d.verify === 'accept' ? '✅ Checked and closed' : '↩️ Not accepted — reopened') : d.status === 'fixed' ? (d.verified ? '✅ Fixed — checked and closed' : '🛠️ Fixed — sent for a manager\u2019s check') : d.status === 'progress' ? '⏳ In progress' + (d.newDue ? ' — new due ' + certDate(d.newDue) : '') : '⚠️ Can’t fix on site — escalated';
      h += '<button class="card" style="width:100%;text-align:left;border:0" data-rec="' + r.id + '"><div><b>' + what + '</b></div><div class="small">' + esc(who) + ' · ' + niceDate(r.date) + ' ' + hm(r.createdAt) + '</div>' + (d.note ? '<div>' + esc(d.note) + '</div>' : '') + '</button>';
    });
    var btns = '';
    if (canAct() && a.state !== 'closed' && a.state !== 'awaiting') btns += '<button class="btn" id="fu">Record follow-up</button>';
    if (isMgr() && a.state === 'awaiting') btns += '<button class="btn" id="vf">Check the fix</button>';
    h += '</div>' + (btns ? '<div class="foot">' + btns + '</div>' : '');
    app.innerHTML = h; bindBack(); renderBanner();
    var back = function () { renderAction(k); };
    $$('[data-rec]').forEach(function (b) { b.onclick = function () { openPdf(recById(b.getAttribute('data-rec'))); }; });
    var fu = $('#fu'); if (fu) fu.onclick = function () { enter(back); renderFollowUp(a); };
    var vf = $('#vf'); if (vf) vf.onclick = function () { enter(back); renderVerify(a); };
  }
  function actRows(a) {
    return [{ section: 'Corrective action', label: 'Raised from', value: a.src, flag: '' }, { section: 'Corrective action', label: 'Non-conformance / finding', value: a.finding || '', flag: 'bad' },
      { section: 'Corrective action', label: 'Action required', value: a.action || '—', flag: '' }, { section: 'Corrective action', label: 'Severity', value: a.sev || '', flag: a.sev === 'Critical' ? 'bad' : '' },
      { section: 'Corrective action', label: 'Responsible', value: a.who || '—', flag: '' }, { section: 'Corrective action', label: 'Due', value: a.curDue || a.due || '—', flag: a.state === 'overdue' ? 'bad' : '' }];
  }
  function renderFollowUp(a) {
    getGps();
    var F = { status: null, photos: [] }, mgr = isMgr();
    var h = top('Follow-up', (a.item ? 'Item ' + a.item + ' · ' : '') + S.job.jobNo, true) + '<div class="body"><div class="card"><div class="small">' + esc(a.sev || '') + ' · due ' + (a.curDue ? certDate(a.curDue) : '—') + '</div><b>' + esc(a.finding || '') + '</b>' + (a.action ? '<div class="small">Action: ' + esc(a.action) + '</div>' : '') + '</div>' +
      '<div class="lbl">Where is it at?</div><div class="chips" id="st"><button data-s="fixed">✅ Fixed</button><button data-s="progress">⏳ In progress</button><button data-s="escalate">⚠️ Can’t fix on site</button></div>' +
      '<div class="lbl">What was done (required)</div>' + voiceBox('note', 'Tap the mic to speak, or type…') +
      '<div id="phw" class="hidden"><div class="lbl">Photo of the fix — required</div>' + photoBox('ph') + '</div>' +
      '<div id="ndw" class="hidden"><div class="lbl">New due date</div><input type="date" id="nd" value="' + esc(a.curDue || '') + '"></div>' +
      (mgr ? '<div id="vw" class="hidden"><div class="chips" style="margin-top:12px"><button id="ver">I’ve checked it myself — close it</button></div></div>' : '') +
      '<div class="lbl">Sign</div>' + sigBox() + '</div><div class="foot"><button class="btn" id="go" disabled>Save follow-up</button></div>';
    app.innerHTML = h; bindBack(); renderBanner(); bindVoice();
    var go = $('#go'), sig = bindSig($('.sigwrap'), chk);
    function chk() { go.disabled = !(F.status && ($('#note').value || '').trim() && (F.status !== 'fixed' || F.photos.length) && !sig.isEmpty()); }
    bindPhotos($('#ph'), F.photos, chk); $('#note').oninput = chk;
    $$('[data-s]').forEach(function (b) { b.onclick = function () {
      F.status = b.getAttribute('data-s'); $$('[data-s]').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#phw').classList.toggle('hidden', F.status !== 'fixed'); $('#ndw').classList.toggle('hidden', F.status !== 'progress'); if ($('#vw')) $('#vw').classList.toggle('hidden', F.status !== 'fixed'); chk();
    }; });
    var ver = $('#ver'); if (ver) ver.onclick = function () { F.verified = !F.verified; ver.classList.toggle('on', F.verified); };
    go.onclick = async function () {
      go.disabled = true;
      var lbl = F.status === 'fixed' ? (F.verified ? 'Fixed — checked and closed' : 'Fixed — awaiting a manager’s check') : F.status === 'progress' ? 'In progress' : 'Can’t fix on site — escalated';
      var rows = actRows(a).concat([{ section: 'Follow-up', label: 'Status', value: lbl, flag: F.status === 'fixed' ? 'good' : F.status === 'escalate' ? 'bad' : '' },
        { section: 'Follow-up', label: 'What was done', value: $('#note').value, flag: '' }]);
      if (F.status === 'progress' && $('#nd').value) rows.push({ section: 'Follow-up', label: 'New due date', value: $('#nd').value, flag: '' });
      if (F.verified) rows.push({ section: 'Close-out', label: 'Checked and closed by', value: S.me.name + ', ' + roleName(S.me) + (a.sev === 'Critical' ? ' — stop work can be lifted' : ''), flag: 'good' });
      var rec = { form: 'CAF', formTitle: 'Corrective action follow-up — ' + (a.item ? 'item ' + a.item : (a.finding || '').slice(0, 40)), formRef: FORMS.CAF.ref, jobNo: S.job.jobNo, personId: S.me.id,
        data: { key: a.key, kind: 'update', status: F.status, note: $('#note').value, newDue: F.status === 'progress' ? $('#nd').value : '', verified: !!F.verified },
        details: jobDetails([['Recorded by', S.me.name + ', ' + roleName(S.me)]]), rows: rows, photos: F.photos.map(function (p) { return { img: p.img, caption: 'Fix — ' + (a.item ? 'item ' + a.item : '') }; }),
        sigs: [{ name: S.me.name, label: roleName(S.me), time: Date.now(), img: sig.data() }], alert: F.status === 'escalate' };
      rec.fileName = fileName({ date: today() }, 'Corrective action ' + (a.item || '') + ' ' + (F.verified ? 'closed' : F.status === 'fixed' ? 'fixed' : F.status), S.me.name).replace('  ', ' '); rec.folder = folderFor(S.job);
      await saveRecord(rec); history.back(); toast(F.verified ? 'Closed' : F.status === 'fixed' ? 'Saved — a manager checks it next' : 'Follow-up saved');
    };
  }
  function renderVerify(a) {
    getGps();
    var V = { v: null };
    var last = a.history[a.history.length - 1], ph = (last && last.photos) || [];
    var h = top('Check the fix', (a.item ? 'Item ' + a.item + ' · ' : '') + S.job.jobNo, true) + '<div class="body"><div class="card"><b>' + esc(a.finding || '') + '</b>' +
      (last ? '<div class="small" style="margin-top:6px">Fixed by ' + esc((person(last.personId) || {}).name || '') + ' · ' + niceDate(last.date) + '</div><div>' + esc(last.data.note || '') + '</div>' : '') +
      (ph.length ? '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' + ph.map(function (p) { return '<img src="' + p.img + '" style="width:48%;border-radius:10px">'; }).join('') + '</div>' : '') + '</div>' +
      '<div class="lbl">Is it fixed properly?</div><div class="yn two"><button data-v="accept" class="good">Yes — close it</button><button data-v="reject" class="bad">No — reopen</button></div>' +
      '<div class="lbl">Comment<span id="req"></span></div>' + voiceBox('note', 'Optional when closing') + '<div class="lbl">Sign</div>' + sigBox() +
      '</div><div class="foot"><button class="btn" id="go" disabled>Save</button></div>';
    app.innerHTML = h; bindBack(); renderBanner(); bindVoice();
    var go = $('#go'), sig = bindSig($('.sigwrap'), chk);
    function chk() { go.disabled = !(V.v && !sig.isEmpty() && (V.v === 'accept' || ($('#note').value || '').trim())); }
    $('#note').oninput = chk;
    $$('[data-v]').forEach(function (b) { b.onclick = function () { V.v = b.getAttribute('data-v'); $$('[data-v]').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#req').textContent = V.v === 'reject' ? ' (required)' : ''; chk(); }; });
    go.onclick = async function () {
      go.disabled = true;
      var rows = actRows(a).concat([{ section: 'Fix recorded', label: 'What was done', value: last ? last.data.note : '', flag: '' },
        { section: 'Manager check', label: 'Result', value: V.v === 'accept' ? 'Accepted — closed' + (a.sev === 'Critical' ? ' — stop work can be lifted' : '') : 'Not accepted — reopened', flag: V.v === 'accept' ? 'good' : 'bad' }]);
      if ($('#note').value) rows.push({ section: 'Manager check', label: 'Comment', value: $('#note').value, flag: '' });
      var rec = { form: 'CAF', formTitle: 'Corrective action check — ' + (a.item ? 'item ' + a.item : (a.finding || '').slice(0, 40)), formRef: FORMS.CAF.ref, jobNo: S.job.jobNo, personId: S.me.id,
        data: { key: a.key, kind: 'verify', verify: V.v, note: $('#note').value }, details: jobDetails([['Checked by', S.me.name + ', ' + roleName(S.me)]]), rows: rows, photos: ph,
        sigs: [{ name: S.me.name, label: roleName(S.me) + ' — checked', time: Date.now(), img: sig.data() }], alert: V.v === 'reject' };
      rec.fileName = fileName({ date: today() }, 'Corrective action ' + (a.item || '') + ' ' + (V.v === 'accept' ? 'closed' : 'reopened'), S.me.name).replace('  ', ' '); rec.folder = folderFor(S.job);
      await saveRecord(rec); history.back(); toast(V.v === 'accept' ? 'Closed' : 'Reopened — ' + (a.who || 'responsible person') + ' to fix');
    };
  }
  function renderRaise() {
    getGps();
    var R = { sev: 'Minor', src: null, photos: [] }, sup = person(S.job.supervisorId);
    var h = top('Raise an action', S.job.street + ' · ' + S.job.jobNo, true) + '<div class="body">' +
      '<div class="lbl">Where from?</div><div class="chips">' + ['Incident', 'Hazard', 'Site visit', 'Weekly inspection', 'Toolbox talk', 'Other'].map(function (t) { return '<button data-src="' + t + '">' + t + '</button>'; }).join('') + '</div>' +
      '<div class="lbl">What’s wrong (required)</div>' + voiceBox('fd', 'What you found') +
      '<div class="lbl">Photo — required</div>' + photoBox('ph') +
      '<div class="lbl">Action required</div>' + voiceBox('ac', 'What has to be done') +
      '<div class="lbl">Severity</div><div class="chips">' + ['Critical', 'Major', 'Minor'].map(function (t) { return '<button data-sv="' + t + '"' + (t === 'Minor' ? ' class="on"' : '') + '>' + t + '</button>'; }).join('') + '</div>' +
      '<div class="lbl">Responsible</div><input type="text" id="who" value="' + esc(sup ? sup.name : '') + '">' +
      '<div class="lbl">Due</div><input type="date" id="due" value="' + addDays(7) + '">' +
      '</div><div class="foot"><button class="btn" id="go" disabled>Raise action</button></div>';
    app.innerHTML = h; bindBack(); renderBanner(); bindVoice();
    var go = $('#go');
    function chk() { go.disabled = !(R.src && ($('#fd').value || '').trim() && R.photos.length); }
    bindPhotos($('#ph'), R.photos, chk); $('#fd').oninput = chk;
    $$('[data-src]').forEach(function (b) { b.onclick = function () { R.src = b.getAttribute('data-src'); $$('[data-src]').forEach(function (x) { x.classList.toggle('on', x === b); }); chk(); }; });
    $$('[data-sv]').forEach(function (b) { b.onclick = function () { R.sev = b.getAttribute('data-sv'); $$('[data-sv]').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#due').value = addDays(SEV_DAYS[R.sev]); }; });
    go.onclick = async function () {
      go.disabled = true;
      var d = { source: R.src, finding: $('#fd').value, action: $('#ac').value, sev: R.sev, who: $('#who').value, due: $('#due').value };
      var rec = { form: 'CAR', formTitle: 'Corrective action raised — ' + d.finding.slice(0, 50), formRef: FORMS.CAR.ref, jobNo: S.job.jobNo, personId: S.me.id, data: d,
        details: jobDetails([['Raised by', S.me.name + ', ' + roleName(S.me)]]),
        rows: [{ section: 'Corrective action', label: 'Raised from', value: d.source, flag: '' }, { section: 'Corrective action', label: 'Finding', value: d.finding, flag: 'bad' },
          { section: 'Corrective action', label: 'Action required', value: d.action || '—', flag: '' }, { section: 'Corrective action', label: 'Severity', value: d.sev, flag: d.sev === 'Critical' ? 'bad' : '' },
          { section: 'Corrective action', label: 'Responsible', value: d.who || '—', flag: '' }, { section: 'Corrective action', label: 'Due', value: d.due || '—', flag: '' }],
        photos: R.photos, sigs: [{ name: S.me.name, label: 'Raised by — ' + roleName(S.me), time: Date.now() }], alert: R.sev === 'Critical' };
      rec.fileName = fileName({ date: today() }, 'Corrective action raised ' + hhmm(), S.me.name); rec.folder = folderFor(S.job);
      await saveRecord(rec); history.back(); toast('Action raised');
    };
  }

  /* ---------- the supervisor's numbered job sequence ---------- */
  function absentKey() { return 'tc.absent.' + S.job.jobNo + '.' + today(); }
  function absentList() { try { return JSON.parse(localStorage.getItem(absentKey()) || '[]'); } catch (e) { return []; } }
  function setAbsent(pid, on) { var l = absentList().filter(function (x) { return x !== pid; }); if (on) l.push(pid); localStorage.setItem(absentKey(), JSON.stringify(l)); }
  function present() { var ab = absentList(); return S.job.crewIds.filter(function (pid) { return ab.indexOf(pid) < 0; }); }
  function live(form) { return RECS.filter(function (r) { return r.form === form && S.job && r.jobNo === S.job.jobNo && !r.supersededBy; }); }
  function todays(form) { return live(form).filter(function (r) { return r.date === today(); }); }
  function stageRec(stage, onlyToday) { return (onlyToday ? todays('D6') : live('D6')).filter(function (r) { return ((r.data.answers || {}).stage || {}).v === stage; })[0]; }
  function ffwToday(pid) { return todays('FFW').filter(function (r) { return r.personId === pid; }).sort(function (x, y) { return y.createdAt - x.createdAt; })[0]; }
  function d13Today(pid) { return todays('D13').filter(function (r) { return r.personId === pid; })[0]; }
  function briefed(pid) {
    return todays('D5').some(function (r) { return (r.data.crew || []).some(function (c) { return c.id === pid && c.sig; }); }) ||
      todays('D5L').some(function (r) { return r.personId === pid; });
  }
  function renderLateBrief(step, pid) {
    var p = person(pid), d5 = todays('D5').sort(function (x, y) { return y.createdAt - x.createdAt; })[0];
    S.onBack = function () { renderPersonStep(step); };
    app.innerHTML = top('Late arrival — ' + p.name, 'Pre-start briefing · ' + jobSub(), true) + '<div class="body"><p class="help">' + esc(first(p.name)) +
      ' missed the pre-start. Go through it with them before they sign in.</p>' + briefSummary(d5.data.answers) +
      '<div class="card"><p style="margin:0"><b>I have been briefed on today\u2019s pre-start. I understand the work, the hazards and controls above, the SWMS and the emergency plan.</b></p></div>' +
      '<div class="lbl">' + esc(p.name) + ' signs</div>' + sigBox() + '</div><div class="foot"><button class="btn" id="go" disabled>Signed — sign them in</button></div>';
    bindBack(); renderBanner();
    var go = $('#go'), sig = bindSig($('.sigwrap'), function () { go.disabled = sig.isEmpty(); });
    go.onclick = async function () {
      go.disabled = true;
      var rec = { form: 'D5L', formTitle: 'Late arrival pre-start briefing — ' + p.name, formRef: FORMS.D5.ref + ' (late arrival)', jobNo: S.job.jobNo, personId: pid,
        data: { d5: d5.id }, details: jobDetails([['Worker', p.name], ['Briefed by', S.me.name], ['Pre-start held at', hm(d5.createdAt)]]),
        rows: [{ section: 'Briefing given', label: 'Today\u2019s pre-start summary gone through with the worker', value: 'Yes', flag: 'good' }],
        sigs: [{ name: p.name, label: 'Worker — briefed late', time: Date.now(), img: sig.data() }, { name: S.me.name, label: 'Briefed by', time: Date.now() }] };
      rec.fileName = fileName({ date: today() }, 'Late pre-start briefing', p.name); rec.folder = folderFor(S.job);
      await saveRecord(rec); await saveD13(pid, false);
      toast(first(p.name) + ' briefed and signed in ' + hm(Date.now())); history.replaceState({ v: 1 }, ''); renderPersonStep(step);
    };
  }
  function seqSteps() { return SEQUENCE.filter(function (s) { return !(s.classA && S.job.cls.indexOf('A') < 0); }); }

  /* Who a per-person step still needs, and whether a step is done */
  function personState(step, pid) {
    var f = ffwToday(pid), d = d13Today(pid);
    if (step.key === 'D4') return live('D4').some(function (r) { return ((r.data.answers || {}).who || {}).v === pid; }) ? 'done' : 'todo';
    if (step.key === 'D1') return live('D1').some(function (r) { return r.personId === pid && r.data.rev === arcpRev(); }) ? 'done' : 'todo';
    if (step.key === 'FFW') return f ? (f.data.result === 'pass' ? 'done' : 'notfit') : 'todo';
    if (step.key === 'IN') return f && f.data.result !== 'pass' ? 'notfit' : d && d.data.in ? 'done' : !f ? 'blocked' : (todays('D5').length && !briefed(pid)) ? 'brief' : 'todo';
    if (step.key === 'OUT') return !(d && d.data.in) ? 'skip' : d.data.out ? 'done' : 'todo';
    return 'todo';
  }
  function stepState(step) {
    var at = null, rec;
    if (step.perPerson) {
      var ppl = present(), n = 0, of = 0;
      ppl.forEach(function (pid) { var s = personState(step, pid); if (s === 'skip' || s === 'blocked' && step.key === 'IN' && false || (s === 'notfit' && step.key !== 'FFW')) return; of++; if (s === 'done' || s === 'notfit') n++; });
      return { done: of > 0 ? n === of : step.key === 'OUT', n: n, of: of };
    }
    if (step.key === 'D2') rec = live('D2')[0];
    else if (step.key === 'D3') { rec = live('D3').sort(function (x, y) { return y.createdAt - x.createdAt; })[0]; if (rec && !present().every(function (pid) { return (rec.data.crewIds || []).indexOf(pid) >= 0 || (rec.data.answers || {})['lic_' + pid]; })) return { done: false, note: 'Crew changed — update it' }; }
    else if (step.key === 'D7') { rec = live('D7').filter(function (r) { var a = r.data.answers || {}; return ((a.retest || {}).v || (a.sres || {}).v) === 'pass'; })[0]; }
    else if (step.key === 'D6S') rec = stageRec('setup');
    else if (step.key === 'D6R') rec = stageRec('during', true);
    else if (step.key === 'D6C') rec = stageRec('clear');
    else if (step.key === 'D5') rec = todays('D5')[0];
    else if (step.key === 'D9') rec = todays('D9')[0];
    else if (step.key === 'D8') { rec = live('D8').filter(function (r) { return (Date.now() - r.createdAt) < 7 * 864e5; })[0]; }
    else if (step.key === 'D11B') rec = live('D11').filter(function (r) { return r.data.dir === 'back'; })[0];
    else if (step.key === 'D11O') rec = live('D11').filter(function (r) { return r.data.dir === 'out'; })[0];
    return { done: !!rec, at: rec ? rec.createdAt : null, rec: rec };
  }
  /* Which steps are open: start + day steps strictly in order; weekly and close-out once the start of job is done */
  function seqPlan() {
    var steps = seqSteps(), out = [], blocked = false, startDone = true, num = 0;
    steps.forEach(function (s) {
      var st = stepState(s); num++;
      var item = { step: s, st: st, num: num };
      if (s.group === 'start' || s.group === 'day') {
        item.open = !blocked; if (!st.done) blocked = true;
        if (s.group === 'start' && !st.done) startDone = false;
      } else item.open = startDone;
      out.push(item);
    });
    var fin = out.filter(function (x) { return x.step.group === 'finish'; }), prev = true;
    fin.forEach(function (x) { x.open = x.open && prev; prev = x.st.done; });
    var wk = out.filter(function (x) { return x.step.group === 'week'; })[0];
    if (wk) wk.open = startDone && !!stepState({ key: 'D5' }).done;
    return { items: out, startDone: startDone };
  }

  function renderSupToday() {
    stopCam(); S.seq = null; S.actAs = null; S.onBack = null; S.atHome = true;
    var j = S.job, plan = seqPlan(), dayItems = plan.items.filter(function (x) { return x.step.group === 'start' || x.step.group === 'day'; });
    var next = dayItems.filter(function (x) { return !x.st.done; })[0];
    var h = top('Kia ora ' + first(S.me.name), longDate() + ' · start ' + j.start) + '<div class="body">';
    h += '<div class="card job"><h2>' + esc(j.street) + ', ' + esc(j.suburb) + '</h2><div class="meta"><span class="chip cls">Class ' + esc(j.cls) + '</span>' +
      esc(j.jobNo) + ' · ' + present().length + ' crew today</div></div>' + formsNews();
    h += next ? '<button class="btn" id="nextstep" style="margin-bottom:12px">Next: ' + next.num + '. ' + esc(next.step.title) + ' →</button>'
      : '<div class="card center" style="border:2px solid var(--green)"><b>✅ All of today’s steps are done</b></div>';
    var showStart = !plan.startDone || S.showStart;
    Object.keys(GROUPS).forEach(function (g) {
      var items = plan.items.filter(function (x) { return x.step.group === g; }); if (!items.length) return;
      if (g === 'start' && !showStart) {
        h += '<button class="tile" id="showstart"><span class="ic g">✅</span><span class="tx">Start of job done<br><span class="small" style="font-weight:600">Steps 1–' + items.length + ' · tap to see</span></span></button>';
        return;
      }
      if (g === 'finish' && !plan.startDone) return;
      h += '<div class="lbl">' + esc(GROUPS[g]) + '</div><div class="card" style="padding:4px 12px">';
      items.forEach(function (x) { h += stepRow(x); });
      h += '</div>';
    });
    var ac = actCounts();
    h += '<div class="lbl">Any time</div>' +
      (ac.total ? tile('acts', '🛠️', 'y', 'Corrective actions', ac.overdue ? chip('todo', ac.overdue + ' overdue') : ac.open ? chip('new', ac.open + ' open') : ac.awaiting ? chip('wait', ac.awaiting + ' to check') : chip('done', 'All closed')) : '') +
      tile('d12', '⚠️', 'p', 'Report incident / hazard', '') +
      '<div class="pics" style="margin-top:0">' +
      [['add', '➕', 'Add to job'], ['lib', '📚', 'SWMS library'], ['D10', '🚛', 'Waste load'], ['D11', '🧰', 'Inventory out / back'], ['D4', '🎓', 'Induct someone new'], ['visitor', '🪪', 'Visitor sign in'], ['file', '📁', 'Site file'], ['hnd', '🤝', 'Hand over to another supervisor']]
        .map(function (b) { return '<button data-any="' + b[0] + '"><span>' + b[1] + '</span>' + b[2] + '</button>'; }).join('') + '</div>';
    h += footLinks() + '</div>';
    app.innerHTML = h; renderBanner(); bindFootLinks(); bindFormsNews();
    var ns = $('#nextstep'); if (ns) ns.onclick = function () { runStep(next.step); };
    var ss = $('#showstart'); if (ss) ss.onclick = function () { S.showStart = true; renderSupToday(); };
    $$('[data-step]').forEach(function (b) { b.onclick = function () {
      var it = plan.items.filter(function (x) { return x.step.key === b.getAttribute('data-step'); })[0];
      if (!it.open) { toast('Do step ' + firstOpenNum(plan) + ' first'); return; }
      runStep(it.step);
    }; });
    $('[data-go=d12]').onclick = function () { enter(); renderReport(); };
    var at = $('[data-go=acts]'); if (at) at.onclick = function () { enter(); S.actsFrom = null; renderActions(); };
    $$('[data-any]').forEach(function (b) { b.onclick = function () {
      var k = b.getAttribute('data-any');
      if (k === 'file') { enter(); renderSiteFile(); }
      else if (k === 'add') { history.pushState({ v: 1 }, ''); renderAddDoc(function () { renderToday(); }); }
      else if (k === 'lib') { enter(); renderLibrary(); }
      else if (k === 'hnd') { enter(); renderHandover('out'); }
      else if (k === 'visitor') { enter(); renderVisitor(); }
      else if (k === 'D11') { enter(); renderInventory(null); }
      else { enter(); startFlow(k); }
    }; });
  }
  function firstOpenNum(plan) { var x = plan.items.filter(function (i) { return (i.step.group === 'start' || i.step.group === 'day') && !i.st.done; })[0]; return x ? x.num : ''; }
  function stepRow(x) {
    var s = x.st, cls, sub;
    if (s.done) { cls = 'background:var(--green);color:#fff'; sub = s.at ? 'Done ' + (s.rec && s.rec.date !== today() ? niceDate(s.rec.date) : hm(s.at)) : (s.of !== undefined ? 'All ' + s.of + ' done' : 'Done'); }
    else if (x.open) { cls = 'background:var(--lime);color:#1A1A1A'; sub = s.note || (s.of ? s.n + ' of ' + s.of + ' done' : 'To do'); }
    else { cls = 'background:#4A4D50;color:#A8AAAD'; sub = '🔒 Locked — finish the step before'; }
    if (x.step.key === 'D8' && !s.done) sub = x.open ? 'Due this week' : '🔒 After today’s pre-start';
    if (x.step.group === 'finish' && !s.done && x.open) sub = 'When removal is finished';
    return '<button class="it" style="width:100%;border:0;background:none;text-align:left;padding:12px 0;gap:12px;justify-content:flex-start' + (x.open || s.done ? '' : ';opacity:.6') + '" data-step="' + x.step.key + '">' +
      '<span style="flex:none;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;' + cls + '">' + (s.done ? '✓' : x.num) + '</span>' +
      '<span style="flex:1"><b style="font-size:18px">' + esc(x.step.title) + '</b><br><span class="small">' + esc(sub) + '</span></span></button>';
  }
  function runStep(step) {
    S.seq = step.key; S.seqStep = step; S.actAs = null;
    enter(function () { renderSupToday(); });
    if (step.perPerson) return renderPersonStep(step);
    if (step.form === 'D11') return renderInventory(step.preset.dir);
    startFlow(step.form, step.preset);
  }
  function seqReturn(msg) {
    if (msg) toast(msg);
    var step = S.seqStep; S.actAs = null; stopCam();
    history.replaceState({ v: 1 }, '');
    if (step && step.perPerson && !stepState(step).done) { S.seq = step.key; return renderPersonStep(step); }
    renderSupToday();
  }
  function renderPersonStep(step) {
    S.seq = step.key; S.seqStep = step; S.actAs = null; S.onBack = function () { renderSupToday(); };
    var num = seqSteps().indexOf(step) + 1, ab = absentList(), canAbsent = step.key === 'FFW' || step.key === 'D4' || step.key === 'D1';
    var hint = { D4: 'Induct each person. Tap their name, go through the topics, then they sign.', D1: 'Hand the phone to each person to read and sign.',
      FFW: 'Hand the phone to each person: they answer and take a face photo.', IN: 'Tap each person as they arrive on site.', OUT: 'Tap each person as they leave.' }[step.key];
    var h = top(num + '. ' + step.title, jobSub(), true) + '<div class="body"><p class="help">' + esc(hint) + '</p>';
    S.job.crewIds.forEach(function (pid) {
      var p = person(pid), away = ab.indexOf(pid) >= 0, s = away ? 'away' : personState(step, pid), chipH;
      chipH = s === 'done' ? chip('done', step.key === 'IN' ? 'In ' + hm(d13Today(pid).data.in) : step.key === 'OUT' ? 'Out ' + hm(d13Today(pid).data.out) : 'Done ✓')
        : s === 'brief' ? chip('new', 'Pre-start briefing first')
        : s === 'notfit' ? chip('todo', 'Not fit — no entry') : s === 'away' ? chip('lock', 'Not on site today') : s === 'blocked' ? chip('lock', 'Fit check first') : s === 'skip' ? chip('lock', 'Not signed in') : chip('new', step.key === 'IN' ? 'Tap to sign in' : step.key === 'OUT' ? 'Tap to sign out' : 'To do');
      h += '<div class="crew' + (s === 'done' ? ' signed' : '') + '" style="flex-wrap:wrap"><button style="flex:1;border:0;background:none;text-align:left;padding:0" data-p="' + pid + '" data-s="' + s + '"' + (s === 'todo' || s === 'brief' ? '' : ' disabled') + '><span class="nm">' + esc(p.name) + '</span></button>' + chipH +
        (step.key === 'FFW' || step.key === 'IN' ? '<div style="width:100%">' + warnChip(pid) + '</div>' : '') +
        (canAbsent && (s === 'todo' || s === 'away') ? '<button class="link" style="width:100%;text-align:left;padding:6px 0 0" data-ab="' + pid + '">' + (away ? 'Back on site today' : 'Not on site today') + '</button>' : '') + '</div>';
    });
    var todo = S.job.crewIds.filter(function (pid) { return ab.indexOf(pid) < 0 && personState(step, pid) === 'todo'; });
    h += '</div><div class="foot">' + ((step.key === 'IN' || step.key === 'OUT') && todo.length > 1 ? '<button class="btn" id="all">' + (step.key === 'IN' ? 'Sign all ' + todo.length + ' in now' : 'Sign all ' + todo.length + ' out now') + '</button>' : '') +
      '<button class="btn sec" id="back">Back to steps</button></div>';
    app.innerHTML = h; bindBack(); renderBanner();
    $('#back').onclick = function () { renderSupToday(); };
    $$('[data-ab]').forEach(function (b) { b.onclick = function () { var pid = b.getAttribute('data-ab'); setAbsent(pid, absentList().indexOf(pid) < 0); renderPersonStep(step); }; });
    var all = $('#all'); if (all) all.onclick = async function () { all.disabled = true; for (var i = 0; i < todo.length; i++) await saveD13(todo[i], step.key === 'OUT'); toast(step.key === 'IN' ? 'All signed in' : 'All signed out'); renderPersonStep(step); };
    $$('[data-p]').forEach(function (b) { b.onclick = async function () {
      var pid = b.getAttribute('data-p');
      if (b.getAttribute('data-s') === 'brief') { history.pushState({ v: 1 }, ''); return renderLateBrief(step, pid); }
      if (step.key === 'IN' || step.key === 'OUT') { b.disabled = true; await saveD13(pid, step.key === 'OUT'); toast(person(pid).name + (step.key === 'IN' ? ' signed in ' : ' signed out ') + hm(Date.now())); return renderPersonStep(step); }
      S.actAs = pid; history.pushState({ v: 1 }, '');
      if (step.key === 'FFW') startFlow('FFW');
      else if (step.key === 'D1') { renderD1(); S.onBack = function () { S.actAs = null; renderPersonStep(step); }; }
      else if (step.key === 'D4') { S.actAs = null; startFlow('D4', { who: pid }); }
    }; });
  }

  /* First-time setup (demo). The real app sets the person from their one-time link. */
  function renderSetup() {
    var h = top('Set up this phone', 'TechClean H&S') + '<div class="body"><div class="card"><p style="margin-top:0"><b>Who is this phone for?</b></p>' +
      '<p class="small">In the real app your supervisor sends you a one-time link or QR code and this happens by itself. No passwords.</p>';
    S.people.forEach(function (p) { h += '<button class="crew" data-p="' + p.id + '"><span class="nm">' + esc(p.name) + '</span><span class="st">' + (p.role === 'supervisor' ? 'Supervisor' : 'Crew') + '</span></button>'; });
    h += '</div></div>';
    app.innerHTML = h;
    $$('[data-p]').forEach(function (b) { b.onclick = function () { localStorage.setItem('tc.me', b.getAttribute('data-p')); resolveMe(); resolveJob(); renderToday(); }; });
  }
  /* QR scanned on a phone that isn't set up: visitor or crew */
  function renderQrNoPerson() {
    var j = S.job;
    if (!j) { app.innerHTML = top('TechClean H&S', '') + '<div class="body"><div class="card"><h2 style="margin-top:0">Job not found</h2><p>Talk to the site supervisor.</p></div></div>'; return; }
    if (j.status === 'closed') { app.innerHTML = top(j.street, j.jobNo) + '<div class="body"><div class="card"><div class="big">🔒</div><h2 class="center">Job closed — talk to your supervisor</h2></div></div>'; return; }
    var vr = recById(localStorage.getItem('tc.visitor') || '');
    if (vr && vr.jobNo === j.jobNo && vr.date === today() && !vr.data.out) {
      app.innerHTML = top(j.street, 'Visitor · ' + vr.data.name) + '<div class="body"><div class="card center"><div class="big">🪪</div><h2 style="margin:0">Signed in ' + hm(vr.data.in) + '</h2></div></div>' +
        '<div class="foot"><button class="btn" id="out">Sign out now</button></div>';
      $('#out').onclick = function () { signOutVisitor(vr.id).then(function () { app.innerHTML = top('Signed out', j.street) + '<div class="body"><div class="card center"><div class="big">👋</div><h2 style="margin:0">Thanks — signed out ' + hm(Date.now()) + '</h2></div></div>'; }); };
      return;
    }
    app.innerHTML = top(j.street + ', ' + j.suburb, j.jobNo + ' · Class ' + j.cls) + '<div class="body">' +
      tile('visitor', '🪪', 'b', 'Visitor sign in', '') + tile('crewsetup', '👷', 'g', 'I’m TechClean crew', '') + '</div>';
    $('[data-go=visitor]').onclick = function () { enter(); renderVisitor(); };
    $('[data-go=crewsetup]').onclick = function () { enter(); renderSetup(); };
  }

  function renderNeedFfw() {
    app.innerHTML = top('Sign on to site', jobSub(), true) + '<div class="body"><div class="card center"><div class="big">🧑‍🔧</div><h2 style="margin:0 0 8px">Fit for work check first</h2>' +
      '<p class="small">You can sign on once your fit for work check is done and passed.</p></div></div>' +
      '<div class="foot"><button class="btn" id="go">Do fit for work now</button></div>';
    bindBack(); renderBanner();
    $('#go').onclick = function () { history.replaceState({ v: 1 }, ''); startFlow('FFW'); };
  }

  /* ---------- one-question-at-a-time flow (fit for work, pre-start) ---------- */
  function draftKey(code) { return 'tc.draft.' + code + '.' + (S.job ? S.job.jobNo : '') + '.' + today() + '.' + (worker() ? worker().id : ''); }
  function startFlow(code, preset) {
    getGps();
    var f = FORMS[code], saved = null;
    try { saved = JSON.parse(localStorage.getItem(draftKey(code)) || 'null'); } catch (e) {}
    var F = saved || { code: code, i: 0, a: {} };
    if (S.amend) {
      var od = S.amend.old.data, crew = {};
      (od.crew || []).forEach(function (c) { crew[c.id] = { sig: c.sig || null, absent: c.absent, time: c.time, carried: !!c.sig }; });
      F = { code: code, i: 0, a: JSON.parse(JSON.stringify(od.answers || {})), crew: crew, amend: true };
    }
    F.def = f;
    if (code === 'D5' && !saved && !S.amend) {
      var lastD5 = live('D5').sort(function (x, y) { return y.createdAt - x.createdAt; })[0];
      if (lastD5) ['assembly', 'hospital', 'firstaid'].forEach(function (k) { var v = (lastD5.data.answers || {})[k]; if (v && v.v) F.a[k] = { v: v.v }; });
    }
    if (preset && !S.amend) {
      F.preset = preset; for (var k in preset) F.a[k] = { v: preset[k] };
      var ql = qList(f, F.a); F.i = 0; while (F.i < ql.length && preset[ql[F.i].id] !== undefined) F.i++;
    }
    showQ(F);
  }
  function saveDraft(F) { var o = { code: F.code, i: F.i, a: F.a, crew: F.crew }; try { localStorage.setItem(draftKey(F.code) + (F.amend ? '.amend' : ''), JSON.stringify(o)); } catch (e) {} }
  function clearDraft(code) { localStorage.removeItem(draftKey(code)); }

  function qList(def, a, all) {
    var out = [], qs = def.questions.filter(function (q) { return all || !q.showIf || q.showIf(a || {}); });
    for (var i = 0; i < qs.length; i++) {
      if (!qs[i].perCrew || !S.job) { out.push(qs[i]); continue; }
      var run = []; while (i < qs.length && qs[i].perCrew) run.push(qs[i++]); i--;   // group per person: all of Jack's, then Ivan's…
      S.job.crewIds.forEach(function (pid) {
        var p = person(pid);
        run.forEach(function (q) { var c = {}; for (var k in q) c[k] = q[k]; c.id = q.id + '_' + pid; c.pid = pid; c.q = p.name + ' — ' + q.q; c.pdf = p.name + ' — ' + (q.pdf || q.q); c.section = 'Site personnel — ' + p.name; out.push(c); });
      });
    }
    return out;
  }
  function showQ(F) {
    stopCam();
    var qs = qList(F.def, F.a);
    if (F.i >= qs.length) { if (F.code === 'FFW') return finishFfw(F, 'pass'); if (F.code === 'D5') return renderCrewSign(F); return finishGeneric(F); }
    var q = qs[F.i], a = F.a[q.id] || {}, pct = Math.round(F.i / qs.length * 100);
    S.onBack = function () { if (F.i > 0 && !(F.preset && F.i <= Object.keys(F.preset).length)) { F.i--; saveDraft(F); history.pushState({ v: 1 }, ''); showQ(F); } else if (S.seq) seqReturn(); else renderToday(); };
    var h = top(F.def.title, jobSub(), true) + '<div class="body"><div class="progress"><i style="width:' + pct + '%"></i></div>' +
      (q.section ? '<div class="sect">' + esc(q.section) + '</div>' : '') +
      '<div class="q">' + esc(q.q) + '</div>' + (q.help ? '<p class="help">' + esc(q.help) + '</p>' : '');
    if (q.type === 'yn' || q.type === 'ok') {
      var opts = q.type === 'ok' ? [['ok', 'OK'], ['fault', 'Fault'], ['na', 'N/A']] : [['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']];
      if (q.noNA) opts = opts.slice(0, 2);
      h += '<div class="yn' + (opts.length === 2 ? ' two' : '') + '">' + opts.map(function (o) {
        var cls = isBad(q, o[0]) ? 'bad' : o[0] === 'na' ? 'na' : 'good';
        return '<button data-v="' + o[0] + '" class="' + cls + (a.v === o[0] ? ' on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
      h += '<div id="badbox" class="' + (a.v && isBad(q, a.v) && !isStop(q, a.v) ? '' : 'hidden') + '"><div class="warn">' + esc(q.badMsg && !(q.photo || q.type === 'ok') ? q.badMsg : (q.photo || q.type === 'ok') ? 'Take a photo and add a note — your supervisor is told.' : 'Add a note or photo — your supervisor is told.') + '</div>' +
        '<div class="lbl">Note</div>' + voiceBox('note', 'Tap the mic to speak, or type…', a.note) + '<div class="lbl">Photo</div>' + photoBox('ph') + '</div>';
    } else if (q.type === 'choice') {
      h += '<div class="pics">' + q.opts.map(function (o) { return '<button data-v="' + o[0] + '" class="' + (a.v === o[0] ? 'on' : '') + '"><span>' + o[1] + '</span>' + esc(o[2]) + '</button>'; }).join('') + '</div>';
      if (q.bad) h += '<div id="badbox" class="' + (a.v && isBad(q, a.v) ? '' : 'hidden') + '"><div class="warn">' + (q.photo ? 'Take a photo and add a note.' : 'Add a note or photo.') + '</div><div class="lbl">Note</div>' + voiceBox('note', 'Tap the mic to speak, or type…', a.note) + '<div class="lbl">Photo</div>' + photoBox('ph') + '</div>';
    } else if (q.type === 'text') {
      h += voiceBox('txt', 'Tap the mic to speak, or type…', a.v);
    } else if (q.type === 'multi') {
      var sel = Array.isArray(a.v) ? a.v : [];
      h += '<div class="pics">' + q.opts.map(function (o) { return '<button data-mv="' + o[0] + '" class="' + (sel.indexOf(o[0]) >= 0 ? 'on' : '') + '"><span>' + o[1] + '</span>' + esc(o[2]) + '</button>'; }).join('') + '</div>';
    } else if (q.type === 'field') {
      h += '<input type="text" id="fld" value="' + esc(a.v || '') + '" autocomplete="off">';
    } else if (q.type === 'number') {
      h += '<div style="display:flex;gap:10px;align-items:center"><input type="text" inputmode="decimal" id="num" value="' + esc(a.v == null ? '' : a.v) + '" style="font-size:28px;font-weight:800">' +
        (q.unit ? '<span style="font-size:22px;font-weight:800">' + esc(q.unit) + '</span>' : '') + '</div>';
      h += '<div id="badbox" class="' + (a.v !== undefined && a.v !== '' && isBad(q, a.v) ? '' : 'hidden') + '"><div class="warn">' + esc(q.badMsg || 'Add a note — your supervisor is told.') + '</div>' +
        '<div class="lbl">Action taken</div>' + voiceBox('note', 'Tap the mic to speak, or type…', a.note) + '</div>';
    } else if (q.type === 'date') {
      h += '<input type="date" id="dt" value="' + esc(a.v || '') + '">' +
        '<div id="badbox" class="' + (a.v && isBad(q, a.v) ? '' : 'hidden') + '"><div class="warn">Expired — this person can’t work in the area. Add a note.</div><div class="lbl">Note</div>' + voiceBox('note', 'What’s being done', a.note) + '</div>';
    } else if (q.type === 'time') {
      if (!a.v) { var nd = new Date(); a.v = pad(nd.getHours()) + ':' + pad(nd.getMinutes()); F.a[q.id] = a; }
      h += '<input type="time" id="tm" value="' + esc(a.v) + '" style="font-size:28px;font-weight:800"><p class="help">Set to now — change it if needed.</p>';
    } else if (q.type === 'selfie') {
      h += '<div style="position:relative;background:#111;border-radius:14px;overflow:hidden"><video id="camv" playsinline autoplay muted style="width:100%;display:block;transform:scaleX(-1);min-height:240px"></video><div id="camimg"></div></div>' +
        '<div id="cammsg" class="warn"></div><button class="btn dark" id="snap" type="button" style="margin-top:12px">📸 Take photo</button>';
    } else if (q.type === 'photo') {
      h += photoBox('ph');
    } else if (q.type === 'crewpick') {
      h += '<div class="pics">' + S.job.crewIds.map(function (pid) { return '<button data-v="' + pid + '" class="' + (a.v === pid ? 'on' : '') + '"><span>👷</span>' + esc(person(pid).name) + '</button>'; }).join('') +
        '<button data-v="other" class="' + (a.v === 'other' ? 'on' : '') + '"><span>🧑‍💼</span>Someone else</button></div>';
    } else if (q.type === 'sign') {
      var whoName = q.who === 'subject' ? subjectName(F) : q.who === 'assessor' ? ((F.a.assessor || {}).v || 'Assessor') : S.me.name;
      h += (q.who ? '' : autoCard(F)) + '<p class="help"><b>' + esc(whoName) + '</b>' + (a.sig ? ' — already signed. Tap Next, or sign again.' : '') + '</p>' + sigBox();
    }
    h += '</div><div class="foot"><button class="btn" id="next">Next →</button></div>';
    app.innerHTML = h; bindBack(); renderBanner(); bindVoice();
    a.photos = a.photos || [];
    var ph = $('#ph'); if (ph) bindPhotos(ph, a.photos, check);
    if (q.type === 'selfie') bindSelfie(a, function () { F.a[q.id] = a; saveDraft(F); check(); });
    var next = $('#next');
    function check() {
      var ok = (a.v !== undefined && a.v !== null && String(a.v).trim() !== '') || q.optional;
      if (q.type === 'number' && a.v && isNaN(+a.v)) ok = false;
      if (q.type === 'multi') ok = Array.isArray(a.v) && a.v.length > 0;
      if (q.type === 'photo') ok = !!q.optional || (a.photos || []).length > 0;
      if (q.type === 'sign') ok = !!a.sig;
      if (q.type === 'selfie') ok = !!(a.photos && a.photos[0]);
      if (ok && a.v && needsPhoto(q, a.v)) ok = !!((a.note || '').trim() && (a.photos || []).length);
      else if (ok && a.v && isBad(q, a.v) && !isStop(q, a.v)) ok = !!((a.note || '').trim() || (a.photos || []).length);
      if (q.type === 'photo' && a.photos.length) a.v = a.photos.length + ' photo' + (a.photos.length > 1 ? 's' : '');
      next.disabled = !ok;
    }
    $$('[data-v]').forEach(function (b) {
      b.onclick = function () {
        a.v = b.getAttribute('data-v'); F.a[q.id] = a; saveDraft(F);
        $$('[data-v]').forEach(function (x) { x.classList.toggle('on', x === b); });
        if (isStop(q, a.v)) { return renderStop(F, q); }
        if (F.code === 'FFW' && q.id === 'rpe') {
          var ft = fitTestFor(worker(), a.v);
          F.a.fittest = { v: ft.ok ? 'yes' : 'no', note: ft.cert ? 'Face fit test (' + ft.label + ') ' + (ft.cert.expired ? 'expired ' : 'current to ') + certDate(ft.cert.date) : 'No ' + ft.label + ' fit test on record' };
          if (!ft.ok) return renderStop(F, { id: 'fittest', stopMsg: (ft.cert ? 'Your ' + ft.label + ' fit test expired on ' + certDate(ft.cert.date) + '.' : 'There\u2019s no ' + ft.label + ' fit test on record.') + ' No entry — stop work until you\u2019re fit tested.' });
        }
        var bad = isBad(q, a.v); var bb = $('#badbox'); if (bb) bb.classList.toggle('hidden', !bad);
        check();
        if (!bad) setTimeout(advance, 220);
      };
    });
    var note = $('#note'); if (note) note.oninput = function () { a.note = note.value; F.a[q.id] = a; saveDraft(F); check(); };
    var txt = $('#txt'); if (txt) txt.oninput = function () { a.v = txt.value; F.a[q.id] = a; saveDraft(F); check(); };
    $$('[data-mv]').forEach(function (b) { b.onclick = function () {
      var v = b.getAttribute('data-mv'), sel = Array.isArray(a.v) ? a.v.slice() : [], i = sel.indexOf(v);
      if (i >= 0) sel.splice(i, 1); else sel.push(v); a.v = sel; F.a[q.id] = a; saveDraft(F);
      b.classList.toggle('on', i < 0); check(); }; });
    var fld = $('#fld'); if (fld) fld.oninput = function () { a.v = fld.value; F.a[q.id] = a; saveDraft(F); check(); };
    var num = $('#num'); if (num) num.oninput = function () { a.v = num.value.replace(',', '.'); F.a[q.id] = a; saveDraft(F); var bb = $('#badbox'); if (bb) bb.classList.toggle('hidden', !(a.v !== '' && isBad(q, a.v))); check(); };
    var tm = $('#tm'); if (tm) tm.oninput = tm.onchange = function () { a.v = tm.value; F.a[q.id] = a; saveDraft(F); check(); };
    var dt = $('#dt'); if (dt) dt.oninput = dt.onchange = function () { a.v = dt.value; F.a[q.id] = a; saveDraft(F); var bb = $('#badbox'); if (bb) bb.classList.toggle('hidden', !(a.v && isBad(q, a.v))); check(); };
    var sw = $('.sigwrap'); if (sw && q.type === 'sign') { var sigOld = a.sig || null; var sigPad = bindSig(sw, function () { if (!sigPad.isEmpty()) { a.sig = sigPad.data(); a.v = 'signed'; } else { a.sig = sigOld; a.v = sigOld ? 'signed' : null; } F.a[q.id] = a; saveDraft(F); check(); }); }
    function advance() { F.a[q.id] = a; F.i++; saveDraft(F); history.pushState({ v: 1 }, ''); showQ(F); }
    next.onclick = advance;
    check();
  }
  function isBad(q, v) {
    if (q.type === 'number' && typeof q.badIf === 'function') return v !== '' && !isNaN(+v) && q.badIf(+v);
    if (q.type === 'date' && q.badIf === 'past') return !!v && v < today();
    if (q.type === 'choice' && q.bad) return q.bad.indexOf(v) >= 0;
    return (q.bad && q.bad.indexOf(v) >= 0) || (q.stop && q.stop.indexOf(v) >= 0) || (q.type === 'ok' && v === 'fault');
  }
  function needsPhoto(q, v) { return isBad(q, v) && !isStop(q, v) && (q.photo || q.type === 'ok'); }
  function subjectName(F) {
    var w = F.a.who || {};
    if (w.v === 'other') return (F.a.wname || {}).v || 'Person inducted';
    var p = person(w.v); return p ? p.name : 'Person inducted';
  }
  function isStop(q, v) { return q.stop && q.stop.indexOf(v) >= 0; }

  function renderStop(F, q) {
    S.onBack = function () { history.pushState({ v: 1 }, ''); showQ(F); };
    app.innerHTML = top(F.def.title, jobSub(), true) + '<div class="body"><div class="stop"><div class="big" style="margin:0">⛔</div><h2>You can’t sign on yet</h2><div>' + esc(q.stopMsg) + '</div></div>' +
      '<p class="small center">Picked the wrong answer? Tap ← to go back and change it.</p></div>' +
      '<div class="foot"><button class="btn dark" id="ok">OK — tell my supervisor</button></div>';
    bindBack(); renderBanner();
    $('#ok').onclick = function () { finishFfw(F, 'fail', q); };
  }

  function answerLabel(q, v) {
    if (q.type === 'choice') { for (var i = 0; i < q.opts.length; i++) if (q.opts[i][0] === v) return q.opts[i][2]; }
    return { yes: 'Yes', no: 'No', na: 'N/A', ok: 'OK', fault: 'Fault' }[v] || v || '—';
  }
  function rowsFrom(F) {
    var rows = [], photos = [];
    qList(F.def, F.a).forEach(function (q) {
      var a = F.a[q.id]; if (!a) return;
      (a.photos || []).forEach(function (p) { photos.push({ img: p.img, caption: q.q.slice(0, 40) + ' · ' + p.caption }); });
      if (q.type === 'selfie') { rows.push({ section: q.section || F.def.title, label: q.pdf || q.q, value: a.photos && a.photos[0] ? 'Taken live ' + hm(a.photos[0].at) + ' — see photo' : 'Missing', flag: a.photos && a.photos[0] ? 'good' : 'bad' }); return; }
      if (q.type === 'sign' || q.type === 'photo') return;
      var label = q.pdf || q.q, val, flag;
      if (q.type === 'text' || q.type === 'field') { val = a.v || '—'; flag = ''; }
      else if (q.type === 'time') { val = a.v ? hm(new Date('2000-01-01T' + a.v)) : '—'; flag = ''; }
      else if (q.type === 'number') { val = (a.v || '—') + (q.unit ? ' ' + q.unit : ''); flag = isBad(q, a.v) ? 'bad' : ''; }
      else if (q.type === 'date') { val = a.v ? new Date(a.v + 'T12:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; flag = isBad(q, a.v) ? 'bad' : 'good'; }
      else if (q.type === 'multi') { val = (a.v || []).map(function (v) { var o = q.opts.filter(function (x) { return x[0] === v; })[0]; return o ? o[2] : v; }).join('; ') || '—'; flag = ''; }
      else if (q.type === 'crewpick') { val = a.v === 'other' ? 'Someone else (below)' : (person(a.v) || {}).name; flag = ''; }
      else { val = answerLabel(q, a.v); flag = isBad(q, a.v) ? 'bad' : a.v === 'na' ? '' : (q.type === 'choice' && !q.bad) ? '' : 'good'; }
      rows.push({ section: q.section || F.def.title, label: label, value: val, flag: flag, note: a.note || '' });
    });
    if (F.code === 'D7' && F.a.tstart && F.a.tend && F.a.tstart.v && F.a.tend.v) {
      var t0 = F.a.tstart.v.split(':'), t1 = F.a.tend.v.split(':'), mins = (+t1[0] * 60 + +t1[1]) - (+t0[0] * 60 + +t0[1]);
      rows.splice(rows.findIndex(function (r) { return r.label === 'Test finished at'; }) + 1, 0, { section: 'Smoke test', label: 'Test duration', value: (mins >= 0 ? mins : mins + 1440) + ' minutes', flag: '' });
    }
    return { rows: rows, photos: photos };
  }

  async function finishFfw(F, result, stopQ) {
    var W = worker();
    var rf = rowsFrom(F);
    if (F.a.fittest) rf.rows.splice(Math.min(3, rf.rows.length), 0, { section: FORMS.FFW.title, label: 'Face fit test current for the mask in use', value: F.a.fittest.v === 'yes' ? 'Yes' : 'NO — stop work', flag: F.a.fittest.v === 'yes' ? 'good' : 'bad', note: F.a.fittest.note });
    var ww = certWarnings(worker()).filter(function (c) { return !c.stopWork; });
    if (ww.length) rf.rows.push({ section: 'Certificate warnings', label: ww.map(function (c) { return c.name + ' expired ' + certDate(c.date); }).join('; '), value: 'Warning', flag: 'bad' });
    var rec = { form: 'FFW', formTitle: 'Fit for work — ' + W.name, formRef: FORMS.FFW.ref, jobNo: S.job.jobNo, personId: W.id,
      data: { result: result, answers: F.a, stoppedAt: stopQ ? stopQ.id : null },
      details: jobDetails([['Worker', W.name], ['Result', result === 'pass' ? 'PASS — fit for work' : 'NOT FIT — cannot sign on']]),
      rows: rf.rows, photos: rf.photos, sigs: [{ name: W.name, label: 'Worker', time: Date.now() }].concat(W.id !== S.me.id ? [{ name: S.me.name, label: 'Entered on the supervisor\u2019s phone', time: Date.now() }] : []) };
    rec.fileName = fileName({ date: today() }, 'Fit for work', W.name); rec.folder = folderFor(S.job);
    await saveRecord(rec); clearDraft('FFW');
    history.replaceState({ v: 1 }, '');
    if (S.seq) return seqReturn(result === 'pass' ? first(W.name) + ' is fit for work' : first(W.name) + ' NOT fit — no entry');
    if (result === 'pass') {
      S.onBack = null;
      app.innerHTML = top('Fit for work', jobSub()) + '<div class="body"><div class="card center"><div class="big">✅</div><h2 style="margin:0">You’re fit for work</h2><p class="small">Saved ' + hm(Date.now()) + '</p></div></div>' +
        '<div class="foot"><button class="btn" id="on">Sign on to site now</button><button class="btn sec" id="home">Back to today</button></div>';
      renderBanner();
      $('#on').onclick = function () { renderSignOn(); };
      $('#home').onclick = function () { renderToday(); };
    } else {
      app.innerHTML = top('Fit for work', jobSub()) + '<div class="body"><div class="stop"><h2>Not fit for work today</h2><div>Your supervisor has been told. Do not enter the work area.</div></div></div>' +
        '<div class="foot"><button class="btn sec" id="home">Back to today</button></div>';
      renderBanner(); $('#home').onclick = function () { renderToday(); };
    }
  }

  /* ---------- finish any other Part D form ---------- */
  function genericName(F) {
    var a = F.a, c = F.code;
    if (c === 'D4') return 'Induction – ' + subjectName(F);
    if (c === 'D6') return 'Quality control – ' + answerLabel(FORMS.D6.questions[0], (a.stage || {}).v);
    if (c === 'D7') return 'Smoke test ' + hhmm() + ' – ' + (((a.retest || {}).v || (a.sres || {}).v) === 'pass' ? 'pass' : 'FAIL');
    if (c === 'AUD') return answerLabel(FORMS.AUD.questions[0], (a.vtype || {}).v) || 'Site audit';
    if (c === 'D10') return 'Waste load ' + hhmm() + ((a.docket || {}).v ? ' docket ' + a.docket.v : '');
    if (c === 'D11') return 'Equipment ' + ((a.dir || {}).v === 'back' ? 'back' : 'out') + ' – ' + ((a.item || {}).v || '');
    return F.def.title;
  }
  async function finishGeneric(F) {
    var j = S.job, rf = rowsFrom(F), sigs = [], name = genericName(F);
    rf.rows = rf.rows.concat(autoRows(F));
    qList(F.def, F.a).forEach(function (q) {
      var a = F.a[q.id];
      if (q.type === 'sign' && a && a.sig) sigs.push({ name: q.who === 'subject' ? subjectName(F) : q.who === 'assessor' ? ((F.a.assessor || {}).v || 'Assessor') + ((F.a.acomp || {}).v ? ', ' + F.a.acomp.v : '') : S.me.name,
        label: q.who === 'subject' ? 'Person inducted' : q.who === 'assessor' ? 'Assessor — witnessed the smoke test' : roleName(S.me), time: Date.now(), img: a.sig });
    });
    if (F.code === 'D4') sigs.push({ name: S.me.name, label: 'Inducted by', time: Date.now() });
    if (!sigs.length) sigs.push({ name: S.me.name, label: roleName(S.me), time: Date.now() });
    if (F.def.pmReview) rf.rows.push({ section: 'Sign off', label: 'Project Manager review', value: 'Pending', flag: '' });
    var extra = [['Completed by', S.me.name]];
    if (F.code === 'D4') extra.push(['Person inducted', subjectName(F) + ((F.a.wco || {}).v ? ', ' + F.a.wco.v : '')]);
    var rec = { form: F.code, formTitle: F.def.ref.split(' — ')[1] + (F.code === 'D4' ? ' — ' + subjectName(F) : ''), formRef: F.def.ref, jobNo: j.jobNo, personId: S.me.id,
      data: { answers: stripSigs(F.a) }, details: jobDetails(extra), rows: rf.rows, photos: rf.photos, sigs: sigs };
    rec.data.answers = F.a; // keep signatures with the answers so a new version can carry them
    if (F.code === 'D3') rec.data.crewIds = present();   // who the register covered — a crew change asks for it again
    rec.fileName = fileName({ date: today() }, name.replace(/[\\/:*?"<>|]/g, ''), S.me.name); rec.folder = folderFor(j);
    await saveRecord(rec); localStorage.removeItem(draftKey(F.code)); localStorage.removeItem(draftKey(F.code) + '.amend');
    history.replaceState({ v: 1 }, ''); S.onBack = null;
    if (S.seq) return seqReturn(recLabel(rec) + ' saved');
    var flagged = rf.rows.filter(function (r) { return r.flag === 'bad'; }).length;
    app.innerHTML = top(F.def.title, jobSub()) + '<div class="body"><div class="card center"><div class="big">' + F.def.icon + '</div><h2 style="margin:0">' + esc(recLabel(rec)) + ' saved</h2><p class="small">' +
      (flagged ? flagged + ' item' + (flagged > 1 ? 's' : '') + ' flagged to the PM' : 'Nothing flagged') + '</p></div></div>' +
      '<div class="foot"><button class="btn" id="pdf">View PDF</button>' + (F.code === 'D10' || F.code === 'D11' || F.code === 'D4' ? '<button class="btn sec" id="again">Add another</button>' : '') +
      '<button class="btn sec" id="home">Back to today</button></div>';
    renderBanner(); $('#home').onclick = function () { renderToday(); }; $('#pdf').onclick = function () { openPdf(rec); };
    var ag = $('#again'); if (ag) ag.onclick = function () { history.pushState({ v: 1 }, ''); startFlow(F.code); };
  }
  function stripSigs(a) { return a; }

  /* Supervisor: all job forms in one place */
  function renderJobForms() {
    var h = top('Job forms', jobSub(), true) + '<div class="body">';
    JOB_FORMS.forEach(function (c) {
      var f = FORMS[c], last = jobRecs([c]).filter(function (r) { return !r.supersededBy; })[0];
      if (f.classA && S.job.cls.indexOf('A') < 0) return;
      var st = last ? (last.date === today() ? chip('done', 'Done ' + hm(last.createdAt)) : chip('wait', 'Last ' + niceDate(last.date))) : chip('lock', 'None yet');
      h += '<button class="tile" data-c="' + c + '"><span class="ic b">' + f.icon + '</span><span class="tx">' + esc(f.title) + '<br><span class="small" style="font-weight:600">' + c + (f.help ? ' · ' + esc(f.help) : '') + '</span></span>' + st + '</button>';
    });
    h += '</div>';
    app.innerHTML = h; bindBack(); renderBanner();
    $$('[data-c]').forEach(function (b) { b.onclick = function () { history.pushState({ v: 1 }, ''); var c = b.getAttribute('data-c'); if (c === 'D11') renderInventory(null); else startFlow(c); }; });
  }

  /* ---------- D13 sign on / off ---------- */
  function renderSignOn() {
    getGps();
    var st = statusFor(S.me.id), on = st.d13 && st.d13.data.in && !st.d13.data.out;
    app.innerHTML = top(on ? 'Sign off site' : 'Sign on to site', jobSub(), true) + '<div class="body"><div class="card center">' +
      '<div class="big">' + (on ? '🚪' : '✅') + '</div><h2 style="margin:0 0 4px">' + esc(S.job.street) + '</h2><div class="small">' + esc(S.me.name) + ' · ' + hm(Date.now()) + '</div>' +
      (on ? '<p class="small">Signed on at ' + hm(st.d13.data.in) + '</p>' : '<p class="small">Signs you in to the site register (D13).</p>') + '</div></div>' +
      '<div class="foot"><button class="btn" id="go">' + (on ? 'Sign off now' : 'Sign on now') + '</button></div>';
    bindBack(); renderBanner();
    $('#go').onclick = async function () {
      this.disabled = true;
      await saveD13(S.me.id, on);
      history.replaceState({ v: 1 }, '');
      toast(on ? 'Signed off ' + hm(Date.now()) + ' — see you next time' : 'Signed on ' + hm(Date.now()));
      renderToday();
    };
  }

  async function saveD13(pid, out) {
    var p = person(pid), st = statusFor(pid);
    var rec = st.d13 || { form: 'D13', jobNo: S.job.jobNo, personId: pid, data: {} };
    if (out) rec.data.out = Date.now(); else rec.data.in = Date.now();
    rec.formTitle = 'Site sign in / out — ' + p.name; rec.formRef = FORMS.D13.ref;
    rec.details = jobDetails([['Name', p.name], ['Company', 'TechClean']]);
    rec.rows = [{ section: 'Site sign in / out register', label: 'Time in', value: rec.data.in ? hm(rec.data.in) : '—', flag: '' },
      { section: 'Site sign in / out register', label: 'Time out', value: rec.data.out ? hm(rec.data.out) : 'Still on site', flag: '' }];
    if (isMgr(p) && S.job.crewIds.indexOf(pid) < 0) { rec.data.mgrVisit = true; rec.details = jobDetails([['Name', p.name], ['Company', 'TechClean — ' + roleName(p)], ['Visit', 'Management site visit']]); }
    else if (S.job.crewIds.indexOf(pid) < 0) { rec.data.notRostered = true; rec.alert = true; rec.rows.push({ section: 'Site sign in / out register', label: 'Rostered on this job today?', value: 'No — not on today’s crew in the schedule', flag: 'bad' }); }
    rec.sigs = [{ name: p.name, label: pid === S.me.id ? 'Signed on own phone' : 'Signed in / out by ' + S.me.name, time: Date.now() }];
    rec.fileName = fileName({ date: today() }, 'Sign in-out', p.name); rec.folder = folderFor(S.job);
    if (out) rec.gpsOut = gpsNow();
    if (st.d13) await saveRecordInPlace(rec); else await saveRecord(rec);
    return rec;
  }

  /* ---------- D1 ARCP / SWMS ---------- */
  function renderD1() {
    getGps();
    var j = S.job, W = worker(), st = statusFor(W.id);
    if (S.amend) st.d1 = null;
    var h = top('Sign ARCP / SWMS', W.name + ' · ' + jobSub(), true) + '<div class="body"><div class="card"><div class="lbl" style="margin-top:0">For this job</div>' +
      '<div style="font-weight:700">ARCP / SSSP ' + esc(CONFIG.ARCP_DOC) + ' Rev ' + esc(arcpRev()) + '</div>' +
      swmsLabels().map(function (s) { return '<div style="font-weight:700">' + esc(s) + '</div>'; }).join('') + (swmsLabels().length ? '' : '<div class="small">No SWMS issued to this job yet — the supervisor or PM issues them from the SWMS library.</div>') +
      jobDocs().filter(function (d) { return d.data.type === 'arcp' || d.data.type === 'swms'; }).map(function (d) { return '<button class="chip wait" style="border:0;padding:10px 14px;margin:6px 6px 0 0" data-doc="' + d.id + '">Read ' + esc(docType(d.data.type)[2]) + (d.data.rev ? ' Rev ' + esc(d.data.rev) : '') + '</button>'; }).join('') +
      '<p class="small">Your supervisor has briefed you on these. Ask if anything isn’t clear.</p></div>' +
      '<div class="card"><p style="margin:0;font-size:18px">' + esc(FORMS.D1.statement) + '</p></div>' +
      (st.d1 ? '<div class="card center"><b>Already signed ' + hm(st.d1.createdAt) + '</b></div>' : '<div class="lbl">Your signature</div>' + sigBox()) +
      '</div>' + (st.d1 ? '' : '<div class="foot"><button class="btn" id="go" disabled>I agree — sign</button></div>');
    app.innerHTML = h; bindBack(); renderBanner();
    $$('[data-doc]').forEach(function (b) { b.onclick = function () { openDoc(recById(b.getAttribute('data-doc'))); }; });
    if (st.d1) return;
    var go = $('#go'), sig = bindSig($('.sigwrap'), function () { go.disabled = sig.isEmpty(); });
    go.onclick = async function () {
      go.disabled = true;
      var rec = { form: 'D1', formTitle: 'ARCP and SSSP acknowledgement — ' + W.name, formRef: FORMS.D1.ref, jobNo: j.jobNo, personId: W.id,
        data: { rev: arcpRev(), swms: swmsLabels() }, statement: FORMS.D1.statement,
        details: jobDetails([['Worker', W.name], ['ARCP / SSSP', CONFIG.ARCP_DOC + ' Rev ' + arcpRev()], ['SWMS', swmsLabels().join('; ') || 'None issued']]),
        rows: [], sigs: [{ name: W.name, label: 'Worker — Rev ' + arcpRev() + ' signed', time: Date.now(), img: sig.data() }] };
      rec.fileName = fileName({ date: today() }, 'ARCP SWMS sign', W.name); rec.folder = folderFor(j);
      await saveRecord(rec);
      history.replaceState({ v: 1 }, ''); if (S.seq) return seqReturn(first(W.name) + ' signed Rev ' + arcpRev()); toast('Signed — thanks ' + first(W.name)); renderToday();
    };
  }

  /* ---------- D5 pre-start: crew tap their name to sign on the supervisor's phone ---------- */
  function renderCrewSign(F) {
    var j = S.job;
    F.crew = F.crew || {};
    if (S.job && S.me && S.me.id === S.job.supervisorId) absentList().forEach(function (pid) { if (!F.crew[pid]) F.crew[pid] = { absent: true }; });
    S.onBack = function () { F.i = F.def.questions.length - 1; saveDraft(F); history.pushState({ v: 1 }, ''); showQ(F); };
    var h = top('Pre-start — crew sign', jobSub(), true) + '<div class="body"><div class="progress"><i style="width:95%"></i></div>' +
      '<div class="q">Hand the phone round — tap your name to sign</div>';
    j.crewIds.forEach(function (pid) {
      var p = person(pid), st = statusFor(pid), c = F.crew[pid], fit;
      if (st.ffw && st.ffw.data.result === 'fail') fit = '<span class="chip todo">Not fit — no entry</span>';
      else if (st.ffw) fit = '<span class="chip done">Fit ✓ ' + hm(st.ffw.createdAt) + '</span>';
      else fit = '<span class="chip new">Fit check not done</span>';
      var face = st.ffw && st.ffw.data.answers.face && st.ffw.data.answers.face.photos && st.ffw.data.answers.face.photos[0];
      if (face) fit = '<img src="' + face.img + '" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:10px;vertical-align:middle;margin-right:8px">' + fit;
      var right = c && c.sig ? '<span class="chip done">Signed ✓</span>' : c && c.absent ? '<span class="chip lock">Not here</span>' : '';
      h += '<button class="crew' + (c && c.sig ? ' signed' : '') + '" data-p="' + pid + '"' + (st.ffw && st.ffw.data.result === 'fail' ? ' disabled' : '') + '><span class="nm">' + esc(p.name) +
        '<br><span class="st">' + fit + '</span></span>' + right + '</button>';
    });
    h += '<p class="small">Someone not on site today? Tap their name, then “Not here”.</p></div><div class="foot"><button class="btn" id="done">Finish pre-start</button></div>';
    app.innerHTML = h; bindBack(); renderBanner();
    var done = $('#done');
    var all = j.crewIds.every(function (pid) { var st = statusFor(pid); return F.crew[pid] || (st.ffw && st.ffw.data.result === 'fail'); });
    done.disabled = !all;
    $$('[data-p]').forEach(function (b) { b.onclick = function () { history.pushState({ v: 1 }, ''); renderOneSign(F, b.getAttribute('data-p')); }; });
    done.onclick = function () { done.disabled = true; finishD5(F); };
  }
  function briefSummary(ans) {
    var A = ans || {}, v = function (k) { return (A[k] || {}).v; };
    var hz = (v('hazsel') || []).map(function (x) { var o = HAZARDS.filter(function (h) { return h[0] === x; })[0]; return o ? o[2] : x; }).join(', ');
    var fa = person(v('firstaid'));
    return '<div class="card" style="font-size:16px"><div class="lbl" style="margin-top:0">Today’s pre-start</div>' +
      '<p style="margin:4px 0"><b>Work:</b> ' + esc(v('tasks') || '—') + '</p>' +
      '<p style="margin:4px 0"><b>Hazards:</b> ' + esc(hz || '—') + '</p>' +
      '<p style="margin:4px 0"><b>Controls:</b> ' + esc(v('controls') || '—') + '</p>' +
      '<p style="margin:4px 0"><b>Toolbox topic:</b> ' + esc(v('topic') || '—') + '</p>' +
      '<p style="margin:4px 0"><b>Emergency:</b> assembly at ' + esc(v('assembly') || '—') + ' · first aider ' + esc(fa ? fa.name : '—') + ' · hospital ' + esc(v('hospital') || '—') + '</p>' +
      ((A.trades || {}).note ? '<p style="margin:4px 0"><b>Other trades / permits:</b> ' + esc(A.trades.note) + '</p>' : '') +
      '<p style="margin:4px 0"><b>You can stop work</b> if you think a control has failed.</p></div>';
  }
  function renderOneSign(F, pid) {
    var p = person(pid);
    S.onBack = function () { history.pushState({ v: 1 }, ''); renderCrewSign(F); };
    app.innerHTML = top(p.name, 'Pre-start ' + longDate(), true) + '<div class="body">' + briefSummary(F.a) + '<div class="card"><p style="margin:0"><b>I was at today\u2019s pre-start. I understand the work, the hazards and controls above, the SWMS and the emergency plan, and my mask check is done.</b></p></div>' +
      '<div class="lbl">Signature</div>' + sigBox() + '</div><div class="foot"><button class="btn" id="go" disabled>Sign</button><button class="btn sec" id="abs">Not here today</button></div>';
    bindBack();
    var go = $('#go'), sig = bindSig($('.sigwrap'), function () { go.disabled = sig.isEmpty(); });
    go.onclick = function () { F.crew[pid] = { sig: sig.data(), time: Date.now() }; saveDraft(F); history.back(); };
    $('#abs').onclick = function () { F.crew[pid] = { absent: true }; saveDraft(F); history.back(); };
  }
  async function finishD5(F) {
    var j = S.job, rf = rowsFrom(F), sigs = [];
    j.crewIds.forEach(function (pid) {
      var p = person(pid), st = statusFor(pid), c = F.crew[pid] || {}, ffw = st.ffw;
      var a = ffw ? ffw.data.answers : {};
      var rpe = ffw ? [answerLabel(FORMS.FFW.questions.filter(function (q) { return q.id === 'rpe'; })[0], (a.rpe || {}).v), 'Clean-shaven ' + ((a.shaven || {}).v === 'yes' ? '✓' : '✗'),
        'Seal ' + ((a.seal || {}).v === 'yes' ? '✓' : '✗'), 'Filters ' + ((a.filters || {}).v === 'yes' ? '✓' : (a.filters || {}).v === 'na' ? 'N/A' : '✗')].join(' · ') : 'Fit check not done';
      rf.rows.push({ section: 'RPE and mask check — every person on site today', label: p.name, value: ffw && ffw.data.result === 'fail' ? 'NOT FIT — no entry' : c.absent ? 'Not on site' : rpe,
        flag: ffw && ffw.data.result === 'pass' ? 'good' : c.absent ? '' : 'bad' });
      if (c.sig) sigs.push({ name: p.name, label: c.carried ? 'Pre-start attendance (signed earlier version)' : 'Pre-start attendance', time: c.time, img: c.sig });
    });
    var rec = { form: 'D5', formTitle: 'Daily pre-start and toolbox record', formRef: FORMS.D5.ref, jobNo: j.jobNo, personId: S.me.id,
      data: { answers: F.a, crew: Object.keys(F.crew).map(function (k) { return { id: k, absent: !!F.crew[k].absent, time: F.crew[k].time || null, sig: F.crew[k].sig || null }; }) },
      details: jobDetails([['Run by', S.me.name], ['Weather / conditions', answerLabel(FORMS.D5.questions[0], (F.a.weather || {}).v)]]),
      rows: rf.rows.filter(function (r) { return r.label !== FORMS.D5.questions[0].q; }), photos: rf.photos,
      sigs: [{ name: S.me.name, label: 'Site Supervisor', time: Date.now() }].concat(sigs) };
    rec.fileName = fileName({ date: today() }, 'Pre-start', S.me.name); rec.folder = folderFor(j);
    await saveRecord(rec); clearDraft('D5');
    history.replaceState({ v: 1 }, ''); S.onBack = null;
    if (S.seq) return seqReturn('Pre-start saved');
    var faults = rf.rows.filter(function (r) { return r.flag === 'bad' && r.section !== 'RPE and mask check — every person on site today'; }).length;
    app.innerHTML = top('Pre-start', jobSub()) + '<div class="body"><div class="card center"><div class="big">📋</div><h2 style="margin:0">Pre-start done</h2><p class="small">' +
      sigs.length + ' signed · ' + (faults ? faults + ' item' + (faults > 1 ? 's' : '') + ' flagged to the PM' : 'nothing flagged') + '</p></div></div>' +
      '<div class="foot"><button class="btn" id="pdf">View PDF</button><button class="btn sec" id="home">Back to today</button></div>';
    renderBanner(); $('#home').onclick = function () { renderToday(); }; $('#pdf').onclick = function () { openPdf(rec); };
  }

  /* ---------- D12 report something ---------- */
  function renderReport() {
    getGps();
    var j = S.job, sup = person(j.supervisorId), R = { type: null, hurt: null, photos: [] };
    var types = FORMS.D12.types;
    var h = top('Report something', j.street + ' · auto-filled', true) + '<div class="body">' +
      '<div class="lbl" style="margin-top:4px">What happened?</div><div class="chips" id="types">' + types.map(function (t) { return '<button data-t="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="lbl">Photo — required</div>' + photoBox('ph') +
      '<div class="lbl">Tell us briefly</div>' + voiceBox('what', 'Tap the mic to speak, or type…') +
      '<div class="lbl">Anyone hurt?</div><div class="yn two" id="hurt"><button data-h="yes" class="bad">Yes</button><button data-h="no" class="good">No</button></div>' +
      '<div id="call" class="stop hidden" style="margin-top:12px;padding:14px"><b>Badly hurt? Call 111 now.</b> Then finish this report.</div>' +
      '<div id="exp" class="hidden"><div class="lbl">Suspected exposure — material and condition</div>' + voiceBox('mat', 'e.g. textured ceiling, broken up') +
      '<div class="lbl">How long?</div><div class="chips" id="dur"><button data-d="Under 15 min">Under 15 min</button><button data-d="15–60 min">15–60 min</button><button data-d="Over 1 hour">Over 1 hour</button></div>' +
      '<div class="lbl">Mask worn at the time?</div><div class="chips" id="rpew"><button data-r="Yes — sealed">Yes — sealed</button><button data-r="Yes — not sealed">Yes — not sealed</button><button data-r="No mask">No mask</button></div></div>' +
      '<div class="lbl">What did you do about it? (optional)</div>' + voiceBox('act', 'e.g. taped off the area, told Jack') +
      '</div><div class="foot"><button class="btn" id="send" disabled>Send to ' + esc(first(sup ? sup.name : 'supervisor')) + ' &amp; PM</button></div>';
    app.innerHTML = h; bindBack(); renderBanner(); bindVoice();
    var send = $('#send');
    function check() { send.disabled = !(R.type && R.hurt && ($('#what').value || '').trim() && R.photos.length); }
    bindPhotos($('#ph'), R.photos, check);
    $$('[data-t]').forEach(function (b) { b.onclick = function () { R.type = b.getAttribute('data-t'); $$('[data-t]').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#exp').classList.toggle('hidden', R.type !== 'exposure'); check(); }; });
    $$('[data-h]').forEach(function (b) { b.onclick = function () { R.hurt = b.getAttribute('data-h'); $$('[data-h]').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#call').classList.toggle('hidden', R.hurt !== 'yes'); check(); }; });
    $$('[data-d]').forEach(function (b) { b.onclick = function () { R.dur = b.getAttribute('data-d'); $$('[data-d]').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    $$('[data-r]').forEach(function (b) { b.onclick = function () { R.rpe = b.getAttribute('data-r'); $$('[data-r]').forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
    $('#what').oninput = check;
    if (S.amend) {
      var od = S.amend.old.data, cl = function (sel) { var b = $(sel); if (b) b.click(); };
      cl('[data-t="' + od.type + '"]'); cl('[data-h="' + od.hurt + '"]');
      $('#what').value = od.what || ''; $('#act').value = od.action || '';
      if (od.exposure) { $('#mat').value = od.exposure.material || ''; if (od.exposure.duration) cl('[data-d="' + od.exposure.duration + '"]'); if (od.exposure.rpe) cl('[data-r="' + od.exposure.rpe + '"]'); }
      (S.amend.old.photos || []).forEach(function (p) { R.photos.push(p); });
      bindPhotos($('#ph'), R.photos, check); check();
    }
    send.onclick = async function () {
      send.disabled = true;
      var tl = types.filter(function (t) { return t[0] === R.type; })[0][1];
      var rows = [{ section: 'Event', label: 'Type of event', value: tl, flag: 'bad' },
        { section: 'Event', label: 'Date and time', value: new Date().toLocaleString('en-NZ'), flag: '' },
        { section: 'Event', label: 'Anyone hurt?', value: R.hurt === 'yes' ? 'Yes' : 'No', flag: R.hurt === 'yes' ? 'bad' : 'good' },
        { section: 'What happened', label: $('#what').value || '(see photos)', value: '', flag: '' }];
      if ($('#act').value) rows.push({ section: 'Immediate action taken', label: $('#act').value, value: '', flag: '' });
      if (R.type === 'exposure') rows.push(
        { section: 'Suspected asbestos exposure', label: 'Material involved and condition', value: $('#mat').value || '—', flag: '' },
        { section: 'Suspected asbestos exposure', label: 'Estimated duration', value: R.dur || '—', flag: '' },
        { section: 'Suspected asbestos exposure', label: 'RPE worn at the time', value: R.rpe || '—', flag: R.rpe && R.rpe !== 'Yes — sealed' ? 'bad' : '' });
      rows.push({ section: 'For the supervisor, PM and HSC', label: 'Notifiable event, investigation, root cause and corrective actions (owner, due date)', value: 'To complete', flag: '' });
      var rec = { form: 'D12', formTitle: 'Incident, near miss and exposure report', formRef: FORMS.D12.ref, jobNo: j.jobNo, personId: S.me.id,
        data: { type: R.type, hurt: R.hurt, what: $('#what').value, action: $('#act').value, exposure: R.type === 'exposure' ? { material: $('#mat').value, duration: R.dur, rpe: R.rpe } : null },
        details: jobDetails([['Reported by', S.me.name], ['Reported to', (sup ? sup.name : 'Supervisor') + ', PM, Branch Manager, HSC, GM Ops']]),
        rows: rows, photos: R.photos, sigs: [{ name: S.me.name, label: 'Reported by', time: Date.now() }], alert: true };
      rec.fileName = fileName({ date: today() }, (R.type === 'hazard' ? 'Hazard' : 'Incident') + ' ' + hhmm(), S.me.name); rec.folder = folderFor(j);
      await saveRecord(rec);
      history.replaceState({ v: 1 }, ''); S.onBack = null;
      app.innerHTML = top('Report sent', j.street) + '<div class="body"><div class="card center"><div class="big">📨</div><h2 style="margin:0">' +
        (isOnline() && CONFIG.API_URL ? 'Sent to ' + esc(first(sup ? sup.name : '')) + ' and the PM' : 'Saved — sends when there’s signal') + '</h2>' +
        '<p class="small">Thanks for reporting it. Tell your supervisor now as well.</p></div></div>' +
        '<div class="foot"><button class="btn" id="pdf">View PDF</button><button class="btn sec" id="home">Back to today</button></div>';
      renderBanner(); $('#home').onclick = function () { renderToday(); }; $('#pdf').onclick = function () { openPdf(rec); };
    };
  }

  /* ---------- D14 visitor (no app set up) ---------- */
  function renderVisitor() {
    getGps();
    var j = S.job, V = {};
    app.innerHTML = top('Visitor sign in', j.street + ' · ' + j.jobNo, true) + '<div class="body">' +
      '<div class="lbl">Your name</div><input type="text" id="vn" autocomplete="name">' +
      '<div class="lbl">Company</div><input type="text" id="vc" autocomplete="organization">' +
      '<div class="lbl">Mobile</div><input type="tel" id="vp" autocomplete="tel">' +
      '<div class="lbl">Why are you here?</div><div class="chips">' + ['Subcontractor', 'Client', 'Consultant / assessor', 'Inspector', 'Delivery', 'Other'].map(function (r) { return '<button data-r="' + r + '">' + r + '</button>'; }).join('') + '</div>' +
      '<div class="lbl">Had the site induction from the supervisor?</div><div class="yn two"><button data-i="yes" class="good">Yes</button><button data-i="no" class="bad">No</button></div>' +
      '<div id="wait" class="stop hidden" style="margin-top:12px;padding:14px">Wait for the supervisor. No entry past the barriers without induction, training and the right PPE and mask.</div>' +
      '<div class="lbl">Signature</div>' + sigBox() + '</div><div class="foot"><button class="btn" id="go" disabled>Sign in</button></div>';
    bindBack();
    var go = $('#go'), sig;
    function check() { go.disabled = !($('#vn').value.trim() && $('#vc').value.trim() && V.reason && V.ind && !sig.isEmpty()); }
    sig = bindSig($('.sigwrap'), check);
    ['#vn', '#vc', '#vp'].forEach(function (s) { $(s).oninput = check; });
    $$('[data-r]').forEach(function (b) { b.onclick = function () { V.reason = b.getAttribute('data-r'); $$('[data-r]').forEach(function (x) { x.classList.toggle('on', x === b); }); check(); }; });
    $$('[data-i]').forEach(function (b) { b.onclick = function () { V.ind = b.getAttribute('data-i'); $$('[data-i]').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#wait').classList.toggle('hidden', V.ind !== 'no'); check(); }; });
    go.onclick = async function () {
      go.disabled = true;
      var name = $('#vn').value.trim();
      var rec = { form: 'D14', formTitle: 'Visitor entry — ' + name, formRef: FORMS.D14.ref, jobNo: j.jobNo, personId: 'V:' + name,
        data: { name: name, company: $('#vc').value.trim(), phone: $('#vp').value.trim(), reason: V.reason, inducted: V.ind, in: Date.now() },
        details: jobDetails([['Visitor', name], ['Company', $('#vc').value.trim()], ['Mobile', $('#vp').value.trim()], ['Reason for visit', V.reason]]),
        rows: [{ section: 'Visitor entry', label: 'Site induction given', value: V.ind === 'yes' ? 'Yes' : 'No — wait for supervisor', flag: V.ind === 'yes' ? 'good' : 'bad' },
          { section: 'Visitor entry', label: 'Time in', value: hm(Date.now()), flag: '' }],
        sigs: [{ name: name, label: 'Visitor', time: Date.now(), img: sig.data() }] };
      rec.fileName = fileName({ date: today() }, 'Visitor', name); rec.folder = folderFor(j);
      await saveRecord(rec);
      localStorage.setItem('tc.visitor', rec.id);
      history.replaceState({ v: 1 }, ''); S.onBack = null;
      app.innerHTML = top('Signed in', j.street) + '<div class="body"><div class="card center"><div class="big">🪪</div><h2 style="margin:0">Thanks ' + esc(first(name)) + '</h2>' +
        '<p class="small">Signed in ' + hm(Date.now()) + '. Scan the QR again when you leave to sign out.</p></div></div>' +
        (S.me ? '<div class="foot"><button class="btn sec" id="home">Back</button></div>' : '');
      var hb = $('#home'); if (hb) hb.onclick = function () { renderToday(); };
    };
  }

  /* ---------- site file: everything for this job, viewable on site (works offline) ---------- */
  var PARTD = [['D1', 'Worker ARCP and SSSP acknowledgement', ['D1']], ['D2', 'Job start checklist', ['D2']], ['D3', 'Site personnel register', ['D3']],
    ['D4', 'Site induction record', ['D4']], ['D5', 'Daily pre-start and toolbox record', ['D5', 'FFW']], ['D6', 'Asbestos removal quality control', ['D6']],
    ['D7', 'Enclosure smoke test (timed, with the assessor)', ['D7']], ['D8', 'Weekly site inspection', ['D8']], ['D9', 'End of shift decontamination and RPE check', ['D9']],
    ['D10', 'Waste movement and disposal record', ['D10']], ['D11', 'Inventory sign out sheet', ['D11']], ['D12', 'Incident, near miss and exposure report', ['D12']],
    ['D13', 'Site sign in / out register', ['D13']], ['D14', 'Visitor entry record', ['D14']],
    ['AUD', 'Site audits (TC-QA-AUD-001)', ['AUD']], ['CA', 'Corrective actions and follow-ups', ['CAR', 'CAF']]];
  function jobRecs(codes) {
    return RECS.filter(function (r) { return S.job && r.jobNo === S.job.jobNo && (!codes || codes.indexOf(r.form) >= 0); })
      .sort(function (a, b) { return (b.date + b.createdAt) > (a.date + a.createdAt) ? 1 : -1; });
  }
  function regToday() {
    return jobRecs(['D13', 'D14']).filter(function (r) { return r.date === today() && !r.supersededBy; });
  }
  function onSiteNow() { return regToday().filter(function (r) { return r.data.in && !r.data.out; }); }
  function regName(r) { return r.form === 'D14' ? r.data.name + ' (' + r.data.company + ', visitor)' : (person(r.personId) || {}).name || r.personId; }
  function isSup() { return S.me && S.job && S.me.id === S.job.supervisorId; }
  var MGR_ROLES = { pm: 'Project Manager', branch_manager: 'Branch Manager', hsc: 'H&S Coordinator', admin: 'GM Operations', manager: 'Manager' };
  function isMgr(p) { p = p || S.me; return !!(p && MGR_ROLES[p.role]); }
  function roleName(p) { return MGR_ROLES[(p || {}).role] || ((p || {}).role === 'supervisor' ? 'Site Supervisor' : 'Crew'); }
  function whoMade(r) { var p = person(r.personId); return p ? p.name : r.form === 'D14' ? r.data.name : r.personId; }
  function recLabel(r) { return r.fileName.replace(/^\d{4}-\d\d-\d\d /, '').replace('.pdf', ''); }
  function niceDate(d) { var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }); }

  function renderSiteFile() {
    var j = S.job, now = onSiteNow();
    var h = top('Site file', j.street + ' · ' + j.jobNo, true) + '<div class="body">';
    h += '<div class="card"><div class="lbl" style="margin-top:0">On site now — ' + now.length + '</div><div class="list">';
    if (!now.length) h += '<div class="small">Nobody signed on.</div>';
    now.forEach(function (r) {
      h += '<div class="it"><span style="font-weight:700">' + esc(regName(r)) + '</span><span>' + chip('done', 'In ' + hm(r.data.in)) +
        (isSup() && r.form === 'D14' ? ' <button class="chip todo" style="border:0" data-out="' + r.id + '">Sign out</button>' : '') + '</span></div>';
    });
    h += '</div><button class="btn sec" id="reg" style="margin-top:12px;font-size:18px;min-height:54px;padding:12px">Full sign-in register today</button></div>';
    var docs = jobDocs();
    h += '<div class="card"><div class="lbl" style="margin-top:0">Crew tickets and certificates</div><div class="list">' + S.job.crewIds.map(function (pid) {
      var p = person(pid), cl = certList(p), bad = cl.filter(function (c) { return c.expired; }), soon = cl.filter(function (c) { return c.soon; });
      return '<button class="it" style="width:100%;border:0;background:none;text-align:left" data-cert="' + pid + '"><span><b>' + esc(p.name) + '</b><br><span class="small">' + cl.length + ' on record</span></span>' +
        (bad.some(function (c) { return c.stopWork; }) ? chip('todo', 'Fit test expired') : bad.length ? chip('new', bad.length + ' expired') : soon.length ? chip('new', soon.length + ' due soon') : chip('done', 'All current')) + '</button>';
    }).join('') + '</div></div>';
    var sw = jobSwms();
    h += '<div class="card"><div class="lbl" style="margin-top:0">SWMS on this job — register (ARCP C3)</div><div class="list">' + (sw.length ? sw.map(function (x) {
      var lib = libItem(x.code), newer = lib && lib.rev !== x.rev;
      return '<button class="it" style="width:100%;border:0;background:none;text-align:left" data-lib="' + esc(x.code) + '"><span><b>' + esc(x.code) + '</b> ' + esc(x.title) + '<br><span class="small">Rev ' + esc(x.rev) + ' · ' + esc(x.kind === 'task' ? 'task' : 'material') + (x.area ? ' · ' + esc(x.area) : '') + ' · issued ' + niceDate(x.date) + '</span></span>' + (newer ? chip('new', 'Rev ' + lib.rev + ' out') : '') + '</button>';
    }).join('') : '<div class="small">None issued yet.</div>') + '</div><button class="btn sec" id="lib" style="margin-top:12px;font-size:18px;min-height:54px;padding:12px">📚 SWMS library</button></div>';
    var ac = actCounts();
    h += '<button class="card" style="width:100%;text-align:left;border:0" id="acts"><div class="lbl" style="margin-top:0">Corrective actions</div><div class="it" style="border:0;padding:0"><span>' +
      (ac.total ? ac.open + ' open · ' + ac.awaiting + ' awaiting check · ' + ac.closed + ' closed' : 'None raised') + '</span>' + (ac.overdue ? chip('todo', ac.overdue + ' overdue') : ac.open ? chip('new', 'Open') : chip('done', 'Clear')) + '</div></button>';
    h += '<div class="card"><div class="lbl" style="margin-top:0">Job documents</div><div class="list">';
    if (!docs.length) h += '<div class="small">No documents uploaded yet.' + (canUpload() ? ' Add the ARCP and the asbestos survey so they’re here on site with no signal.' : '') + '</div>';
    docs.forEach(function (d) {
      var t = docType(d.data.type);
      h += '<div class="it"><span><b>' + t[1] + ' ' + esc(d.data.title) + '</b><br><span class="small">' + esc(t[2]) + (d.data.rev ? ' · Rev ' + esc(d.data.rev) : '') + ' · added ' + niceDate(d.date) + (d.version > 1 ? ' · v' + d.version : '') + '</span></span>' +
        '<button class="chip wait" style="border:0;padding:10px 14px" data-doc="' + d.id + '">Open</button></div>';
    });
    h += '</div>' + (canUpload() ? '<button class="btn sec" id="adddoc" style="margin-top:12px;font-size:18px;min-height:54px;padding:12px">➕ Add to job — document, photos, permit</button>' : '') + '</div>';
    var inv = invSummary().filter(function (x) { return x.kind === 'c' && x.out; });
    if (inv.length) {
      var tot = 0, unp = 0;
      h += '<div class="card"><div class="lbl" style="margin-top:0">Consumables on this job</div><div class="list">' + inv.map(function (x) {
        if (x.cost != null) tot += x.used * x.cost; else if (x.used) unp++;
        return '<div class="it"><span>' + esc(x.name) + '</span><b>' + x.used + ' used <span class="small">(' + x.out + ' out, ' + x.back + ' back)</span></b></div>';
      }).join('') + '</div><div class="small" style="margin-top:6px">Quantities only — costed in WorkflowMax.</div>' +
        '<button class="btn sec" id="invpdf" style="margin-top:10px;font-size:18px;min-height:54px;padding:12px">Inventory summary PDF</button></div>';
    }
    h += '<div class="card"><div class="lbl" style="margin-top:0">Forms — ARCP Part D, audits and actions</div><div class="list">';
    PARTD.forEach(function (d, i) {
      var n = d[2] ? jobRecs(d[2]).filter(function (r) { return !r.supersededBy; }).length : null;
      h += '<button class="it" style="width:100%;border:0;background:none;text-align:left;padding:12px 0" data-f="' + i + '"><span><b>' + d[0] + '</b> ' + esc(d[1]) + '</span>' +
        (d[2] ? chip(n ? 'done' : 'lock', n + ' record' + (n === 1 ? '' : 's')) : chip('lock', 'Site App Pro')) + '</button>';
    });
    h += '</div></div>';
    h += '<p class="small">' + (CONFIG.API_URL ? 'Records from every phone on this job are kept on this phone for use with no signal.' :
      'Demo: shows records made on this phone. Once connected, it shows every record for the job from every phone, and keeps them for use with no signal.') + '</p></div>';
    app.innerHTML = h; bindBack(); renderBanner();
    var acb = $('#acts'); if (acb) acb.onclick = function () { enter(); S.actsFrom = 'file'; renderActions(); };
    $('#reg').onclick = function () { history.pushState({ v: 1 }, ''); renderRegister(); };
    $$('[data-doc]').forEach(function (b) { b.onclick = function () { openDoc(recById(b.getAttribute('data-doc'))); }; });
    var ip = $('#invpdf'); if (ip) ip.onclick = invPdf;
    $$('[data-cert]').forEach(function (b) { b.onclick = function () { history.pushState({ v: 1 }, ''); renderCerts(b.getAttribute('data-cert')); }; });
    var ad = $('#adddoc'); if (ad) ad.onclick = function () { history.pushState({ v: 1 }, ''); renderAddDoc(function () { renderSiteFile(); }); };
    var lb = $('#lib'); if (lb) lb.onclick = function () { enter(function () { renderSiteFile(); }); renderLibrary(); };
    $$('[data-lib]').forEach(function (b) { b.onclick = function () { enter(function () { renderSiteFile(); }); renderLibItem(b.getAttribute('data-lib')); }; });
    $$('[data-f]').forEach(function (b) { b.onclick = function () { history.pushState({ v: 1 }, ''); renderFormList(PARTD[+b.getAttribute('data-f')]); }; });
    $$('[data-out]').forEach(function (b) { b.onclick = function () { signOutVisitor(b.getAttribute('data-out')).then(renderSiteFile); }; });
    S.onBack = null;
  }

  function renderCerts(pid) {
    var p = person(pid), cl = certList(p);
    S.onBack = function () { history.pushState({ v: 1 }, ''); renderSiteFile(); };
    var h = top(p.name, 'Tickets and certificates', true) + '<div class="body"><div class="card list">';
    if (!cl.length) h += '<div class="small">No certificates on record.</div>';
    cl.forEach(function (c, i) {
      h += '<button class="it" style="width:100%;border:0;background:none;text-align:left" data-c="' + i + '"><span><b>' + esc(c.name) + '</b><br><span class="small">' + (c.noExpiry ? 'Held since ' : c.expired ? 'Expired ' : 'Expires ') + certDate(c.date) +
        (c.dateOnly ? ' · date only' : c.url ? ' · 📄 tap to view' : c.file ? ' · copy on file' : ' · no copy on file') + '</span></span>' +
        (c.expired ? chip('todo', c.stopWork ? 'Expired — stop work' : 'Expired') : c.soon ? chip('new', c.days + ' days left') : chip('done', 'Current')) + '</button>';
    });
    h += '</div><p class="small">From the Training & Medical Register. Tap a certificate to see the actual copy from the person\u2019s training folder. Copies for today\u2019s crew are kept on the phone for use with no signal.</p></div>';
    app.innerHTML = h; bindBack(); renderBanner();
    $$('[data-c]').forEach(function (b) { b.onclick = function () {
      var c = cl[+b.getAttribute('data-c')];
      if (c.dateOnly) return toast(c.name + ' — date only, no copy kept');
      if (c.url) return openDoc({ file: c.url, fileName: c.file || (c.name + '.pdf'), data: { mime: /\.(png|jpe?g)$/i.test(c.file || '') ? 'image/jpeg' : 'application/pdf', title: p.name + ' — ' + c.name } });
      toast(CONFIG.API_URL ? 'No copy on file for this certificate' : 'Demo: the real certificate opens here once the back end is connected');
    }; });
  }
  function regRows(list) {
    return list.map(function (r) {
      return { section: 'Site sign in / out register — ' + niceDate(r.date), label: regName(r) + (r.version > 1 ? ' (v' + r.version + ')' : ''),
        value: 'In ' + (r.data.in ? hm(r.data.in) : '—') + '   Out ' + (r.data.out ? hm(r.data.out) : 'on site'), flag: r.data.out ? '' : 'good' };
    });
  }
  function renderRegister() {
    var list = regToday();
    S.onBack = function () { history.pushState({ v: 1 }, ''); renderSiteFile(); };
    var h = top('Sign-in register', longDate() + ' · ' + S.job.street, true) + '<div class="body"><div class="card list">';
    if (!list.length) h += '<div class="small">Nobody has signed in today.</div>';
    list.forEach(function (r) {
      h += '<button class="it" style="width:100%;border:0;background:none;text-align:left" data-r="' + r.id + '"><span><b>' + esc(regName(r)) + '</b><br><span class="small">In ' +
        (r.data.in ? hm(r.data.in) : '—') + ' · Out ' + (r.data.out ? hm(r.data.out) : '—') + '</span></span>' + (r.data.out ? chip('lock', 'Gone') : chip('done', 'On site')) + '</button>';
    });
    h += '</div></div><div class="foot"><button class="btn" id="pdf">Register PDF (roll call)</button></div>';
    app.innerHTML = h; bindBack(); renderBanner();
    $$('[data-r]').forEach(function (b) { b.onclick = function () { history.pushState({ v: 1 }, ''); renderRecord(recById(b.getAttribute('data-r'))); }; });
    $('#pdf').onclick = function () {
      openPdf({ id: 'REG' + today().replace(/-/g, ''), formTitle: 'Site sign in / out register', formRef: FORMS.D13.ref, arcpRev: arcpRev(), createdAt: Date.now(), gps: gpsNow(),
        details: jobDetails([['On site now', String(onSiteNow().length)], ['Printed by', S.me ? S.me.name : '']]), rows: regRows(list), sigs: [],
        fileName: today() + ' Sign-in register.pdf' });
    };
  }
  function recById(id) { return RECS.filter(function (r) { return r.id === id; })[0]; }

  function renderFormList(d) {
    var list = jobRecs(d[2] || []);
    S.onBack = function () { history.pushState({ v: 1 }, ''); renderSiteFile(); };
    var h = top(d[0] + ' ' + d[1], S.job.street, true) + '<div class="body">';
    if (!d[2]) {
      h += '<div class="card"><p style="margin-top:0"><b>Done in Site App Pro for now.</b></p><p class="small">This form comes into the H&amp;S app in Phase 2. The blank form is in Part D of the ARCP.</p></div>';
    } else {
      h += '<div class="card list">';
      if (!list.length) h += '<div class="small">No records yet for this job.</div>';
      list.forEach(function (r) {
        h += '<button class="it" style="width:100%;border:0;background:none;text-align:left' + (r.supersededBy ? ';opacity:.55' : '') + '" data-r="' + r.id + '"><span><b>' + esc(recLabel(r)) + '</b><br><span class="small">' +
          niceDate(r.date) + ' · ' + hm(r.updatedAt) + (r.supersededBy ? ' · replaced by newer version' : '') + '</span></span>' + chip(r.version > 1 ? 'new' : 'wait', 'v' + (r.version || 1)) + '</button>';
      });
      h += '</div>';
    }
    h += '</div>' + (d[2] ? '<div class="foot"><button class="btn sec" id="blank">Blank form (print backup)</button></div>' : '');
    app.innerHTML = h; bindBack(); renderBanner();
    $$('[data-r]').forEach(function (b) { b.onclick = function () { history.pushState({ v: 1 }, ''); renderRecord(recById(b.getAttribute('data-r')), d); }; });
    var bl = $('#blank'); if (bl) bl.onclick = function () { blankPdf(d[2][0]); };
  }

  function canAmend(r) {
    if (!S.me || r.supersededBy || !S.job || S.job.status === 'closed') return false;
    if (r.form === 'FFW' || r.form === 'D1') return r.personId === S.me.id;
    if (r.form === 'D14') return isSup();
    return r.personId === S.me.id || isSup() || isMgr();
  }
  function renderRecord(r, d) {
    var hist = RECS.filter(function (x) { return (x.rootId || x.id) === (r.rootId || r.id); }).sort(function (a, b) { return (b.version || 1) - (a.version || 1); });
    S.onBack = function () { history.pushState({ v: 1 }, ''); if (d) renderFormList(d); else renderSiteFile(); };
    var h = top(recLabel(r), niceDate(r.date) + ' · version ' + (r.version || 1), true) + '<div class="body"><div class="card list">' +
      '<div class="it"><span>Form</span><b>' + esc(r.formRef.split(' — ')[0]) + '</b></div>' +
      '<div class="it"><span>Made by</span><b>' + esc(r.amendedBy || whoMade(r)) + '</b></div>' +
      '<div class="it"><span>Saved</span><b>' + hm(r.updatedAt) + '</b></div>' +
      '<div class="it"><span>Status</span><b>' + (r.supersededBy ? 'Replaced by newer version' : r.status === 'sent' ? 'Sent and filed ✓' : CONFIG.API_URL ? 'Waiting to send' : 'On this phone') + '</b></div>' +
      (r.reason ? '<div class="it"><span>Why new version</span><b style="text-align:right">' + esc(r.reason) + '</b></div>' : '') + '</div>';
    if (hist.length > 1) {
      h += '<div class="card"><div class="lbl" style="margin-top:0">All versions</div><div class="list">' + hist.map(function (x) {
        return '<button class="it" style="width:100%;border:0;background:none;text-align:left" data-v="' + x.id + '"><span><b>Version ' + (x.version || 1) + '</b>' + (x.id === r.id ? ' (showing)' : '') +
          '<br><span class="small">' + hm(x.updatedAt) + (x.reason ? ' · ' + esc(x.reason) : ' · original') + '</span></span>' + (x.supersededBy ? chip('lock', 'Replaced') : chip('done', 'Current')) + '</button>';
      }).join('') + '</div></div>';
    }
    h += '<p class="small">Earlier versions are never deleted — they stay in the job file.</p></div><div class="foot"><button class="btn" id="pdf">View / share PDF</button>' +
      (canAmend(r) ? '<button class="btn sec" id="amend">Make a new version</button>' : '') + '</div>';
    app.innerHTML = h; bindBack(); renderBanner();
    $('#pdf').onclick = function () { openPdf(r); };
    var a = $('#amend'); if (a) a.onclick = function () { history.pushState({ v: 1 }, ''); renderAmend(r, d); };
    $$('[data-v]').forEach(function (b) { b.onclick = function () { if (b.getAttribute('data-v') !== r.id) { history.pushState({ v: 1 }, ''); renderRecord(recById(b.getAttribute('data-v')), d); } }; });
  }

  function renderAmend(r, d) {
    var why = null, reasons = ['Correction', 'Missing information', 'ARCP or SWMS amended', 'Late sign-out', 'Other'];
    S.onBack = function () { history.pushState({ v: 1 }, ''); renderRecord(r, d); };
    app.innerHTML = top('New version', recLabel(r), true) + '<div class="body"><div class="q">Why a new version?</div>' +
      '<div class="chips">' + reasons.map(function (x) { return '<button data-w="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
      '<div class="lbl">What changed (optional)</div>' + voiceBox('wn', 'Tap the mic to speak, or type…') +
      '<p class="small">The form opens with the old answers filled in. Change what’s needed and save. Version ' + (r.version || 1) + ' is kept.</p></div>' +
      '<div class="foot"><button class="btn" id="go" disabled>Start new version</button></div>';
    bindBack(); renderBanner(); bindVoice();
    $$('[data-w]').forEach(function (b) { b.onclick = function () { why = b.getAttribute('data-w'); $$('[data-w]').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#go').disabled = false; }; });
    $('#go').onclick = function () {
      var note = $('#wn').value.trim();
      S.amend = { old: r, reason: why + (note ? ': ' + note : '') };
      history.replaceState({ v: 1 }, '');
      if (r.form === 'D11') renderInventory(r.data.dir, r);
      else if (r.form === 'FFW' || (FORMS[r.form] && FORMS[r.form].questions)) startFlow(r.form);
      else if (r.form === 'D12') renderReport();
      else if (r.form === 'D1') renderD1();
      else renderTimeEdit(r);
    };
  }

  /* D13 / D14: correct sign-in and sign-out times (e.g. someone forgot to sign out) */
  function toHHMM(t) { if (!t) return ''; var x = new Date(t); return pad(x.getHours()) + ':' + pad(x.getMinutes()); }
  function fromHHMM(date, v) { if (!v) return null; var p = date.split('-'), q = v.split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1]).getTime(); }
  function renderTimeEdit(r) {
    var amend = S.amend;
    S.onBack = function () { S.amend = null; history.pushState({ v: 1 }, ''); renderRecord(r); };
    app.innerHTML = top('Change times', regName(r) + ' · ' + niceDate(r.date), true) + '<div class="body">' +
      '<div class="lbl">Time in</div><input type="time" id="tin" value="' + toHHMM(r.data.in) + '">' +
      '<div class="lbl">Time out</div><input type="time" id="tout" value="' + toHHMM(r.data.out) + '">' +
      '<p class="small">Reason: ' + esc(amend.reason) + '</p></div><div class="foot"><button class="btn" id="go">Save new version</button></div>';
    bindBack();
    $('#go').onclick = async function () {
      this.disabled = true;
      var n = JSON.parse(JSON.stringify(r));
      ['id', 'pdf', 'status', 'supersededBy', 'supersededAt', 'createdAt', 'sentAt', 'filedTo', 'version', 'supersedes', 'rootId', 'reason', 'amendedBy'].forEach(function (k) { delete n[k]; });
      n.formTitle = n.formTitle.replace(/ \(version \d+\)$/, '');
      n.details = n.details.filter(function (x) { return ['Version', 'Reason for new version', 'New version made by'].indexOf(x[0]) < 0; });
      n.data.in = fromHHMM(r.date, $('#tin').value); n.data.out = fromHHMM(r.date, $('#tout').value);
      n.rows = n.rows.map(function (row) {
        if (row.label === 'Time in') row.value = n.data.in ? hm(n.data.in) : '—';
        if (row.label === 'Time out') row.value = n.data.out ? hm(n.data.out) : 'Still on site';
        return row;
      });
      if (n.form === 'D14' && !n.rows.some(function (x) { return x.label === 'Time out'; })) n.rows.push({ section: 'Visitor entry', label: 'Time out', value: n.data.out ? hm(n.data.out) : '—', flag: '' });
      n.sigs = (n.sigs || []).concat([{ name: S.me.name, label: 'Times changed by', time: Date.now() }]);
      await saveRecord(n);
      toast('New version saved'); history.replaceState({ v: 1 }, ''); renderRecord(recById(n.id));
    };
  }
  async function signOutVisitor(id) {
    var r = recById(id); if (!r) return;
    r.data.out = Date.now();
    r.rows = r.rows.filter(function (x) { return x.label !== 'Time out'; }).concat([{ section: 'Visitor entry', label: 'Time out', value: hm(r.data.out), flag: '' }]);
    r.createdAt = r.createdAt; r.id = r.id;
    await saveRecordInPlace(r);
    toast(r.data.name + ' signed out ' + hm(r.data.out));
  }
  async function saveRecordInPlace(r) {
    r.updatedAt = Date.now(); r.status = 'saved';
    try { r.pdf = (await PDF.build(r)).output('datauristring'); } catch (e) {}
    await DB.put(r); await refreshRecs(); sendOutbox();
  }

  /* ---------- D11 inventory sign-out sheet: equipment and consumables, out to site and back ---------- */
  function money(n) { return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function invSummary() {
    var t = {};
    live('D11').forEach(function (r) {
      (r.data.items || []).forEach(function (it) {
        var k = it.kind + ':' + (it.id || it.name);
        if (!t[k]) t[k] = { name: it.name, unit: it.unit, kind: it.kind, cost: it.cost, out: 0, back: 0 };
        t[k][r.data.dir === 'back' ? 'back' : 'out'] += +it.qty || 0;
      });
    });
    return Object.keys(t).map(function (k) { var x = t[k]; x.used = Math.max(0, x.out - x.back); return x; });
  }
  function renderInventory(dir, old) {
    if (!dir) {
      S.onBack = null;
      app.innerHTML = top('Inventory', jobSub(), true) + '<div class="body"><div class="q">Out to site, or back to the yard?</div><div class="pics">' +
        '<button data-d="out"><span>📤</span>Out to site</button><button data-d="back"><span>📥</span>Back to the yard</button></div>' +
        '<p class="small">Count consumables and equipment as they go out and come back. What’s used on the job is worked out for you.</p></div>';
      bindBack(); renderBanner();
      $$('[data-d]').forEach(function (b) { b.onclick = function () { history.pushState({ v: 1 }, ''); renderInventory(b.getAttribute('data-d')); }; });
      return;
    }
    var Q = {}, other = [], photos = [], sum = {};
    invSummary().forEach(function (x) { sum[x.kind + ':' + x.name] = x; });
    if (old) { (old.data.items || []).forEach(function (it) { if (it.id) Q[it.kind + ':' + it.id] = +it.qty; else other.push({ name: it.name, qty: +it.qty, unit: it.unit || 'each' }); }); photos = (old.photos || []).slice(); }
    var back = dir === 'back';
    function row(kind, it) {
      var k = kind + ':' + it.id, s = sum[kind + ':' + it.name], q = Q[k] || 0;
      return '<div class="it" style="padding:10px 0"><span style="flex:1;min-width:0;overflow-wrap:anywhere"><b>' + esc(it.name) + '</b><br><span class="small">per ' + esc(it.unit) +
        (back && s ? ' · out ' + s.out + (s.back ? ', back ' + s.back : '') : '') + (!back && s && s.out ? ' · already out ' + s.out : '') + '</span></span>' +
        '<span style="display:flex;align-items:center;gap:4px;flex:none"><button type="button" class="chip lock" style="border:0;width:46px;height:46px;font-size:26px;padding:0" data-m="' + k + '">−</button>' +
        '<b id="q-' + k.replace(':', '_') + '" style="min-width:34px;text-align:center;font-size:22px">' + q + '</b>' +
        '<button type="button" class="chip done" style="border:0;width:46px;height:46px;font-size:26px;padding:0" data-p="' + k + '">＋</button></span></div>';
    }
    var h = top(back ? 'Inventory back to the yard' : 'Inventory out to site', jobSub(), true) + '<div class="body">' +
      '<p class="help">' + (back ? 'Count what’s coming back — unused consumables and every piece of equipment. Anything not back shows as used or still on site.' : 'Count everything going to site.') + '</p>' +
      '<div class="lbl">Consumables</div><div class="card list" style="padding:4px 14px">' + INVENTORY.consumables.map(function (it) { return row('c', it); }).join('') + '</div>' +
      '<div class="lbl">Equipment</div><div class="card list" style="padding:4px 14px">' + INVENTORY.equipment.map(function (it) { return row('e', it); }).join('') + '</div>' +
      '<div class="lbl">Other items</div><div id="others"></div><div style="display:flex;gap:8px"><input type="text" id="oname" placeholder="Item" style="flex:1;min-width:0;width:auto"><input type="text" id="oqty" inputmode="numeric" placeholder="Qty" style="width:90px"><button class="btn sec" id="oadd" type="button" style="width:auto;padding:0 16px;min-height:auto">Add</button></div>' +
      '<div class="lbl">Photo of the load (optional)</div>' + photoBox('ph') +
      '</div><div class="foot"><button class="btn" id="go" disabled>Save inventory</button></div>';
    app.innerHTML = h; bindBack(); renderBanner();
    if (S.seq) S.onBack = function () { seqReturn(); };
    var go = $('#go');
    function total() { var n = 0; for (var k in Q) n += Q[k]; other.forEach(function (o) { n += o.qty; }); return n; }
    function check() { go.disabled = total() === 0; go.textContent = total() ? 'Save inventory (' + total() + ' items)' : 'Save inventory'; }
    function drawOthers() {
      $('#others').innerHTML = other.map(function (o, i) { return '<div class="it card" style="margin-bottom:8px;padding:10px 14px"><b>' + esc(o.name) + '</b><span>' + o.qty + ' <button type="button" class="link" data-ro="' + i + '">remove</button></span></div>'; }).join('');
      $$('[data-ro]').forEach(function (b) { b.onclick = function () { other.splice(+b.getAttribute('data-ro'), 1); drawOthers(); check(); }; });
    }
    function step(k, d) { Q[k] = Math.max(0, (Q[k] || 0) + d); $('#q-' + k.replace(':', '_')).textContent = Q[k]; check(); }
    $$('[data-p]').forEach(function (b) { b.onclick = function () { step(b.getAttribute('data-p'), 1); }; });
    $$('[data-m]').forEach(function (b) { b.onclick = function () { step(b.getAttribute('data-m'), -1); }; });
    $('#oadd').onclick = function () { var n = $('#oname').value.trim(), q = parseInt($('#oqty').value, 10) || 1; if (!n) return; other.push({ name: n, qty: q, unit: 'each' }); $('#oname').value = ''; $('#oqty').value = ''; drawOthers(); check(); };
    bindPhotos($('#ph'), photos, function () {});
    drawOthers(); check();
    go.onclick = async function () {
      go.disabled = true;
      var items = [], rows = [], cost = 0, costed = false;
      [['c', INVENTORY.consumables, 'Consumables'], ['e', INVENTORY.equipment, 'Equipment']].forEach(function (g) {
        g[1].forEach(function (it) {
          var q = Q[g[0] + ':' + it.id] || 0; if (!q) return;
          items.push({ kind: g[0], id: it.id, name: it.name, unit: it.unit, qty: q, cost: it.cost == null ? null : it.cost });
          var line = q + ' ' + it.unit + (q > 1 && it.unit !== 'each' ? 's' : '');
          if (g[0] === 'c' && it.cost != null) { line += '  ·  ' + money(q * it.cost); cost += q * it.cost; costed = true; }
          rows.push({ section: g[2] + (back ? ' — back to the yard' : ' — out to site'), label: it.name, value: line, flag: '' });
        });
      });
      other.forEach(function (o) { items.push({ kind: 'o', name: o.name, unit: o.unit, qty: o.qty, cost: null }); rows.push({ section: 'Other items', label: o.name, value: String(o.qty), flag: '' }); });
      if (costed) rows.push({ section: 'Consumables cost (priced items)', label: back ? 'Value returned to the yard' : 'Value sent to site', value: money(cost), flag: '' });
      var rec = { form: 'D11', formTitle: 'Inventory sign out sheet — ' + (back ? 'back to the yard' : 'out to site'), formRef: FORMS.D11.ref, jobNo: S.job.jobNo, personId: S.me.id,
        data: { dir: dir, items: items }, details: jobDetails([['Direction', back ? 'Back to the yard' : 'Out to site'], ['Signed by', S.me.name]]),
        rows: rows, photos: photos, sigs: [{ name: S.me.name, label: back ? 'Received back' : 'Signed out', time: Date.now() }] };
      rec.fileName = fileName({ date: today() }, 'Inventory ' + (back ? 'back' : 'out') + ' ' + hhmm(), S.me.name); rec.folder = folderFor(S.job);
      await saveRecord(rec);
      history.replaceState({ v: 1 }, '');
      if (S.seq) return seqReturn('Inventory saved');
      toast('Inventory saved'); renderToday();
    };
  }
  function invPdf() {
    var rows = [], total = 0, priced = 0, unpriced = 0;
    invSummary().forEach(function (x) {
      var used = x.kind === 'e' ? (x.out - x.back > 0 ? (x.out - x.back) + ' not back' : 'All back') : x.used + ' used';
      var line = 'Out ' + x.out + ' · Back ' + x.back + ' · ' + used;
      if (x.kind === 'c') { if (x.cost != null) { line += ' · ' + money(x.used * x.cost); total += x.used * x.cost; priced++; } else if (x.used) unpriced++; }
      rows.push({ section: x.kind === 'c' ? 'Consumables' : x.kind === 'e' ? 'Equipment' : 'Other items', label: x.name + ' (' + x.unit + ')', value: line, flag: x.kind === 'e' && x.out > x.back ? 'bad' : '' });
    });
    rows.push({ section: 'Costs', label: 'Consumables are costed in WorkflowMax from these quantities', value: '', flag: '' });
    openPdf({ id: 'INV-' + S.job.jobNo, formTitle: 'Job inventory and consumables used', formRef: FORMS.D11.ref, arcpRev: arcpRev(), createdAt: Date.now(), gps: null,
      details: jobDetails([['Printed by', S.me ? S.me.name : '']]), rows: rows, sigs: [], fileName: today() + ' Inventory and consumables summary.pdf' });
  }

  /* ---------- upload a document (ARCP, survey report, WSN, clearance certificate …) ---------- */
  function canUpload() { return (isSup() || isMgr()) && S.job && S.job.status !== 'closed'; }
  /* Add to job: any document, a multi-page paper scan, site photos or a permit — saved on the phone and filed to the job folder. */
  function renderAddDoc(back) {
    back = back || function () { renderSiteFile(); };
    var D = { type: null, file: null, mime: null, name: null, pages: [] };
    S.onBack = function () { history.pushState({ v: 1 }, ''); back(); };
    app.innerHTML = top('Add to job', S.job.street + ' · ' + S.job.jobNo, true) + '<div class="body"><div class="lbl" style="margin-top:4px">What is it?</div><div class="pics">' +
      DOC_TYPES.map(function (t) { return '<button data-t="' + t[0] + '"><span>' + t[1] + '</span>' + esc(t[2]) + '</button>'; }).join('') + '</div>' +
      '<div id="revbox" class="hidden"><div class="lbl">Revision</div><input type="text" id="rev" placeholder="e.g. 1.3"></div>' +
      '<div class="lbl">Title</div><input type="text" id="ttl" placeholder="Filled in when you pick the type — change it if you like">' +
      '<div class="lbl">Scan a paper copy — one photo per page</div>' + photoBox('scan') +
      '<div class="lbl">Or choose a file</div><label class="photo" id="pick" style="min-height:70px"><span>📎 PDF, Word, Excel or photo</span><input type="file" accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,image/*" class="hidden"></label>' +
      '<div class="lbl">Note (optional)</div><input type="text" id="note" placeholder="e.g. received from client 14 Nov">' +
      '<p class="small">Scanned pages become one PDF. A new ARCP, survey or WorkSafe notification replaces the current one — the old one is kept. Everything is filed to the job folder.</p></div>' +
      '<div class="foot"><button class="btn" id="go" disabled>Add to job</button></div>';
    bindBack(); renderBanner();
    var go = $('#go');
    function check() { go.disabled = !(D.type && (D.file || D.pages.length) && $('#ttl').value.trim() && (D.type !== 'arcp' || $('#rev').value.trim())); }
    bindPhotos($('#scan'), D.pages, function () { if (D.pages.length) { D.file = null; $('#pick span').textContent = '📎 PDF, Word, Excel or photo'; } check(); });
    $$('[data-t]').forEach(function (b) { b.onclick = function () {
      D.type = b.getAttribute('data-t'); $$('[data-t]').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#revbox').classList.toggle('hidden', D.type !== 'arcp');
      if (!$('#ttl').value || $('#ttl').dataset.auto) { $('#ttl').value = (D.type === 'arcp' ? CONFIG.ARCP_DOC : docType(D.type)[2]) + ' — ' + niceDate(today()); $('#ttl').dataset.auto = '1'; }
      check(); }; });
    $('#ttl').oninput = function () { delete $('#ttl').dataset.auto; check(); };
    $('#rev').oninput = check;
    var inp = $('#pick input');
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      if (f.size > 25 * 1024 * 1024) { toast('That file is over 25 MB — too big for the phone'); return; }
      var done = function (url, mime) { D.file = url; D.mime = mime; D.name = f.name; D.pages.length = 0; bindPhotos($('#scan'), D.pages, check); $('#pick span').textContent = '📎 ' + f.name + ' (' + Math.round(f.size / 1024) + ' KB)'; check(); };
      if (f.type.indexOf('image/') === 0) shrink(f).then(function (u) { done(u, 'image/jpeg'); });
      else { var fr = new FileReader(); fr.onload = function () { done(fr.result, f.type || 'application/octet-stream'); }; fr.readAsDataURL(f); }
    };
    go.onclick = async function () {
      go.disabled = true; go.textContent = 'Saving…';
      if (D.pages.length) { D.file = await imagesToPdf(D.pages); D.mime = 'application/pdf'; D.name = 'scan.pdf'; }
      var t = docType(D.type), old = (D.type === 'arcp' || D.type === 'survey' || D.type === 'wsn') ? jobDocs().filter(function (d) { return d.data.type === D.type; })[0] : null;
      var ext = (D.name && D.name.match(/\.[a-z0-9]{2,5}$/i) || [D.mime === 'application/pdf' ? '.pdf' : '.jpg'])[0].toLowerCase(), title = $('#ttl').value.trim();
      var rec = { form: 'DOC', formTitle: t[2], formRef: 'Job document', jobNo: S.job.jobNo, personId: S.me.id,
        data: { type: D.type, title: title, rev: D.type === 'arcp' ? $('#rev').value.trim() : '', origName: D.name, mime: D.mime, note: $('#note').value.trim(), pages: D.pages.length || null },
        file: D.file, fileName: today() + ' ' + title.replace(/[\\/:*?"<>|]/g, '') + (D.type === 'arcp' ? ' Rev ' + $('#rev').value.trim() : '') + ext,
        folder: folderFor(S.job).replace(/H&S\/$/, t[3] + '/') };
      if (old) { rec.version = (old.version || 1) + 1; rec.supersedes = old.id; rec.rootId = old.rootId || old.id; rec.reason = 'Replaced by upload'; }
      await saveRecord(rec);
      if (old) { old.supersededBy = rec.id; old.supersededAt = Date.now(); await DB.put(old); await refreshRecs(); }
      toast(t[2] + ' added to the job' + (D.type === 'arcp' && old && old.data.rev !== rec.data.rev ? ' — crew must re-sign Rev ' + rec.data.rev : ''));
      history.replaceState({ v: 1 }, ''); back();
    };
  }
  async function imagesToPdf(pages) {
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, H = 297, m = 8;
    for (var i = 0; i < pages.length; i++) {
      var im = await new Promise(function (res) { var x = new Image(); x.onload = function () { res(x); }; x.src = pages[i].img; });
      var r = Math.min((W - 2 * m) / im.width, (H - 2 * m) / im.height), w = im.width * r, h = im.height * r;
      if (i) doc.addPage();
      doc.addImage(pages[i].img, 'JPEG', (W - w) / 2, (H - h) / 2, w, h);
    }
    return doc.output('datauristring');
  }

  /* ---------- SWMS library (TC-METH-LIB-001) and the job's SWMS register ---------- */
  function libItem(code) { return (S.library || []).filter(function (x) { return x.code === code; })[0]; }
  function jobSwms() {
    return jobRecs(['SWM']).filter(function (r) { return !r.supersededBy && !r.data.removed; })
      .map(function (r) { return { id: r.id, code: r.data.code, title: r.data.title, rev: r.data.rev, kind: r.data.kind, area: r.data.area, date: r.date }; })
      .sort(function (a, b) { return a.code > b.code ? 1 : -1; });
  }
  function swmsLabels() { return jobSwms().map(function (x) { return x.code + ' ' + x.title + ' Rev ' + x.rev; }); }
  function sameSwms(signed) { var a = (signed || []).slice().sort().join('|'), b = swmsLabels().slice().sort().join('|'); return a === b; }
  function renderLibrary() {
    var f = S.libFilter || 'all', q = (S.libQ || '').toLowerCase(), on = {}; jobSwms().forEach(function (x) { on[x.code] = x; });
    var list = (S.library || []).filter(function (x) {
      if (f === 'material' || f === 'task') { if (x.kind !== f) return false; }
      if (f === 'job') { if (!on[x.code]) return false; }
      if (f === 'A' || f === 'B') { if (x.cls.indexOf(f) < 0) return false; }
      return !q || (x.code + ' ' + x.title).toLowerCase().indexOf(q) >= 0;
    });
    var demo = (S.library || []).some(function (x) { return /^DEMO/.test(x.code); });
    var h = top('SWMS library', 'TC-METH-LIB-001 · ' + S.job.jobNo, true) + '<div class="body">' + (demo ? '<div class="banner" style="margin:-14px -14px 12px">Demo entries — the real Method Library loads once connected</div>' : '') +
      '<input type="text" id="q" placeholder="Search — e.g. vinyl, roof, heights" value="' + esc(S.libQ || '') + '">' +
      '<div class="chips" style="margin:10px 0">' + [['all', 'All'], ['job', 'On this job (' + jobSwms().length + ')'], ['material', 'Materials'], ['task', 'Tasks'], ['A', 'Class A'], ['B', 'Class B']].map(function (c) { return '<button data-f="' + c[0] + '" class="' + (f === c[0] ? 'on' : '') + '">' + c[1] + '</button>'; }).join('') + '</div>';
    if (!list.length) h += '<div class="card"><div class="small">Nothing matches.</div></div>';
    list.forEach(function (x) {
      var j = on[x.code];
      h += '<button class="card" style="width:100%;text-align:left" data-lib="' + esc(x.code) + '"><div class="it" style="border:0;padding:0"><span class="small"><b>' + esc(x.code) + '</b> · ' + (x.kind === 'task' ? 'Task' : 'Material') + ' · Class ' + esc(x.cls) + ' · Rev ' + esc(x.rev) + '</span>' +
        (j ? (j.rev !== x.rev ? chip('new', 'Job has Rev ' + j.rev) : chip('done', 'On job')) : '') + '</div><div style="font-weight:700;margin-top:4px">' + esc(x.title) + '</div></button>';
    });
    app.innerHTML = h + '</div>'; bindBack(); renderBanner();
    var qi = $('#q'); qi.oninput = function () { S.libQ = qi.value; var p = qi.selectionStart; renderLibrary(); var n = $('#q'); n.focus(); n.setSelectionRange(p, p); };
    $$('[data-f]').forEach(function (b) { b.onclick = function () { S.libFilter = b.getAttribute('data-f'); renderLibrary(); }; });
    $$('[data-lib]').forEach(function (b) { b.onclick = function () { enter(function () { renderLibrary(); }); renderLibItem(b.getAttribute('data-lib')); }; });
  }
  function renderLibItem(code) {
    var x = libItem(code), onj = jobSwms().filter(function (s) { return s.code === code; })[0];
    if (!x) x = { code: code, title: onj ? onj.title : code, kind: onj ? onj.kind : 'material', cls: '', rev: onj ? onj.rev : '', summary: 'No longer in the library.' };
    var canIssue = canUpload(), newer = onj && x.rev && onj.rev !== x.rev;
    var h = top(x.code, x.kind === 'task' ? 'Task SWMS' : 'Material method and SWMS', true) + '<div class="body"><div class="card"><h2 style="margin:0 0 6px">' + esc(x.title) + '</h2><div class="small">' +
      (x.cls ? 'Class ' + esc(x.cls) + ' · ' : '') + 'Library Rev ' + esc(x.rev || '—') + (x.rpe ? ' · RPE: ' + esc(x.rpe) : '') + '</div>' + (x.summary ? '<p>' + esc(x.summary) + '</p>' : '') +
      (x.url ? '<button class="btn sec" id="open" style="margin-top:8px">Open the document</button>' : '<div class="small" style="margin-top:8px">' + (CONFIG.API_URL ? 'No document attached in the library.' : 'Demo: the library document opens here once connected.') + '</div>') + '</div>';
    if (onj) h += '<div class="card"><div class="lbl" style="margin-top:0">On this job</div><div>Rev ' + esc(onj.rev) + ' issued ' + niceDate(onj.date) + (onj.area ? ' · ' + esc(onj.area) : '') + '</div>' +
      (newer ? '<div class="warn">Library is now Rev ' + esc(x.rev) + ' — reissue it and the crew re-sign.</div>' : '') + '</div>';
    if (canIssue && S.job.status !== 'closed' && (!onj || newer)) h += '<div class="lbl">Area or stage it applies to</div><input type="text" id="area" placeholder="e.g. Lounge ceiling, stage 1" value="' + esc(onj ? onj.area || '' : '') + '">';
    h += '<p class="small">Material SWMS name the method they cover (ARCP Section B13). Issuing or reissuing a SWMS means everyone signs the ARCP / SWMS again before they start.</p></div>';
    var btns = '';
    if (canIssue && S.job.status !== 'closed') {
      if (!onj) btns = '<button class="btn" id="iss">Issue to this job</button>';
      else if (newer) btns = '<button class="btn" id="iss">Reissue as Rev ' + esc(x.rev) + '</button>';
      if (onj) btns += '<button class="btn sec" id="rm">Remove from this job</button>';
    }
    app.innerHTML = h + (btns ? '<div class="foot">' + btns + '</div>' : ''); bindBack(); renderBanner();
    var op = $('#open'); if (op) op.onclick = function () { window.open(x.url, '_blank'); };
    var iss = $('#iss'); if (iss) iss.onclick = async function () { iss.disabled = true; await issueSwms(x, ($('#area') || {}).value || '', onj); history.back(); toast(x.code + ' issued — crew re-sign the ARCP / SWMS'); };
    var rm = $('#rm'); if (rm) rm.onclick = async function () { rm.disabled = true; await issueSwms(x, onj.area, onj, true); history.back(); toast(x.code + ' removed from the job'); };
  }
  async function issueSwms(x, area, old, remove) {
    var rec = { form: 'SWM', formTitle: (remove ? 'SWMS removed — ' : 'SWMS issued — ') + x.code + ' ' + x.title, formRef: FORMS.SWM.ref, jobNo: S.job.jobNo, personId: S.me.id,
      data: { code: x.code, title: x.title, rev: x.rev, kind: x.kind, cls: x.cls, area: area, removed: !!remove },
      details: jobDetails([[remove ? 'Removed by' : 'Issued by', S.me.name + ', ' + roleName(S.me)]]),
      rows: [{ section: 'SWMS register — ARCP Section C3', label: 'SWMS number and title', value: x.code + ' ' + x.title, flag: '' },
        { section: 'SWMS register — ARCP Section C3', label: 'Type', value: x.kind === 'task' ? 'Task' : 'Material', flag: '' },
        { section: 'SWMS register — ARCP Section C3', label: 'Area or stage', value: area || '—', flag: '' },
        { section: 'SWMS register — ARCP Section C3', label: 'Method reference', value: 'TC-METH-LIB-001 ' + x.code, flag: '' },
        { section: 'SWMS register — ARCP Section C3', label: 'Revision', value: x.rev, flag: '' },
        { section: 'SWMS register — ARCP Section C3', label: remove ? 'Removed' : 'Issued', value: new Date().toLocaleString('en-NZ'), flag: '' }],
      sigs: [{ name: S.me.name, label: roleName(S.me), time: Date.now() }] };
    if (old) { rec.version = 2; rec.supersedes = old.id; rec.rootId = old.id; rec.reason = remove ? 'Removed from the job' : 'Reissued at Rev ' + x.rev; }
    rec.fileName = fileName({ date: today() }, (remove ? 'SWMS removed ' : 'SWMS issued ') + x.code, S.me.name); rec.folder = folderFor(S.job);
    await saveRecord(rec);
    if (old) { var o = recById(old.id); if (o) { o.supersededBy = rec.id; o.supersededAt = Date.now(); await DB.put(o); await refreshRecs(); } }
  }

  /* ---------- Supervisor handover: a different supervisor takes over the job ---------- */
  function applyHandover(j) {
    if (j.feedSupervisorId === undefined) { j.feedSupervisorId = j.supervisorId; j.feedCrewIds = j.crewIds.slice(); }
    j.supervisorId = j.feedSupervisorId; j.crewIds = j.feedCrewIds.slice();
    var h = RECS.filter(function (r) { return r.form === 'HND' && !r.supersededBy && r.jobNo === j.jobNo; }).sort(function (a, b) { return b.createdAt - a.createdAt; })[0];
    if (!h) return;
    var schedLater = j.updatedAt && new Date(j.updatedAt).getTime() > h.createdAt && j.feedSupervisorId && j.feedSupervisorId !== h.data.fromId;
    if (schedLater) return;   // the schedule has named a supervisor since the handover — the schedule wins
    j.supervisorId = h.data.toId;
    if (j.crewIds.indexOf(h.data.toId) < 0) j.crewIds.unshift(h.data.toId);
  }
  function renderHandover(mode) {
    getGps();
    var j = S.job, from = mode === 'in' ? person(j.supervisorId) : S.me, H = { to: mode === 'in' ? S.me.id : null, how: null, ok: {} };
    var cands = j.crewIds.filter(function (pid) { var p = person(pid); return p && pid !== j.supervisorId; });
    var ac = actCounts(), d5 = live('D5').sort(function (a, b) { return b.createdAt - a.createdAt; })[0], plan = seqPlan(), done = plan.items.filter(function (x) { return x.st.done; }).length;
    var hz = d5 ? ((d5.data.answers || {}).hazsel || {}).v : null;
    var h = top('Supervisor handover', j.street + ' · ' + j.jobNo, true) + '<div class="body">' +
      '<div class="card"><div class="lbl" style="margin-top:0">Where the job is at</div><div class="list">' +
      [['Supervisor now', from ? from.name : '—'], ['Class', 'Class ' + j.cls + (j.status !== 'open' ? ' · ' + j.status : '')], ['Job steps done', done + ' of ' + plan.items.length],
        ['ARCP', 'Rev ' + arcpRev() + ' · ' + jobSwms().length + ' SWMS issued'], ['Last pre-start', d5 ? niceDate(d5.date) + ' ' + hm(d5.createdAt) + (hz && hz.length ? ' · ' + hz.length + ' hazards' : '') : 'None'],
        ['Corrective actions', ac.open + ' open' + (ac.overdue ? ', ' + ac.overdue + ' overdue' : '')], ['On site now', onSiteNow().map(regName).join(', ') || 'Nobody signed in']]
        .map(function (r) { return '<div class="it"><span>' + r[0] + '</span><b style="text-align:right">' + esc(r[1]) + '</b></div>'; }).join('') + '</div></div>';
    if (mode === 'out') h += '<div class="lbl">Who is taking over?</div>' + (cands.length ? '<div class="pics">' + cands.map(function (pid) { return '<button data-to="' + pid + '"><span>🦺</span>' + esc(person(pid).name) + '</button>'; }).join('') + '</div>' : '') +
      '<p class="small">Not on this crew? They take over from their own phone — scan the job QR code and tap “Take over as supervisor”.</p>';
    h += '<div id="incert"></div>' +
      '<div class="lbl">How is the handover done?</div><div class="chips"><button data-how="person">In person on site</button><button data-how="phone">By phone — ' + (mode === 'in' ? 'outgoing' : 'incoming') + ' not here</button></div>' +
      '<div class="lbl">Work stage and what’s next (required)</div>' + voiceBox('stage', 'e.g. lounge ceiling done, hall tomorrow, clearance booked Thursday') +
      '<div class="lbl">Hazards, changes or anything outstanding (required)</div>' + voiceBox('issues', 'e.g. power isolated at the board, neighbour asked about noise') +
      '<div class="lbl">Checks</div><div class="chips" style="flex-direction:column">' +
      [['read', 'Incoming has read the ARCP, the method and SWMS, and the site file'], ['wsn', 'WorkSafe notification checked — PM told if it needs updating for the new supervisor'], ['pm', 'Project Manager told about the change']]
        .concat(j.cls === 'A' ? [['a', 'Class A: outgoing stays in the removal area until the incoming supervisor has signed on']] : [])
        .map(function (c) { return '<button data-ok="' + c[0] + '" style="text-align:left">☐ ' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="lbl">Incoming supervisor signs</div><div id="s1">' + sigBox() + '</div>' +
      '<div id="s2w" class="hidden"><div class="lbl">Outgoing supervisor signs</div><div id="s2">' + sigBox() + '</div></div>' +
      '</div><div class="foot"><button class="btn" id="go" disabled>Hand over</button></div>';
    app.innerHTML = h; bindBack(); renderBanner(); bindVoice();
    var go = $('#go'), s1 = bindSig($('#s1 .sigwrap'), chk), s2 = null, need = ['read', 'wsn', 'pm'].concat(j.cls === 'A' ? ['a'] : []);
    function inc() { return H.to ? person(H.to) : null; }
    function certCheck() {
      var p = inc(), box = $('#incert'); if (!p) { box.innerHTML = ''; return; }
      var cl = certList(p), sup = cl.filter(function (c) { return c.id === 'supervise' && !c.expired; })[0], ft = cl.filter(function (c) { return (c.id === 'ffhalf' || c.id === 'fffull') && !c.expired; })[0];
      box.innerHTML = '<div class="card"><div class="lbl" style="margin-top:0">' + esc(p.name) + ' — from certificates</div><div class="list">' +
        '<div class="it"><span>Supervise removal</span>' + (sup ? chip('done', 'Yes') : chip('todo', j.cls === 'A' ? 'Not on record — can’t supervise Class A' : 'Not on record')) + '</div>' +
        '<div class="it"><span>Face fit test</span>' + (ft ? chip('done', 'Current') : chip('todo', 'None current — stop')) + '</div></div></div>';
    }
    function chk() {
      var p = inc(), cl = p ? certList(p) : [], ft = cl.some(function (c) { return (c.id === 'ffhalf' || c.id === 'fffull') && !c.expired; }), sup = cl.some(function (c) { return c.id === 'supervise' && !c.expired; });
      go.disabled = !(p && H.how && ($('#stage').value || '').trim() && ($('#issues').value || '').trim() && need.every(function (k) { return H.ok[k]; }) && !s1.isEmpty() && (H.how !== 'person' || (s2 && !s2.isEmpty())) && ft && (j.cls !== 'A' || sup));
    }
    $$('[data-to]').forEach(function (b) { b.onclick = function () { H.to = b.getAttribute('data-to'); $$('[data-to]').forEach(function (x) { x.classList.toggle('on', x === b); }); certCheck(); chk(); }; });
    $$('[data-how]').forEach(function (b) { b.onclick = function () { H.how = b.getAttribute('data-how'); $$('[data-how]').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#s2w').classList.toggle('hidden', H.how !== 'person'); if (H.how === 'person' && !s2) s2 = bindSig($('#s2 .sigwrap'), chk); chk(); }; });
    $$('[data-ok]').forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-ok'); H.ok[k] = !H.ok[k]; b.classList.toggle('on', H.ok[k]); b.textContent = (H.ok[k] ? '☑ ' : '☐ ') + b.textContent.slice(2); chk(); }; });
    $('#stage').oninput = chk; $('#issues').oninput = chk;
    certCheck();
    go.onclick = async function () {
      go.disabled = true;
      var to = inc(), fromP = from || { name: '—', id: '' };
      var rows = [{ section: 'Handover', label: 'Outgoing supervisor', value: fromP.name, flag: '' }, { section: 'Handover', label: 'Incoming supervisor', value: to.name, flag: '' },
        { section: 'Handover', label: 'How', value: H.how === 'person' ? 'In person on site' : 'By phone', flag: '' },
        { section: 'Handover', label: 'Work stage and what’s next', value: $('#stage').value, flag: '' },
        { section: 'Handover', label: 'Hazards, changes or anything outstanding', value: $('#issues').value, flag: '' },
        { section: 'Where the job was at', label: 'Job steps done', value: done + ' of ' + plan.items.length, flag: '' },
        { section: 'Where the job was at', label: 'Corrective actions', value: ac.open + ' open, ' + ac.overdue + ' overdue', flag: ac.overdue ? 'bad' : '' },
        { section: 'Where the job was at', label: 'ARCP and SWMS', value: 'Rev ' + arcpRev() + '; ' + (swmsLabels().join('; ') || 'no SWMS issued'), flag: '' }];
      need.forEach(function (k) { rows.push({ section: 'Checks', label: { read: 'Incoming has read the ARCP, method, SWMS and site file', wsn: 'WorkSafe notification checked — PM told if it needs updating', pm: 'Project Manager told', a: 'Class A: outgoing stayed in the removal area until the incoming signed on' }[k], value: 'Yes', flag: 'good' }); });
      var sigs = [{ name: to.name, label: 'Incoming supervisor', time: Date.now(), img: s1.data() }];
      if (H.how === 'person') sigs.push({ name: fromP.name, label: 'Outgoing supervisor', time: Date.now(), img: s2.data() });
      var rec = { form: 'HND', formTitle: 'Supervisor handover — ' + fromP.name + ' to ' + to.name, formRef: FORMS.HND.ref, jobNo: j.jobNo, personId: S.me.id,
        data: { fromId: fromP.id, toId: to.id, how: H.how, stage: $('#stage').value, issues: $('#issues').value },
        details: jobDetails([['Recorded by', S.me.name]]), rows: rows, photos: [], sigs: sigs, alert: true };
      rec.fileName = fileName({ date: today() }, 'Supervisor handover to ' + to.name, S.me.name); rec.folder = folderFor(j);
      await saveRecord(rec); applyHandover(j);
      history.replaceState({ v: 1 }, ''); S.onBack = null;
      var need2 = !statusFor(to.id).d1;
      app.innerHTML = top('Handed over', j.street) + '<div class="body"><div class="card center"><div class="big">🤝</div><h2 style="margin:0">' + esc(to.name) + ' is now the supervisor</h2>' +
        '<p class="small">PM and Branch Manager are told so the schedule can be updated.' + (need2 ? ' ' + esc(first(to.name)) + ' signs the ARCP / SWMS next, and is inducted if new to this site.' : '') + '</p></div></div>' +
        '<div class="foot"><button class="btn" id="home">Back to today</button></div>';
      $('#home').onclick = function () { renderToday(); };
    };
  }

  async function openDoc(r) {
    if (!r) return;
    if (!r.file) {
      if (!CONFIG.API_URL || !isOnline()) { toast('This document opens once there\u2019s signal'); return; }
      toast('Getting the document…');
      if (!(await fetchDocFile(r))) { toast('Couldn\u2019t get the document — try again'); return; }
    }
    var blob = await (await fetch(r.file)).blob(), file = null;
    try { file = new File([blob], r.fileName, { type: r.data.mime }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: r.data.title }).catch(function () {}); return; }
    var u = URL.createObjectURL(blob), w = window.open(u, '_blank');
    if (!w) { var a = document.createElement('a'); a.href = u; a.download = r.fileName; document.body.appendChild(a); a.click(); a.remove(); }
  }

  /* Blank form PDF for the paper backup */
  function blankPdf(code) {
    var f = FORMS[code === 'FFW' ? 'FFW' : code], rows = [];
    if (f.questions) qList(f, {}, true).forEach(function (q) { if (q.type === 'sign' || q.type === 'photo') return; rows.push({ section: q.section || f.title, label: q.pdf || q.q, value: q.type === 'multi' ? q.opts.map(function (o) { return '☐ ' + o[2]; }).join('   ') : (q.type === 'text' || q.type === 'field' || q.type === 'date' || q.type === 'time' || q.type === 'crewpick') ? '' : q.type === 'number' ? '______ ' + (q.unit || '') : q.type === 'ok' ? 'OK / Fault / N/A' : q.type === 'choice' ? q.opts.map(function (o) { return o[2]; }).join(' / ') : q.noNA ? 'Yes / No' : 'Yes / No / N/A', flag: '' }); });
    if (f.questions && S.job) autoRows({ code: f.code, a: { stage: { v: 'setup' } } }).forEach(function (r) { rows.push({ section: 'Checked from records (app) — tick on paper', label: r.label, value: 'Yes / No', flag: '' }); });
    if (code === 'D12') rows = [{ section: 'Event', label: 'Type: ' + f.types.map(function (t) { return t[1]; }).join(' / '), value: '', flag: '' },
      { section: 'Event', label: 'Anyone hurt?', value: 'Yes / No', flag: '' }, { section: 'What happened', label: ' \n \n ', value: '', flag: '' }, { section: 'Immediate action taken', label: ' \n \n ', value: '', flag: '' }];
    if (code === 'D11') INVENTORY.consumables.concat(INVENTORY.equipment).forEach(function (it) { rows.push({ section: 'Item (unit) · out · back', label: it.name + ' (' + it.unit + ')', value: 'Out ____  Back ____', flag: '' }); });
    if (code === 'D13' || code === 'D14') for (var i = 0; i < 12; i++) rows.push({ section: 'Name · company · time in · time out · signature', label: ' ', value: '', flag: '' });
    var sigs = code === 'D1' ? [1, 2, 3, 4, 5, 6].map(function () { return { name: 'Name:', label: 'Signature / date / rev', text: ' ' }; }) : [{ name: 'Name:', label: 'Signature', text: ' ' }];
    openPdf({ id: 'BLANK-' + code, formTitle: (f.title || code) + ' — blank', formRef: (f.ref || code), formRev: f.rev, arcpRev: arcpRev(), createdAt: Date.now(), gps: null,
      details: [['Job number', S.job ? S.job.jobNo : ''], ['Site', S.job ? S.job.street + ', ' + S.job.suburb : ''], ['Date', ''], ['Completed by', '']],
      statement: code === 'D1' ? FORMS.D1.statement : null, rows: rows, sigs: sigs, fileName: 'Blank ' + code + ' ' + (f.title || '') + '.pdf' });
  }

  /* ---------- records list (PDF download / share) ---------- */
  function renderRecords() {
    var list = RECS.filter(function (r) { return r.date === today() && (!S.job || r.jobNo === S.job.jobNo); }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    var h = top('Today’s records', S.job ? jobSub() : '', true) + '<div class="body"><div class="card list">';
    if (!list.length) h += '<div class="small">Nothing yet today.</div>';
    list.forEach(function (r) {
      h += '<div class="it"><div><div style="font-weight:700">' + esc(r.fileName.replace(/^\d{4}-\d\d-\d\d /, '').replace('.pdf', '')) + '</div><div class="small">' +
        hm(r.updatedAt) + ' · ' + (r.status === 'sent' ? 'Sent ✓' : CONFIG.API_URL ? 'Waiting to send' : 'On this phone') + '</div></div>' +
        '<button class="chip wait" style="border:0;padding:10px 14px" data-pdf="' + r.id + '">PDF</button></div>';
    });
    h += '</div>' + (S.job ? '<p class="small">PDFs file to: ' + esc(folderFor(S.job)) + '</p>' : '') + '</div>';
    app.innerHTML = h; bindBack(); renderBanner();
    $$('[data-pdf]').forEach(function (b) { b.onclick = function () { var r = RECS.filter(function (x) { return x.id === b.getAttribute('data-pdf'); })[0]; openPdf(r); }; });
  }
  async function openPdf(rec) {
    if (rec.form === 'DOC') return openDoc(rec);
    if (!rec.pdf) { var d = await PDF.build(rec); rec.pdf = d.output('datauristring'); }
    var blob = await (await fetch(rec.pdf)).blob();
    var file = null;
    try { file = new File([blob], rec.fileName, { type: 'application/pdf' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: rec.fileName }).catch(function () {});
      return;
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = rec.fileName; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- demo settings ---------- */
  function renderDemo() {
    var st = localStorage.getItem('tc.demo.status') || 'open';
    var h = top('Demo settings', 'Not in the real app', true) + '<div class="body"><div class="card"><div class="lbl" style="margin-top:0">Switch person</div>';
    S.people.forEach(function (p) { h += '<button class="crew" data-p="' + p.id + '"><span class="nm">' + esc(p.name) + '</span><span class="st">' + (p.role === 'supervisor' ? 'Supervisor' : 'Crew') + (S.me && S.me.id === p.id ? ' · this phone' : '') + '</span></button>'; });
    h += '</div><div class="card"><div class="lbl" style="margin-top:0">Job status in the schedule</div><div class="chips">' +
      [['open', 'In progress'], ['hold', 'On hold – start TBC'], ['closed', 'Finished / Invoiced']].map(function (o) { return '<button data-s="' + o[0] + '" class="' + (st === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') +
      '</div></div><div class="card"><div class="lbl" style="margin-top:0">Class of work</div><div class="chips">' +
      ['A', 'B'].map(function (c) { return '<button data-cl="' + c + '" class="' + ((S.job || DEMO.jobs[0]).cls === c ? 'on' : '') + '">Class ' + c + '</button>'; }).join('') +
      '</div></div><div class="card"><div class="lbl" style="margin-top:0">Signal</div><div class="chips"><button id="sig" class="' + (S.fakeOffline ? 'on' : '') + '">Pretend no signal</button></div></div>' +
      '<div class="card"><div class="lbl" style="margin-top:0">Try the QR code</div><div class="chips"><button id="qr">Open as visitor (QR scan)</button></div></div>' +
      '<div class="card"><div class="chips"><button id="wipe">Clear all demo records</button></div></div></div>';
    app.innerHTML = h; bindBack();
    $$('[data-p]').forEach(function (b) { b.onclick = function () { localStorage.setItem('tc.me', b.getAttribute('data-p')); resolveMe(); resolveJob(); history.back(); }; });
    $$('[data-s]').forEach(function (b) { b.onclick = function () { localStorage.setItem('tc.demo.status', b.getAttribute('data-s')); loadData().then(function () { resolveJob(); renderDemo(); }); }; });
    $('#sig').onclick = function () { S.fakeOffline = !S.fakeOffline; renderDemo(); };
    $$('[data-cl]').forEach(function (b) { b.onclick = function () { localStorage.setItem('tc.demo.cls', b.getAttribute('data-cl')); loadData().then(function () { resolveJob(); renderDemo(); }); }; });
    $('#qr').onclick = function () { location.href = location.pathname + '?job=' + (S.job ? S.job.jobNo : DEMO.jobs[0].jobNo) + '&visitor=1'; };
    $('#wipe').onclick = function () { DB.clear().then(refreshRecs).then(function () { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('tc.draft') === 0) localStorage.removeItem(k); }); toast('Cleared'); }); };
  }

  /* ---------- start ---------- */
  function readUrl() {
    var p = new URLSearchParams(location.search), m = location.pathname.match(/\/j\/([A-Za-z0-9-]+)/);
    S.qrJob = p.get('job') || (m ? m[1] : null);
    S.visitorMode = p.get('visitor') === '1';
    var t = p.get('me');
    if (t) {
      if (CONFIG.API_URL) localStorage.setItem('tc.token', t); else localStorage.setItem('tc.me', t);
      history.replaceState(null, '', location.pathname + (S.qrJob ? '?job=' + S.qrJob : ''));
    }
  }
  async function start() {
    readUrl();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(registerSync).catch(function () {});
    if (CONFIG.API_URL) DB.setMeta('config', { API_URL: CONFIG.API_URL, token: localStorage.getItem('tc.token') || '' }).catch(function () {});
    await Promise.all([loadData(), refreshRecs(), PDF.loadLogo()]);
    resolveMe();
    if (S.visitorMode) S.me = null;
    resolveJob();
    getGps();
    renderToday();
    if (S.qrJob && S.me && S.job && S.job.status === 'open' && S.job.crewIds.indexOf(S.me.id) >= 0) go('d13');
    sendOutbox();
    setInterval(refreshFromSchedule, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - (S.lastPull || 0) > 60 * 1000) refreshFromSchedule(); });
  }
  /* Jobs and crew come from the schedule's hsFeed via the H&S back end (it holds the key). Cached on the phone for no-signal days. */
  function refreshFromSchedule() {
    if (!CONFIG.API_URL || !isOnline()) return;
    S.lastPull = Date.now();
    var before = S.job ? S.job.jobKey + '|' + S.job.status + '|' + S.job.crewIds.join(',') : '';
    loadData().then(function () {
      resolveMe(); resolveJob();
      var after = S.job ? S.job.jobKey + '|' + S.job.status + '|' + S.job.crewIds.join(',') : '';
      if (after !== before && S.atHome) renderToday();   // never interrupt someone mid-form
    });
  }
  start();
})();
