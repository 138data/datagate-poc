# DataGate SMTP Test Script v2
$headers = @{
    "Authorization" = "Bearer test-upload-token-138data"
    "X-Recipient-Email" = "138data@gmail.com"
    "X-Sender-Email" = "138data@gmail.com"
    "X-Sender-Name" = "Test Sender"  # 英語に変更
    "X-Subject" = "SMTP Test $(Get-Date -Format 'HH:mm:ss')"  # 英語に変更
    "X-Body" = "This is a test message from DataGate SMTP version"  # 英語に変更
}

# Test file content
$testContent = "This is a test file for SMTP version"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($testContent)

Write-Host "Sending test request..." -ForegroundColor Cyan
Write-Host "Headers:" -ForegroundColor Yellow
$headers.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }

try {
    # Local test
    $response = Invoke-RestMethod "http://localhost:3000/api/upload-smtp" -Method POST -Headers $headers -Body $bytes -ErrorAction Stop
    
    Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 3
    
    if ($response.downloadLink) {
        Write-Host "`nDownload Link:" -ForegroundColor Yellow
        Write-Host $response.downloadLink -ForegroundColor White
        
        Write-Host "`nManage Link:" -ForegroundColor Yellow
        Write-Host $response.manageLink -ForegroundColor White
    }
    
} catch {
    Write-Host "`n=== ERROR ===" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "Response Body:" -ForegroundColor Yellow
        Write-Host $errorBody
    }
}
