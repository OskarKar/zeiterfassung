const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'database.sqlite');
const db = new DatabaseSync(DB_PATH);

// WAL mode for better concurrent access reliability
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ==================== SCHEMA ====================
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    is_boss    INTEGER NOT NULL DEFAULT 0,
    pin        TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS entries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date           TEXT NOT NULL,
    start_time     TEXT,
    end_time       TEXT,
    category       TEXT NOT NULL,
    is_outside     INTEGER NOT NULL DEFAULT 0,
    tip            REAL NOT NULL DEFAULT 0,
    description    TEXT,
    gross_minutes  INTEGER,
    break_minutes  INTEGER,
    net_minutes    INTEGER,
    integrity_hash TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ==================== MIGRATIONS ====================
// Safe: only adds columns/tables that don't exist yet — never touches existing data
const existingCols = db.prepare("PRAGMA table_info(employees)").all().map(r => r.name);
if (!existingCols.includes('vorname'))      db.exec("ALTER TABLE employees ADD COLUMN vorname TEXT");
if (!existingCols.includes('nachname'))     db.exec("ALTER TABLE employees ADD COLUMN nachname TEXT");
if (!existingCols.includes('geburtsdatum')) db.exec("ALTER TABLE employees ADD COLUMN geburtsdatum TEXT");
if (!existingCols.includes('password_hash')) db.exec("ALTER TABLE employees ADD COLUMN password_hash TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL DEFAULT (datetime('now')),
    aktion      TEXT NOT NULL,
    tabelle     TEXT NOT NULL,
    datensatz_id INTEGER,
    geaendert_von TEXT,
    alt_wert    TEXT,
    neu_wert    TEXT
  );
`);

// Default settings
const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
insertSetting.run('boss_pin', '1234');
insertSetting.run('break_threshold_hours', '6');
insertSetting.run('break_duration_minutes', '30');
insertSetting.run('taggeld_satz', '1.27');

// ==================== EMPLOYEE QUERIES ====================
const getEmployees = db.prepare('SELECT id, name, vorname, nachname, geburtsdatum, is_boss, pin, created_at FROM employees ORDER BY name');
const getEmployeeById = db.prepare('SELECT id, name, vorname, nachname, geburtsdatum, is_boss, pin, created_at FROM employees WHERE id = ?');
const insertEmployee = db.prepare(
  'INSERT INTO employees (name, vorname, nachname, geburtsdatum, is_boss, pin, password_hash) VALUES (@name, @vorname, @nachname, @geburtsdatum, @is_boss, @pin, @password_hash)'
);
const updateEmployee = db.prepare(
  'UPDATE employees SET name=@name, vorname=@vorname, nachname=@nachname, geburtsdatum=@geburtsdatum, pin=@pin, password_hash=@password_hash WHERE id=@id'
);
const deleteEmployee = db.prepare('DELETE FROM employees WHERE id = ?');

// ==================== AUDIT LOG QUERIES ====================
const insertAuditLog = db.prepare(
  'INSERT INTO audit_log (aktion, tabelle, datensatz_id, geaendert_von, alt_wert, neu_wert) VALUES (@aktion, @tabelle, @datensatz_id, @geaendert_von, @alt_wert, @neu_wert)'
);
const getAuditLog = db.prepare(
  'SELECT * FROM audit_log ORDER BY ts DESC LIMIT 200'
);
const getAuditLogByRecord = db.prepare(
  'SELECT * FROM audit_log WHERE tabelle = ? AND datensatz_id = ? ORDER BY ts DESC'
);

// ==================== ENTRY QUERIES ====================
const getEntriesByMonth = db.prepare(`
  SELECT e.*, emp.name as employee_name
  FROM entries e
  JOIN employees emp ON emp.id = e.employee_id
  WHERE e.date LIKE ? || '%'
  ORDER BY e.date DESC, emp.name
`);

const getEntriesByEmployeeMonth = db.prepare(`
  SELECT e.*, emp.name as employee_name
  FROM entries e
  JOIN employees emp ON emp.id = e.employee_id
  WHERE e.employee_id = ? AND e.date LIKE ? || '%'
  ORDER BY e.date DESC
`);

const getAllEntries = db.prepare(`
  SELECT e.*, emp.name as employee_name
  FROM entries e
  JOIN employees emp ON emp.id = e.employee_id
  ORDER BY e.date DESC, emp.name
`);

const insertEntry = db.prepare(`
  INSERT INTO entries
    (employee_id, date, start_time, end_time, category, is_outside, tip,
     description, gross_minutes, break_minutes, net_minutes, integrity_hash)
  VALUES
    (@employee_id, @date, @start_time, @end_time, @category, @is_outside, @tip,
     @description, @gross_minutes, @break_minutes, @net_minutes, @integrity_hash)
`);

const deleteEntry = db.prepare('DELETE FROM entries WHERE id = ?');

const updateEntry = db.prepare(`
  UPDATE entries SET
    date = @date, start_time = @start_time, end_time = @end_time,
    category = @category, is_outside = @is_outside, tip = @tip,
    description = @description, gross_minutes = @gross_minutes,
    break_minutes = @break_minutes, net_minutes = @net_minutes,
    integrity_hash = @integrity_hash,
    updated_at = datetime('now')
  WHERE id = @id
`);

// ==================== SETTINGS QUERIES ====================
const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const upsertSetting = db.prepare(
  'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
);

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ==================== HELPERS ====================
function calculateTimes(startTime, endTime, breakThresholdHours, breakDurationMinutes) {
  if (!startTime || !endTime) return { grossMinutes: 0, breakMinutes: 0, netMinutes: 0 };

  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin < startMin) endMin += 24 * 60;

  const grossMinutes = endMin - startMin;
  const breakMinutes = grossMinutes >= breakThresholdHours * 60 ? breakDurationMinutes : 0;
  const netMinutes = grossMinutes - breakMinutes;

  return { grossMinutes, breakMinutes, netMinutes };
}

module.exports = {
  db,
  getEmployees,
  getEmployeeById,
  insertEmployee,
  updateEmployee,
  deleteEmployee,
  insertAuditLog,
  getAuditLog,
  getAuditLogByRecord,
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
};
