'use strict';

const token = localStorage.getItem('authToken');
if (!token) location.href = '/login';

document.getElementById('header-username').textContent = localStorage.getItem('username') || '';
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
  location.href = '/login';
});

const msgEl = document.getElementById('pw-msg');

function showMsg(text, isError) {
  msgEl.textContent = text;
  msgEl.className = `settings-msg ${isError ? 'settings-msg--error' : 'settings-msg--success'}`;
}

document.getElementById('pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  msgEl.className = 'settings-msg hidden';

  const current  = document.getElementById('current-pw').value;
  const newPw    = document.getElementById('new-pw').value;
  const confirm  = document.getElementById('confirm-pw').value;

  if (!current || !newPw || !confirm) {
    showMsg('すべての項目を入力してください。', true); return;
  }
  if (newPw.length < 8) {
    showMsg('新しいパスワードは8文字以上で入力してください。', true); return;
  }
  if (newPw !== confirm) {
    showMsg('新しいパスワードが一致しません。', true); return;
  }

  const btn = document.getElementById('pw-submit');
  btn.disabled = true; btn.textContent = '変更中...';

  try {
    const res = await fetch('/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ current_password: current, new_password: newPw }),
    });
    if (res.status === 204) {
      showMsg('パスワードを変更しました。', false);
      document.getElementById('pw-form').reset();
    } else {
      const err = await res.json().catch(() => ({}));
      showMsg(err.detail || 'パスワードの変更に失敗しました。', true);
    }
  } catch {
    showMsg('通信エラーが発生しました。', true);
  } finally {
    btn.disabled = false; btn.textContent = '変更する';
  }
});
