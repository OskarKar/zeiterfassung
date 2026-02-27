const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Convert Excel serial date to ISO string
function excelDateToISO(serial) {
  // Excel epoch: Jan 1, 1900 (with leap year bug)
  const utcDays = serial - 25569; // diff to Unix epoch
  const ms = utcDays * 86400 * 1000;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

// Convert Excel time fraction to HH:MM string
function excelTimeToHHMM(fraction) {
  if (fraction === null || fraction === undefined || fraction === '') return null;
  const totalMinutes = Math.round(fraction * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Map description text to category value
function guessCategory(desc) {
  if (!desc) return 'buero';
  const d = desc.toLowerCase();
  if (d.includes('krankenstand')) return 'krankenstand';
  if (d.includes('urlaub')) return 'urlaub';
  if (d.includes('betriebsurlaub')) return 'betriebsurlaub';
  if (d.includes('feiertag')) return 'feiertag';
  if (d.includes('fortbildung')) return 'fortbildung';
  // Tour codes like Spf, Umg, Extumg, nachholen, dp = Kehrtour
  if (d.match(/^(spf|umg|ext|nachhol|dp|mo\.arb)/)) return 'kehrtour';
  return 'kehrtour'; // default for outside work
}

// POST /api/import/excel
router.post('/excel', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

  const { employee_id } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id erforderlich' });

  const db = req.app.locals.db;
  const { calculateTimes, getSettings, makeHash, getSecret } = req.app.locals;

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const range = XLSX.utils.decode_range(ws['!ref']);

    const settings = getSettings();
    const breakThreshold = parseFloat(settings.break_threshold_hours) || 6;
    const breakDuration = parseInt(settings.break_duration_minutes) || 30;
    const taggeldSatz = parseFloat(settings.taggeld_satz) || 1.27;
    const secret = getSecret();

    let imported = 0;
    let skipped = 0;
    const errors = [];

    // Check for existing entries for this employee to avoid duplicates
    const existingDates = new Set(
      db.prepare('SELECT date FROM entries WHERE employee_id = ?').all(employee_id).map(r => r.date)
    );

    // Data starts at row index 2 (0-based), i.e., row 3 in Excel
    // Rows with no start/end time = free days (Sa, So, Urlaub with no times)
    for (let r = 2; r <= range.e.r; r++) {
      const getCell = (col) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c: col })];
        return cell ? cell.v : null;
      };

      const wdRaw   = getCell(0); // A: weekday text
      const dateRaw = getCell(1); // B: Excel date serial
      const descRaw = getCell(2); // C: description
      const startRaw = getCell(3); // D: departure time fraction
      const endRaw   = getCell(4); // E: arrival time fraction
      const hoursRaw = getCell(5); // F: hours decimal
      const taggeldRaw = getCell(6); // G: taggeld amount

      // Skip if no date
      if (!dateRaw || typeof dateRaw !== 'number') continue;

      // Skip summary rows (row 35 in Excel = index 34, has "Summe" label)
      if (wdRaw === null && descRaw === 'Summe') continue;

      const dateISO = excelDateToISO(dateRaw);
      const startTime = excelTimeToHHMM(startRaw);
      const endTime = excelTimeToHHMM(endRaw);
      const description = descRaw ? String(descRaw) : '';
      const category = guessCategory(description);

      // Skip weekends with no data
      const isWeekend = wdRaw === 'Sa' || wdRaw === 'So';
      if (isWeekend && !startTime && !description) continue;

      // Skip if already imported
      if (existingDates.has(dateISO)) {
        skipped++;
        continue;
      }

      let netMinutes = 0;
      let grossMinutes = 0;
      let breakMinutes = 0;

      if (hoursRaw && typeof hoursRaw === 'number') {
        // Use hours directly from Excel (already calculated)
        netMinutes = Math.round(hoursRaw * 60);
        grossMinutes = netMinutes;
        breakMinutes = 0;
      } else if (startTime && endTime) {
        const times = calculateTimes(startTime, endTime, breakThreshold, breakDuration);
        netMinutes = times.netMinutes;
        grossMinutes = times.grossMinutes;
        breakMinutes = times.breakMinutes;
      }

      const createdAt = new Date().toISOString();
      const entryData = {
        employee_id: parseInt(employee_id),
        date: dateISO,
        start_time: startTime,
        end_time: endTime,
        category,
        is_outside: (category === 'kehrtour') ? 1 : 0,
        tip: 0,
        description,
        gross_minutes: grossMinutes,
        break_minutes: breakMinutes,
        net_minutes: netMinutes,
        created_at: createdAt,
      };

      entryData.integrity_hash = makeHash(entryData, secret);

      try {
        db.prepare(`
          INSERT INTO entries
            (employee_id, date, start_time, end_time, category, is_outside, tip,
             description, gross_minutes, break_minutes, net_minutes, integrity_hash)
          VALUES
            (@employee_id, @date, @start_time, @end_time, @category, @is_outside, @tip,
             @description, @gross_minutes, @break_minutes, @net_minutes, @integrity_hash)
        `).run(entryData);
        imported++;
        existingDates.add(dateISO);
      } catch (e) {
        errors.push(`Zeile ${r + 1}: ${e.message}`);
      }
    }

    res.json({
      ok: true,
      imported,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    res.status(500).json({ error: 'Fehler beim Verarbeiten der Datei: ' + e.message });
  }
});

// ==================== POST /api/import/records ====================
// Accepts JSON payload from the client-side xlsx parser (Gemini component).
// Upserts: if an entry for the same employee_id + date exists → UPDATE, else INSERT.
router.post('/records', (req, res) => {
  const { employee_id, records } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id erforderlich' });
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records Array erforderlich' });
  }

  const db = req.app.locals.db;
  const { calculateTimes, getSettings, makeHash, getSecret } = req.app.locals;

  const settings = getSettings();
  const breakThreshold = parseFloat(settings.break_threshold_hours) || 6;
  const breakDuration  = parseInt(settings.break_duration_minutes)  || 30;
  const secret = getSecret();

  // Build a map of existing entries: date → id
  const existingRows = db.prepare(
    'SELECT id, date FROM entries WHERE employee_id = ?'
  ).all(employee_id);
  const existingByDate = {};
  existingRows.forEach(r => { existingByDate[r.date] = r.id; });

  let inserted = 0;
  let updated  = 0;
  const errors = [];

  for (const rec of records) {
    try {
      const { date, start_time, end_time, description } = rec;
      if (!date) { errors.push(`Kein Datum: ${JSON.stringify(rec)}`); continue; }

      const desc     = description || '';
      const category = guessCategory(desc);
      const isOutside = (category === 'kehrtour') ? 1 : 0;

      // Use hours from Excel if provided, otherwise recalculate
      let netMinutes = 0, grossMinutes = 0, breakMinutes = 0;
      if (rec.stunden && parseFloat(rec.stunden) > 0) {
        netMinutes   = Math.round(parseFloat(rec.stunden) * 60);
        grossMinutes = netMinutes;
        breakMinutes = 0;
      } else if (start_time && end_time) {
        const times  = calculateTimes(start_time, end_time, breakThreshold, breakDuration);
        netMinutes   = times.netMinutes;
        grossMinutes = times.grossMinutes;
        breakMinutes = times.breakMinutes;
      }

      const createdAt = new Date().toISOString();
      const entryData = {
        employee_id: parseInt(employee_id),
        date,
        start_time:  start_time  || null,
        end_time:    end_time    || null,
        category,
        is_outside:  isOutside,
        tip:         0,
        description: desc,
        gross_minutes: grossMinutes,
        break_minutes: breakMinutes,
        net_minutes:   netMinutes,
        created_at:    createdAt,
      };
      entryData.integrity_hash = makeHash(entryData, secret);

      // node:sqlite rejects unknown named params — only pass what the SQL uses
      const insertParams = {
        employee_id:   entryData.employee_id,
        date:          entryData.date,
        start_time:    entryData.start_time,
        end_time:      entryData.end_time,
        category:      entryData.category,
        is_outside:    entryData.is_outside,
        tip:           entryData.tip,
        description:   entryData.description,
        gross_minutes: entryData.gross_minutes,
        break_minutes: entryData.break_minutes,
        net_minutes:   entryData.net_minutes,
        integrity_hash: entryData.integrity_hash,
      };

      if (existingByDate[date] !== undefined) {
        db.prepare(`
          UPDATE entries SET
            start_time = @start_time, end_time = @end_time,
            category = @category, is_outside = @is_outside,
            description = @description,
            gross_minutes = @gross_minutes, break_minutes = @break_minutes,
            net_minutes = @net_minutes, integrity_hash = @integrity_hash,
            updated_at = datetime('now')
          WHERE id = @id
        `).run({
          id:            existingByDate[date],
          start_time:    insertParams.start_time,
          end_time:      insertParams.end_time,
          category:      insertParams.category,
          is_outside:    insertParams.is_outside,
          description:   insertParams.description,
          gross_minutes: insertParams.gross_minutes,
          break_minutes: insertParams.break_minutes,
          net_minutes:   insertParams.net_minutes,
          integrity_hash: insertParams.integrity_hash,
        });
        updated++;
      } else {
        db.prepare(`
          INSERT INTO entries
            (employee_id, date, start_time, end_time, category, is_outside, tip,
             description, gross_minutes, break_minutes, net_minutes, integrity_hash)
          VALUES
            (@employee_id, @date, @start_time, @end_time, @category, @is_outside, @tip,
             @description, @gross_minutes, @break_minutes, @net_minutes, @integrity_hash)
        `).run(insertParams);
        existingByDate[date] = true;
        inserted++;
      }
    } catch (e) {
      errors.push(`${rec.date}: ${e.message}`);
    }
  }

  res.json({ ok: true, inserted, updated, errors: errors.slice(0, 10) });
});

module.exports = router;
