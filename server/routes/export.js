const express = require('express');
const router = express.Router();

const MONTH_NAMES = [
  'Januar','Februar','März','April','Mai','Juni',
  'Juli','August','September','Oktober','November','Dezember'
];
const WEEKDAY_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa'];

// GET /api/export/pdf?month=YYYY-MM&employee_id=X
router.get('/pdf', (req, res) => {
  const { month, employee_id } = req.query;
  if (!month) return res.status(400).json({ error: 'month erforderlich (YYYY-MM)' });

  const db = req.app.locals.db;
  const getSettings = req.app.locals.getSettings;
  const getEmployeeById = req.app.locals.getEmployeeById;

  const settings = getSettings();
  const taggeldSatz = parseFloat(settings.taggeld_satz) || 1.27;

  let entries;
  if (employee_id) {
    entries = db.prepare(`
      SELECT e.*, emp.name as employee_name
      FROM entries e JOIN employees emp ON emp.id = e.employee_id
      WHERE e.employee_id = ? AND e.date LIKE ? || '%'
      ORDER BY e.date
    `).all(employee_id, month);
  } else {
    entries = db.prepare(`
      SELECT e.*, emp.name as employee_name
      FROM entries e JOIN employees emp ON emp.id = e.employee_id
      WHERE e.date LIKE ? || '%'
      ORDER BY e.date, emp.name
    `).all(month);
  }

  const [year, mon] = month.split('-');
  const monthLabel = `${MONTH_NAMES[parseInt(mon) - 1]} ${year}`;
  const daysInMonth = new Date(parseInt(year), parseInt(mon), 0).getDate();
  const empName = employee_id
    ? (getEmployeeById.get(employee_id)?.name || 'Unbekannt')
    : 'Alle Mitarbeiter';

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({
    margin: 0,
    size: 'A4',
    layout: 'portrait',
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Arbeitszeitnachweis_${month}_${empName.replace(/\s+/g,'_')}.pdf"`
  );
  doc.pipe(res);

  // ── Page margins & layout constants ──
  const ML = 30;   // margin left
  const MR = 30;   // margin right
  const MT = 35;   // margin top
  const PW = 595.28 - ML - MR;  // printable width

  // Column widths (matching Excel template: A B C D E F G)
  // Tag | Datum | Beschreibung | Abfahrt | Ankunft | Stunden | Taggeld
  const COL_W  = [28, 52, 180, 52, 52, 48, 60];
  const COL_X  = COL_W.reduce((acc, w, i) => {
    acc.push(i === 0 ? ML : acc[i-1] + COL_W[i-1]);
    return acc;
  }, []);

  const ROW_H  = 16;
  const HDR_H  = 22;

  // ── TITLE BLOCK ──
  let y = MT;

  doc.fontSize(14).font('Helvetica-Bold')
     .fillColor('#1a3a6b')
     .text('Arbeitszeitnachweis', ML, y, { width: PW, align: 'center' });
  y += 20;

  doc.fontSize(9).font('Helvetica').fillColor('#333');
  doc.text(`Mitarbeiter:  ${empName}`, ML, y);
  doc.text(`Monat:  ${monthLabel}`, ML + 200, y);
  y += 14;
  doc.text(`Taggeld-Satz:  € ${taggeldSatz.toFixed(2)} / Std.`, ML, y);
  y += 18;

  // ── TABLE HEADER ──
  const COL_LABELS = ['Tag','Datum','Ziel u. Zweck der Reise','Abfahrt','Ankunft','Stunden','Taggeld'];
  doc.rect(ML, y, PW, HDR_H).fill('#1a3a6b');
  doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
  COL_LABELS.forEach((lbl, i) => {
    const align = i >= 3 ? 'center' : 'left';
    doc.text(lbl, COL_X[i] + 2, y + 7, { width: COL_W[i] - 4, align, lineBreak: false });
  });
  y += HDR_H;

  // ── BUILD DATE → ENTRIES MAP ──
  const entriesByDate = {};
  entries.forEach(e => {
    if (!entriesByDate[e.date]) entriesByDate[e.date] = [];
    entriesByDate[e.date].push(e);
  });

  let totalNetMinutes = 0;
  let totalTaggeld    = 0;
  let totalTip        = 0;
  let rowIdx          = 0;

  // ── TABLE ROWS (one per calendar day) ──
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${year}-${mon}-${String(d).padStart(2,'0')}`;
    const dayEntries = entriesByDate[dateStr] || [null];
    const wd       = WEEKDAY_SHORT[new Date(dateStr + 'T12:00:00').getDay()];
    const isWeekend = wd === 'Sa' || wd === 'So';
    const dateDisp = `${String(d).padStart(2,'0')}.${mon}.`;

    dayEntries.forEach((entry, idx) => {
      // Page break
      if (y + ROW_H > 790) {
        doc.addPage({ margin: 0, size: 'A4' });
        y = MT;
        // Repeat header
        doc.rect(ML, y, PW, HDR_H).fill('#1a3a6b');
        doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
        COL_LABELS.forEach((lbl, i) => {
          const align = i >= 3 ? 'center' : 'left';
          doc.text(lbl, COL_X[i] + 2, y + 7, { width: COL_W[i] - 4, align, lineBreak: false });
        });
        y += HDR_H;
        rowIdx = 0;
      }

      // Row background
      const bgColor = isWeekend
        ? '#d0d8e8'
        : (rowIdx % 2 === 0 ? '#f0f4fb' : '#ffffff');
      doc.rect(ML, y, PW, ROW_H).fill(bgColor);

      // Grid lines
      doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.3).stroke('#c0c8d8');
      COL_X.forEach(cx => {
        doc.moveTo(cx, y).lineTo(cx, y + ROW_H).lineWidth(0.3).stroke('#c0c8d8');
      });

      doc.fillColor(isWeekend ? '#555' : '#222').fontSize(8).font('Helvetica');

      const netH    = entry ? (entry.net_minutes || 0) / 60 : 0;
      const taggeld = entry ? netH * taggeldSatz : 0;

      if (entry) {
        totalNetMinutes += entry.net_minutes || 0;
        totalTaggeld    += taggeld;
        totalTip        += entry.tip || 0;
      }

      // Cell values
      const cells = [
        idx === 0 ? wd : '',
        idx === 0 ? dateDisp : '',
        entry ? (entry.description || '') : '',
        entry ? (entry.start_time || '') : '',
        entry ? (entry.end_time   || '') : '',
        entry && entry.net_minutes ? (entry.net_minutes / 60).toFixed(2) : '',
        entry && entry.net_minutes ? `€ ${taggeld.toFixed(2)}` : '',
      ];

      cells.forEach((val, i) => {
        const align = i >= 3 ? 'center' : 'left';
        doc.text(String(val), COL_X[i] + 3, y + 5, {
          width: COL_W[i] - 6,
          align,
          lineBreak: false,
        });
      });

      y += ROW_H;
      rowIdx++;
    });
  }

  // ── TOTALS ROW ──
  doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.5).stroke('#1a3a6b');
  doc.rect(ML, y, PW, HDR_H).fill('#1a3a6b');
  doc.fillColor('white').fontSize(9).font('Helvetica-Bold');

  doc.text('Summe:', COL_X[4] + 3, y + 7, { width: COL_W[4] - 6, align: 'right', lineBreak: false });
  doc.text((totalNetMinutes / 60).toFixed(2), COL_X[5] + 3, y + 7, { width: COL_W[5] - 6, align: 'center', lineBreak: false });
  doc.text(`€ ${totalTaggeld.toFixed(2)}`, COL_X[6] + 3, y + 7, { width: COL_W[6] - 6, align: 'center', lineBreak: false });
  y += HDR_H;

  // Trinkgeld total (only if non-zero)
  if (totalTip > 0) {
    doc.rect(ML, y, PW, ROW_H).fill('#f0f4fb');
    doc.fillColor('#333').fontSize(8).font('Helvetica');
    doc.text(`Trinkgeld gesamt:`, COL_X[4] + 3, y + 5, { width: COL_W[4] + COL_W[5] - 6, align: 'right', lineBreak: false });
    doc.text(`€ ${totalTip.toFixed(2)}`, COL_X[6] + 3, y + 5, { width: COL_W[6] - 6, align: 'center', lineBreak: false });
    y += ROW_H;
  }

  // ── SIGNATURE LINES ──
  y += 30;
  if (y > 760) { doc.addPage({ margin: 0, size: 'A4' }); y = MT + 30; }

  doc.moveTo(ML, y).lineTo(ML + 160, y).lineWidth(0.7).stroke('#555');
  doc.moveTo(ML + 240, y).lineTo(ML + 240 + 160, y).lineWidth(0.7).stroke('#555');
  doc.fillColor('#444').fontSize(8).font('Helvetica');
  doc.text('Datum, Unterschrift Mitarbeiter', ML, y + 4, { width: 160 });
  doc.text('Datum, Unterschrift Arbeitgeber', ML + 240, y + 4, { width: 160 });

  doc.end();
});

module.exports = router;
