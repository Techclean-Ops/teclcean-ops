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
  function person(id) { for (var i = 0; i < S.people.length; i++) if (S.people[i].id === id) return S.people[i]; return null; }
  function first(n) { return String(n || '').split(' ')[0]; }
  function isOnline() { return navigator.onLine && !S.fakeOffline; }
  function $(sel) { return app.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(app.querySelectorAll(sel)); }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function enter(onBack) { S.onBack = onBack || null; history.pushState({ v: 1 }, ''); window.scrollTo(0, 0); }
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
      if (d && d.jobs) { localStorage.setItem('tc.data', JSON.stringify(d)); setData(d); }
    }).catch(function () {});
  }
  function applyDemoOverrides(d) {
    var st = localStorage.getItem('tc.demo.status');
    if (st) d.jobs.forEach(function (j) { j.status = st; });
    var cl = localStorage.getItem('tc.demo.cls');
    if (cl) d.jobs.forEach(function (j) { j.cls = cl; });
  }
  function setData(d) { S.people = d.people || []; S.jobs = d.jobs || []; if (d.me) S.meFromServer = d.me; }

  function resolveMe() {
    var id = localStorage.getItem('tc.me');
    if (S.meFromServer) id = S.meFromServer.id;
    S.me = id ? person(id) : null;
  }
  function resolveJob() {
    var want = S.qrJob || null, j = null, i;
    for (i = 0; i < S.jobs.length; i++) if (want ? S.jobs[i].jobNo === want : (S.me && S.jobs[i].crewIds.indexOf(S.me.id) >= 0)) j = S.jobs[i];
    S.job = j;
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
    var d1 = RECS.filter(function (r) { return !r.supersededBy && r.form === 'D1' && r.personId === pid && S.job && r.jobNo === S.job.jobNo && r.data.rev === arcpRev(); })[0] || null;
    return { ffw: ffw, d13: d13, d1: d1 };
  }
  /* Uploaded job documents (ARCP, survey, WSN …). The latest ARCP upload sets the revision crew must sign. */
  var DOC_TYPES = [['arcp', '📕', 'ARCP / SSSP', 'ARCP'], ['survey', '🔬', 'Asbestos survey / report', 'Survey'], ['wsn', '🏛️', 'WorkSafe notification', 'WSN'],
    ['swms', '📑', 'SWMS', 'H&S/Documents'], ['air', '🌬️', 'Air monitoring results', 'H&S/Documents'], ['clear', '✅', 'Clearance certificate', 'H&S/Documents'],
    ['sds', '🧪', 'Safety data sheet', 'H&S/Documents'], ['plan', '🗺️', 'Site plan / drawing', 'Drawing'], ['other', '📄', 'Other', 'H&S/Documents']];
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
    rec.createdAt = rec.createdAt || Date.now();
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
    return [(S.me ? S.me.name : 'Visitor') + ' · ' + (S.job ? S.job.jobNo + ' ' + S.job.street : ''),
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
    stopCam(); S.onBack = null; S.amend = null;
    if (!S.me) return S.qrJob ? renderQrNoPerson() : renderSetup();
    if (!S.job) {
      app.innerHTML = top('Kia ora ' + first(S.me.name), longDate()) +
        '<div class="body"><div class="card"><h2 style="margin:0 0 6px">No job for you today</h2><div class="small">If you think this is wrong, talk to your supervisor.</div></div>' + footLinks() + '</div>';
      renderBanner(); bindFootLinks(); return;
    }
    var j = S.job, sup = person(j.supervisorId), st = statusFor(S.me.id), isSup = S.me.id === j.supervisorId;
    var h = top('Kia ora ' + first(S.me.name), longDate() + ' · start ' + j.start) + '<div class="body">';
    h += '<div class="card job"><h2>' + esc(j.street) + ', ' + esc(j.suburb) + '</h2><div class="meta"><span class="chip cls">Class ' + esc(j.cls) + '</span>' +
      esc(j.jobNo) + ' · Supervisor ' + esc(sup ? sup.name : '') + '</div></div>';

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
      if (!(st.ffw && st.ffw.data.result === 'pass')) { enter(); renderNeedFfw(); return; }
      enter(); renderSignOn();
    }
    else if (what === 'd5') { enter(); startFlow('D5'); }
    else if (what === 'd1') { enter(); renderD1(); }
    else if (what === 'd12') { enter(); renderReport(); }
    else if (what === 'file') { enter(); renderSiteFile(); }
    else if (what === 'forms') { enter(); renderJobForms(); }
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
  function draftKey(code) { return 'tc.draft.' + code + '.' + (S.job ? S.job.jobNo : '') + '.' + today() + '.' + (S.me ? S.me.id : ''); }
  function startFlow(code) {
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
    S.onBack = function () { if (F.i > 0) { F.i--; saveDraft(F); history.pushState({ v: 1 }, ''); showQ(F); } else renderToday(); };
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
      h += '<p class="help"><b>' + esc(whoName) + '</b>' + (a.sig ? ' — already signed. Tap Next, or sign again.' : '') + '</p>' + sigBox();
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
        var bad = isBad(q, a.v); var bb = $('#badbox'); if (bb) bb.classList.toggle('hidden', !bad);
        check();
        if (!bad) setTimeout(advance, 220);
      };
    });
    var note = $('#note'); if (note) note.oninput = function () { a.note = note.value; F.a[q.id] = a; saveDraft(F); check(); };
    var txt = $('#txt'); if (txt) txt.oninput = function () { a.v = txt.value; F.a[q.id] = a; saveDraft(F); check(); };
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
    var rf = rowsFrom(F);
    var rec = { form: 'FFW', formTitle: 'Fit for work — ' + S.me.name, formRef: FORMS.FFW.ref, jobNo: S.job.jobNo, personId: S.me.id,
      data: { result: result, answers: F.a, stoppedAt: stopQ ? stopQ.id : null },
      details: jobDetails([['Worker', S.me.name], ['Result', result === 'pass' ? 'PASS — fit for work' : 'NOT FIT — cannot sign on']]),
      rows: rf.rows, photos: rf.photos, sigs: [{ name: S.me.name, label: 'Worker', time: Date.now() }] };
    rec.fileName = fileName({ date: today() }, 'Fit for work', S.me.name); rec.folder = folderFor(S.job);
    await saveRecord(rec); clearDraft('FFW');
    history.replaceState({ v: 1 }, '');
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
    if (c === 'D10') return 'Waste load ' + hhmm() + ((a.docket || {}).v ? ' docket ' + a.docket.v : '');
    if (c === 'D11') return 'Equipment ' + ((a.dir || {}).v === 'back' ? 'back' : 'out') + ' – ' + ((a.item || {}).v || '');
    return F.def.title;
  }
  async function finishGeneric(F) {
    var j = S.job, rf = rowsFrom(F), sigs = [], name = genericName(F);
    qList(F.def, F.a).forEach(function (q) {
      var a = F.a[q.id];
      if (q.type === 'sign' && a && a.sig) sigs.push({ name: q.who === 'subject' ? subjectName(F) : q.who === 'assessor' ? ((F.a.assessor || {}).v || 'Assessor') + ((F.a.acomp || {}).v ? ', ' + F.a.acomp.v : '') : S.me.name,
        label: q.who === 'subject' ? 'Person inducted' : q.who === 'assessor' ? 'Assessor — witnessed the smoke test' : 'Site Supervisor', time: Date.now(), img: a.sig });
    });
    if (F.code === 'D4') sigs.push({ name: S.me.name, label: 'Inducted by', time: Date.now() });
    if (!sigs.length) sigs.push({ name: S.me.name, label: 'Site Supervisor', time: Date.now() });
    if (F.def.pmReview) rf.rows.push({ section: 'Sign off', label: 'Project Manager review', value: 'Pending', flag: '' });
    var extra = [['Completed by', S.me.name]];
    if (F.code === 'D4') extra.push(['Person inducted', subjectName(F) + ((F.a.wco || {}).v ? ', ' + F.a.wco.v : '')]);
    var rec = { form: F.code, formTitle: F.def.ref.split(' — ')[1] + (F.code === 'D4' ? ' — ' + subjectName(F) : ''), formRef: F.def.ref, jobNo: j.jobNo, personId: S.me.id,
      data: { answers: stripSigs(F.a) }, details: jobDetails(extra), rows: rf.rows, photos: rf.photos, sigs: sigs };
    rec.data.answers = F.a; // keep signatures with the answers so a new version can carry them
    rec.fileName = fileName({ date: today() }, name.replace(/[\\/:*?"<>|]/g, ''), S.me.name); rec.folder = folderFor(j);
    await saveRecord(rec); localStorage.removeItem(draftKey(F.code)); localStorage.removeItem(draftKey(F.code) + '.amend');
    history.replaceState({ v: 1 }, ''); S.onBack = null;
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
    $$('[data-c]').forEach(function (b) { b.onclick = function () { history.pushState({ v: 1 }, ''); startFlow(b.getAttribute('data-c')); }; });
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
      var rec = st.d13 || { form: 'D13', jobNo: S.job.jobNo, personId: S.me.id, data: {} };
      if (on) rec.data.out = Date.now(); else rec.data.in = Date.now();
      rec.formTitle = 'Site sign in / out — ' + S.me.name; rec.formRef = FORMS.D13.ref;
      rec.details = jobDetails([['Name', S.me.name], ['Company', 'TechClean']]);
      rec.rows = [{ section: 'Site sign in / out register', label: 'Time in', value: rec.data.in ? hm(rec.data.in) : '—', flag: '' },
        { section: 'Site sign in / out register', label: 'Time out', value: rec.data.out ? hm(rec.data.out) : 'Still on site', flag: '' }];
      rec.sigs = [{ name: S.me.name, label: 'Signed on own phone', time: Date.now() }];
      rec.fileName = fileName({ date: today() }, 'Sign in-out', S.me.name); rec.folder = folderFor(S.job);
      if (on) rec.gpsOut = gpsNow();
      await saveRecord(rec);
      history.replaceState({ v: 1 }, '');
      toast(on ? 'Signed off ' + hm(Date.now()) + ' — see you next time' : 'Signed on ' + hm(Date.now()));
      renderToday();
    };
  }

  /* ---------- D1 ARCP / SWMS ---------- */
  function renderD1() {
    getGps();
    var j = S.job, st = statusFor(S.me.id);
    if (S.amend) st.d1 = null;
    var h = top('Sign ARCP / SWMS', jobSub(), true) + '<div class="body"><div class="card"><div class="lbl" style="margin-top:0">For this job</div>' +
      '<div style="font-weight:700">ARCP / SSSP ' + esc(CONFIG.ARCP_DOC) + ' Rev ' + esc(arcpRev()) + '</div>' +
      j.swms.map(function (s) { return '<div style="font-weight:700">' + esc(s) + '</div>'; }).join('') +
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
      var rec = { form: 'D1', formTitle: 'ARCP and SSSP acknowledgement — ' + S.me.name, formRef: FORMS.D1.ref, jobNo: j.jobNo, personId: S.me.id,
        data: { rev: arcpRev(), swms: j.swms }, statement: FORMS.D1.statement,
        details: jobDetails([['Worker', S.me.name], ['ARCP / SSSP', CONFIG.ARCP_DOC + ' Rev ' + arcpRev()], ['SWMS', j.swms.join('; ')]]),
        rows: [], sigs: [{ name: S.me.name, label: 'Worker — Rev ' + arcpRev() + ' signed', time: Date.now(), img: sig.data() }] };
      rec.fileName = fileName({ date: today() }, 'ARCP SWMS sign', S.me.name); rec.folder = folderFor(j);
      await saveRecord(rec);
      history.replaceState({ v: 1 }, ''); toast('Signed — thanks ' + first(S.me.name)); renderToday();
    };
  }

  /* ---------- D5 pre-start: crew tap their name to sign on the supervisor's phone ---------- */
  function renderCrewSign(F) {
    var j = S.job;
    F.crew = F.crew || {};
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
  function renderOneSign(F, pid) {
    var p = person(pid);
    S.onBack = function () { history.pushState({ v: 1 }, ''); renderCrewSign(F); };
    app.innerHTML = top(p.name, 'Pre-start ' + longDate(), true) + '<div class="body"><div class="card"><p style="margin:0">I attended today’s pre-start, I understand the work, hazards and SWMS, and my mask check is done.</p></div>' +
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
        '<p class="small">Signed in ' + hm(Date.now()) + '. Scan the QR again when you leave to sign out.</p></div></div>';
    };
  }

  /* ---------- site file: everything for this job, viewable on site (works offline) ---------- */
  var PARTD = [['D1', 'Worker ARCP and SSSP acknowledgement', ['D1']], ['D2', 'Job start checklist', ['D2']], ['D3', 'Site personnel register', ['D3']],
    ['D4', 'Site induction record', ['D4']], ['D5', 'Daily pre-start and toolbox record', ['D5', 'FFW']], ['D6', 'Asbestos removal quality control', ['D6']],
    ['D7', 'Enclosure smoke test (timed, with the assessor)', ['D7']], ['D8', 'Weekly site inspection', ['D8']], ['D9', 'End of shift decontamination and RPE check', ['D9']],
    ['D10', 'Waste movement and disposal record', ['D10']], ['D11', 'Inventory sign out sheet', ['D11']], ['D12', 'Incident, near miss and exposure report', ['D12']],
    ['D13', 'Site sign in / out register', ['D13']], ['D14', 'Visitor entry record', ['D14']]];
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
    h += '<div class="card"><div class="lbl" style="margin-top:0">Job documents</div><div class="list">';
    if (!docs.length) h += '<div class="small">No documents uploaded yet.' + (canUpload() ? ' Add the ARCP and the asbestos survey so they’re here on site with no signal.' : '') + '</div>';
    docs.forEach(function (d) {
      var t = docType(d.data.type);
      h += '<div class="it"><span><b>' + t[1] + ' ' + esc(d.data.title) + '</b><br><span class="small">' + esc(t[2]) + (d.data.rev ? ' · Rev ' + esc(d.data.rev) : '') + ' · added ' + niceDate(d.date) + (d.version > 1 ? ' · v' + d.version : '') + '</span></span>' +
        '<button class="chip wait" style="border:0;padding:10px 14px" data-doc="' + d.id + '">Open</button></div>';
    });
    h += '</div>' + (canUpload() ? '<button class="btn sec" id="adddoc" style="margin-top:12px;font-size:18px;min-height:54px;padding:12px">＋ Add document</button>' : '') + '</div>';
    h += '<div class="card"><div class="lbl" style="margin-top:0">Forms — ARCP Part D</div><div class="list">';
    PARTD.forEach(function (d, i) {
      var n = d[2] ? jobRecs(d[2]).filter(function (r) { return !r.supersededBy; }).length : null;
      h += '<button class="it" style="width:100%;border:0;background:none;text-align:left;padding:12px 0" data-f="' + i + '"><span><b>' + d[0] + '</b> ' + esc(d[1]) + '</span>' +
        (d[2] ? chip(n ? 'done' : 'lock', n + ' record' + (n === 1 ? '' : 's')) : chip('lock', 'Site App Pro')) + '</button>';
    });
    h += '</div></div>';
    h += '<p class="small">' + (CONFIG.API_URL ? 'Records from every phone on this job are kept on this phone for use with no signal.' :
      'Demo: shows records made on this phone. Once connected, it shows every record for the job from every phone, and keeps them for use with no signal.') + '</p></div>';
    app.innerHTML = h; bindBack(); renderBanner();
    $('#reg').onclick = function () { history.pushState({ v: 1 }, ''); renderRegister(); };
    $$('[data-doc]').forEach(function (b) { b.onclick = function () { openDoc(recById(b.getAttribute('data-doc'))); }; });
    var ad = $('#adddoc'); if (ad) ad.onclick = function () { history.pushState({ v: 1 }, ''); renderAddDoc(); };
    $$('[data-f]').forEach(function (b) { b.onclick = function () { history.pushState({ v: 1 }, ''); renderFormList(PARTD[+b.getAttribute('data-f')]); }; });
    $$('[data-out]').forEach(function (b) { b.onclick = function () { signOutVisitor(b.getAttribute('data-out')).then(renderSiteFile); }; });
    S.onBack = null;
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
    return r.personId === S.me.id || isSup();
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
      if (r.form === 'FFW' || (FORMS[r.form] && FORMS[r.form].questions)) startFlow(r.form);
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

  /* ---------- upload a document (ARCP, survey report, WSN, clearance certificate …) ---------- */
  function canUpload() { return isSup() && S.job && S.job.status !== 'closed'; }
  function renderAddDoc() {
    var D = { type: null, file: null, mime: null, name: null };
    S.onBack = function () { history.pushState({ v: 1 }, ''); renderSiteFile(); };
    app.innerHTML = top('Add document', S.job.street, true) + '<div class="body"><div class="lbl" style="margin-top:4px">What is it?</div><div class="pics">' +
      DOC_TYPES.map(function (t) { return '<button data-t="' + t[0] + '"><span>' + t[1] + '</span>' + esc(t[2]) + '</button>'; }).join('') + '</div>' +
      '<div id="revbox" class="hidden"><div class="lbl">Revision</div><input type="text" id="rev" placeholder="e.g. 1.3"></div>' +
      '<div class="lbl">Title</div><input type="text" id="ttl" placeholder="e.g. Asbestos survey — Smith Assessors, Oct 2026">' +
      '<div class="lbl">File</div><label class="photo" id="pick"><span>📎 Choose a PDF or photo</span><input type="file" accept="application/pdf,image/*" class="hidden"></label>' +
      '<label class="photo" id="cam" style="margin-top:10px;min-height:70px"><span>📷 Or photograph a paper copy</span><input type="file" accept="image/*" capture="environment" class="hidden"></label>' +
      '<p class="small">PDFs work best. Save Word files (like the ARCP) as PDF first. A new ARCP, survey or WorkSafe notification replaces the current one — the old one is kept.</p></div>' +
      '<div class="foot"><button class="btn" id="go" disabled>Upload</button></div>';
    bindBack(); renderBanner();
    var go = $('#go');
    function check() { go.disabled = !(D.type && D.file && $('#ttl').value.trim() && (D.type !== 'arcp' || $('#rev').value.trim())); }
    $$('[data-t]').forEach(function (b) { b.onclick = function () {
      D.type = b.getAttribute('data-t'); $$('[data-t]').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#revbox').classList.toggle('hidden', D.type !== 'arcp');
      if (!$('#ttl').value || $('#ttl').dataset.auto) { $('#ttl').value = D.type === 'arcp' ? CONFIG.ARCP_DOC + ' — ' + S.job.street : docType(D.type)[2] + ' — ' + S.job.street; $('#ttl').dataset.auto = '1'; }
      check(); }; });
    $('#ttl').oninput = function () { delete $('#ttl').dataset.auto; check(); };
    $('#rev').oninput = check;
    [['#pick', false], ['#cam', true]].forEach(function (x) {
      var box = $(x[0]), inp = box.querySelector('input');
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        if (f.size > 25 * 1024 * 1024) { toast('That file is over 25 MB — too big for the phone'); return; }
        var done = function (url, mime) { D.file = url; D.mime = mime; D.name = f.name; $('#pick span').textContent = '📎 ' + f.name + ' (' + Math.round(f.size / 1024) + ' KB)'; check(); };
        if (f.type.indexOf('image/') === 0) shrink(f).then(function (u) { done(u, 'image/jpeg'); });
        else { var fr = new FileReader(); fr.onload = function () { done(fr.result, f.type || 'application/pdf'); }; fr.readAsDataURL(f); }
      };
    });
    go.onclick = async function () {
      go.disabled = true;
      var t = docType(D.type), old = (D.type === 'arcp' || D.type === 'survey' || D.type === 'wsn') ? jobDocs().filter(function (d) { return d.data.type === D.type; })[0] : null;
      var ext = D.mime === 'application/pdf' ? '.pdf' : '.jpg', title = $('#ttl').value.trim();
      var rec = { form: 'DOC', formTitle: t[2], formRef: 'Job document', jobNo: S.job.jobNo, personId: S.me.id,
        data: { type: D.type, title: title, rev: D.type === 'arcp' ? $('#rev').value.trim() : '', origName: D.name, mime: D.mime },
        file: D.file, fileName: today() + ' ' + title.replace(/[\\/:*?"<>|]/g, '') + (D.type === 'arcp' ? ' Rev ' + $('#rev').value.trim() : '') + ext,
        folder: folderFor(S.job).replace(/H&S\/$/, t[3] + '/') };
      if (old) { rec.version = (old.version || 1) + 1; rec.supersedes = old.id; rec.rootId = old.rootId || old.id; rec.reason = 'Replaced by upload'; }
      await saveRecord(rec);
      if (old) { old.supersededBy = rec.id; old.supersededAt = Date.now(); await DB.put(old); await refreshRecs(); }
      toast(t[2] + ' added' + (D.type === 'arcp' && old && old.data.rev !== rec.data.rev ? ' — crew must re-sign Rev ' + rec.data.rev : ''));
      history.replaceState({ v: 1 }, ''); renderSiteFile();
    };
  }
  async function openDoc(r) {
    if (!r) return;
    var blob = await (await fetch(r.file)).blob(), file = null;
    try { file = new File([blob], r.fileName, { type: r.data.mime }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: r.data.title }).catch(function () {}); return; }
    var u = URL.createObjectURL(blob), w = window.open(u, '_blank');
    if (!w) { var a = document.createElement('a'); a.href = u; a.download = r.fileName; document.body.appendChild(a); a.click(); a.remove(); }
  }

  /* Blank form PDF for the paper backup */
  function blankPdf(code) {
    var f = FORMS[code === 'FFW' ? 'FFW' : code], rows = [];
    if (f.questions) qList(f, {}, true).forEach(function (q) { if (q.type === 'sign' || q.type === 'photo') return; rows.push({ section: q.section || f.title, label: q.pdf || q.q, value: (q.type === 'text' || q.type === 'field' || q.type === 'date' || q.type === 'time' || q.type === 'crewpick') ? '' : q.type === 'number' ? '______ ' + (q.unit || '') : q.type === 'ok' ? 'OK / Fault / N/A' : q.type === 'choice' ? q.opts.map(function (o) { return o[2]; }).join(' / ') : q.noNA ? 'Yes / No' : 'Yes / No / N/A', flag: '' }); });
    if (code === 'D12') rows = [{ section: 'Event', label: 'Type: ' + f.types.map(function (t) { return t[1]; }).join(' / '), value: '', flag: '' },
      { section: 'Event', label: 'Anyone hurt?', value: 'Yes / No', flag: '' }, { section: 'What happened', label: ' \n \n ', value: '', flag: '' }, { section: 'Immediate action taken', label: ' \n \n ', value: '', flag: '' }];
    if (code === 'D13' || code === 'D14') for (var i = 0; i < 12; i++) rows.push({ section: 'Name · company · time in · time out · signature', label: ' ', value: '', flag: '' });
    var sigs = code === 'D1' ? [1, 2, 3, 4, 5, 6].map(function () { return { name: 'Name:', label: 'Signature / date / rev', text: ' ' }; }) : [{ name: 'Name:', label: 'Signature', text: ' ' }];
    openPdf({ id: 'BLANK-' + code, formTitle: (f.title || code) + ' — blank', formRef: (f.ref || code), arcpRev: arcpRev(), createdAt: Date.now(), gps: null,
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
    if (S.qrJob && S.me && S.job && S.job.crewIds.indexOf(S.me.id) < 0) { /* crew scanning another job's QR */ }
    getGps();
    renderToday();
    if (S.qrJob && S.me && S.job && S.job.status === 'open' && S.job.crewIds.indexOf(S.me.id) >= 0) go('d13');
    sendOutbox();
  }
  start();
})();
