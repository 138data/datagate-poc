# test-noav-patch.ps1
# ノーコストAV仕込みパッチのテストスクリプト

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  138DataGate Phase 22 - AV仕込みテスト" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 設定
$baseUrl = "https://datagate-150t77hod-138datas-projects.vercel.app"
$uploadUrl = "$baseUrl/api/upload"
$downloadUrl = "$baseUrl/api/download"

# テスト結果カウンター
$passed = 0
$failed = 0

# テスト関数
function Test-Result {
    param($Name, $Condition, $Message)
    if ($Condition) {
        Write-Host "✅ $Name" -ForegroundColor Green
        Write-Host "   $Message" -ForegroundColor Gray
        $script:passed++
    } else {
        Write-Host "❌ $Name" -ForegroundColor Red
        Write-Host "   $Message" -ForegroundColor Gray
        $script:failed++
    }
}

# ============================================
# テスト1: 正常なファイルのアップロード
# ============================================
Write-Host "`n📤 テスト1: 正常なファイルのアップロード" -ForegroundColor Yellow

# テストファイル作成
$testContent = "Test file for AV scaffolding - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$testFile = "test-noav.txt"
Set-Content -Path $testFile -Value $testContent

# ファイル読み込み
$fileBytes = [System.IO.File]::ReadAllBytes((Get-Item $testFile).FullName)

# アップロード
try {
    $headers = @{
        "Content-Type" = "application/octet-stream"
        "X-File-Name" = [System.Web.HttpUtility]::UrlEncode($testFile)
        "X-File-Type" = "text/plain"
    }
    
    $response = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers -Body $fileBytes
    
    Test-Result "アップロード成功" $response.success "File ID: $($response.fileId)"
    Test-Result "OTP生成" ($response.otp.Length -eq 6) "OTP: $($response.otp)"
    Test-Result "scanStatus存在" ($response.scanStatus -ne $null) "scanStatus: $($response.scanStatus)"
    Test-Result "scanStatus=not_scanned" ($response.scanStatus -eq 'not_scanned') "現在はスキャン無効"
    
    $fileId = $response.fileId
    $otp = $response.otp
    
} catch {
    Write-Host "❌ アップロード失敗: $($_.Exception.Message)" -ForegroundColor Red
    $script:failed += 4
    exit 1
}

# ============================================
# テスト2: ファイル情報取得（GET）
# ============================================
Write-Host "`n📋 テスト2: ファイル情報取得（GET）" -ForegroundColor Yellow

try {
    $infoResponse = Invoke-RestMethod -Uri "$downloadUrl?id=$fileId" -Method Get
    
    Test-Result "ファイル情報取得成功" $infoResponse.success "exists: $($infoResponse.exists)"
    Test-Result "scanStatus存在（GET）" ($infoResponse.scanStatus -ne $null) "scanStatus: $($infoResponse.scanStatus)"
    Test-Result "remainingDownloads" ($infoResponse.remainingDownloads -eq 3) "残り: $($infoResponse.remainingDownloads)回"
    
} catch {
    Write-Host "❌ ファイル情報取得失敗: $($_.Exception.Message)" -ForegroundColor Red
    $script:failed += 3
}

# ============================================
# テスト3: ファイルダウンロード（POST）
# ============================================
Write-Host "`n📥 テスト3: ファイルダウンロード（POST）" -ForegroundColor Yellow

try {
    $downloadBody = @{
        id = $fileId
        otp = $otp
    } | ConvertTo-Json
    
    $downloadedFile = "downloaded-test.txt"
    Invoke-RestMethod -Uri $downloadUrl -Method Post -Body $downloadBody -ContentType "application/json" -OutFile $downloadedFile
    
    $downloadedContent = Get-Content $downloadedFile -Raw
    
    Test-Result "ダウンロード成功" (Test-Path $downloadedFile) "ファイル保存完了"
    Test-Result "内容一致" ($downloadedContent.Trim() -eq $testContent) "元のファイルと一致"
    
    # クリーンアップ
    Remove-Item $downloadedFile -Force
    
} catch {
    Write-Host "❌ ダウンロード失敗: $($_.Exception.Message)" -ForegroundColor Red
    $script:failed += 2
}

# ============================================
# テスト4: 禁止拡張子のテスト（.exe）
# ============================================
Write-Host "`n🚫 テスト4: 禁止拡張子のテスト（.exe）" -ForegroundColor Yellow

# ダミー.exeファイル作成
$exeBytes = [byte[]](1..100)

try {
    $headers = @{
        "Content-Type" = "application/octet-stream"
        "X-File-Name" = [System.Web.HttpUtility]::UrlEncode("malware.exe")
        "X-File-Type" = "application/x-msdownload"
    }
    
    $response = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers -Body $exeBytes -ErrorAction Stop
    
    # 本来はここに到達しないはず
    Test-Result "拒否成功" $false "期待に反してアップロードが成功してしまった"
    
} catch {
    $errorMessage = $_.Exception.Message
    Test-Result "拒否成功" ($errorMessage -like "*許可されていません*") "拡張子チェックが動作"
}

# ============================================
# テスト5: 禁止拡張子のテスト（.js）
# ============================================
Write-Host "`n🚫 テスト5: 禁止拡張子のテスト（.js）" -ForegroundColor Yellow

# ダミー.jsファイル作成
$jsBytes = [System.Text.Encoding]::UTF8.GetBytes("console.log('test');")

try {
    $headers = @{
        "Content-Type" = "application/octet-stream"
        "X-File-Name" = [System.Web.HttpUtility]::UrlEncode("script.js")
        "X-File-Type" = "application/javascript"
    }
    
    $response = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers -Body $jsBytes -ErrorAction Stop
    
    Test-Result "拒否成功" $false "期待に反してアップロードが成功してしまった"
    
} catch {
    $errorMessage = $_.Exception.Message
    Test-Result "拒否成功" ($errorMessage -like "*許可されていません*") "拡張子チェックが動作"
}

# ============================================
# テスト6: 許可拡張子のテスト（.pdf）
# ============================================
Write-Host "`n✅ テスト6: 許可拡張子のテスト（.pdf）" -ForegroundColor Yellow

# ダミーPDFファイル作成（簡易版）
$pdfBytes = [System.Text.Encoding]::UTF8.GetBytes("Dummy PDF content")

try {
    $headers = @{
        "Content-Type" = "application/octet-stream"
        "X-File-Name" = [System.Web.HttpUtility]::UrlEncode("document.pdf")
        "X-File-Type" = "application/pdf"
    }
    
    $response = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $headers -Body $pdfBytes
    
    Test-Result "PDFアップロード成功" $response.success "許可拡張子が正常に動作"
    Test-Result "scanStatus=not_scanned（PDF）" ($response.scanStatus -eq 'not_scanned') "スキャン無効を確認"
    
} catch {
    Write-Host "❌ PDFアップロード失敗: $($_.Exception.Message)" -ForegroundColor Red
    $script:failed += 2
}

# ============================================
# クリーンアップ
# ============================================
Write-Host "`n🧹 クリーンアップ中..." -ForegroundColor Gray
Remove-Item $testFile -Force -ErrorAction SilentlyContinue

# ============================================
# テスト結果サマリー
# ============================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  テスト結果サマリー" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$total = $passed + $failed
$successRate = [math]::Round(($passed / $total) * 100, 1)

Write-Host "`n✅ 成功: $passed / $total ($successRate%)" -ForegroundColor Green
Write-Host "❌ 失敗: $failed / $total" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

if ($failed -eq 0) {
    Write-Host "`n🎉 すべてのテストが成功しました！" -ForegroundColor Green
    Write-Host "   Phase 22準備（AV仕込み）は正常に動作しています。`n" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "`n⚠️  一部のテストが失敗しました。" -ForegroundColor Yellow
    Write-Host "   詳細は上記のログを確認してください。`n" -ForegroundColor Gray
    exit 1
}
