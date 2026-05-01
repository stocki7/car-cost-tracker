const API = '/api';
const MONTHS = ['', 'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

let families = [];
let vehicles = [];
let drivers = [];
let currentTrips = [];
let editingTripId = null;
let currentCosts = [];
let editingCostId = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── Utilities ──────────────────────────────────────────────────────────────

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => el.className = 'toast', 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Fehler');
  }
  return res.json();
}

function fmt(n) {
  return Number(n).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}.${m}.${y}`;
}

function fmtKm(n) {
  return Number(n).toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
}

function yearOptions(selId, allowEmpty = false) {
  const sel = document.getElementById(selId);
  const cur = new Date().getFullYear();
  const opts = allowEmpty ? ['<option value="">Alle</option>'] : [];
  for (let y = cur; y >= cur - 5; y--) {
    opts.push(`<option value="${y}"${y === cur ? ' selected' : ''}>${y}</option>`);
  }
  sel.innerHTML = opts.join('');
}

function buildParams(vid, year, month) {
  const params = new URLSearchParams();
  if (vid) params.set('vehicle_id', vid);
  if (year) params.set('year', year);
  if (month) params.set('month', month);
  return params;
}

function familyBadgeClass(idx) {
  return ['b1', 'b2', 'b3', 'b4'][idx % 4];
}

function familyBadge(family) {
  const idx = families.findIndex(f => f.id === family.id);
  return `<span class="badge ${familyBadgeClass(idx)}">${family.name}</span>`;
}

function currentVehicleId() {
  return Number(document.getElementById('global-vehicle').value) || null;
}

// ── Navigation ──────────────────────────────────────────────────────────────

function activateTab(name) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById('tab-' + name);
  if (tabEl) tabEl.classList.add('active');
  location.hash = name;
  const loaders = { trips: loadTrips, costs: loadCosts, settings: loadSettings };
  loaders[name]?.();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

document.getElementById('global-vehicle').addEventListener('change', () => {
  syncFormVehicles();
  const activeTab = document.querySelector('.nav-btn.active')?.dataset.tab;
  const loaders = { trips: loadTrips, costs: loadCosts };
  (loaders[activeTab] || loadDashboard)();
});

// ── Init ────────────────────────────────────────────────────────────────────

async function init() {
  yearOptions('dash-year');
  yearOptions('trips-year', true);
  yearOptions('costs-year', true);

  document.getElementById('dash-year').addEventListener('change', loadDashboard);
  document.getElementById('dash-month').addEventListener('change', loadDashboard);
  document.getElementById('trips-year').addEventListener('change', loadTrips);
  document.getElementById('trips-month').addEventListener('change', loadTrips);
  document.getElementById('costs-year').addEventListener('change', loadCosts);
  document.getElementById('costs-month').addEventListener('change', loadCosts);

  [vehicles, families, drivers] = await Promise.all([
    api('/settings/vehicles'),
    api('/settings/families'),
    api('/settings/drivers'),
  ]);
  loadLocationDatalist();

  fillVehicleSelects();
  fillFamilySelects();
  fillDriverSelect();

  fillCostTypeSelect(await api('/costs/types'));

  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('input[type=date]').forEach(el => el.value = today);

  const hash = location.hash.replace('#', '');
  const validTabs = ['dashboard', 'trips', 'costs', 'settings'];
  if (hash && validTabs.includes(hash)) activateTab(hash);
  else loadDashboard();
}

function fillVehicleSelects() {
  const globalSel = document.getElementById('global-vehicle');
  const cur = globalSel.value;
  globalSel.innerHTML = vehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  if (cur && vehicles.find(v => String(v.id) === String(cur))) globalSel.value = cur;
  syncFormVehicles();
}

function syncFormVehicles() {
  const vid = currentVehicleId();
  ['trip-vehicle', 'cost-vehicle'].forEach(id => {
    document.getElementById(id).innerHTML = vehicles.map(v =>
      `<option value="${v.id}"${v.id === vid ? ' selected' : ''}>${v.name}</option>`
    ).join('');
  });
}

function fillFamilySelects() {
  const opts = families.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  document.getElementById('trip-family').innerHTML = opts;
  document.getElementById('cost-family').innerHTML = opts;
  const driverFamOpts = '<option value="">– keine Familie –</option>' +
    families.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  const el = document.getElementById('new-driver-family');
  if (el) el.innerHTML = driverFamOpts;
}

function fillDriverSelect() {
  document.getElementById('trip-driver').innerHTML =
    '<option value="">– kein Fahrer –</option>' +
    drivers.map(d =>
      `<option value="${d.id}" data-family="${d.family_id || ''}">${d.name}${d.family_name ? ' (' + d.family_name + ')' : ''}</option>`
    ).join('');
}

function fillCostTypeSelect(types) {
  document.getElementById('cost-type').innerHTML = types.map(t => `<option>${t}</option>`).join('');
}

function onDriverChange() {
  const sel = document.getElementById('trip-driver');
  const familyId = sel.options[sel.selectedIndex]?.dataset?.family;
  if (familyId) document.getElementById('trip-family').value = familyId;
}

async function reloadCostTypes() {
  fillCostTypeSelect(await api('/costs/types'));
}

// ── Dashboard ───────────────────────────────────────────────────────────────

async function loadDashboard() {
  const vid = currentVehicleId();
  const year = document.getElementById('dash-year').value;
  const month = document.getElementById('dash-month').value;

  const [data, settledList] = await Promise.all([
    api('/reports/summary?' + buildParams(vid, year, month)),
    api('/settlements/?' + (vid ? 'vehicle_id=' + vid : '')),
  ]);

  const dashSettleEl = document.getElementById('dash-settle-bar');
  if (year) {
    const isMonthly = !!month;
    const label = isMonthly ? `${MONTHS[Number(month)]} ${year}` : `Jahr ${year}`;
    const yearlySettled = settledList.find(s => s.year === Number(year) && s.month === null);
    const ownSettled = isMonthly
      ? settledList.find(s => s.year === Number(year) && s.month === Number(month))
      : yearlySettled;
    const settled = ownSettled || (isMonthly ? yearlySettled : null);
    const viaYear = isMonthly && !ownSettled && !!yearlySettled;

    dashSettleEl.innerHTML = settled
      ? `<div class="dash-settled-bar">
          <span style="flex:1;font-weight:600;color:#15803d">${label}
            <span class="settled-badge">✓ Abgerechnet am ${fmtDate(settled.settled_at)}${viaYear ? ' (Jahresabrechnung)' : ''}${settled.notes ? ' – ' + settled.notes : ''}</span>
          </span>
          <button class="unsettle-btn" onclick="unsettleDash(${settled.id})">${viaYear ? 'Jahresabrechnung öffnen' : 'Wieder öffnen'}</button>
         </div>`
      : `<div class="dash-open-bar">
          <span class="open-label">${label} – noch nicht abgerechnet</span>
          <button class="settle-btn" onclick="settleDash(${month || 'null'}, '${year}')">Als abgerechnet markieren</button>
         </div>`;
  } else {
    dashSettleEl.innerHTML = '';
  }

  document.getElementById('dash-cards').innerHTML = `
    <div class="card"><div class="label">Gesamtkosten</div><div class="value">${fmt(data.total_cost)} €</div></div>
    <div class="card"><div class="label">Gesamtkilometer</div><div class="value">${fmtKm(data.total_km)}</div></div>
    <div class="card"><div class="label">Kosten/km</div><div class="value">${data.total_km > 0 ? fmt(data.total_cost / data.total_km) : '–'} €</div></div>
  `;

  const splitEl = document.getElementById('dash-split');
  splitEl.innerHTML = data.split.length === 0 ? '' : `
    <div class="split-table">
      <table>
        <thead><tr><th>Familie</th><th>km</th><th>Anteil</th><th>Soll</th><th>Bezahlt</th><th>Bilanz</th></tr></thead>
        <tbody>
          ${data.split.map(s => {
            const balClass = s.balance > 0.005 ? 'pos' : s.balance < -0.005 ? 'neg' : '';
            const balSign = s.balance > 0.005 ? '+' : '';
            return `<tr>
              <td>${s.family_name}</td>
              <td>${fmtKm(s.km)}</td>
              <td>${s.ratio} %</td>
              <td class="amount">${fmt(s.should_pay)} €</td>
              <td>${fmt(s.paid)} €</td>
              <td class="amount ${balClass}">${balSign}${fmt(s.balance)} €</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('dash-settlement').innerHTML = data.settlement.length === 0
    ? `<div class="settlement-box">
        <div class="settlement-title">Abrechnung</div>
        <div class="settlement-ok">✓ Ausgeglichen</div>
       </div>`
    : `<div class="settlement-box">
        <div class="settlement-title">Abrechnung – wer zahlt wem</div>
        <table>
          <thead><tr><th>Von</th><th></th><th>An</th><th>Betrag</th></tr></thead>
          <tbody>
            ${data.settlement.map(t => `
              <tr class="transfer-row">
                <td>${t.from_family}</td>
                <td style="color:var(--muted)">→</td>
                <td>${t.to_family}</td>
                <td class="amount">${fmt(t.amount)} €</td>
              </tr>`).join('')}
          </tbody>
        </table>
       </div>`;

  drawChart(data);

  const monthlyEl = document.getElementById('dash-monthly');
  if (!month && year) {
    const months = await api('/reports/monthly?' + buildParams(vid, year, null));
    const active = months.filter(m => m.total_km > 0 || m.total_cost > 0);
    if (active.length === 0) { monthlyEl.innerHTML = ''; return; }

    const yearlySettled = settledList.find(s => s.year === Number(year) && s.month === null);
    let html = '<h3 style="margin:1.5rem 0 .75rem">Monatsübersicht</h3>';

    [...active].reverse().forEach(m => {
      const ownSettlement = settledList.find(s => s.year === Number(year) && s.month === m.month);
      const viaYear = !ownSettlement && !!yearlySettled;
      const settled = ownSettlement || yearlySettled;

      const settlementHtml = m.settlement.length === 0
        ? '<span style="color:var(--green)">✓ Ausgeglichen</span>'
        : m.settlement.map(t =>
            `<strong style="color:var(--danger)">${t.from_family}</strong>
             <span class="arrow">→</span>
             <strong style="color:var(--green)">${t.to_family}</strong>:
             <strong>${fmt(t.amount)} €</strong>`
          ).join(' &nbsp;|&nbsp; ');

      const settledBadge = settled
        ? `<span class="settled-badge">✓ Abgerechnet am ${fmtDate(settled.settled_at)}${viaYear ? ' (Jahresabrechnung)' : ''}${settled.notes ? ' – ' + settled.notes : ''}</span>`
        : '';

      const settleBtn = ownSettlement
        ? `<button class="unsettle-btn" onclick="unsettle(${ownSettlement.id})">Wieder öffnen</button>`
        : viaYear
          ? `<button class="unsettle-btn" onclick="unsettle(${yearlySettled.id})">Jahresabrechnung öffnen</button>`
          : `<button class="settle-btn" onclick="settleMonth(${m.month}, '${year}')">Als abgerechnet markieren</button>`;

      html += `
        <div class="report-month${settled ? ' is-settled' : ''}">
          <div class="report-month-header">
            <span>${MONTHS[m.month]} ${year} ${settledBadge}</span>
            <div style="display:flex;align-items:center;gap:.75rem">
              <span style="color:var(--muted);font-weight:400;font-size:.9rem">${fmt(m.total_cost)} € | ${fmtKm(m.total_km)}</span>
              ${settleBtn}
            </div>
          </div>
          <div class="report-month-body">
            <div class="report-families">
              ${m.split.map(s => {
                const balSign = s.balance > 0.005 ? '+' : '';
                return `<div class="report-family">
                  <div class="name">${s.family_name}</div>
                  <div class="details">${fmtKm(s.km)} (${s.ratio} %)</div>
                  <div class="details">bezahlt: ${fmt(s.paid)} €</div>
                  <div class="share">${fmt(s.should_pay)} €</div>
                  <div class="balance-line" style="color:${s.balance > 0.005 ? 'var(--green)' : s.balance < -0.005 ? 'var(--danger)' : 'var(--muted)'}">
                    Bilanz: ${balSign}${fmt(s.balance)} €
                  </div>
                </div>`;
              }).join('')}
            </div>
            <div class="report-settlement">Abrechnung: ${settlementHtml}</div>
          </div>
        </div>`;
    });

    monthlyEl.innerHTML = html;
  } else {
    monthlyEl.innerHTML = '';
  }
}

function drawChart(data) {
  const canvas = document.getElementById('dash-chart');
  const wrap = document.getElementById('dash-chart-wrap');
  const w = Math.max(wrap.clientWidth - 48, 200);
  canvas.width = w;
  canvas.style.width = w + 'px';

  if (!data.cost_by_type || Object.keys(data.cost_by_type).length === 0) return;

  const entries = Object.entries(data.cost_by_type).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(...entries.map(e => e[1]));
  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const barH = 32, gap = 10, padL = 130, padR = 90, padT = 20;

  canvas.height = entries.length * (barH + gap) + padT + 20;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, canvas.height);

  entries.forEach(([label, val], i) => {
    const y = padT + i * (barH + gap);
    const bw = maxVal > 0 ? (val / maxVal) * (w - padL - padR) : 0;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.roundRect(padL, y, Math.max(bw, 4), barH, 4);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(label, padL - 8, y + barH / 2 + 5);
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText(fmt(val) + ' €', padL + bw + 8, y + barH / 2 + 5);
  });
}

// ── Trips ───────────────────────────────────────────────────────────────────

document.getElementById('trip-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {};
  fd.forEach((v, k) => { if (v !== '') body[k] = v; });
  body.vehicle_id = Number(body.vehicle_id);
  body.family_id = Number(body.family_id);
  body.km = Number(body.km || 0);
  body.round_trip = document.getElementById('trip-retour').checked;

  const driverSel = document.getElementById('trip-driver');
  const driverOpt = driverSel.options[driverSel.selectedIndex];
  if (driverOpt?.value) body.driver_name = driverOpt.text.replace(/ \(.*\)$/, '');
  else delete body.driver_name;

  try {
    if (editingTripId) {
      await api('/trips/' + editingTripId, { method: 'PUT', body: JSON.stringify(body) });
      toast('Fahrt aktualisiert');
      editingTripId = null;
    } else {
      await api('/trips/', { method: 'POST', body: JSON.stringify(body) });
      toast('Fahrt gespeichert');
    }
    e.target.reset();
    document.getElementById('trip-driver').value = '';
    document.getElementById('trip-retour').checked = false;
    document.querySelectorAll('input[type=date]').forEach(el => el.value = new Date().toISOString().split('T')[0]);
    document.getElementById('trip-submit-btn').textContent = 'Fahrt speichern';
    document.getElementById('trip-cancel-btn').style.display = 'none';
    syncFormVehicles();
    loadTrips();
    loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
});

function startEditTrip(id) {
  const t = currentTrips.find(x => x.id === id);
  if (!t) return;
  editingTripId = id;
  const form = document.getElementById('trip-form');
  form.date.value = t.date;
  document.getElementById('trip-vehicle').value = t.vehicle_id;
  document.getElementById('trip-family').value = t.family_id;
  form.start_location.value = t.start_location || '';
  form.end_location.value = t.end_location || '';
  document.getElementById('trip-km').value = t.km;
  document.getElementById('trip-retour').checked = t.round_trip;
  form.notes.value = t.notes || '';
  const driverSel = document.getElementById('trip-driver');
  const match = [...driverSel.options].find(o => o.text.replace(/ \(.*\)$/, '') === t.driver_name);
  driverSel.value = match ? match.value : '';
  document.getElementById('trip-submit-btn').textContent = 'Fahrt aktualisieren';
  document.getElementById('trip-cancel-btn').style.display = '';
  form.scrollIntoView({ behavior: 'smooth' });
}

function cancelEditTrip() {
  editingTripId = null;
  document.getElementById('trip-form').reset();
  document.getElementById('trip-driver').value = '';
  document.getElementById('trip-retour').checked = false;
  document.querySelectorAll('#trip-form input[type=date]').forEach(el => el.value = new Date().toISOString().split('T')[0]);
  document.getElementById('trip-submit-btn').textContent = 'Fahrt speichern';
  document.getElementById('trip-cancel-btn').style.display = 'none';
  syncFormVehicles();
}

async function calcKm() {
  const start = document.getElementById('trip-start').value;
  const end = document.getElementById('trip-end').value;
  if (!start || !end) { toast('Bitte Start und Ziel eingeben', 'error'); return; }
  try {
    const r = await api('/trips/calculate-distance', { method: 'POST', body: JSON.stringify({ start, end }) });
    const retour = document.getElementById('trip-retour').checked;
    const km = retour ? Math.round(r.km * 2 * 10) / 10 : r.km;
    document.getElementById('trip-km').value = km;
    toast('Strecke berechnet: ' + km + ' km' + (retour ? ' (Hin & Retour)' : ''));
  } catch (err) {
    toast(err.message, 'error');
  }
}

function onRetourChange() {
  const kmEl = document.getElementById('trip-km');
  const val = parseFloat(kmEl.value);
  if (!val) return;
  const retour = document.getElementById('trip-retour').checked;
  kmEl.value = Math.round((retour ? val * 2 : val / 2) * 10) / 10;
}

async function loadTrips() {
  const vid = currentVehicleId();
  const year = document.getElementById('trips-year').value;
  const month = document.getElementById('trips-month').value;
  const trips = await api('/trips/?' + buildParams(vid, year, month));
  currentTrips = trips;
  const el = document.getElementById('trips-table');

  if (trips.length === 0) { el.innerHTML = '<p class="empty">Noch keine Fahrten erfasst.</p>'; return; }

  el.innerHTML = `
    <div class="data-table">
      <table>
        <thead><tr><th>Datum</th><th>Fahrzeug</th><th>Familie</th><th>Fahrer/in</th><th>Route</th><th>km</th><th>Notiz</th><th></th></tr></thead>
        <tbody>
          ${trips.map(t => {
            const fam = families.find(f => f.id === t.family_id) || { id: t.family_id, name: t.family_name };
            const arrow = t.round_trip ? '↔' : '→';
            const route = (t.start_location && t.end_location)
              ? `${t.start_location} ${arrow} ${t.end_location}${t.round_trip ? ' (H&R)' : ''}`
              : (t.start_location || t.end_location || '–');
            return `<tr>
              <td>${t.date}</td>
              <td><span class="badge vehicle">${t.vehicle_name || '–'}</span></td>
              <td>${familyBadge(fam)}</td>
              <td>${t.driver_name || '–'}</td>
              <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${route}">${route}</td>
              <td>${fmtKm(t.km)}</td>
              <td>${t.notes || '–'}</td>
              <td>
                <button class="edit-btn" onclick="startEditTrip(${t.id})">✎</button>
                <button class="del-btn" onclick="deleteTrip(${t.id})">✕</button>
              </td>
            </tr>`;
          }).join('')}
          <tr style="background:#f8fafc">
            <td colspan="5"><strong>Gesamt</strong></td>
            <td><strong>${fmtKm(trips.reduce((s, t) => s + t.km, 0))}</strong></td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

async function deleteTrip(id) {
  if (!confirm('Fahrt löschen?')) return;
  await api('/trips/' + id, { method: 'DELETE' });
  toast('Fahrt gelöscht');
  loadTrips();
  loadDashboard();
}

// ── Costs ────────────────────────────────────────────────────────────────────

document.getElementById('cost-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {};
  fd.forEach((v, k) => { if (v !== '') body[k] = v; });
  body.vehicle_id = Number(body.vehicle_id);
  body.paid_by_family_id = Number(body.paid_by_family_id);
  body.amount = Number(body.amount);

  try {
    if (editingCostId) {
      await api('/costs/' + editingCostId, { method: 'PUT', body: JSON.stringify(body) });
      toast('Kosten aktualisiert');
      editingCostId = null;
    } else {
      await api('/costs/', { method: 'POST', body: JSON.stringify(body) });
      toast('Kosten gespeichert');
    }
    e.target.reset();
    document.querySelectorAll('input[type=date]').forEach(el => el.value = new Date().toISOString().split('T')[0]);
    document.getElementById('cost-submit-btn').textContent = 'Kosten speichern';
    document.getElementById('cost-cancel-btn').style.display = 'none';
    syncFormVehicles();
    loadCosts();
    loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
});

function startEditCost(id) {
  const c = currentCosts.find(x => x.id === id);
  if (!c) return;
  editingCostId = id;
  const form = document.getElementById('cost-form');
  form.date.value = c.date;
  document.getElementById('cost-vehicle').value = c.vehicle_id;
  document.getElementById('cost-family').value = c.paid_by_family_id;
  document.getElementById('cost-type').value = c.cost_type;
  form.amount.value = c.amount;
  form.description.value = c.description || '';
  form.notes.value = c.notes || '';
  document.getElementById('cost-submit-btn').textContent = 'Kosten aktualisieren';
  document.getElementById('cost-cancel-btn').style.display = '';
  form.scrollIntoView({ behavior: 'smooth' });
}

function cancelEditCost() {
  editingCostId = null;
  document.getElementById('cost-form').reset();
  document.querySelectorAll('input[type=date]').forEach(el => el.value = new Date().toISOString().split('T')[0]);
  document.getElementById('cost-submit-btn').textContent = 'Kosten speichern';
  document.getElementById('cost-cancel-btn').style.display = 'none';
  syncFormVehicles();
}

async function loadCosts() {
  const vid = currentVehicleId();
  const year = document.getElementById('costs-year').value;
  const month = document.getElementById('costs-month').value;
  const costs = await api('/costs/?' + buildParams(vid, year, month));
  currentCosts = costs;
  const el = document.getElementById('costs-table');

  if (costs.length === 0) { el.innerHTML = '<p class="empty">Noch keine Kosten erfasst.</p>'; return; }

  const total = costs.reduce((s, c) => s + c.amount, 0);
  el.innerHTML = `
    <div class="data-table">
      <table>
        <thead><tr><th>Datum</th><th>Fahrzeug</th><th>Bezahlt von</th><th>Kategorie</th><th>Beschreibung</th><th>Betrag</th><th>Notiz</th><th></th></tr></thead>
        <tbody>
          ${costs.map(c => {
            const fam = families.find(f => f.id === c.paid_by_family_id);
            return `<tr>
              <td>${c.date}</td>
              <td><span class="badge vehicle">${c.vehicle_name || '–'}</span></td>
              <td>${fam ? familyBadge(fam) : '–'}</td>
              <td><span class="badge">${c.cost_type}</span></td>
              <td>${c.description || '–'}</td>
              <td><strong>${fmt(c.amount)} €</strong></td>
              <td>${c.notes || '–'}</td>
              <td>
                <button class="edit-btn" onclick="startEditCost(${c.id})">✎</button>
                <button class="del-btn" onclick="deleteCost(${c.id})">✕</button>
              </td>
            </tr>`;
          }).join('')}
          <tr style="background:#f8fafc">
            <td colspan="5"><strong>Gesamt</strong></td>
            <td><strong>${fmt(total)} €</strong></td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

async function deleteCost(id) {
  if (!confirm('Kosteneintrag löschen?')) return;
  await api('/costs/' + id, { method: 'DELETE' });
  toast('Eintrag gelöscht');
  loadCosts();
  loadDashboard();
}

// ── Settlements ───────────────────────────────────────────────────────────────

async function postSettlement(year, month, label, reloadFn) {
  const notes = prompt(`Notiz zur Abrechnung ${label} (optional):`);
  if (notes === null) return;
  const vid = currentVehicleId();
  try {
    await api('/settlements/', { method: 'POST', body: JSON.stringify({
      vehicle_id: vid || null, year: Number(year), month: month ?? null, notes: notes || null,
    })});
    toast(`${label} abgerechnet`);
    reloadFn();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteSettlement(id, reloadFn) {
  if (!confirm('Abrechnung wieder öffnen?')) return;
  try {
    await api('/settlements/' + id, { method: 'DELETE' });
    toast('Abrechnung geöffnet');
    reloadFn();
  } catch (err) { toast(err.message, 'error'); }
}

function settleYear(year) {
  return postSettlement(year, null, `Jahr ${year}`, loadDashboard);
}

function settleMonth(month, year) {
  return postSettlement(year, month, `${MONTHS[month]} ${year}`, loadDashboard);
}

function settleDash(month, year) {
  const monthVal = (month && month !== 'null') ? Number(month) : null;
  const label = monthVal ? `${MONTHS[monthVal]} ${year}` : `Jahr ${year}`;
  return postSettlement(year, monthVal, label, loadDashboard);
}

function unsettle(id) { return deleteSettlement(id, loadDashboard); }
function unsettleDash(id) { return deleteSettlement(id, loadDashboard); }

// ── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  const [veh, fams, drvs, costTypes, ors] = await Promise.all([
    api('/settings/vehicles'),
    api('/settings/families'),
    api('/settings/drivers'),
    api('/settings/cost-types'),
    api('/settings/ors-key'),
  ]);
  drivers = drvs;
  vehicles = veh;
  families = fams;

  document.getElementById('vehicle-list').innerHTML = veh.map((v, i) => `
    <div class="settings-item">
      <button class="move-btn" ${i === 0 ? 'disabled' : ''} onclick="moveVehicle(${v.id},'up')">▲</button>
      <button class="move-btn" ${i === veh.length - 1 ? 'disabled' : ''} onclick="moveVehicle(${v.id},'dn')">▼</button>
      <input type="text" id="veh-name-${v.id}" value="${v.name}" placeholder="Name" />
      <input type="text" id="veh-desc-${v.id}" value="${v.description || ''}" placeholder="Beschreibung" class="desc" />
      <button onclick="saveVehicle(${v.id})">Speichern</button>
      <button class="del-btn" onclick="deleteVehicle(${v.id})" title="Fahrzeug löschen">✕</button>
    </div>`).join('');

  document.getElementById('family-list').innerHTML = fams.map((f, i) => `
    <div class="settings-item">
      <button class="move-btn" ${i === 0 ? 'disabled' : ''} onclick="moveFamily(${f.id},'up')">▲</button>
      <button class="move-btn" ${i === fams.length - 1 ? 'disabled' : ''} onclick="moveFamily(${f.id},'dn')">▼</button>
      <input type="text" id="fam-${f.id}" value="${f.name}" />
      <button onclick="saveFamily(${f.id})">Speichern</button>
      <button class="del-btn" onclick="deleteFamily(${f.id})" title="Familie löschen">✕</button>
    </div>`).join('');

  const famOptsForDriver = '<option value="">– keine Familie –</option>' +
    fams.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

  document.getElementById('driver-list').innerHTML = drvs.length === 0
    ? '<p class="hint">Noch keine Fahrer angelegt.</p>'
    : drvs.map((d, i) => `
      <div class="settings-item driver-item">
        <button class="move-btn" ${i === 0 ? 'disabled' : ''} onclick="moveDriver(${d.id},'up')">▲</button>
        <button class="move-btn" ${i === drvs.length - 1 ? 'disabled' : ''} onclick="moveDriver(${d.id},'dn')">▼</button>
        <input type="text" id="drv-name-${d.id}" value="${d.name}" class="drv-name" />
        <select id="drv-fam-${d.id}" class="drv-fam">
          ${famOptsForDriver.replace(`value="${d.family_id}"`, `value="${d.family_id}" selected`)}
        </select>
        <button onclick="saveDriver(${d.id})">Speichern</button>
        <button class="del-btn" onclick="deleteDriver(${d.id})" title="Fahrer löschen">✕</button>
      </div>`).join('');

  document.getElementById('new-driver-family').innerHTML = famOptsForDriver;
  renderLocationSettings();

  document.getElementById('cost-type-list').innerHTML = costTypes.map((ct, i) => `
    <div class="settings-item">
      <button class="move-btn" ${i === 0 ? 'disabled' : ''} onclick="moveCostType(${ct.id},'up')">▲</button>
      <button class="move-btn" ${i === costTypes.length - 1 ? 'disabled' : ''} onclick="moveCostType(${ct.id},'dn')">▼</button>
      <input type="text" id="ct-${ct.id}" value="${ct.name}" />
      <button onclick="saveCostType(${ct.id})">Speichern</button>
      <button class="del-btn" onclick="deleteCostType(${ct.id})" title="Kostenart löschen">✕</button>
    </div>`).join('');

  document.getElementById('ors-status').innerHTML = `
    <div class="ors-status">
      <span class="dot ${ors.configured ? 'ok' : 'missing'}"></span>
      ${ors.configured ? 'API-Key konfiguriert' : 'Kein API-Key gesetzt'}
    </div>`;
}

async function saveVehicle(id) {
  const name = document.getElementById('veh-name-' + id).value.trim();
  const description = document.getElementById('veh-desc-' + id).value.trim() || null;
  if (!name) return;
  try {
    await api('/settings/vehicles/' + id, { method: 'PUT', body: JSON.stringify({ name, description }) });
    vehicles = await api('/settings/vehicles');
    fillVehicleSelects();
    toast('Fahrzeug gespeichert');
  } catch (err) { toast(err.message, 'error'); }
}

async function addVehicle() {
  const name = document.getElementById('new-vehicle-name').value.trim();
  const description = document.getElementById('new-vehicle-desc').value.trim() || null;
  if (!name) return;
  try {
    await api('/settings/vehicles', { method: 'POST', body: JSON.stringify({ name, description }) });
    document.getElementById('new-vehicle-name').value = '';
    document.getElementById('new-vehicle-desc').value = '';
    toast('Fahrzeug hinzugefügt');
    vehicles = await api('/settings/vehicles');
    fillVehicleSelects();
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteVehicle(id) {
  if (!confirm('Fahrzeug wirklich löschen?')) return;
  try {
    await api('/settings/vehicles/' + id, { method: 'DELETE' });
    toast('Fahrzeug gelöscht');
    vehicles = await api('/settings/vehicles');
    fillVehicleSelects();
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
}

async function saveFamily(id) {
  const name = document.getElementById('fam-' + id).value.trim();
  if (!name) return;
  try {
    await api('/settings/families/' + id, { method: 'PUT', body: JSON.stringify({ name }) });
    families = await api('/settings/families');
    fillFamilySelects();
    toast('Name gespeichert');
  } catch (err) { toast(err.message, 'error'); }
}

async function addFamily() {
  const input = document.getElementById('new-family-input');
  const name = input.value.trim();
  if (!name) return;
  try {
    await api('/settings/families', { method: 'POST', body: JSON.stringify({ name }) });
    input.value = '';
    toast('Familie hinzugefügt');
    families = await api('/settings/families');
    fillFamilySelects();
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteFamily(id) {
  if (!confirm('Familie wirklich löschen?')) return;
  try {
    await api('/settings/families/' + id, { method: 'DELETE' });
    toast('Familie gelöscht');
    families = await api('/settings/families');
    fillFamilySelects();
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
}

async function saveCostType(id) {
  const name = document.getElementById('ct-' + id).value.trim();
  if (!name) return;
  try {
    await api('/settings/cost-types/' + id, { method: 'PUT', body: JSON.stringify({ name }) });
    toast('Kostenart gespeichert');
    await reloadCostTypes();
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
}

async function addCostType() {
  const input = document.getElementById('new-cost-type-input');
  const name = input.value.trim();
  if (!name) return;
  try {
    await api('/settings/cost-types', { method: 'POST', body: JSON.stringify({ name }) });
    input.value = '';
    toast('Kostenart hinzugefügt');
    await reloadCostTypes();
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteCostType(id) {
  if (!confirm('Kostenart wirklich löschen?')) return;
  try {
    await api('/settings/cost-types/' + id, { method: 'DELETE' });
    toast('Kostenart gelöscht');
    await reloadCostTypes();
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
}

async function saveDriver(id) {
  const name = document.getElementById('drv-name-' + id).value.trim();
  const family_id = Number(document.getElementById('drv-fam-' + id).value) || null;
  if (!name) return;
  try {
    await api('/settings/drivers/' + id, { method: 'PUT', body: JSON.stringify({ name, family_id }) });
    drivers = await api('/settings/drivers');
    fillDriverSelect();
    toast('Fahrer gespeichert');
  } catch (err) { toast(err.message, 'error'); }
}

async function addDriver() {
  const name = document.getElementById('new-driver-name').value.trim();
  const family_id = Number(document.getElementById('new-driver-family').value) || null;
  if (!name) return;
  try {
    await api('/settings/drivers', { method: 'POST', body: JSON.stringify({ name, family_id }) });
    document.getElementById('new-driver-name').value = '';
    document.getElementById('new-driver-family').value = '';
    toast('Fahrer hinzugefügt');
    drivers = await api('/settings/drivers');
    fillDriverSelect();
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteDriver(id) {
  if (!confirm('Fahrer wirklich löschen?')) return;
  try {
    await api('/settings/drivers/' + id, { method: 'DELETE' });
    toast('Fahrer gelöscht');
    drivers = await api('/settings/drivers');
    fillDriverSelect();
    loadSettings();
  } catch (err) { toast(err.message, 'error'); }
}

async function loadLocationDatalist() {
  const locs = await api('/settings/locations');
  document.getElementById('locations-list').innerHTML =
    locs.map(l => `<option value="${l.name}"></option>`).join('');
}

async function renderLocationSettings() {
  const locs = await api('/settings/locations');
  const el = document.getElementById('location-list');
  el.innerHTML = locs.length === 0
    ? '<p class="hint">Noch keine Orte angelegt.</p>'
    : locs.map((l, i) => `
      <div class="settings-item">
        <button class="move-btn" ${i === 0 ? 'disabled' : ''} onclick="moveLocation(${l.id},'up')">▲</button>
        <button class="move-btn" ${i === locs.length - 1 ? 'disabled' : ''} onclick="moveLocation(${l.id},'dn')">▼</button>
        <span style="flex:1;padding:.4rem .2rem">${l.name}</span>
        <button class="del-btn" onclick="deleteLocation('${l.name.replace(/'/g, "\\'")}')">✕</button>
      </div>`).join('');
}

async function addLocation() {
  const input = document.getElementById('new-location-input');
  const name = input.value.trim();
  if (!name) return;
  try {
    await api('/settings/locations', { method: 'POST', body: JSON.stringify({ name }) });
    input.value = '';
    toast('Ort hinzugefügt');
    renderLocationSettings();
    loadLocationDatalist();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteLocation(name) {
  if (!confirm('Ort löschen?')) return;
  try {
    await api('/settings/locations/' + encodeURIComponent(name), { method: 'DELETE' });
    toast('Ort gelöscht');
    renderLocationSettings();
    loadLocationDatalist();
  } catch (err) { toast(err.message, 'error'); }
}

async function saveOrsKey() {
  const val = document.getElementById('ors-key-input').value.trim();
  if (!val) return;
  await api('/settings/ors-key', { method: 'PUT', body: JSON.stringify({ value: val }) });
  document.getElementById('ors-key-input').value = '';
  toast('API-Key gespeichert');
  loadSettings();
}

async function moveVehicle(id, dir) {
  await api(`/settings/vehicles/move?vehicle_id=${id}&direction=${dir}`, { method: 'POST' });
  vehicles = await api('/settings/vehicles');
  fillVehicleSelects();
  loadSettings();
}

async function moveFamily(id, dir) {
  await api(`/settings/families/move?family_id=${id}&direction=${dir}`, { method: 'POST' });
  families = await api('/settings/families');
  fillFamilySelects();
  loadSettings();
}

async function moveDriver(id, dir) {
  await api(`/settings/drivers/move?driver_id=${id}&direction=${dir}`, { method: 'POST' });
  loadSettings();
}

async function moveCostType(id, dir) {
  await api(`/settings/cost-types/move?ct_id=${id}&direction=${dir}`, { method: 'POST' });
  await reloadCostTypes();
  loadSettings();
}

async function moveLocation(id, dir) {
  await api(`/settings/locations/move?loc_id=${id}&direction=${dir}`, { method: 'POST' });
  renderLocationSettings();
  loadLocationDatalist();
}

init();
