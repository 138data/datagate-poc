@echo off
echo ========================================
echo DataGate Phase 2 デプロイスクリプト
echo ========================================
echo.

cd /d D:\datagate-poc

echo [1/5] 現在の状態を確認...
git status
echo.

echo [2/5] 最新の変更を取得...
git pull
echo.

echo [3/5] Phase 2のファイルを配置してください
echo 以下のファイルを D:\datagate-poc に配置:
echo - index.js (更新版)
echo - package.json (更新版)
echo - smtp-server.js (新規)
echo - .env.template (新規)
echo.
pause

echo [4/5] 変更をGitに追加...
git add .
git status
echo.

echo [5/5] コミット＆プッシュ...
git commit -m "Phase 2: SMTP機能とPPAP検出機能を実装 - テストアップロード機能追加"
git push
echo.

echo ========================================
echo デプロイ完了！
echo Railway.appで自動デプロイされます（1-2分待機）
echo.
echo 確認URL:
echo https://datagate-poc-production.up.railway.app
echo ========================================
pause
