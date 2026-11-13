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
      { id: 'plan', q: 'Today’s work and who does what covered?', type: 'yn', bad: ['no'], section: 'Covered at pre-start' },
      { id: 'swms', q: 'SWMS reviewed with everyone present?', type: 'yn', bad: ['no'], section: 'Covered at pre-start' },
      { id: 'encl', q: 'Enclosure and negative pressure checked, logged?', type: 'yn', bad: ['no'], section: 'Covered at pre-start' },
      { id: 'air', q: 'Yesterday’s air monitoring shared with crew?', type: 'yn', bad: ['no'], section: 'Covered at pre-start' },
      { id: 'hazards', q: 'New or changed hazards on site?', type: 'yn', noNA: true, bad: ['yes'], photo: true, badMsg: 'Take a photo of the hazard and add a note.', section: 'Covered at pre-start' },
      { id: 'arcpchg', q: 'Any change to the ARCP since yesterday?', type: 'yn', noNA: true, bad: ['yes'], badMsg: 'Note the change — crew must re-sign the ARCP.', section: 'Covered at pre-start' },
      { id: 'fitness', q: 'Fitness for work discussed — fatigue, illness, medication?', type: 'yn', bad: ['no'], section: 'Covered at pre-start' },
      { id: 'concerns', q: 'Any concerns raised by the crew?', type: 'yn', noNA: true, bad: ['yes'], badMsg: 'Note the concern and what was agreed.', section: 'Covered at pre-start' },
      { id: 'npu', q: 'NPUs running, manometer in range?', type: 'ok', section: 'Equipment check' },
      { id: 'enclok', q: 'Enclosure intact, smoke test current?', type: 'ok', section: 'Equipment check' },
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
    yn('y4', 'Crew clean-shaven and fit tests current?', 'Every crew member clean-shaven as per their face fit and current on fit test', 'Before leaving the yard'),
    yn('y5', 'Crew training current for this class?', 'Every crew member current on training for the class of work', 'Before leaving the yard'),
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
    yn('a1', 'Everyone on site inducted?', 'Induct all TechClean staff and any others on site', 'On arrival — before starting'),
    yn('a2', 'All required documents signed?', 'Sign all required documents', 'On arrival — before starting'),
    yn('a3', 'Isolations confirmed in writing?', 'Confirm all isolations in writing — fire, HVAC, electrical, sensors', 'On arrival — before starting', { help: 'Fire, HVAC, electrical, sensors.' }),
    yn('a4', 'Toolbox talk done with input from all?', 'Perform a thorough toolbox talk with input from all staff', 'On arrival — before starting'),
    yn('a5', 'Site plan matches the site?', 'Confirm the site plan matches the site; mark up any change', 'On arrival — before starting', { help: 'Mark up any change on the plan.' }),
    yn('a6', 'Neighbours and occupiers notified?', 'Confirm neighbours and occupiers have been notified', 'On arrival — before starting'),
    yn('a7', 'Signs and barriers up?', 'Place all signage and barriers', 'On arrival — before starting'),
    yn('a8', 'Sign in / out notice at the entrance?', 'Place laminated sign in / out notice at the entrance', 'On arrival — before starting'),
    yn('a9', 'Primary and secondary boundaries set?', 'Establish the primary and secondary boundaries', 'On arrival — before starting'),
    yn('a10', 'Waste bin delivery and removal arranged?', 'Confirm waste bin delivery and removal arranged', 'On arrival — before starting'),
    yn('a11', 'Baseline air monitoring done by assessor?', 'Confirm baseline air monitoring completed by the assessor', 'On arrival — before starting'),
    { id: 'sig', q: 'Supervisor sign off', type: 'sign', section: 'Sign off' }
  ]
};

FORMS.D3 = {
  code: 'D3', ref: 'Form D3 — Site personnel register', title: 'Site personnel register', short: 'Personnel', icon: '👥', who: 'supervisor',
  help: 'At job start, and again on any crew change.',
  questions: [
    { id: 'lic', perCrew: true, q: 'licence / unit standards current?', pdf: 'Licence / unit standard current', type: 'yn', noNA: true, bad: ['no'], section: 'Site personnel register' },
    { id: 'ff', perCrew: true, q: 'face fit expiry date', pdf: 'Face fit expiry', type: 'date', badIf: 'past', section: 'Site personnel register' },
    { id: 'hm', perCrew: true, q: 'health monitoring current?', pdf: 'Health monitoring current', type: 'yn', noNA: true, bad: ['no'], section: 'Site personnel register' },
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
    yn('s5', 'Smoke test passed and on D7?', 'Smoke test passed and recorded on Form D7', '1. Set-up', { showIf: D6S('setup') }),
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
    yn('w4', 'SWMS signed daily by everyone?', 'SWMS for the work in progress signed daily by everyone on site', 'Weekly inspection'),
    yn('w5', 'Sign in / out register complete?', 'Sign in / out register complete', 'Weekly inspection'),
    yn('w6', 'Enclosure and pressure logs complete?', 'Enclosure integrity and negative pressure logs complete', 'Weekly inspection'),
    yn('w7', 'Decon unit clean, working, used right?', 'Decontamination unit clean, operational and correctly used', 'Weekly inspection', { photo: true }),
    yn('w8', 'PPE and RPE good, stored and used right?', 'PPE and RPE in good condition, correctly stored and correctly used', 'Weekly inspection', { photo: true }),
    yn('w9', 'Everyone clean-shaven as per face fit?', 'Everyone on site clean-shaven as per face fit', 'Weekly inspection'),
    yn('w10', 'Waste secure, double contained, labelled?', 'Waste stored securely, double contained, correctly labelled', 'Weekly inspection', { photo: true }),
    yn('w11', 'Housekeeping — enclosure, decon, waste route, amenities?', 'Housekeeping — enclosure, decontamination unit, waste route and amenities', 'Weekly inspection', { photo: true }),
    yn('w12', 'Daily checks done all week, faults closed?', 'Daily pre-start equipment and mask checks completed every day this week, and any fault closed out', 'Weekly inspection'),
    yn('w13', 'Electrical gear tested and tagged?', 'Electrical equipment current on test and tag', 'Weekly inspection', { photo: true }),
    yn('w14', 'First aid, extinguisher and air horn OK?', 'First aid kit stocked; extinguisher and air horn in place and serviceable', 'Weekly inspection', { photo: true }),
    yn('w15', 'Emergency exit from enclosure clear?', 'Emergency exit route from the enclosure clear', 'Weekly inspection', { photo: true }),
    yn('w16', 'Air monitoring current and shared?', 'Air monitoring results current and shared with the crew', 'Weekly inspection'),
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
  code: 'D11', ref: 'Form D11 — Inventory sign out sheet', title: 'Equipment out / back', short: 'Equipment', icon: '🧰', who: 'supervisor',
  questions: [
    { id: 'dir', q: 'Signing equipment out or back in?', type: 'choice', section: 'Inventory', opts: [['out', '📤', 'Out to site'], ['back', '📥', 'Back from site']] },
    { id: 'item', q: 'Item description', pdf: 'Item description', type: 'field', section: 'Inventory' },
    { id: 'qty', q: 'How many?', pdf: 'Qty', type: 'number', unit: '', section: 'Inventory' },
    { id: 'cond', q: 'Condition on return?', pdf: 'Condition', type: 'choice', section: 'Inventory', showIf: function (a) { return a.dir && a.dir.v === 'back'; },
      opts: [['good', '👍', 'Good'], ['service', '🔧', 'Needs service'], ['damaged', '💥', 'Damaged'], ['lost', '❓', 'Missing']], bad: ['service', 'damaged', 'lost'], photo: true },
    { id: 'iphoto', q: 'Photo (optional)', type: 'photo', section: 'Inventory', optional: true }
  ]
};

/* Supervisor's "Job forms" menu, in Part D order. D7 is Class A only. */
var JOB_FORMS = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11'];

/* ---------- The job sequence (supervisor's phone) ----------
   Steps unlock in order: a step can only be started when every step before it is done.
   group: start = once per job · day = every day · week = weekly inspection · finish = close-out (in order, after start).
   perPerson: done for every crew member on site today (handed round on the supervisor's phone).
   preset: answers filled in for that step (e.g. which D6 stage).  Re-order or edit steps here. */
var SEQUENCE = [
  { key: 'D2', group: 'start', form: 'D2', title: 'Job start checklist' },
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
  { key: 'D11B', group: 'finish', form: 'D11', preset: { dir: 'back' }, title: 'Equipment back to the yard' }
];
var GROUPS = { start: 'Start of job — once', day: 'Every day', week: 'Every week', finish: 'Close-out — when removal is finished' };
