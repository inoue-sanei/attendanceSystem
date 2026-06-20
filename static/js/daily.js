'use strict';

const DEFAULTS_KEY = 'attendanceDefaults';

function getDefaults() {
  try { return JSON.parse(localStorage.getItem(DEFAULTS_KEY)) || {}; }
  catch { return {}; }
}

// ── 認証 ──
const token = localStorage.getItem('authToken');
if (!token) location.href = '/login';

document.getElementById('header-username').textContent = localStorage.getItem('username') || '';
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
  location.href = '/login';
});

async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...options.headers, 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 401) {
    localStorage.removeItem('authToken');
    location.href = '/login';
    return Promise.reject(new Error('認証エラー'));
  }
  return res;
}

// ── 本日の日付 ──
const now = new Date();
const DOW = ['日','月','火','水','木','金','土'];
const todayStr = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');

document.getElementById('daily-date').textContent =
  `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${DOW[now.getDay()]}）`;

function currentTime() {
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

// ── 経由駅マネージャー ──
function makeViaManager(listId, addBtnId) {
  function sync() {
    const rows = document.querySelectorAll(`#${listId} .via-row`);
    rows.forEach(r => {
      r.querySelector('.btn-remove-via').style.display = rows.length > 1 ? 'flex' : 'none';
    });
  }
  function add(value = '') {
    const list = document.getElementById(listId);
    const row = document.createElement('div');
    row.className = 'via-row';
    const input = document.createElement('input');
    input.type = 'text'; input.placeholder = '例：渋谷'; input.value = value;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-remove-via'; btn.textContent = '−';
    btn.addEventListener('click', () => { list.removeChild(row); sync(); });
    row.appendChild(input); row.appendChild(btn);
    list.appendChild(row);
    sync();
  }
  function reset(stations) {
    document.getElementById(listId).innerHTML = '';
    const arr = stations && stations.length > 0 ? stations : [];
    if (arr.length > 0) arr.forEach(s => add(s));
    else add('');
  }
  function get() {
    return Array.from(document.querySelectorAll(`#${listId} input[type="text"]`))
      .map(i => i.value.trim()).filter(Boolean);
  }
  document.getElementById(addBtnId).addEventListener('click', () => add());
  return { reset, get };
}

const ciVia = makeViaManager('ci-via-list', 'ci-add-via');
const coVia = makeViaManager('co-via-list', 'co-add-via');

// ── 区分切替によるフィールドの表示切替 ──
function toggleTypeFields(prefix) {
  const type = document.getElementById(`${prefix}-type`).value;
  const isAbsent    = type === 'ABSENT';
  const isLateEarly = type === 'LATE' || type === 'EARLY_LEAVE';

  const show = (id, visible) => {
    document.getElementById(id).style.display = visible ? (id.endsWith('-fields') ? 'block' : 'block') : 'none';
  };

  show(`${prefix}-paid-leave-field`, isAbsent);
  show(`${prefix}-half-paid-field`,  isLateEarly);
  show(`${prefix}-reason-field`,     isAbsent || isLateEarly);
  show(`${prefix}-time-fields`,      !isAbsent);
  show(`${prefix}-work-fields`,      !isAbsent);

  // 出勤ボタンのラベル変更（ci のみ）
  if (prefix === 'ci') {
    const btn = document.getElementById('ci-submit-btn');
    if (isAbsent)         { btn.textContent = '欠勤を登録する'; btn.className = 'btn-daily btn-absent'; }
    else if (isLateEarly) { btn.textContent = '遅刻・早退を登録する'; btn.className = 'btn-daily btn-absent'; }
    else                  { btn.textContent = '出勤する'; btn.className = 'btn-daily btn-checkin'; }
  }
}

document.getElementById('ci-type').addEventListener('change', () => toggleTypeFields('ci'));
document.getElementById('co-type').addEventListener('change', () => toggleTypeFields('co'));

// ── 状態管理 ──
let record = null;

const TYPE_LABELS = { PRESENT: '出勤', ABSENT: '欠勤', LATE: '遅刻', EARLY_LEAVE: '早退' };

function showState(id) {
  ['state-loading','state-none','state-in','state-done','state-other'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function showError(errId, msg) {
  const el = document.getElementById(errId);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(errId) {
  document.getElementById(errId).classList.add('hidden');
}

// ── デフォルト値でフォームを埋める（出勤登録時） ──
function fillCheckinDefaults() {
  const d = getDefaults();

  document.getElementById('ci-type').value     = 'PRESENT';
  document.getElementById('ci-start').value    = currentTime();
  document.getElementById('ci-end').value      = d.end_time || '';
  document.getElementById('ci-paid-leave').checked = false;
  document.getElementById('ci-half-paid').checked  = false;
  document.getElementById('ci-reason').value   = '';
  document.getElementById('ci-dep').value      = d.departure_station || '';
  document.getElementById('ci-arr').value      = d.arrival_station || '';
  document.getElementById('ci-cost').value     = d.transport_cost != null ? d.transport_cost : '';
  document.getElementById('ci-desc').value     = d.work_description || '';
  document.getElementById('ci-note').value     = '';

  ciVia.reset(d.via_stations || []);

  const locs = d.work_locations || [];
  document.querySelectorAll('input[name="ci-loc"]').forEach(cb => {
    cb.checked = locs.includes(cb.value);
  });

  toggleTypeFields('ci');
}

// ── 既存レコードでフォームを埋める（退勤登録時） ──
function fillCheckoutFromRecord(r) {
  document.getElementById('co-type').value     = r.type;
  document.getElementById('co-end').value      = currentTime();
  document.getElementById('co-start').value    = r.start_time ? r.start_time.substring(0,5) : '';
  document.getElementById('co-paid-leave').checked = r.paid_leave || false;
  document.getElementById('co-half-paid').checked  = r.half_paid_leave || false;
  document.getElementById('co-reason').value   = r.reason || '';
  document.getElementById('co-dep').value      = r.departure_station || '';
  document.getElementById('co-arr').value      = r.arrival_station || '';
  document.getElementById('co-cost').value     = r.transport_cost != null ? r.transport_cost : '';
  document.getElementById('co-desc').value     = r.work_description || '';
  document.getElementById('co-note').value     = r.note || '';

  coVia.reset(r.via_station || []);

  const locs = Array.isArray(r.work_location) ? r.work_location : [];
  document.querySelectorAll('input[name="co-loc"]').forEach(cb => {
    cb.checked = locs.includes(cb.value);
  });

  toggleTypeFields('co');
}

// ── フォームからペイロードを組み立てる ──
function buildPayload(prefix, date) {
  const type = document.getElementById(`${prefix}-type`).value;
  const isAbsent    = type === 'ABSENT';
  const isLateEarly = type === 'LATE' || type === 'EARLY_LEAVE';

  const startTime = isAbsent ? null : (document.getElementById(`${prefix}-start`).value || null);
  const endTime   = isAbsent ? null : (document.getElementById(`${prefix}-end`).value   || null);

  const paid_leave      = isAbsent    && document.getElementById(`${prefix}-paid-leave`).checked;
  const half_paid_leave = isLateEarly && document.getElementById(`${prefix}-half-paid`).checked;
  const reason = (isAbsent || isLateEarly) ? (document.getElementById(`${prefix}-reason`).value.trim() || null) : null;

  const workLocList = Array.from(document.querySelectorAll(`input[name="${prefix}-loc"]:checked`)).map(cb => cb.value);
  const work_location    = isAbsent ? null : (workLocList.length ? workLocList : null);
  const work_description = isAbsent ? null : (document.getElementById(`${prefix}-desc`).value.trim() || null);
  const departure_station = isAbsent ? null : (document.getElementById(`${prefix}-dep`).value.trim() || null);
  const arrival_station   = isAbsent ? null : (document.getElementById(`${prefix}-arr`).value.trim() || null);
  const viaList  = isAbsent ? null : ((prefix === 'ci' ? ciVia : coVia).get());
  const via_station = (viaList && viaList.length > 0) ? viaList : null;
  const costVal = document.getElementById(`${prefix}-cost`).value;
  const transport_cost = (isAbsent || costVal === '') ? null : parseInt(costVal, 10);
  const note = document.getElementById(`${prefix}-note`).value.trim() || null;

  return {
    date, type, start_time: startTime, end_time: endTime,
    paid_leave, half_paid_leave, reason,
    work_location, work_description,
    departure_station, via_station, arrival_station, transport_cost,
    note,
  };
}

// ── 状態描画 ──
function renderState() {
  hideError('daily-error-ci');
  hideError('daily-error-co');

  if (!record) {
    fillCheckinDefaults();
    showState('state-none');
    return;
  }

  if (record.type !== 'PRESENT') {
    const label = TYPE_LABELS[record.type] || record.type;
    document.getElementById('other-badge').textContent = label;
    showState('state-other');
    return;
  }

  if (!record.end_time) {
    const start = record.start_time ? record.start_time.substring(0,5) : '';
    document.getElementById('checkin-info').textContent = `出勤時刻：${start}`;
    fillCheckoutFromRecord(record);
    showState('state-in');
    return;
  }

  // 退勤済み
  const start = record.start_time ? record.start_time.substring(0,5) : '';
  const end   = record.end_time   ? record.end_time.substring(0,5)   : '';
  const locs  = Array.isArray(record.work_location) ? record.work_location.join('・') : '';
  const desc  = record.work_description || '';

  let html = `<div class="summary-row"><span>出勤</span><strong>${start}</strong></div>
              <div class="summary-row"><span>退勤</span><strong>${end}</strong></div>`;
  if (locs) html += `<div class="summary-row"><span>勤務地</span><span>${locs}</span></div>`;
  if (desc) html += `<div class="summary-row"><span>業務内容</span><span>${desc}</span></div>`;

  document.getElementById('daily-summary').innerHTML = html;
  showState('state-done');
}

// ── 出勤登録 ──
document.getElementById('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('daily-error-ci');

  const type = document.getElementById('ci-type').value;
  const isAbsent = type === 'ABSENT';

  if (!isAbsent && !document.getElementById('ci-start').value) {
    showError('daily-error-ci', '出勤時刻を入力してください。');
    return;
  }

  const btn = document.getElementById('ci-submit-btn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '登録中...';

  try {
    const res = await authFetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload('ci', todayStr)),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showError('daily-error-ci', err.message || '登録に失敗しました。');
      return;
    }
    record = await res.json();
    renderState();
  } catch {
    showError('daily-error-ci', '通信エラーが発生しました。');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
});

// ── 退勤登録 ──
document.getElementById('checkout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError('daily-error-co');

  if (!document.getElementById('co-end').value) {
    showError('daily-error-co', '退勤時刻を入力してください。');
    return;
  }
  if (!record) return;

  const btn = document.getElementById('co-submit-btn');
  btn.disabled = true; btn.textContent = '登録中...';

  try {
    const payload = buildPayload('co', todayStr);
    // 退勤登録時は出勤時刻を既存レコードから引き継ぐ
    if (!payload.start_time) payload.start_time = record.start_time;

    const res = await authFetch(`/api/attendance/${record.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showError('daily-error-co', err.message || '退勤登録に失敗しました。');
      return;
    }
    record = await res.json();
    renderState();
  } catch {
    showError('daily-error-co', '通信エラーが発生しました。');
  } finally {
    btn.disabled = false; btn.textContent = '退勤する';
  }
});

// ── 今日のデータ取得 ──
async function loadToday() {
  try {
    const res = await authFetch(`/api/attendance?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
    if (!res.ok) throw new Error();
    const list = await res.json();
    record = list.find(r => r.date === todayStr) || null;
    renderState();
  } catch {
    fillCheckinDefaults();
    showState('state-none');
    showError('daily-error-ci', 'データの取得に失敗しました。');
  }
}

loadToday();
