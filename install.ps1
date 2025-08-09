param(
    # Nepovinný parametr – ručně zkontrolujeme a při chybě okamžitě skončíme
    [Parameter(Mandatory=$false, Position=0)]
    [string]$CommitDescription
)

# Rychlá kontrola zda byl předán popis commitu (žádné interaktivní dotazy)
if ([string]::IsNullOrWhiteSpace($CommitDescription)) {
    Write-Host "❌ Commit description is required. Usage: .\\install.ps1 \"your description\"" -ForegroundColor Red
    exit 1
}

# AI Copilot Prompt Detector - Build, Release & Install Script
Write-Host "AI Copilot Prompt Detector - Build, Release & Install Script" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host "Commit description (not in commit message to preserve policy): $CommitDescription" -ForegroundColor Cyan

# Get current version from package.json and increment it
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$currentVersion = $packageJson.version
Write-Host "Current version: $currentVersion" -ForegroundColor Cyan

# Parse version and increment patch number
$versionParts = $currentVersion.Split('.')
$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2]
$patch++
$newVersion = "$major.$minor.$patch"

Write-Host "Incrementing version to: $newVersion" -ForegroundColor Yellow

# Update package.json with new version
$packageContent = Get-Content "package.json" -Raw
$packageContent = $packageContent -replace "`"version`": `"$currentVersion`"", "`"version`": `"$newVersion`""
Set-Content "package.json" $packageContent -NoNewline

Write-Host "✅ Version updated in package.json" -ForegroundColor Green

# Clean up old VSIX files first
Write-Host "1. Cleaning old VSIX files..." -ForegroundColor Yellow
$vsixFiles = Get-ChildItem -Path "." -Filter "*.vsix" -ErrorAction SilentlyContinue
if ($vsixFiles.Count -gt 0) {
    Write-Host "   Found $($vsixFiles.Count) old VSIX files to remove:" -ForegroundColor Cyan
    foreach ($file in $vsixFiles) {
        Write-Host "   - Removing: $($file.Name)" -ForegroundColor Gray
        Remove-Item $file.FullName -Force -ErrorAction SilentlyContinue
    }
    Write-Host "   ✅ Old VSIX files cleaned" -ForegroundColor Green
} else {
    Write-Host "   No old VSIX files found" -ForegroundColor Gray
}

# Build the extension FIRST
Write-Host "2. Building extension..." -ForegroundColor Yellow
pnpm run compile
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Build failed!" -ForegroundColor Red; exit 1 }
Write-Host "   ✅ Build successful" -ForegroundColor Green

# Git commit and push AFTER successful build
Write-Host "3. Git commit and push..." -ForegroundColor Yellow
git add .
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Git add failed!" -ForegroundColor Red; exit 1 }

# After git add before commit we log description persistently
$descLog = "commit-descriptions.log"
try { Add-Content -Path $descLog -Value "v$newVersion | $CommitDescription" -ErrorAction SilentlyContinue } catch {}

git commit -m "v$newVersion" -m "$CommitDescription"
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Git commit failed!" -ForegroundColor Red; exit 1 }

git push origin master
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Git push failed!" -ForegroundColor Red; exit 1 }
Write-Host "   ✅ Git commit and push completed" -ForegroundColor Green

# Create VSIX package with current version name
Write-Host "4. Creating VSIX package..." -ForegroundColor Yellow
$vsixName = "ai-prompt-detector-$newVersion.vsix"
Write-Host "   Running: vsce package --allow-star-activation --out $vsixName --no-git-tag-version --no-dependencies" -ForegroundColor Gray
$env:VSCE_INTERACTIVE = "0"
$output = vsce package --allow-star-activation --out $vsixName --no-git-tag-version --no-dependencies 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "❌ VSIX creation failed!" -ForegroundColor Red; Write-Host "Error output:" -ForegroundColor Red; Write-Host $output -ForegroundColor Red; exit 1 }
Write-Host "   ✅ Created: $vsixName" -ForegroundColor Green

# Clean old extensions (completely silent)
Write-Host "5. Cleaning old extensions..." -ForegroundColor Yellow
Start-Process -FilePath "code-insiders" -ArgumentList "--uninstall-extension", "sunamocz.ai-prompt-detector" -WindowStyle Hidden -Wait 2>$null
Start-Sleep -Seconds 2

# Install new extension (no new window)
Write-Host "6. Installing new extension..." -ForegroundColor Yellow
$result = Start-Process -FilePath "code-insiders" -ArgumentList "--install-extension", $vsixName, "--force" -WindowStyle Hidden -Wait -PassThru
if ($result.ExitCode -eq 0) {
    Write-Host "Extension installed successfully!" -ForegroundColor Green
    Write-Host "Please restart VS Code Insiders to see the new version" -ForegroundColor Cyan
    Write-Host "Status bar will show extension info" -ForegroundColor Cyan
    Write-Host "Test with Ctrl+Shift+A or Enter in Copilot Chat" -ForegroundColor Cyan
    Write-Host "Version: $newVersion" -ForegroundColor Cyan
} else {
    Write-Host "Installation failed!" -ForegroundColor Red
}

Write-Host "===================================================" -ForegroundColor Green
Write-Host "Build, Release and Installation complete!" -ForegroundColor Green
