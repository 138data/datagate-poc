# Version確認
$health = Invoke-RestMethod "https://datagate-poc.vercel.app/api/health"
if ($health.version -eq "3.0.0") {
    Write-Host "✅ SUCCESS! Version 3.0.0 is deployed!" -ForegroundColor Green
    $health | ConvertTo-Json
} else {
    Write-Host "❌ Still on version $($health.version)" -ForegroundColor Red
    Write-Host "Try Vercel CLI deployment" -ForegroundColor Yellow
}
