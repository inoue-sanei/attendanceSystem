@echo off
REM FastAPI開発サーバー起動スクリプト

echo.
echo =====================================
echo  勤怠管理システム - 開発サーバー起動
echo =====================================
echo.

echo [INFO] パッケージ依存関係を確認中...
python -m pip list | findstr fastapi >nul 2>&1

if errorlevel 1 (
    echo [ERROR] 必要なパッケージがインストールされていません。
    echo requirements.txt からインストールしてください:
    echo   pip install -r requirements.txt
    pause
    exit /b 1
)

echo [INFO] FastAPI サーバーを起動中...
echo [INFO] ブラウザで下記にアクセスしてください:
echo   - API ドキュメント (Swagger UI): http://localhost:8000/docs
echo   - 代替ドキュメント (ReDoc): http://localhost:8000/redoc
echo.
echo [INFO] Ctrl+C で終了します
echo.

python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

pause
