'use strict';

const DEFAULTS_KEY = 'attendanceDefaults';

function getDefaults() {
  try { return JSON.parse(localStorage.getItem(DEFAULTS_KEY)) || {}; }
  catch { return {}; }
}

function saveDefaults(d) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d));
}

// 認証チェック
if (!localStorage.getItem('authToken')) location.href = '/login';
document.getElementById('header-username').textContent = localStorage.getItem('username') || '';
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
  location.href = '/login';
});

// ── 経由駅 動的フィールド ──
function addViaField(value = '') {
  const list = document.getElementById('s-via-list');
  const row = document.createElement('div');
  row.className = 'via-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '例：渋谷';
  input.value = value;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-remove-via';
  btn.textContent = '−';
  btn.addEventListener('click', () => {
    list.removeChild(row);
    syncViaButtons();
  });

  row.appendChild(input);
  row.appendChild(btn);
  list.appendChild(row);
  syncViaButtons();
}

function syncViaButtons() {
  const rows = document.querySelectorAll('#s-via-list .via-row');
  rows.forEach(r => {
    r.querySelector('.btn-remove-via').style.display = rows.length > 1 ? 'flex' : 'none';
  });
}

function getViaValues() {
  return Array.from(document.querySelectorAll('#s-via-list input[type="text"]'))
    .map(i => i.value.trim()).filter(Boolean);
}

document.getElementById('s-add-via').addEventListener('click', () => addViaField());

// ── フォーム読み込み ──
function loadForm() {
  const d = getDefaults();

  document.getElementById('s-start-time').value = d.start_time || '';
  document.getElementById('s-end-time').value   = d.end_time || '';
  document.getElementById('s-dep').value        = d.departure_station || '';
  document.getElementById('s-arr').value        = d.arrival_station || '';
  document.getElementById('s-cost').value       = d.transport_cost != null ? d.transport_cost : '';
  document.getElementById('s-desc').value       = d.work_description || '';

  // 経由駅
  document.getElementById('s-via-list').innerHTML = '';
  const vias = d.via_stations || [];
  if (vias.length > 0) {
    vias.forEach(v => addViaField(v));
  } else {
    addViaField();
  }

  // 勤務地
  const locs = d.work_locations || [];
  document.querySelectorAll('input[name="s-loc"]').forEach(cb => {
    cb.checked = locs.includes(cb.value);
  });
}

// ── 保存 ──
document.getElementById('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const costVal = document.getElementById('s-cost').value;
  saveDefaults({
    start_time:        document.getElementById('s-start-time').value || '',
    end_time:          document.getElementById('s-end-time').value || '',
    departure_station: document.getElementById('s-dep').value.trim(),
    via_stations:      getViaValues(),
    arrival_station:   document.getElementById('s-arr').value.trim(),
    transport_cost:    costVal !== '' ? parseInt(costVal, 10) : null,
    work_locations:    Array.from(document.querySelectorAll('input[name="s-loc"]:checked')).map(cb => cb.value),
    work_description:  document.getElementById('s-desc').value.trim(),
  });

  const msg = document.getElementById('settings-msg');
  msg.textContent = '設定を保存しました。';
  msg.className = 'settings-msg settings-msg--success';
  setTimeout(() => { msg.className = 'settings-msg hidden'; }, 2500);
});

loadForm();
