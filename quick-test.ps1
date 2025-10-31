# DataGate API Test
Write-Host "Testing DataGate API..." -ForegroundColor Cyan

# Health Check
$health = Invoke-RestMethod "https://datagate-poc.vercel.app/api/health"
Write-Host "Version: $($health.version)" -ForegroundColor Green

# Test Upload
$test = Invoke-RestMethod "https://datagate-poc.vercel.app/api/test-upload" -Method POST
Write-Host "Test File ID: $($test.fileId)" -ForegroundColor Green
Write-Host "OTP: $($test.otp)" -ForegroundColor Green

# Check File
$check = Invoke-RestMethod "https://datagate-poc.vercel.app/api/download?id=$($test.fileId)"
Write-Host "File exists: $($check.exists)" -ForegroundColor Green
