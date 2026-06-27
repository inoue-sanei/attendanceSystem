'use strict';

const token = localStorage.getItem('authToken');
if (!token) location.href = '/login';

const currentUsername = localStorage.getItem('username') || '';
document.getElementById('header-username').textContent = currentUsername;
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
  if (res.status === 401) { localStorage.removeItem('authToken'); location.href = '/login'; return Promise.reject(); }
  return res;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function avatarColor(name) {
  const colors = ['#1565C0','#2E7D32','#E65100','#6A1B9A','#AD1457','#00695C','#37474F'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFF;
  return colors[h % colors.length];
}

// ── スレッド一覧 ──
async function loadThreadList() {
  const listEl = document.getElementById('thread-list');
  listEl.innerHTML = '<p class="board-loading">読み込み中...</p>';
  try {
    const res = await authFetch('/api/board/threads');
    if (!res.ok) throw new Error();
    const threads = await res.json();

    if (threads.length === 0) {
      listEl.innerHTML = '<p class="board-empty">スレッドがまだありません。<br>最初のスレッドを作成してみましょう！</p>';
      return;
    }

    listEl.innerHTML = '';
    threads.forEach(t => {
      const initial = (t.username || '?')[0].toUpperCase();
      const color   = avatarColor(t.username);
      const row = document.createElement('div');
      row.className = 'board-thread-row';
      row.innerHTML = `
        <div class="board-row-avatar" style="background:${color}">${escHtml(initial)}</div>
        <div class="board-row-body">
          <div class="board-row-title">${escHtml(t.title)}</div>
          <div class="board-row-preview">${escHtml(t.content.substring(0, 60))}${t.content.length > 60 ? '…' : ''}</div>
          <div class="board-row-meta">
            <span class="board-row-author">${escHtml(t.username)}</span>
            <span class="board-row-dot">·</span>
            <span class="board-row-date">${t.created_at}</span>
            <span class="board-row-dot">·</span>
            <span class="board-row-count">&#128172; ${t.comments_count}件</span>
          </div>
        </div>
        <div class="board-row-chevron">&#8250;</div>`;
      row.addEventListener('click', () => { location.href = `/board/thread/${t.id}`; });
      listEl.appendChild(row);
    });
  } catch {
    listEl.innerHTML = '<p class="board-error-text">読み込みに失敗しました。</p>';
  }
}

// ── 新規スレッド ──
document.getElementById('btn-new-thread').addEventListener('click', () => {
  document.getElementById('new-thread-form').classList.toggle('hidden');
  document.getElementById('new-title').focus();
});

document.getElementById('btn-cancel-thread').addEventListener('click', () => {
  document.getElementById('new-thread-form').classList.add('hidden');
  document.getElementById('new-title').value = '';
  document.getElementById('new-content').value = '';
  document.getElementById('new-thread-error').classList.add('hidden');
});

document.getElementById('btn-post-thread').addEventListener('click', async () => {
  const errEl = document.getElementById('new-thread-error');
  errEl.classList.add('hidden');

  const title   = document.getElementById('new-title').value.trim();
  const content = document.getElementById('new-content').value.trim();
  if (!title)   { errEl.textContent = 'タイトルを入力してください。'; errEl.classList.remove('hidden'); return; }
  if (!content) { errEl.textContent = '本文を入力してください。';     errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('btn-post-thread');
  btn.disabled = true; btn.textContent = '投稿中...';
  try {
    const res = await authFetch('/api/board/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errEl.textContent = err.detail || '投稿に失敗しました。';
      errEl.classList.remove('hidden');
      return;
    }
    const created = await res.json();
    location.href = `/board/thread/${created.id}`;
  } catch {
    errEl.textContent = '通信エラーが発生しました。';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = '投稿する';
  }
});

// 掲示板を訪問したタイムスタンプを保存（マイページ通知リセット用）
(function markBoardSeen() {
  const key = `boardLastSeen_${currentUsername}`;
  localStorage.setItem(key, new Date().toISOString());
})();

loadThreadList();
