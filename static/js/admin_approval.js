'use strict';

const token = localStorage.getItem('authToken');
if (!token) location.href = '/login';
if (localStorage.getItem('isAdmin') !== '1') location.href = '/daily';

document.getElementById('header-username').textContent = localStorage.getItem('username') || '';
document.getElementById('logout-btn').addEventListener('click', () => {
  const _t = localStorage.getItem('authToken');
  if (_t) fetch('/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${_t}` } }).catch(() => {});
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
  localStorage.removeItem('isAdmin');
  location.href = '/login';
});

async function authFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...opts.headers, 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 401) {
    localStorage.removeItem('authToken');
    location.href = '/login';
    return Promise.reject();
  }
  return res;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let currentTab = 'monthly';
let rejectTarget = null; // { type: 'monthly'|'leave', id: number }
let detailConfirmationId = null;

const TYPE_LABELS = { PRESENT:'出勤', ABSENT:'欠勤', LATE:'遅刻', EARLY_LEAVE:'早退' };

// ── ステータスバッジ ────────────────────────────────
function statusBadge(s) {
  const map = {
    PENDING:  ['approval-status--pending',  '承認待ち'],
    APPROVED: ['approval-status--approved', '承認済み'],
    REJECTED: ['approval-status--rejected', '否認済み'],
  };
  const [cls, label] = map[s] || ['', s];
  return `<span class="approval-status ${cls}">${label}</span>`;
}

// ── 月次確定申請一覧 ────────────────────────────────
async function loadMonthly() {
  const filter = document.getElementById('status-filter').value;
  const container = document.getElementById('monthly-list');
  container.innerHTML = '<div class="admin-table-empty">読み込み中...</div>';

  const url = filter ? `/api/admin/approvals/monthly?approval_status=${filter}` : '/api/admin/approvals/monthly';
  try {
    const res = await authFetch(url);
    if (!res.ok) throw new Error();
    const items = await res.json();

    // バッジ更新
    const pendingCount = items.filter(i => i.approval_status === 'PENDING').length;
    const badge = document.getElementById('monthly-badge');
    if (pendingCount > 0) { badge.textContent = pendingCount; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');

    if (items.length === 0) {
      container.innerHTML = '<div class="admin-table-empty">該当する申請はありません。</div>';
      return;
    }

    container.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>作業者</th><th>対象年月</th><th>申請日時</th><th>状態</th><th></th>
          </tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${esc(item.username)}</td>
                <td>${item.year}年${item.month}月</td>
                <td>${esc(item.confirmed_at)}</td>
                <td>${statusBadge(item.approval_status)}</td>
                <td class="admin-table-actions">
                  <button class="btn btn-sm btn-secondary detail-btn" data-id="${item.id}" data-label="${esc(item.username)} ${item.year}年${item.month}月">詳細</button>
                  ${item.approval_status === 'PENDING' ? `
                    <button class="btn btn-sm btn-primary approve-monthly-btn" data-id="${item.id}">承認</button>
                    <button class="btn btn-sm btn-danger reject-monthly-btn" data-id="${item.id}" data-label="${esc(item.username)} ${item.year}年${item.month}月">否認</button>
                  ` : ''}
                  ${item.approval_status === 'REJECTED' ? `<div class="rejection-note">${esc(item.rejection_reason || '')}</div>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.detail-btn').forEach(btn => {
      btn.addEventListener('click', () => openDetailModal(parseInt(btn.dataset.id), btn.dataset.label));
    });
    container.querySelectorAll('.approve-monthly-btn').forEach(btn => {
      btn.addEventListener('click', () => approveMonthly(parseInt(btn.dataset.id)));
    });
    container.querySelectorAll('.reject-monthly-btn').forEach(btn => {
      btn.addEventListener('click', () => openRejectModal('monthly', parseInt(btn.dataset.id), btn.dataset.label));
    });
  } catch {
    container.innerHTML = '<div class="admin-table-empty">読み込みに失敗しました。</div>';
  }
}

// ── 有給承認依頼通知 ────────────────────────────────
async function loadLeaveReviewRequests() {
  try {
    const res = await authFetch('/api/admin/leave-review-requests');
    if (!res.ok) return;
    const items = await res.json();
    const panel = document.getElementById('leave-review-requests-panel');
    const list  = document.getElementById('leave-review-requests-list');
    if (items.length === 0) {
      panel.classList.add('hidden');
      return;
    }
    list.innerHTML = items.map(r =>
      `<li class="leave-review-item">
        <span class="leave-review-user">${esc(r.username)}</span>
        <span class="leave-review-month">${r.year}年${r.month}月分</span>
        <span class="leave-review-time">${esc(r.created_at)}</span>
      </li>`
    ).join('');
    panel.classList.remove('hidden');
    // 表示したら既読にする
    authFetch('/api/admin/leave-review-requests/read', { method: 'POST' }).catch(() => {});
  } catch { /* ignore */ }
}

// ── 有休申請一覧 ────────────────────────────────────
async function loadLeave() {
  const filter = document.getElementById('status-filter').value;
  const container = document.getElementById('leave-list');
  container.innerHTML = '<div class="admin-table-empty">読み込み中...</div>';

  const url = filter ? `/api/admin/approvals/leave?approval_status=${filter}` : '/api/admin/approvals/leave';
  try {
    const res = await authFetch(url);
    if (!res.ok) throw new Error();
    const items = await res.json();

    const pendingCount = items.filter(i => i.paid_leave_approval_status === 'PENDING').length;
    const badge = document.getElementById('leave-badge');
    if (pendingCount > 0) { badge.textContent = pendingCount; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');

    if (items.length === 0) {
      container.innerHTML = '<div class="admin-table-empty">該当する申請はありません。</div>';
      return;
    }

    container.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>作業者</th><th>日付</th><th>区分</th><th>種別</th><th>状態</th><th></th>
          </tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${esc(item.username)}</td>
                <td>${item.date}</td>
                <td>${esc(item.type_label)}</td>
                <td>${item.paid_leave ? '有給（全日）' : item.half_paid_leave ? '有給（半休）' : '—'}</td>
                <td>${statusBadge(item.paid_leave_approval_status)}</td>
                <td class="admin-table-actions">
                  ${item.paid_leave_approval_status === 'PENDING' ? `
                    <button class="btn btn-sm btn-primary approve-leave-btn" data-id="${item.id}">承認</button>
                    <button class="btn btn-sm btn-danger reject-leave-btn" data-id="${item.id}" data-label="${esc(item.username)} ${item.date}">否認</button>
                  ` : ''}
                  ${item.paid_leave_approval_status === 'REJECTED' ? `<div class="rejection-note">${esc(item.paid_leave_rejection_reason || '')}</div>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.approve-leave-btn').forEach(btn => {
      btn.addEventListener('click', () => approveLeave(parseInt(btn.dataset.id)));
    });
    container.querySelectorAll('.reject-leave-btn').forEach(btn => {
      btn.addEventListener('click', () => openRejectModal('leave', parseInt(btn.dataset.id), btn.dataset.label));
    });
  } catch {
    container.innerHTML = '<div class="admin-table-empty">読み込みに失敗しました。</div>';
  }
}

// ── 承認処理 ────────────────────────────────────────
async function approveMonthly(id) {
  try {
    const res = await authFetch(`/api/admin/approvals/monthly/${id}/approve`, { method: 'POST' });
    if (!res.ok) { const d = await res.json(); alert(d.detail || '承認に失敗しました。'); return; }
    loadMonthly();
  } catch { alert('通信エラーが発生しました。'); }
}

async function approveLeave(id) {
  try {
    const res = await authFetch(`/api/admin/approvals/leave/${id}/approve`, { method: 'POST' });
    if (!res.ok) { const d = await res.json(); alert(d.detail || '承認に失敗しました。'); return; }
    loadLeave();
  } catch { alert('通信エラーが発生しました。'); }
}

// ── 否認モーダル ────────────────────────────────────
function openRejectModal(type, id, label) {
  rejectTarget = { type, id };
  document.getElementById('reject-target-text').textContent = `対象: ${label}`;
  document.getElementById('reject-reason').value = '';
  document.getElementById('reject-modal').classList.remove('hidden');
}

function closeRejectModal() {
  document.getElementById('reject-modal').classList.add('hidden');
  rejectTarget = null;
}

async function executeReject() {
  if (!rejectTarget) return;
  const reason = document.getElementById('reject-reason').value.trim();
  if (!reason) { alert('否認理由を入力してください。'); return; }

  const btn = document.getElementById('reject-ok-btn');
  btn.disabled = true;
  try {
    const url = rejectTarget.type === 'monthly'
      ? `/api/admin/approvals/monthly/${rejectTarget.id}/reject`
      : `/api/admin/approvals/leave/${rejectTarget.id}/reject`;
    const res = await authFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejection_reason: reason }),
    });
    if (!res.ok) { const d = await res.json(); alert(d.detail || '否認に失敗しました。'); return; }
    closeRejectModal();
    if (rejectTarget.type === 'monthly') loadMonthly();
    else loadLeave();
  } catch {
    alert('通信エラーが発生しました。');
  } finally {
    btn.disabled = false;
  }
}

// ── 詳細モーダル ────────────────────────────────────
async function openDetailModal(confirmationId, label) {
  detailConfirmationId = confirmationId;
  document.getElementById('detail-modal-title').textContent = `勤怠詳細: ${label}`;
  document.getElementById('detail-modal-body').innerHTML = '<div class="admin-table-empty">読み込み中...</div>';

  // 承認状態に応じてボタン表示を制御
  const approveBtn = document.getElementById('detail-approve-btn');
  const rejectBtn = document.getElementById('detail-reject-btn');

  // まず申請リストから対象のステータスを確認
  try {
    const listRes = await authFetch('/api/admin/approvals/monthly');
    const items = listRes.ok ? await listRes.json() : [];
    const item = items.find(i => i.id === confirmationId);
    const isPending = !item || item.approval_status === 'PENDING';
    approveBtn.style.display = isPending ? '' : 'none';
    rejectBtn.style.display = isPending ? '' : 'none';

    if (item) {
      approveBtn.onclick = () => { closeDetailModal(); approveMonthly(confirmationId); };
      rejectBtn.onclick = () => { closeDetailModal(); openRejectModal('monthly', confirmationId, label); };
    }
  } catch {
    approveBtn.style.display = 'none';
    rejectBtn.style.display = 'none';
  }

  document.getElementById('detail-modal').classList.remove('hidden');

  try {
    const res = await authFetch(`/api/admin/approvals/monthly/${confirmationId}/records`);
    if (!res.ok) throw new Error();
    const records = await res.json();

    if (records.length === 0) {
      document.getElementById('detail-modal-body').innerHTML = '<div class="admin-table-empty">勤怠データがありません。</div>';
      return;
    }

    document.getElementById('detail-modal-body').innerHTML = `
      <table class="admin-table" style="font-size:0.85rem">
        <thead><tr>
          <th>日付</th><th>区分</th><th>出勤</th><th>退勤</th><th>有休</th><th>勤務地</th>
        </tr></thead>
        <tbody>
          ${records.map(r => `
            <tr>
              <td>${r.date}</td>
              <td>${esc(r.type_label)}</td>
              <td>${r.start_time || '—'}</td>
              <td>${r.end_time || '—'}</td>
              <td>${r.paid_leave ? '有給' : r.half_paid_leave ? '半休' : '—'}</td>
              <td>${esc((r.work_location || []).join(', ') || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    document.getElementById('detail-modal-body').innerHTML = '<div class="admin-table-empty">読み込みに失敗しました。</div>';
  }
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.add('hidden');
  detailConfirmationId = null;
}

// ── タブ切り替え ────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.approval-tab').forEach(t => {
    t.classList.toggle('approval-tab--active', t.dataset.tab === tab);
  });
  document.getElementById('tab-monthly-content').style.display = tab === 'monthly' ? '' : 'none';
  document.getElementById('tab-leave-content').style.display   = tab === 'leave'   ? '' : 'none';
  reloadCurrentTab();
}

function reloadCurrentTab() {
  if (currentTab === 'monthly') loadMonthly();
  else { loadLeaveReviewRequests(); loadLeave(); }
}

// ── イベント登録 ────────────────────────────────────
document.querySelectorAll('.approval-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});
document.getElementById('status-filter').addEventListener('change', reloadCurrentTab);
document.getElementById('reject-cancel-btn').addEventListener('click', closeRejectModal);
document.getElementById('reject-modal-overlay').addEventListener('click', closeRejectModal);
document.getElementById('reject-ok-btn').addEventListener('click', executeReject);
document.getElementById('detail-close-btn').addEventListener('click', closeDetailModal);
document.getElementById('detail-modal-overlay').addEventListener('click', closeDetailModal);

// 初期ロード
loadMonthly();
loadLeaveReviewRequests();
loadLeave();
