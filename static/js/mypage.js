'use strict';

const token = localStorage.getItem('authToken');
if (!token) location.href = '/login';

document.getElementById('header-username').textContent = localStorage.getItem('username') || '';
document.getElementById('logout-btn').addEventListener('click', () => {
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
    document.getElementById('stat-leave').textContent      = `${d.paid_leave_remaining}日`;
    document.getElementById('stat-leave-sub').textContent  =
      `付与月: ${d.paid_leave_month}月 | 取得: ${d.paid_leave_used}日 / 付与: ${d.paid_leave_days}日`;
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
