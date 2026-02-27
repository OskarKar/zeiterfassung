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
  filterCategory: '',
  sortCol: 'date',
  sortDir: 'desc',
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
          ${state.isBoss ? `
            <span class="bg-white/10 px-2 py-1 rounded-full text-xs text-white/70 font-mono">v${state.appVersion}</span>
            <button data-action="show-update-log"
              class="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-xs transition font-medium">
              📋 Update-Log
            </button>` : ''}
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

    <!-- Update-Log Modal -->
    <div id="update-log-modal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-bold text-gray-800">📋 Update-Log</h2>
          <button id="update-log-close" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div class="overflow-y-auto flex-1 p-4">
          <pre id="update-log-content" class="text-xs font-mono text-gray-700 whitespace-pre-wrap">Lade…</pre>
        </div>
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

// ==================== YEAR/MONTH HELPER ====================
const CAT_LABELS = {
  kehrtour: 'Kehrtour', buero: 'Büro', krankenstand: 'Krankenstand',
  urlaub: 'Urlaub', betriebsurlaub: 'Betriebsurlaub',
  fortbildung: 'Fortbildung', feiertag: 'Feiertag',
};

function buildYearOpts(selYear) {
  const now = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => now - i)
    .map(y => `<option value="${y}" ${String(y) === String(selYear) ? 'selected' : ''}>${y}</option>`).join('');
}

function buildMonthOpts(selMonth) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0');
    const label = new Date(2000, i, 1).toLocaleString('de-DE', { month: 'long' });
    return `<option value="${m}" ${m === selMonth ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function buildCatOpts(sel) {
  return '<option value="">Alle Kategorien</option>' +
    Object.entries(CAT_LABELS).map(([k, v]) =>
      `<option value="${k}" ${sel === k ? 'selected' : ''}>${v}</option>`
    ).join('');
}

// ==================== ÜBERSICHT TAB ====================
function renderUebersicht() {
  const [selYear, selMonth] = state.filterMonth.split('-');
  return `
  <h2 class="text-xl font-bold text-gray-800 mb-4">📋 Meine Einträge</h2>
  <div class="flex gap-3 mb-4 flex-wrap items-end">
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Jahr</label>
      <select id="my-year" class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm">${buildYearOpts(selYear)}</select>
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Monat</label>
      <select id="my-month-sel" class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm">${buildMonthOpts(selMonth)}</select>
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Kategorie</label>
      <select id="my-cat" class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm">${buildCatOpts(state.filterCategory)}</select>
    </div>
    <button data-action="load-my-entries"
      class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
      Anzeigen
    </button>
  </div>
  <div id="entries-content"><p class="text-gray-400 text-sm">Lade Einträge…</p></div>`;
}

// ==================== ALLE EINTRÄGE TAB ====================
function renderAlle() {
  const [selYear, selMonth] = state.filterMonth.split('-');
  return `
  <h2 class="text-xl font-bold text-gray-800 mb-4">📊 Alle Einträge</h2>
  <div class="flex gap-3 mb-4 flex-wrap items-end">
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Jahr</label>
      <select id="filter-year" class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm">${buildYearOpts(selYear)}</select>
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Monat</label>
      <select id="filter-month-sel" class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm">${buildMonthOpts(selMonth)}</select>
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Mitarbeiter</label>
      <select id="filter-emp" class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm">
        <option value="">Alle Mitarbeiter</option>
        ${state.employees.filter(e => !e.is_boss).map(emp =>
          `<option value="${emp.id}" ${state.filterEmployee == emp.id ? 'selected' : ''}>${emp.name}</option>`
        ).join('')}
      </select>
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 mb-1">Kategorie</label>
      <select id="filter-cat" class="border-2 border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 text-sm">${buildCatOpts(state.filterCategory)}</select>
    </div>
    <button data-action="load-all-entries"
      class="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">
      Filtern
    </button>
  </div>
  <div id="entries-content"><p class="text-gray-400 text-sm">Lade Einträge…</p></div>`;
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
  const [selYear, selMonth] = state.filterMonth.split('-');
  return `
  <h2 class="text-xl font-bold text-gray-800 mb-6">📥 PDF Export</h2>

  <div class="border border-gray-200 rounded-xl p-5 mb-5">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Jahr</label>
        <select id="exp-year"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500">
          ${buildYearOpts(selYear)}
        </select>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Monat</label>
        <select id="exp-month-sel"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500">
          ${buildMonthOpts(selMonth)}
        </select>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-600 mb-1">Mitarbeiter</label>
        <select id="exp-employee"
          class="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500">
          <option value="">Alle Mitarbeiter</option>
          ${state.employees.filter(e => !e.is_boss).map(emp =>
            `<option value="${emp.id}">${emp.name}</option>`
          ).join('')}
        </select>
      </div>
      <div class="flex items-end">
        <button data-action="export-pdf"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-xl transition">
          📄 PDF herunterladen
        </button>
      </div>
    </div>
    <div class="flex items-center gap-3 pt-1">
      <input type="checkbox" id="exp-no-sig" class="w-4 h-4 accent-blue-600">
      <label for="exp-no-sig" class="text-sm text-gray-600 cursor-pointer">Ohne Unterschriftfelder exportieren</label>
    </div>
  </div>

  <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
    <strong>Format:</strong> Monatsbericht im Lohnverrechnungs-Format mit allen Tagen,
    Abfahrt/Ankunft, Stunden, Taggeld und Trinkgeld.
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
function sortIcon(col) {
  if (state.sortCol !== col) return '<span class="text-gray-300 ml-0.5">&#8597;</span>';
  return state.sortDir === 'asc'
    ? '<span class="text-blue-500 ml-0.5">&#8593;</span>'
    : '<span class="text-blue-500 ml-0.5">&#8595;</span>';
}

function sortedEntries(entries) {
  const col = state.sortCol;
  const dir = state.sortDir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    let va = a[col] ?? '', vb = b[col] ?? '';
    if (col === 'net_minutes' || col === 'tip') { va = Number(va) || 0; vb = Number(vb) || 0; }
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return 0;
  });
}

function renderEntriesTable(entries, showEmployee = false, allowEdit = false) {
  // Client-side category filter
  if (state.filterCategory) entries = entries.filter(e => e.category === state.filterCategory);

  if (entries.length === 0) {
    return `<div class="text-center py-8 text-gray-400">Keine Einträge für diesen Zeitraum.</div>`;
  }

  const totalNet = entries.reduce((s, e) => s + (e.net_minutes || 0), 0);
  const totalTip = entries.reduce((s, e) => s + (e.tip || 0), 0);
  const workDays = new Set(entries.map(e => e.date)).size;
  const sorted = sortedEntries(entries);

  const th = (col, label, align = 'left') =>
    `<th class="py-2 px-2 cursor-pointer select-none hover:text-blue-600 text-${align} whitespace-nowrap"
        data-action="sort-col" data-col="${col}">${label}${sortIcon(col)}</th>`;

  const catOpts = Object.entries(CAT_LABELS)
    .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  const rows = sorted.map(e => {
    if (state.editingEntryId === e.id) {
      const colspan = 6 + (showEmployee ? 1 : 0) + (allowEdit ? 1 : 0);
      return `
      <tr class="border-b border-blue-100 bg-blue-50">
        <td colspan="${colspan}" class="px-3 py-3">
          <form id="edit-entry-form" data-id="${e.id}" class="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Datum</label>
              <input type="date" name="date" value="${e.date}" required
                class="w-full border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Kategorie</label>
              <select name="category" class="w-full border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500">
                ${catOpts.replace(`value="${e.category}"`, `value="${e.category}" selected`)}
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Abfahrt</label>
              <input type="time" name="start_time" value="${e.start_time || ''}"
                class="w-full border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Ankunft</label>
              <input type="time" name="end_time" value="${e.end_time || ''}"
                class="w-full border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1">Trinkgeld (€)</label>
              <input type="number" name="tip" value="${e.tip || 0}" step="0.01" min="0"
                class="w-full border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div class="md:col-span-2">
              <label class="block text-xs font-semibold text-gray-500 mb-1">Beschreibung</label>
              <input type="text" name="description" value="${(e.description || '').replace(/"/g, '&quot;')}"
                class="w-full border-2 border-gray-200 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div class="flex gap-2">
              <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-2 rounded-xl transition">✅ Speichern</button>
              <button type="button" data-action="cancel-edit-entry" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold py-1.5 px-2 rounded-xl transition">Abbrechen</button>
            </div>
          </form>
        </td>
      </tr>`;
    }
    return `
    <tr class="border-b border-gray-50 hover:bg-gray-50">
      <td class="py-2 px-2 font-medium whitespace-nowrap">
        ${new Date(e.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
      </td>
      ${showEmployee ? `<td class="py-2 px-2 whitespace-nowrap">${e.employee_name || ''}</td>` : ''}
      <td class="py-2 px-2">
        <span class="px-2 py-0.5 rounded-full text-xs font-medium ${categoryBadge(e.category)}">
          ${CAT_LABELS[e.category] || e.category}
        </span>
      </td>
      <td class="py-2 px-2 text-gray-600 whitespace-nowrap">${e.start_time || '—'} – ${e.end_time || '—'}</td>
      <td class="py-2 px-2 text-right font-mono">${e.net_minutes ? (e.net_minutes / 60).toFixed(2) : '—'}</td>
      <td class="py-2 px-2 text-right text-green-700">${e.tip > 0 ? `€ ${e.tip.toFixed(2)}` : '—'}</td>
      <td class="py-2 px-2 text-gray-500 max-w-xs truncate">${e.description || '—'}</td>
      ${allowEdit ? `
        <td class="py-2 px-2 whitespace-nowrap text-right">
          <button data-action="edit-entry" data-id="${e.id}"
            class="text-blue-400 hover:text-blue-600 text-xs px-2 py-1 rounded hover:bg-blue-50 transition mr-1">✏️</button>
          <button data-action="delete-entry" data-id="${e.id}"
            class="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 transition">🗑️</button>
        </td>` : ''}
    </tr>`;
  }).join('');

  return `
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
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b-2 border-gray-100 text-gray-500 font-semibold text-xs uppercase">
          ${th('date', 'Datum')}
          ${showEmployee ? th('employee_name', 'Mitarbeiter') : ''}
          ${th('category', 'Kategorie')}
          ${th('start_time', 'Zeit')}
          ${th('net_minutes', 'Stunden', 'right')}
          ${th('tip', 'Trinkgeld', 'right')}
          ${th('description', 'Beschreibung')}
          ${allowEdit ? '<th class="py-2 px-2 w-20"></th>' : ''}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
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
      const year  = document.getElementById('my-year')?.value || state.filterMonth.slice(0, 4);
      const month = document.getElementById('my-month-sel')?.value || state.filterMonth.slice(5, 7);
      state.filterCategory = document.getElementById('my-cat')?.value || '';
      const ym = `${year}-${month}`;
      state.filterMonth = ym;
      const empId = state.isBoss ? '' : state.currentUser.id;
      const qs = empId ? `?month=${ym}&employee_id=${empId}` : `?month=${ym}`;
      entries = await api('GET', `/entries${qs}`);
      container.innerHTML = renderEntriesTable(entries, state.isBoss, state.isBoss);
    } else {
      const year  = document.getElementById('filter-year')?.value || state.filterMonth.slice(0, 4);
      const month = document.getElementById('filter-month-sel')?.value || state.filterMonth.slice(5, 7);
      state.filterCategory = document.getElementById('filter-cat')?.value || '';
      state.filterEmployee = document.getElementById('filter-emp')?.value || '';
      const ym = `${year}-${month}`;
      state.filterMonth = ym;
      const empId = state.filterEmployee;
      const qs = empId ? `?month=${ym}&employee_id=${empId}` : `?month=${ym}`;
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

  // Edit entry form submission
  const editEntryForm = document.getElementById('edit-entry-form');
  if (editEntryForm) {
    editEntryForm.addEventListener('submit', handleUpdateEntry);
  }

  // Update-log modal close
  const logClose = document.getElementById('update-log-close');
  if (logClose) {
    logClose.addEventListener('click', () => {
      document.getElementById('update-log-modal')?.classList.add('hidden');
    });
  }

  // Excel import file picker (multi-file)
  const importFileInput = document.getElementById('import-excel-file');
  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) handleExcelImportMulti(files);
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
    case 'edit-entry': {
      const id = parseInt(e.currentTarget.dataset.id);
      state.editingEntryId = (state.editingEntryId === id) ? null : id;
      loadAndRenderEntries();
      break;
    }
    case 'cancel-edit-entry':
      state.editingEntryId = null;
      loadAndRenderEntries();
      break;
    case 'sort-col': {
      const col = e.currentTarget.dataset.col;
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = 'asc';
      }
      loadAndRenderEntries();
      break;
    }
    case 'load-my-entries':
    case 'load-all-entries':
      state.editingEntryId = null;
      loadAndRenderEntries();
      break;
    case 'show-update-log':
      handleShowUpdateLog();
      break;
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

async function handleShowUpdateLog() {
  const modal = document.getElementById('update-log-modal');
  const content = document.getElementById('update-log-content');
  if (!modal || !content) return;
  modal.classList.remove('hidden');
  content.textContent = 'Lade…';
  try {
    const data = await api('GET', '/update-log');
    // Colorize SUCCESS lines green
    content.innerHTML = data.log
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/(SUCCESS[^\n]*)/g, '<span class="text-green-600 font-semibold">$1</span>')
      .replace(/(=====+[^\n]*)/g, '<span class="text-blue-600 font-semibold">$1</span>');
  } catch (err) {
    content.textContent = 'Fehler: ' + err.message;
  }
}

function handleExportPDF() {
  const year  = document.getElementById('exp-year')?.value;
  const month = document.getElementById('exp-month-sel')?.value;
  const empId = document.getElementById('exp-employee')?.value;
  const noSig = document.getElementById('exp-no-sig')?.checked;
  if (!year || !month) { alert('Bitte Jahr und Monat wählen.'); return; }
  const ym = `${year}-${month}`;
  let qs = `?month=${ym}`;
  if (empId) qs += `&employee_id=${empId}`;
  if (noSig) qs += `&no_sig=1`;
  window.open(`/api/export/pdf${qs}`, '_blank');
}

async function handleUpdateEntry(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.dataset.id;
  const fd = new FormData(form);
  const body = {
    date:        fd.get('date'),
    category:    fd.get('category'),
    start_time:  fd.get('start_time') || null,
    end_time:    fd.get('end_time')   || null,
    tip:         parseFloat(fd.get('tip')) || 0,
    description: fd.get('description') || '',
  };
  try {
    await api('PUT', `/entries/${id}`, body);
    state.editingEntryId = null;
    showToast('✅ Eintrag gespeichert');
    loadAndRenderEntries();
  } catch (err) {
    alert('Fehler: ' + err.message);
  }
}

// ==================== IMPORT HELPERS ====================

const DE_MONTHS = {
  'jan': '01', 'jän': '01', 'feb': '02', 'mär': '03', 'mar': '03', 'apr': '04',
  'mai': '05', 'jun': '06', 'jul': '07', 'aug': '08',
  'sep': '09', 'okt': '10', 'nov': '11', 'dez': '12',
};

function parseExcelDateString(datumStr, year) {
  if (!datumStr || typeof datumStr !== 'string') return null;
  const m = datumStr.trim().match(/^(\d{1,2})\.(\w{3})\.?$/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const monKey = m[2].toLowerCase().slice(0, 3);
  const mon = DE_MONTHS[monKey];
  if (!mon || !year) return null;
  return `${year}-${mon}-${day}`;
}

function excelFractionToTime(val) {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'string') {
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

// Known Excel column header words to ignore when searching for the employee name
const COL_HEADER_WORDS = ['tag', 'datum', 'tour', 'abfahrt', 'ankunft', 'stunden', 'taggeld', 'wochentag', 'beschreibung', 'tätigkeit', 'bezeichnung'];

// Scan first rows of jsonData to find: employee name, year, month, and data start row
function extractMetaFromRows(jsonData) {
  let nameFromHeader = '', yearFromHeader = '', monthFromHeader = '';
  let dataStartRow = 2; // default

  for (let ri = 0; ri < Math.min(6, jsonData.length); ri++) {
    const row = jsonData[ri];
    if (!row) continue;
    const cells = row.map(c => String(c || '').trim()).filter(Boolean);
    if (!cells.length) continue;

    // Detect column header row: contains known column words
    const lowerCells = cells.map(c => c.toLowerCase());
    const isColHeader = lowerCells.some(c => COL_HEADER_WORDS.includes(c));
    if (isColHeader) {
      dataStartRow = ri + 2; // data starts 2 rows after column headers (skip taggeld-satz row)
      break;
    }

    // Try to extract year from this row
    const rowText = cells.join(' ');
    if (!yearFromHeader) {
      const ym = rowText.match(/\b(20\d{2})\b/);
      if (ym) yearFromHeader = ym[1];
    }

    // Try to extract month name from this row
    if (!monthFromHeader) {
      const lower = rowText.toLowerCase();
      for (const [key, val] of Object.entries(DE_MONTHS)) {
        if (lower.includes(key)) { monthFromHeader = val; break; }
      }
      if (!monthFromHeader) {
        const nm = rowText.match(/\b(0?[1-9]|1[0-2])\/(20\d{2})\b/);
        if (nm) { monthFromHeader = nm[1].padStart(2, '0'); yearFromHeader = yearFromHeader || nm[2]; }
      }
    }

    // Try to find employee name: a cell that is NOT a date/number/month and looks like a name
    // Typically the rightmost or a standalone cell that isn't the period string
    for (let ci = cells.length - 1; ci >= 0; ci--) {
      const c = cells[ci];
      const lower = c.toLowerCase();
      // Skip if it's a known column header word, a year, or a month name alone
      if (COL_HEADER_WORDS.includes(lower)) continue;
      if (/^\d+$/.test(c)) continue;
      if (/^\d{2}[.\/\-]\d{4}$/.test(c)) continue; // "01/2025"
      if (Object.keys(DE_MONTHS).includes(lower)) continue; // standalone month name
      // Skip if it already contains a year (likely the period string, not name)
      if (/\b20\d{2}\b/.test(c) && cells.length === 1) continue;
      // Looks like a name candidate
      if (c.length >= 2 && /[a-zA-ZäöüÄÖÜß]/.test(c)) {
        nameFromHeader = c;
        break;
      }
    }
  }

  return { nameFromHeader, yearFromHeader, monthFromHeader, dataStartRow };
}

// Returns Promise<{ records, nameFromHeader, yearFromHeader, monthFromHeader }>
function parseExcelFile(file, fallbackYear) {
  return new Promise((resolve, reject) => {
    const XLSX = window.XLSX;
    if (!XLSX) { reject(new Error('xlsx Bibliothek nicht geladen.')); return; }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

        // Scan top rows to find name, period, and where data starts
        const { nameFromHeader, yearFromHeader, monthFromHeader, dataStartRow } = extractMetaFromRows(jsonData);
        const year = yearFromHeader || fallbackYear;

        const records = [];
        for (let i = dataStartRow; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          const wochentag  = row[0] || '';
          const datumRaw   = row[1];
          const tourname   = row[2] || '';
          const abfahrtRaw = row[3];
          const ankunftRaw = row[4];
          const stundenRaw = row[5];
          const taggeldRaw = row[6];

          if (!datumRaw && datumRaw !== 0) continue;

          let dateISO = null, datumAnzeige = '';
          if (typeof datumRaw === 'number') {
            const utcMs = (datumRaw - 25569) * 86400 * 1000;
            const d = new Date(utcMs);
            dateISO = d.toISOString().slice(0, 10);
            datumAnzeige = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
          } else if (typeof datumRaw === 'string' && datumRaw.includes('.')) {
            dateISO = parseExcelDateString(datumRaw, year);
            datumAnzeige = datumRaw;
          }

          if (!dateISO) continue;
          if (!tourname && !abfahrtRaw && !stundenRaw) continue;

          records.push({
            wochentag,
            dateISO,
            datumAnzeige,
            tourname,
            abfahrt: excelFractionToTime(abfahrtRaw),
            ankunft: excelFractionToTime(ankunftRaw),
            stunden: stundenRaw ? parseFloat(stundenRaw).toFixed(2) : '',
            taggeld: taggeldRaw ? parseFloat(taggeldRaw).toFixed(2) : '',
          });
        }

        resolve({ records, nameFromHeader, yearFromHeader, monthFromHeader });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsArrayBuffer(file);
  });
}

// ==================== MULTI-FILE IMPORT ====================
async function handleExcelImportMulti(files) {
  const statusEl = document.getElementById('import-multi-status');
  if (!statusEl) return;

  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 px-4 py-2 text-sm bg-white';
    row.innerHTML = `<span>⏳</span><span class="flex-1 text-gray-700 truncate">${file.name}</span><span class="text-xs text-gray-400">Warte…</span>`;
    statusEl.appendChild(row);

    const setStatus = (icon, msg, cls) => {
      row.innerHTML = `<span>${icon}</span><span class="flex-1 text-gray-700 truncate">${file.name}</span><span class="text-xs ${cls}">${msg}</span>`;
    };

    setStatus('🔄', 'Lese…', 'text-blue-500');
    try {
      const meta = extractMetaFromFilename(file.name);
      const { records, nameFromHeader } = await parseExcelFile(file, meta.year);

      // Prefer name from Excel header, fallback to filename
      const nameToMatch = (nameFromHeader || meta.employeeName || '').toLowerCase().trim();

      if (!nameToMatch) {
        setStatus('⚠️', 'Name nicht erkannt (Kopfzeile + Dateiname leer)', 'text-amber-600');
        continue;
      }

      const empMatch = state.employees.find(emp =>
        !emp.is_boss && emp.name.toLowerCase().includes(nameToMatch)
      ) || state.employees.find(emp =>
        !emp.is_boss && nameToMatch.includes(emp.name.toLowerCase())
      );

      if (!empMatch) {
        setStatus('⚠️', `Mitarbeiter "${nameFromHeader || meta.employeeName}" nicht gefunden`, 'text-amber-600');
        continue;
      }
      if (!records.length) {
        setStatus('⚠️', 'Keine Datenzeilen gefunden', 'text-amber-600');
        continue;
      }

      setStatus('🔄', `${records.length} Zeilen → ${empMatch.name}…`, 'text-blue-500');
      const apiRecords = records.map(r => ({
        date: r.dateISO,
        start_time: r.abfahrt || null,
        end_time: r.ankunft || null,
        description: r.tourname || '',
        stunden: r.stunden,
        taggeld: r.taggeld,
      }));
      const result = await api('POST', '/import/records', { employee_id: empMatch.id, records: apiRecords });
      setStatus('✅', `${result.inserted ?? 0} neu, ${result.updated ?? 0} aktualisiert → ${empMatch.name}`, 'text-green-600');
    } catch (err) {
      setStatus('❌', err.message, 'text-red-500');
    }
  }
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

  <!-- Step 1: File picker (multi-file) -->
  <div class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition mb-4">
    <label for="import-excel-file" class="cursor-pointer">
      <div class="text-3xl mb-2">📁</div>
      <div class="font-semibold text-gray-700">Dateien auswählen</div>
      <div class="text-xs text-gray-400 mt-1">Mehrere Dateien gleichzeitig möglich · Format: <code>MM-YYYY_Name.xlsx</code></div>
    </label>
    <input type="file" id="import-excel-file" accept=".xlsx,.xls" multiple class="hidden">
  </div>

  <!-- Multi-file import status list -->
  <div id="import-multi-status" class="mb-5 divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden empty:hidden"></div>

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
