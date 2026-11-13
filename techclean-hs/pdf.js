/* TechClean H&S app — branded PDF for every record (matches ARCP Part D form numbers). */
var PDF = (function () {
  var RED = [232, 25, 44], GREY = [89, 89, 89], LIGHT = [236, 239, 241], BLACK = [17, 17, 17];
  var logo = null;

  function loadLogo() {
    return fetch('logo-white.png').then(function (r) { return r.blob(); }).then(function (b) {
      return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { logo = fr.result; res(); }; fr.readAsDataURL(b); });
    }).catch(function () {});
  }

  function imgSize(dataUrl) {
    return new Promise(function (res) { var i = new Image(); i.onload = function () { res([i.width, i.height]); }; i.onerror = function () { res([4, 3]); }; i.src = dataUrl; });
  }

  async function build(rec) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var W = 210, M = 14, y = 0, pageNo = 1;

    function header() {
      doc.setFillColor.apply(doc, BLACK); doc.rect(0, 0, W, 24, 'F');
      doc.setFillColor.apply(doc, RED); doc.rect(0, 24, W, 1.4, 'F');
      if (logo) doc.addImage(logo, 'PNG', M, 6.5, 52, 10.9);
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text(rec.formTitle, W - M, 11, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(200, 200, 200);
      doc.text(rec.formRef + '   ·   ' + CONFIG.ARCP_DOC + ' Rev ' + rec.arcpRev, W - M, 17, { align: 'right' });
      y = 32;
    }
    function footer() {
      doc.setDrawColor(200, 200, 200); doc.line(M, 284, W - M, 284);
      doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY); doc.setFont('helvetica', 'normal');
      var gps = rec.gps ? ('GPS ' + rec.gps.lat.toFixed(5) + ', ' + rec.gps.lng.toFixed(5) + ' (±' + Math.round(rec.gps.acc) + ' m)') : 'GPS not available';
      doc.text('Completed ' + fmtStamp(rec.createdAt) + '   ·   ' + gps + '   ·   Record ' + rec.id, M, 288);
      doc.text('TechClean Limited · TechClean H&S app (pilot) · Page ' + pageNo, W - M, 292, { align: 'right' });
      doc.text('Site App Pro remains the official record during the pilot.', M, 292);
    }
    function need(h) { if (y + h > 280) { footer(); doc.addPage(); pageNo++; header(); } }

    header();

    // Details block
    var det = rec.details;
    doc.setFontSize(9);
    for (var i = 0; i < det.length; i++) {
      need(7);
      doc.setFillColor.apply(doc, LIGHT); doc.rect(M, y, 50, 6.5, 'F');
      doc.setDrawColor(215, 215, 215); doc.rect(M, y, W - 2 * M, 6.5);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(63, 63, 63); doc.text(det[i][0], M + 2, y + 4.4);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); doc.text(String(det[i][1] || '—'), M + 53, y + 4.4);
      y += 6.5;
    }
    y += 5;

    // Statement (D1)
    if (rec.statement) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
      var st = doc.splitTextToSize(rec.statement, W - 2 * M); need(st.length * 4.6 + 4);
      doc.text(st, M, y + 4); y += st.length * 4.6 + 6;
    }

    // Rows grouped by section
    var section = null;
    for (var r = 0; r < rec.rows.length; r++) {
      var row = rec.rows[r];
      if (row.section && row.section !== section) {
        section = row.section; need(12); y += 2;
        doc.setFillColor.apply(doc, RED); doc.rect(M, y, W - 2 * M, 6.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
        doc.text(section.toUpperCase(), M + 2, y + 4.4); y += 6.5;
      }
      doc.setFontSize(9);
      var q = doc.splitTextToSize(plain(row.label), 118), note = row.note ? doc.splitTextToSize('Note: ' + row.note, W - 2 * M - 4) : [];
      var vlines = doc.splitTextToSize(plain(row.value), 58);
      var h = Math.max(q.length, vlines.length) * 4.2 + 3 + (note.length ? note.length * 4 + 1 : 0);
      need(h);
      doc.setDrawColor(215, 215, 215); doc.rect(M, y, W - 2 * M, h);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0); doc.text(q, M + 2, y + 4.4);
      doc.setFont('helvetica', 'bold');
      if (row.flag === 'bad') doc.setTextColor.apply(doc, RED); else if (row.flag === 'good') doc.setTextColor(46, 125, 50); else doc.setTextColor(0, 0, 0);
      doc.text(vlines, W - M - 2, y + 4.4, { align: 'right' });
      if (note.length) { doc.setFont('helvetica', 'italic'); doc.setTextColor.apply(doc, GREY); doc.text(note, M + 2, y + 4.4 + Math.max(q.length, vlines.length) * 4.2); }
      y += h;
    }

    // Photos
    if (rec.photos && rec.photos.length) {
      need(76); y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0); doc.text('Photos', M, y); y += 3;
      var x = M;
      for (var p = 0; p < rec.photos.length; p++) {
        var sz = await imgSize(rec.photos[p].img), pw = 85, ph = Math.min(64, pw * sz[1] / sz[0]); pw = ph * sz[0] / sz[1];
        if (x + pw > W - M) { x = M; y += 70; }
        need(ph + 8);
        doc.addImage(rec.photos[p].img, 'JPEG', x, y, pw, ph);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, GREY);
        doc.text(rec.photos[p].caption || '', x, y + ph + 3.5);
        x += pw + 6;
      }
      y += 70;
    }

    // Signatures
    if (rec.sigs && rec.sigs.length) {
      need(32); y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0); doc.text('Signatures', M, y); y += 2;
      for (var s = 0; s < rec.sigs.length; s++) {
        var sg = rec.sigs[s]; need(22);
        doc.setDrawColor(215, 215, 215); doc.rect(M, y, W - 2 * M, 20);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0, 0, 0); doc.text(sg.name, M + 2, y + 5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, GREY);
        doc.text((sg.label || '') + (sg.time ? '  ·  ' + fmtStamp(sg.time) : ''), M + 2, y + 10);
        if (sg.extra) doc.text(sg.extra, M + 2, y + 15);
        doc.setTextColor(0, 0, 0);
        if (sg.img) doc.addImage(sg.img, 'PNG', W - M - 62, y + 1, 60, 18);
        else { doc.setFont('helvetica', 'italic'); doc.text(sg.text || 'Signed electronically on own phone', W - M - 2, y + 11, { align: 'right' }); }
        y += 20;
      }
    }
    footer();
    return doc;
  }

  function plain(v) { return String(v).replace(/³/g, '3').replace(/²/g, '2').replace(/−/g, '-').replace(/✓/g, 'OK').replace(/✗/g, 'NO').replace(/[^\x00-\xFF–—‘’“”·]/g, ''); }
  function fmtStamp(t) {
    var d = new Date(t);
    return d.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return { build: build, loadLogo: loadLogo };
})();
