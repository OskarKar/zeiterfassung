const express = require('express');
const router = express.Router();

const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// ==================== GET /api/stats/weekday-pattern ====================
// Calculates absence frequency per weekday per employee
// Flags anomalies: if one weekday accounts for >= 40% of all absences
router.get('/weekday-pattern', (req, res) => {
  const db = req.app.locals.db;
  const { employee_id } = req.query;

  const ABSENCE_CATS = ['krankenstand', 'urlaub'];

  let rows;
  if (employee_id) {
    rows = db.prepare(`
      SELECT e.date, e.category, emp.name as employee_name, e.employee_id
      FROM entries e JOIN employees emp ON emp.id = e.employee_id
      WHERE e.employee_id = ? AND e.category IN ('krankenstand','urlaub')
      ORDER BY e.date
    `).all(employee_id);
  } else {
    rows = db.prepare(`
      SELECT e.date, e.category, emp.name as employee_name, e.employee_id
      FROM entries e JOIN employees emp ON emp.id = e.employee_id
      WHERE e.category IN ('krankenstand','urlaub')
      ORDER BY e.date
    `).all();
  }

  // Group by employee
  const byEmployee = {};
  rows.forEach(r => {
    if (!byEmployee[r.employee_id]) {
      byEmployee[r.employee_id] = { name: r.employee_name, entries: [] };
    }
    byEmployee[r.employee_id].entries.push(r);
  });

  const results = [];

  Object.values(byEmployee).forEach(({ name, entries }) => {
    // Count per weekday (0=Sun ... 6=Sat)
    const perDay = [0, 0, 0, 0, 0, 0, 0];
    const catPerDay = { krankenstand: [0,0,0,0,0,0,0], urlaub: [0,0,0,0,0,0,0] };

    entries.forEach(e => {
      const d = new Date(e.date + 'T12:00:00');
      const wd = d.getDay();
      perDay[wd]++;
      if (catPerDay[e.category]) catPerDay[e.category][wd]++;
    });

    const total = entries.length;
    const weekdayTable = WEEKDAY_NAMES.map((dayName, i) => ({
      wochentag: dayName,
      krankenstand: catPerDay.krankenstand[i],
      urlaub: catPerDay.urlaub[i],
      gesamt: perDay[i],
      prozent: total > 0 ? Math.round((perDay[i] / total) * 100) : 0,
    }));

    // Anomaly detection: Mo or Fr >= 40% of total sick days
    const anomalien = [];
    const sickTotal = catPerDay.krankenstand.reduce((a, b) => a + b, 0);

    if (sickTotal >= 3) {
      [1, 5].forEach(dayIdx => { // Mon=1, Fri=5
        const count = catPerDay.krankenstand[dayIdx];
        const pct = Math.round((count / sickTotal) * 100);
        if (pct >= 40) {
          anomalien.push(
            `⚠️ Auffälligkeit: ${name} ist zu ${pct}% am ${WEEKDAY_NAMES[dayIdx]} im Krankenstand (${count} von ${sickTotal} Tagen).`
          );
        }
      });
    }

    // Any single weekday >= 50% of all absences
    perDay.forEach((count, i) => {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      if (pct >= 50 && total >= 4) {
        anomalien.push(
          `⚠️ Auffälligkeit: ${name} ist zu ${pct}% aller Abwesenheiten am ${WEEKDAY_NAMES[i]} (${count} von ${total} Tagen).`
        );
      }
    });

    results.push({
      mitarbeiter: name,
      gesamtAbwesenheiten: total,
      krankenstandTage: sickTotal,
      urlaubTage: entries.filter(e => e.category === 'urlaub').length,
      wochentage: weekdayTable,
      anomalien,
    });
  });

  res.json(results);
});

// ==================== GET /api/stats/period-anomalies ====================
// Compare a date range to the yearly average
router.get('/period-anomalies', (req, res) => {
  const db = req.app.locals.db;
  const { employee_id, from, to } = req.query;

  if (!from || !to) return res.status(400).json({ error: 'from und to erforderlich (YYYY-MM-DD)' });

  const empFilter = employee_id ? 'AND e.employee_id = ?' : '';
  const empArgs = employee_id ? [employee_id] : [];

  // Get period data
  const periodRows = db.prepare(`
    SELECT e.*, emp.name as employee_name
    FROM entries e JOIN employees emp ON emp.id = e.employee_id
    WHERE e.date >= ? AND e.date <= ? ${empFilter}
  `).all(from, to, ...empArgs);

  // Get all-time data for reference
  const allRows = db.prepare(`
    SELECT e.*, emp.name as employee_name
    FROM entries e JOIN employees emp ON emp.id = e.employee_id
    WHERE 1=1 ${empFilter}
  `).all(...empArgs);

  // Calculate period duration in days
  const fromDate = new Date(from + 'T12:00:00');
  const toDate = new Date(to + 'T12:00:00');
  const periodDays = Math.max(1, Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1);

  // Get unique dates range in all data
  const allDates = [...new Set(allRows.map(r => r.date))].sort();
  const totalDays = allDates.length > 0
    ? Math.max(1, Math.round(
        (new Date(allDates[allDates.length - 1] + 'T12:00:00') - new Date(allDates[0] + 'T12:00:00')) / (1000 * 60 * 60 * 24)
      ) + 1)
    : periodDays;

  // Period KPIs
  const periodWorkDays = new Set(periodRows.filter(r => r.net_minutes > 0 || r.category !== 'krankenstand').map(r => r.date)).size;
  const periodHours = periodRows.reduce((s, r) => s + (r.net_minutes || 0), 0) / 60;
  const periodSickDays = periodRows.filter(r => r.category === 'krankenstand').length;
  const periodVacDays = periodRows.filter(r => r.category === 'urlaub').length;

  // Yearly average per day
  const allHours = allRows.reduce((s, r) => s + (r.net_minutes || 0), 0) / 60;
  const allSickDays = allRows.filter(r => r.category === 'krankenstand').length;
  const allVacDays = allRows.filter(r => r.category === 'urlaub').length;

  const avgHoursPerDay = totalDays > 0 ? allHours / totalDays : 0;
  const avgSickPerDay = totalDays > 0 ? allSickDays / totalDays : 0;
  const avgVacPerDay = totalDays > 0 ? allVacDays / totalDays : 0;

  // Expected for this period length
  const expHours = avgHoursPerDay * periodDays;
  const expSick = avgSickPerDay * periodDays;
  const expVac = avgVacPerDay * periodDays;

  function diffPct(actual, expected) {
    if (expected < 0.5) return null;
    return Math.round(((actual - expected) / expected) * 100);
  }

  function warningText(label, actual, expected, unit, higherIsBad = true) {
    const pct = diffPct(actual, expected);
    if (pct === null) return null;
    const absVal = Math.abs(pct);
    if (absVal < 15) return null; // not noteworthy
    const direction = pct > 0 ? 'höher' : 'niedriger';
    const sign = (pct > 0) === higherIsBad ? '⚠️' : 'ℹ️';
    return `${sign} ${label} ist in diesem Zeitraum ${absVal}% ${direction} als der Durchschnitt (${actual.toFixed(1)} ${unit} vs. erwartet ${expected.toFixed(1)} ${unit}).`;
  }

  const warnungen = [
    warningText('Krankenstand', periodSickDays, expSick, 'Tage', true),
    warningText('Urlaub', periodVacDays, expVac, 'Tage', false),
    warningText('Arbeitsstunden', periodHours, expHours, 'Std.', false),
  ].filter(Boolean);

  if (warnungen.length === 0 && allRows.length > 0) {
    warnungen.push('✅ Alle Kennzahlen liegen im normalen Bereich.');
  } else if (allRows.length === 0) {
    warnungen.push('ℹ️ Keine Vergleichsdaten vorhanden.');
  }

  res.json({
    zeitraum: { von: from, bis: to, tage: periodDays },
    zeitraumKPIs: {
      arbeitsstunden: Math.round(periodHours * 100) / 100,
      krankenstandTage: periodSickDays,
      urlaubTage: periodVacDays,
      arbeitstage: periodWorkDays,
    },
    durchschnittKPIs: {
      stundenProTag: Math.round(avgHoursPerDay * 100) / 100,
      krankenstandProTag: Math.round(avgSickPerDay * 1000) / 1000,
      erwartetKrankenstand: Math.round(expSick * 10) / 10,
      erwartetStunden: Math.round(expHours * 10) / 10,
    },
    warnungen,
  });
});

// ==================== GET /api/stats/task-intervals ====================
// For a given category, list dates and calculate average interval
router.get('/task-intervals', (req, res) => {
  const db = req.app.locals.db;
  const { employee_id, category } = req.query;

  if (!category) return res.status(400).json({ error: 'category erforderlich' });

  const empFilter = employee_id ? 'AND e.employee_id = ?' : '';
  const empArgs = employee_id ? [employee_id] : [];

  const rows = db.prepare(`
    SELECT e.date, e.description, e.net_minutes, emp.name as employee_name, e.employee_id
    FROM entries e JOIN employees emp ON emp.id = e.employee_id
    WHERE e.category = ? ${empFilter}
    ORDER BY e.employee_id, e.date ASC
  `).all(category, ...empArgs);

  // Group by employee
  const byEmp = {};
  rows.forEach(r => {
    if (!byEmp[r.employee_id]) byEmp[r.employee_id] = { name: r.employee_name, entries: [] };
    byEmp[r.employee_id].entries.push(r);
  });

  const results = Object.values(byEmp).map(({ name, entries }) => {
    const dates = entries.map(e => e.date);

    // Calculate intervals between consecutive entries
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const d1 = new Date(dates[i - 1] + 'T12:00:00');
      const d2 = new Date(dates[i] + 'T12:00:00');
      intervals.push(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
    }

    const avgInterval = intervals.length > 0
      ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : null;

    const minInterval = intervals.length > 0 ? Math.min(...intervals) : null;
    const maxInterval = intervals.length > 0 ? Math.max(...intervals) : null;
    const totalHours = entries.reduce((s, e) => s + (e.net_minutes || 0), 0) / 60;

    // Format entries for display
    const eintraege = entries.map((e, i) => ({
      datum: new Date(e.date + 'T12:00:00').toLocaleDateString('de-DE'),
      beschreibung: e.description || '—',
      stunden: e.net_minutes ? (e.net_minutes / 60).toFixed(2) : '—',
      abstandVorher: i > 0 ? `${intervals[i - 1]} Tage` : '(erster Eintrag)',
    }));

    const zusammenfassung = avgInterval !== null
      ? `"${category}" wurde ${entries.length}× durchgeführt, im Schnitt alle ${avgInterval} Tage (min: ${minInterval}, max: ${maxInterval} Tage).`
      : `"${category}" wurde ${entries.length}× durchgeführt — zu wenig Daten für Intervall-Berechnung.`;

    return {
      mitarbeiter: name,
      kategorie: category,
      anzahl: entries.length,
      gesamtStunden: Math.round(totalHours * 100) / 100,
      durchschnittIntervall: avgInterval,
      minIntervall: minInterval,
      maxIntervall: maxInterval,
      zusammenfassung,
      eintraege,
    };
  });

  res.json(results);
});

module.exports = router;
