@echo off
echo ========================================
echo 138DataGate Auto Cleanup
echo ========================================
echo.

cd /d D:\datagate-poc

echo [1] 単発実行（1回だけ実行）
echo [2] スケジューラー起動（5分ごとに実行）
echo [3] 終了
echo.

set /p choice="選択してください (1-3): "

if "%choice%"=="1" (
    echo.
    echo 単発実行を開始します...
    echo.
    node auto-cleanup.js
    echo.
    pause
) else if "%choice%"=="2" (
    echo.
    echo スケジューラーを起動します...
    echo Ctrl+C で停止できます
    echo.
    node cleanup-scheduler.js
) else (
    echo 終了します
    exit
)
