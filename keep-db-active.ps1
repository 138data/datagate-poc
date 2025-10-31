# Upstash Redis Database Keep-Alive Script
# Created: 2025-10-29

$deployUrl = "https://datagate-a79rib2pm-138datas-projects.vercel.app"

try {
    # ヘルスチェックエンドポイントにアクセス
    $response = curl.exe -s "$deployUrl/api/health" --max-time 10
    
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Write-Host "$timestamp - ✅ Database keep-alive successful" -ForegroundColor Green
    
    # ログファイルに記録
    "$timestamp - OK - Response: $response" | Out-File -FilePath "D:\datagate-poc\keep-alive.log" -Append -Encoding UTF8
    
} catch {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Write-Host "$timestamp - ❌ Failed: $_" -ForegroundColor Red
    
    # エラーもログに記録
    "$timestamp - ERROR: $_" | Out-File -FilePath "D:\datagate-poc\keep-alive.log" -Append -Encoding UTF8
}
