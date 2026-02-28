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

// ==================== NEW TABLES FOR TICKET SYSTEM ====================
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kundennummer  TEXT UNIQUE,
    name          TEXT NOT NULL,
    vorname       TEXT,
    nachname      TEXT,
    strasse       TEXT,
    hnr           TEXT,
    plz           TEXT,
    ort           TEXT,
    telefon       TEXT,
    email         TEXT,
    bemerkung     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tours (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    beschreibung  TEXT,
    turnus        TEXT NOT NULL DEFAULT 'taeglich', -- taeglich, woechentlich, monatlich, jaehrlich
    mitarbeiter_ids TEXT, -- JSON array of employee IDs
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tour_customers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tour_id       INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
    customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    reihenfolge   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tour_id, customer_id)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id         INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    entry_id            INTEGER REFERENCES entries(id) ON DELETE SET NULL,
    tour_id             INTEGER REFERENCES tours(id) ON DELETE SET NULL,
    customer_id         INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    calendar_event_title TEXT,
    calendar_event_address TEXT,
    calendar_event_datetime TEXT,
    ticket_type          TEXT NOT NULL, -- dichtheit, terminwunsch, zusatzarbeit, mangel, sonstiges
    notiz               TEXT,
    status              TEXT NOT NULL DEFAULT 'offen', -- offen, erledigt
    befund              TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at           TEXT,
    closed_by           INTEGER REFERENCES employees(id) ON DELETE SET NULL
  );
`);

// New default settings for ticket system
insertSetting.run('calendar_ical_url', '');
insertSetting.run('tickets_enabled', 'false'); // Feature flag for employee access

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

// ==================== CUSTOMER QUERIES ====================
const getCustomers = db.prepare('SELECT * FROM customers ORDER BY name, nachname');
const getCustomerById = db.prepare('SELECT * FROM customers WHERE id = ?');
const getCustomerByKundennummer = db.prepare('SELECT * FROM customers WHERE kundennummer = ?');
const insertCustomer = db.prepare(`
  INSERT INTO customers (kundennummer, name, vorname, nachname, strasse, hnr, plz, ort, telefon, email, bemerkung)
  VALUES (@kundennummer, @name, @vorname, @nachname, @strasse, @hr, @plz, @ort, @telefon, @email, @bemerkung)
`);
const updateCustomer = db.prepare(`
  UPDATE customers SET kundennummer=@kundennummer, name=@name, vorname=@vorname, nachname=@nachname,
    strasse=@strasse, hnr=@hr, plz=@plz, ort=@ort, telefon=@telefon, email=@email, bemerkung=@bemerkung,
    updated_at=datetime('now') WHERE id=@id
`);
const deleteCustomer = db.prepare('DELETE FROM customers WHERE id = ?');

// ==================== TOUR QUERIES ====================
const getTours = db.prepare('SELECT * FROM tours ORDER BY name');
const getTourById = db.prepare('SELECT * FROM tours WHERE id = ?');
const insertTour = db.prepare(`
  INSERT INTO tours (name, beschreibung, turnus, mitarbeiter_ids)
  VALUES (@name, @beschreibung, @turnus, @mitarbeiter_ids)
`);
const updateTour = db.prepare(`
  UPDATE tours SET name=@name, beschreibung=@beschreibung, turnus=@turnus, mitarbeiter_ids=@mitarbeiter_ids,
    updated_at=datetime('now') WHERE id=@id
`);
const deleteTour = db.prepare('DELETE FROM tours WHERE id = ?');

// ==================== TOUR_CUSTOMERS QUERIES ====================
const getTourCustomers = db.prepare(`
  SELECT tc.*, c.name, c.strasse, c.hnr, c.plz, c.ort
  FROM tour_customers tc
  JOIN customers c ON tc.customer_id = c.id
  WHERE tc.tour_id = ? ORDER BY tc.reihenfolge
`);
const addCustomerToTour = db.prepare(`
  INSERT OR REPLACE INTO tour_customers (tour_id, customer_id, reihenfolge)
  VALUES (@tour_id, @customer_id, @reihenfolge)
`);
const removeCustomerFromTour = db.prepare('DELETE FROM tour_customers WHERE tour_id = ? AND customer_id = ?');

// ==================== TICKET QUERIES ====================
const getTickets = db.prepare(`
  SELECT t.*, emp.name as employee_name, c.name as customer_name, c.strasse, c.hnr, c.plz, c.ort,
         tour.name as tour_name
  FROM tickets t
  LEFT JOIN employees emp ON emp.id = t.employee_id
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN tours tour ON tour.id = t.tour_id
  ORDER BY t.created_at DESC
`);
const getTicketsByStatus = db.prepare(`
  SELECT t.*, emp.name as employee_name, c.name as customer_name, c.strasse, c.hnr, c.plz, c.ort,
         tour.name as tour_name
  FROM tickets t
  LEFT JOIN employees emp ON emp.id = t.employee_id
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN tours tour ON tour.id = t.tour_id
  WHERE t.status = ? ORDER BY t.created_at DESC
`);
const getTicketsByEmployee = db.prepare(`
  SELECT t.*, emp.name as employee_name, c.name as customer_name, c.strasse, c.hnr, c.plz, c.ort,
         tour.name as tour_name
  FROM tickets t
  LEFT JOIN employees emp ON emp.id = t.employee_id
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN tours tour ON tour.id = t.tour_id
  WHERE t.employee_id = ? ORDER BY t.created_at DESC
`);
const getTicketById = db.prepare(`
  SELECT t.*, emp.name as employee_name, c.name as customer_name, c.strasse, c.hnr, c.plz, c.ort,
         tour.name as tour_name
  FROM tickets t
  LEFT JOIN employees emp ON emp.id = t.employee_id
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN tours tour ON tour.id = t.tour_id
  WHERE t.id = ?
`);
const insertTicket = db.prepare(`
  INSERT INTO tickets (employee_id, entry_id, tour_id, customer_id, calendar_event_title,
    calendar_event_address, calendar_event_datetime, ticket_type, notiz, status)
  VALUES (@employee_id, @entry_id, @tour_id, @customer_id, @calendar_event_title,
    @calendar_event_address, @calendar_event_datetime, @ticket_type, @notiz, @status)
`);
const updateTicket = db.prepare(`
  UPDATE tickets SET ticket_type=@ticket_type, notiz=@notiz, befund=@befund, status=@status,
    closed_at=@closed_at, closed_by=@closed_by WHERE id=@id
`);
const deleteTicket = db.prepare('DELETE FROM tickets WHERE id = ?');

// ==================== JSON HELPERS ====================
function parseJsonArray(jsonStr) {
  if (!jsonStr) return [];
  try {
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

function stringifyJsonArray(arr) {
  return JSON.stringify(arr || []);
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
  // New ticket system exports
  getCustomers,
  getCustomerById,
  getCustomerByKundennummer,
  insertCustomer,
  updateCustomer,
  deleteCustomer,
  getTours,
  getTourById,
  insertTour,
  updateTour,
  deleteTour,
  getTourCustomers,
  addCustomerToTour,
  removeCustomerFromTour,
  getTickets,
  getTicketsByStatus,
  getTicketsByEmployee,
  getTicketById,
  insertTicket,
  updateTicket,
  deleteTicket,
  parseJsonArray,
  stringifyJsonArray,
};
