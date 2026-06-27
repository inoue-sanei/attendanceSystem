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

async function loadDashboard() {
  try {
    const res = await authFetch('/api/admin/dashboard');
    if (!res.ok) return;
    const d = await res.json();

    document.getElementById('summary-users').textContent = d.user_count;
    document.getElementById('summary-monthly').textContent = d.pending_monthly_count;
    document.getElementById('summary-leave').textContent = d.pending_leave_count;
    document.getElementById('summary-review').textContent = d.leave_review_request_count ?? 0;

    const total = d.pending_monthly_count + d.pending_leave_count + (d.leave_review_request_count ?? 0);
    if (total > 0) {
      const badge = document.getElementById('approval-badge');
      badge.textContent = total;
      badge.classList.remove('hidden');
    }
    if (d.pending_monthly_count === 0) {
      document.getElementById('card-monthly').classList.remove('admin-summary-card--warn');
    }
    if (d.pending_leave_count === 0) {
      document.getElementById('card-leave').classList.remove('admin-summary-card--warn');
    }
    if ((d.leave_review_request_count ?? 0) === 0) {
      document.getElementById('card-review').classList.remove('admin-summary-card--notify');
    }
  } catch {
    // ignore
  }
}

loadDashboard();
