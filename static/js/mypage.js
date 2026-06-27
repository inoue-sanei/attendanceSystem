'use strict';

const token = localStorage.getItem('authToken');
if (!token) location.href = '/login';

document.getElementById('header-username').textContent = localStorage.getItem('username') || '';
document.getElementById('logout-btn').addEventListener('click', () => {
  const _t = localStorage.getItem('authToken');
  if (_t) fetch('/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${_t}` } }).catch(() => {});
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
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

const now = new Date();
let statsYear  = now.getFullYear();
let statsMonth = now.getMonth() + 1;

function fmtMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusTag(s) {
  const map = {
    PENDING:  ['pending',  '申請中'],
    APPROVED: ['approved', '承認済'],
    REJECTED: ['rejected', '否認'],
  };
  const [cls, label] = map[s] || ['none', '未申請'];
  return `<span class="approval-status-tag approval-status-tag--${cls}">${label}</span>`;
}

function renderApprovalSection(d) {
  const plEl = document.getElementById('paid-leave-approval-list');
  const items = d.paid_leave_statuses || [];
  if (items.length === 0) {
    plEl.innerHTML = '<div class="approval-empty">今年度の有給申請はありません</div>';
  } else {
    plEl.innerHTML = items.map(item => {
      const [, m, day] = item.date.split('-');
      const reasonHtml = (item.approval_status === 'REJECTED' && item.rejection_reason)
        ? `<div class="approval-item__reason">否認理由: ${esc(item.rejection_reason)}</div>` : '';
      return `<div class="approval-item">
        <div class="approval-item__main">
          <span class="approval-item__date">${parseInt(m)}月${parseInt(day)}日</span>
          <span class="approval-item__type">${esc(item.type_label)}</span>
          <span class="approval-item__status">${statusTag(item.approval_status)}</span>
        </div>${reasonHtml}</div>`;
    }).join('');
  }

  const mcEl = document.getElementById('month-confirmation-list');
  const submitted = (d.month_confirmations || []).filter(mc => mc.approval_status);
  if (submitted.length === 0) {
    mcEl.innerHTML = '<div class="approval-empty">申請中の月次勤怠はありません</div>';
  } else {
    mcEl.innerHTML = submitted.map(mc => {
      const reasonHtml = (mc.approval_status === 'REJECTED' && mc.rejection_reason)
        ? `<div class="approval-item__reason">否認理由: ${esc(mc.rejection_reason)}</div>` : '';
      return `<div class="approval-item">
        <div class="approval-item__main">
          <span class="approval-item__date">${mc.year}年${mc.month}月</span>
          <span class="approval-item__type">月次勤怠</span>
          <span class="approval-item__status">${statusTag(mc.approval_status)}</span>
        </div>${reasonHtml}</div>`;
    }).join('');
  }
}

async function loadMypage() {
  try {
    const res = await authFetch(`/auth/mypage?year=${statsYear}&month=${statsMonth}`);
    if (!res.ok) return;
    const d = await res.json();

    document.getElementById('mp-username').textContent = d.username;
    document.getElementById('mp-email').textContent    = d.email;
    document.getElementById('mp-avatar').textContent   = d.username.charAt(0).toUpperCase();

    document.getElementById('stats-month').textContent = `${d.year}年${d.month}月`;
    document.getElementById('stat-attendance').textContent = `${d.attendance_count}日`;
    document.getElementById('stat-absence').textContent    = `${d.absence_count}日`;
    document.getElementById('stat-work-hours').textContent = fmtMinutes(d.total_work_minutes);
    document.getElementById('stat-overtime').textContent   = fmtMinutes(d.overtime_minutes);
    document.getElementById('stat-leave').textContent      = `${d.paid_leave_remaining}日`;
    document.getElementById('stat-leave-sub').textContent  =
      `付与月: ${d.paid_leave_month}月 | 取得: ${d.paid_leave_used}日 / 付与: ${d.paid_leave_days}日`;

    renderApprovalSection(d);
  } catch {
    document.getElementById('mp-username').textContent = localStorage.getItem('username') || '';
  }
}

document.getElementById('stats-prev').addEventListener('click', () => {
  statsMonth--;
  if (statsMonth < 1) { statsMonth = 12; statsYear--; }
  loadMypage();
});

document.getElementById('stats-next').addEventListener('click', () => {
  statsMonth++;
  if (statsMonth > 12) { statsMonth = 1; statsYear++; }
  loadMypage();
});

loadMypage();

async function loadBoardNotifications() {
  const username = localStorage.getItem('username') || '';
  const key = `boardLastSeen_${username}`;
  const since = localStorage.getItem(key) || new Date(0).toISOString();
  try {
    const res = await authFetch(`/api/board/notifications?since=${encodeURIComponent(since)}`);
    if (!res.ok) return;
    const d = await res.json();
    const badge = document.getElementById('board-notification-badge');
    if (d.total > 0) {
      badge.textContent = d.total > 99 ? '99+' : String(d.total);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch { /* 通知取得失敗は無視 */ }
}

loadBoardNotifications();
