# TechClean H&S app — Phase 1 (pilot build)

Own folder / repo, separate from the Operations Schedule.

## Try it
Host this folder on any HTTPS site (e.g. a new GitHub Pages repo, like the schedule), open it on a phone,
then "Add to Home Screen". It runs in **demo mode** (dummy job J0104551, 132 Canal Road) until `API_URL` is set in `config.js`.
Demo settings (link at the bottom of Today) let you switch person, change the job status, pretend there's no signal, and open the visitor QR view.

## Files
- `index.html` — screens and styling
- `app.js` — app logic (offline storage, flows, sending)
- `forms.js` — the questions, by ARCP Part D form (edit wording here)
- `config.js` — back-end address, ARCP rev, job folder pattern, demo data
- `pdf.js` + `jspdf.umd.min.js` — branded PDF for every record
- `sw.js` — offline cache and Android background send. Bump `VERSION` on every release.
- `manifest.webmanifest`, icons — home-screen install

## What's in it
- Crew (Today screen): Fit for work, Sign on / off (D13), Sign ARCP / SWMS (D1), Report (D12), Site file
- Supervisor also: Pre-start (D5) and Job forms — D2 Job start, D3 Personnel register, D4 Induction, D6 Quality control,
  D7 Enclosure smoke test / pressure log (Class A only), D8 Weekly inspection, D9 End of shift, D10 Waste load, D11 Equipment out / back
- Visitors and subcontractors: D14 visitor sign in / out from the job QR (no app needed)
- Site file: who is on site now, the full sign-in register (roll-call PDF), job documents, and every Part D form for the job
  with its records, all versions, PDFs and a blank print-backup PDF
- New versions: any record can be re-issued with a reason. The old version is kept and marked replaced; the new PDF says what it replaces and why.

Question wording lives in `forms.js` — `q` is the short phone question, `pdf` is the ARCP wording printed on the PDF.

## Links
- QR / email link: `…/?job=J0104551` or `…/j/J0104551`
- One-time person link: `…/?me=<token>` (demo: `?me=P02`)

## Not in this build yet (needs the back end)
Reading today's jobs and crew from the schedule sheet, filing PDFs to the M365 job folder, incident emails,
live crew status on the supervisor's phone, 7am reminders and nudges, job close-out pack.
