const SHEET_ID = '1UOabcy7JwNISvqWqFVVWWfEVHfUOogYqVMRZa8ngBIc';
const MIN_APP_VERSION = 93;   // v57: absence dates kept as yyyy-mm-dd text (Sheets was turning them into dates) · v56: serves WFM_Invoices + WFM_Jobs to Admin → Work vs invoicing · v55: app v91+ only sends the leave/training/allocation entries it changed — older copies put back stale allocations

function doPost(e) {
  // One writer at a time — device syncs and the WorkflowMax import share this lock
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'sync') {
      // v54: out-of-date copies of the app (open in a browser that hasn't been refreshed) are not allowed to save —
      // on 23 Nov 2026 one overwrote 261 jobs with stale data. They get told to refresh instead.
      const ver = parseInt(String(data.ver || '').replace(/^v/i, ''), 10) || 0;
      if (ver < MIN_APP_VERSION) return json({ ok: false, update: true,
        error: 'This copy of the schedule is out of date — press Ctrl+F5 (or Update now) to load the latest version. Your changes are kept on this device and will save after the update.' });
      return handleSync(data);
    }
    throw new Error('Unknown action');
  } catch(err) { return json({ok:false, error:err.message}); }
  finally { try { lock.releaseLock(); } catch(x) {} }
}

function doGet(e) {
  // WorkflowMax connection (only active once the wfm script file is added)
  if (typeof wfmHandleGet === 'function' && (e.parameter.code || e.parameter.action === 'wfmAuth')) return wfmHandleGet(e);
  if (e.parameter.action === 'getJobs') return handleGetJobs();
  if (e.parameter.action === 'hsFeed') return handleHsFeed(e.parameter);   // H&S back end only — needs HS_KEY
  return json({ok:false, error:'Unknown action'});
}

function fmtDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d)) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return '';
}

function handleSync(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const headers = [
    'ID','Job No','Class','Site','Value','WFM Hrs','Staff','Duration',
    'Start','Finish','Resources','Work Sat','Work Sun','Done','Deleted',
    'Project','Client','Checklist','SchedPattern','DayOverrides','Timestamp'
  ];
  const incomingJobs = data.jobs || [];

  for (const branch of ['Auckland','Wellington','Christchurch']) {
    let sheet = ss.getSheetByName(branch);
    if (!sheet) sheet = ss.insertSheet(branch);

    // Read existing rows keyed by ID
    const existing = {};
    const sheetData = sheet.getDataRange().getValues();
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      const id = String(row[0]||'').trim();
      if (id) existing[id] = row;
    }

    // Merge incoming jobs for this branch — but only if the incoming copy is
    // newer than (or equal to) what's already on the sheet. This stops a stale
    // device from overwriting a fresher edit (e.g. a per-day staff change).
    const incoming = incomingJobs.filter(j => j.branch === branch);
    for (const j of incoming) {
      const id = String(j.id||j.jobno||'').trim();
      if (!id) continue;
      const prev = existing[id];
      const prevTs = prev ? String(prev[20]||'') : '';   // col 20 = ts
      const incTs  = String(j.ts||'');
      // If we already hold a strictly newer version, keep it — skip this push.
      if (prev && prevTs && incTs && new Date(incTs) < new Date(prevTs)) continue;
      existing[id] = [
        id,
        j.jobno||'',
        j.jclass||'',
        j.site||'',
        j.val||0,
        j.wfm||0,
        j.staff||0,
        j.dur||0,
        j.start||'',
        j.finish||'',
        j.resource||'',
        j.workSat?'Y':'',
        j.workSun?'Y':'',
        j.done?'Y':'',
        j._del?'Y':'',                              // deletion flag
        j.project||'',                              // project grouping
        j.client||'',                               // client name
        JSON.stringify(j.checklist||{}),            // checklist state
        JSON.stringify(j.schedPattern||{type:'full'}), // schedule pattern
        JSON.stringify(j.dayOverrides||{}),         // per-day overrides
        j.ts||new Date().toISOString()
      ];
    }

    // Write back — exclude deleted jobs from sheet display but keep them briefly
    // Actually filter out deleted so they don't come back on other devices
    // Deleted jobs are kept as tombstones (Deleted = Y) for 60 days so a device holding an
    // older copy can't push them back; handleGetJobs never returns them.
    const _cut = Date.now() - 60*86400000;
    const rows = Object.values(existing).filter(r => r[14] !== 'Y' || new Date(String(r[20]||0)).getTime() > _cut); // col 14 = Deleted, col 20 = ts

    sheet.clearContents();
    sheet.getRange(1,1,1,headers.length).setValues([headers])
         .setFontWeight('bold').setBackground('#2B2D2F').setFontColor('#A8C800');
    if (rows.length > 0) sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
  }

  // Sync staff — v53: changes arrive as add / remove / rename operations, so removals stick.
  // Removed names are kept as "removed" rows (tombstones) so a device with an old list can't add them back.
  if (data.staffOps || data.staff) {
    let staffSheet = ss.getSheetByName('Staff');
    if (!staffSheet) staffSheet = ss.insertSheet('Staff');
    const BRS = ['Auckland','Wellington','Christchurch'];
    const nk = function(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); };
    // rows: key "branch|name" → {br, name, removed, changed}
    const rows = {};
    staffSheet.getDataRange().getValues().slice(1).forEach(function(r) {
      const br = String(r[0] || '').trim(), name = String(r[1] || '').trim();
      if (!br || !name || BRS.indexOf(br) < 0) return;
      rows[br + '|' + nk(name)] = {br: br, name: name, removed: String(r[2] || '').toLowerCase() === 'removed', changed: r[3] || ''};
    });
    const now = new Date().toISOString();
    const setActive = function(br, name) { if (BRS.indexOf(br) < 0 || !String(name || '').trim()) return; rows[br + '|' + nk(name)] = {br: br, name: String(name).trim(), removed: false, changed: now}; };
    const setRemoved = function(br, name) { const k = br + '|' + nk(name); if (rows[k]) { rows[k].removed = true; rows[k].changed = now; } else if (BRS.indexOf(br) >= 0 && name) rows[k] = {br: br, name: String(name).trim(), removed: true, changed: now}; };
    if (Array.isArray(data.staffOps) && data.staffOps.length) {
      data.staffOps.forEach(function(o) {
        if (!o || !o.br) return;
        if (o.op === 'add') setActive(o.br, o.name);
        else if (o.op === 'remove') setRemoved(o.br, o.name);
        else if (o.op === 'rename' && o.to) { setRemoved(o.br, o.name); setActive(o.br, o.to); }
        else if (o.op === 'setAll' && Array.isArray(o.list)) {   // admin "force overwrite": this list becomes the branch roster
          const keep = {}; o.list.forEach(function(n) { keep[nk(n)] = 1; setActive(o.br, n); });
          Object.keys(rows).forEach(function(k) { const x = rows[k]; if (x.br === o.br && !x.removed && !keep[nk(x.name)]) setRemoved(x.br, x.name); });
        }
      });
    } else if (data.staff && data.staffEdit) {
      // older app versions send the whole list: add new names only, never revive removed ones
      BRS.forEach(function(br) { (data.staff[br] || []).forEach(function(name) {
        const k = br + '|' + nk(name); if (!rows[k]) setActive(br, name);
      }); });
    }
    const out = Object.keys(rows).map(function(k) { return rows[k]; })
      .sort(function(a, b) { return BRS.indexOf(a.br) - BRS.indexOf(b.br) || (a.removed - b.removed) || a.name.localeCompare(b.name); })
      .map(function(x) { return [x.br, x.name, x.removed ? 'removed' : '', x.changed]; });
    staffSheet.clearContents();
    staffSheet.getRange(1,1,1,4).setValues([['Branch','Name','Status','Changed']])
              .setFontWeight('bold').setBackground('#2B2D2F').setFontColor('#A8C800');
    if (out.length) staffSheet.getRange(2,1,out.length,4).setValues(out);
  }

  // ── Absences (Leave & Training) ──────────────────────────
  if (data.leave || data.training) {
    let absSheet = ss.getSheetByName('Absences');
    if (!absSheet) absSheet = ss.insertSheet('Absences');

    // Read existing absence rows keyed by "branch|type|date"
    const existingAbs = {};
    const absData = absSheet.getDataRange().getValues();
    for (let i = 1; i < absData.length; i++) {
      const row = absData[i];
      const d = absDate_(row[2]);
      const key = String(row[0]||'')+'|'+String(row[1]||'')+'|'+d;
      if (key === '||') continue;
      if (existingAbs[key]) {                       // same day stored twice (date + text) → one row, names combined
        let a = [], b = []; try { a = JSON.parse(existingAbs[key][3] || '[]'); } catch (e) {} try { b = JSON.parse(row[3] || '[]'); } catch (e) {}
        if (Array.isArray(a) && Array.isArray(b)) b.forEach(n => { if (a.indexOf(n) < 0) a.push(n); });
        existingAbs[key] = [row[0], row[1], d, JSON.stringify(a), row[4]];
      } else existingAbs[key] = [row[0], row[1], d, row[3], row[4]];
    }

    // Merge incoming leave and training
    for (const type of ['leave','training']) {
      const incoming = data[type] || {};
      for (const br of ['Auckland','Wellington','Christchurch']) {
        const brData = incoming[br] || {};
        for (const [date, staff] of Object.entries(brData)) {
          const key = br+'|'+type+'|'+absDate_(date);
          if (staff && staff.length > 0) {
            existingAbs[key] = [br, type, absDate_(date), JSON.stringify(staff), new Date().toISOString()];
          } else {
            delete existingAbs[key]; // cleared by device — remove from sheet
          }
        }
      }
    }

    const absHeaders = ['Branch','Type','Date','Staff','Timestamp'];
    absSheet.clearContents();
    absSheet.getRange(1,1,1,5).setValues([absHeaders])
            .setFontWeight('bold').setBackground('#2B2D2F').setFontColor('#A8C800');
    const absRows = Object.values(existingAbs);
    if (absRows.length > 0) { absSheet.getRange(2,3,absRows.length,1).setNumberFormat('@'); absSheet.getRange(2,1,absRows.length,5).setValues(absRows); }
  }

  // Log
  let log = ss.getSheetByName('Log');
  if (!log) log = ss.insertSheet('Log');
  log.appendRow([new Date(), 'Sync', incomingJobs.length+' jobs', data.ts||'']);

  // H&S app feed: crew by day etc., worked out by the schedule app (never stops a sync if it fails)
  try { if (data.hsFeed) hsStoreFeed_(ss, data.hsFeed); } catch (err) { console.error('hsFeed store: ' + err.message); }

  return handleGetJobs();
}

function handleGetJobs() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const allJobs = [];

  for (const branch of ['Auckland','Wellington','Christchurch']) {
    const sheet = ss.getSheetByName(branch);
    if (!sheet) continue;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[1]) continue; // skip empty rows
      if (row[14] === 'Y') continue; // deleted (tombstone) — never sent to devices

      // Parse JSON fields safely
      let checklist = {};
      let schedPattern = {type:'full'};
      let dayOverrides = {};
      try { checklist = JSON.parse(row[17]||'{}'); } catch(e) {}
      try { schedPattern = JSON.parse(row[18]||'{"type":"full"}'); } catch(e) {}
      try { dayOverrides = JSON.parse(row[19]||'{}'); } catch(e) {}

      allJobs.push({
        id:          String(row[0]||row[1]),
        jobno:       String(row[1]||''),
        jclass:      String(row[2]||''),
        site:        String(row[3]||''),
        val:         Number(row[4])||0,
        wfm:         Number(row[5])||0,
        staff:       Number(row[6])||0,
        dur:         Number(row[7])||0,
        start:       fmtDate(row[8]),
        finish:      fmtDate(row[9]),
        resource:    String(row[10]||''),
        workSat:     row[11]==='Y',
        workSun:     row[12]==='Y',
        done:        row[13]==='Y',
        // row[14] = Deleted — excluded from results (filtered out above)
        project:     String(row[15]||''),
        client:      String(row[16]||''),
        checklist:   checklist,
        schedPattern: schedPattern,
        dayOverrides: dayOverrides,
        branch:      branch,
        ts:          String(row[20]||'')
      });
    }
  }

  // Staff
  const staff = {Auckland:[], Wellington:[], Christchurch:[]};
  const staffSheet = ss.getSheetByName('Staff');
  if (staffSheet) {
    const staffData = staffSheet.getDataRange().getValues();
    for (let i = 1; i < staffData.length; i++) {
      const br = staffData[i][0];
      const name = String(staffData[i][1]||'').trim();
      const removed = String(staffData[i][2]||'').toLowerCase() === 'removed';
      if (br && name && staff[br] && !removed && staff[br].indexOf(name) < 0) staff[br].push(name);
    }
  }

  // Absences — return leave & training for all branches
  const leave    = {Auckland:{}, Wellington:{}, Christchurch:{}};
  const training = {Auckland:{}, Wellington:{}, Christchurch:{}};
  const absSheet = ss.getSheetByName('Absences');
  if (absSheet) {
    const absData = absSheet.getDataRange().getValues();
    for (let i = 1; i < absData.length; i++) {
      const row   = absData[i];
      const br    = String(row[0]||'').trim();
      const type  = String(row[1]||'').trim();
      const date  = absDate_(row[2]);
      let   names = [];
      try { names = JSON.parse(row[3]||'[]'); } catch(e) {}
      if (br && type && date && names.length) {
        const tgt = type === 'leave' ? leave[br] : type === 'training' ? training[br] : null;
        if (tgt) { if (tgt[date] && Array.isArray(tgt[date]) && Array.isArray(names)) names.forEach(n => { if (tgt[date].indexOf(n) < 0) tgt[date].push(n); }); else tgt[date] = names; }
      }
    }
  }

  // WorkflowMax monthly actuals (filled by the wfm script once it is connected)
  const wfmMonthly = {Auckland:{}, Wellington:{}, Christchurch:{}, Unassigned:{}};
  const wmSheet = ss.getSheetByName('WFM_Monthly');
  if (wmSheet && wmSheet.getLastRow() > 1) {
    const wmCols = Math.max(7, wmSheet.getLastColumn());
    wmSheet.getRange(2, 1, wmSheet.getLastRow() - 1, wmCols).getValues().forEach(function(r) {
      const ym = r[0] instanceof Date ? Utilities.formatDate(r[0], 'Pacific/Auckland', 'yyyy-MM') : String(r[0] || '').slice(0, 7);
      const br = String(r[1] || '').trim();
      const hasCost = wmCols >= 8;   // 'Labour cost' column (wfm v3 with timesheet costs)
      if (ym && wfmMonthly[br]) wfmMonthly[br][ym] = {inv: Number(r[2]) || 0, n: Number(r[3]) || 0, hrs: Number(r[4]) || 0, bill: Number(r[5]) || 0, cost: hasCost ? (Number(r[6]) || 0) : 0};
    });
    wfmMonthly.updated = String(wmSheet.getRange(2, wmCols >= 8 ? 8 : 7).getValue() || '');
  }

  // WorkflowMax invoices, last 4 months (filled by the wfm script v7+) — Admin → Work vs invoicing
  const wfmInvoices = [];
  const ivSheet = ss.getSheetByName('WFM_Invoices');
  if (ivSheet && ivSheet.getLastRow() > 1) ivSheet.getRange(2, 1, ivSheet.getLastRow() - 1, 10).getValues().forEach(function(r) {
    const d = r[1] instanceof Date ? Utilities.formatDate(r[1], 'Pacific/Auckland', 'yyyy-MM-dd') : String(r[1] || '').slice(0, 10);
    if (r[0] && d) wfmInvoices.push({no: String(r[0]), d: d, u: String(r[2] || ''), jn: String(r[3] || ''), nm: String(r[4] || ''), cl: String(r[5] || ''), amt: Number(r[6]) || 0, st: String(r[7] || ''), ty: String(r[8] || ''), br: String(r[9] || '')});
  });

  // Open WorkflowMax jobs (wfm script v7+, every 6 h) — check for jobs missing from the schedule
  const wfmJobs = [];
  const wjSheet = ss.getSheetByName('WFM_Jobs');
  if (wjSheet && wjSheet.getLastRow() > 1) wjSheet.getRange(2, 1, wjSheet.getLastRow() - 1, 10).getValues().forEach(function(r) {
    const f = v => v instanceof Date ? Utilities.formatDate(v, 'Pacific/Auckland', 'yyyy-MM-dd') : String(v || '').slice(0, 10);
    if (r[0]) wfmJobs.push({no: String(r[0]), u: String(r[1] || ''), nm: String(r[2] || ''), st: String(r[3] || ''), br: String(r[4] || ''), s: f(r[6]), d: f(r[7]), cl: String(r[8] || ''), at: r[9] instanceof Date ? r[9].toISOString() : String(r[9] || '')});
  });

  // WorkflowMax timesheet names that didn't match anyone on the roster (Setup → WorkflowMax staff names)
  const wfmUnmatched = [];
  const unSheet = ss.getSheetByName('WFM_Unmatched');
  if (unSheet && unSheet.getLastRow() > 1) unSheet.getRange(2, 1, unSheet.getLastRow() - 1, 3).getValues().forEach(function(r) {
    if (r[0]) wfmUnmatched.push({name: String(r[0]), job: String(r[1] || ''), date: r[2] instanceof Date ? Utilities.formatDate(r[2], 'Pacific/Auckland', 'yyyy-MM-dd') : String(r[2] || '')});
  });

  // H&S status for today (cached every 15 min from the H&S back end by hsStatusRefresh)
  const hsStatus = {};
  const hsSh = ss.getSheetByName('HS_Status');
  if (hsSh && hsSh.getLastRow() > 1) {
    const today = Utilities.formatDate(new Date(), 'Pacific/Auckland', 'yyyy-MM-dd');
    hsSh.getRange(2, 1, hsSh.getLastRow() - 1, 4).getValues().forEach(function(r) {
      const d = r[1] instanceof Date ? Utilities.formatDate(r[1], 'Pacific/Auckland', 'yyyy-MM-dd') : String(r[1] || '');
      if (r[0] && d === today) { try { hsStatus[String(r[0])] = JSON.parse(r[2]); } catch (e) {} }
    });
  }

  return json({ok:true, jobs:allJobs, staff:staff, leave:leave, training:training, wfmMonthly:wfmMonthly, wfmInvoices:wfmInvoices, wfmJobs:wfmJobs, wfmUnmatched:wfmUnmatched, hsStatus:hsStatus, count:allJobs.length});
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}



// ─────────────────────────────────────────────────────────────────────────────
// Daily "no crew" email — jobs starting in the next working days with nobody named.
// Who gets it:
//   • each job's TechClean manager / supervisor — their own jobs only. Emails are entered in the app
//     (Setup → Manager / supervisor emails) and ride the Absences sync (Auckland | training | __mgrEmails).
//   • optional overview of everything: Script Property ALERT_EMAILS = a@x.co.nz, b@x.co.nz
//     (optional per branch: ALERT_EMAILS_AUCKLAND / _WELLINGTON / _CHRISTCHURCH)
// Sent through Microsoft 365 (see m365Send_ below) — nothing goes out until M365_* properties are set.
// Setup (once): run installNoCrewAlert and approve the permissions. noCrewTest = dry run.
// ─────────────────────────────────────────────────────────────────────────────
const ALERT_DAYS = 5;   // working days ahead to check
function installNoCrewAlert() {
  ScriptApp.getProjectTriggers().filter(function(t){ return t.getHandlerFunction() === 'noCrewAlert'; }).forEach(function(t){ ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('noCrewAlert').timeBased().everyDays(1).atHour(6).inTimezone('Pacific/Auckland').create();
}
function noCrewAlert() { return noCrewRun_(false); }
function noCrewTest() { const r = noCrewRun_(true); Logger.log(JSON.stringify(r, null, 2)); return r; }

function noCrewRun_(dryRun) {
  const tz = 'Pacific/Auckland', now = new Date();
  const dow = Number(Utilities.formatDate(now, tz, 'u'));   // 1 = Mon … 7 = Sun
  if (!dryRun && dow > 5) return {skipped: 'weekend'};
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  // next ALERT_DAYS working days (Mon–Fri) from today
  const days = []; let c = new Date(now.getTime());
  while (days.length < ALERT_DAYS) { const u = Number(Utilities.formatDate(c, tz, 'u')); if (u <= 5) days.push(Utilities.formatDate(c, tz, 'yyyy-MM-dd')); c = new Date(c.getTime() + 86400000); }
  const fmt = function(v){ return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || '').slice(0, 10); };
  const result = {};
  ['Auckland', 'Wellington', 'Christchurch'].forEach(function(br) {
    const sh = ss.getSheetByName(br); if (!sh) return;
    const list = [];
    sh.getDataRange().getValues().slice(1).forEach(function(r) {
      if (!r[0] || r[13] === 'Y' || r[14] === 'Y') return;            // done / deleted
      let ck = {}, ov = {}; try { ck = JSON.parse(r[17] || '{}'); } catch (e) {} try { ov = JSON.parse(r[19] || '{}'); } catch (e) {}
      if (ck.closeout === 'hold' || ck.closeout === 'finished' || ck.closeout === 'invoiced') return;
      const st = fmt(r[8]), fi = fmt(r[9]) || st; if (!st) return;
      const need = Number(r[6]) || 0;
      const whole = String(r[10] || '').split(',').map(function(x){ return x.trim(); }).filter(String);
      const empty = days.filter(function(d) {
        if (d < st || d > fi) return false;
        const o = ov[d]; if (o === '__OFF__') return false;
        const crew = (o != null && String(o).trim() !== '') ? String(o).split(',').filter(function(x){ return x.trim(); }) : whole;
        return crew.length === 0 || (need && crew.length < need);
      });
      if (empty.length) list.push({job: String(r[1] || ''), site: String(r[3] || ''), first: empty[0], days: empty.length, mgr: String(ck.manager || '').trim(),
        none: empty.some(function(d){ const o = ov[d]; const crew = (o != null && String(o).trim() !== '') ? String(o).split(',').filter(function(x){ return x.trim(); }) : whole; return !crew.length; })});
    });
    if (list.length) result[br] = list.sort(function(a, b){ return a.first.localeCompare(b.first); });
  });
  // manager / supervisor emails from the app (Setup)
  const mgrEmail = {};
  const ab = ss.getSheetByName('Absences');
  if (ab) ab.getDataRange().getValues().slice(1).forEach(function(r) {
    if (String(r[2]) !== '__mgrEmails') return;
    try { (JSON.parse(r[3] || '[]') || []).forEach(function(m){ if (m && m.name && m.email) mgrEmail[String(m.name).trim().toLowerCase()] = String(m.email).trim(); }); } catch (e) {}
  });
  const byMgr = {};
  Object.keys(result).forEach(function(br){ result[br].forEach(function(x){
    const e = mgrEmail[x.mgr.toLowerCase()]; if (!e) return;
    const o = byMgr[e] || (byMgr[e] = {name: x.mgr, items: {}}); (o.items[br] = o.items[br] || []).push(x); }); });
  if (dryRun) return {jobs: result, managers: Object.keys(byMgr).map(function(e){ return e + ' (' + byMgr[e].name + '): ' + Object.keys(byMgr[e].items).map(function(b){ return byMgr[e].items[b].map(function(x){ return x.job; }).join(', '); }).join(', '); })};
  if (!Object.keys(result).length) return result;
  const nice = function(d){ return Utilities.formatDate(new Date(d + 'T12:00:00'), tz, 'EEE d MMM'); };
  const block = function(br, src){ src = src || result; return '<h3 style="font-family:Arial;color:#E8192C;margin:18px 0 6px">' + br + '</h3><table style="font-family:Arial;font-size:13px;border-collapse:collapse">' +
    src[br].map(function(x){ return '<tr><td style="padding:3px 12px 3px 0"><b>' + x.site + '</b> ' + x.job + '</td><td style="padding:3px 12px 3px 0">' + (x.none ? '<span style="color:#C000C0">no crew</span>' : 'short of crew') + '</td><td style="padding:3px 12px 3px 0">from ' + nice(x.first) + ' · ' + x.days + ' day' + (x.days !== 1 ? 's' : '') + '</td><td style="color:#777">' + (x.mgr || '') + '</td></tr>'; }).join('') + '</table>'; };
  const send = function(to, brs) {
    if (!to || !brs.length) return;
    const n = brs.reduce(function(a, b){ return a + result[b].length; }, 0);
    m365Send_({to: to, subject: 'Schedule: ' + n + ' job' + (n !== 1 ? 's' : '') + ' need crew in the next ' + ALERT_DAYS + ' working days',
      htmlBody: '<p style="font-family:Arial">These jobs have days with no crew (or fewer than needed) named in the Operations Schedule. Please allocate crew in Resources.</p>' + brs.map(block).join('') +
        '<p style="font-family:Arial;font-size:12px;color:#777;margin-top:18px">Sent daily at 6am on weekdays by the TechClean Operations Schedule.</p>'});
  };
  const all = Object.keys(result);
  // each manager / supervisor: their own jobs
  Object.keys(byMgr).forEach(function(e) {
    const o = byMgr[e], brs = Object.keys(o.items), n = brs.reduce(function(a, b){ return a + o.items[b].length; }, 0);
    m365Send_({to: e, subject: 'Schedule: ' + (n === 1 ? '1 of your jobs needs' : n + ' of your jobs need') + ' crew in the next ' + ALERT_DAYS + ' working days',
      htmlBody: '<p style="font-family:Arial">Hi ' + o.name.split(' ')[0] + ', these jobs you look after have days with no crew (or fewer than needed) in the Operations Schedule. Please allocate crew in Resources.</p>' +
        brs.map(function(b){ return block(b, o.items); }).join('') +
        '<p style="font-family:Arial;font-size:12px;color:#777;margin-top:18px">Sent daily at 6am on weekdays by the TechClean Operations Schedule.</p>'});
  });
  // overview recipients: everything
  send(props.getProperty('ALERT_EMAILS'), all);
  all.forEach(function(br){ send(props.getProperty('ALERT_EMAILS_' + br.toUpperCase()), [br]); });
  return result;
}


// ─────────────────────────────────────────────────────────────────────────────
// H&S APP LINK
//   Schedule → H&S:  GET ?action=hsFeed&key=HS_KEY&from=yyyy-MM-dd&to=yyyy-MM-dd
//                    (crew by day, status, managers — published by the schedule app on every sync)
//   H&S → schedule:  hsStatusRefresh (every 15 min) calls the H&S back end's jobHsStatus for
//                    today's jobs and caches it; the app shows it in job hover cards (testing).
// Setup (Project Settings → Script Properties):
//   HS_KEY = a long random secret, the same value in the H&S back end's Script Properties
//   HS_URL = the H&S back end web app URL (…/exec)  — needed for hsStatusRefresh only
//   then run installHsStatusTrigger once.
// ─────────────────────────────────────────────────────────────────────────────
const HS_FEED_HEADERS = ['ID', 'JobKey', 'Branch', 'Start', 'Finish', 'UpdatedAt', 'JSON', 'StoredAt'];

function hsStoreFeed_(ss, feed) {
  if (!feed || !Array.isArray(feed.jobs)) return;
  const sh = ss.getSheetByName('HS_Feed') || ss.insertSheet('HS_Feed');
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, HS_FEED_HEADERS.length).getValues() : [];
  const byId = {}; rows.forEach(function(r, i) { if (r[0]) byId[String(r[0])] = i; });
  const now = new Date().toISOString();
  feed.jobs.forEach(function(j) {
    if (!j || !j.id) return;
    const row = [j.id, j.jobKey || j.id, j.branch || '', j.start || '', j.finish || '', j.updatedAt || '', JSON.stringify(j), now];
    const i = byId[j.id];
    if (i == null) { byId[j.id] = rows.length; rows.push(row); return; }
    // keep the newer job version; same version → take the latest crew (leave / allocation changes don't touch the job timestamp)
    if (String(j.updatedAt || '') >= String(rows[i][5] || '')) rows[i] = row;
  });
  // staff list in one row
  if (Array.isArray(feed.staff)) {
    const st = ['__staff', '', '', '', '', now, JSON.stringify(feed.staff), now];
    if (byId['__staff'] != null) rows[byId['__staff']] = st; else rows.push(st);
  }
  // drop jobs not touched for 120 days
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString();
  const keep = rows.filter(function(r) { return r[0] === '__staff' || String(r[7] || '') >= cutoff; });
  sh.clearContents();
  sh.getRange(1, 1, 1, HS_FEED_HEADERS.length).setValues([HS_FEED_HEADERS]).setFontWeight('bold');
  if (keep.length) {
    sh.getRange(2, 1, keep.length, HS_FEED_HEADERS.length).setNumberFormat('@');
    sh.getRange(2, 1, keep.length, HS_FEED_HEADERS.length).setValues(keep);
  }
}

function handleHsFeed(p) {
  const key = PropertiesService.getScriptProperties().getProperty('HS_KEY');
  if (!key) return json({ok: false, error: 'HS_KEY not set in the schedule script'});
  if (String(p.key || '') !== key) return json({ok: false, error: 'Not authorised'});
  const tz = 'Pacific/Auckland', now = new Date();
  const from = p.from || Utilities.formatDate(new Date(now.getTime() - 14 * 86400000), tz, 'yyyy-MM-dd');
  const to = p.to || Utilities.formatDate(new Date(now.getTime() + 60 * 86400000), tz, 'yyyy-MM-dd');
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('HS_Feed');
  const jobs = []; let staff = []; let generated = '';
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HS_FEED_HEADERS.length).getValues().forEach(function(r) {
    if (r[0] === '__staff') { try { staff = JSON.parse(r[6]); } catch (e) {} return; }
    let j; try { j = JSON.parse(r[6]); } catch (e) { return; }
    if (String(r[7] || '') > generated) generated = String(r[7]);
    const open = j.status === 'scheduled' || j.status === 'in_progress' || j.status === 'on_hold';
    const overlaps = !j.start || !j.finish || (j.start <= to && j.finish >= from);
    // closed / deleted jobs stay in the feed for 45 days after their status changed, so the H&S app can close them out
    const recentClose = !open && String(j.statusChangedAt || j.updatedAt || r[7] || '').slice(0, 10) >= Utilities.formatDate(new Date(now.getTime() - 45 * 86400000), tz, 'yyyy-MM-dd');
    if (!(overlaps || recentClose)) return;
    j.days = (j.days || []).filter(function(d) { return d.date >= from && d.date <= to; });
    jobs.push(j);
  });
  return json({ok: true, generated: generated, from: from, to: to, jobs: jobs, staff: staff});
}

function installHsStatusTrigger() {
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'hsStatusRefresh'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('hsStatusRefresh').timeBased().everyMinutes(15).create();
}

function hsStatusRefresh() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('HS_URL'), key = props.getProperty('HS_KEY');
  if (!url || !key) return {skipped: 'HS_URL / HS_KEY not set'};
  const tz = 'Pacific/Auckland', today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const ss = SpreadsheetApp.openById(SHEET_ID), fsh = ss.getSheetByName('HS_Feed');
  if (!fsh || fsh.getLastRow() < 2) return {skipped: 'no feed yet'};
  // jobs with crew today
  const keys = [];
  fsh.getRange(2, 1, fsh.getLastRow() - 1, HS_FEED_HEADERS.length).getValues().forEach(function(r) {
    if (r[0] === '__staff') return;
    let j; try { j = JSON.parse(r[6]); } catch (e) { return; }
    if (j.status !== 'in_progress' && j.status !== 'scheduled') return;
    if ((j.days || []).some(function(d) { return d.date === today && d.crew && d.crew.length; })) keys.push(j.jobKey);
  });
  const reqs = keys.map(function(k) { return {url: url + (url.indexOf('?') < 0 ? '?' : '&') + 'action=jobHsStatus&key=' + encodeURIComponent(key) + '&jobKey=' + encodeURIComponent(k) + '&date=' + today, muteHttpExceptions: true}; });
  const out = [];
  for (let i = 0; i < reqs.length; i += 20) {
    UrlFetchApp.fetchAll(reqs.slice(i, i + 20)).forEach(function(res, n) {
      try { const d = JSON.parse(res.getContentText()); if (d && d.ok !== false) out.push([keys[i + n], today, JSON.stringify(d), new Date()]); } catch (e) {}
    });
  }
  const sh = ss.getSheetByName('HS_Status') || ss.insertSheet('HS_Status');
  sh.clearContents();
  sh.getRange(1, 1, 1, 4).setValues([['JobKey', 'Date', 'JSON', 'Fetched']]).setFontWeight('bold');
  if (out.length) { sh.getRange(2, 1, out.length, 2).setNumberFormat('@'); sh.getRange(2, 1, out.length, 4).setValues(out); }
  return {jobs: keys.length, cached: out.length};
}


// ─────────────────────────────────────────────────────────────────────────────
// MICROSOFT 365 EMAIL — all schedule email goes out through TechClean's Microsoft 365
// (Microsoft Graph, app-only). IT registers one app in Microsoft Entra ID with the
// Mail.Send application permission, limited to the sending mailbox only.
// Script Properties:
//   M365_TENANT_ID   — Directory (tenant) ID
//   M365_CLIENT_ID   — Application (client) ID
//   M365_SECRET      — client secret value
//   M365_FROM        — sending mailbox, e.g. schedule@techclean.co.nz
// Run m365Test once to send a test email to M365_FROM.
// ─────────────────────────────────────────────────────────────────────────────
function m365Token_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('m365_token');
  if (hit) return hit;
  const p = PropertiesService.getScriptProperties();
  const tenant = p.getProperty('M365_TENANT_ID'), id = p.getProperty('M365_CLIENT_ID'), secret = p.getProperty('M365_SECRET');
  if (!tenant || !id || !secret) throw new Error('Microsoft 365 not set up — add M365_TENANT_ID, M365_CLIENT_ID, M365_SECRET, M365_FROM in Script Properties');
  const res = UrlFetchApp.fetch('https://login.microsoftonline.com/' + encodeURIComponent(tenant) + '/oauth2/v2.0/token', {
    method: 'post', muteHttpExceptions: true,
    payload: {grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'https://graph.microsoft.com/.default'}
  });
  const d = JSON.parse(res.getContentText() || '{}');
  if (!d.access_token) throw new Error('Microsoft 365 sign-in failed: ' + (d.error_description || d.error || res.getResponseCode()));
  cache.put('m365_token', d.access_token, Math.max(60, Math.min(3000, (Number(d.expires_in) || 3600) - 300)));
  return d.access_token;
}

/** Send one email through Microsoft 365. o = {to: 'a@x, b@y', subject, htmlBody}. Returns true if accepted. */
function m365Send_(o) {
  const from = PropertiesService.getScriptProperties().getProperty('M365_FROM');
  if (!from) { console.error('M365_FROM not set — email not sent: ' + o.subject); return false; }
  const to = String(o.to || '').split(/[,;]/).map(function(x) { return x.trim(); }).filter(String);
  if (!to.length) return false;
  const body = {message: {subject: o.subject, body: {contentType: 'HTML', content: o.htmlBody || ''},
    toRecipients: to.map(function(a) { return {emailAddress: {address: a}}; })}, saveToSentItems: true};
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = UrlFetchApp.fetch('https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(from) + '/sendMail', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: {Authorization: 'Bearer ' + m365Token_()}, payload: JSON.stringify(body)
    });
    const c = res.getResponseCode();
    if (c === 202) return true;
    if (c === 401 && attempt === 0) { CacheService.getScriptCache().remove('m365_token'); continue; }   // token expired — retry once
    if (c === 429 || c >= 500) { Utilities.sleep(2000); continue; }                                    // busy — retry once
    break;
  }
  console.error('Microsoft 365 send failed (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
  return false;
}

function m365Test() {
  const from = PropertiesService.getScriptProperties().getProperty('M365_FROM');
  const ok = m365Send_({to: from, subject: 'TechClean schedule — Microsoft 365 test', htmlBody: '<p style="font-family:Arial">If you can read this, the schedule can send email through Microsoft 365. ✓</p>'});
  Logger.log(ok ? 'Sent ✓ — check the ' + from + ' inbox and Sent Items' : 'Not sent — see the error above');
}

/** Absence date key → 'yyyy-MM-dd' (Sheets may have stored it as a date, or as 'Mon Dec 01 2026 00:00:00 GMT…').
 *  Special keys such as '__secondments' / '__mgrEmails' pass through unchanged. */
function absDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Pacific/Auckland', 'yyyy-MM-dd');
  const s = String(v || '').trim();
  if (!s || s.indexOf('__') === 0 || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s.replace(/\s*\(.*\)\s*$/, ''));
  return isNaN(d) ? s : Utilities.formatDate(d, 'Pacific/Auckland', 'yyyy-MM-dd');
}
