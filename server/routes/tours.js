const express = require('express');
const router = express.Router();

// GET /api/tours - list all tours
router.get('/', (req, res) => {
  const { getTours, parseJsonArray } = req.app.locals;
  try {
    const tours = getTours.all();
    // Parse mitarbeiter_ids for each tour
    const toursWithParsedEmployees = tours.map(tour => ({
      ...tour,
      mitarbeiter_ids: parseJsonArray(tour.mitarbeiter_ids)
    }));
    res.json(toursWithParsedEmployees);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tours/:id - get single tour with customers
router.get('/:id', (req, res) => {
  const { getTourById, getTourCustomers, parseJsonArray } = req.app.locals;
  try {
    const tour = getTourById.get(req.params.id);
    if (!tour) return res.status(404).json({ error: 'Tour nicht gefunden' });

    const customers = getTourCustomers.all(req.params.id);
    
    res.json({
      ...tour,
      mitarbeiter_ids: parseJsonArray(tour.mitarbeiter_ids),
      customers
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tours - create new tour
router.post('/', (req, res) => {
  const { insertTour, stringifyJsonArray } = req.app.locals;
  const { name, beschreibung, turnus = 'taeglich', mitarbeiter_ids = [] } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Tour-Name erforderlich' });
  }

  const validTurnus = ['taeglich', 'woechentlich', 'monatlich', 'jaehrlich'];
  if (!validTurnus.includes(turnus)) {
    return res.status(400).json({ error: 'Ungültiger Turnus' });
  }

  try {
    const result = insertTour.run({
      name,
      beschreibung: beschreibung || null,
      turnus,
      mitarbeiter_ids: stringifyJsonArray(mitarbeiter_ids)
    });
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/tours/:id - update tour
router.put('/:id', (req, res) => {
  const { updateTour, stringifyJsonArray } = req.app.locals;
  const { name, beschreibung, turnus, mitarbeiter_ids } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Tour-Name erforderlich' });
  }

  if (turnus) {
    const validTurnus = ['taeglich', 'woechentlich', 'monatlich', 'jaehrlich'];
    if (!validTurnus.includes(turnus)) {
      return res.status(400).json({ error: 'Ungültiger Turnus' });
    }
  }

  try {
    updateTour.run({
      id: req.params.id,
      name,
      beschreibung: beschreibung || null,
      turnus: turnus || 'taeglich',
      mitarbeiter_ids: stringifyJsonArray(mitarbeiter_ids || [])
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tours/:id - delete tour
router.delete('/:id', (req, res) => {
  const { deleteTour } = req.app.locals;
  try {
    deleteTour.run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tours/:id/customers - add customer to tour
router.post('/:id/customers', (req, res) => {
  const { addCustomerToTour } = req.app.locals;
  const { customer_id, reihenfolge = 0 } = req.body;

  if (!customer_id) {
    return res.status(400).json({ error: 'customer_id erforderlich' });
  }

  try {
    addCustomerToTour.run({
      tour_id: req.params.id,
      customer_id,
      reihenfolge
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tours/:id/customers/:customer_id - remove customer from tour
router.delete('/:id/customers/:customer_id', (req, res) => {
  const { removeCustomerFromTour } = req.app.locals;
  try {
    removeCustomerFromTour.run(req.params.id, req.params.customer_id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
