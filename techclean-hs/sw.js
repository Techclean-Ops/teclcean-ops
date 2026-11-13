/* TechClean H&S — offline cache + background send (Android). Bump VERSION on every release. */
var VERSION = 'tc-hs-v10';
var FILES = ['./', 'index.html', 'app.js', 'forms.js', 'config.js', 'pdf.js', 'jspdf.umd.min.js',
  'logo-white.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'manifest.webmanifest'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // API calls go straight to the network
  // App pages (including /j/<job> QR links) always get the app shell
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) { return r.ok ? r : caches.match('index.html'); }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(req).then(function (r) { if (r.ok) caches.open(VERSION).then(function (c) { c.put(req, r.clone()); }); return r; }).catch(function () { return hit; });
    return hit || net;
  }));
});

/* Background Sync: Android sends saved records even if the app was closed. (iPhone sends next time the app opens.) */
self.addEventListener('sync', function (e) { if (e.tag === 'tc-outbox') e.waitUntil(sendAll()); });
function idb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('techclean-hs', 1);
    r.onupgradeneeded = function () { var db = r.result; db.createObjectStore('records', { keyPath: 'id' }); db.createObjectStore('meta'); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
}
function req2p(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
async function sendAll() {
  var db = await idb();
  var cfg = await req2p(db.transaction('meta').objectStore('meta').get('config'));
  if (!cfg || !cfg.API_URL) return;
  var recs = await req2p(db.transaction('records').objectStore('records').getAll());
  for (var i = 0; i < recs.length; i++) {
    var r = recs[i]; if (r.status === 'sent' || (!r.pdf && !r.file)) continue; // PDF not built yet: the app sends it next time it opens
    var copy = {}; for (var k in r) if (k !== 'pdf' && k !== 'file') copy[k] = r[k];
    var res = await fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submit', token: cfg.token, record: copy, pdf: r.pdf || r.file, fileName: r.fileName, folder: r.folder }) });
    var j = await res.json();
    if (!j || !j.ok) throw new Error('send failed'); // browser retries later
    r.status = 'sent'; r.sentAt = Date.now(); r.filedTo = j.filedTo || '';
    await req2p(db.transaction('records', 'readwrite').objectStore('records').put(r));
  }
}
