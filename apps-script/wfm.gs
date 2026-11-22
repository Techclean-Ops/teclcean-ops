/**
 * TechClean — WorkflowMax → Schedule import  (v5, 23 Nov 2026 — safeguards + duplicate check)
 * ─────────────────────────────────────────────────────────────────────────────
 * Add this as a SECOND file in the same Apps Script project as the schedule sync
 * (Extensions → Apps Script → ＋ → Script → name it "wfm").
 *
 * What it does (read-only — never writes to WorkflowMax):
 *   • Every 5 minutes asks WorkflowMax for jobs updated recently.
 *   • Dates: WorkflowMax sets them on new jobs and keeps them in step — until someone changes the dates in the
 *     schedule. From then the schedule's dates win; if WorkflowMax's dates later change, the job is flagged
 *     "WFM dates differ" (with WorkflowMax's dates) for a manager to decide. Nothing is overwritten.
 *   • TechClean statuses: Planned (quote approved) → added / updated, tagged "📥 From WorkflowMax —
 *     needs crew"; On Hold → On hold in the schedule; Completed and Open Wages (invoiced, re-opened
 *     only for final wages) → closed ($ Invoiced); Cancelled → taken off the schedule.
 *     Timesheets on Open Wages jobs still count in the monthly actuals.
 *   • Branch comes from the job Category ("Auckland Region" → Auckland, etc.; a "Branch" custom
 *     field is still used if one is added later).
 *   • Class comes from the start of the Description ("Class B - …"), then the Friable (A) /
 *     Non-Friable (B) ticks, then a "Class" custom field. The "Class B - /…/" prefix and slashes
 *     are taken off the scope. The WorkSafe Notification field is carried across for the H&S app.
 *   • Jobs that move to an invoiced / closed status are marked "$ Invoiced" in the schedule.
 *     If WorkflowMax re-opens a job later (payroll), the schedule ignores it.
 *   • Once a day it also totals WorkflowMax ACTUALS per branch per month — approved invoices
 *     (ex GST, by invoice date), timesheet hours and timesheet labour cost (Pro / Advanced plans)
 *     — into a "WFM_Monthly" sheet. The app's
 *     Staff Optimisation → Year trend shows them next to the schedule's figures.
 *   • WorkflowMax owns: job no, site, client, start/due dates, value, class, scope, manager.
 *     The schedule owns: crew, per-day changes, pattern, weekends, assessor, contact, close-out.
 *     If dates change after crew is assigned, the job is flagged "Dates changed in WFM".
 *
 * SAFEGUARDS (v5)
 *   • Backup: a full copy of the schedule Sheet is saved to Drive (folder "TechClean Schedule backups")
 *     before the very first import and then once a day before the first change of the day. Last 14 kept.
 *   • Safe save: rows are written over the old ones — the tab is never cleared first.
 *   • Stop check: if one run would take more than MAX_CANCEL jobs off, close more than MAX_CLOSE jobs, or
 *     leave a branch with fewer live jobs than it had, NOTHING is written. The import pauses, the Log sheet
 *     says why, and an email goes to WFM_ALERT_EMAIL (Script Property, optional). Check it, then run
 *     wfmResume once — the next run is allowed through.
 *   • Duplicates: a WorkflowMax job is matched to the schedule by link, then job number, then job number
 *     ignoring spaces / suffixes, then by SITE ADDRESS (same branch) for hand-typed rows without a proper
 *     job number. If the address matches an open job that has a DIFFERENT job number, the job is still
 *     added but flagged "same address as J0…" so a manager can check it isn't a duplicate.
 *
 * ONE-OFF SETUP
 *  1. Project Settings (⚙) → Script Properties → add:
 *        WFM_CLIENT_ID      = (from developer.workflowmax.com)
 *        WFM_CLIENT_SECRET  = (from developer.workflowmax.com)
 *     Optional: WFM_ACCOUNT_ID (only if the automatic lookup fails)
     Optional: WFM_ALERT_EMAIL  = who gets the email if the stop check pauses the import
     (The first run asks for Google Drive permission — needed for the backup copies.)
 *  2. In the WorkflowMax developer app, set the Redirect URL to this web app's /exec URL
 *     (Deploy → Manage deployments → copy the Web app URL).
 *  3. Deploy a new version, then open:   <web app URL>?action=wfmAuth
 *     Click "Connect WorkflowMax", sign in as a WorkflowMax admin and approve.
 *  4. Back in Apps Script run  wfmInstallTrigger  once (starts the 5-minute import).
 *     Run  wfmTest  any time to see what it would import without writing anything.
 *   • Once a day it also checks timesheets for the last 3 weeks: where a WorkflowMax job had people
 *     timesheeting on a day but NO crew named in the schedule, it fills those names in for that
 *     day (tagged "from timesheets"). It never overwrites crew a manager entered — if the
 *     timesheets show different people it only flags the day. Names are matched to the roster;
 *     unmatched names are listed in Setup → WorkflowMax staff names.
 *  5. Run  wfmMonthlyRebuild  once (fills WFM_Monthly from 1 Jan last year — can take a few
 *     minutes). After that the daily trigger keeps the last two months up to date.
 *     Run  wfmMonthlyTest  to log one invoice + one timesheet as WorkflowMax sends them.
 */

// ── Settings — match these to WorkflowMax (names are not case-sensitive) ────────
const WFM = {
  API:   'https://api.workflowmax.com/v2/',
  AUTH:  'https://oauth.workflowmax.com/oauth/authorize',
  TOKEN: 'https://oauth.workflowmax.com/oauth/token',
  SCOPE: 'openid profile email workflowmax offline_access',

  // TechClean WorkflowMax statuses: Planned · Open Wages · On Hold · Completed · Cancelled
  ACTIVE_STATUSES: ['Planned'],                 // → add / update in schedule ('Planned' = quote approved; can stay Planned while worked)
  HOLD_STATUSES: ['On Hold'],                   // → job shown On hold in the schedule (cleared when it goes back to Planned)
  CLOSED_STATUSES: ['Completed', 'Open Wages'], // → marked $ Invoiced / closed in the schedule. 'Open Wages' = already invoiced,
                                                //   re-opened only so final wages can go in — never brought back into the schedule
  CANCELLED_STATUSES: ['Cancelled'],            // → taken off the schedule (crew freed)

  CF_BRANCH:  'Branch',          // optional custom field — the job Category is used first
  CATEGORY_BRANCH: {             // job Category → branch (lower case; extra names can be added)
    'auckland region': 'Auckland', 'auckland': 'Auckland',
    'wellington region': 'Wellington', 'wellington': 'Wellington',
    'canterbury region': 'Christchurch', 'canterbury': 'Christchurch', 'christchurch region': 'Christchurch', 'christchurch': 'Christchurch'
  },
  CF_FRIABLE: 'Friable',         // tick box → Class A
  CF_NONFRIABLE: 'Non-Friable',  // tick box → Class B
  CF_WORKSAFE: 'WorkSafe Notification',   // text → sent to the H&S app
  CF_CLASS:   'Class',           // custom field: A / B / Meth / Mould
  CF_ADDRESS: 'Site Address',    // custom field (optional) — falls back to the job name

  VALUE_FIELD: 'budget',         // 'budget' or 'estimatedBillings'
  LOOKBACK_DAYS: 1,
  MONTHLY_SHEET: 'WFM_Monthly',  // per-branch, per-month invoiced $ and timesheet hours
  MONTHLY_REFRESH_MONTHS: 2,     // daily refresh re-totals this month + last month
  FILL_LOOKBACK_DAYS: 21,        // timesheet crew fill-in looks back this many days (to yesterday)              // re-check jobs updated since (last run − this many days)
  BRANCHES: ['Auckland', 'Wellington', 'Christchurch'],
  TZ: 'Pacific/Auckland',

  // safeguards
  MAX_CANCEL: 5,                 // more cancellations than this in one run → stop and alert
  MAX_CLOSE: 40,                 // more jobs closed ($ Invoiced) than this in one run → stop and alert
  BACKUP_FOLDER: 'TechClean Schedule backups',
  BACKUP_KEEP: 14
};

const SCHED_HEADERS = ['ID','Job No','Class','Site','Value','WFM Hrs','Staff','Duration',
  'Start','Finish','Resources','Work Sat','Work Sun','Done','Deleted',
  'Project','Client','Checklist','SchedPattern','DayOverrides','Timestamp'];

// ═════════════════════════════════════════════════════════════════════════════
// OAuth
// ═════════════════════════════════════════════════════════════════════════════
function wfmProps_() { return PropertiesService.getScriptProperties(); }
function wfmRedirectUri_() { return ScriptApp.getService().getUrl(); }

/** Called from doGet: ?action=wfmAuth shows the connect link; ?code=… is the OAuth callback. */
function wfmHandleGet(e) {
  const p = (e && e.parameter) || {};
  if (p.code) {
    const ok = wfmExchangeCode_(p.code, p.state);
    return HtmlService.createHtmlOutput(ok
      ? '<h2 style="font-family:sans-serif">✓ WorkflowMax connected</h2><p style="font-family:sans-serif">Close this tab. In Apps Script, run <b>wfmInstallTrigger</b> once if you haven\'t already.</p>'
      : '<h2 style="font-family:sans-serif">✗ Connection failed</h2><p style="font-family:sans-serif">Check the Log sheet / Executions in Apps Script.</p>');
  }
  const id = wfmProps_().getProperty('WFM_CLIENT_ID');
  if (!id) return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Add WFM_CLIENT_ID and WFM_CLIENT_SECRET to Script Properties first.</p>');
  const state = Utilities.getUuid();
  wfmProps_().setProperty('WFM_OAUTH_STATE', state);
  const url = WFM.AUTH + '?response_type=code&client_id=' + encodeURIComponent(id) +
    '&redirect_uri=' + encodeURIComponent(wfmRedirectUri_()) +
    '&scope=' + encodeURIComponent(WFM.SCOPE) + '&state=' + state + '&prompt=consent';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:30px"><h2>Connect TechClean Schedule to WorkflowMax</h2>' +
    '<p>Read-only access to jobs. Sign in as a WorkflowMax admin and approve.</p>' +
    '<p><a target="_top" href="' + url + '" style="background:#A8C800;color:#111;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Connect WorkflowMax</a></p></div>');
}

function wfmExchangeCode_(code, state) {
  const pr = wfmProps_();
  if (state && pr.getProperty('WFM_OAUTH_STATE') && state !== pr.getProperty('WFM_OAUTH_STATE')) { wfmLog_('OAuth state mismatch'); return false; }
  const res = UrlFetchApp.fetch(WFM.TOKEN, {
    method: 'post', muteHttpExceptions: true,
    contentType: 'application/x-www-form-urlencoded',
    payload: { grant_type: 'authorization_code', code: code, redirect_uri: wfmRedirectUri_(),
               client_id: pr.getProperty('WFM_CLIENT_ID'), client_secret: pr.getProperty('WFM_CLIENT_SECRET') }
  });
  if (res.getResponseCode() !== 200) { wfmLog_('Token exchange failed ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300)); return false; }
  wfmStoreTokens_(JSON.parse(res.getContentText()));
  wfmLog_('Connected. Account ' + wfmAccountId_());
  return true;
}

function wfmStoreTokens_(t) {
  const pr = wfmProps_();
  pr.setProperty('WFM_ACCESS_TOKEN', t.access_token);
  if (t.refresh_token) pr.setProperty('WFM_REFRESH_TOKEN', t.refresh_token);   // keep the newest refresh token
  pr.setProperty('WFM_TOKEN_EXPIRES', String(Date.now() + ((t.expires_in || 1800) - 120) * 1000));
  // Account / org id from the JWT (claim name isn't documented, so look for an org-like claim)
  if (!pr.getProperty('WFM_ACCOUNT_ID')) {
    try {
      const claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(t.access_token.split('.')[1] + '==')).getDataAsString());
      const key = Object.keys(claims).find(k => /org|account|tenant/i.test(k));
      let v = key ? claims[key] : null;
      if (Array.isArray(v)) v = v[0];
      if (v) pr.setProperty('WFM_ACCOUNT_ID', String(v));
      else wfmLog_('No org claim found in token — set WFM_ACCOUNT_ID manually. Claims: ' + Object.keys(claims).join(','));
    } catch (e) { wfmLog_('Could not read token claims: ' + e.message); }
  }
}

function wfmToken_() {
  const pr = wfmProps_();
  if (Number(pr.getProperty('WFM_TOKEN_EXPIRES') || 0) > Date.now()) return pr.getProperty('WFM_ACCESS_TOKEN');
  const rt = pr.getProperty('WFM_REFRESH_TOKEN');
  if (!rt) throw new Error('WorkflowMax not connected — open ?action=wfmAuth');
  const res = UrlFetchApp.fetch(WFM.TOKEN, {
    method: 'post', muteHttpExceptions: true, contentType: 'application/x-www-form-urlencoded',
    payload: { grant_type: 'refresh_token', refresh_token: rt, scope: WFM.SCOPE,
               client_id: pr.getProperty('WFM_CLIENT_ID'), client_secret: pr.getProperty('WFM_CLIENT_SECRET') }
  });
  if (res.getResponseCode() !== 200) throw new Error('Token refresh failed ' + res.getResponseCode() + ' — reconnect via ?action=wfmAuth');
  wfmStoreTokens_(JSON.parse(res.getContentText()));
  return pr.getProperty('WFM_ACCESS_TOKEN');
}
function wfmAccountId_() { return wfmProps_().getProperty('WFM_ACCOUNT_ID') || ''; }

function wfmGet_(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = UrlFetchApp.fetch(WFM.API + path, {
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + wfmToken_(), 'account-id': wfmAccountId_(), Accept: 'application/json' }
    });
    const code = res.getResponseCode();
    if (code === 429) { Utilities.sleep(Math.min(30, Number(res.getHeaders()['Retry-After'] || 5)) * 1000); continue; }
    if (code === 401 && attempt === 0) { wfmProps_().setProperty('WFM_TOKEN_EXPIRES', '0'); continue; }
    if (code !== 200) throw new Error('GET ' + path + ' → ' + code + ' ' + res.getContentText().slice(0, 200));
    return JSON.parse(res.getContentText());
  }
  throw new Error('GET ' + path + ' rate-limited');
}
const wfmList_ = r => (r && (r.data || r.items || r.results)) || (Array.isArray(r) ? r : []);

// ═════════════════════════════════════════════════════════════════════════════
// Lookups (cached)
// ═════════════════════════════════════════════════════════════════════════════
function wfmStatusMap_() {
  const c = CacheService.getScriptCache(), hit = c.get('wfm_status');
  if (hit) return JSON.parse(hit);
  const m = {};
  wfmList_(wfmGet_('job-status')).forEach(s => { m[s.uuid] = s.name; });
  c.put('wfm_status', JSON.stringify(m), 21600);
  return m;
}
function wfmName_(kind, uuid) {
  if (!uuid) return '';
  const c = CacheService.getScriptCache(), key = 'wfm_' + kind + '_' + uuid, hit = c.get(key);
  if (hit !== null) return hit;
  let name = '';
  try {
    const r = wfmGet_((kind === 'client' ? 'clients/' : 'staff/') + uuid);
    const o = r.data || r;
    name = o.name || [o.firstName, o.lastName].filter(Boolean).join(' ') || '';
  } catch (e) { wfmLog_('Lookup ' + kind + ' ' + uuid + ': ' + e.message); }
  c.put(key, name, 21600);
  return name;
}
function wfmCF_(job, fieldName) {
  const cf = job.customFields || [];
  const f = cf.find(x => String(x.name || '').trim().toLowerCase() === fieldName.toLowerCase());
  if (!f) return '';
  const v = f.value != null ? f.value : (f.text || f.selectedOption || '');
  return typeof v === 'object' ? (v.name || v.value || '') : String(v).trim();
}
const wfmIn_ = (name, list) => list.some(s => s.toLowerCase() === String(name || '').trim().toLowerCase());
function wfmDate_(v) { if (!v) return ''; const d = new Date(v); return isNaN(d) ? String(v).slice(0, 10) : Utilities.formatDate(d, WFM.TZ, 'yyyy-MM-dd'); }
function wfmTick_(job, name) {
  const cf = (job.customFields || []).find(x => String(x.name || '').trim().toLowerCase() === name.toLowerCase());
  if (!cf) return false;
  const v = cf.value != null ? cf.value : (cf.boolean != null ? cf.boolean : cf.text);
  return v === true || /^(true|yes|1|y|ticked|checked)$/i.test(String(v || '').trim());
}
/** Job category name — the API may give it as an object, a name, or a UUID to look up. */
function wfmCategory_(job) {
  const c = job.category;
  if (c && typeof c === 'object') return String(c.name || '').trim();
  if (c) return String(c).trim();
  if (job.categoryName) return String(job.categoryName).trim();
  if (job.categoryUUID) {
    const cache = CacheService.getScriptCache(), key = 'wfm_cat_' + job.categoryUUID, hit = cache.get(key);
    if (hit !== null) return hit;
    let name = '';
    try { const r = wfmGet_('categories/' + job.categoryUUID); name = String((r.data || r).name || ''); } catch (e) { wfmLog_('Category lookup: ' + e.message); }
    cache.put(key, name, 21600); return name;
  }
  return '';
}
/** Branch: job Category first ("Auckland Region"), then a Branch custom field. */
function wfmBranch_(job) {
  const cat = wfmCategory_(job).toLowerCase();
  if (cat) {
    if (WFM.CATEGORY_BRANCH[cat]) return WFM.CATEGORY_BRANCH[cat];
    const hit = WFM.BRANCHES.find(b => cat.indexOf(b.toLowerCase()) >= 0); if (hit) return hit;
    if (cat.indexOf('canterbury') >= 0) return 'Christchurch';
  }
  const v = wfmCF_(job, WFM.CF_BRANCH);
  return WFM.BRANCHES.find(b => b.toLowerCase() === String(v).toLowerCase()) || '';
}
/** Class: "Class B - …" at the start of the description, then Friable / Non-Friable ticks, then a Class custom field. */
function wfmJobClass_(job) {
  const d = String(job.description || '');
  const m = /^\s*\/?\s*class\s*([ab])\b/i.exec(d);
  if (m) return m[1].toUpperCase();
  if (/^\s*\/?\s*(meth)/i.test(d)) return 'Meth';
  if (/^\s*\/?\s*(mou?ld)/i.test(d)) return 'Mould';
  if (wfmTick_(job, WFM.CF_FRIABLE)) return 'A';
  if (wfmTick_(job, WFM.CF_NONFRIABLE)) return 'B';
  return wfmClass_(wfmCF_(job, WFM.CF_CLASS));
}
/** Scope from the description, without the "Class B - /…/" wrapper. */
function wfmScope_(desc) {
  return String(desc || '').trim()
    .replace(/^\/?\s*class\s*[ab]\b\s*[-–:]*\s*/i, '')
    .replace(/^\/+\s*/, '').replace(/\s*\/+\s*$/, '').trim();
}
function wfmClass_(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (/meth/.test(s)) return 'Meth';
  if (/mou?ld/.test(s)) return 'Mould';
  if (/roof/.test(s)) return 'Roof';
  if (/\bb\b|class b/.test(s)) return 'B';
  if (/\ba\b|class a/.test(s)) return 'A';
  return '';
}

// ═════════════════════════════════════════════════════════════════════════════
// Import
// ═════════════════════════════════════════════════════════════════════════════
/** Main entry — run by the 5-minute trigger. */
function wfmImport() { return wfmRun_(false); }
/** Dry run — logs what would change, writes nothing. */
function wfmTest() { const r = wfmRun_(true); Logger.log(JSON.stringify(r, null, 2)); return r; }

function wfmRun_(dryRun) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { skipped: 'busy' };
  try {
    const pr = wfmProps_();
    const paused = pr.getProperty('WFM_PAUSED');
    if (paused && !dryRun) { console.log('Import paused: ' + paused); return { paused: paused }; }
    const last = pr.getProperty('WFM_LAST_RUN');
    const since = last ? new Date(Number(last) - WFM.LOOKBACK_DAYS * 86400000) : new Date(Date.now() - 30 * 86400000);
    const sinceStr = Utilities.formatDate(since, WFM.TZ, 'yyyy-MM-dd');
    const statuses = wfmStatusMap_();

    // pull changed jobs (standard + completed types), page through
    const jobs = [];
    for (let page = 1; page <= 20; page++) {
      const r = wfmGet_('jobs?status=standard,completed&updatedSince=' + sinceStr +
                        '&includes=custom-fields&sort=updated&order=asc&pageSize=100&page=' + page);
      const list = wfmList_(r);
      jobs.push.apply(jobs, list);
      if (list.length < 100) break;
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const book = wfmReadBook_(ss);                    // { branch: {rows:[], byNo:{}, byWfm:{}} }
    const now = new Date().toISOString();
    const summary = { checked: jobs.length, added: [], updated: [], closed: [], skipped: [], linked: [], possibleDup: [], cancelled: 0, cancelledBy: {}, movedOut: {} };
    const liveBefore = wfmLiveCounts_(book);

    for (const j of jobs) {
      const status = statuses[j.jobStatusUUID] || '';
      const active = wfmIn_(status, WFM.ACTIVE_STATUSES);
      const closed = wfmIn_(status, WFM.CLOSED_STATUSES) || (!!j.completedDate && !wfmIn_(status, WFM.CANCELLED_STATUSES));
      const onHold = wfmIn_(status, WFM.HOLD_STATUSES);
      const cancelled = wfmIn_(status, WFM.CANCELLED_STATUSES);
      const jobNo = String(j.jobNumber || '').trim();
      if (!jobNo) continue;

      const found = wfmFind_(book, j.uuid, jobNo, wfmCF_(j, WFM.CF_ADDRESS) || j.name || '', wfmBranch_(j));   // { branch, idx, how } or null
      if (found && found.how === 'address') summary.linked.push(jobNo + ' → matched by address to "' + (book[found.branch].rows[found.idx][1] || 'no job no') + '" ' + book[found.branch].rows[found.idx][3]);
      if (!found && !active) { summary.skipped.push(jobNo + ' (' + (status || 'no status') + ')'); continue; }

      let branch = wfmBranch_(j) || (found ? found.branch : '');
      if (!branch) { summary.skipped.push(jobNo + ' (category "' + wfmCategory_(j) + '" is not a branch)'); continue; }

      const prev = found ? book[found.branch].rows[found.idx].slice() : null;
      const row = prev ? prev.slice() : ['wfm-' + j.uuid, '', '', '', 0, 0, 0, 0, '', '', '', '', '', '', '', '', '', '{}', '{"type":"full"}', '{}', now];
      let ck = {}; try { ck = JSON.parse(row[17] || '{}'); } catch (e) {}
      const w = ck.wfm || {};
      const changes = [];
      const set = (i, v, label) => { if (v !== '' && v != null && String(row[i]) !== String(v)) { row[i] = v; changes.push(label); } };

      // ── cancelled in WorkflowMax → off the schedule (row kept, marked deleted)
      if (cancelled) {
        if (prev && String(row[14]) !== 'Y') {
          row[14] = 'Y'; ck.wfm = Object.assign(w, { uuid: j.uuid, status: status, syncedAt: now, flag: 'cancelled' });
          row[17] = JSON.stringify(ck); row[20] = now; summary.updated.push(jobNo + ' (cancelled — removed)'); summary.cancelled++; summary.cancelledBy[found.branch] = (summary.cancelledBy[found.branch] || 0) + 1;
          if (!dryRun) book[found.branch].rows[found.idx] = row;
        }
        continue;
      }
      // ── on hold in WorkflowMax → On hold in the schedule
      if (onHold) {
        if (prev && !ck.closeout) {
          ck.closeout = 'hold'; ck.wfmHold = true; ck.wfm = Object.assign(w, { uuid: j.uuid, status: status, syncedAt: now });
          row[17] = JSON.stringify(ck); row[20] = now; summary.updated.push(jobNo + ' (on hold)');
          if (!dryRun) book[found.branch].rows[found.idx] = row;
        }
        continue;
      }

      // ── closed / invoiced in WorkflowMax
      if (closed && !active) {
        if (prev && ck.closeout !== 'invoiced') {
          ck.closeout = 'invoiced'; ck.closedAt = now; row[13] = 'Y';
          ck.wfm = Object.assign(w, { uuid: j.uuid, status: status, syncedAt: now });
          row[17] = JSON.stringify(ck); row[20] = now;
          if (found.branch !== branch) branch = found.branch;
          summary.closed.push(jobNo);
          if (!dryRun) book[found.branch].rows[found.idx] = row;
        }
        continue;
      }
      if (ck.wfmHold && ck.closeout === 'hold') { delete ck.closeout; delete ck.wfmHold; changes.push('off hold'); }
      if (prev && String(row[14]) === 'Y' && w.flag === 'cancelled') { row[14] = ''; delete w.flag; changes.push('un-cancelled'); }
      // invoiced in the schedule but re-opened in WorkflowMax (payroll) → ignore
      if (prev && ck.closeout === 'invoiced') { summary.skipped.push(jobNo + ' (re-opened in WFM — ignored)'); continue; }
      if (!active) continue;   // e.g. Planned — not ready to schedule yet

      // ── WorkflowMax-owned fields
      const site = wfmCF_(j, WFM.CF_ADDRESS) || j.name || '';
      const cls = wfmJobClass_(j);
      const start = wfmDate_(j.startDate), finish = wfmDate_(j.dueDate) || start;
      const value = [j[WFM.VALUE_FIELD], j.budget, j.estimatedBillings].map(Number).find(n => n > 0) || 0;   // Budget is often blank on new jobs
      const oldStart = String(row[8] || ''), oldFinish = String(row[9] || '');

      set(1, jobNo, 'job no');
      if (cls && !(row[2] === 'Roof' && cls === 'B')) set(2, cls, 'class');   // a Roof job set in the schedule stays Roof
      set(3, site, 'site');
      set(4, value || '', 'value');
      // ── dates: the schedule wins once someone has set them by hand.
      // w.start / w.finish = the dates WorkflowMax last sent. If the schedule still shows those (or nothing),
      // follow WorkflowMax; if a person has changed them in the schedule, keep the schedule's dates and flag
      // the difference ('wfmdiff') — only when WorkflowMax's own dates change, so a manager isn't nagged twice.
      const wfmMoved = (w.start || '') !== start || (w.finish || '') !== finish;
      const manual = prev && !!oldStart && (w.start == null ? true : (oldStart !== w.start || oldFinish !== (w.finish || '')));
      if (!manual) { set(8, start, 'start'); set(9, finish, 'finish'); }
      else if (wfmMoved && start && (start !== oldStart || finish !== oldFinish)) {
        w.flag = 'wfmdiff'; w.wfmStart = start; w.wfmFinish = finish; changes.push('WFM dates differ (kept schedule dates)');
      } else if (w.flag === 'wfmdiff' && start === oldStart && finish === oldFinish) { delete w.flag; delete w.wfmStart; delete w.wfmFinish; changes.push('dates agree'); }
      if (wfmMoved && start) { w.start = start; w.finish = finish; if (!changes.length) changes.push('WFM dates noted'); }
      set(16, wfmName_('client', j.clientUUID), 'client');

      // scope / manager: fill from WFM unless someone changed them in the schedule
      const desc = wfmScope_(j.description);
      const ws = wfmCF_(j, WFM.CF_WORKSAFE);
      if (ws && ck.worksafe !== ws) { ck.worksafe = ws; changes.push('WorkSafe no'); }
      if (desc && (!ck.scope || ck.scope === w.scope)) { if (ck.scope !== desc) { ck.scope = desc; changes.push('scope'); } w.scope = desc; }
      const mgr = wfmName_('staff', j.jobManagerUUID);
      if (mgr && (!ck.manager || ck.manager === w.manager)) { if (ck.manager !== mgr) { ck.manager = mgr; changes.push('manager'); } w.manager = mgr; }

      // flags for the app
      const hasCrew = String(row[10] || '').trim() !== '' || Object.keys(JSON.parse(row[19] || '{}')).length > 0;
      if (!prev) {
        w.flag = 'new';
        const twin = wfmAddressTwin_(book, branch, site, jobNo, start, finish);
        if (twin) { w.flag = 'dupaddr'; w.dupOf = twin.no; w.dupSite = twin.site; summary.possibleDup.push(jobNo + ' — same address as ' + twin.no + ' ' + twin.site); }
      }
      else if (!manual && ((oldStart && start && oldStart !== start) || (oldFinish && finish && oldFinish !== finish))) {
        if (hasCrew) { w.flag = 'dates'; w.oldStart = oldStart; w.oldFinish = oldFinish; }
      }
      w.uuid = j.uuid; w.status = status; w.syncedAt = now;
      ck.wfm = w;
      row[17] = JSON.stringify(ck);

      if (!prev) { row[20] = now; summary.added.push(jobNo + ' → ' + branch); }
      else if (changes.length) { row[20] = now; summary.updated.push(jobNo + ': ' + changes.join(', ')); }
      else continue;   // nothing changed

      if (!dryRun) {
        if (found && found.branch !== branch) {           // branch changed in WFM → move the row
          book[found.branch].rows.splice(found.idx, 1); wfmIndex_(book, found.branch); summary.movedOut[found.branch] = (summary.movedOut[found.branch] || 0) + 1;
          book[branch].rows.push(row); wfmIndex_(book, branch);
        } else if (found) book[found.branch].rows[found.idx] = row;
        else { book[branch].rows.push(row); wfmIndex_(book, branch); }
      }
    }

    // ── stop check: never write a run that looks like it would wipe or mass-close the schedule
    const liveAfter = wfmLiveCounts_(book);
    const problems = [];
    if (summary.cancelled > WFM.MAX_CANCEL) problems.push(summary.cancelled + ' jobs would be cancelled (limit ' + WFM.MAX_CANCEL + ')');
    if (summary.closed.length > WFM.MAX_CLOSE) problems.push(summary.closed.length + ' jobs would be closed (limit ' + WFM.MAX_CLOSE + ')');
    WFM.BRANCHES.forEach(b => { const lost = liveBefore[b] - liveAfter[b] - (summary.cancelledBy[b] || 0) - (summary.movedOut[b] || 0); if (lost > 0) problems.push(b + ' would lose ' + lost + ' live job(s)'); });
    const allowOnce = pr.getProperty('WFM_ALLOW_ONCE') === 'Y';
    if (problems.length && !allowOnce) {
      summary.stopped = problems;
      if (!dryRun) {
        const why = problems.join('; ');
        pr.setProperty('WFM_PAUSED', new Date().toISOString() + ' — ' + why);
        wfmLog_('IMPORT STOPPED — nothing written. ' + why + '. Check WorkflowMax, then run wfmResume.');
        wfmAlert_('WorkflowMax import stopped — nothing was changed',
          'The WorkflowMax → Schedule import stopped itself before writing anything:\n\n  ' + problems.join('\n  ') +
          '\n\nNothing in the schedule was changed. Check WorkflowMax (e.g. a bulk status change), then in Apps Script run wfmTest to see what it would do, and wfmResume to let the next run through.');
      }
      return summary;
    }

    if (!dryRun) {
      if (summary.added.length || summary.updated.length || summary.closed.length) {
        wfmBackup_(last ? 'daily' : 'before first import');
        wfmWriteBook_(ss, book);
        if (allowOnce) pr.deleteProperty('WFM_ALLOW_ONCE');
      }
      pr.setProperty('WFM_LAST_RUN', String(Date.now()));
      if (summary.added.length || summary.updated.length || summary.closed.length)
        wfmLog_('Import: +' + summary.added.length + ' new, ' + summary.updated.length + ' updated, ' + summary.closed.length + ' invoiced' +
          (summary.linked.length ? ', ' + summary.linked.length + ' matched by address' : '') + (summary.possibleDup.length ? ', ' + summary.possibleDup.length + ' possible duplicate(s) flagged' : ''));
    }
    return summary;
  } catch (e) {
    wfmLog_('Import error: ' + e.message);
    throw e;
  } finally { lock.releaseLock(); }
}

function wfmReadBook_(ss) {
  const book = {};
  WFM.BRANCHES.forEach(b => {
    const sh = ss.getSheetByName(b) || ss.insertSheet(b);
    const v = sh.getDataRange().getValues();
    const rows = v.slice(1).filter(r => String(r[0] || '').trim()).map(r => {
      const o = r.slice(0, 21); while (o.length < 21) o.push('');
      [8, 9].forEach(i => { if (o[i] instanceof Date) o[i] = Utilities.formatDate(o[i], WFM.TZ, 'yyyy-MM-dd'); });
      return o;
    });
    book[b] = { rows: rows };
    wfmIndex_(book, b);
  });
  return book;
}
function wfmIndex_(book, b) {
  book[b].byNo = {}; book[b].byWfm = {};
  book[b].rows.forEach((r, i) => {
    const no = String(r[1] || '').trim().toUpperCase();
    if (no && String(r[14]) !== 'Y') {   // two live rows with one job no (e.g. a $0 night-shift entry) → link the main one: open first, then biggest value
      const j0 = book[b].byNo[no], o = j0 != null ? book[b].rows[j0] : null;
      const better = !o || String(o[14]) === 'Y' || (String(o[13]) === 'Y' && String(r[13]) !== 'Y') || (String(o[13]) === String(r[13]) && (Number(r[4]) || 0) > (Number(o[4]) || 0));
      if (better) book[b].byNo[no] = i;
    }
    else if (no && book[b].byNo[no] == null) book[b].byNo[no] = i;   // only a deleted row has it → keep it deleted (a job removed by hand isn't re-added)
    try { const w = (JSON.parse(r[17] || '{}').wfm || {}); if (w.uuid) book[b].byWfm[w.uuid] = i; } catch (e) {}
    if (String(r[0]).indexOf('wfm-') === 0) book[b].byWfm[String(r[0]).slice(4)] = i;
  });
}
function wfmFind_(book, uuid, jobNo, site, branch) {
  for (const b of WFM.BRANCHES) if (book[b].byWfm[uuid] != null) return { branch: b, idx: book[b].byWfm[uuid], how: 'link' };
  const no = jobNo.toUpperCase();
  for (const b of WFM.BRANCHES) if (book[b].byNo[no] != null) return { branch: b, idx: book[b].byNo[no], how: 'jobno' };   // job typed in by hand before the link
  // job number typed with spaces / a suffix ("J015664 - 2", "j015664") — only if exactly one live row fits
  const tight = no.replace(/[^A-Z0-9]/g, '');
  const loose = [];
  WFM.BRANCHES.forEach(b => book[b].rows.forEach((r, i) => {
    if (String(r[14]) === 'Y' || wfmRowLinked_(r) || wfmInternal_(r[1])) return;
    const n = String(r[1] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (n === tight) loose.push({ branch: b, idx: i, how: 'jobno' });
  }));
  if (loose.length === 1) return loose[0];
  // hand-typed row with no proper job number at the same address (same branch) → adopt it instead of adding a duplicate
  const key = wfmAddrKey_(site); if (!key) return null;
  const cands = [];
  (branch ? [branch] : WFM.BRANCHES).forEach(b => book[b].rows.forEach((r, i) => {
    if (String(r[14]) === 'Y' || String(r[13]) === 'Y' || wfmRowLinked_(r)) return;
    if (/^J\d{5,7}$/i.test(String(r[1] || '').trim())) return;          // has its own proper job number → a different job
    if (wfmInternal_(r[1])) return;                                     // internal / personal entry (e.g. "J tom") — never touched
    if (wfmAddrKey_(r[3]) === key) cands.push({ branch: b, idx: i, how: 'address' });
  }));
  return cands.length === 1 ? cands[0] : null;
}
/** A word as the job no (e.g. "J tom" — the director's) = internal entry: never matched, adopted or flagged. */
function wfmInternal_(n) { const t = String(n || '').trim(); return /[a-z]{2,}/i.test(t.replace(/^J/i, '')) && !/\d/.test(t); }
function wfmRowLinked_(r) { if (String(r[0]).indexOf('wfm-') === 0) return true; try { return !!((JSON.parse(r[17] || '{}').wfm || {}).uuid); } catch (e) { return false; } }
/** "23 Wedding Place, Takanini_Stage II" → "23 wedding pl". Street number + first street word(s). */
function wfmAddrKey_(s) {
  let n = String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ')
    .replace(/\broad\b/g, 'rd').replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bplace\b/g, 'pl')
    .replace(/\bdrive\b/g, 'dr').replace(/\bcrescent\b/g, 'cres').replace(/\bterrace\b/g, 'tce').replace(/\bgrove\b/g, 'gr')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = n.match(/^(\d+[a-z]?(?: \d+[a-z]?)?) ([a-z]+(?: (?:rd|st|ave|pl|dr|cres|tce|gr|lane|way|close|grv))?)/);
  if (m) return m[1] + ' ' + m[2];
  const w = n.split(' ').slice(0, 3).join(' ');
  return w.length >= 6 ? w : '';
}
/** An open schedule job at the same address with a different job number, overlapping (or undated). */
function wfmAddressTwin_(book, branch, site, jobNo, start, finish) {
  const key = wfmAddrKey_(site); if (!key || !book[branch]) return null;
  for (const r of book[branch].rows) {
    if (String(r[14]) === 'Y' || String(r[13]) === 'Y') continue;
    if (String(r[1] || '').toUpperCase() === jobNo.toUpperCase() || wfmInternal_(r[1])) continue;
    if (wfmAddrKey_(r[3]) !== key) continue;
    const s = String(r[8] || ''), f = String(r[9] || s);
    if (!s || !start || (s <= (finish || start) && f >= start)) return { no: String(r[1] || 'no job no'), site: String(r[3] || '') };
  }
  return null;
}
function wfmLiveCounts_(book) { const o = {}; WFM.BRANCHES.forEach(b => { o[b] = book[b].rows.filter(r => String(r[14]) !== 'Y').length; }); return o; }
function wfmWriteBook_(ss, book) {
  WFM.BRANCHES.forEach(b => {
    const sh = ss.getSheetByName(b);
    const cut = Date.now() - 60 * 86400000;   // keep deleted-job tombstones 60 days, same as the sync script
    const rows = book[b].rows.filter(r => r[14] !== 'Y' || new Date(String(r[20] || 0)).getTime() > cut);
    // safe save: write over the existing rows (never clear the tab first), then blank only the left-over rows below
    const oldLast = sh.getLastRow();
    sh.getRange(1, 1, 1, SCHED_HEADERS.length).setValues([SCHED_HEADERS]).setFontWeight('bold').setBackground('#2B2D2F').setFontColor('#A8C800');
    if (rows.length) sh.getRange(2, 1, rows.length, SCHED_HEADERS.length).setValues(rows);
    const extra = oldLast - 1 - rows.length;
    if (extra > 0) sh.getRange(rows.length + 2, 1, extra, SCHED_HEADERS.length).clearContent();
  });
  SpreadsheetApp.flush();
}

// ── Safeguards ───────────────────────────────────────────────────────────────
/** Copy of the whole schedule Sheet to Drive — before the first import, then once a day. Keeps the last BACKUP_KEEP. */
function wfmBackup_(reason, force) {
  const pr = wfmProps_(), day = Utilities.formatDate(new Date(), WFM.TZ, 'yyyy-MM-dd');
  if (!force && pr.getProperty('WFM_LAST_BACKUP') === day) return;
  try {
    const it = DriveApp.getFoldersByName(WFM.BACKUP_FOLDER);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder(WFM.BACKUP_FOLDER);
    const name = 'Schedule backup ' + Utilities.formatDate(new Date(), WFM.TZ, 'yyyy-MM-dd HHmm') + ' (' + reason + ')';
    DriveApp.getFileById(SHEET_ID).makeCopy(name, folder);
    pr.setProperty('WFM_LAST_BACKUP', day);
    const files = []; const fi = folder.getFiles(); while (fi.hasNext()) files.push(fi.next());
    files.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(WFM.BACKUP_KEEP).forEach(f => f.setTrashed(true));
    wfmLog_('Backup saved: ' + name);
  } catch (e) {
    wfmLog_('Backup FAILED: ' + e.message + ' — import continues (safe save + stop check still on)');
  }
}
/** Run by hand any time — e.g. just before switching the import on. */
function wfmBackupNow() { wfmBackup_('manual', true); }
function wfmAlert_(subject, body) {
  const to = wfmProps_().getProperty('WFM_ALERT_EMAIL');
  if (!to) return;
  try { MailApp.sendEmail(to, subject, body); } catch (e) { console.log('Alert email failed: ' + e.message); }
}
/** After a stop: un-pause and let the next run through once, even if it trips the limits again. */
function wfmResume() {
  const pr = wfmProps_(); pr.deleteProperty('WFM_PAUSED'); pr.setProperty('WFM_ALLOW_ONCE', 'Y');
  wfmLog_('Import resumed by hand — next run allowed through once.');
}
/** Pause the import by hand (e.g. while Finance tidies WorkflowMax). */
function wfmPause() { wfmProps_().setProperty('WFM_PAUSED', new Date().toISOString() + ' — paused by hand'); wfmLog_('Import paused by hand.'); }
function wfmLog_(msg) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    (ss.getSheetByName('Log') || ss.insertSheet('Log')).appendRow([new Date(), 'WFM', msg, '']);
  } catch (e) {}
  console.log(msg);
}

// ═════════════════════════════════════════════════════════════════════════════
// Monthly actuals — invoiced (ex GST) and timesheet hours per branch per month
// Read-only. Writes the WFM_Monthly sheet; the sync script sends it to the app.
// ═════════════════════════════════════════════════════════════════════════════
const WFM_MONTHLY_HEADERS = ['Month', 'Branch', 'Invoiced ex GST', 'Invoices', 'Timesheet hrs', 'Billable hrs', 'Labour cost', 'Updated'];

/** Daily: re-total this month and last month. */
function wfmMonthly() {
  const now = new Date(), from = new Date(now.getFullYear(), now.getMonth() - (WFM.MONTHLY_REFRESH_MONTHS - 1), 1);
  return wfmMonthlyRun_(from, now, false);
}
/** Once, after connecting: re-total everything from 1 January last year. */
function wfmMonthlyRebuild() {
  const now = new Date();
  return wfmMonthlyRun_(new Date(now.getFullYear() - 1, 0, 1), now, false);
}
/** Logs one raw invoice and one raw timesheet so the field names can be checked. */
function wfmMonthlyTest() {
  const d = Utilities.formatDate(new Date(Date.now() - 45 * 86400000), WFM.TZ, 'yyyy-MM-dd');
  const inv = wfmList_(wfmGet_('invoices?status=approved&includes=jobs&updatedSince=' + d + '&pagesize=1'));
  let ts; try { ts = wfmList_(wfmGet_('timesheets?dateFrom=' + d + '&pageSize=1&includes=wip')); Logger.log('Timesheet cost (wip): available'); }
  catch (e) { Logger.log('Timesheet cost (wip): NOT available — ' + e.message); ts = wfmList_(wfmGet_('timesheets?dateFrom=' + d + '&pageSize=1')); }
  Logger.log('Invoice: ' + JSON.stringify(inv[0] || null, null, 2));
  Logger.log('Timesheet: ' + JSON.stringify(ts[0] || null, null, 2));
  const now = new Date();
  Logger.log('This month would be: ' + JSON.stringify(wfmMonthlyRun_(new Date(now.getFullYear(), now.getMonth(), 1), now, true), null, 2));
}

function wfmMonthlyRun_(from, to, dryRun) {
  const lock = LockService.getScriptLock();
  if (!dryRun && !lock.tryLock(60000)) return { skipped: 'busy' };
  try {
    const f = Utilities.formatDate(from, WFM.TZ, 'yyyy-MM-dd'), t = Utilities.formatDate(to, WFM.TZ, 'yyyy-MM-dd');
    const months = {};                      // 'yyyy-MM|Branch' → totals
    const add = (ym, br, k, v) => { const key = ym + '|' + br; const o = months[key] || (months[key] = { inv: 0, n: 0, hrs: 0, bill: 0, cost: 0 }); o[k] += v; };
    const branchOf = wfmJobBranchMap_();

    // Invoices: approved, by invoice date. Created-date window is widened because an invoice can be
    // created before its invoice date; anything outside from..to by invoice date is ignored.
    const cf = Utilities.formatDate(new Date(from.getTime() - 60 * 86400000), WFM.TZ, 'yyyy-MM-dd');
    for (let page = 1; page <= 50; page++) {
      const list = wfmList_(wfmGet_('invoices?status=approved&includes=jobs&createdFrom=' + cf + '&pagesize=1000&page=' + page));
      list.forEach(iv => {
        const d = String(iv.date || '').slice(0, 10); if (!d || d < f || d > t) return;
        const amt = Number(iv.amountExTax) || 0; if (!amt) return;
        const jobs = (iv.jobs || []).filter(j => j && j.uuid);
        const brs = jobs.map(j => branchOf(j.uuid)).filter(Boolean);
        const ym = d.slice(0, 7);
        if (!brs.length) { add(ym, 'Unassigned', 'inv', amt); add(ym, 'Unassigned', 'n', 1); return; }
        brs.forEach(b => add(ym, b, 'inv', amt / brs.length));       // multi-job invoice: split evenly
        add(ym, brs[0], 'n', 1);
      });
      if (list.length < 1000) break;
    }

    // Timesheets: hours by entry date, branch from the job's Branch custom field.
    // includes=wip adds each entry's actual cost (staff cost rate × time) — Pro / Advanced plans only;
    // if WorkflowMax refuses it, carry on without (the app then estimates cost from the labour rate).
    // After a plan upgrade, delete the WFM_NO_WIP script property to try again.
    let wip = wfmProps_().getProperty('WFM_NO_WIP') !== '1';
    for (let page = 1; page <= 100; page++) {
      const q = 'timesheets?dateFrom=' + f + '&dateTo=' + t + '&pageSize=1000&page=' + page;
      let list;
      if (wip) {
        try { list = wfmList_(wfmGet_(q + '&includes=wip')); }
        catch (e) { wip = false; wfmProps_().setProperty('WFM_NO_WIP', '1'); wfmLog_('Timesheet cost (wip) not available on this plan — using hours only. ' + e.message); }
      }
      if (!wip) list = wfmList_(wfmGet_(q));
      list.forEach(ts => {
        const d = String(ts.date || '').slice(0, 10); if (!d) return;
        const hrs = (Number(ts.time) || 0) / 60; if (!hrs) return;
        const b = (ts.job && ts.job.uuid && branchOf(ts.job.uuid)) || 'Unassigned';
        add(d.slice(0, 7), b, 'hrs', hrs);
        if (ts.billable) add(d.slice(0, 7), b, 'bill', hrs);
        if (ts.wip) add(d.slice(0, 7), b, 'cost', Number(ts.wip.costAmount) || 0);
      });
      if (list.length < 1000) break;
    }

    // every month in the window gets a row for every branch (so a month with nothing clears old totals)
    const yms = [];
    for (let c = new Date(from.getFullYear(), from.getMonth(), 1); c <= to; c = new Date(c.getFullYear(), c.getMonth() + 1, 1))
      yms.push(Utilities.formatDate(c, WFM.TZ, 'yyyy-MM'));
    const now = new Date();
    const fresh = [];
    yms.forEach(ym => WFM.BRANCHES.concat(['Unassigned']).forEach(b => {
      const o = months[ym + '|' + b] || { inv: 0, n: 0, hrs: 0, bill: 0, cost: 0 };
      if (b === 'Unassigned' && !o.inv && !o.hrs) return;
      fresh.push([ym, b, Math.round(o.inv * 100) / 100, o.n, Math.round(o.hrs * 10) / 10, Math.round(o.bill * 10) / 10, Math.round(o.cost * 100) / 100, now]);
    }));
    if (dryRun) return fresh;

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName(WFM.MONTHLY_SHEET) || ss.insertSheet(WFM.MONTHLY_SHEET);
    const keep = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, WFM_MONTHLY_HEADERS.length).getValues()
      .map(r => { if (r[0] instanceof Date) r[0] = Utilities.formatDate(r[0], WFM.TZ, 'yyyy-MM'); return r; })
      .filter(r => r[0] && yms.indexOf(String(r[0])) < 0) : [];
    keep.forEach(r => { if (r[7] === '' && r[6] instanceof Date) { r[7] = r[6]; r[6] = 0; } });   // rows written before the Labour cost column
    const rows = keep.concat(fresh).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
    sh.clearContents();
    sh.getRange(1, 1, 1, WFM_MONTHLY_HEADERS.length).setValues([WFM_MONTHLY_HEADERS]).setFontWeight('bold').setBackground('#2B2D2F').setFontColor('#A8C800');
    if (rows.length) {
      sh.getRange(2, 1, rows.length, 1).setNumberFormat('@');          // keep 'yyyy-MM' as text
      sh.getRange(2, 1, rows.length, WFM_MONTHLY_HEADERS.length).setValues(rows);
    }
    wfmLog_('Monthly actuals: ' + yms[0] + ' → ' + yms[yms.length - 1] + ' updated');
    return { months: yms.length, rows: fresh.length };
  } catch (e) {
    wfmLog_('Monthly actuals error: ' + e.message);
    throw e;
  } finally { if (!dryRun) lock.releaseLock(); }
}

/** job UUID → branch. Uses jobs already in the schedule first, then the job's Branch custom field (cached). */
function wfmJobBranchMap_() {
  const known = {};
  try {
    const book = wfmReadBook_(SpreadsheetApp.openById(SHEET_ID));
    WFM.BRANCHES.forEach(b => Object.keys(book[b].byWfm).forEach(u => { known[u] = b; }));
  } catch (e) {}
  const cache = CacheService.getScriptCache();
  return function (uuid) {
    if (known[uuid] !== undefined) return known[uuid];
    const hit = cache.get('wfm_jb_' + uuid);
    if (hit !== null) return (known[uuid] = hit);
    let b = '';
    try {
      const r = wfmGet_('jobs/' + uuid + '?includes=custom-fields');
      b = wfmBranch_(r.data || r);
    } catch (e) { wfmLog_('Branch lookup ' + uuid + ': ' + e.message); }
    cache.put('wfm_jb_' + uuid, b, 21600);
    return (known[uuid] = b);
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Crew fill-in from timesheets (past days only)
// Empty day in the schedule + timesheets on that job/day → crew filled in, tagged ck.tsFill[d].
// Crew already named and different from the timesheets → ck.tsDiff[d] = timesheet names (flag only).
// ═════════════════════════════════════════════════════════════════════════════
function wfmFillCrew() { return wfmFillRun_(false); }
function wfmFillTest() { const r = wfmFillRun_(true); Logger.log(JSON.stringify(r, null, 2)); return r; }

const wfmNorm_ = n => String(n || '').toLowerCase().replace(/[^a-zÀ-ɏĀ-ſ' -]/g, '').replace(/\s+/g, ' ').trim();

/** Roster (Staff sheet) + Setup name map (Absences: Auckland | training | __staffmap) → matcher. */
function wfmNameMatcher_(ss) {
  const roster = [];
  const st = ss.getSheetByName('Staff');
  if (st) st.getDataRange().getValues().slice(1).forEach(r => { const n = String(r[1] || '').trim(); if (n && String(r[2] || '').toLowerCase() !== 'removed') roster.push(n); });
  const map = {};
  const ab = ss.getSheetByName('Absences');
  if (ab) ab.getDataRange().getValues().slice(1).forEach(r => {
    if (String(r[2]) !== '__staffmap') return;
    try { (JSON.parse(r[3] || '[]') || []).forEach(m => { if (m && m.wfm && m.name) map[wfmNorm_(m.wfm)] = m.name; }); } catch (e) {}
  });
  const byNorm = {}; roster.forEach(n => { byNorm[wfmNorm_(n)] = n; });
  return function (first, last) {
    const full = wfmNorm_([first, last].filter(Boolean).join(' '));
    if (!full) return '';
    if (map[full]) return map[full];
    if (byNorm[full]) return byNorm[full];
    // same surname and one first name starts with the other (Chris / Christopher) — only if unique
    const fn = wfmNorm_(first), ln = wfmNorm_(last);
    const c = roster.filter(n => { const p = wfmNorm_(n).split(' '), rf = p[0] || '', rl = p.slice(1).join(' ');
      return ln && rl === ln && fn && (rf.indexOf(fn) === 0 || fn.indexOf(rf) === 0); });
    return c.length === 1 ? c[0] : '';
  };
}

function wfmFillRun_(dryRun) {
  const lock = LockService.getScriptLock();
  if (!dryRun && !lock.tryLock(60000)) return { skipped: 'busy' };
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const today = Utilities.formatDate(new Date(), WFM.TZ, 'yyyy-MM-dd');
    const to = Utilities.formatDate(new Date(Date.now() - 86400000), WFM.TZ, 'yyyy-MM-dd');
    const from = Utilities.formatDate(new Date(Date.now() - WFM.FILL_LOOKBACK_DAYS * 86400000), WFM.TZ, 'yyyy-MM-dd');
    const match = wfmNameMatcher_(ss);

    // job uuid → date → [names]; unmatched names collected for Setup
    const byJob = {}, unmatched = {};
    for (let page = 1; page <= 50; page++) {
      const list = wfmList_(wfmGet_('timesheets?dateFrom=' + from + '&dateTo=' + to + '&pageSize=1000&page=' + page));
      list.forEach(t => {
        const u = t.job && t.job.uuid, d = String(t.date || '').slice(0, 10), sf = t.staff || {};
        if (!u || !d || d >= today || !(Number(t.time) > 0)) return;
        const raw = [sf.firstName, sf.lastName].filter(Boolean).join(' ').trim();
        if (!raw) return;
        const nm = match(sf.firstName, sf.lastName);
        if (!nm) { unmatched[raw] = { name: raw, job: (t.job.jobNumber || ''), date: d }; return; }
        const day = (byJob[u] = byJob[u] || {}); (day[d] = day[d] || []);
        if (day[d].indexOf(nm) < 0) day[d].push(nm);
      });
      if (list.length < 1000) break;
    }

    const book = wfmReadBook_(ss), now = new Date().toISOString();
    const out = { filled: [], flagged: [], unmatched: Object.keys(unmatched) };
    let changed = false;
    WFM.BRANCHES.forEach(b => Object.keys(book[b].byWfm).forEach(u => {
      if (!byJob[u]) return;
      const idx = book[b].byWfm[u], row = book[b].rows[idx];
      if (row[14] === 'Y') return;                                   // deleted
      let ck = {}, ov = {}; try { ck = JSON.parse(row[17] || '{}'); } catch (e) {} try { ov = JSON.parse(row[19] || '{}'); } catch (e) {}
      if (ck.closeout === 'hold') return;
      const start = String(row[8] || ''), finish = String(row[9] || '');
      const whole = String(row[10] || '').split(',').map(x => x.trim()).filter(Boolean);
      ck.tsFill = ck.tsFill || {}; ck.tsDiff = ck.tsDiff || {};
      let rowChanged = false;
      Object.keys(byJob[u]).sort().forEach(d => {
        const ts = byJob[u][d].slice().sort();
        const o = ov[d];
        let sched;
        if (o === '__OFF__') sched = [];
        else if (o != null && String(o).trim() !== '') sched = String(o).split(',').map(x => x.trim()).filter(Boolean);
        else sched = (start && finish && d >= start && d <= finish) ? whole : [];
        const filledBefore = ck.tsFill[d];
        if (!sched.length || (filledBefore && String(o || '') === filledBefore.join(', '))) {
          // empty (or still exactly what we filled last time) → fill / refresh from timesheets
          if (String(o || '') !== ts.join(', ')) { ov[d] = ts.join(', '); rowChanged = true; out.filled.push(b + ' ' + row[1] + ' ' + d + ': ' + ts.join(', ')); }
          if (!filledBefore || filledBefore.join(', ') !== ts.join(', ')) { ck.tsFill[d] = ts; rowChanged = true; }
          if (ck.tsDiff[d]) { delete ck.tsDiff[d]; rowChanged = true; }
        } else {
          if (filledBefore) { delete ck.tsFill[d]; rowChanged = true; }   // a manager has since set the crew
          const same = sched.map(wfmNorm_).sort().join('|') === ts.map(wfmNorm_).sort().join('|');
          if (!same && (!ck.tsDiff[d] || ck.tsDiff[d].join(', ') !== ts.join(', ')) && !(ck.tsOk && ck.tsOk[d])) {
            ck.tsDiff[d] = ts; rowChanged = true; out.flagged.push(b + ' ' + row[1] + ' ' + d + ': schedule ' + sched.join(', ') + ' / timesheets ' + ts.join(', '));
          }
          if (same && ck.tsDiff[d]) { delete ck.tsDiff[d]; rowChanged = true; }
        }
      });
      if (!Object.keys(ck.tsFill).length) delete ck.tsFill;
      if (!Object.keys(ck.tsDiff).length) delete ck.tsDiff;
      if (rowChanged) { row[17] = JSON.stringify(ck); row[19] = JSON.stringify(ov); row[20] = now; changed = true; }
    }));
    if (dryRun) return out;
    if (changed) wfmWriteBook_(ss, book);

    // unmatched names → sheet the app reads (Setup → WorkflowMax staff names)
    const sh = ss.getSheetByName('WFM_Unmatched') || ss.insertSheet('WFM_Unmatched');
    const prev = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues() : [];
    const keep = {}; prev.forEach(r => { if (r[0]) keep[String(r[0])] = r; });
    Object.keys(unmatched).forEach(n => { keep[n] = [n, unmatched[n].job, unmatched[n].date]; });
    const stillUnmatched = Object.keys(keep).filter(n => { const p = n.split(' '); return !match(p[0], p.slice(1).join(' ')); });
    sh.clearContents();
    sh.getRange(1, 1, 1, 3).setValues([['WorkflowMax name', 'Last job', 'Last date']]).setFontWeight('bold').setBackground('#2B2D2F').setFontColor('#A8C800');
    if (stillUnmatched.length) sh.getRange(2, 1, stillUnmatched.length, 3).setValues(stillUnmatched.map(n => keep[n]));
    if (out.filled.length || out.flagged.length) wfmLog_('Timesheet crew: ' + out.filled.length + ' day(s) filled, ' + out.flagged.length + ' flagged, ' + stillUnmatched.length + ' unmatched name(s)');
    return out;
  } catch (e) {
    wfmLog_('Timesheet crew error: ' + e.message);
    throw e;
  } finally { if (!dryRun) lock.releaseLock(); }
}

/** Daily job (2am): monthly actuals, then crew fill-in. */
function wfmDaily() { try { wfmMonthly(); } catch (e) {} try { wfmFillCrew(); } catch (e) {} }

// ═════════════════════════════════════════════════════════════════════════════
// Trigger management
// ═════════════════════════════════════════════════════════════════════════════
function wfmInstallTrigger() {
  wfmRemoveTrigger();
  ScriptApp.newTrigger('wfmImport').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('wfmDaily').timeBased().everyDays(1).atHour(2).inTimezone(WFM.TZ).create();
  wfmLog_('5-minute WorkflowMax import + daily monthly actuals and timesheet crew fill-in (2am) switched ON');
}
function wfmRemoveTrigger() {
  ScriptApp.getProjectTriggers().filter(t => ['wfmImport', 'wfmMonthly', 'wfmDaily'].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
}
/** Lists WorkflowMax job statuses, custom-field names and one recent job's fields — run once to check the names in WFM settings above. */
function wfmShowSettings() {
  try {
    const j = wfmList_(wfmGet_('jobs?includes=custom-fields&sort=updated&order=desc&pageSize=1'))[0];
    if (j) Logger.log('Sample job ' + j.jobNumber + ': fields ' + JSON.stringify(Object.keys(j)) + ' · category "' + wfmCategory_(j) + '" → branch "' + wfmBranch_(j) + '" · class "' + wfmJobClass_(j) + '" · custom ' + JSON.stringify((j.customFields || []).map(f => f.name + '=' + JSON.stringify(f.value))));
  } catch (e) { Logger.log('Sample job: ' + e.message); }
  Logger.log('Statuses: ' + JSON.stringify(wfmList_(wfmGet_('job-status')).map(s => s.name)));
  try { Logger.log('Custom fields: ' + JSON.stringify(wfmList_(wfmGet_('custom-fields')).map(f => f.name))); } catch (e) { Logger.log(e.message); }
}
