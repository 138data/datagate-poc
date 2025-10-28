# Phase 28: 緊急デプロイスクリプト
# 目的: encryption.js と upload.js を即座にデプロイ

Write-Host "`n=== Phase 28: 緊急デプロイ ===" -ForegroundColor Red
Write-Host "エラー: 現在のデプロイは旧版のまま（lib/crypto.js をインポート）" -ForegroundColor Yellow
Write-Host "対応: 新版ファイルをデプロイします" -ForegroundColor Cyan

# 作業ディレクトリに移動
Set-Location D:\datagate-poc

# Step 1: 現在の api/upload.js のインポート文を確認
Write-Host "`n[確認] 現在の api/upload.js のインポート文:" -ForegroundColor Yellow
Get-Content api\upload.js -Encoding UTF8 | Select-String "import.*from.*lib" | Select-Object -First 5

# Step 2: 修正が必要か確認
$uploadContent = Get-Content api\upload.js -Raw -Encoding UTF8
if ($uploadContent -match "lib/crypto\.js") {
    Write-Host "❌ 旧版検出: lib/crypto.js をインポートしています" -ForegroundColor Red
    Write-Host "→ 新版に置き換えます" -ForegroundColor Yellow
} elseif ($uploadContent -match "lib/encryption\.js") {
    Write-Host "✅ 新版検出: lib/encryption.js をインポートしています" -ForegroundColor Green
    Write-Host "→ デプロイのみ実行します" -ForegroundColor Cyan
} else {
    Write-Host "⚠️ 警告: インポート文が見つかりません" -ForegroundColor Yellow
}

Write-Host "`n以下の手順でファイルを配置してください:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Claude から encryption.js をダウンロード" -ForegroundColor White
Write-Host "   → https://claude.ai/download/... のリンクをクリック" -ForegroundColor Gray
Write-Host ""
Write-Host "2. ダウンロードした encryption.js を以下に保存:" -ForegroundColor White
Write-Host "   D:\datagate-poc\lib\encryption.js" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Claude から upload.js をダウンロード" -ForegroundColor White
Write-Host "   → https://claude.ai/download/... のリンクをクリック" -ForegroundColor Gray
Write-Host ""
Write-Host "4. ダウンロードした upload.js を以下に保存:" -ForegroundColor White
Write-Host "   D:\datagate-poc\api\upload.js" -ForegroundColor Gray
Write-Host ""
Write-Host "5. ファイル配置が完了したら Enter キーを押してください" -ForegroundColor Cyan
Read-Host

# Step 3: ファイルの存在確認
Write-Host "`n[確認] ファイルの存在確認..." -ForegroundColor Yellow
if (!(Test-Path lib\encryption.js)) {
    Write-Host "❌ エラー: lib\encryption.js が見つかりません" -ForegroundColor Red
    exit 1
}
if (!(Test-Path api\upload.js)) {
    Write-Host "❌ エラー: api\upload.js が見つかりません" -ForegroundColor Red
    exit 1
}
Write-Host "✅ ファイル存在確認完了" -ForegroundColor Green

# Step 4: 新版の確認
Write-Host "`n[確認] 新版の内容確認..." -ForegroundColor Yellow

# encryption.js に generateOTP が存在するか
$encContent = Get-Content lib\encryption.js -Raw -Encoding UTF8
if ($encContent -match "function generateOTP") {
    Write-Host "✅ encryption.js: generateOTP 関数が存在" -ForegroundColor Green
} else {
    Write-Host "❌ 警告: encryption.js に generateOTP 関数が見つかりません" -ForegroundColor Red
}

# upload.js が encryption.js をインポートしているか
$uploadContent = Get-Content api\upload.js -Raw -Encoding UTF8
if ($uploadContent -match "lib/encryption\.js") {
    Write-Host "✅ upload.js: lib/encryption.js をインポート" -ForegroundColor Green
} else {
    Write-Host "❌ 警告: upload.js が lib/encryption.js をインポートしていません" -ForegroundColor Red
}

# Step 5: Git ステータス確認
Write-Host "`n[確認] Git ステータス..." -ForegroundColor Yellow
git status -s

# Step 6: Git コミット
Write-Host "`n[実行] Git コミット..." -ForegroundColor Yellow
git add lib/encryption.js api/upload.js

Write-Host "変更内容:" -ForegroundColor Cyan
git status -s

$commitMsg = "fix: Add generateOTP and correct encryption function usage"
Write-Host "コミットメッセージ: $commitMsg" -ForegroundColor Cyan

git commit -m $commitMsg

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Git コミット失敗" -ForegroundColor Red
    Write-Host "変更がない可能性があります。git status で確認してください。" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Git コミット完了" -ForegroundColor Green

# Step 7: Git プッシュ
Write-Host "`n[実行] Git プッシュ..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Git プッシュ失敗" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Git プッシュ完了" -ForegroundColor Green

# Step 8: デプロイ待機
Write-Host "`n[待機] Vercel デプロイ中（90秒）..." -ForegroundColor Yellow
Write-Host "デプロイURL: https://datagate-llf1m9q6a-138datas-projects.vercel.app" -ForegroundColor Cyan

$seconds = 90
for ($i = 1; $i -le $seconds; $i++) {
    $remaining = $seconds - $i
    Write-Progress -Activity "デプロイ待機中" -Status "$remaining 秒残り" -PercentComplete (($i / $seconds) * 100)
    Start-Sleep -Seconds 1
}
Write-Progress -Activity "デプロイ待機中" -Completed

Write-Host "✅ デプロイ待機完了" -ForegroundColor Green

# Step 9: アップロードテスト
Write-Host "`n[テスト] アップロードテスト実行..." -ForegroundColor Yellow
Write-Host "テストファイル: test-small.txt" -ForegroundColor Cyan
Write-Host "送信先: datagate@138io.com" -ForegroundColor Cyan

if (!(Test-Path test-small.txt)) {
    Write-Host "❌ エラー: test-small.txt が見つかりません" -ForegroundColor Red
    Write-Host "カレントディレクトリ:" (Get-Location) -ForegroundColor Yellow
    exit 1
}

$response = curl.exe -X POST "https://datagate-llf1m9q6a-138datas-projects.vercel.app/api/upload" `
  -F "file=@test-small.txt" `
  -F "recipient=datagate@138io.com" `
  --silent

Write-Host "`n=== アップロード結果 ===" -ForegroundColor Cyan

try {
    $json = $response | ConvertFrom-Json
    $json | ConvertTo-Json -Depth 10
    
    # 結果検証
    Write-Host "`n=== 検証結果 ===" -ForegroundColor Cyan
    
    if ($json.success -eq $true) {
        Write-Host "✅ success: true" -ForegroundColor Green
    } else {
        Write-Host "❌ success: false または null" -ForegroundColor Red
    }
    
    if ($json.fileId) {
        Write-Host "✅ fileId: $($json.fileId)" -ForegroundColor Green
    } else {
        Write-Host "❌ fileId が生成されていません" -ForegroundColor Red
    }
    
    if ($json.otp -match "^\d{6}$") {
        Write-Host "✅ otp: $($json.otp) (6桁数値)" -ForegroundColor Green
    } else {
        Write-Host "❌ otp が正しくありません: $($json.otp)" -ForegroundColor Red
    }
    
    if ($json.email.mode -eq "link") {
        Write-Host "✅ email.mode: link" -ForegroundColor Green
    } else {
        Write-Host "⚠️ email.mode: $($json.email.mode)" -ForegroundColor Yellow
    }
    
    if ($json.email.success -eq $true) {
        Write-Host "✅ email.success: true" -ForegroundColor Green
    } else {
        Write-Host "❌ email.success: false" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ JSON パースエラー" -ForegroundColor Red
    Write-Host "レスポンス:" -ForegroundColor Yellow
    Write-Host $response -ForegroundColor Gray
}

Write-Host "`n=== Phase 28 緊急デプロイ完了 ===" -ForegroundColor Green
Write-Host ""
Write-Host "次のステップ:" -ForegroundColor Yellow
Write-Host "1. 上記の検証結果を確認" -ForegroundColor White
Write-Host "2. すべて ✅ なら Phase 24 の4つのテストを実行" -ForegroundColor White
Write-Host "3. エラーがある場合は Vercel ログを確認:" -ForegroundColor White
Write-Host "   vercel logs https://datagate-llf1m9q6a-138datas-projects.vercel.app" -ForegroundColor Gray
