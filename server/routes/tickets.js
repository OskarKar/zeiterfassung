const express = require('express');
const router = express.Router();

// GET /api/tickets - list all tickets with filters
router.get('/', (req, res) => {
  const { getTickets, getTicketsByStatus, getTicketsByEmployee } = req.app.locals;
  const { status, employee_id } = req.query;

  try {
    let tickets;
    if (status) {
      tickets = getTicketsByStatus.all(status);
    } else if (employee_id) {
      tickets = getTicketsByEmployee.all(employee_id);
    } else {
      tickets = getTickets.all();
    }
    res.json(tickets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tickets/:id - get single ticket
router.get('/:id', (req, res) => {
  const { getTicketById } = req.app.locals;
  try {
    const ticket = getTicketById.get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket nicht gefunden' });
    res.json(ticket);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tickets - create new ticket
router.post('/', (req, res) => {
  const { insertTicket } = req.app.locals;
  const { 
    employee_id, entry_id, tour_id, customer_id, 
    calendar_event_title, calendar_event_address, calendar_event_datetime,
    ticket_type, notiz 
  } = req.body;

  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id erforderlich' });
  }

  const validTypes = ['dichtheit', 'terminwunsch', 'zusatzarbeit', 'mangel', 'sonstiges'];
  if (!validTypes.includes(ticket_type)) {
    return res.status(400).json({ error: 'Ungültiger Ticket-Typ' });
  }

  try {
    const result = insertTicket.run({
      employee_id,
      entry_id: entry_id || null,
      tour_id: tour_id || null,
      customer_id: customer_id || null,
      calendar_event_title: calendar_event_title || null,
      calendar_event_address: calendar_event_address || null,
      calendar_event_datetime: calendar_event_datetime || null,
      ticket_type,
      notiz: notiz || null,
      status: 'offen'
    });
    res.json({ id: result.lastInsertRowid, ...req.body, status: 'offen' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/tickets/:id - update ticket (close with befund)
router.put('/:id', (req, res) => {
  const { updateTicket, db } = req.app.locals;
  const { ticket_type, notiz, befund, status, closed_by } = req.body;

  if (status && !['offen', 'in_bearbeitung', 'erledigt'].includes(status)) {
    return res.status(400).json({ error: 'Ungültiger Status' });
  }

  if (ticket_type) {
    const validTypes = ['dichtheit', 'terminwunsch', 'zusatzarbeit', 'mangel', 'sonstiges'];
    if (!validTypes.includes(ticket_type)) {
      return res.status(400).json({ error: 'Ungültiger Ticket-Typ' });
    }
  }

  try {
    // Fetch existing ticket to preserve fields not being updated
    const existing = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Ticket nicht gefunden' });
    }

    const updateData = {
      id: req.params.id,
      ticket_type: ticket_type || existing.ticket_type,
      notiz: notiz !== undefined ? notiz : existing.notiz,
      befund: befund !== undefined ? befund : existing.befund,
      status: status || existing.status,
      closed_at: status === 'erledigt' ? new Date().toISOString() : existing.closed_at,
      closed_by: status === 'erledigt' ? (closed_by || null) : existing.closed_by
    };

    updateTicket.run(updateData);
    res.json({ ok: true, ...updateData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tickets/:id - delete ticket
router.delete('/:id', (req, res) => {
  const { deleteTicket } = req.app.locals;
  try {
    deleteTicket.run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
