# DataGate SMTP版テスト
$headers = @{
    "Authorization" = "Bearer test-upload-token-138data"
    "X-Recipient-Email" = "138data@gmail.com"  # テスト用に同じメールアドレス
    "X-Sender-Email" = "138data@gmail.com"
    "X-Sender-Name" = "テスト送信者"
    "X-Subject" = "SMTP版テスト $(Get-Date -Format 'HH:mm:ss')"
    "X-Body" = "これはSMTP版のテストメッセージです"
}

# テストファイル作成
$testContent = "This is a test file for SMTP version"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($testContent)

try {
    # ローカルテスト
    $response = Invoke-RestMethod "http://localhost:3000/api/upload-smtp" -Method POST -Headers $headers -Body $bytes
    
    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host "Download Link: $($response.downloadLink)" -ForegroundColor Cyan
    Write-Host "Manage Link: $($response.manageLink)" -ForegroundColor Yellow
    
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}
