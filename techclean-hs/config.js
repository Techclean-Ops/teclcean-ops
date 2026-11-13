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

/* Inventory sign-out sheet (D11). From the ARCP: B-section equipment and consumables, PPE table, D2 checklist.
   cost: price per unit in NZD (excl. GST). Leave null until the office adds it; costs then show per job.
   Edit this list to match what's actually stocked. */
var INVENTORY = {
  consumables: [
    { id: 'poly', name: 'Polythene 200 micron', unit: 'roll', cost: null },
    { id: 'bags', name: 'Asbestos waste bags', unit: 'bag', cost: null },
    { id: 'clothtape', name: 'Cloth tape', unit: 'roll', cost: null },
    { id: 'barrier', name: 'Barrier tape', unit: 'roll', cost: null },
    { id: 'signs', name: 'Asbestos warning signs', unit: 'each', cost: null },
    { id: 'staples', name: 'Staples', unit: 'box', cost: null },
    { id: 'wipes', name: 'Wet wipes', unit: 'pack', cost: null },
    { id: 'pva', name: 'PVA', unit: 'litre', cost: null },
    { id: 'surf', name: 'Surfactant', unit: 'litre', cost: null },
    { id: 'encap', name: 'Encapsulant', unit: 'litre', cost: null },
    { id: 'cover', name: 'Disposable coveralls Type 5/6', unit: 'each', cost: null },
    { id: 'gloves', name: 'Nitrile gloves', unit: 'box', cost: null },
    { id: 'p3', name: 'P3 filters (half / full face)', unit: 'pair', cost: null },
    { id: 'paprf', name: 'PAPR filters', unit: 'each', cost: null },
    { id: 'smoke', name: 'Smoke test cartridges', unit: 'each', cost: null }
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

/* Demo data — replaced by today's jobs and crew from the schedule (read-only) once API_URL is set. */
var DEMO = {
  people: [
    { id: 'P01', name: 'Jack Reid', role: 'supervisor', branch: 'Auckland' },
    { id: 'P02', name: 'Ivan Popov', role: 'crew', branch: 'Auckland' },
    { id: 'P03', name: 'Mere Tane', role: 'crew', branch: 'Auckland' },
    { id: 'P04', name: 'Sione Fifita', role: 'crew', branch: 'Auckland' }
  ],
  jobs: [
    { jobNo: 'J0104551', folderNo: '3365', street: '132 Canal Road', suburb: 'Avondale', cls: 'B', status: 'open',
      start: '7:00am', supervisorId: 'P01', pm: 'Project Manager', branch: 'Auckland',
      crewIds: ['P01', 'P02', 'P03', 'P04'],
      swms: ['SWMS B-02 Textured ceiling removal', 'SWMS B-07 Vinyl and backing removal'] }
  ]
};
