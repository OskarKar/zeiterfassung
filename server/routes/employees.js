const express = require('express');
const crypto = require('crypto');
const router = express.Router();

function hashPassword(plain) {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

function sanitizeEmployee(emp) {
  const e = { ...emp };
  delete e.password_hash;
  return e;
}

function auditLog(db, aktion, datensatz_id, geaendert_von, alt, neu) {
  try {
    db.prepare(
      'INSERT INTO audit_log (aktion, tabelle, datensatz_id, geaendert_von, alt_wert, neu_wert) VALUES (?,?,?,?,?,?)'
    ).run(aktion, 'employees', datensatz_id, geaendert_von || 'Admin', alt, neu);
  } catch (_) {}
}

// GET /api/employees
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare(
    'SELECT id, name, vorname, nachname, geburtsdatum, is_boss, pin, created_at FROM employees ORDER BY name'
  ).all();
  res.json(rows);
});

// GET /api/employees/:id
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const row = db.prepare(
    'SELECT id, name, vorname, nachname, geburtsdatum, is_boss, pin, created_at FROM employees WHERE id = ?'
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(row);
});

// POST /api/employees  — Anlegen
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { name, vorname = '', nachname = '', geburtsdatum = '', is_boss = 0, pin = null, password = '' } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });

  const password_hash = password ? hashPassword(password) : null;

  try {
    const result = db.prepare(
      'INSERT INTO employees (name, vorname, nachname, geburtsdatum, is_boss, pin, password_hash) VALUES (?,?,?,?,?,?,?)'
    ).run(name.trim(), vorname.trim(), nachname.trim(), geburtsdatum || null, is_boss, pin, password_hash);

    const newId = result.lastInsertRowid;

    auditLog(db, 'INSERT', newId, 'Admin',
      null,
      JSON.stringify({ name: name.trim(), vorname, nachname, geburtsdatum, is_boss })
    );

    const created = db.prepare(
      'SELECT id, name, vorname, nachname, geburtsdatum, is_boss, pin, created_at FROM employees WHERE id = ?'
    ).get(newId);
    res.json(created);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Name bereits vergeben' });
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/employees/:id  — Bearbeiten
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const id = req.params.id;

  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden' });

  const {
    name        = existing.name,
    vorname     = existing.vorname     || '',
    nachname    = existing.nachname    || '',
    geburtsdatum= existing.geburtsdatum|| '',
    pin         = existing.pin,
    password    = '',      // only update if non-empty
  } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Name erforderlich' });

  const password_hash = password
    ? hashPassword(password)
    : existing.password_hash;   // keep old hash if no new password supplied

  // Snapshot before for audit
  const altSnapshot = JSON.stringify({
    name: existing.name, vorname: existing.vorname, nachname: existing.nachname,
    geburtsdatum: existing.geburtsdatum, pin: existing.pin,
  });

  try {
    db.prepare(
      'UPDATE employees SET name=?, vorname=?, nachname=?, geburtsdatum=?, pin=?, password_hash=? WHERE id=?'
    ).run(name.trim(), vorname.trim(), nachname.trim(), geburtsdatum || null, pin, password_hash, id);

    auditLog(db, 'UPDATE', parseInt(id), 'Admin',
      altSnapshot,
      JSON.stringify({ name: name.trim(), vorname, nachname, geburtsdatum, pin })
    );

    const updated = db.prepare(
      'SELECT id, name, vorname, nachname, geburtsdatum, is_boss, pin, created_at FROM employees WHERE id = ?'
    ).get(id);
    res.json(updated);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Name bereits vergeben' });
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/employees/:id
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const id = req.params.id;

  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

  db.prepare('DELETE FROM employees WHERE id = ?').run(id);

  auditLog(db, 'DELETE', parseInt(id), 'Admin',
    JSON.stringify({ name: existing.name, vorname: existing.vorname, nachname: existing.nachname }),
    null
  );

  res.json({ ok: true });
});

// GET /api/employees/audit/log  — gesamtes Audit-Log
router.get('/audit/log', (req, res) => {
  const db = req.app.locals.db;
  const limit = parseInt(req.query.limit) || 200;
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?').all(limit);
  res.json(rows);
});

// POST /api/employees/:id/verify-password  — Passwort prüfen (für Login)
router.post('/:id/verify-password', (req, res) => {
  const db = req.app.locals.db;
  const { password } = req.body;
  const emp = db.prepare('SELECT password_hash FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Nicht gefunden' });
  if (!emp.password_hash) return res.json({ ok: true }); // kein Passwort gesetzt = freier Zugang
  const match = emp.password_hash === hashPassword(password || '');
  if (match) res.json({ ok: true });
  else res.status(401).json({ error: 'Falsches Passwort' });
});

module.exports = router;
