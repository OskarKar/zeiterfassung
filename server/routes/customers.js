const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/customers - list all customers
router.get('/', (req, res) => {
  const { getCustomers } = req.app.locals;
  try {
    const customers = getCustomers.all();
    res.json(customers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/customers/:id - get single customer
router.get('/:id', (req, res) => {
  const { getCustomerById } = req.app.locals;
  try {
    const customer = getCustomerById.get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Kunde nicht gefunden' });
    res.json(customer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/customers - create new customer
router.post('/', (req, res) => {
  const { insertCustomer, getCustomerByKundennummer } = req.app.locals;
  const { kundennummer, name, vorname, nachname, strasse, hnr, plz, ort, telefon, email, bemerkung } = req.body;

  if (!name && !nachname) {
    return res.status(400).json({ error: 'Name oder Nachname erforderlich' });
  }

  // Check if kundennummer already exists
  if (kundennummer) {
    const existing = getCustomerByKundennummer.get(kundennummer);
    if (existing) {
      return res.status(400).json({ error: 'Kundennummer bereits vorhanden' });
    }
  }

  try {
    const result = insertCustomer.run({
      kundennummer: kundennummer || null,
      name: name || '',
      vorname: vorname || null,
      nachname: nachname || null,
      strasse: strasse || null,
      hr: hnr || null,
      plz: plz || null,
      ort: ort || null,
      telefon: telefon || null,
      email: email || null,
      bemerkung: bemerkung || null
    });
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/customers/:id - update customer
router.put('/:id', (req, res) => {
  const { updateCustomer, getCustomerByKundennummer } = req.app.locals;
  const { kundennummer, name, vorname, nachname, strasse, hnr, plz, ort, telefon, email, bemerkung } = req.body;

  if (!name && !nachname) {
    return res.status(400).json({ error: 'Name oder Nachname erforderlich' });
  }

  // Check if kundennummer already exists (excluding current customer)
  if (kundennummer) {
    const existing = getCustomerByKundennummer.get(kundennummer);
    if (existing && existing.id !== parseInt(req.params.id)) {
      return res.status(400).json({ error: 'Kundennummer bereits vorhanden' });
    }
  }

  try {
    updateCustomer.run({
      id: req.params.id,
      kundennummer: kundennummer || null,
      name: name || '',
      vorname: vorname || null,
      nachname: nachname || null,
      strasse: strasse || null,
      hr: hnr || null,
      plz: plz || null,
      ort: ort || null,
      telefon: telefon || null,
      email: email || null,
      bemerkung: bemerkung || null
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/customers/:id - delete customer
router.delete('/:id', (req, res) => {
  const { deleteCustomer } = req.app.locals;
  try {
    deleteCustomer.run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/customers/import - CSV import
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

  const { insertCustomer, getCustomerByKundennummer } = req.app.locals;
  const { skipDuplicates = 'true' } = req.body;

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length < 2) {
      return res.status(400).json({ error: 'Datei enthält keine Daten' });
    }

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);

    let imported = 0;
    let skipped = 0;
    const errors = [];

    // Map CSV columns to our database fields
    const fieldMap = {
      'KUNDENNUMMER': 'kundennummer',
      'NAME1': 'name',
      'NAME2': 'vorname',
      'NAME3': 'nachname',
      'STRASSE': 'strasse',
      'HNR': 'hr',
      'PLZ': 'plz',
      'ORT': 'ort',
      'TEL1': 'telefon',
      'EMAIL': 'email',
      'INFO': 'bemerkung'
    };

    // Find column indices
    const colIndices = {};
    headers.forEach((header, index) => {
      const upperHeader = header ? header.toString().toUpperCase() : '';
      if (fieldMap[upperHeader]) {
        colIndices[fieldMap[upperHeader]] = index;
      }
    });

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!row || row.every(cell => !cell)) continue; // Skip empty rows

      try {
        const customerData = {};
        
        // Extract data from row using column mapping
        Object.entries(colIndices).forEach(([field, colIndex]) => {
          const value = row[colIndex];
          if (value !== undefined && value !== null && value !== '') {
            customerData[field] = String(value).trim();
          }
        });

        // Skip if no name provided
        if (!customerData.name && !customerData.nachname) {
          errors.push(`Zeile ${i + 2}: Kein Name gefunden`);
          continue;
        }

        // Check for duplicates if requested
        if (skipDuplicates === 'true' && customerData.kundennummer) {
          const existing = getCustomerByKundennummer.get(customerData.kundennummer);
          if (existing) {
            skipped++;
            continue;
          }
        }

        insertCustomer.run({
          kundennummer: customerData.kundennummer || null,
          name: customerData.name || '',
          vorname: customerData.vorname || null,
          nachname: customerData.nachname || null,
          strasse: customerData.strasse || null,
          hr: customerData.hr || null,
          plz: customerData.plz || null,
          ort: customerData.ort || null,
          telefon: customerData.telefon || null,
          email: customerData.email || null,
          bemerkung: customerData.bemerkung || null
        });

        imported++;
      } catch (e) {
        errors.push(`Zeile ${i + 2}: ${e.message}`);
      }
    }

    res.json({
      ok: true,
      imported,
      skipped,
      errors: errors.slice(0, 10) // Limit errors to prevent huge responses
    });
  } catch (e) {
    res.status(500).json({ error: 'Fehler beim Verarbeiten der Datei: ' + e.message });
  }
});

module.exports = router;
