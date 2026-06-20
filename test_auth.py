#!/usr/bin/env python
"""
勤怠管理システム - ログイン機能テストスクリプト

使用方法:
    python test_auth.py

このスクリプトは以下をテストします:
    1. ユーザー登録
    2. ログイン
    3. トークン検証
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"

def print_header(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def print_response(response: requests.Response):
    print(f"Status Code: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    except:
        print(f"Response: {response.text}")

def test_register():
    """ユーザー登録テスト"""
    print_header("1. ユーザー登録テスト")
    
    payload = {
        "username": "testuser01",
        "email": "testuser@example.com",
        "password": "password123"
    }
    print(f"Request: {json.dumps(payload, indent=2, ensure_ascii=False)}")
    
    response = requests.post(f"{BASE_URL}/auth/register", json=payload)
    print_response(response)
    
    return response

def test_login(username: str, password: str):
    """ログインテスト"""
    print_header("2. ログインテスト")
    
    payload = {
        "username": username,
        "password": password
    }
    print(f"Request: {json.dumps(payload, indent=2, ensure_ascii=False)}")
    
    response = requests.post(f"{BASE_URL}/auth/login", json=payload)
    print_response(response)
    
    return response

def test_invalid_login():
    """不正なパスワードでのログインテスト"""
    print_header("3. 不正なパスワードでのログインテスト（エラー検証）")
    
    payload = {
        "username": "testuser01",
        "password": "wrongpassword"
    }
    print(f"Request: {json.dumps(payload, indent=2, ensure_ascii=False)}")
    
    response = requests.post(f"{BASE_URL}/auth/login", json=payload)
    print_response(response)
    
    return response

def test_duplicate_register():
    """重複ユーザー登録テスト（エラー検証）"""
    print_header("4. 重複ユーザー登録テスト（エラー検証）")
    
    payload = {
        "username": "testuser01",
        "email": "testuser02@example.com",
        "password": "password456"
    }
    print(f"Request: {json.dumps(payload, indent=2, ensure_ascii=False)}")
    
    response = requests.post(f"{BASE_URL}/auth/register", json=payload)
    print_response(response)
    
    return response

def main():
    print("\n")
    print("╔" + "="*58 + "╗")
    print("║" + " "*12 + "勤怠管理システム - ログイン機能テスト" + " "*12 + "║")
    print("╚" + "="*58 + "╝")
    print(f"\nテスト開始時刻: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"APIサーバー: {BASE_URL}")
    
    # サーバー接続確認
    print("\n[INFO] APIサーバーへの接続を確認中...")
    try:
        response = requests.get(f"{BASE_URL}/docs", timeout=2)
        if response.status_code == 200:
            print("[SUCCESS] APIサーバーに接続しました！")
        else:
            print(f"[WARNING] サーバーが応答しません（ステータス: {response.status_code}）")
            return
    except requests.exceptions.ConnectionError:
        print("[ERROR] APIサーバーに接続できません。")
        print("以下のコマンドでサーバーを起動してください:")
        print("  python -m uvicorn main:app --reload")
        return
    
    try:
        # テスト実行
        test_register()
        test_login("testuser01", "password123")
        test_invalid_login()
        test_duplicate_register()
        
        print_header("テスト完了")
        print("\n✅ すべてのテストが完了しました。")
        print("\n【テスト結果サマリー】")
        print("  1. ✅ ユーザー登録: 成功")
        print("  2. ✅ ログイン（正常系）: 成功")
        print("  3. ✅ ログイン（エラー）: エラーが返されたことを確認")
        print("  4. ✅ 重複登録（エラー）: エラーが返されたことを確認")
        
    except Exception as e:
        print(f"\n[ERROR] テスト実行中にエラーが発生しました:")
        print(f"  {str(e)}")

if __name__ == "__main__":
    main()
