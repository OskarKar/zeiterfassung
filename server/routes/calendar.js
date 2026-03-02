const express = require('express');
const ical = require('node-ical');
const router = express.Router();

// GET /api/calendar/events - get calendar events for a specific date
router.get('/events', async (req, res) => {
  const { getSettings } = req.app.locals;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' });
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  try {
    const settings = getSettings();
    const icalUrl = settings.calendar_ical_url;

    if (!icalUrl) {
      return res.json([]); // No calendar configured, return empty array
    }

    // Fetch iCal data
    const events = await ical.async.fromURL(icalUrl);
    
    // Filter events for the specified date
    const targetDate = new Date(date);
    const targetDateStart = new Date(targetDate);
    targetDateStart.setHours(0, 0, 0, 0);
    const targetDateEnd = new Date(targetDate);
    targetDateEnd.setHours(23, 59, 59, 999);

    const filteredEvents = [];

    Object.values(events).forEach(event => {
      // Skip non-VEVENT items
      if (event.type !== 'VEVENT') return;

      // Handle different date formats
      let eventStart, eventEnd;
      
      if (event.start) {
        if (typeof event.start === 'string') {
          eventStart = new Date(event.start);
        } else if (event.start instanceof Date) {
          eventStart = event.start;
        } else {
          eventStart = new Date(event.start);
        }
      }

      if (event.end) {
        if (typeof event.end === 'string') {
          eventEnd = new Date(event.end);
        } else if (event.end instanceof Date) {
          eventEnd = event.end;
        } else {
          eventEnd = new Date(event.end);
        }
      }

      // Check if event overlaps with target date
      if (eventStart && eventStart <= targetDateEnd && (!eventEnd || eventEnd >= targetDateStart)) {
        // Extract address from description or title if available
        let address = '';
        let title = event.summary || '';

        // Try to extract address from description
        if (event.description) {
          // Look for address patterns (e.g., "Straße 123, PLZ Ort")
          const addressRegex = /([^,\n]+,\s*\d{4,5}\s+[^,\n]+)/;
          const match = event.description.match(addressRegex);
          if (match) {
            address = match[1].trim();
          }
        }

        // Try to extract address from title
        if (!address && title) {
          const addressRegex = /([^,\n]+,\s*\d{4,5}\s+[^,\n]+)/;
          const match = title.match(addressRegex);
          if (match) {
            address = match[1].trim();
            // Remove address from title
            title = title.replace(match[0], '').trim();
          }
        }

        filteredEvents.push({
          id: event.uid || `event-${Date.now()}-${Math.random()}`,
          title: title,
          description: event.description || '',
          address: address,
          start: eventStart.toISOString(),
          end: eventEnd ? eventEnd.toISOString() : null,
          allDay: !event.start || (event.start.getHours() === 0 && event.start.getMinutes() === 0)
        });
      }
    });

    // Sort events by start time
    filteredEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json(filteredEvents);
  } catch (error) {
    console.error('Calendar fetch error:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Kalenderdaten: ' + error.message });
  }
});

// GET /api/calendar/employee/:employeeId/events - get calendar events for a specific employee
router.get('/employee/:employeeId/events', async (req, res) => {
  const { getEmployeeById } = req.app.locals;
  const { employeeId } = req.params;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' });
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  try {
    const employee = getEmployeeById.get(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const icalUrl = employee.calendar_ical_url;

    if (!icalUrl) {
      return res.json([]); // No calendar configured for this employee
    }

    // Fetch iCal data
    const events = await ical.async.fromURL(icalUrl);
    
    // Filter events for the specified date
    const targetDate = new Date(date);
    const targetDateStart = new Date(targetDate);
    targetDateStart.setHours(0, 0, 0, 0);
    const targetDateEnd = new Date(targetDate);
    targetDateEnd.setHours(23, 59, 59, 999);

    const filteredEvents = [];

    Object.values(events).forEach(event => {
      if (event.type !== 'VEVENT') return;

      let eventStart, eventEnd;
      
      if (event.start) {
        eventStart = event.start instanceof Date ? event.start : new Date(event.start);
      }

      if (event.end) {
        eventEnd = event.end instanceof Date ? event.end : new Date(event.end);
      }

      if (eventStart && eventStart <= targetDateEnd && (!eventEnd || eventEnd >= targetDateStart)) {
        let address = '';
        let title = event.summary || '';

        if (event.description) {
          const addressRegex = /([^,\n]+,\s*\d{4,5}\s+[^,\n]+)/;
          const match = event.description.match(addressRegex);
          if (match) address = match[1].trim();
        }

        if (!address && title) {
          const addressRegex = /([^,\n]+,\s*\d{4,5}\s+[^,\n]+)/;
          const match = title.match(addressRegex);
          if (match) {
            address = match[1].trim();
            title = title.replace(match[0], '').trim();
          }
        }

        filteredEvents.push({
          id: event.uid || `event-${Date.now()}-${Math.random()}`,
          title: title,
          description: event.description || '',
          address: address,
          start: eventStart.toISOString(),
          end: eventEnd ? eventEnd.toISOString() : null,
          start_time: eventStart.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
          end_time: eventEnd ? eventEnd.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '',
          allDay: !event.start || (eventStart.getHours() === 0 && eventStart.getMinutes() === 0)
        });
      }
    });

    filteredEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json(filteredEvents);
  } catch (error) {
    console.error('Calendar fetch error:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Kalenderdaten: ' + error.message });
  }
});

module.exports = router;
