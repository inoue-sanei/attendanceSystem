'use strict';

const DEFAULTS_KEY = 'attendanceDefaults';
function getDefaults() {
  try { return JSON.parse(localStorage.getItem(DEFAULTS_KEY)) || {}; }
  catch { return {}; }
}

const TYPE_LABELS = {
  PRESENT:     '出勤',
  ABSENT:      '欠勤',
  LATE:        '遅刻',
  EARLY_LEAVE: '早退',
};

const TYPE_COLORS = {
  PRESENT:     '#4CAF50',
  ABSENT:      '#f44336',
  LATE:        '#FF9800',
  EARLY_LEAVE: '#FFC107',
};

function toTimeInput(timeStr) {
  if (!timeStr) return '';
  return timeStr.substring(0, 5);
}

// ────────────────────────────────
//  認証
// ────────────────────────────────
function getToken() {
  return localStorage.getItem('authToken');
}

function logout() {
  const _t = localStorage.getItem('authToken');
  if (_t) fetch('/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${_t}` } }).catch(() => {});
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
  location.href = '/login';
}

// 認証ヘッダー付き fetch。401 はログアウト処理へ
async function authFetch(url, options = {}) {
  const token = getToken();
  if (!token) {
    logout();
    return Promise.reject(new Error('未認証'));
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    logout();
    return Promise.reject(new Error('認証エラー'));
  }
  return res;
}

let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let attendanceMap = {};
let holidayMap   = {};
let editingId    = null;
let selectedDate = null;
let isConfirmed      = false;
let approvalStatus   = null;  // 'PENDING' | 'APPROVED' | 'REJECTED' | null
let rejectionReason  = null;

// ────────────────────────────────
//  初期化
// ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 未認証ならログインページへ
  if (!getToken()) {
    location.href = '/login';
    return;
  }

  // ユーザー名をヘッダーに表示
  const username = localStorage.getItem('username');
  if (username) {
    document.getElementById('header-username').textContent = username;
  }

  document.getElementById('logout-btn').addEventListener('click', logout);

  renderCalendar();
  fetchMonthData();
  initViaStations();

  document.getElementById('prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    renderCalendar();
    fetchMonthData();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    renderCalendar();
    fetchMonthData();
  });

  ['type-select', 'start-time', 'end-time', 'work-description', 'reason'].forEach(id => {
    document.getElementById(id).addEventListener('input', validateSaveButton);
    document.getElementById(id).addEventListener('change', validateSaveButton);
  });

  document.getElementById('type-select').addEventListener('change', toggleTypeFields);
  document.getElementById('add-via-btn').addEventListener('click', () => addViaStationField(''));
  document.getElementById('modal-overlay').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('save-btn').addEventListener('click', onSaveClick);
  document.getElementById('delete-btn').addEventListener('click', deleteAttendance);
  document.getElementById('confirm-month-btn').addEventListener('click', onConfirmMonthClick);
  document.getElementById('bulk-register-btn').addEventListener('click', onBulkRegisterClick);
  document.getElementById('bulk-delete-btn').addEventListener('click', onBulkDeleteClick);
  document.getElementById('bulk-delete-cancel-btn').addEventListener('click', closeBulkDeleteModal);
  document.getElementById('bulk-delete-overlay').addEventListener('click', closeBulkDeleteModal);
  document.getElementById('bulk-delete-select-all').addEventListener('change', e => {
    document.querySelectorAll('.bulk-delete-check').forEach(cb => { cb.checked = e.target.checked; });
    updateBulkDeleteCount();
  });
  document.getElementById('bulk-delete-ok-btn').addEventListener('click', onBulkDeleteOkClick);
});

// ────────────────────────────────
//  経由駅 動的フィールド
// ────────────────────────────────
function initViaStations() {
  addViaStationField('');
}

function addViaStationField(value) {
  const list = document.getElementById('via-station-list');
  const row  = document.createElement('div');
  row.className = 'via-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '例：渋谷';
  input.value = value;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-via';
  removeBtn.textContent = '−';
  removeBtn.addEventListener('click', () => {
    list.removeChild(row);
    _syncRemoveButtons();
  });

  row.appendChild(input);
  row.appendChild(removeBtn);
  list.appendChild(row);
  _syncRemoveButtons();
}

function _syncRemoveButtons() {
  const rows = document.querySelectorAll('#via-station-list .via-row');
  rows.forEach(r => {
    r.querySelector('.btn-remove-via').style.display = rows.length > 1 ? 'flex' : 'none';
  });
}

function setViaStations(stations) {
  const list = document.getElementById('via-station-list');
  list.innerHTML = '';
  if (!stations || stations.length === 0) {
    addViaStationField('');
  } else {
    stations.forEach(s => addViaStationField(s));
  }
}

function getViaStations() {
  return Array.from(document.querySelectorAll('#via-station-list input[type="text"]'))
    .map(i => i.value.trim())
    .filter(Boolean);
}

// ────────────────────────────────
//  データ取得
// ────────────────────────────────
async function fetchMonthData() {
  await Promise.all([fetchAttendance(), fetchConfirmationStatus(), fetchHolidays()]);
}

async function fetchAttendance() {
  try {
    const res = await authFetch(`/api/attendance?year=${currentYear}&month=${currentMonth}`);
    if (!res.ok) throw new Error();
    const records = await res.json();
    attendanceMap = {};
    records.forEach(r => { attendanceMap[r.date] = r; });
    updateCalendarCells();
  } catch { /* ignore */ }
}

async function fetchHolidays() {
  try {
    const res = await authFetch(`/api/holidays?year=${currentYear}&month=${currentMonth}`);
    if (!res.ok) throw new Error();
    const list = await res.json();
    holidayMap = {};
    list.forEach(h => { holidayMap[h.date] = h.name; });
    updateHolidayCells();
  } catch {
    holidayMap = {};
  }
}

async function fetchConfirmationStatus() {
  try {
    const res = await authFetch(`/api/confirmation?year=${currentYear}&month=${currentMonth}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    isConfirmed     = data.confirmed;
    approvalStatus  = data.approval_status || null;
    rejectionReason = data.rejection_reason || null;
    updateConfirmationUI();
  } catch {
    isConfirmed = false;
    approvalStatus = null;
    rejectionReason = null;
    updateConfirmationUI();
  }
}

// ────────────────────────────────
//  カレンダー描画
// ────────────────────────────────
function renderCalendar() {
  document.getElementById('current-month').textContent =
    `${currentYear}年${currentMonth}月`;

  const grid = document.getElementById('calendar-grid');
  grid.querySelectorAll('.day-cell').forEach(c => c.remove());

  const firstDow  = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysCount = new Date(currentYear, currentMonth, 0).getDate();
  const today     = new Date();

  for (let i = 0; i < firstDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'day-cell empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysCount; day++) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dow     = new Date(currentYear, currentMonth - 1, day).getDay();

    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (dow === 0) cell.classList.add('sunday');
    if (dow === 6) cell.classList.add('saturday');
    if (currentYear === today.getFullYear()
        && currentMonth === today.getMonth() + 1
        && day === today.getDate()) {
      cell.classList.add('today');
    }
    cell.dataset.date = dateStr;

    const num = document.createElement('span');
    num.className = 'day-number';
    num.textContent = day;
    cell.appendChild(num);

    const holidayLabel = document.createElement('span');
    holidayLabel.className = 'holiday-label';
    cell.appendChild(holidayLabel);

    const badge = document.createElement('span');
    badge.className = 'attendance-badge';
    cell.appendChild(badge);

    cell.addEventListener('click', () => {
      // REJECTED は再編集可能。PENDING/APPROVED はロック
      if (isConfirmed && approvalStatus !== 'REJECTED') return;
      openModal(dateStr);
    });
    grid.appendChild(cell);
  }

  updateCalendarCells();
  updateHolidayCells();
}

function updateHolidayCells() {
  document.querySelectorAll('.day-cell[data-date]').forEach(cell => {
    const lbl  = cell.querySelector('.holiday-label');
    const name = holidayMap[cell.dataset.date];
    if (name) {
      lbl.textContent = name;
      cell.classList.add('holiday');
    } else {
      lbl.textContent = '';
      cell.classList.remove('holiday');
    }
  });
}

function updateCalendarCells() {
  document.querySelectorAll('.day-cell[data-date]').forEach(cell => {
    const badge  = cell.querySelector('.attendance-badge');
    const record = attendanceMap[cell.dataset.date];
    if (record) {
      badge.textContent = _badgeLabel(record);
      badge.style.backgroundColor = TYPE_COLORS[record.type] || '#999';
      const hasPaidLeave = (record.type === 'ABSENT' && record.paid_leave) ||
        ((record.type === 'LATE' || record.type === 'EARLY_LEAVE') && record.half_paid_leave);
      if (hasPaidLeave) {
        const s = record.paid_leave_approval_status;
        badge.style.outline = s === 'REJECTED'  ? '2px solid #D32F2F'
                            : s === 'APPROVED'  ? '2px solid #2E7D32'
                            :                    '2px solid #FF9800';
      } else {
        badge.style.outline = 'none';
      }
      badge.style.display = 'inline-block';
    } else {
      badge.textContent = '';
      badge.style.display = 'none';
    }
  });
}

function _badgeLabel(record) {
  const s = record.paid_leave_approval_status;
  const rejected = s === 'REJECTED';
  if (record.type === 'ABSENT'      && record.paid_leave)      return rejected ? '欠勤（有給否認）' : '欠勤（有給）';
  if (record.type === 'LATE'        && record.half_paid_leave) return rejected ? '遅刻（半休否認）' : '遅刻（半休）';
  if (record.type === 'EARLY_LEAVE' && record.half_paid_leave) return rejected ? '早退（半休否認）' : '早退（半休）';
  return TYPE_LABELS[record.type];
}

function updateConfirmationUI() {
  const banner         = document.getElementById('confirmed-banner');
  const rejectedBanner = document.getElementById('rejected-banner');
  const confirmBtn     = document.getElementById('confirm-month-btn');
  const bulkBtn        = document.getElementById('bulk-register-btn');
  const bulkDelBtn     = document.getElementById('bulk-delete-btn');
  const grid           = document.getElementById('calendar-grid');

  // すべて初期化
  banner.classList.add('hidden');
  rejectedBanner.classList.add('hidden');
  grid.classList.remove('confirmed');

  if (!isConfirmed) {
    // 未確定 → 通常編集可
    confirmBtn.classList.remove('hidden');
    bulkBtn.classList.remove('hidden');
    bulkDelBtn.classList.remove('hidden');
    return;
  }

  if (approvalStatus === 'REJECTED') {
    // 否認 → 編集可、再申請ボタン表示
    document.getElementById('rejected-banner-reason').textContent =
      rejectionReason ? `否認理由: ${rejectionReason}` : '';
    rejectedBanner.classList.remove('hidden');
    confirmBtn.classList.remove('hidden');
    confirmBtn.textContent = 'この月を再申請する';
    bulkBtn.classList.remove('hidden');
    bulkDelBtn.classList.remove('hidden');
    return;
  }

  // PENDING / APPROVED → 編集ロック
  const iconEl = document.getElementById('confirmed-icon');
  const textEl = document.getElementById('confirmed-banner-text');
  const label  = `${currentYear}年${currentMonth}月`;

  if (approvalStatus === 'PENDING') {
    iconEl.textContent = '⏳';
    textEl.textContent = `${label}は申請済みです。管理者の承認をお待ちください。`;
  } else {
    iconEl.textContent = '✓';
    textEl.textContent = `${label}は承認済みです。勤怠情報の変更はできません。`;
  }
  banner.classList.remove('hidden');
  confirmBtn.classList.add('hidden');
  bulkBtn.classList.add('hidden');
  bulkDelBtn.classList.add('hidden');
  grid.classList.add('confirmed');
}

// ────────────────────────────────
//  勤怠登録モーダル
// ────────────────────────────────
function openModal(dateStr) {
  selectedDate = dateStr;
  const record = attendanceMap[dateStr];
  editingId = record ? record.id : null;

  const [y, m, d] = dateStr.split('-');
  document.getElementById('modal-date-label').textContent =
    `${y}年${parseInt(m)}月${parseInt(d)}日`;

  if (record) {
    document.getElementById('type-select').value           = record.type;
    document.getElementById('start-time').value            = toTimeInput(record.start_time);
    document.getElementById('end-time').value              = toTimeInput(record.end_time);
    document.getElementById('note').value                  = record.note || '';
    document.getElementById('paid-leave').checked          = record.paid_leave;
    document.getElementById('half-paid-leave').checked     = record.half_paid_leave;
    document.getElementById('work-description').value      = record.work_description || '';
    document.getElementById('reason').value                = record.reason || '';
    document.getElementById('departure-station').value     = record.departure_station || '';
    document.getElementById('arrival-station').value       = record.arrival_station || '';
    document.getElementById('transport-cost').value =
      record.transport_cost != null ? record.transport_cost : '';
    document.getElementById('break-start').value = toTimeInput(record.break_start);
    document.getElementById('break-end').value   = toTimeInput(record.break_end);
    document.querySelectorAll('input[name="work-location"]').forEach(cb => {
      cb.checked = Array.isArray(record.work_location) && record.work_location.includes(cb.value);
    });
    setViaStations(record.via_station);
    document.getElementById('delete-btn').style.display = 'inline-block';
  } else {
    const _d = getDefaults();
    document.getElementById('type-select').value           = 'PRESENT';
    document.getElementById('start-time').value            = _d.start_time || '';
    document.getElementById('end-time').value              = _d.end_time || '';
    document.getElementById('note').value                  = '';
    document.getElementById('paid-leave').checked          = false;
    document.getElementById('half-paid-leave').checked     = false;
    document.getElementById('work-description').value      = _d.work_description || '';
    document.getElementById('reason').value                = '';
    document.getElementById('departure-station').value     = _d.departure_station || '';
    document.getElementById('arrival-station').value       = _d.arrival_station || '';
    document.getElementById('transport-cost').value = _d.transport_cost != null ? _d.transport_cost : '';
    document.getElementById('break-start').value   = _d.break_start || '';
    document.getElementById('break-end').value     = _d.break_end   || '';
    setViaStations(_d.via_stations && _d.via_stations.length > 0 ? _d.via_stations : []);
    const _defLocs = _d.work_locations || [];
    document.querySelectorAll('input[name="work-location"]').forEach(cb => {
      cb.checked = _defLocs.includes(cb.value);
    });
    document.getElementById('delete-btn').style.display = 'none';
  }

  // 有給・半休申請ステータス表示
  const plField    = document.getElementById('paid-leave-status-field');
  const plBadge    = document.getElementById('paid-leave-status-badge');
  const plReason   = document.getElementById('paid-leave-rejection-reason-text');
  const hasPL = record && (
    (record.type === 'ABSENT'      && record.paid_leave) ||
    ((record.type === 'LATE' || record.type === 'EARLY_LEAVE') && record.half_paid_leave)
  );
  if (hasPL && record.paid_leave_approval_status) {
    const s = record.paid_leave_approval_status;
    const PL_LABELS = { PENDING: '申請中（承認待ち）', APPROVED: '承認済', REJECTED: '否認' };
    plBadge.textContent = PL_LABELS[s] || s;
    plBadge.className   = `approval-status-badge approval-status-badge--${s.toLowerCase()}`;
    if (s === 'REJECTED' && record.paid_leave_rejection_reason) {
      plReason.textContent    = `否認理由: ${record.paid_leave_rejection_reason}`;
      plReason.style.display  = 'block';
    } else {
      plReason.style.display = 'none';
    }
    plField.style.display = 'block';
  } else {
    plField.style.display = 'none';
  }

  document.querySelector('.modal-body').scrollTop = 0;
  toggleTypeFields();
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  editingId    = null;
  selectedDate = null;
}

function toggleTypeFields() {
  const type        = document.getElementById('type-select').value;
  const isAbsent    = type === 'ABSENT';
  const isLateEarly = type === 'LATE' || type === 'EARLY_LEAVE';
  const needsReason = isAbsent || isLateEarly;

  document.getElementById('paid-leave-field').style.display       = isAbsent    ? 'block' : 'none';
  document.getElementById('half-paid-leave-field').style.display  = isLateEarly ? 'block' : 'none';
  document.getElementById('reason-field').style.display           = needsReason ? 'block' : 'none';
  document.getElementById('time-fields').style.display            = isAbsent    ? 'none'  : 'flex';
  document.getElementById('break-time-fields').style.display      = isAbsent    ? 'none'  : 'flex';
  document.getElementById('work-location-field').style.display    = isAbsent    ? 'none'  : 'block';
  document.getElementById('transit-fields').style.display         = isAbsent    ? 'none'  : 'block';
  document.getElementById('work-description-field').style.display = isAbsent    ? 'none'  : 'block';

  validateSaveButton();
}

function validateSaveButton() {
  const type     = document.getElementById('type-select').value;
  const btn      = document.getElementById('save-btn');
  const isAbsent = type === 'ABSENT';
  const needsReason = type !== 'PRESENT';

  let valid = true;

  if (!isAbsent) {
    const startTime = document.getElementById('start-time').value;
    if (!startTime) valid = false;
  }

  if (needsReason) {
    if (!document.getElementById('reason').value.trim()) valid = false;
  }

  btn.disabled = !valid;
}

// ────────────────────────────────
//  保存確認ポップアップ
// ────────────────────────────────
function onSaveClick() {
  const type        = document.getElementById('type-select').value;
  const isAbsent    = type === 'ABSENT';
  const isLateEarly = type === 'LATE' || type === 'EARLY_LEAVE';
  const paidLeave     = isAbsent    && document.getElementById('paid-leave').checked;
  const halfPaidLeave = isLateEarly && document.getElementById('half-paid-leave').checked;
  const startTime   = document.getElementById('start-time').value;
  const endTime     = document.getElementById('end-time').value;
  const workDesc    = document.getElementById('work-description').value.trim();
  const note        = document.getElementById('note').value.trim();
  const reason      = document.getElementById('reason').value.trim();
  const workLoc     = Array.from(document.querySelectorAll('input[name="work-location"]:checked'))
                        .map(cb => cb.value);
  const depStation  = document.getElementById('departure-station').value.trim();
  const viaStations = getViaStations();
  const arrStation  = document.getElementById('arrival-station').value.trim();
  const costVal    = document.getElementById('transport-cost').value;
  const transCost  = costVal !== '' ? parseInt(costVal, 10) : null;
  const breakStart = document.getElementById('break-start').value || null;
  const breakEnd   = document.getElementById('break-end').value   || null;

  showGenericConfirm({
    title: '保存の確認',
    okLabel: '保存する',
    body: buildSaveDetails({
      type, paidLeave, halfPaidLeave, startTime, endTime, reason,
      workLoc, workDesc, note, depStation, viaStations, arrStation, transCost, breakStart, breakEnd,
    }),
    onOk: saveAttendance,
  });
}

function buildSaveDetails({ type, paidLeave, halfPaidLeave, startTime, endTime, reason,
    workLoc, workDesc, note, depStation, viaStations, arrStation, transCost, breakStart, breakEnd }) {
  const [y, m, d] = selectedDate.split('-');
  let typeLabel = TYPE_LABELS[type];
  if (paidLeave)     typeLabel += '（有給）';
  if (halfPaidLeave) typeLabel += '（半休）';

  let rows = `<tr><th>日付</th><td>${y}年${parseInt(m)}月${parseInt(d)}日</td></tr>
              <tr><th>区分</th><td>${typeLabel}</td></tr>`;

  if (reason) rows += `<tr><th>理由</th><td>${reason}</td></tr>`;

  if (type !== 'ABSENT') {
    if (startTime)             rows += `<tr><th>出勤時刻</th><td>${startTime}</td></tr>`;
    if (endTime)               rows += `<tr><th>退勤時刻</th><td>${endTime}</td></tr>`;
    if (breakStart)            rows += `<tr><th>休憩</th><td>${breakStart} ～ ${breakEnd || ''}</td></tr>`;
    if (workLoc.length > 0)    rows += `<tr><th>勤務地</th><td>${workLoc.join('、')}</td></tr>`;
    if (depStation)            rows += `<tr><th>出発駅</th><td>${depStation}</td></tr>`;
    if (viaStations.length > 0) rows += `<tr><th>経由駅</th><td>${viaStations.join(' → ')}</td></tr>`;
    if (arrStation)            rows += `<tr><th>到着駅</th><td>${arrStation}</td></tr>`;
    if (transCost !== null)    rows += `<tr><th>交通費</th><td>¥${transCost.toLocaleString()}</td></tr>`;
    if (workDesc)              rows += `<tr><th>業務内容</th><td>${workDesc}</td></tr>`;
  }
  if (note) rows += `<tr><th>メモ</th><td>${note}</td></tr>`;
  return `<table class="confirm-table"><tbody>${rows}</tbody></table>`;
}

// ────────────────────────────────
//  勤怠保存・削除
// ────────────────────────────────
async function saveAttendance() {
  const type          = document.getElementById('type-select').value;
  const is_absent     = type === 'ABSENT';
  const is_late_early = type === 'LATE' || type === 'EARLY_LEAVE';
  const paid_leave    = is_absent     && document.getElementById('paid-leave').checked;
  const half_paid_leave = is_late_early && document.getElementById('half-paid-leave').checked;
  const start_time    = is_absent ? null : (document.getElementById('start-time').value || null);
  const end_time      = is_absent ? null : (document.getElementById('end-time').value   || null);
  const note          = document.getElementById('note').value.trim() || null;
  const reason        = (type !== 'PRESENT') ? (document.getElementById('reason').value.trim() || null) : null;
  const workLocList   = Array.from(document.querySelectorAll('input[name="work-location"]:checked'))
                          .map(cb => cb.value);
  const work_location    = is_absent ? null : (workLocList.length ? workLocList : null);
  const work_description = is_absent ? null : (document.getElementById('work-description').value.trim() || null);
  const departure_station = is_absent ? null : (document.getElementById('departure-station').value.trim() || null);
  const via_station       = is_absent ? null : (getViaStations().length ? getViaStations() : null);
  const arrival_station   = is_absent ? null : (document.getElementById('arrival-station').value.trim() || null);
  const costVal = document.getElementById('transport-cost').value;
  const transport_cost = (is_absent || costVal === '') ? null : parseInt(costVal, 10);
  const break_start = is_absent ? null : (document.getElementById('break-start').value || null);
  const break_end   = is_absent ? null : (document.getElementById('break-end').value   || null);

  const url    = editingId ? `/api/attendance/${editingId}` : '/api/attendance';
  const method = editingId ? 'PUT' : 'POST';

  try {
    const res = await authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: selectedDate, type, start_time, end_time, note,
        paid_leave, half_paid_leave, work_location, work_description,
        departure_station, via_station, arrival_station, transport_cost,
        break_start, break_end, reason,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.message || '保存に失敗しました');
      return;
    }

    const record = await res.json();
    attendanceMap[record.date] = record;
    updateCalendarCells();
    closeModal();
  } catch {
    alert('通信エラーが発生しました');
  }
}

async function deleteAttendance() {
  if (!editingId) return;
  if (!confirm('この勤怠記録を削除しますか？')) return;

  try {
    const res = await authFetch(`/api/attendance/${editingId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.message || '削除に失敗しました');
      return;
    }
    delete attendanceMap[selectedDate];
    updateCalendarCells();
    closeModal();
  } catch {
    alert('通信エラーが発生しました');
  }
}

// ────────────────────────────────
//  平日一括出勤登録
// ────────────────────────────────
function onBulkRegisterClick() {
  const DOW_LABELS = ['日','月','火','水','木','金','土'];
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const targets = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dow = new Date(currentYear, currentMonth - 1, day).getDay();
    if (dow !== 0 && dow !== 6 && !attendanceMap[dateStr] && !holidayMap[dateStr]) {
      targets.push({ dateStr, dow });
    }
  }

  if (targets.length === 0) {
    alert('登録対象の平日がありません（全て登録済みか祝日です）');
    return;
  }

  const _bd = getDefaults();
  const startTime   = _bd.start_time || '';
  const endTime     = _bd.end_time || '';
  const dep         = _bd.departure_station || '';
  const viaArr      = _bd.via_stations || [];
  const arr         = _bd.arrival_station || '';
  const costRaw     = _bd.transport_cost != null ? String(_bd.transport_cost) : '';
  const defWorkLocs = _bd.work_locations || [];
  const defWorkDesc = _bd.work_description || '';

  const settingRows = [];
  if (startTime)            settingRows.push(`<tr><th>出勤時刻</th><td>${startTime}</td></tr>`);
  if (endTime)              settingRows.push(`<tr><th>退勤時刻</th><td>${endTime}</td></tr>`);
  if (defWorkLocs.length)   settingRows.push(`<tr><th>勤務地</th><td>${defWorkLocs.join('、')}</td></tr>`);
  if (defWorkDesc)          settingRows.push(`<tr><th>業務内容</th><td>${defWorkDesc}</td></tr>`);
  if (dep)                  settingRows.push(`<tr><th>出発駅</th><td>${dep}</td></tr>`);
  if (viaArr.length)        settingRows.push(`<tr><th>経由駅</th><td>${viaArr.join(' → ')}</td></tr>`);
  if (arr)                  settingRows.push(`<tr><th>到着駅</th><td>${arr}</td></tr>`);
  if (costRaw)              settingRows.push(`<tr><th>交通費</th><td>¥${parseInt(costRaw, 10).toLocaleString()}</td></tr>`);

  const dateLabels = targets
    .map(t => `${parseInt(t.dateStr.split('-')[2])}日(${DOW_LABELS[t.dow]})`)
    .join('、');

  const settingsHtml = settingRows.length > 0
    ? `<div class="bulk-defaults-section">
        <div class="bulk-defaults-label">デフォルト設定</div>
        <table class="confirm-table"><tbody>${settingRows.join('')}</tbody></table>
       </div>`
    : `<p class="bulk-no-defaults">※ デフォルト設定なし（時刻・交通情報は空欄で登録されます）</p>`;

  showGenericConfirm({
    title: '平日一括出勤登録',
    okLabel: '一括登録する',
    okClass: 'btn-bulk-ok',
    body: `<div class="bulk-confirm-body">
      <p class="bulk-target-summary">
        <strong>${currentYear}年${currentMonth}月</strong> の未登録の平日
        <em>${targets.length}日</em> に出勤を登録します
      </p>
      <div class="bulk-target-dates">${dateLabels}</div>
      ${settingsHtml}
      <p class="bulk-note">祝日・登録済みの日はスキップします</p>
    </div>`,
    onOk: () => executeBulkRegister(targets.map(t => t.dateStr)),
  });
}

async function executeBulkRegister(datelist) {
  const _ed = getDefaults();
  const start_time        = _ed.start_time || null;
  const end_time          = _ed.end_time || null;
  const departure_station = _ed.departure_station || null;
  const arrival_station   = _ed.arrival_station || null;
  const transport_cost    = _ed.transport_cost != null ? _ed.transport_cost : null;
  const via_station       = (_ed.via_stations && _ed.via_stations.length > 0) ? _ed.via_stations : null;
  const work_location     = (_ed.work_locations && _ed.work_locations.length > 0) ? _ed.work_locations : null;
  const work_description  = _ed.work_description || null;
  const break_start       = _ed.break_start || null;
  const break_end         = _ed.break_end   || null;

  const results = await Promise.allSettled(
    datelist.map(date =>
      authFetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, type: 'PRESENT',
          start_time, end_time,
          work_location, work_description,
          departure_station, via_station, arrival_station, transport_cost,
          break_start, break_end,
        }),
      }).then(async res => {
        if (!res.ok) throw new Error();
        return res.json();
      })
    )
  );

  let successCount = 0;
  results.forEach(r => {
    if (r.status === 'fulfilled') {
      attendanceMap[r.value.date] = r.value;
      successCount++;
    }
  });
  updateCalendarCells();

  const failCount = datelist.length - successCount;
  if (failCount > 0) {
    alert(`${successCount}件を登録しました。${failCount}件は登録できませんでした。`);
  }
}

// ────────────────────────────────
//  月次確定
// ────────────────────────────────
function onConfirmMonthClick() {
  showGenericConfirm({
    title: '月次確定の確認',
    okLabel: '確定する',
    okClass: 'btn-confirm-ok',
    body: `<div class="confirm-month-body">
      <p class="confirm-month-target">${currentYear}年${currentMonth}月</p>
      <p class="confirm-month-note">一度確定すると、この月の勤怠情報は変更できなくなります。</p>
    </div>`,
    onOk: confirmMonth,
  });
}

async function confirmMonth() {
  try {
    const res = await authFetch(
      `/api/confirmation?year=${currentYear}&month=${currentMonth}`,
      { method: 'POST' }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.detail === 'PENDING_LEAVE_APPROVAL') {
        showPendingLeaveModal();
        return;
      }
      alert(err.message || '確定に失敗しました');
      return;
    }
    isConfirmed    = true;
    approvalStatus = 'PENDING';
    document.getElementById('confirm-month-btn').textContent = 'この月を確定する';
    updateConfirmationUI();
  } catch {
    alert('通信エラーが発生しました');
  }
}

function showPendingLeaveModal() {
  showGenericConfirm({
    title: '月次確定できません',
    okLabel: '閉じる',
    okClass: 'btn-secondary',
    body: `<div class="confirm-month-body">
      <p class="confirm-month-note" style="color:#E65100;font-weight:600;">⚠ 未承認の有給申請があります</p>
      <p class="confirm-month-note" style="margin-top:8px;">すべての有給申請が承認されるまで、${currentYear}年${currentMonth}月を確定できません。</p>
      <div style="margin-top:16px;display:flex;align-items:center;gap:12px;">
        <button id="send-review-btn" class="btn btn-warning" type="button">管理者に承認を依頼する</button>
        <span id="review-sent-txt" style="display:none;color:#2E7D32;font-size:0.85rem;font-weight:600;">&#10003; 送信しました</span>
      </div>
    </div>`,
    onOk: () => {},
  });
  document.getElementById('send-review-btn').addEventListener('click', async () => {
    const btn = document.getElementById('send-review-btn');
    btn.disabled = true;
    btn.textContent = '送信中...';
    try {
      const res = await authFetch(
        `/api/confirmation/request-leave-review?year=${currentYear}&month=${currentMonth}`,
        { method: 'POST' }
      );
      if (res.ok || res.status === 204) {
        btn.textContent = '送信済み';
        const txt = document.getElementById('review-sent-txt');
        if (txt) txt.style.display = 'inline';
      } else {
        btn.disabled = false;
        btn.textContent = '管理者に承認を依頼する';
        alert('送信に失敗しました。');
      }
    } catch {
      btn.disabled = false;
      btn.textContent = '管理者に承認を依頼する';
      alert('通信エラーが発生しました。');
    }
  });
}

// ────────────────────────────────
//  一括削除
// ────────────────────────────────
const DOW_LABELS_BD = ['日','月','火','水','木','金','土'];

function onBulkDeleteClick() {
  const records = Object.values(attendanceMap)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (records.length === 0) {
    alert('削除できる勤怠記録がありません。');
    return;
  }

  const listEl = document.getElementById('bulk-delete-list');
  listEl.innerHTML = '';

  records.forEach(r => {
    const [, m, d] = r.date.split('-');
    const dow = new Date(r.date + 'T00:00:00').getDay();
    let typeLabel = TYPE_LABELS[r.type] || r.type;
    if (r.paid_leave)      typeLabel += '（有給）';
    if (r.half_paid_leave) typeLabel += '（半休）';

    const timeStr = (r.start_time && r.end_time)
      ? `${r.start_time.substring(0,5)} ～ ${r.end_time.substring(0,5)}`
      : r.start_time ? r.start_time.substring(0,5) : '';

    const label = document.createElement('label');
    label.className = 'bulk-delete-item';
    label.innerHTML = `
      <input type="checkbox" class="bulk-delete-check" value="${r.id}">
      <span class="bulk-delete-date">${parseInt(m)}/${parseInt(d)}（${DOW_LABELS_BD[dow]}）</span>
      <span class="bulk-delete-type" style="color:${TYPE_COLORS[r.type] || '#999'}">${typeLabel}</span>
      ${timeStr ? `<span class="bulk-delete-time">${timeStr}</span>` : ''}`;
    label.querySelector('.bulk-delete-check').addEventListener('change', updateBulkDeleteCount);
    listEl.appendChild(label);
  });

  document.getElementById('bulk-delete-select-all').checked = false;
  document.getElementById('bulk-delete-select-all').indeterminate = false;
  updateBulkDeleteCount();
  document.getElementById('bulk-delete-modal').classList.remove('hidden');
}

function closeBulkDeleteModal() {
  document.getElementById('bulk-delete-modal').classList.add('hidden');
}

function updateBulkDeleteCount() {
  const allCbs     = document.querySelectorAll('.bulk-delete-check');
  const checkedCbs = document.querySelectorAll('.bulk-delete-check:checked');
  const count      = checkedCbs.length;

  document.getElementById('bulk-delete-count').textContent = `${count}件選択中`;
  document.getElementById('bulk-delete-ok-btn').textContent = count > 0 ? `削除する（${count}件）` : '削除する';
  document.getElementById('bulk-delete-ok-btn').disabled = count === 0;

  const selectAll = document.getElementById('bulk-delete-select-all');
  if (count === 0)               { selectAll.indeterminate = false; selectAll.checked = false; }
  else if (count === allCbs.length) { selectAll.indeterminate = false; selectAll.checked = true; }
  else                             { selectAll.indeterminate = true; }
}

function onBulkDeleteOkClick() {
  const ids = Array.from(document.querySelectorAll('.bulk-delete-check:checked'))
    .map(cb => parseInt(cb.value, 10));
  if (ids.length === 0) return;

  closeBulkDeleteModal();
  showGenericConfirm({
    title: '削除の確認',
    okLabel: `${ids.length}件を削除する`,
    okClass: 'btn-danger',
    body: `<div class="confirm-month-body">
      <p class="confirm-month-target">${currentYear}年${currentMonth}月</p>
      <p class="confirm-month-note">選択した <strong>${ids.length}件</strong> の勤怠記録を削除します。<br>この操作は元に戻せません。</p>
    </div>`,
    onOk: () => executeBulkDelete(ids),
  });
}

async function executeBulkDelete(ids) {
  const results = await Promise.allSettled(
    ids.map(id => authFetch(`/api/attendance/${id}`, { method: 'DELETE' }))
  );

  const successIds = new Set();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && (r.value.ok || r.value.status === 204)) {
      successIds.add(ids[i]);
    }
  });

  // attendanceMapから削除済みレコードを除去
  Object.entries(attendanceMap).forEach(([date, rec]) => {
    if (successIds.has(rec.id)) delete attendanceMap[date];
  });

  updateCalendarCells();

  const failCount = ids.length - successIds.size;
  if (failCount > 0) {
    alert(`${successIds.size}件を削除しました。${failCount}件は削除できませんでした。`);
  }
}

// ────────────────────────────────
//  汎用確認モーダル
// ────────────────────────────────
function showGenericConfirm({ title, body, okLabel, okClass = 'btn-primary', onOk }) {
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-body').innerHTML = body;

  const okBtn = document.getElementById('confirm-ok-btn');
  okBtn.textContent = okLabel;
  okBtn.className   = `btn ${okClass}`;

  const modal     = document.getElementById('confirm-modal');
  const cancelBtn = document.getElementById('confirm-cancel-btn');
  const overlay   = document.getElementById('confirm-overlay');

  modal.classList.remove('hidden');

  const close = () => {
    modal.classList.add('hidden');
    okBtn.removeEventListener('click', handleOk);
    cancelBtn.removeEventListener('click', close);
    overlay.removeEventListener('click', close);
  };
  const handleOk = () => { close(); onOk(); };

  okBtn.addEventListener('click', handleOk);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
}
