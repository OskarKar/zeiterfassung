// ==================== STATE ====================
const state = {
  employees: [],
  settings: {},
  currentUser: null,   // { id, name, is_boss }
  isBoss: false,
  activeTab: 'erfassung',
  entries: [],
  filterMonth: new Date().toISOString().slice(0, 7),
  filterEmployee: '',
  typingTimeout: null,
  editingEntryId: null,
  appVersion: '',
};

const socket = io();

// ==================== API HELPERS ====================
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ==================== INIT ====================
async function init() {
  const [emps, settings, ver] = await Promise.all([
    api('GET', '/employees'),
    api('GET', '/settings'),
    api('GET', '/version').catch(() => ({ version: '?' })),
  ]);
  state.employees = emps;
  state.settings = settings;
  state.appVersion = ver.version || '?';
  render();
}

// ==================== SOCKET EVENTS ====================
socket.on('employee_typing', (data) => {
  const banner = document.getElementById('typing-banner');
  if (banner) {
    banner.textContent = `⚠️ Achtung: ${data.employeeName} gibt gerade Zeiten ein.`;
    banner.classList.remove('hidden');
  }
});

socket.on('employee_stopped', () => {
  const banner = document.getElementById('typing-banner');
  if (banner) banner.classList.add('hidden');
});

socket.on('entry_saved', (data) => {
  const banner = document.getElementById('typing-banner');
  if (banner) banner.classList.add('hidden');
  // Reload entries if boss is viewing
  if (state.isBoss && state.activeTab === 'alle') {
    loadAndRenderEntries();
  }
});

// ==================== RENDER ROOT ====================
function render() {
  const app = document.getElementById('app');
  if (!state.currentUser && !state.isBoss) {
    app.innerHTML = renderLogin();
  } else {
    app.innerHTML = renderMain();
    if (state.activeTab === 'alle' || state.activeTab === 'uebersicht') {
      loadAndRenderEntries();
    }
  }
  attachListeners();
}

// ==================== LOGIN ====================
function renderLogin() {
  return `
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-700 p-4">
    <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">⏱️</div>
        <h1 class="text-3xl font-bold text-gray-800">Zeiterfassung</h1>
        <p class="text-gray-500 mt-1">Bitte anmelden</p>
      </div>

      ${state.employees.filter(e => !e.is_boss).length > 0 ? `
      <div class="mb-6">
        <label class="block text-sm font-semibold text-gray-600 mb-2">Als Mitarbeiter anmelden:</label>
        <div class="flex flex-col gap-2" id="employee-list">
          ${state.employees.filter(e => !e.is_boss).map(emp => `
            <button data-action="login-emp" data-id="${emp.id}" data-name="${emp.name}"
              class="w-full py-3 px-4 bg-gray-50 border-2 border-gray-200 rounded-xl text-left font-medium
                     hover:border-blue-400 hover:bg-blue-50 transition-all">
              👤 ${emp.name}
            </button>
          `).join('')}
        </div>
      </div>
      <hr class="my-5 border-gray-200">
      ` : `
      <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        Noch keine Mitarbeiter angelegt. Bitte zuerst als Admin anmelden.
      </div>
      `}

      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-2">Admin-Login (Chef):</label>
        <input type="password" id="boss-pin" placeholder="PIN eingeben"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition mb-3" />
        <button data-action="login-boss"
          class="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition">
          🔐 Als Admin (Chef) anmelden
        </button>
      </div>
    </div>
  </div>`;
}

// ==================== MAIN APP ====================
function renderMain() {
  const tabs = [
    { id: 'erfassung', label: '➕ Erfassung', always: true },
    { id: 'uebersicht', label: '📋 Meine Einträge', always: true },
    { id: 'alle', label: '📊 Alle Einträge', boss: true },
    { id: 'mitarbeiter', label: '👥 Mitarbeiter', boss: true },
    { id: 'import', label: '📂 Daten importieren', boss: true },
    { id: 'export', label: '📥 Export', boss: true },
    { id: 'statistik', label: '📈 Statistik & Analyse', boss: true },
    { id: 'auditlog', label: '📝 Änderungsprotokoll', boss: true },
    { id: 'einstellungen', label: '⚙️ Einstellungen', boss: true },
  ].filter(t => t.always || (t.boss && state.isBoss));

  return `
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <header class="bg-gradient-to-r from-blue-600 to-purple-700 text-white shadow-lg">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-2xl">⏱️</span>
          <h1 class="text-xl font-bold">Zeiterfassung</h1>
        </div>
        <div class="flex items-center gap-4">
          <span class="bg-white/20 px-3 py-1 rounded-full text-sm font-medium">
            ${state.isBoss ? '🔐 Admin' : `👤 ${state.currentUser.name}`}
          </span>
          ${state.isBoss ? `<span class="bg-white/10 px-2 py-1 rounded-full text-xs text-white/70 font-mono">v${state.appVersion}</span>` : ''}
          <button data-action="logout" class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-sm transition">
            Abmelden
          </button>
        </div>
      </div>
    </header>

    <!-- Typing banner (boss only) -->
    ${state.isBoss ? `
    <div id="typing-banner"
      class="hidden fade-in bg-amber-400 text-amber-900 font-semibold text-center py-2 text-sm">
    </div>` : ''}

    <div class="max-w-6xl mx-auto px-4 py-6">
      <!-- Tabs -->
      <div class="flex gap-2 flex-wrap mb-6">
        ${tabs.map(t => `
          <button data-action="tab" data-tab="${t.id}"
            class="px-4 py-2 rounded-xl font-medium text-sm transition
              ${state.activeTab === t.id
                ? 'bg-blue-600 text-white shadow'
                : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'}">
            ${t.label}
          </button>
        `).join('')}
      </div>

      <!-- Tab Content -->
      <div class="bg-white rounded-2xl shadow-sm p-6">
        ${state.activeTab === 'erfassung' ? renderErfassung() : ''}
        ${state.activeTab === 'uebersicht' ? renderUebersicht() : ''}
        ${state.activeTab === 'alle' && state.isBoss ? renderAlle() : ''}
        ${state.activeTab === 'mitarbeiter' && state.isBoss ? renderMitarbeiter() : ''}
        ${state.activeTab === 'import' && state.isBoss ? renderImport() : ''}
        ${state.activeTab === 'export' && state.isBoss ? renderExport() : ''}
        ${state.activeTab === 'statistik' && state.isBoss ? renderStatistik() : ''}
        ${state.activeTab === 'auditlog'  && state.isBoss ? renderAuditLog() : ''}
        ${state.activeTab === 'einstellungen' && state.isBoss ? renderEinstellungen() : ''}
      </div>
    </div>
  </div>`;
}

// ==================== ERFASSUNG TAB ====================
function renderErfassung() {
  const today = new Date().toISOString().slice(0, 10);
  const categories = [
    { value: 'kehrtour', label: 'Kehrtour (Außendienst)' },
    { value: 'buero', label: 'Büro' },
    { value: 'krankenstand', label: 'Krankenstand' },
    { value: 'urlaub', label: 'Urlaub' },
    { value: 'betriebsurlaub', label: 'Betriebsurlaub' },
    { value: 'fortbildung', label: 'Fortbildung' },
    { value: 'feiertag', label: 'Feiertag' },
  ];

  return `
  <h2 class="text-xl font-bold text-gray-800 mb-6">➕ Arbeitszeit erfassen</h2>

  <form id="entry-form" class="space-y-4" novalidate>
    ${state.isBoss ? `
    <div class="grid grid-cols-1 gap-4">
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Mitarbeiter *</label>
        <select name="employee_id" id="f-employee" required
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500">
          <option value="">-- Bitte wählen --</option>
          ${state.employees.filter(e => !e.is_boss).map(emp => `
            <option value="${emp.id}">${emp.name}</option>
          `).join('')}
        </select>
      </div>
    </div>` : ''}

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Datum *</label>
        <input type="date" name="date" id="f-date" value="${today}" required
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Kategorie *</label>
        <select name="category" id="f-category" required
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500">
          ${categories.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Abfahrt / Start</label>
        <input type="time" name="start_time" id="f-start" value="05:00"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Ankunft / Ende</label>
        <input type="time" name="end_time" id="f-end" value="13:00"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Trinkgeld (€)</label>
        <input type="number" name="tip" id="f-tip" value="0" min="0" step="0.01"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Beschreibung / Tour</label>
        <input type="text" name="description" id="f-desc" placeholder="z.B. Spf4x11, Umg3x02 …"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
      </div>
    </div>

    <div class="flex items-center gap-3">
      <input type="checkbox" name="is_outside" id="f-outside" checked
        class="w-5 h-5 accent-blue-600" />
      <label for="f-outside" class="text-sm font-medium text-gray-700">
        Außendienst (Arbeit außerhalb des Büros)
      </label>
    </div>

    <div class="pt-2">
      <button type="submit"
        class="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3 rounded-xl transition shadow-sm">
        💾 Eintrag speichern
      </button>
    </div>
  </form>`;
}

// ==================== ÜBERSICHT TAB ====================
function renderUebersicht() {
  return `
  <h2 class="text-xl font-bold text-gray-800 mb-4">📋 Meine Einträge</h2>
  <div class="flex gap-3 mb-4 items-end">
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Monat</label>
      <input type="month" id="my-month" value="${state.filterMonth}"
        class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm" />
    </div>
    <button data-action="load-my-entries"
      class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
      Anzeigen
    </button>
  </div>
  <div id="entries-content">
    <p class="text-gray-400 text-sm">Lade Einträge…</p>
  </div>`;
}

// ==================== ALLE EINTRÄGE TAB ====================
function renderAlle() {
  return `
  <h2 class="text-xl font-bold text-gray-800 mb-4">📊 Alle Einträge</h2>
  <div class="flex gap-3 mb-4 flex-wrap items-end">
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Monat</label>
      <input type="month" id="filter-month" value="${state.filterMonth}"
        class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm" />
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Mitarbeiter</label>
      <select id="filter-emp"
        class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm">
        <option value="">Alle</option>
        ${state.employees.filter(e => !e.is_boss).map(emp => `
          <option value="${emp.id}" ${state.filterEmployee == emp.id ? 'selected' : ''}>${emp.name}</option>
        `).join('')}
      </select>
    </div>
    <button data-action="load-all-entries"
      class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
      Filtern
    </button>
  </div>
  <div id="entries-content">
    <p class="text-gray-400 text-sm">Lade Einträge…</p>
  </div>`;
}

// ==================== MITARBEITER TAB ====================
function renderMitarbeiter() {
  return `
  <h2 class="text-xl font-bold text-gray-800 mb-6">👥 Mitarbeiterverwaltung</h2>

  <!-- Neuer Mitarbeiter anlegen -->
  <div class="border border-gray-200 rounded-xl p-5 mb-6">
    <h3 class="font-semibold text-gray-700 mb-4">➕ Neuen Mitarbeiter anlegen</h3>
    <form id="new-emp-form" class="grid grid-cols-1 md:grid-cols-2 gap-4" novalidate>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Vorname *</label>
        <input type="text" name="vorname" placeholder="Max"
          class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Nachname *</label>
        <input type="text" name="nachname" placeholder="Mustermann"
          class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Anzeigenam (Kürzel)</label>
        <input type="text" name="name" placeholder="Wird automatisch aus Vor+Nachname gebildet"
          class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
        <div class="text-xs text-gray-400 mt-0.5">Leer lassen = Nachname wird verwendet</div>
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Geburtsdatum</label>
        <input type="date" name="geburtsdatum"
          class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Passwort (für App-Login)</label>
        <input type="password" name="password" placeholder="Leer = kein Passwort erforderlich"
          class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>
      <div class="flex items-end">
        <button type="submit"
          class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-4 rounded-xl transition text-sm">
          ➕ Mitarbeiter anlegen
        </button>
      </div>
    </form>
  </div>

  <!-- Mitarbeiterliste -->
  <div id="emp-list-container">
  ${state.employees.filter(e => !e.is_boss).length === 0 ? `
    <div class="text-center py-8 text-gray-400">Noch keine Mitarbeiter angelegt.</div>
  ` : `
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b-2 border-gray-100">
            <th class="text-left py-3 px-2 text-gray-500 font-semibold">Name</th>
            <th class="text-left py-3 px-2 text-gray-500 font-semibold">Geburtsdatum</th>
            <th class="text-left py-3 px-2 text-gray-500 font-semibold">Passwort</th>
            <th class="py-3 px-2"></th>
          </tr>
        </thead>
        <tbody>
          ${state.employees.filter(e => !e.is_boss).map(emp => `
            <tr class="border-b border-gray-100 hover:bg-gray-50" id="emp-row-${emp.id}">
              <td class="py-3 px-2">
                <div class="font-medium">${emp.name}</div>
                <div class="text-xs text-gray-400">${[emp.vorname, emp.nachname].filter(Boolean).join(' ') || ''}</div>
              </td>
              <td class="py-3 px-2 text-gray-500 text-xs">${emp.geburtsdatum ? new Date(emp.geburtsdatum).toLocaleDateString('de-DE') : '—'}</td>
              <td class="py-3 px-2 text-xs">${emp.password_hash !== undefined ? '<span class="text-green-600">✅ gesetzt</span>' : '<span class="text-gray-400">— keines</span>'}</td>
              <td class="py-3 px-2 text-right flex gap-2 justify-end">
                <button data-action="edit-employee" data-id="${emp.id}"
                  class="text-blue-600 hover:text-blue-800 font-medium text-xs px-3 py-1 rounded-lg hover:bg-blue-50 transition">
                  ✏️ Bearbeiten
                </button>
                <button data-action="delete-employee" data-id="${emp.id}"
                  class="text-red-500 hover:text-red-700 font-medium text-xs px-3 py-1 rounded-lg hover:bg-red-50 transition">
                  🗑️ Löschen
                </button>
              </td>
            </tr>
            <tr id="emp-edit-row-${emp.id}" class="hidden">
              <td colspan="4" class="px-2 pb-4">
                <form id="edit-emp-form-${emp.id}" data-id="${emp.id}" class="bg-gray-50 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Vorname</label>
                    <input type="text" name="vorname" value="${emp.vorname || ''}"
                      class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Nachname</label>
                    <input type="text" name="nachname" value="${emp.nachname || ''}"
                      class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Anzeigename</label>
                    <input type="text" name="name" value="${emp.name || ''}"
                      class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Geburtsdatum</label>
                    <input type="date" name="geburtsdatum" value="${emp.geburtsdatum || ''}"
                      class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-500 mb-1">Neues Passwort (leer = unverändert)</label>
                    <input type="password" name="password" placeholder="Leer lassen um Passwort zu behalten"
                      class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div class="flex items-end gap-2">
                    <button type="submit"
                      class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-xl transition text-sm">
                      💾 Speichern
                    </button>
                    <button type="button" data-action="cancel-edit-employee" data-id="${emp.id}"
                      class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-3 rounded-xl transition text-sm">
                      Abbrechen
                    </button>
                  </div>
                </form>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `}
  </div>`;
}

// ==================== AUDIT LOG TAB ====================
function renderAuditLog() {
  return `
  <h2 class="text-xl font-bold text-gray-800 mb-2">📝 Änderungsprotokoll</h2>
  <p class="text-sm text-gray-500 mb-5">Alle Anlage-, Änderungs- und Löschvorgänge werden automatisch erfasst.</p>

  <div class="flex gap-3 mb-4 items-end flex-wrap">
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Anzahl Einträge</label>
      <select id="audit-limit" class="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
        <option value="50">50</option>
        <option value="100">100</option>
        <option value="200" selected>200</option>
      </select>
    </div>
    <button data-action="load-audit-log"
      class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
      Laden
    </button>
  </div>

  <div id="audit-log-result">
    <p class="text-gray-400 text-sm">Klicke auf "Laden" um das Protokoll anzuzeigen.</p>
  </div>`;
}

// ==================== EXPORT TAB ====================
function renderExport() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return `
  <h2 class="text-xl font-bold text-gray-800 mb-6">📥 PDF Export</h2>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <div>
      <label class="block text-sm font-semibold text-gray-600 mb-1">Monat</label>
      <input type="month" id="exp-month" value="${currentMonth}"
        class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
    </div>
    <div>
      <label class="block text-sm font-semibold text-gray-600 mb-1">Mitarbeiter</label>
      <select id="exp-employee"
        class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500">
        <option value="">Alle Mitarbeiter</option>
        ${state.employees.filter(e => !e.is_boss).map(emp => `
          <option value="${emp.id}">${emp.name}</option>
        `).join('')}
      </select>
    </div>
    <div class="flex items-end">
      <button data-action="export-pdf"
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-xl transition">
        📄 PDF herunterladen
      </button>
    </div>
  </div>

  <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
    <strong>Format:</strong> Monatsbericht im Lohnverrechnungs-Format mit allen Tagen,
    Abfahrt/Ankunft, Stunden, Taggeld und Trinkgeld. Inklusive Summenzeile und Unterschriftsfeldern.
  </div>`;
}

// ==================== EINSTELLUNGEN TAB ====================
function renderEinstellungen() {
  const s = state.settings;
  return `
  <h2 class="text-xl font-bold text-gray-800 mb-6">⚙️ Einstellungen</h2>

  <form id="settings-form" class="space-y-4 max-w-lg">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Admin-PIN</label>
        <input type="password" name="boss_pin" value="${s.boss_pin || ''}"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Taggeld-Satz (€/Std.)</label>
        <input type="number" name="taggeld_satz" value="${s.taggeld_satz || 1.27}" step="0.01" min="0"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Pausengrenze (Stunden)</label>
        <input type="number" name="break_threshold_hours" value="${s.break_threshold_hours || 6}" step="0.5" min="0"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Pausendauer (Minuten)</label>
        <input type="number" name="break_duration_minutes" value="${s.break_duration_minutes || 30}" min="0"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500" />
      </div>
    </div>

    <button type="submit"
      class="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3 rounded-xl transition">
      💾 Speichern
    </button>
  </form>`;
}

// ==================== ENTRIES TABLE RENDER ====================
function renderEntriesTable(entries, showEmployee = false, allowDelete = false) {
  if (entries.length === 0) {
    return `<div class="text-center py-8 text-gray-400">Keine Einträge für diesen Zeitraum.</div>`;
  }

  const catLabels = {
    kehrtour: 'Kehrtour', buero: 'Büro', krankenstand: 'Krankenstand',
    urlaub: 'Urlaub', betriebsurlaub: 'Betriebsurlaub',
    fortbildung: 'Fortbildung', feiertag: 'Feiertag',
  };

  const totalNet = entries.reduce((s, e) => s + (e.net_minutes || 0), 0);
  const totalTip = entries.reduce((s, e) => s + (e.tip || 0), 0);
  const workDays = new Set(entries.map(e => e.date)).size;

  return `
  <!-- Summary cards -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
    <div class="bg-gray-50 rounded-xl p-3 text-center">
      <div class="text-xs text-gray-500 uppercase font-semibold mb-1">Arbeitstage</div>
      <div class="text-2xl font-bold text-gray-800">${workDays}</div>
    </div>
    <div class="bg-blue-50 rounded-xl p-3 text-center">
      <div class="text-xs text-blue-500 uppercase font-semibold mb-1">Gesamtstunden</div>
      <div class="text-2xl font-bold text-blue-700">${(totalNet / 60).toFixed(2)}</div>
    </div>
    <div class="bg-gray-50 rounded-xl p-3 text-center">
      <div class="text-xs text-gray-500 uppercase font-semibold mb-1">Einträge</div>
      <div class="text-2xl font-bold text-gray-800">${entries.length}</div>
    </div>
    <div class="bg-green-50 rounded-xl p-3 text-center">
      <div class="text-xs text-green-600 uppercase font-semibold mb-1">Trinkgeld</div>
      <div class="text-2xl font-bold text-green-700">€ ${totalTip.toFixed(2)}</div>
    </div>
  </div>

  <!-- Table -->
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b-2 border-gray-100 text-gray-500 font-semibold">
          <th class="text-left py-2 px-2">Datum</th>
          ${showEmployee ? '<th class="text-left py-2 px-2">Mitarbeiter</th>' : ''}
          <th class="text-left py-2 px-2">Kategorie</th>
          <th class="text-left py-2 px-2">Zeit</th>
          <th class="text-right py-2 px-2">Stunden</th>
          <th class="text-right py-2 px-2">Trinkgeld</th>
          <th class="text-left py-2 px-2">Beschreibung</th>
          ${allowDelete ? '<th class="py-2 px-2"></th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${entries.map(e => `
          <tr class="border-b border-gray-50 hover:bg-gray-50">
            <td class="py-2 px-2 font-medium">
              ${new Date(e.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
            </td>
            ${showEmployee ? `<td class="py-2 px-2">${e.employee_name || ''}</td>` : ''}
            <td class="py-2 px-2">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium ${categoryBadge(e.category)}">
                ${catLabels[e.category] || e.category}
              </span>
            </td>
            <td class="py-2 px-2 text-gray-600">${e.start_time || '—'} – ${e.end_time || '—'}</td>
            <td class="py-2 px-2 text-right font-mono">${e.net_minutes ? (e.net_minutes / 60).toFixed(2) : '—'}</td>
            <td class="py-2 px-2 text-right text-green-700">${e.tip > 0 ? `€ ${e.tip.toFixed(2)}` : '—'}</td>
            <td class="py-2 px-2 text-gray-500">${e.description || '—'}</td>
            ${allowDelete ? `
              <td class="py-2 px-2">
                <button data-action="delete-entry" data-id="${e.id}"
                  class="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 transition">
                  🗑️
                </button>
              </td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
}

function categoryBadge(cat) {
  const map = {
    kehrtour: 'bg-blue-100 text-blue-700',
    buero: 'bg-gray-100 text-gray-700',
    krankenstand: 'bg-red-100 text-red-700',
    urlaub: 'bg-green-100 text-green-700',
    betriebsurlaub: 'bg-yellow-100 text-yellow-700',
    fortbildung: 'bg-purple-100 text-purple-700',
    feiertag: 'bg-orange-100 text-orange-700',
  };
  return map[cat] || 'bg-gray-100 text-gray-700';
}

// ==================== DATA LOADERS ====================
async function loadAndRenderEntries() {
  const container = document.getElementById('entries-content');
  if (!container) return;

  try {
    let entries;
    if (state.activeTab === 'uebersicht') {
      const monthEl = document.getElementById('my-month');
      const month = monthEl ? monthEl.value : state.filterMonth;
      const empId = state.isBoss ? '' : state.currentUser.id;
      const qs = empId ? `?month=${month}&employee_id=${empId}` : `?month=${month}`;
      entries = await api('GET', `/entries${qs}`);
      container.innerHTML = renderEntriesTable(entries, state.isBoss, state.isBoss);
    } else {
      const month = state.filterMonth;
      const empId = state.filterEmployee;
      const qs = empId ? `?month=${month}&employee_id=${empId}` : `?month=${month}`;
      entries = await api('GET', `/entries${qs}`);
      container.innerHTML = renderEntriesTable(entries, true, true);
    }
    attachListeners();
  } catch (e) {
    if (container) container.innerHTML = `<div class="text-red-500 text-sm">Fehler: ${e.message}</div>`;
  }
}

// ==================== EVENT LISTENERS ====================
function attachListeners() {
  // Delegated click handler
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', handleAction);
  });

  // Entry form submission
  const entryForm = document.getElementById('entry-form');
  if (entryForm) {
    entryForm.addEventListener('submit', handleSaveEntry);
    // Typing indicator
    entryForm.querySelectorAll('input, select, textarea').forEach(input => {
      input.addEventListener('input', handleTyping);
    });
  }

  // Settings form
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', handleSaveSettings);
  }

  // New employee form
  const newEmpForm = document.getElementById('new-emp-form');
  if (newEmpForm) {
    newEmpForm.addEventListener('submit', handleAddEmployee);
  }

  // Edit employee forms (inline)
  document.querySelectorAll('[id^="edit-emp-form-"]').forEach(form => {
    form.addEventListener('submit', handleUpdateEmployee);
  });

  // Filter buttons
  const myMonthInput = document.getElementById('my-month');
  if (myMonthInput) {
    myMonthInput.addEventListener('change', () => {
      state.filterMonth = myMonthInput.value;
      loadAndRenderEntries();
    });
  }

  // Excel import file picker
  const importFileInput = document.getElementById('import-excel-file');
  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleExcelImport(file);
      e.target.value = '';
    });
  }
}

function handleTyping() {
  if (!state.currentUser) return;
  socket.emit('typing_start', {
    employeeId: state.currentUser.id,
    employeeName: state.currentUser.name,
  });
  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(() => {
    socket.emit('typing_stop', { employeeId: state.currentUser.id });
  }, 3000);
}

async function handleAction(e) {
  const action = e.currentTarget.dataset.action;

  switch (action) {
    case 'login-emp': {
      const id = parseInt(e.currentTarget.dataset.id);
      const name = e.currentTarget.dataset.name;
      state.currentUser = { id, name, is_boss: 0 };
      state.isBoss = false;
      state.activeTab = 'erfassung';
      render();
      break;
    }
    case 'login-boss':
      await handleBossLogin();
      break;
    case 'logout':
      socket.emit('typing_stop', { employeeId: state.currentUser?.id });
      state.currentUser = null;
      state.isBoss = false;
      state.activeTab = 'erfassung';
      render();
      break;
    case 'tab':
      state.activeTab = e.currentTarget.dataset.tab;
      render();
      break;
    case 'add-employee':
      await handleAddEmployee();
      break;
    case 'edit-employee': {
      const id = e.currentTarget.dataset.id;
      document.getElementById(`emp-edit-row-${id}`)?.classList.toggle('hidden');
      break;
    }
    case 'cancel-edit-employee': {
      const id = e.currentTarget.dataset.id;
      document.getElementById(`emp-edit-row-${id}`)?.classList.add('hidden');
      break;
    }
    case 'delete-employee':
      await handleDeleteEmployee(e.currentTarget.dataset.id);
      break;
    case 'load-audit-log':
      await handleLoadAuditLog();
      break;
    case 'delete-entry':
      await handleDeleteEntry(e.currentTarget.dataset.id);
      break;
    case 'load-my-entries':
    case 'load-all-entries': {
      const monthEl = document.getElementById('filter-month') || document.getElementById('my-month');
      const empEl = document.getElementById('filter-emp');
      if (monthEl) state.filterMonth = monthEl.value;
      if (empEl) state.filterEmployee = empEl.value;
      loadAndRenderEntries();
      break;
    }
    case 'export-pdf':
      handleExportPDF();
      break;
    case 'import-excel-btn':
      document.getElementById('import-excel-file')?.click();
      break;
    case 'run-stats-weekday':
      await handleStatsWeekday();
      break;
    case 'run-stats-period':
      await handleStatsPeriod();
      break;
    case 'run-stats-tasks':
      await handleStatsTasks();
      break;
  }
}

async function handleBossLogin() {
  const pin = document.getElementById('boss-pin')?.value;
  if (!pin) return;
  try {
    await api('POST', '/auth/boss', { pin });
    state.isBoss = true;
    state.currentUser = { id: 0, name: 'Admin', is_boss: 1 };
    state.activeTab = 'alle';
    render();
  } catch {
    alert('Falscher PIN!');
  }
}

async function handleSaveEntry(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);

  const employee_id = state.isBoss
    ? parseInt(fd.get('employee_id'))
    : state.currentUser.id;

  if (!employee_id) {
    alert('Bitte Mitarbeiter auswählen.');
    return;
  }

  const payload = {
    employee_id,
    date: fd.get('date'),
    start_time: fd.get('start_time') || null,
    end_time: fd.get('end_time') || null,
    category: fd.get('category'),
    is_outside: form.querySelector('#f-outside')?.checked ? 1 : 0,
    tip: parseFloat(fd.get('tip')) || 0,
    description: fd.get('description') || '',
  };

  try {
    await api('POST', '/entries', payload);
    socket.emit('typing_stop', { employeeId: state.currentUser.id });
    showToast('✅ Eintrag gespeichert!');
    state.activeTab = 'uebersicht';
    render();
  } catch (err) {
    alert('Fehler: ' + err.message);
  }
}

async function handleAddEmployee(e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target || document.getElementById('new-emp-form');
  if (!form) return;
  const fd = new FormData(form);

  const vorname  = (fd.get('vorname')  || '').trim();
  const nachname = (fd.get('nachname') || '').trim();
  const nameRaw  = (fd.get('name')     || '').trim();
  const name     = nameRaw || nachname || (vorname + ' ' + nachname).trim();
  const geburtsdatum = fd.get('geburtsdatum') || '';
  const password     = fd.get('password') || '';

  if (!name) { alert('Bitte Vorname oder Nachname eingeben.'); return; }

  try {
    await api('POST', '/employees', { name, vorname, nachname, geburtsdatum, is_boss: 0, password });
    state.employees = await api('GET', '/employees');
    form.reset();
    showToast('✅ Mitarbeiter angelegt');
    render();
  } catch (err) {
    alert('Fehler: ' + err.message);
  }
}

async function handleUpdateEmployee(e) {
  e.preventDefault();
  const form = e.target;
  const id   = form.dataset.id;
  const fd   = new FormData(form);

  const vorname      = (fd.get('vorname')      || '').trim();
  const nachname     = (fd.get('nachname')     || '').trim();
  const nameRaw      = (fd.get('name')         || '').trim();
  const name         = nameRaw || nachname || (vorname + ' ' + nachname).trim();
  const geburtsdatum = fd.get('geburtsdatum') || '';
  const password     = fd.get('password') || '';

  if (!name) { alert('Bitte Anzeigename eingeben.'); return; }

  const payload = { name, vorname, nachname, geburtsdatum };
  if (password) payload.password = password;

  try {
    await api('PUT', `/employees/${id}`, payload);
    state.employees = await api('GET', '/employees');
    showToast('✅ Mitarbeiter gespeichert');
    render();
  } catch (err) {
    alert('Fehler: ' + err.message);
  }
}

async function handleDeleteEmployee(id) {
  const emp = state.employees.find(e => e.id == id);
  if (!confirm(`"${emp?.name}" wirklich löschen? Alle Einträge werden ebenfalls gelöscht.`)) return;
  try {
    await api('DELETE', `/employees/${id}`);
    state.employees = await api('GET', '/employees');
    showToast('🗑️ Mitarbeiter gelöscht');
    render();
  } catch (err) {
    alert('Fehler: ' + err.message);
  }
}

async function handleLoadAuditLog() {
  const limit = document.getElementById('audit-limit')?.value || 200;
  const container = document.getElementById('audit-log-result');
  container.innerHTML = '<span class="text-gray-400 text-sm">Lade…</span>';
  try {
    const data = await api('GET', `/employees/audit/log?limit=${limit}`);
    if (!data.length) {
      container.innerHTML = '<div class="text-gray-400 text-sm">Noch keine Einträge im Protokoll.</div>';
      return;
    }

    const aktionColor = { INSERT: 'bg-green-100 text-green-700', UPDATE: 'bg-blue-100 text-blue-700', DELETE: 'bg-red-100 text-red-700' };

    let html = `<div class="overflow-x-auto"><table class="w-full text-xs border-collapse">
      <thead class="bg-gray-50">
        <tr>
          <th class="text-left px-3 py-2 border border-gray-200 font-semibold">Zeitpunkt</th>
          <th class="text-left px-3 py-2 border border-gray-200 font-semibold">Aktion</th>
          <th class="text-left px-3 py-2 border border-gray-200 font-semibold">Tabelle</th>
          <th class="text-left px-3 py-2 border border-gray-200 font-semibold">ID</th>
          <th class="text-left px-3 py-2 border border-gray-200 font-semibold">Geändert von</th>
          <th class="text-left px-3 py-2 border border-gray-200 font-semibold">Alter Wert</th>
          <th class="text-left px-3 py-2 border border-gray-200 font-semibold">Neuer Wert</th>
        </tr>
      </thead><tbody>`;

    data.forEach(row => {
      const cls = aktionColor[row.aktion] || 'bg-gray-100 text-gray-700';
      // Pretty-print JSON alt/neu values
      const fmt = (v) => {
        if (!v) return '<span class="text-gray-300">—</span>';
        try {
          const obj = JSON.parse(v);
          return Object.entries(obj).map(([k, val]) =>
            `<span class="text-gray-500">${k}:</span> ${val ?? '—'}`
          ).join('<br>');
        } catch { return v; }
      };
      html += `<tr class="hover:bg-gray-50 border-b border-gray-100">
        <td class="px-3 py-2 border border-gray-200 whitespace-nowrap">${row.ts ? row.ts.replace('T', ' ').slice(0, 19) : '—'}</td>
        <td class="px-3 py-2 border border-gray-200"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ${cls}">${row.aktion}</span></td>
        <td class="px-3 py-2 border border-gray-200">${row.tabelle}</td>
        <td class="px-3 py-2 border border-gray-200 text-center">${row.datensatz_id ?? '—'}</td>
        <td class="px-3 py-2 border border-gray-200">${row.geaendert_von || '—'}</td>
        <td class="px-3 py-2 border border-gray-200 text-gray-500">${fmt(row.alt_wert)}</td>
        <td class="px-3 py-2 border border-gray-200">${fmt(row.neu_wert)}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<span class="text-red-500 text-sm">Fehler: ${err.message}</span>`;
  }
}

async function handleDeleteEntry(id) {
  if (!confirm('Eintrag wirklich löschen?')) return;
  try {
    await api('DELETE', `/entries/${id}`);
    loadAndRenderEntries();
  } catch (err) {
    alert('Fehler: ' + err.message);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  try {
    await api('POST', '/settings', body);
    state.settings = await api('GET', '/settings');
    showToast('✅ Einstellungen gespeichert!');
  } catch (err) {
    alert('Fehler: ' + err.message);
  }
}

function handleExportPDF() {
  const month = document.getElementById('exp-month')?.value;
  const empId = document.getElementById('exp-employee')?.value;
  if (!month) { alert('Bitte Monat wählen.'); return; }
  const qs = empId ? `?month=${month}&employee_id=${empId}` : `?month=${month}`;
  window.open(`/api/export/pdf${qs}`, '_blank');
}

// ==================== IMPORT TAB ====================
// Import state lives outside render so it survives re-renders within the tab
const importState = {
  parsedRecords: [],
  metadata: { month: '', year: '', employeeName: '' },
  fileName: '',
};

function renderImport() {
  const empOptions = state.employees.filter(e => !e.is_boss).map(emp =>
    `<option value="${emp.id}" ${
      emp.name.toLowerCase() === importState.metadata.employeeName.toLowerCase() ? 'selected' : ''
    }>${emp.name}</option>`
  ).join('');

  const hasRecords = importState.parsedRecords.length > 0;

  return `
  <h2 class="text-xl font-bold text-gray-800 mb-2">📂 Daten importieren</h2>
  <p class="text-sm text-gray-500 mb-5">
    Dateiname <code>MM-YYYY_Name.xlsx</code> → Monat, Jahr und Mitarbeiter werden automatisch erkannt.
  </p>

  <!-- Step 1: File picker -->
  <div class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition mb-5">
    <label for="import-excel-file" class="cursor-pointer">
      <div class="text-3xl mb-2">📁</div>
      <div class="font-semibold text-gray-700">Datei auswählen</div>
      <div class="text-xs text-gray-400 mt-1">Format: <code>11-2025_Mustermann.xlsx</code></div>
    </label>
    <input type="file" id="import-excel-file" accept=".xlsx,.xls" class="hidden">
    ${importState.fileName ? `<div class="mt-3 text-sm text-blue-700 font-medium">📄 ${importState.fileName}</div>` : ''}
  </div>

  <!-- Step 2: Metadata (shown after file load) -->
  ${hasRecords ? `
  <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
    <div class="text-sm font-semibold text-blue-800 mb-3">Erkannte Informationen (anpassbar):</div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-1">Mitarbeiter</label>
        <select id="import-emp"
          class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">-- Bitte wählen --</option>
          ${empOptions}
        </select>
        ${importState.metadata.employeeName ? `<div class="text-xs text-gray-400 mt-1">Aus Dateiname: "${importState.metadata.employeeName}"</div>` : ''}
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-1">Monat</label>
        <input type="text" id="import-month" value="${importState.metadata.month}" maxlength="2"
          class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-1">Jahr</label>
        <input type="text" id="import-year" value="${importState.metadata.year}" maxlength="4"
          class="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>
    </div>
  </div>

  <!-- Step 3: Preview table -->
  <div class="mb-5">
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-semibold text-gray-700">Vorschau — ${importState.parsedRecords.length} Einträge gefunden</h3>
    </div>
    <div class="overflow-x-auto border border-gray-200 rounded-xl">
      <table class="min-w-full text-xs divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Tag</th>
            <th class="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Datum</th>
            <th class="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Kategorie / Tour</th>
            <th class="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Abfahrt</th>
            <th class="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Ankunft</th>
            <th class="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Stunden</th>
            <th class="px-3 py-2 text-left font-semibold text-gray-500 uppercase">Taggeld</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${importState.parsedRecords.map((r, i) => `
          <tr class="hover:bg-gray-50 ${r.wochentag === 'Sa' || r.wochentag === 'So' ? 'bg-gray-50 text-gray-400' : ''}">
            <td class="px-3 py-1.5 font-medium">${r.wochentag}</td>
            <td class="px-3 py-1.5">${r.datumAnzeige}</td>
            <td class="px-3 py-1.5 text-blue-700 font-medium">${r.tourname || '<span class="text-gray-300 italic">—</span>'}</td>
            <td class="px-3 py-1.5">${r.abfahrt || '—'}</td>
            <td class="px-3 py-1.5">${r.ankunft || '—'}</td>
            <td class="px-3 py-1.5">${r.stunden || '—'}</td>
            <td class="px-3 py-1.5">${r.taggeld ? r.taggeld + ' €' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div id="import-result" class="mb-4"></div>

  <button id="import-save-btn"
    class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg text-sm">
    ✅ Daten in die Datenbank importieren (${importState.parsedRecords.length} Einträge)
  </button>
  ` : `
  <div id="import-result"></div>
  <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
    <strong>Hinweis:</strong> Wähle eine Excel-Datei mit dem Format <code>MM-YYYY_Name.xlsx</code>.
    Bereits vorhandene Einträge für dasselbe Datum werden aktualisiert (kein Datenverlust).
  </div>
  `}`;
}

// ==================== STATISTIK TAB ====================
function renderStatistik() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
  const firstDayLastMonth = lastMonth + '-01';
  const lastDayLastMonth = new Date(
    new Date().getFullYear(), new Date().getMonth(), 0
  ).toISOString().slice(0, 10);

  const empOptions = state.employees.filter(e => !e.is_boss).map(emp =>
    `<option value="${emp.id}">${emp.name}</option>`
  ).join('');

  const catOptions = [
    'kehrtour','buero','krankenstand','urlaub','betriebsurlaub','fortbildung','feiertag'
  ].map(c => `<option value="${c}">${c}</option>`).join('');

  return `
  <h2 class="text-xl font-bold text-gray-800 mb-2">📈 Statistik & Analyse</h2>
  <p class="text-sm text-gray-500 mb-6">Berechnete Kennzahlen und Musteranalysen — keine Diagramme, nur Daten.</p>

  <!-- ── Block 1: Wochentags-Muster ── -->
  <div class="border border-gray-200 rounded-xl p-5 mb-6">
    <h3 class="font-bold text-gray-700 mb-3">1. Wochentags-Muster (Abwesenheiten)</h3>
    <p class="text-xs text-gray-400 mb-3">Analysiert an welchen Wochentagen Krankenstand/Urlaub gehäuft auftritt und meldet Auffälligkeiten.</p>
    <div class="flex gap-3 flex-wrap items-end mb-3">
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Mitarbeiter</label>
        <select id="stat-wd-emp" class="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">Alle</option>
          ${empOptions}
        </select>
      </div>
      <button data-action="run-stats-weekday"
        class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
        Auswerten
      </button>
    </div>
    <div id="stats-weekday-result" class="text-sm text-gray-400">Noch nicht ausgewertet.</div>
  </div>

  <!-- ── Block 2: Zeitraum-Anomalien ── -->
  <div class="border border-gray-200 rounded-xl p-5 mb-6">
    <h3 class="font-bold text-gray-700 mb-3">2. Zeitraum-Anomalien</h3>
    <p class="text-xs text-gray-400 mb-3">Vergleicht Krankenstand, Urlaub und Stunden eines Zeitraums mit dem Jahresdurchschnitt.</p>
    <div class="flex gap-3 flex-wrap items-end mb-3">
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Von</label>
        <input type="date" id="stat-per-from" value="${firstDayLastMonth}"
          class="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Bis</label>
        <input type="date" id="stat-per-to" value="${lastDayLastMonth}"
          class="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Mitarbeiter</label>
        <select id="stat-per-emp" class="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">Alle</option>
          ${empOptions}
        </select>
      </div>
      <button data-action="run-stats-period"
        class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
        Auswerten
      </button>
    </div>
    <div id="stats-period-result" class="text-sm text-gray-400">Noch nicht ausgewertet.</div>
  </div>

  <!-- ── Block 3: Aufgaben-Tracking ── -->
  <div class="border border-gray-200 rounded-xl p-5 mb-2">
    <h3 class="font-bold text-gray-700 mb-3">3. Aufgaben-Tracking & Intervalle</h3>
    <p class="text-xs text-gray-400 mb-3">Listet alle Einträge einer Kategorie mit Datum und berechnet den durchschnittlichen Abstand.</p>
    <div class="flex gap-3 flex-wrap items-end mb-3">
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Kategorie</label>
        <select id="stat-task-cat" class="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          ${catOptions}
        </select>
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">Mitarbeiter</label>
        <select id="stat-task-emp" class="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
          <option value="">Alle</option>
          ${empOptions}
        </select>
      </div>
      <button data-action="run-stats-tasks"
        class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
        Auswerten
      </button>
    </div>
    <div id="stats-tasks-result" class="text-sm text-gray-400">Noch nicht ausgewertet.</div>
  </div>`;
}

// ==================== STATS HANDLERS ====================
async function handleStatsWeekday() {
  const empId = document.getElementById('stat-wd-emp')?.value;
  const container = document.getElementById('stats-weekday-result');
  container.innerHTML = '<span class="text-gray-400">Lade…</span>';
  try {
    const qs = empId ? `?employee_id=${empId}` : '';
    const data = await api('GET', `/stats/weekday-pattern${qs}`);
    if (!data.length) { container.innerHTML = '<span class="text-gray-400">Keine Abwesenheitsdaten vorhanden.</span>'; return; }

    let html = '';
    data.forEach(emp => {
      html += `<div class="mb-5">`;
      html += `<div class="font-semibold text-gray-700 mb-2">👤 ${emp.mitarbeiter} — ${emp.gesamtAbwesenheiten} Abwesenheitstage (${emp.krankenstandTage} KS / ${emp.urlaubTage} Urlaub)</div>`;

      // Weekday table
      html += `<div class="overflow-x-auto mb-2"><table class="text-xs w-full border-collapse">
        <thead><tr class="bg-gray-100">
          <th class="text-left px-2 py-1 border border-gray-200">Wochentag</th>
          <th class="px-2 py-1 border border-gray-200">Krankenstand</th>
          <th class="px-2 py-1 border border-gray-200">Urlaub</th>
          <th class="px-2 py-1 border border-gray-200">Gesamt</th>
          <th class="px-2 py-1 border border-gray-200">Anteil</th>
        </tr></thead><tbody>`;
      emp.wochentage.forEach(row => {
        const highlight = row.prozent >= 40 ? 'bg-red-50 font-semibold' : '';
        html += `<tr class="${highlight}">
          <td class="px-2 py-1 border border-gray-200">${row.wochentag}</td>
          <td class="px-2 py-1 border border-gray-200 text-center">${row.krankenstand}</td>
          <td class="px-2 py-1 border border-gray-200 text-center">${row.urlaub}</td>
          <td class="px-2 py-1 border border-gray-200 text-center">${row.gesamt}</td>
          <td class="px-2 py-1 border border-gray-200 text-center">${row.prozent}%</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;

      if (emp.anomalien.length > 0) {
        emp.anomalien.forEach(a => {
          html += `<div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800 text-xs mb-1">${a}</div>`;
        });
      } else {
        html += `<div class="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✅ Keine Auffälligkeiten festgestellt.</div>`;
      }
      html += `</div>`;
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<span class="text-red-500">Fehler: ${e.message}</span>`;
  }
}

async function handleStatsPeriod() {
  const from = document.getElementById('stat-per-from')?.value;
  const to   = document.getElementById('stat-per-to')?.value;
  const empId = document.getElementById('stat-per-emp')?.value;
  const container = document.getElementById('stats-period-result');
  if (!from || !to) { container.innerHTML = '<span class="text-red-500">Bitte Von- und Bis-Datum angeben.</span>'; return; }
  container.innerHTML = '<span class="text-gray-400">Lade…</span>';
  try {
    let qs = `?from=${from}&to=${to}`;
    if (empId) qs += `&employee_id=${empId}`;
    const d = await api('GET', `/stats/period-anomalies${qs}`);

    let html = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div class="bg-gray-50 rounded-xl p-3 text-center">
        <div class="text-xs text-gray-500 uppercase font-semibold mb-1">Zeitraum</div>
        <div class="text-sm font-bold text-gray-700">${d.zeitraum.tage} Tage</div>
      </div>
      <div class="bg-blue-50 rounded-xl p-3 text-center">
        <div class="text-xs text-blue-500 uppercase font-semibold mb-1">Arbeitsstunden</div>
        <div class="text-lg font-bold text-blue-700">${d.zeitraumKPIs.arbeitsstunden}</div>
      </div>
      <div class="bg-red-50 rounded-xl p-3 text-center">
        <div class="text-xs text-red-500 uppercase font-semibold mb-1">Krankenstand</div>
        <div class="text-lg font-bold text-red-700">${d.zeitraumKPIs.krankenstandTage} Tage</div>
      </div>
      <div class="bg-green-50 rounded-xl p-3 text-center">
        <div class="text-xs text-green-600 uppercase font-semibold mb-1">Urlaub</div>
        <div class="text-lg font-bold text-green-700">${d.zeitraumKPIs.urlaubTage} Tage</div>
      </div>
    </div>
    <div class="text-xs text-gray-500 mb-3">
      Erwarteter Krankenstand: ${d.durchschnittKPIs.erwartetKrankenstand} Tage |
      Erwartete Stunden: ${d.durchschnittKPIs.erwartetStunden} Std.
    </div>`;

    d.warnungen.forEach(w => {
      const isWarn = w.startsWith('⚠️');
      const isOk   = w.startsWith('✅');
      const cls = isWarn ? 'bg-amber-50 border-amber-200 text-amber-800'
                : isOk   ? 'bg-green-50 border-green-200 text-green-700'
                         : 'bg-blue-50 border-blue-200 text-blue-700';
      html += `<div class="border rounded-lg px-3 py-2 text-xs mb-1 ${cls}">${w}</div>`;
    });

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<span class="text-red-500">Fehler: ${e.message}</span>`;
  }
}

async function handleStatsTasks() {
  const category = document.getElementById('stat-task-cat')?.value;
  const empId    = document.getElementById('stat-task-emp')?.value;
  const container = document.getElementById('stats-tasks-result');
  container.innerHTML = '<span class="text-gray-400">Lade…</span>';
  try {
    let qs = `?category=${encodeURIComponent(category)}`;
    if (empId) qs += `&employee_id=${empId}`;
    const data = await api('GET', `/stats/task-intervals${qs}`);
    if (!data.length) { container.innerHTML = '<span class="text-gray-400">Keine Einträge für diese Kategorie.</span>'; return; }

    let html = '';
    data.forEach(emp => {
      html += `<div class="mb-5">`;
      html += `<div class="font-semibold text-gray-700 mb-1">👤 ${emp.mitarbeiter}</div>`;
      html += `<div class="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800 mb-3">${emp.zusammenfassung}</div>`;
      html += `<div class="text-xs text-gray-500 mb-2">Gesamtstunden: ${emp.gesamtStunden} Std.</div>`;

      if (emp.eintraege.length > 0) {
        html += `<div class="overflow-x-auto"><table class="text-xs w-full border-collapse">
          <thead><tr class="bg-gray-100">
            <th class="text-left px-2 py-1 border border-gray-200">Datum</th>
            <th class="text-left px-2 py-1 border border-gray-200">Beschreibung</th>
            <th class="px-2 py-1 border border-gray-200">Stunden</th>
            <th class="px-2 py-1 border border-gray-200">Abstand (vorheriger Eintrag)</th>
          </tr></thead><tbody>`;
        emp.eintraege.forEach(e => {
          html += `<tr class="hover:bg-gray-50">
            <td class="px-2 py-1 border border-gray-200">${e.datum}</td>
            <td class="px-2 py-1 border border-gray-200">${e.beschreibung}</td>
            <td class="px-2 py-1 border border-gray-200 text-center">${e.stunden}</td>
            <td class="px-2 py-1 border border-gray-200 text-center text-gray-500">${e.abstandVorher}</td>
          </tr>`;
        });
        html += `</tbody></table></div>`;
      }
      html += `</div>`;
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<span class="text-red-500">Fehler: ${e.message}</span>`;
  }
}

// ==================== IMPORT HANDLER ====================

// German month abbreviations used in Excel ("01.Nov" etc.)
const DE_MONTHS = {
  'jan': '01', 'feb': '02', 'mär': '03', 'mar': '03', 'apr': '04',
  'mai': '05', 'jun': '06', 'jul': '07', 'aug': '08',
  'sep': '09', 'okt': '10', 'nov': '11', 'dez': '12'
};

// Parse "01.Nov" + year "2025" → "2025-11-01"
function parseExcelDateString(datumStr, year) {
  if (!datumStr || typeof datumStr !== 'string') return null;
  // Format: "01.Nov" or "01.Nov."
  const m = datumStr.trim().match(/^(\d{1,2})\.(\w{3})\.?$/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const monKey = m[2].toLowerCase().slice(0, 3);
  const mon = DE_MONTHS[monKey];
  if (!mon || !year) return null;
  return `${year}-${mon}-${day}`;
}

// Convert Excel time fraction (e.g. 0.208333) → "05:00"
function excelFractionToTime(val) {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'string') {
    // Already formatted as "5:00" by xlsx with { raw: false }
    const m = val.match(/^(\d{1,2}):(\d{2})/);
    if (m) return m[1].padStart(2, '0') + ':' + m[2];
    return val;
  }
  if (typeof val === 'number') {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const min = totalMin % 60;
    return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
  }
  return '';
}

// Extract metadata from filename "11-2025_Mustermann.xlsx"
function extractMetaFromFilename(filename) {
  const nameNoExt = filename.replace(/\.[^/.]+$/, '');
  const parts = nameNoExt.split('_');
  let month = '', year = '', employeeName = '';
  if (parts.length >= 2) {
    const dateParts = parts[0].split('-');
    if (dateParts.length === 2) {
      month = dateParts[0].padStart(2, '0');
      year = dateParts[1];
    }
    employeeName = parts.slice(1).join(' ');
  }
  return { month, year, employeeName };
}

function handleExcelImport(file) {
  importState.fileName = file.name;
  const meta = extractMetaFromFilename(file.name);
  importState.metadata = meta;
  importState.parsedRecords = [];

  // Re-render the tab immediately to show loading state
  const tabContent = document.querySelector('.bg-white.rounded-2xl.shadow-sm.p-6');
  if (tabContent) tabContent.innerHTML = renderImport();
  attachListeners();

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      // Dynamically load xlsx from CDN-compatible global (already loaded via script tag)
      const XLSX = window.XLSX;
      if (!XLSX) throw new Error('xlsx Bibliothek nicht geladen.');

      const buffer = event.target.result;
      const workbook = XLSX.read(buffer, { type: 'array' });
      const ws = workbook.Sheets[workbook.SheetNames[0]];

      // Use raw: true to get numbers for times/dates
      const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

      const records = [];

      // Row 0 = header, Row 1 = taggeld-satz, data starts at Row 2
      for (let i = 2; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const wochentag  = row[0] || '';
        const datumRaw   = row[1];        // number (Excel serial) OR string "01.Nov"
        const tourname   = row[2] || '';  // may be empty (e.g. Mustermann R20)
        const abfahrtRaw = row[3];
        const ankunftRaw = row[4];
        const stundenRaw = row[5];
        const taggeldRaw = row[6];

        // Skip if no date at all
        if (!datumRaw && datumRaw !== 0) continue;

        // Parse date
        let dateISO = null;
        let datumAnzeige = '';
        if (typeof datumRaw === 'number') {
          // Excel serial date → ISO
          const utcMs = (datumRaw - 25569) * 86400 * 1000;
          const d = new Date(utcMs);
          dateISO = d.toISOString().slice(0, 10);
          datumAnzeige = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } else if (typeof datumRaw === 'string' && datumRaw.includes('.')) {
          // String like "01.Nov" — use year from metadata
          dateISO = parseExcelDateString(datumRaw, meta.year);
          datumAnzeige = datumRaw;
        }

        if (!dateISO) continue;

        // Skip completely empty workday rows (no tour AND no times)
        const hasData = tourname || abfahrtRaw || stundenRaw;
        if (!hasData) continue;

        const abfahrt = excelFractionToTime(abfahrtRaw);
        const ankunft = excelFractionToTime(ankunftRaw);
        const stunden = stundenRaw ? parseFloat(stundenRaw).toFixed(2) : '';
        const taggeld = taggeldRaw ? parseFloat(taggeldRaw).toFixed(2) : '';

        records.push({ wochentag, dateISO, datumAnzeige, tourname, abfahrt, ankunft, stunden, taggeld });
      }

      importState.parsedRecords = records;

      // Re-render with preview
      if (tabContent) tabContent.innerHTML = renderImport();
      attachListeners();

      // Wire the save button
      const saveBtn = document.getElementById('import-save-btn');
      if (saveBtn) saveBtn.addEventListener('click', handleImportSave);

    } catch (err) {
      const resultEl = document.getElementById('import-result');
      if (resultEl) resultEl.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">❌ Fehler beim Lesen: ${err.message}</div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

async function handleImportSave() {
  const empId = document.getElementById('import-emp')?.value;
  const month = document.getElementById('import-month')?.value;
  const year  = document.getElementById('import-year')?.value;

  if (!empId) { alert('Bitte Mitarbeiter auswählen.'); return; }
  if (!month || !year) { alert('Bitte Monat und Jahr prüfen.'); return; }

  const resultEl = document.getElementById('import-result');
  const saveBtn  = document.getElementById('import-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Importiere…'; }

  // Build payload matching the backend's expected structure
  const records = importState.parsedRecords.map(r => ({
    date: r.dateISO,
    start_time: r.abfahrt || null,
    end_time: r.ankunft || null,
    description: r.tourname || '',
    stunden: r.stunden,
    taggeld: r.taggeld,
  }));

  try {
    const res = await fetch('/api/import/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: parseInt(empId), records }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);

    let html = `<div class="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 mb-3">
      <div class="font-semibold mb-1">✅ Import abgeschlossen</div>
      <div>Neu importiert: <strong>${data.inserted}</strong> Einträge</div>
      <div>Aktualisiert: <strong>${data.updated}</strong> Einträge</div>`;
    if (data.errors && data.errors.length > 0) {
      html += `<div class="mt-2 text-red-700"><strong>Fehler (${data.errors.length}):</strong><br>${data.errors.slice(0,5).join('<br>')}</div>`;
    }
    html += `</div>`;
    if (resultEl) resultEl.innerHTML = html;
    showToast(`✅ ${data.inserted} importiert, ${data.updated} aktualisiert`);

    // Reset import state
    importState.parsedRecords = [];
    importState.fileName = '';
    importState.metadata = { month: '', year: '', employeeName: '' };

  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">❌ Fehler: ${e.message}</div>`;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Daten in die Datenbank importieren'; }
  }
}

// ==================== TOAST ====================
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium fade-in z-50';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ==================== START ====================
init();
