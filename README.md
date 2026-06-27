# 勤怠管理システム

複数の作業者と管理者が利用できる Web ベースの勤怠管理アプリケーション。  
日次勤怠の登録・有休申請・月次確定申請・管理者承認・社内掲示板などの機能を備える。

---

## 技術スタック

| 区分 | 技術 |
|---|---|
| 言語 / Runtime | Python 3.14.5 + uv |
| Web フレームワーク | FastAPI 0.115.0+ |
| ORM / DB | SQLAlchemy 2.x + SQLite |
| 認証 | JWT (python-jose) + bcrypt |
| フロントエンド | バニラ JS + CSS（モバイルファースト） |
| テンプレート | 静的 HTML（FileResponse で配信） |

---

## 機能一覧

### 作業者
- 日次勤怠登録（出勤 / 欠勤 / 遅刻 / 早退）
- 交通費・勤務場所・業務内容の記録
- 有休申請（全休 / 半休）
- 月次勤怠の確定申請
- マイページ（月次統計・残有休・申請ステータス確認）
- 掲示板（スレッド投稿・コメント・リアクション）
- 掲示板の新着通知バッジ（マイページ表示）
- パスワード変更・デフォルト情報設定

### 管理者
- ダッシュボード（申請件数確認）
- 作業者アカウントの CRUD
- 月次勤怠申請の承認 / 否認（否認理由入力）
- 有休申請の承認 / 否認

### セキュリティ
- 同一アカウントの同時別端末ログイン禁止（JWT セッショントークン管理）

---

## セットアップ

### 前提条件
- Python 3.11 以上
- [uv](https://github.com/astral-sh/uv) がインストール済み

### 手順

```bash
# リポジトリのクローン
git clone <repository-url>
cd attendanceSystem/attendanceSystem

# 依存関係インストール
uv sync

# 開発サーバー起動
uv run uvicorn main:app --host 127.0.0.1 --port 8002
```

初回起動時にデータベース（`attendance.db`）と全テーブルが自動作成される。

---

## 起動

```bash
cd attendanceSystem/attendanceSystem

# 開発サーバー（デフォルト）
uv run uvicorn main:app --host 127.0.0.1 --port 8002

# ホットリロードあり（開発時）
uv run uvicorn main:app --host 127.0.0.1 --port 8002 --reload
```

- アプリ: http://127.0.0.1:8002
- API ドキュメント（Swagger UI）: http://127.0.0.1:8002/docs

---

## テストアカウント

| 種別 | メールアドレス | パスワード |
|---|---|---|
| 作業者 | test@example.com | pass1234 |
| 管理者 | admin@example.com | admin1234 |

---

## 画面構成

### 作業者（ボトムナビ: 日次登録 | カレンダー | マイページ）

| URL | 画面 |
|---|---|
| `/login` | ログイン |
| `/daily` | 日次勤怠登録 |
| `/` | 月次カレンダー |
| `/mypage` | マイページ |
| `/settings` | デフォルト情報設定 |
| `/password` | パスワード変更 |
| `/board` | 掲示板一覧 |
| `/board/{id}` | スレッド詳細 |

### 管理者

| URL | 画面 |
|---|---|
| `/admin` | ダッシュボード |
| `/admin/users` | 作業者一覧 |
| `/admin/approval` | 申請承認 |

---

## ディレクトリ構成

```
attendanceSystem/
├── main.py              # FastAPI アプリ定義・DB マイグレーション
├── database.py          # SQLAlchemy エンジン・セッション
├── models.py            # ORM モデル（全テーブル定義）
├── schemas.py           # Pydantic v2 スキーマ
├── exceptions.py        # カスタム業務例外
├── routers/             # APIルーター（auth / attendance / board / confirmation / holidays / admin / pages）
├── services/            # ビジネスロジック（auth / attendance / board / confirmation / admin）
├── templates/           # 静的 HTML ファイル
└── static/
    ├── css/style.css
    └── js/              # 各画面の JavaScript
```

---

## データモデル概要

| テーブル | 概要 |
|---|---|
| `users` | ユーザー情報（is_admin / role / session_token） |
| `attendance_records` | 日次勤怠（UNIQUE: user_id × date） |
| `monthly_confirmations` | 月次確定申請（UNIQUE: user_id × year × month） |
| `bulletin_threads` | 掲示板スレッド |
| `bulletin_comments` | スレッドコメント |
| `bulletin_reactions` | いいねリアクション |

---

## 承認フロー

```
【月次勤怠】
作業者: 確定申請 → PENDING → 管理者: 承認 (APPROVED) / 否認 (REJECTED + 理由)
否認時: カレンダーに否認バナー表示、再編集・再申請が可能

【有休申請】
作業者: 有休登録 → PENDING → 管理者: 承認 / 否認
```

---

## 環境変数

`.env.example` を参考に `.env` を作成する。

| 変数名 | 説明 | デフォルト |
|---|---|---|
| `SECRET_KEY` | JWT 署名キー（本番環境では必ず変更） | `your-secret-key-change-in-production` |
