/* TechClean H&S app — settings.
   API_URL: the H&S back end (Google Apps Script web app). Leave blank to run in demo mode:
   everything works on the phone, records and PDFs are kept on the phone, nothing is sent. */
var CONFIG = {
  API_URL: '',
  ARCP_DOC: 'TC-ARCP-SSSP-001',
  ARCP_REV: '1.2',
  /* Each branch has its own SharePoint library; every job sits in that branch's "1. Jobs" folder.
     The back end finds the job folder by its number at the start of the name (so status notes added to the
     folder name, e.g. " - Complete and clearance saved", don't break it), then files into an H&S subfolder. */
  JOB_FOLDER: '{library}/1. Jobs/{folderNo} {address}/H&S/',
  BRANCH_LIBRARY: { Auckland: 'TCL - Auckland', Wellington: 'TCL - Wellington', Christchurch: 'TCL - Christchurch', Nelson: 'TCL - Nelson' },
  REMINDER_TIME: '07:00'
};

/* Inventory sign-out sheet (D11). Consumables match the Site App Pro Inventory Sign Out Sheet; equipment from the ARCP.
   cost: price per unit in NZD (excl. GST). Leave null until the office adds it; costs then show per job.
   Edit this list to match what's actually stocked. */
var INVENTORY = {
  consumables: [
    /* Same items, same order as the Site App Pro 'Inventory Sign Out Sheet' (form 29854, v8). Add 'cost' per unit. */
    { id: 'cpoly', name: 'Clear polythene', unit: 'roll', cost: null },
    { id: 'bpoly', name: 'Black polythene', unit: 'roll', cost: null },
    { id: 'otape', name: 'Orange PVC tape', unit: 'roll', cost: null },
    { id: 'btape', name: 'Black PVC tape', unit: 'roll', cost: null },
    { id: 'clothtape', name: 'Cloth tape (black/grey/white/silver/blue)', unit: 'roll', cost: null },
    { id: 'mtape', name: 'Yellow paper masking tape', unit: 'roll', cost: null },
    { id: 'glue', name: 'Spray glue adhesive', unit: 'tin', cost: null },
    { id: 'cover', name: 'Coveralls', unit: 'each', cost: null },
    { id: 'b250', name: 'Black/clear 250mu bags', unit: 'bag', cost: null },
    { id: 'abs', name: 'Asbestos bags — small', unit: 'bag', cost: null },
    { id: 'abm', name: 'Asbestos bags — medium', unit: 'bag', cost: null },
    { id: 'abl', name: 'Asbestos bags — large', unit: 'bag', cost: null },
    { id: 'glgp', name: 'Gloves — general purpose', unit: 'pair', cost: null },
    { id: 'glnit', name: 'Gloves — nitrile (black surgical)', unit: 'pair', cost: null },
    { id: 'booties', name: 'Bootie covers', unit: 'pair', cost: null },
    { id: 'sabw', name: 'Sabre saw blades — wood', unit: 'each', cost: null },
    { id: 'sabm', name: 'Sabre saw blades — metal', unit: 'each', cost: null },
    { id: 'k1', name: 'K1 vac bags', unit: 'each', cost: null },
    { id: 'k4', name: 'K4 vac bags', unit: 'each', cost: null },
    { id: 'kv10', name: 'KV10 Triex filter', unit: 'each', cost: null },
    { id: 'kv25', name: 'KV25 Triex filter', unit: 'each', cost: null },
    { id: 'pf500', name: 'NPU pre filter 500', unit: 'each', cost: null },
    { id: 'pf2000', name: 'NPU pre filter 2000', unit: 'each', cost: null },
    { id: 'pf5000', name: 'NPU pre filter 5000', unit: 'each', cost: null },
    { id: 'vb32', name: 'Vac brushes 32mm', unit: 'each', cost: null },
    { id: 'vb38', name: 'Vac brushes 38mm', unit: 'each', cost: null },
    { id: 'baby', name: 'Baby wipes', unit: 'pack', cost: null },
    { id: 'alc', name: 'Alcohol wipes', unit: 'pack', cost: null },
    { id: 'iso', name: 'Isopropyl wipes', unit: 'pack', cost: null },
    { id: 'micro', name: 'Micro fibre rags', unit: 'rag', cost: null },
    { id: 'rags', name: 'White general rags', unit: 'pack', cost: null },
    { id: 'fibrelock', name: 'ABC Fibre-Lock', unit: 'litre', cost: null },
    { id: 'grind', name: 'Grinding disks 125mm', unit: 'each', cost: null },
    { id: 'knife', name: 'Craft knife blades 25mm', unit: 'each', cost: null },
    { id: 'linbide', name: 'Linbide blades', unit: 'each', cost: null },
    { id: 'screws', name: 'Screws 10mm', unit: 'each', cost: null },
    { id: 'shiff', name: 'Shigematsu full face filters', unit: 'pair', cost: null },
    { id: 'shihf', name: 'Shigematsu half face filters', unit: 'pair', cost: null },
    { id: 'sunpre', name: 'Sundström pre filters', unit: 'each', cost: null },
    { id: 'shower', name: '5 micron decon shower filters', unit: 'each', cost: null },
    { id: 'hazi3', name: 'Bulk Hazi bags 3m³', unit: 'bag', cost: null },
    { id: 'hazi1', name: 'Bulk Hazi bags 1m³', unit: 'bag', cost: null },
    { id: 'wire', name: 'Wire brushes', unit: 'each', cost: null },
    { id: 'wyard', name: 'Waste — back to yard', unit: 'bag', cost: null },
    { id: 'wonskip', name: 'Waste — on-site skip', unit: 'bag', cost: null },
    { id: 'woffskip', name: 'Waste — off-site skip', unit: 'bag', cost: null }
  ],
  equipment: [
    { id: 'npu', name: 'Negative pressure unit (NPU)', unit: 'unit' },
    { id: 'vac', name: 'H-class vacuum', unit: 'unit' },
    { id: 'dcu', name: 'Decontamination unit (DCU)', unit: 'unit' },
    { id: 'mano', name: 'Manometer', unit: 'unit' },
    { id: 'smokegen', name: 'Smoke generator', unit: 'unit' },
    { id: 'sprayer', name: 'Airless sprayer', unit: 'unit' },
    { id: 'inject', name: 'Injection wetting kit', unit: 'unit' },
    { id: 'water', name: 'Water filtration system', unit: 'unit' },
    { id: 'leads', name: 'Extension leads / RCD', unit: 'each' },
    { id: 'papr', name: 'PAPR (powered respirator)', unit: 'unit' },
    { id: 'ladder', name: 'Ladders / scaffold / podium', unit: 'each' }
  ]
};

/* Certificates. stopWork: an expired one stops the person working (fit tests). Everything else just warns.
   Real certificates come from the Training & Medical Register via the back end — never stored in this public code. */
var CERT_TYPES = [
  { id: 'ffhalf', name: 'Face fit test — half', stopWork: true }, { id: 'fffull', name: 'Face fit test — full', stopWork: true },
  { id: 'medical', name: 'Asbestos medical' }, { id: 'sitesafe', name: 'Site Safe' }, { id: 'firstaid', name: 'First aid' },
  { id: 'wahb', name: 'Working at heights — basic' }, { id: 'waha', name: 'Working at heights — advanced' }, { id: 'confined', name: 'Confined space' },
  { id: 'mewp', name: 'MEWP' }, { id: 'permit', name: 'Permit receiver' }, { id: 'licence', name: 'Driver licence' }
];
var CERT_WARN_DAYS = 60;

/* Demo data — replaced by today's jobs and crew from the schedule (read-only) once API_URL is set. */
var DEMO = {
  people: [
    { id: 'P01', name: 'Jack Reid', role: 'supervisor', branch: 'Auckland',
      certs: { ffhalf: '2027-06-05', fffull: '2027-06-05', medical: '2027-07-16', sitesafe: '2028-02-28', firstaid: '2028-02-05', wahb: '2028-01-10' } },
    { id: 'P02', name: 'Ivan Popov', role: 'crew', branch: 'Auckland',
      certs: { ffhalf: '2027-05-26', fffull: '2027-05-26', medical: '2028-12-15', sitesafe: '2028-09-23', firstaid: '2025-05-02' } },
    { id: 'P03', name: 'Mere Tane', role: 'crew', branch: 'Auckland',
      certs: { ffhalf: '2026-12-01', fffull: '2026-12-01', medical: '2027-11-14', sitesafe: '2028-08-21', firstaid: '2027-09-01' } },
    { id: 'P04', name: 'Sione Fifita', role: 'crew', branch: 'Auckland',
      certs: { ffhalf: '2027-03-03', fffull: '2024-09-24', medical: '2027-04-04', sitesafe: '2025-02-16' } }
  ],
  jobs: [
    { jobNo: 'J0104551', folderNo: '3365', street: '132 Canal Road', suburb: 'Avondale', cls: 'B', status: 'open',
      start: '7:00am', supervisorId: 'P01', pm: 'Project Manager', branch: 'Auckland',
      crewIds: ['P01', 'P02', 'P03', 'P04'],
      swms: ['SWMS B-02 Textured ceiling removal', 'SWMS B-07 Vinyl and backing removal'] }
  ]
};
