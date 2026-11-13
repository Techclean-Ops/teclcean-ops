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
