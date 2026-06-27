# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業する際のガイドです。

---

# プロジェクト概要

複数の作業者と管理者が利用する勤怠管理 Web アプリ。  
作業者は日次勤怠登録・申請・有休申請を行い、管理者が承認する。掲示板機能あり。

---

# 技術スタック

- **Runtime**: Python 3.14.5 + uv
- **Backend**: FastAPI 0.115.0+
- **ORM / DB**: SQLAlchemy 2.x + SQLite（`attendance.db`）
- **認証**: JWT (python-jose) + bcrypt 直接利用（**passlib は使っていない**）
- **Frontend**: バニラ JS + CSS（モバイルファースト）
- **テンプレート**: `FileResponse` で静的 HTML を配信（**Jinja2 レンダリングなし**）

---

# 起動コマンド

```bash
cd c:\Dev\attendanceSystem\attendanceSystem
uv run uvicorn main:app --host 127.0.0.1 --port 8002
```

- アプリ: http://127.0.0.1:8002
- API ドキュメント: http://127.0.0.1:8002/docs
- テストアカウント（作業者）: test@example.com / pass1234
- 管理者アカウント: admin@example.com / admin1234

---

# ディレクトリ構造

```
attendanceSystem/
├── main.py              # FastAPI app + スキーママイグレーション (_migrate)
├── database.py          # SQLAlchemy エンジン・セッション・Base
├── models.py            # ORM モデル（全テーブル定義）
├── schemas.py           # Pydantic v2 スキーマ
├── exceptions.py        # カスタム業務例外
├── routers/
│   ├── auth.py          # /auth/* （login / logout / register / me / mypage / password）
│   ├── attendance.py    # /api/attendance/*
│   ├── confirmation.py  # /api/confirmation/*
│   ├── board.py         # /api/board/*
│   ├── holidays.py      # /api/holidays/*
│   ├── admin.py         # /api/admin/*
│   └── pages.py         # HTML ページ配信（FileResponse）
├── services/
│   ├── auth.py          # 認証ロジック（JWT 発行・検証・get_current_user）
│   ├── attendance.py    # 勤怠 CRUD
│   ├── board.py         # 掲示板 CRUD + 通知件数
│   ├── confirmation.py  # 月次確定
│   └── admin.py         # 管理者操作
├── templates/           # 静的 HTML（FileResponse で配信）
│   ├── login.html / daily.html / index.html / mypage.html
│   ├── settings.html / password.html
│   ├── board.html / board_thread.html
│   └── admin_top.html / admin_users.html / admin_approval.html
└── static/
    ├── css/style.css
    └── js/
        ├── daily.js / calendar.js / mypage.js
        ├── settings.js / password.js
        ├── board.js / board_thread.js
        └── admin_top.js / admin_users.js / admin_approval.js
```

---

# データモデル（models.py）

| モデル | 主要カラム | 備考 |
|---|---|---|
| `User` | id, username, email, hashed_password, is_active, is_admin, role, paid_leave_days, paid_leave_month, **session_token** | session_token: 同時ログイン制御用 |
| `AttendanceRecord` | id, user_id, date, type, start/end_time, break_start/end, paid_leave, paid_leave_approval_status | UNIQUE(user_id, date) |
| `MonthlyConfirmation` | id, user_id, year, month, confirmed_at, approval_status, rejection_reason | UNIQUE(user_id, year, month) |
| `BulletinThread` | id, user_id, title, content, created_at, updated_at | |
| `BulletinComment` | id, thread_id, user_id, content, created_at, updated_at | |
| `BulletinReaction` | id, target_type, target_id, user_id | UNIQUE(target_type, target_id, user_id) |

勤怠区分: `PRESENT`（出勤）/ `ABSENT`（欠勤）/ `LATE`（遅刻）/ `EARLY_LEAVE`（早退）

---

# 画面構成

**作業者**（ボトムナビ: 日次登録 | カレンダー | マイページ）:

| URL | 画面 |
|---|---|
| `/login` | ログイン（is_admin=true なら /admin へ） |
| `/daily` | 日次勤怠登録 |
| `/` | 月次カレンダー（確定申請・承認状態表示） |
| `/mypage` | マイページ（統計・残有休・申請ステータス・掲示板通知バッジ） |
| `/settings` | デフォルト情報設定 |
| `/password` | パスワード変更 |
| `/board` | 掲示板一覧 |
| `/board/{id}` | スレッド詳細 |

**管理者**（ボトムナビなし）:

| URL | 画面 |
|---|---|
| `/admin` | 管理者 TOP（ダッシュボード） |
| `/admin/users` | 作業者一覧（CRUD） |
| `/admin/approval` | 勤怠申請承認（月次確定・有休） |

---

# 主要 API エンドポイント

```
POST /auth/login              # ログイン → JWT 発行 + session_token 更新
POST /auth/logout             # セッション無効化（session_token を NULL に）
POST /auth/register           # ユーザー登録
GET  /auth/me                 # 自分の情報
GET  /auth/mypage             # マイページデータ
PUT  /auth/password           # パスワード変更

GET  /api/attendance          # 月次勤怠取得
POST /api/attendance          # 登録
PUT  /api/attendance/{date}   # 更新
DELETE /api/attendance/{date} # 削除

GET  /api/confirmation        # 月次確定状態
POST /api/confirmation        # 月次確定申請

GET  /api/board/threads       # スレッド一覧
POST /api/board/threads       # スレッド作成
GET  /api/board/threads/{id}  # スレッド詳細
PUT  /api/board/threads/{id}  # スレッド編集
DELETE /api/board/threads/{id}# スレッド削除
POST /api/board/threads/{id}/comments    # コメント追加
PUT  /api/board/comments/{id}            # コメント編集
DELETE /api/board/comments/{id}          # コメント削除
POST /api/board/threads/{id}/react       # スレッドにリアクション
POST /api/board/comments/{id}/react      # コメントにリアクション
GET  /api/board/notifications?since=<ISO># 未読通知件数（マイページバッジ用）

GET  /api/admin/dashboard     # ダッシュボード
GET  /api/admin/users         # ユーザー一覧
POST /api/admin/users         # ユーザー作成
PUT  /api/admin/users/{id}    # ユーザー更新
DELETE /api/admin/users/{id}  # ユーザー削除
GET  /api/admin/approvals/monthly  # 月次申請一覧
POST /api/admin/approvals/monthly/{id}/approve
POST /api/admin/approvals/monthly/{id}/reject
GET  /api/admin/approvals/leave    # 有休申請一覧
POST /api/admin/approvals/leave/{id}/approve
POST /api/admin/approvals/leave/{id}/reject
```

---

# 認証・セッション管理

- JWT は `Authorization: Bearer <token>` ヘッダーで送信
- ペイロード: `{ "sub": "<user_id>", "jti": "<uuid>", "exp": ... }`
- **同時ログイン制御**: ログイン時に UUID を生成し `users.session_token` に保存。`get_current_user` で JWT の `jti` と `users.session_token` を照合。不一致なら 401「別の端末からログインされました。」
- `POST /auth/logout` で `session_token` を NULL に（サーバー側セッション無効化）
- フロントエンド: `localStorage` に `authToken` / `username` / `isAdmin` を保存
- 401 応答 → 自動ログアウト（各 JS の `authFetch` 共通処理）

---

# 掲示板通知（マイページバッジ）

- フロントエンドが `localStorage` の `boardLastSeen_${username}` （ISO8601）を管理
- `/board` 訪問時に現在時刻を書き込み（board.js）
- マイページロード時に `GET /api/board/notifications?since=<ISO>` で自分以外の新着件数を取得
- 件数 > 0 なら「掲示板」メニュー項目に赤バッジを表示

---

# DB マイグレーション

`main.py` の `_migrate()` 関数で既存 DB への追加カラムを管理。  
新カラムは `ALTER TABLE ... ADD COLUMN` で追記型に行う。  
テーブル再作成が必要な制約変更（UNIQUE 追加等）は `CREATE TABLE ... AS SELECT` パターンを使用。  
`Base.metadata.create_all()` は初回起動時のみ有効（既存テーブルは変更しない）。

---

# コードスタイル

- 3層構造: `routers/` → `services/` → SQLAlchemy（models.py）
- Pydantic v2 でリクエスト／レスポンスの型定義
- カスタム例外（`exceptions.py`）を `main.py` の `exception_handler` で一括処理
- JSON キーは snake_case
- コメントは日本語
- 常に日本語で会話・説明する
