param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [Parameter(Mandatory=$true)]
    [string]$ApiUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$RecipientEmail,
    
    [Parameter(Mandatory=$true)]
    [string]$SenderEmail,
    
    [Parameter(Mandatory=$true)]
    [string]$SenderName,
    
    [string]$Subject = "ファイル送信",
    
    [string]$Message = "ファイルを送信しました。"
)

# ファイルの存在確認
if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

# ファイル情報の取得
$fileName = [System.IO.Path]::GetFileName($FilePath)
$fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
$fileSize = $fileBytes.Length

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "138DataGate File Upload" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "File: $fileName" -ForegroundColor Yellow
Write-Host "Size: $fileSize bytes" -ForegroundColor Yellow
Write-Host "Recipient: $RecipientEmail" -ForegroundColor Yellow
Write-Host "Sender: $SenderName ($SenderEmail)" -ForegroundColor Yellow
Write-Host "Uploading..." -ForegroundColor Green
Write-Host ""

try {
    # HTTPクライアントを使用
    Add-Type -AssemblyName System.Net.Http
    
    $client = New-Object System.Net.Http.HttpClient
    $content = New-Object System.Net.Http.MultipartFormDataContent
    
    # ファイルを追加
    $fileContent = New-Object System.Net.Http.ByteArrayContent($fileBytes)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/octet-stream")
    $content.Add($fileContent, "file", $fileName)
    
    # フォームデータを追加
    $content.Add([System.Net.Http.StringContent]::new($RecipientEmail), "recipientEmail")
    $content.Add([System.Net.Http.StringContent]::new($SenderEmail), "senderEmail")
    $content.Add([System.Net.Http.StringContent]::new($SenderName), "senderName")
    $content.Add([System.Net.Http.StringContent]::new($Subject), "subject")
    $content.Add([System.Net.Http.StringContent]::new($Message), "message")
    
    # リクエスト送信
    $response = $client.PostAsync($ApiUrl, $content).Result
    $responseContent = $response.Content.ReadAsStringAsync().Result
    
    if ($response.IsSuccessStatusCode) {
        $result = $responseContent | ConvertFrom-Json
        
        Write-Host "SUCCESS! Upload Complete!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "File ID: $($result.fileId)" -ForegroundColor Cyan
        Write-Host "Download URL: $($result.downloadUrl)" -ForegroundColor Cyan
        Write-Host "OTP: $($result.otp)" -ForegroundColor Yellow
        Write-Host "Delete Key: $($result.deleteKey)" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "Emails:" -ForegroundColor Green
        Write-Host "  - Download Link: $($result.emails.downloadLink)"
        Write-Host "  - OTP Code: $($result.emails.otp)"
        Write-Host "  - Management: $($result.emails.management)"
        
        # クリップボードにコピー
        "$($result.downloadUrl)`nOTP: $($result.otp)" | Set-Clipboard
        Write-Host ""
        Write-Host "URL and OTP copied to clipboard!" -ForegroundColor Green
    } else {
        Write-Host "Error: $($response.StatusCode)" -ForegroundColor Red
        Write-Host "Details: $responseContent" -ForegroundColor Red
    }
    
    $client.Dispose()
    
} catch {
    Write-Host "Error occurred:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
