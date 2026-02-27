const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const dbModule = require('./db');
const {
  db,
  getEmployees,
  getEmployeeById,
  insertEmployee,
  deleteEmployee,
  getEntriesByMonth,
  getEntriesByEmployeeMonth,
  getAllEntries,
  insertEntry,
  deleteEntry,
  updateEntry,
  getSetting,
  upsertSetting,
  getSettings,
  calculateTimes,
} = dbModule;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'client')));

// ==================== HELPERS ====================
function makeHash(entry, secret) {
  const data = JSON.stringify({
    employee_id: entry.employee_id,
    date: entry.date,
    start_time: entry.start_time,
    end_time: entry.end_time,
    category: entry.category,
    is_outside: entry.is_outside,
    tip: entry.tip,
    created_at: entry.created_at,
  });
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function getSecret() {
  const row = getSetting.get('secret');
  if (row) return row.value;
  const newSecret = crypto.randomBytes(32).toString('hex');
  upsertSetting.run('secret', newSecret);
  return newSecret;
}

// Expose shared helpers and db to route modules via app.locals
app.locals.db = db;
app.locals.getSettings = getSettings;
app.locals.getEmployeeById = getEmployeeById;
app.locals.calculateTimes = calculateTimes;
app.locals.makeHash = makeHash;
app.locals.getSecret = getSecret;

// ==================== ROUTE MODULES ====================
app.use('/api/employees', require('./routes/employees'));
app.use('/api/import',    require('./routes/import'));
app.use('/api/export',    require('./routes/export'));
app.use('/api/stats',     require('./routes/stats'));

// ==================== ENTRY ROUTES ====================
app.get('/api/entries', (req, res) => {
  const { month, employee_id } = req.query;

  if (month && employee_id) {
    return res.json(getEntriesByEmployeeMonth.all(employee_id, month));
  }
  if (month) {
    return res.json(getEntriesByMonth.all(month));
  }
  res.json(getAllEntries.all());
});

app.post('/api/entries', (req, res) => {
  const {
    employee_id, date, start_time, end_time,
    category, is_outside = 0, tip = 0, description = '',
  } = req.body;

  if (!employee_id || !date || !category) {
    return res.status(400).json({ error: 'employee_id, date, category erforderlich' });
  }

  const settings = getSettings();
  const times = calculateTimes(
    start_time, end_time,
    parseFloat(settings.break_threshold_hours),
    parseInt(settings.break_duration_minutes)
  );

  const entryData = {
    employee_id, date, start_time, end_time, category,
    is_outside: is_outside ? 1 : 0,
    tip: parseFloat(tip) || 0,
    description,
    ...times,
    created_at: new Date().toISOString(),
  };

  const secret = getSecret();
  const integrity_hash = makeHash(entryData, secret);
  entryData.integrity_hash = integrity_hash;

  try {
    const result = insertEntry.run(entryData);
    const employee = getEmployeeById.get(employee_id);

    // Broadcast to boss dashboard
    io.emit('entry_saved', {
      employeeName: employee ? employee.name : 'Unbekannt',
      date,
      category,
    });

    res.json({ id: result.lastInsertRowid, ...entryData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/entries/:id', (req, res) => {
  const {
    date, start_time, end_time, category,
    is_outside = 0, tip = 0, description = '',
  } = req.body;

  const existing = require('./db').db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

  const settings = getSettings();
  const times = calculateTimes(
    start_time, end_time,
    parseFloat(settings.break_threshold_hours),
    parseInt(settings.break_duration_minutes)
  );

  const entryData = {
    id: req.params.id,
    date, start_time, end_time, category,
    is_outside: is_outside ? 1 : 0,
    tip: parseFloat(tip) || 0,
    description,
    ...times,
    created_at: existing.created_at,
    employee_id: existing.employee_id,
  };

  const secret = getSecret();
  entryData.integrity_hash = makeHash(entryData, secret);

  updateEntry.run(entryData);
  res.json({ ok: true });
});

app.delete('/api/entries/:id', (req, res) => {
  deleteEntry.run(req.params.id);
  res.json({ ok: true });
});

// ==================== VERSION ROUTE ====================
app.get('/api/version', (req, res) => {
  const pkg = require('./package.json');
  res.json({ version: pkg.version, nodeEnv: process.env.NODE_ENV || 'development' });
});

// ==================== UPDATE LOG ROUTE ====================
app.get('/api/update-log', (req, res) => {
  const fs = require('fs');
  const updateLog = path.join(__dirname, '..', 'data', 'update.log');
  const initLog   = path.join(__dirname, '..', '..', 'init.log');
  let parts = [];
  if (fs.existsSync(initLog))   parts.push('=== init.log ===\n' + fs.readFileSync(initLog, 'utf8'));
  if (fs.existsSync(updateLog)) parts.push('=== update.log ===\n' + fs.readFileSync(updateLog, 'utf8'));
  if (!parts.length) {
    return res.json({ log: 'Noch kein Log vorhanden.\nInit- oder Update-Skript ausführen.' });
  }
  const content = parts.join('\n\n');
  const trimmed = content.length > 8192 ? '...(gekürzt)\n' + content.slice(-8192) : content;
  res.json({ log: trimmed });
});

// ==================== SETTINGS ROUTES ====================
app.get('/api/settings', (req, res) => {
  const settings = getSettings();
  // Don't expose secret
  delete settings.secret;
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const allowed = ['boss_pin', 'break_threshold_hours', 'break_duration_minutes', 'taggeld_satz'];
  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key)) {
      upsertSetting.run(key, String(value));
    }
  }
  res.json({ ok: true });
});

app.post('/api/auth/boss', (req, res) => {
  const { pin } = req.body;
  const row = getSetting.get('boss_pin');
  const correctPin = row ? row.value : '1234';
  if (pin === correctPin) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Falscher PIN' });
  }
});

// ==================== PDF EXPORT (legacy inline — replaced by routes/export.js) ====================
// Kept as dead code reference only
app.get('/api/export/pdf_old', async (req, res) => {
  const { month, employee_id } = req.query;
  if (!month) return res.status(400).json({ error: 'month erforderlich' });

  let entries;
  if (employee_id) {
    entries = getEntriesByEmployeeMonth.all(employee_id, month);
  } else {
    entries = getEntriesByMonth.all(month);
  }

  const settings = getSettings();
  const taggeldSatz = parseFloat(settings.taggeld_satz) || 1.27;

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  const [year, mon] = month.split('-');
  const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const monthLabel = `${monthNames[parseInt(mon) - 1]} ${year}`;
  const empName = employee_id
    ? (getEmployeeById.get(employee_id)?.name || 'Unbekannt')
    : 'Alle Mitarbeiter';

  res.setHeader('Content-Disposition', `attachment; filename="Arbeitszeitnachweis_${month}_${empName.replace(/\s/g,'_')}.pdf"`);
  doc.pipe(res);

  // Title
  doc.fontSize(18).font('Helvetica-Bold').text('Arbeitszeitnachweis', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica').text(`Mitarbeiter: ${empName}`, 40);
  doc.text(`Monat: ${monthLabel}`, 40);
  doc.text(`Taggeld-Satz: € ${taggeldSatz.toFixed(2)}/Std.`, 40);
  doc.moveDown(1);

  // Table header
  const colX = [40, 70, 120, 260, 310, 365, 420, 480];
  const colLabels = ['Tag', 'Datum', 'Ziel / Zweck', 'Abfahrt', 'Ankunft', 'Stunden', 'Taggeld', 'Trinkgeld'];

  doc.font('Helvetica-Bold').fontSize(9);
  doc.rect(40, doc.y, 520, 16).fill('#4472C4');
  doc.fillColor('white');
  colLabels.forEach((lbl, i) => {
    doc.text(lbl, colX[i] + 2, doc.y - 14, { width: (colX[i+1] || 560) - colX[i] - 4, lineBreak: false });
  });
  doc.fillColor('black');
  doc.moveDown(0.2);

  // Build full month calendar
  const daysInMonth = new Date(parseInt(year), parseInt(mon), 0).getDate();
  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  const entriesByDate = {};
  entries.forEach(e => {
    if (!entriesByDate[e.date]) entriesByDate[e.date] = [];
    entriesByDate[e.date].push(e);
  });

  let totalNet = 0;
  let totalTaggeld = 0;
  let totalTip = 0;
  let rowIndex = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${mon}-${String(d).padStart(2, '0')}`;
    const dayEntries = entriesByDate[dateStr] || [null];
    const wd = weekdays[new Date(dateStr).getDay()];
    const isWeekend = wd === 'Sa' || wd === 'So';
    const dateLabel = `${String(d).padStart(2, '0')}.${mon}.`;

    dayEntries.forEach((entry, idx) => {
      const rowY = doc.y;
      const rowH = 14;

      // Alternating row background
      if (rowIndex % 2 === 0) {
        doc.rect(40, rowY, 520, rowH).fill(isWeekend ? '#e8e8e8' : '#f5f5f5');
      }
      doc.fillColor('#333').font('Helvetica').fontSize(8);

      const netH = entry ? (entry.net_minutes / 60) : 0;
      const taggeld = netH * taggeldSatz;
      if (entry) {
        totalNet += entry.net_minutes || 0;
        totalTaggeld += taggeld;
        totalTip += entry.tip || 0;
      }

      const cols = [
        idx === 0 ? wd : '',
        idx === 0 ? dateLabel : '',
        entry ? (entry.description || '') : '',
        entry ? (entry.start_time || '') : '',
        entry ? (entry.end_time || '') : '',
        entry ? (entry.net_minutes / 60).toFixed(2) : '',
        entry ? `€ ${taggeld.toFixed(2)}` : '',
        entry && entry.tip > 0 ? `€ ${entry.tip.toFixed(2)}` : '',
      ];

      cols.forEach((val, i) => {
        doc.text(String(val), colX[i] + 2, rowY + 3, {
          width: (colX[i+1] || 560) - colX[i] - 4,
          lineBreak: false,
        });
      });

      doc.y = rowY + rowH;
      rowIndex++;
    });

    // Page break check
    if (doc.y > 740) {
      doc.addPage();
      rowIndex = 0;
    }
  }

  // Totals row
  doc.moveDown(0.5);
  const totY = doc.y;
  doc.rect(40, totY, 520, 16).fill('#4472C4');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
  doc.text('Summe:', colX[4] + 2, totY + 3, { width: 60, lineBreak: false });
  doc.text((totalNet / 60).toFixed(2), colX[5] + 2, totY + 3, { width: 55, lineBreak: false });
  doc.text(`€ ${totalTaggeld.toFixed(2)}`, colX[6] + 2, totY + 3, { width: 55, lineBreak: false });
  doc.text(`€ ${totalTip.toFixed(2)}`, colX[7] + 2, totY + 3, { width: 55, lineBreak: false });
  doc.fillColor('black');
  doc.y = totY + 20;

  // Signature lines
  doc.moveDown(3);
  const sigY = doc.y;
  doc.font('Helvetica').fontSize(9);
  doc.moveTo(40, sigY).lineTo(200, sigY).stroke();
  doc.moveTo(350, sigY).lineTo(520, sigY).stroke();
  doc.text('Datum, Unterschrift Mitarbeiter', 40, sigY + 4);
  doc.text('Datum, Unterschrift Arbeitgeber', 350, sigY + 4);

  doc.end();
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  socket.on('typing_start', (data) => {
    // Broadcast to all OTHER clients (typically the boss dashboard)
    socket.broadcast.emit('employee_typing', {
      employeeId: data.employeeId,
      employeeName: data.employeeName,
    });
  });

  socket.on('typing_stop', (data) => {
    socket.broadcast.emit('employee_stopped', {
      employeeId: data.employeeId,
    });
  });
});

// ==================== CATCH-ALL ====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Zeiterfassung läuft auf http://0.0.0.0:${PORT}`);
});
