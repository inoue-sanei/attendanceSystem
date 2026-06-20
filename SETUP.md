# 勤怠管理システム - 環境セットアップガイド

## 📋 システム要件

- Python 3.8 以上
- pip または uv（パッケージマネージャー）

## 🚀 クイックスタート

### 1. 環境準備（初回のみ）

#### Windows の場合:
```bash
# コマンドプロンプトまたはPowerShellから

# 作業ディレクトリに移動
cd attendanceSystem

# 依存パッケージのインストール
pip install -r requirements.txt
```

#### macOS / Linux の場合:
```bash
cd attendanceSystem
pip install -r requirements.txt
```

### 2. 開発サーバーの起動

#### Windows:
バッチファイルを実行：
```bash
run_dev.bat
```

または手動で：
```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

#### macOS / Linux:
```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 3. ブラウザでアクセス

サーバーが起動したら、ブラウザで以下にアクセスしてください：

- **Swagger UI（API ドキュメント）**: http://localhost:8000/docs
- **ReDoc（代替ドキュメント）**: http://localhost:8000/redoc
- **OpenAPI スキーマ**: http://localhost:8000/openapi.json

## 🧪 ログイン機能のテスト

### 自動テストスクリプト

サーバー起動後、別のターミナルから実行：

```bash
python test_auth.py
```

このスクリプトは以下をテストします：
- ユーザー登録 (`POST /auth/register`)
- ログイン (`POST /auth/login`)
- エラーハンドリング（不正なパスワード、重複ユーザー）

### Swagger UI からのテスト

1. http://localhost:8000/docs にアクセス
2. 「auth」セクションを展開
3. 各エンドポイントの「Try it out」をクリック
4. リクエストボディを入力して「Execute」をクリック

#### テスト用ユーザーデータ:

**ユーザー登録**:
```json
{
  "username": "demo_user",
  "email": "demo@example.com",
  "password": "password123"
}
```

**ログイン**:
```json
{
  "username": "demo_user",
  "password": "password123"
}
```

## 📁 プロジェクト構造

```
attendanceSystem/
├── main.py                 # FastAPI アプリケーション メインファイル
├── models.py               # SQLAlchemy モデル定義
├── schemas.py              # Pydantic スキーマ定義
├── database.py             # データベース接続設定
├── exceptions.py           # カスタム例外定義
├── requirements.txt        # 依存パッケージ一覧
├── .env.example            # 環境変数テンプレート
├── run_dev.bat             # Windows 開発サーバー起動スクリプト
├── test_auth.py            # ログイン機能テストスクリプト
├── routers/                # APIルーター
│   ├── __init__.py
│   ├── auth.py             # 認証エンドポイント
│   ├── attendance.py       # 勤怠エンドポイント
│   ├── confirmation.py     # 月次確定エンドポイント
│   ├── holidays.py         # 休日エンドポイント
│   └── pages.py            # ページエンドポイント
├── services/               # ビジネスロジック
│   ├── __init__.py
│   ├── auth.py             # 認証ロジック
│   ├── attendance.py       # 勤怠ロジック
│   └── confirmation.py     # 月次確定ロジック
├── static/                 # 静的ファイル
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── calendar.js
└── templates/              # HTMLテンプレート
    └── index.html
```

## 🔐 ログイン機能の詳細

### 実装されたエンドポイント

#### 1. ユーザー登録
```
POST /auth/register

Request:
{
  "username": "string",
  "email": "string",
  "password": "string"
}

Response:
{
  "id": 1,
  "username": "string",
  "email": "string",
  "is_active": true
}
```

#### 2. ログイン
```
POST /auth/login

Request:
{
  "username": "string",
  "password": "string"
}

Response:
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "string",
    "email": "string",
    "is_active": true
  }
}
```

#### 3. 現在のユーザー情報
```
GET /auth/me
（JWT トークン認証が必要）
```

### セキュリティ機能

- ✅ **パスワード暗号化**: bcrypt によるハッシング化
- ✅ **JWT トークン認証**: 30分の有効期限
- ✅ **入力バリデーション**: Pydantic による型チェック
- ✅ **エラーハンドリング**: 適切なステータスコード返却

## 🛠️ トラブルシューティング

### ポート 8000 が既に使用されている場合

別のポートを指定して起動：
```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

### パッケージのインストールに失敗する場合

```bash
# pip をアップグレード
python -m pip install --upgrade pip

# 再度インストール
pip install -r requirements.txt
```

### データベースエラーが出た場合

既存のデータベースをリセット：
```bash
# attendance.db を削除
rm attendance.db
# または Windows の場合:
del attendance.db

# サーバーを再起動（自動で新しいDBが作成されます）
python -m uvicorn main:app --reload
```

## 📚 参考リンク

- [FastAPI ドキュメント](https://fastapi.tiangolo.com/)
- [SQLAlchemy ドキュメント](https://docs.sqlalchemy.org/)
- [Pydantic ドキュメント](https://docs.pydantic.dev/)

## 📝 開発ノート

開発時のメモや既知の問題は [CLAUDE.md](CLAUDE.md) を参照してください。
