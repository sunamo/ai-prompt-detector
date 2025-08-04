# SpecStory AutoSave - Build Only Script
Write-Host "Building TypeScript..." -ForegroundColor Yellow

# Just compile TypeScript without any other operations
tsc -p .

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ TypeScript compilation successful" -ForegroundColor Green
} else {
    Write-Host "❌ TypeScript compilation failed!" -ForegroundColor Red
    exit 1
}
