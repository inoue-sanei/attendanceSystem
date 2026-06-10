# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# プロジェクト概要
勤怠管理Webアプリ。個人ユーザーがweb上で勤怠を管理・申請できるシンプルなサービス。

# 技術スタック
- Python 3.11+
- FastAPI
- SQLAlchemy 2.x + SQLite
- Jinja2（HTMLテンプレート）
- HTML / CSS / JavaScript（バニラ）

# Code Style
- Python 3.11+、FastAPI
- `routers/` → `services/` → SQLAlchemy（models.py）の3層構造
- Pydantic v2 でリクエスト/レスポンスの型定義（record 相当）
- カスタム例外クラスで業務エラーを表現し、`main.py` の `exception_handler` で一括処理
- JSON キーは snake_case（Python 標準に統一）

# 言語設定
- 常に日本語で会話する
- コメントも日本語で記述する
- エラーメッセージの説明も日本語で行う
- ドキュメントも日本語で生成する

# 起動・実行コマンド

```bash
# 依存関係インストール
pip install -r requirements.txt

# 開発サーバー起動（ホットリロードあり）
uvicorn main:app --reload

# 本番起動
uvicorn main:app --host 0.0.0.0 --port 8080
```

- アプリ: http://localhost:8000
- APIドキュメント（自動生成）: http://localhost:8000/docs

# アーキテクチャ

```
attendance/
├── main.py           # FastAPI アプリ定義・例外ハンドラー登録・DB初期化
├── database.py       # SQLAlchemy エンジン・セッション・Base クラス
├── models.py         # ORM モデル（AttendanceRecord）
├── schemas.py        # Pydantic スキーマ（AttendanceRequest / AttendanceResponse）
├── exceptions.py     # カスタム例外（AttendanceAlreadyExistsError 等）
├── routers/
│   ├── attendance.py # REST API（/api/attendance）
│   └── pages.py      # HTML ページ配信（/）
├── services/
│   └── attendance.py # ビジネスロジック（CRUD + 重複チェック）
├── templates/        # Jinja2 HTML テンプレート
└── static/           # CSS / JavaScript
```

主要エンティティ: `AttendanceRecord`（`date` 列に一意制約）  
勤怠区分: `PRESENT`（出勤）/ `ABSENT`（欠勤）/ `LATE`（遅刻）/ `EARLY_LEAVE`（早退）
