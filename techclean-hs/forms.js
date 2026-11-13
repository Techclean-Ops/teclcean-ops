/* TechClean H&S app — form definitions.
   Questions follow ARCP TC-ARCP-SSSP-001 Part D. Keep each question under 10 words.
   Question types:
     yn      Yes / No / N/A buttons.  bad: answers that need a note or photo (supervisor alerted).
                                       stop: answers that end the form (cannot sign on).
     ok      OK / Fault / N/A (equipment).  Fault needs a photo and a note.
     photo: true on a question = a bad answer needs a live photo AND a note.  type 'photo' is required unless optional: true.
     choice  Pick one big picture button.  opts: [[value, icon, label], ...]
     text    Speak or type.
*/
/* Common site hazards for the pre-start (from the ARCP hazard register). Edit as needed. */
var HAZARDS = [['fibres', '🫁', 'Asbestos fibres'], ['height', '🪜', 'Working at height'], ['elec', '⚡', 'Electrical'], ['heat', '🥵', 'Heat stress'],
  ['manual', '🏋️', 'Manual handling'], ['slips', '🧯', 'Slips, trips, falls'], ['noise', '🔊', 'Noise'], ['space', '🚪', 'Restricted space'],
  ['plant', '🚜', 'Plant and vehicles'], ['chem', '🧪', 'Chemicals (PVA, surfactant)'], ['public', '👪', 'Public / occupants'], ['weather', '🌧️', 'Weather']];

var FORMS = {

  FFW: {
    code: 'D5', ref: 'Form D5 — RPE and fit for work (individual)',
    title: 'Fit for work', short: 'Fit for work', icon: '🧑‍🔧',
    who: 'Every worker, every day, before signing on',
    questions: [
      { id: 'shaven', q: 'Clean-shaven for your mask today?', type: 'yn', noNA: true, stop: ['no'],
        stopMsg: 'Not clean-shaven means no entry. Shave, then do this again.',
        help: 'Zero tolerance. Clean-shaven as per your face fit, every day.' },
      { id: 'face', q: 'Take a photo of your face now', pdf: 'Clean-shaven photo (taken live on site)', type: 'selfie',
        help: 'Mask off, face the camera. Live camera only — no uploads.' },
      { id: 'rpe', q: 'Which mask are you wearing today?', type: 'choice',
        opts: [['half', '😷', 'Half-face P3'], ['full', '🥽', 'Full-face P3'], ['papr', '🔋', 'Powered (PAPR)']] },
      { id: 'seal', q: 'Seal check done and passed?', type: 'yn', noNA: true, stop: ['no'],
        stopMsg: 'No seal means no entry. Talk to your supervisor.',
        help: 'Your own positive and negative pressure check.' },
      { id: 'filters', q: 'Filters and battery in date?', type: 'yn', stop: ['no'],
        stopMsg: 'Get new filters or a charged battery from your supervisor first.' },
      { id: 'well', q: 'Fit and well — not sick or overtired?', type: 'yn', noNA: true, stop: ['no'],
        stopMsg: 'Talk to your supervisor before you start work.' },
      { id: 'meds', q: 'Taking anything that could affect your work?', type: 'yn', noNA: true, bad: ['yes'],
        badMsg: 'Add a note — your supervisor is told.' }
    ]
  },

  D13: { code: 'D13', ref: 'Form D13 — Site sign in / out register', title: 'Sign on to site', short: 'Sign on', icon: '✅' },

  D1: {
    code: 'D1', ref: 'Form D1 — Worker ARCP and SSSP acknowledgement', title: 'Sign ARCP / SWMS', short: 'ARCP / SWMS', icon: '✍️',
    statement: 'I have read and understood this Asbestos Removal Control Plan and Site Specific Safety Plan. ' +
      'I have had the opportunity to ask questions. I will work to the method as written and I will stop work ' +
      'and report immediately if I believe the controls have failed.'
  },

  D5: {
    code: 'D5', ref: 'Form D5 — Daily pre-start and toolbox record', title: 'Pre-start', short: 'Pre-start', icon: '📋',
    who: 'Site Supervisor, every day before work starts',
    questions: [
      { id: 'weather', q: 'Weather and conditions today?', type: 'choice', section: 'Conditions',
        opts: [['fine', '☀️', 'Fine'], ['wet', '🌧️', 'Wet'], ['wind', '💨', 'Windy'], ['hot', '🥵', 'Hot']] },
      { id: 'tasks', q: 'Today’s work — who is doing what?', pdf: 'Work planned for today and who is doing what', type: 'text', section: 'Briefing — what the crew were told',
        help: 'Say it out loud as you brief the crew — the mic types it.' },
      { id: 'hazsel', q: 'Hazards discussed today', pdf: 'Hazards discussed today', type: 'multi', section: 'Briefing — what the crew were told',
        help: 'Tap every hazard you talked through — include anything new or changed since yesterday.', opts: HAZARDS },
      { id: 'controls', q: 'Controls agreed for those hazards', pdf: 'Controls agreed', type: 'text', section: 'Briefing — what the crew were told' },
      { id: 'topic', q: 'Toolbox topic today', pdf: 'Toolbox topic', type: 'field', section: 'Briefing — what the crew were told' },
      { id: 'assembly', q: 'Emergency assembly point', pdf: 'Emergency assembly point', type: 'field', section: 'Emergency', help: 'Filled in from the last pre-start — check it.' },
      { id: 'firstaid', q: 'First aider on site today', pdf: 'First aider on site today', type: 'crewpick', section: 'Emergency' },
      { id: 'hospital', q: 'Nearest hospital / A&E', pdf: 'Nearest hospital / A&E', type: 'field', section: 'Emergency', help: 'Filled in from the last pre-start — check it.' },
      { id: 'exit', q: 'Emergency exit from the enclosure shown?', pdf: 'Emergency exit route from the enclosure shown to the crew', type: 'yn', bad: ['no'], section: 'Emergency' },
      { id: 'trades', q: 'Other trades, permits or exclusion zones today?', pdf: 'Other trades on site, permits or exclusion zones today', type: 'yn', noNA: true, bad: ['yes'],
        badMsg: 'Note who and what — e.g. electrician in the plant room, hot work permit.', section: 'Site today' },
      { id: 'stopwork', q: 'Stop-work authority reminded?', pdf: 'Crew reminded they can stop work if controls fail', type: 'yn', noNA: true, bad: ['no'], section: 'Site today' },
      { id: 'understood', q: 'Everyone understood — no language help needed?', pdf: 'Everyone understood the briefing (language help given if needed)', type: 'yn', noNA: true, bad: ['no'],
        badMsg: 'Note who needed help and how it was given.', section: 'Site today' },
      { id: 'swms', q: 'SWMS reviewed with everyone present?', type: 'yn', bad: ['no'], section: 'Covered at pre-start' },
      { id: 'air', q: 'Yesterday’s air monitoring shared with crew?', type: 'yn', bad: ['no'], section: 'Covered at pre-start' },
      { id: 'arcpchg', q: 'Any change to the ARCP since yesterday?', type: 'yn', noNA: true, bad: ['yes'], badMsg: 'Note the change — crew must re-sign the ARCP.', section: 'Covered at pre-start' },
      { id: 'concerns', q: 'Any concerns raised by the crew?', type: 'yn', noNA: true, bad: ['yes'], badMsg: 'Note the concern and what was agreed.', section: 'Covered at pre-start' },
      { id: 'enclok', q: 'Enclosure intact, NPUs running, pressure in range, smoke test current?', pdf: 'Enclosure intact, NPUs running, negative pressure in range, smoke test current', type: 'ok', section: 'Equipment check' },
      { id: 'vac', q: 'H-class vacuums working, filters in date?', type: 'ok', section: 'Equipment check' },
      { id: 'dcu', q: 'Decon unit clean, water and filters working?', type: 'ok', section: 'Equipment check' },
      { id: 'wet', q: 'Wetting and spray gear working?', type: 'ok', section: 'Equipment check' },
      { id: 'tags', q: 'Leads, RCD and tools tested and tagged?', type: 'ok', section: 'Equipment check' },
      { id: 'plant', q: 'All other plant present, undamaged, in date?', type: 'ok', section: 'Equipment check' },
      { id: 'notes', q: 'Discussion notes and actions', type: 'text', optional: true, section: 'Discussion notes and actions' }
    ]
  },

  D12: {
    code: 'D12', ref: 'Form D12 — Incident, near miss and exposure report', title: 'Report something', short: 'Report', icon: '⚠️',
    types: [['injury', 'Injury'], ['illness', 'Illness'], ['nearmiss', 'Near miss'], ['hazard', 'Hazard'],
            ['damage', 'Damage'], ['breach', 'Enclosure breach'], ['exposure', 'Suspected exposure']]
  },

  D14: { code: 'D14', ref: 'Form D14 — Visitor entry record (with D13 sign in)', title: 'Visitor sign in', short: 'Visitor', icon: '🪪' }
};

/* ---------- Remaining ARCP Part D forms (Phase 1b) ----------
   q   = short wording on the phone.   pdf = full ARCP wording printed on the PDF.
   Extra types:  number (unit, badIf),  date,  field (short text),  photo,  sign (who: 'subject' = person being inducted)
   showIf(a): only ask when it returns true.   perCrew: asked once for each crew member on the job.        */

function yn(id, q, pdf, section, extra) { var o = { id: id, q: q, pdf: pdf, type: 'yn', bad: ['no'], section: section }; for (var k in (extra || {})) o[k] = extra[k]; return o; }

FORMS.D2 = {
  code: 'D2', ref: 'Form D2 — Job start checklist', title: 'Job start checklist', short: 'Job start', icon: '🚚', who: 'supervisor', once: true,
  questions: [
    yn('y1', 'ARCP and method read and understood?', 'ARCP and method — read and understood', 'Before leaving the yard'),
    yn('y2', 'SSSP read and understood?', 'SSSP — read and understood', 'Before leaving the yard'),
    yn('y3', 'WorkSafe notification matches crew going?', 'WorkSafe notification — dates, supervisor and workers checked against the crew going to site', 'Before leaving the yard'),
    yn('y6', 'Assessor told the start time?', 'Independent assessor informed of the start time', 'Before leaving the yard'),
    yn('y7', 'Survey and asbestos register in site folder?', 'Survey and asbestos register in the site folder', 'Before leaving the yard'),
    yn('y8', 'Forms, incident reports and SDS packed?', 'Forms — toolbox, incident reports, safety data sheets', 'Before leaving the yard'),
    yn('y9', 'Supervisor folder complete?', 'Supervisor folder complete', 'Before leaving the yard'),
    yn('y10', 'Electrical gear tested and tagged?', 'All electrical equipment current on test and tag', 'Before leaving the yard'),
    yn('y11', 'H-class vacuums serviced and in date?', 'H-class vacuums serviced and in date — details and expiry recorded', 'Before leaving the yard'),
    { id: 'y11d', q: 'Vacuum details and expiry', pdf: 'H-class vacuum details and expiry', type: 'field', section: 'Before leaving the yard', optional: true },
    yn('y12', 'NPUs, manometer and smoke generator loaded?', 'NPUs, manometer and smoke generator loaded and serviceable', 'Before leaving the yard'),
    yn('y13', 'Decon unit and water system loaded?', 'Decontamination unit and water management system loaded', 'Before leaving the yard'),
    yn('y14', 'Poly, bags, tape, signs, PPE, RPE, filters loaded?', 'Consumables — polythene, bags, tape, signage, PPE, RPE, filters', 'Before leaving the yard'),
    yn('y15', 'Everyone understands the full scope?', 'Full scope of works understood by everyone going to site', 'Before leaving the yard'),
    yn('a6', 'Neighbours and occupiers notified?', 'Confirm neighbours and occupiers have been notified', 'On arrival — before starting'),
    yn('a8', 'Sign in / out notice at the entrance?', 'Place laminated sign in / out notice at the entrance', 'On arrival — before starting'),
    yn('a10', 'Waste bin delivery and removal arranged?', 'Confirm waste bin delivery and removal arranged', 'On arrival — before starting'),
    { id: 'sig', q: 'Supervisor sign off', type: 'sign', section: 'Sign off' }
  ]
};

FORMS.D3 = {
  code: 'D3', ref: 'Form D3 — Site personnel register', title: 'Site personnel register', short: 'Personnel', icon: '👥', who: 'supervisor',
  help: 'At job start, and again on any crew change. Licence, face fit and health monitoring come from each person\u2019s certificates — check and sign.',
  questions: [
    { id: 'sig', q: 'Supervisor sign off', type: 'sign', section: 'Sign off' }
  ]
};

FORMS.D4 = {
  code: 'D4', ref: 'Form D4 — Site induction record', title: 'Site induction', short: 'Induction', icon: '🎓', who: 'supervisor',
  help: 'One per person, before they start work on site.',
  questions: [
    { id: 'who', q: 'Who are you inducting?', type: 'crewpick', section: 'Person inducted' },
    { id: 'wname', q: 'Their name', type: 'field', section: 'Person inducted', showIf: function (a) { return a.who && a.who.v === 'other'; } },
    { id: 'wco', q: 'Their company', type: 'field', section: 'Person inducted', showIf: function (a) { return a.who && a.who.v === 'other'; } },
    yn('t1', 'Scope of works covered?', 'Scope of works', 'Topics covered', { help: 'What is being removed, where, and the sequence of stages.' }),
    yn('t2', 'Emergency procedures covered?', 'Emergency procedures', 'Topics covered', { help: 'Warning signal — continuous blast. Assembly point. Wait to be accounted for. Life safety before decontamination. Emergency exit route from the enclosure.' }),
    yn('t3', 'Incident reporting covered?', 'Incident reporting', 'Topics covered', { help: 'All injuries and near misses reported to the Supervisor and the head contractor immediately.' }),
    yn('t4', 'Site hazards covered?', 'Site hazards', 'Topics covered', { help: 'Discuss the hazard register. Read the hazard board daily. Report any new hazard immediately.' }),
    yn('t5', 'Boundaries covered?', 'Boundaries', 'Topics covered', { help: 'Primary and secondary boundaries, exclusion zones, no-go areas, waste route.' }),
    yn('t6', 'Training and competency checked?', 'Training and competency', 'Topics covered', { help: 'Confirm licences, unit standards and face fit are current for everyone present.' }),
    yn('t7', 'Site amenities shown?', 'Site amenities', 'Topics covered', { help: 'Toilet, first aid kit, fresh water, break area — locations.' }),
    yn('t8', 'PPE and RPE covered?', 'PPE and RPE', 'Topics covered', { help: 'Always: hi-vis and safety footwear. As required: hard hat, hearing protection, eyewear, RPE. Clean-shaven requirement explained.' }),
    yn('t9', 'Decontamination covered?', 'Decontamination', 'Topics covered', { help: 'Procedure for leaving the enclosure. No respirator removal inside. No walking through clean areas in a used coverall.' }),
    yn('t10', 'Housekeeping covered?', 'Housekeeping', 'Topics covered', { help: 'Keep the site tidy. Dispose of materials correctly. Nothing goes down a drain.' }),
    yn('t11', 'Power tools and electrical covered?', 'Power tools and electrical', 'Topics covered', { help: 'Current inspection tags, RCD, tools in good condition.' }),
    yn('t12', 'Asbestos procedures covered?', 'Asbestos procedures', 'Topics covered', { help: 'Pre-start process. The removal method for this job. Authority to stop work.' }),
    yn('t13', 'Hazards they bring discussed?', 'Hazards you are introducing', 'Topics covered', { help: 'Ask every contractor what hazards they bring and how they will control them.' }),
    { id: 'sig', q: 'Person inducted — sign here', type: 'sign', who: 'subject', section: 'Signatures' }
  ]
};

var D6S = function (st) { return function (a) { return a.stage && a.stage.v === st; }; };
FORMS.D6 = {
  code: 'D6', ref: 'Form D6 — Asbestos removal quality control', title: 'Removal quality control', short: 'Quality control', icon: '🔎', who: 'supervisor',
  questions: [
    { id: 'stage', q: 'Which stage are you checking?', type: 'choice', section: 'Stage', opts: [['setup', '🏗️', 'Set-up'], ['during', '🧰', 'During removal'], ['clear', '🧹', 'Completion and clearance']] },
    { id: 'loc', q: 'Location / area', type: 'field', section: 'Stage', optional: true },
    yn('s1', 'Site plan matches set-up, changes marked?', 'Site plan matches the site as set up; any change marked up and dated', '1. Set-up', { showIf: D6S('setup') }),
    yn('s2', 'Boundaries, signs and barriers in place?', 'Primary and secondary boundaries established with signage and barriers', '1. Set-up', { photo: true, showIf: D6S('setup') }),
    yn('s3', 'Isolations confirmed in writing?', 'All isolations confirmed in writing — fire, HVAC, electrical, sensors', '1. Set-up', { showIf: D6S('setup') }),
    yn('s4', 'Enclosure built to B10, penetrations sealed?', 'Enclosure constructed to Section B10 and all penetrations sealed', '1. Set-up', { photo: true, showIf: D6S('setup') }),
    yn('s6', 'Negative pressure −5 Pa and 8 ACH logged?', 'Negative pressure achieved and logged — minimum −5 Pa and 8 air changes per hour', '1. Set-up', { showIf: D6S('setup') }),
    yn('s7', 'Decon unit set up and working?', 'Decontamination unit set up, connected and operational', '1. Set-up', { photo: true, showIf: D6S('setup') }),
    yn('s8', 'Waste / bag lock set up and working?', 'Waste / bag lock set up and operational', '1. Set-up', { photo: true, showIf: D6S('setup') }),
    yn('s9', 'Baseline air monitoring done, result received?', 'Baseline air monitoring completed by the assessor and result received', '1. Set-up', { showIf: D6S('setup') }),
    yn('r1', 'Material kept wet — no dry removal?', 'Material kept wet throughout; no dry removal at any point', '2. During removal', { photo: true, showIf: D6S('during') }),
    yn('r2', 'Only hand tools and permitted gear?', 'Only hand tools and permitted equipment in use', '2. During removal', { photo: true, showIf: D6S('during') }),
    yn('r3', 'Waste bagged as made, max two thirds, sealed?', 'Waste bagged as generated, filled no more than two thirds, sealed correctly', '2. During removal', { photo: true, showIf: D6S('during') }),
    yn('r4', 'PPE and RPE worn correctly by all?', 'Correct PPE and RPE worn correctly by everyone in the area', '2. During removal', { photo: true, showIf: D6S('during') }),
    yn('r5', 'Two inside, one outside at the unit?', 'Minimum two workers inside the enclosure; outside person at the unit', '2. During removal', { photo: true, showIf: D6S('during') }),
    yn('r6', 'Enclosure and pressure checked each shift and break?', 'Enclosure and negative pressure checked at start of shift, after breaks and at end of shift', '2. During removal', { showIf: D6S('during') }),
    yn('r7', 'Control air monitoring within limits?', 'Control air monitoring results within limits', '2. During removal', { showIf: D6S('during') }),
    yn('r8', 'Housekeeping kept up, no debris build-up?', 'Housekeeping maintained; no accumulation of debris', '2. During removal', { photo: true, showIf: D6S('during') }),
    yn('c1', 'All ACM removed to agreed scope?', 'All ACM removed to the agreed scope', '3. Completion and clearance', { showIf: D6S('clear') }),
    yn('c2', 'First clean — H-class vacuum all surfaces?', 'First clean completed — H-class vacuum of all surfaces', '3. Completion and clearance', { photo: true, showIf: D6S('clear') }),
    yn('c3', 'Second clean — wet wipe all surfaces?', 'Second clean completed — wet wipe of all surfaces', '3. Completion and clearance', { photo: true, showIf: D6S('clear') }),
    yn('c4', 'Settle period with NPUs running?', 'Settle period observed with NPUs running', '3. Completion and clearance', { photo: true, showIf: D6S('clear') }),
    yn('c5', 'Supervisor visual inspection passed?', 'Supervisor visual inspection completed and passed', '3. Completion and clearance', { photo: true, showIf: D6S('clear') }),
    yn('c6', 'Assessor visual passed (Stage 2)?', 'Assessor visual inspection passed (Stage 2)', '3. Completion and clearance', { showIf: D6S('clear') }),
    yn('c7', 'Clearance air monitoring passed (Stage 3)?', 'Clearance air monitoring passed (Stage 3)', '3. Completion and clearance', { showIf: D6S('clear') }),
    yn('c8', 'Enclosure down, final visual done (Stage 4)?', 'Enclosure dismantled and final visual completed (Stage 4)', '3. Completion and clearance', { photo: true, showIf: D6S('clear') }),
    yn('c9', 'Clearance certificate received?', 'Clearance certificate received', '3. Completion and clearance', { showIf: D6S('clear') }),
    { id: 'c9p', q: 'Photo of the clearance certificate', type: 'photo', section: '3. Completion and clearance', showIf: function (a) { return a.stage && a.stage.v === 'clear' && a.c9 && a.c9.v === 'yes'; } },
    yn('c10', 'All waste gone, disposal dockets obtained?', 'All waste removed from site and disposal dockets obtained', '3. Completion and clearance', { showIf: D6S('clear') }),
    yn('c11', 'Site clean, tidy, secure — photos taken?', 'Site left clean, tidy and secure; photographs taken', '3. Completion and clearance', { photo: true, showIf: D6S('clear') }),
    { id: 'c11p', q: 'Photos of the finished site', type: 'photo', section: '3. Completion and clearance', showIf: D6S('clear') },
    { id: 'sig', q: 'Supervisor sign off', type: 'sign', section: 'Sign off' }
  ]
};

FORMS.D7 = {
  code: 'D7', ref: 'Form D7 — Enclosure smoke test (timed, with the assessor)', title: 'Smoke test', short: 'Smoke test', icon: '💨', who: 'supervisor', classA: true,
  help: 'Timed smoke test, witnessed by the assessor, before removal starts.',
  questions: [
    { id: 'assessor', q: 'Assessor\u2019s name', pdf: 'Assessor', type: 'field', section: 'Smoke test' },
    { id: 'acomp', q: 'Assessor\u2019s company', pdf: 'Assessor company', type: 'field', section: 'Smoke test', optional: true },
    { id: 'area', q: 'Enclosure / area tested', pdf: 'Enclosure / area', type: 'field', section: 'Smoke test', optional: true },
    { id: 'tstart', q: 'Smoke released at', pdf: 'Smoke released at', type: 'time', section: 'Smoke test' },
    { id: 'tend', q: 'Test finished at', pdf: 'Test finished at', type: 'time', section: 'Smoke test' },
    { id: 'sres', q: 'Smoke test result?', pdf: 'Result', type: 'choice', section: 'Smoke test', opts: [['pass', '✅', 'Pass'], ['fail', '❌', 'Fail']], bad: ['fail'] },
    { id: 'leaks', q: 'Leaks found and how sealed', pdf: 'Leaks found and sealed', type: 'text', section: 'Smoke test', showIf: function (a) { return a.sres && a.sres.v === 'fail'; } },
    { id: 'retest', q: 'Retest result?', pdf: 'Retest result', type: 'choice', section: 'Smoke test', showIf: function (a) { return a.sres && a.sres.v === 'fail'; },
      opts: [['pass', '✅', 'Pass'], ['fail', '❌', 'Fail — do not start']], bad: ['fail'] },
    { id: 'lphoto', q: 'Photo of the leak', type: 'photo', section: 'Smoke test', showIf: function (a) { return a.sres && a.sres.v === 'fail'; } },
    { id: 'sphoto', q: 'Photo of the enclosure under test', type: 'photo', section: 'Smoke test' },
    { id: 'sig', q: 'Supervisor sign off', type: 'sign', section: 'Signatures' },
    { id: 'asig', q: 'Assessor signs here', type: 'sign', who: 'assessor', section: 'Signatures' }
  ]
};

FORMS.D8 = {
  code: 'D8', ref: 'Form D8 — Weekly site inspection', title: 'Weekly site inspection', short: 'Weekly', icon: '🗓️', who: 'supervisor', pmReview: true,
  questions: [
    yn('w1', 'Boundaries, fencing and signs intact?', 'Boundaries, fencing and signage intact and correct', 'Weekly inspection', { photo: true }),
    yn('w2', 'Site folder complete and up to date?', 'Site folder complete and up to date — ARCP, SSSP, notification, survey, monitoring results', 'Weekly inspection'),
    yn('w3', 'Hazard board current?', 'Hazard board current', 'Weekly inspection'),
    yn('w7', 'Decon unit clean, working, used right?', 'Decontamination unit clean, operational and correctly used', 'Weekly inspection', { photo: true }),
    yn('w8', 'PPE and RPE good, stored and used right?', 'PPE and RPE in good condition, correctly stored and correctly used', 'Weekly inspection', { photo: true }),
    yn('w10', 'Waste secure, double contained, labelled?', 'Waste stored securely, double contained, correctly labelled', 'Weekly inspection', { photo: true }),
    yn('w11', 'Housekeeping — enclosure, decon, waste route, amenities?', 'Housekeeping — enclosure, decontamination unit, waste route and amenities', 'Weekly inspection', { photo: true }),
    yn('w14', 'First aid, extinguisher and air horn OK?', 'First aid kit stocked; extinguisher and air horn in place and serviceable', 'Weekly inspection', { photo: true }),
    { id: 'sig', q: 'Supervisor sign off', type: 'sign', section: 'Sign off' }
  ]
};

FORMS.D9 = {
  code: 'D9', ref: 'Form D9 — End of shift decontamination and RPE check', title: 'End of shift', short: 'End of shift', icon: '🚿', who: 'supervisor',
  questions: [
    yn('dcu', 'Decon unit clean and working?', 'DCU clean and operational', 'End of shift', { photo: true }),
    yn('water', 'Water and filtration working?', 'Water / filtration working', 'End of shift', { photo: true }),
    yn('rpe', 'RPE cleaned and stored?', 'RPE cleaned and stored', 'End of shift', { photo: true })
  ]
};

FORMS.D10 = {
  code: 'D10', ref: 'Form D10 — Waste movement and disposal record', title: 'Waste load', short: 'Waste', icon: '🚛', who: 'supervisor',
  help: 'One for every load leaving site.',
  questions: [
    { id: 'wtype', q: 'Waste type?', pdf: 'Waste type', type: 'choice', section: 'Waste load', opts: [['bags', '🛍️', 'Bagged asbestos'], ['sheet', '📦', 'Wrapped sheet'], ['ppe', '🧤', 'PPE and poly'], ['other', '❓', 'Other']] },
    { id: 'bags', q: 'Container / number of bags', pdf: 'Container / no. of bags', type: 'field', section: 'Waste load' },
    { id: 'carrier', q: 'Carrier', pdf: 'Carrier', type: 'field', section: 'Waste load' },
    { id: 'rego', q: 'Vehicle rego', pdf: 'Vehicle rego', type: 'field', section: 'Waste load' },
    { id: 'facility', q: 'Disposal facility', pdf: 'Facility', type: 'field', section: 'Waste load' },
    { id: 'docket', q: 'Docket number', pdf: 'Docket no.', type: 'field', section: 'Waste load', optional: true, help: 'Add it later with a new version if the docket comes back after.' },
    { id: 'lphoto', q: 'Photo of the load', type: 'photo', section: 'Waste load', help: 'Bags or wrapped sheet on the truck, before it leaves.' },
    { id: 'dphoto', q: 'Photo of the docket', type: 'photo', section: 'Waste load', optional: true, help: 'If you have it now. Check it shows this site address. Add it later with a new version if not.' },
    { id: 'sig', q: 'Signed', type: 'sign', section: 'Sign off' }
  ]
};

FORMS.D11 = {
  code: 'D11', ref: 'Form D11 — Inventory sign out sheet', title: 'Inventory — equipment and consumables', short: 'Inventory', icon: '🧰', who: 'supervisor', custom: true,
  help: 'Count equipment and consumables out to site and back to the yard. Used = out − back.'
};

/* Supervisor's "Job forms" menu, in Part D order. D7 is Class A only. */
/* Site audit — TC-QA-AUD-001 Rev 1.6, Asbestos site audit Class A / B (PM, Branch Manager, HSC, GM Ops; opened from the job QR code or link).
   Items as in the Word form. class: 'A' = Class A only, 'B' = Class B only, 'A+B' = both. unit = a reading to record.
   critical: the ▲ items in Rev 1.6 (taken from the form's stop-work triggers; confirmed by Alistair 13 Nov 2026). */
var AUDIT = {
  doc: 'TC-QA-AUD-001', rev: '1.6', title: 'Asbestos site audit — Class A / B', licence: 'RA17100151',
  critical: ["2.2", "2.3", "2.5", "3.1", "3.3", "3.6", "4.5", "4.10", "5.3", "5.4", "6.1", "6.2", "6.9", "6.10", "7.3", "8.1", "8.3", "12.6"],
  triggers: ['No ARCP on site, or work not matching the ARCP method', 'WorkSafe notification missing, late or materially wrong', 'Removal outside the licence class for the material',
    'Untrained or unfit-tested worker in the removal area', 'No supervisor present on Class A work', 'Enclosure breach or negative pressure failure',
    'Dry removal, or abrasive power tools used on ACM', 'Decontamination bypassed or unavailable', 'Uncontrolled fibre release, or contamination outside the exclusion zone',
    'Unauthorised person inside the removal area', 'Unexpected friable material or asbestos-containing dust found', 'Area reoccupied before a clearance certificate is issued'],
  ratings: [['ok', 'Compliant'], ['minor', 'Minor NCs — close within 7 days'], ['major', 'Major NCs — close within 24 hours'], ['stop', 'STOP WORK ISSUED']],
  sections: [
    { n: "2", title: "Documentation and notification", items: [
      { id: "2.1", q: "Current asbestos survey / register for the work area is on site and matches what is being removed", cls: "A+B" },
      { id: "2.2", q: "Asbestos Removal Control Plan (ARCP) on site, job-specific, signed and current", cls: "A+B" },
      { id: "2.3", q: "Work on site matches the method described in the ARCP (no undocumented change of method)", cls: "A+B" },
      { id: "2.4", q: "Site-specific safety plan / task analysis on site and signed by all workers", cls: "A+B" },
      { id: "2.5", q: "WorkSafe notified in writing at least 5 days before work started; notification details match the actual work", cls: "A+B" },
      { id: "2.6", q: "Any change to dates, scope or method notified to WorkSafe and recorded", cls: "A+B" },
      { id: "2.7", q: "Neighbouring occupiers, other PCBUs and the building owner informed before work started", cls: "A+B" },
      { id: "2.8", q: "Independent licensed asbestos assessor engaged and booked for air monitoring and clearance", cls: "A" },
      { id: "2.9", q: "Daily site diary and pre-start records completed and up to date", cls: "A+B" },
      { id: "2.10", q: "Emergency plan on site — site address, nearest medical facility, asbestos-specific response", cls: "A+B" },
      { id: "2.11", q: "Safety data sheets available for encapsulants, sealants and chemicals in use", cls: "A+B" }
    ] },
    { n: "3", title: "Licence, competency and supervision", items: [
      { id: "3.1", q: "Work is within the scope of TechClean's licence class for the material being removed", cls: "A+B" },
      { id: "3.2", q: "Copy of the removal licence displayed or available on site", cls: "A+B" },
      { id: "3.3", q: "Supervisor present in the removal area at all times, from set-up through to completion of the clearance inspection", cls: "A" },
      { id: "3.4", q: "Class B: supervisor present or readily available as required — contactable and able to attend", cls: "B" },
      { id: "3.5", q: "Supervisor holds the prescribed supervision qualification for the class of work", cls: "A+B" },
      { id: "3.6", q: "All workers hold current training / unit standards for the class of removal work being done", cls: "A+B" },
      { id: "3.7", q: "Training and competency records verifiable on site (app, folder or card)", cls: "A+B" },
      { id: "3.8", q: "Health monitoring current for all workers carrying out licensed removal work", cls: "A+B" },
      { id: "3.9", q: "Workers can explain the method, the controls and the emergency procedure when asked", cls: "A+B" },
      { id: "3.10", q: "Subcontractors and labour hire on site are inducted, competent and covered by the ARCP", cls: "A+B" }
    ] },
    { n: "4", title: "Site set-up, signage and exclusion zone", items: [
      { id: "4.1", q: "Removal area clearly defined and separated from other work and the public", cls: "A+B" },
      { id: "4.2", q: "Compliant asbestos warning signage displayed at every approach to the area", cls: "A+B" },
      { id: "4.3", q: "Barriers are solid or substantial where no enclosure is used — not tape alone where access is likely", cls: "A+B" },
      { id: "4.4", q: "Exclusion zone distance appropriate for the method, weather and adjacent activity", cls: "A+B" },
      { id: "4.5", q: "Access controlled — only authorised, trained people entering; visitor log in use", cls: "A+B" },
      { id: "4.6", q: "Services isolated as required (power, HVAC, sprinklers, smoke detectors) with permits and tags in place", cls: "A+B" },
      { id: "4.7", q: "Fixtures, fittings and contents removed or protected before removal started", cls: "A+B" },
      { id: "4.8", q: "Ground or floor protection laid where fibres or debris could fall, with sealed joins", cls: "A+B" },
      { id: "4.9", q: "Non-asbestos hazards controlled — height, edge protection, scaffold tags, electrical, confined space", cls: "A+B" },
      { id: "4.10", q: "Site tidy — no loose ACM debris, offcuts or fragments outside the controlled area", cls: "A+B" },
      { id: "4.11", q: "Vehicle, plant and waste routes defined and kept clear of occupied areas", cls: "A+B" }
    ] },
    { n: "5", title: "Enclosure and negative pressure", items: [
      { id: "5.1", q: "Enclosure constructed as described in the ARCP; surfaces smooth, sound, pre-cleaned or lined", cls: "A" },
      { id: "5.2", q: "Smoke test completed and recorded before removal started; result satisfactory", cls: "A" },
      { id: "5.3", q: "Enclosure integrity visually checked each shift; no tears, sagging or failed seals", cls: "A" },
      { id: "5.4", q: "Negative pressure unit(s) running, correctly sized, and discharging outside the enclosure", cls: "A" },
      { id: "5.5", q: "Pressure differential monitored and recorded; readings within the range set in the ARCP", cls: "A", unit: "Pa" },
      { id: "5.6", q: "NPU HEPA filters tested or certified, in date, with change records held", cls: "A" },
      { id: "5.7", q: "Airlocks and entry / exit stages built and used in the correct sequence", cls: "A" },
      { id: "5.8", q: "Viewing panel or observation of the work area maintained", cls: "A" },
      { id: "5.9", q: "Enclosure decontaminated before dismantling; dismantling method matches the ARCP", cls: "A" },
      { id: "5.10", q: "Class B: containment, drop sheets, sealed penetrations and weather protection adequate for the method", cls: "B" }
    ] },
    { n: "6", title: "Removal method and fibre control", items: [
      { id: "6.1", q: "Wet methods, encapsulation or suppression used and effective; material kept damp throughout", cls: "A+B" },
      { id: "6.2", q: "No abrasive power tools, high-pressure water blasting or compressed air used on ACM", cls: "A+B" },
      { id: "6.3", q: "Material removed whole where practicable — unscrewed, not broken or dropped", cls: "A+B" },
      { id: "6.4", q: "Sheets and components lowered, not dropped, to the ground or into a lined bin", cls: "A+B" },
      { id: "6.5", q: "Glove bag or mini-enclosure technique correct where used", cls: "A" },
      { id: "6.6", q: "H-class / asbestos-rated vacuum in use, in test, and dedicated to asbestos work", cls: "A+B" },
      { id: "6.7", q: "Progressive clean-up as work proceeds — debris not accumulating in the work area", cls: "A+B" },
      { id: "6.8", q: "Substrate and residual material sealed or encapsulated where it remains in place", cls: "A+B" },
      { id: "6.9", q: "Asbestos-containing dust (ACD) identified and handled under the correct licence and method", cls: "A+B" },
      { id: "6.10", q: "Unexpected or additional ACM found work stopped, area secured, ARCP and notification reviewed", cls: "A+B" },
      { id: "6.11", q: "Weather suitable; work stops in high wind or driving rain where fibre release is likely", cls: "A+B" }
    ] },
    { n: "7", title: "Respiratory protection and PPE", items: [
      { id: "7.1", q: "RPE selected matches the method and class of work per the ARCP", cls: "A+B" },
      { id: "7.2", q: "RPE always worn correctly in the removal area — no facial hair compromising seal", cls: "A+B" },
      { id: "7.3", q: "Current fit-test records held for each worker and each mask type in use", cls: "A+B" },
      { id: "7.4", q: "Fit checks done at each donning; workers can demonstrate the check", cls: "A+B" },
      { id: "7.5", q: "PAPR or air-fed units charged, filters in date, maintenance and battery records available", cls: "A" },
      { id: "7.6", q: "Coveralls disposable and correct type, hood over mask straps, no pockets in use", cls: "A+B" },
      { id: "7.7", q: "Footwear, gloves and eye protection appropriate and dedicated to the removal area", cls: "A+B" },
      { id: "7.8", q: "No eating, drinking, vaping or smoking in the removal area", cls: "A+B" },
      { id: "7.9", q: "Spare RPE, filters and coveralls available on site for the crew size", cls: "A+B" },
      { id: "7.10", q: "Work and rest cycles managed for heat, fatigue and RPE wear time", cls: "A+B" }
    ] },
    { n: "8", title: "Decontamination", items: [
      { id: "8.1", q: "Three-stage decontamination unit in place, correctly sequenced and connected to the enclosure", cls: "A" },
      { id: "8.2", q: "Hot water with adequate supply; wastewater filtered before discharge", cls: "A" },
      { id: "8.3", q: "Personal decontamination procedure followed in the correct order and observed in practice", cls: "A+B" },
      { id: "8.4", q: "RPE removed last and decontaminated or disposed of correctly", cls: "A+B" },
      { id: "8.5", q: "Used coveralls bagged as asbestos waste — not reused or taken home", cls: "A+B" },
      { id: "8.6", q: "Tools and plant decontaminated before leaving the area, or sealed and labelled for transfer", cls: "A+B" },
      { id: "8.7", q: "Clean and dirty zones clearly separated; no cross-contamination of the clean end", cls: "A+B" },
      { id: "8.8", q: "Class B: bucket-and-brush or wet-wipe decontamination set up and used before leaving the area", cls: "B" },
      { id: "8.9", q: "Mobile DCU has its own clearance certificate before it leaves site or moves to the next job", cls: "A" },
      { id: "8.10", q: "Vehicles carrying crew and waste are lined, clean and free of debris", cls: "A+B" }
    ] },
    { n: "9", title: "Air monitoring and exposure monitoring", items: [
      { id: "9.1", q: "Air monitoring carried out by an independent licensed asbestos assessor", cls: "A" },
      { id: "9.2", q: "Monitoring positions match the ARCP and cover the likely fibre release points", cls: "A" },
      { id: "9.3", q: "Results available on site and reviewed by the supervisor", cls: "A+B", unit: "f/mL" },
      { id: "9.4", q: "Response to elevated results understood and documented — review, investigate, stop work", cls: "A+B" },
      { id: "9.5", q: "Exposure monitoring considered or carried out where required for the method and material", cls: "A+B" },
      { id: "9.6", q: "Monitoring records retained and linked to the job file and worker records", cls: "A+B" }
    ] },
    { n: "10", title: "Waste containment, transport and disposal", items: [
      { id: "10.1", q: "Waste double-bagged or in sealed lined containers; bags not overfilled", cls: "A+B" },
      { id: "10.2", q: "All waste correctly labelled as asbestos", cls: "A+B" },
      { id: "10.3", q: "Waste decontaminated on the outside before leaving the removal area", cls: "A+B" },
      { id: "10.4", q: "Waste stored securely on site — locked, covered, out of public reach", cls: "A+B" },
      { id: "10.5", q: "Skips and bins lined, covered and signed; no exposed ACM visible", cls: "A+B" },
      { id: "10.6", q: "Transported by an appropriate operator to a facility authorised to accept asbestos waste", cls: "A+B" },
      { id: "10.7", q: "Disposal dockets obtained and filed against the job", cls: "A+B" },
      { id: "10.8", q: "Waste removed from site as soon as practicable; no long-term accumulation", cls: "A+B" },
      { id: "10.9", q: "Contaminated water managed and disposed of correctly; no run-off to stormwater", cls: "A+B" }
    ] },
    { n: "11", title: "Emergency preparedness and incidents", items: [
      { id: "11.1", q: "Crew can describe the response to an enclosure breach, NPU failure or power loss", cls: "A+B" },
      { id: "11.2", q: "Rescue plan in place for a worker injured inside the enclosure", cls: "A" },
      { id: "11.3", q: "First aid kit, eyewash and a trained first aider available", cls: "A+B" },
      { id: "11.4", q: "Fire extinguisher and escape routes clear; enclosure has a defined emergency exit", cls: "A+B" },
      { id: "11.5", q: "Communication available between the enclosure and the outside", cls: "A" },
      { id: "11.6", q: "Any exposure, breach or near miss since the last audit reported and investigated", cls: "A+B" },
      { id: "11.7", q: "Notifiable event obligations understood by the supervisor", cls: "A+B" }
    ] },
    { n: "12", title: "Completion, clearance and reinstatement", items: [
      { id: "12.1", q: "Visual inspection completed by the crew before calling for clearance; area free of visible residue", cls: "A+B" },
      { id: "12.2", q: "Four-stage clearance process followed for Class A work", cls: "A" },
      { id: "12.3", q: "Clearance carried out by an independent licensed asbestos assessor", cls: "A" },
      { id: "12.4", q: "Class B: clearance carried out by a competent independent person", cls: "B" },
      { id: "12.5", q: "Disturbance testing carried out in line with current clearance requirements", cls: "A+B" },
      { id: "12.6", q: "Written clearance certificate issued before the area is reoccupied", cls: "A+B" },
      { id: "12.7", q: "Asbestos register or management plan updated and returned to the client", cls: "A+B" },
      { id: "12.8", q: "Signage, barriers and containment removed only after clearance", cls: "A+B" },
      { id: "12.9", q: "Job pack complete for the file — ARCP, notification, monitoring, dockets, clearance, photos", cls: "A+B" }
    ] }
  ]
};
/* Corrective actions: raised from site audits (section 14) or on site (CAR), followed up and closed out with evidence (CAF), then verified by a manager. */
FORMS.CAR = { code: 'CAR', ref: 'Corrective action raised', title: 'Corrective action', short: 'Action', icon: '🛠️', custom: true };
FORMS.CAF = { code: 'CAF', ref: 'Corrective action follow-up and close-out (TC-QA-AUD-001 section 14)', title: 'Corrective action follow-up', short: 'Follow-up', icon: '✅', custom: true };
FORMS.AUD = { code: 'AUD', ref: 'TC-QA-AUD-001 Rev 1.6 — Asbestos site audit, Class A / B', title: 'Site audit', short: 'Audit', icon: '🔎', who: 'manager', custom: true };

var JOB_FORMS = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11'];

/* ---------- The job sequence (supervisor's phone) ----------
   Steps unlock in order: a step can only be started when every step before it is done.
   group: start = once per job · day = every day · week = weekly inspection · finish = close-out (in order, after start).
   perPerson: done for every crew member on site today (handed round on the supervisor's phone).
   preset: answers filled in for that step (e.g. which D6 stage).  Re-order or edit steps here. */
var SEQUENCE = [
  { key: 'D2', group: 'start', form: 'D2', title: 'Job start checklist' },
  { key: 'D11O', group: 'start', form: 'D11', preset: { dir: 'out' }, title: 'Inventory out — equipment and consumables' },
  { key: 'D4', group: 'start', form: 'D4', perPerson: true, title: 'Induct everyone on site' },
  { key: 'D3', group: 'start', form: 'D3', title: 'Site personnel register' },
  { key: 'D1', group: 'start', form: 'D1', perPerson: true, title: 'Everyone signs the ARCP / SWMS' },
  { key: 'D7', group: 'start', form: 'D7', classA: true, title: 'Smoke test with the assessor' },
  { key: 'D6S', group: 'start', form: 'D6', preset: { stage: 'setup' }, title: 'Quality control — set-up' },
  { key: 'FFW', group: 'day', form: 'FFW', perPerson: true, title: 'Fit for work — everyone' },
  { key: 'IN', group: 'day', form: 'D13', perPerson: true, title: 'Sign everyone in' },
  { key: 'D5', group: 'day', form: 'D5', title: 'Pre-start and toolbox' },
  { key: 'D6R', group: 'day', form: 'D6', preset: { stage: 'during' }, title: 'Quality control — during removal' },
  { key: 'D9', group: 'day', form: 'D9', title: 'End of shift — decon and RPE' },
  { key: 'OUT', group: 'day', form: 'D13', perPerson: true, out: true, title: 'Sign everyone out' },
  { key: 'D8', group: 'week', form: 'D8', title: 'Weekly site inspection' },
  { key: 'D6C', group: 'finish', form: 'D6', preset: { stage: 'clear' }, title: 'Completion and clearance' },
  { key: 'D11B', group: 'finish', form: 'D11', preset: { dir: 'back' }, title: 'Inventory back — equipment and unused consumables' }
];
var GROUPS = { start: 'Start of job — once', day: 'Every day', week: 'Every week', finish: 'Close-out — when removal is finished' };
