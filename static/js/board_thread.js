'use strict';

const token = localStorage.getItem('authToken');
if (!token) location.href = '/login';

const currentUsername = localStorage.getItem('username') || '';
document.getElementById('header-username').textContent = currentUsername;
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
  location.href = '/login';
});

const threadId = parseInt(location.pathname.split('/').pop());
if (!threadId) location.href = '/board';

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

// ── メッセージ要素を構築 ──
function buildMessage({ id, username, createdAt, updatedAt, content, isOwn, targetType, reactionCount, userReacted, threadTitle }) {
  const initial = (username || '?')[0].toUpperCase();
  const color   = avatarColor(username);
  const isThread = targetType === 'thread';
  const isEdited = !!updatedAt;

  const div = document.createElement('div');
  div.className = 'board-msg';

  // ヘッダー右側ボタン
  let actionsHtml;
  if (isOwn) {
    actionsHtml = `
      <div class="board-msg-actions">
        <button class="btn-msg-action btn-msg-edit" title="編集">✏️ 編集</button>
        <button class="btn-msg-action btn-msg-delete" title="削除">🗑️ 削除</button>
      </div>`;
  } else {
    const activeClass = userReacted ? ' btn-react--active' : '';
    const countStr   = reactionCount > 0 ? ` ${reactionCount}` : '';
    actionsHtml = `
      <div class="board-msg-actions">
        <button class="btn-react${activeClass}" title="いいね">👍${countStr}</button>
      </div>`;
  }

  const editedHtml = isEdited ? ' <span class="board-msg-edited">(編集済み)</span>' : '';

  // 編集フォーム（自分のメッセージのみ）
  let editFormHtml = '';
  if (isOwn) {
    const titleField = isThread
      ? `<input type="text" class="edit-title-input" placeholder="タイトル" value="${escHtml(threadTitle || '')}"><br>`
      : '';
    editFormHtml = `
      <div class="board-msg-edit-form hidden">
        ${titleField}
        <textarea class="edit-content-textarea" rows="3">${escHtml(content)}</textarea>
        <div class="edit-error-msg board-error hidden"></div>
        <div class="edit-form-actions">
          <button class="btn btn-secondary btn-sm btn-edit-cancel">キャンセル</button>
          <button class="btn btn-primary btn-sm btn-edit-save">保存</button>
        </div>
      </div>`;
  }

  div.innerHTML = `
    <div class="board-msg-avatar" style="background:${color}">${escHtml(initial)}</div>
    <div class="board-msg-body">
      <div class="board-msg-header">
        <span class="board-msg-name">${escHtml(username)}</span>
        <span class="board-msg-time">${escHtml(createdAt)}${editedHtml}</span>
        ${actionsHtml}
      </div>
      <div class="board-msg-content">${escHtml(content).replace(/\n/g, '<br>')}</div>
      ${editFormHtml}
    </div>`;

  if (isOwn) {
    // 編集ボタン
    div.querySelector('.btn-msg-edit').addEventListener('click', () => {
      const form = div.querySelector('.board-msg-edit-form');
      // テキストエリアに現在の内容をセット（HTML→プレーンテキスト）
      div.querySelector('.edit-content-textarea').value = content;
      if (isThread) div.querySelector('.edit-title-input').value = threadTitle || '';
      div.querySelector('.board-msg-content').classList.add('hidden');
      form.classList.remove('hidden');
    });

    // キャンセル
    div.querySelector('.btn-edit-cancel').addEventListener('click', () => {
      div.querySelector('.board-msg-content').classList.remove('hidden');
      div.querySelector('.board-msg-edit-form').classList.add('hidden');
      div.querySelector('.edit-error-msg').classList.add('hidden');
    });

    // 保存
    div.querySelector('.btn-edit-save').addEventListener('click', async () => {
      const errEl     = div.querySelector('.edit-error-msg');
      const saveBtn   = div.querySelector('.btn-edit-save');
      errEl.classList.add('hidden');

      const newContent = div.querySelector('.edit-content-textarea').value.trim();
      if (!newContent) {
        errEl.textContent = '内容を入力してください。';
        errEl.classList.remove('hidden');
        return;
      }

      let url, body;
      if (isThread) {
        const newTitle = div.querySelector('.edit-title-input').value.trim();
        if (!newTitle) {
          errEl.textContent = 'タイトルを入力してください。';
          errEl.classList.remove('hidden');
          return;
        }
        url  = `/api/board/threads/${id}`;
        body = JSON.stringify({ title: newTitle, content: newContent });
      } else {
        url  = `/api/board/comments/${id}`;
        body = JSON.stringify({ content: newContent });
      }

      saveBtn.disabled = true; saveBtn.textContent = '保存中...';
      try {
        const res = await authFetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          errEl.textContent = err.detail || '保存に失敗しました。';
          errEl.classList.remove('hidden');
          return;
        }
        await loadThread();
      } catch {
        errEl.textContent = '通信エラーが発生しました。';
        errEl.classList.remove('hidden');
      } finally {
        saveBtn.disabled = false; saveBtn.textContent = '保存';
      }
    });

    // 削除
    div.querySelector('.btn-msg-delete').addEventListener('click', async () => {
      const msg = isThread
        ? 'このスレッドを削除しますか？すべてのコメントも削除されます。'
        : 'このコメントを削除しますか？';
      if (!confirm(msg)) return;
      const url = isThread ? `/api/board/threads/${id}` : `/api/board/comments/${id}`;
      const r = await authFetch(url, { method: 'DELETE' });
      if (isThread && (r.ok || r.status === 204)) {
        location.href = '/board';
      } else {
        await loadThread();
      }
    });

  } else {
    // リアクションボタン
    div.querySelector('.btn-react').addEventListener('click', async () => {
      const btn = div.querySelector('.btn-react');
      btn.disabled = true;
      try {
        const url = isThread
          ? `/api/board/threads/${id}/react`
          : `/api/board/comments/${id}/react`;
        const res = await authFetch(url, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          btn.classList.toggle('btn-react--active', data.reacted);
          btn.textContent = `👍${data.count > 0 ? ' ' + data.count : ''}`;
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  return div;
}

// ── スレッド読み込み ──
async function loadThread() {
  const stream = document.getElementById('message-stream');
  const prevScroll = stream.scrollTop;
  stream.innerHTML = '<p class="board-loading">読み込み中...</p>';

  try {
    const res = await authFetch(`/api/board/threads/${threadId}`);
    if (res.status === 404) { stream.innerHTML = '<p class="board-error-text">スレッドが見つかりません。</p>'; return; }
    if (!res.ok) throw new Error();
    const t = await res.json();

    document.title = `${t.title} - 掲示板`;
    document.getElementById('thread-title').textContent = t.title;

    stream.innerHTML = '';

    // ── OP メッセージ ──
    const opSection = document.createElement('div');
    opSection.className = 'board-op-section';
    opSection.appendChild(buildMessage({
      id: t.id,
      username: t.username,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      content: t.content,
      isOwn: t.username === currentUsername,
      targetType: 'thread',
      reactionCount: t.reaction_count,
      userReacted: t.user_reacted,
      threadTitle: t.title,
    }));
    stream.appendChild(opSection);

    // ── 返信ヘッダー ──
    const replyHeader = document.createElement('div');
    replyHeader.className = 'board-reply-header';
    replyHeader.textContent = `返信 ${t.comments.length}件`;
    stream.appendChild(replyHeader);

    // ── コメント ──
    if (t.comments.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'board-no-comments';
      empty.textContent = 'まだ返信はありません。最初のコメントを投稿してみましょう！';
      stream.appendChild(empty);
    } else {
      t.comments.forEach(c => {
        stream.appendChild(buildMessage({
          id: c.id,
          username: c.username,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          content: c.content,
          isOwn: c.username === currentUsername,
          targetType: 'comment',
          reactionCount: c.reaction_count,
          userReacted: c.user_reacted,
          threadTitle: null,
        }));
      });
    }
  } catch {
    stream.innerHTML = '<p class="board-error-text">読み込みに失敗しました。</p>';
  }
}

// ── コメント投稿 ──
document.getElementById('btn-post-comment').addEventListener('click', async () => {
  const errEl    = document.getElementById('comment-error');
  const textarea = document.getElementById('new-comment');
  errEl.classList.add('hidden');

  const content = textarea.value.trim();
  if (!content) { errEl.textContent = 'コメントを入力してください。'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('btn-post-comment');
  btn.disabled = true; btn.textContent = '送信中...';
  try {
    const res = await authFetch(`/api/board/threads/${threadId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errEl.textContent = err.detail || 'コメントの投稿に失敗しました。';
      errEl.classList.remove('hidden');
      return;
    }
    textarea.value = '';
    await loadThread();
    window.scrollTo(0, document.body.scrollHeight);
  } catch {
    errEl.textContent = '通信エラーが発生しました。';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = '送信';
  }
});

// Ctrl/Cmd + Enter で送信
document.getElementById('new-comment').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    document.getElementById('btn-post-comment').click();
  }
});

loadThread();
