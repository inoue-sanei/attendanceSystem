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

let editingUserId = null;

// ── ユーザー一覧取得 ────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('user-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty">読み込み中...</td></tr>';
  try {
    const res = await authFetch('/api/admin/users');
    if (!res.ok) throw new Error();
    const users = await res.json();

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty">作業者が登録されていません。</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr data-id="${u.id}">
        <td>${esc(u.username)}</td>
        <td>${esc(u.role || '—')}</td>
        <td>${esc(u.email)}</td>
        <td>${u.paid_leave_days}日（${u.paid_leave_month}月付与）</td>
        <td><span class="user-status ${u.is_active ? 'user-status--active' : 'user-status--inactive'}">${u.is_active ? '有効' : '無効'}</span></td>
        <td class="admin-table-actions">
          <button class="btn btn-sm btn-secondary edit-btn" data-id="${u.id}">編集</button>
          <button class="btn btn-sm btn-danger delete-btn" data-id="${u.id}" data-name="${esc(u.username)}">削除</button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.id)));
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(parseInt(btn.dataset.id), btn.dataset.name));
    });
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty">読み込みに失敗しました。</td></tr>';
  }
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── 登録モーダル ────────────────────────────────────
function openAddModal() {
  editingUserId = null;
  document.getElementById('user-modal-title').textContent = '作業者登録';
  document.getElementById('f-username').value = '';
  document.getElementById('f-role').value = '';
  document.getElementById('f-email').value = '';
  document.getElementById('f-password').value = '';
  document.getElementById('f-leave-days').value = '20';
  document.getElementById('f-leave-month').value = '4';
  document.getElementById('f-password-group').style.display = '';
  document.getElementById('f-active-group').style.display = 'none';
  clearFormMsg();
  document.getElementById('user-modal').classList.remove('hidden');
}

function openEditModal(userId) {
  const row = document.querySelector(`tr[data-id="${userId}"]`);
  if (!row) return;

  authFetch('/api/admin/users').then(r => r.json()).then(users => {
    const u = users.find(x => x.id === userId);
    if (!u) return;
    editingUserId = userId;
    document.getElementById('user-modal-title').textContent = '作業者情報の編集';
    document.getElementById('f-username').value = u.username;
    document.getElementById('f-role').value = u.role || '';
    document.getElementById('f-email').value = u.email;
    document.getElementById('f-password').value = '';
    document.getElementById('f-leave-days').value = u.paid_leave_days;
    document.getElementById('f-leave-month').value = u.paid_leave_month;
    document.getElementById('f-password-group').style.display = 'none';
    document.getElementById('f-active-group').style.display = '';
    document.getElementById('f-is-active').checked = u.is_active;
    clearFormMsg();
    document.getElementById('user-modal').classList.remove('hidden');
  });
}

function closeUserModal() {
  document.getElementById('user-modal').classList.add('hidden');
  editingUserId = null;
}

function clearFormMsg() {
  const el = document.getElementById('user-form-msg');
  el.className = 'settings-msg hidden';
  el.textContent = '';
}

function showFormMsg(text, isError = true) {
  const el = document.getElementById('user-form-msg');
  el.textContent = text;
  el.className = `settings-msg ${isError ? 'settings-msg--error' : 'settings-msg--success'}`;
}

function showListMsg(text, isError = false) {
  const el = document.getElementById('user-list-msg');
  el.textContent = text;
  el.className = `settings-msg ${isError ? 'settings-msg--error' : 'settings-msg--success'}`;
  setTimeout(() => { el.className = 'settings-msg hidden'; }, 3000);
}

// ── 保存 ────────────────────────────────────────────
async function saveUser() {
  const username   = document.getElementById('f-username').value.trim();
  const role       = document.getElementById('f-role').value.trim();
  const email      = document.getElementById('f-email').value.trim();
  const password   = document.getElementById('f-password').value;
  const leaveDays  = parseInt(document.getElementById('f-leave-days').value) || 20;
  const leaveMonth = parseInt(document.getElementById('f-leave-month').value) || 4;

  if (!username || !email) {
    showFormMsg('氏名とメールアドレスは必須です。');
    return;
  }

  const saveBtn = document.getElementById('user-save-btn');
  saveBtn.disabled = true;

  try {
    let res;
    if (editingUserId === null) {
      // 新規
      if (!password || password.length < 8) {
        showFormMsg('パスワードは8文字以上で入力してください。');
        return;
      }
      res = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, role: role || null, paid_leave_days: leaveDays, paid_leave_month: leaveMonth }),
      });
    } else {
      // 更新
      const isActive = document.getElementById('f-is-active').checked;
      res = await authFetch(`/api/admin/users/${editingUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, role: role || null, paid_leave_days: leaveDays, paid_leave_month: leaveMonth, is_active: isActive }),
      });
    }

    const data = await res.json();
    if (!res.ok) {
      showFormMsg(data.detail || '保存に失敗しました。');
      return;
    }
    closeUserModal();
    showListMsg(editingUserId === null ? '作業者を登録しました。' : '作業者情報を更新しました。');
    loadUsers();
  } catch {
    showFormMsg('通信エラーが発生しました。');
  } finally {
    saveBtn.disabled = false;
  }
}

// ── 削除 ────────────────────────────────────────────
let deletingUserId = null;

function openDeleteModal(userId, name) {
  deletingUserId = userId;
  document.getElementById('delete-confirm-text').textContent =
    `「${name}」を削除します。この操作は元に戻せません。関連する勤怠データも削除されます。`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  deletingUserId = null;
}

async function deleteUser() {
  if (!deletingUserId) return;
  const btn = document.getElementById('delete-ok-btn');
  btn.disabled = true;
  try {
    const res = await authFetch(`/api/admin/users/${deletingUserId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showListMsg(d.detail || '削除に失敗しました。', true);
      return;
    }
    closeDeleteModal();
    showListMsg('作業者を削除しました。');
    loadUsers();
  } catch {
    showListMsg('通信エラーが発生しました。', true);
  } finally {
    btn.disabled = false;
  }
}

// ── イベント登録 ────────────────────────────────────
document.getElementById('add-user-btn').addEventListener('click', openAddModal);
document.getElementById('user-cancel-btn').addEventListener('click', closeUserModal);
document.getElementById('user-modal-overlay').addEventListener('click', closeUserModal);
document.getElementById('user-save-btn').addEventListener('click', saveUser);
document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
document.getElementById('delete-modal-overlay').addEventListener('click', closeDeleteModal);
document.getElementById('delete-ok-btn').addEventListener('click', deleteUser);

loadUsers();
