<#
.SYNOPSIS
    Hlavní build a deploy skript pro AI Copilot Prompt Detector rozšíření.
    Tento skript je JEDINÝ podporovaný způsob pro nasazení nových verzí rozšíření.

.DESCRIPTION
    Skript provádí kompletní automatizovaný release proces zahrnující kompilaci TypeScript kódu,
    automatickou inkrementaci PATCH verze (např. 1.1.410 → 1.1.411), vytvoření VSIX balíčku,
    commit změn do Gitu s verzí jako message, push na GitHub a instalaci do VS Code.
    
    Workflow postupuje v tomto pořadí:
    1. Kontrola přítomnosti všech potřebných nástrojů (pnpm, git, code, vsce)
    2. Načtení aktuální verze z package.json a automatická inkrementace PATCH čísla
    3. Aktualizace verze v package.json pomocí string replace (zachovává formátování)
    4. Kontrola a případná instalace dependencies (pouze pokud chybí TypeScript compiler)
    5. Vyčištění starých VSIX souborů z předchozích buildů
    6. Kompilace TypeScript kódu pomocí pnpm run compile
    7. Git add všech změn, commit s verzí jako hlavní message a popisem jako druhý -m parametr
    8. Push na origin/master branch
    9. Vytvoření VSIX balíčku pomocí vsce s --allow-star-activation a --no-dependencies flagy
    10. Odinstalace staré verze rozšíření z VS Code
    11. Instalace nové verze rozšíření s --force flagem
    12. Restart VS Code s otevřením projektu E:\vs\TypeScript_Projects\_\vscode

.PARAMETER CommitDescription
    [POVINNÝ] Textový popis změn provedených v této verzi.
    Tento popis se ukládá do commit-descriptions.log pro audit trail a jako druhý -m parametr v git commit.
    Není součástí hlavní commit message (ta obsahuje pouze verzi, např. "v1.1.411").

.EXAMPLE
    ./install.ps1 "Fixed mouse detection and improved logging"
    
    Provede kompletní release s popisem "Fixed mouse detection and improved logging".
    Verze se automaticky zvýší např. z 1.1.410 na 1.1.411.

.EXAMPLE
    ./install.ps1 "Added support for multiple VS Code instances"
    
    Build, verzování, commit, push a instalace s daným popisem změn.

.NOTES
    - NIKDY ručně neinkrementujte verzi v package.json - skript to dělá automaticky
    - MAJOR a MINOR verze se nemění automaticky, pouze PATCH
    - Pro publikaci na marketplace (MINOR increment) použijte jiný proces
    - Skript vyžaduje, aby všechny nástroje byly dostupné v PATH
    - Po úspěšné instalaci automaticky restartuje VS Code

.PREREQUISITES
    - pnpm (package manager)
    - git (verzovací systém)
    - code (VS Code CLI)
    - vsce (Visual Studio Code Extension manager)
    - Node.js a TypeScript (pro kompilaci)

.OUTPUTS
    - Nová verze v package.json
    - Zkompilovaný JavaScript kód v out/ složce
    - VSIX balíček (např. ai-prompt-detector-1.1.411.vsix)
    - Git commit a push na GitHub
    - Nainstalované rozšíření ve VS Code
    - Zápis do commit-descriptions.log
#>
param(
    [Parameter(Mandatory = $false, Position = 0)]
    [string]$CommitDescription
)

# =============================
# AI Copilot Prompt Detector
# install.ps1 – build → version patch → commit → push → package → install (code-insiders)
# Forward slash path policy: use '/'
# =============================

# --- Helper: Fail fast ----------------------------------------------
function Fail($msg) {
    Write-Host "❌ $msg" -ForegroundColor Red
    exit 1
}

# --- Validate commit description (policy: always required, no prompt) ---
if ([string]::IsNullOrWhiteSpace($CommitDescription)) {
    Fail "Commit description is required. Usage: ./install.ps1 'your description'"
}

Write-Host "AI Copilot Prompt Detector - Build, Release & Install Script" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host "Commit description (not stored in commit message body beyond second -m to preserve policy semantics): $CommitDescription" -ForegroundColor Cyan

# --- Tool presence checks (non-fatal warning if missing vsce; we will fail when used) ---
$required = @('pnpm','git','code')
foreach ($t in $required) { if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { Fail "Required tool '$t' not found in PATH" } }
if (-not (Get-Command vsce -ErrorAction SilentlyContinue)) { Fail "Required tool 'vsce' not found in PATH" }

# --- Read & bump version (PATCH only) ---
$packageJson = Get-Content './package.json' | ConvertFrom-Json
$currentVersion = $packageJson.version
if (-not $currentVersion) { Fail "Version field missing in package.json" }

$parts = $currentVersion.Split('.')
if ($parts.Length -ne 3) { Fail "Version '$currentVersion' not in MAJOR.MINOR.PATCH format" }
$major = [int]$parts[0]; $minor = [int]$parts[1]; $patch = [int]$parts[2]
$patch++
$newVersion = "$major.$minor.$patch"
Write-Host "Incrementing version: $currentVersion → $newVersion" -ForegroundColor Yellow

# Update package.json (string replace to avoid reformat drift)
$raw = Get-Content './package.json' -Raw
$raw = $raw -replace "`"version`"\s*:\s*`"$currentVersion`"", "`"version`": `"$newVersion`""
Set-Content './package.json' $raw -NoNewline
Write-Host "✅ package.json updated" -ForegroundColor Green

# --- Ensure dependencies (auto-install only if tsc missing) ---
$tscPath = Join-Path (Get-Location) 'node_modules/.bin/tsc'
if (-not (Test-Path $tscPath)) {
    Write-Host "Dependencies missing (tsc not found) – running pnpm install..." -ForegroundColor Yellow
    pnpm install
    if ($LASTEXITCODE -ne 0) { Fail "Dependency install failed" }
    Write-Host "   ✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "Dependencies present (tsc found) – skipping install" -ForegroundColor Green
}

# --- Remove old VSIX artifacts ---
Write-Host "1. Cleaning old VSIX files..." -ForegroundColor Yellow
Get-ChildItem -Path '.' -Filter '*.vsix' -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "   - Removing: $($_.Name)" -ForegroundColor Gray; Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }
Write-Host "   ✅ Cleanup done" -ForegroundColor Green

# --- Build (compile) ---
Write-Host "2. Building (pnpm run compile)..." -ForegroundColor Yellow
pnpm run compile
if ($LASTEXITCODE -ne 0) { Fail "Build failed" }
Write-Host "   ✅ Build successful" -ForegroundColor Green

# --- Git commit & push (after successful build only) ---
Write-Host "3. Git commit & push..." -ForegroundColor Yellow
git add .; if ($LASTEXITCODE -ne 0) { Fail "git add failed" }
# Persist description externally (audit trail) – additive
$descLog = 'commit-descriptions.log'
try { Add-Content -Path $descLog -Value "v$newVersion | $CommitDescription" -ErrorAction SilentlyContinue } catch {}

git commit -m "v$newVersion" -m "$CommitDescription"
if ($LASTEXITCODE -ne 0) { Fail "git commit failed" }

git push origin master
if ($LASTEXITCODE -ne 0) { Fail "git push failed" }
Write-Host "   ✅ Git push complete" -ForegroundColor Green

# --- Package (vsce) ---
Write-Host "4. Packaging VSIX..." -ForegroundColor Yellow
$env:VSCE_INTERACTIVE = '0'
$vsixName = "ai-prompt-detector-$newVersion.vsix"
$vsceOutput = vsce package --allow-star-activation --out $vsixName --no-git-tag-version --no-dependencies 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host $vsceOutput -ForegroundColor Red; Fail "VSIX packaging failed" }
Write-Host "   ✅ VSIX created: $vsixName" -ForegroundColor Green

# --- Uninstall previous & install new (silent) ---
Write-Host "5. Reinstalling extension in VS Code..." -ForegroundColor Yellow
Start-Process -FilePath 'code' -ArgumentList '--uninstall-extension','sunamocz.ai-prompt-detector' -WindowStyle Hidden -Wait 2>$null | Out-Null
Start-Sleep -Seconds 2
$result = Start-Process -FilePath 'code' -ArgumentList '--install-extension',$vsixName,'--force' -WindowStyle Hidden -Wait -PassThru
if ($result.ExitCode -ne 0) { Fail "Extension installation failed (VS Code)" }
Write-Host "   ✅ Extension installed (version $newVersion)" -ForegroundColor Green

Write-Host "===================================================" -ForegroundColor Green
Write-Host "Build, Release & Installation complete (v$newVersion)." -ForegroundColor Green

# --- Restart VS Code to load the new extension version ---
Write-Host "6. Restarting VS Code..." -ForegroundColor Yellow
try {
    # Zavři všechny instance VS Code
    Write-Host "   - Closing all VS Code instances..." -ForegroundColor Gray
    Get-Process -Name "Code" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    
    # Krátké čekání pro dokončení ukončení procesů
    Start-Sleep -Seconds 2
    
    # Spusť VS Code s projektem
    Write-Host "   - Starting VS Code..." -ForegroundColor Gray
    # Otevřít náš VS Code projekt
    Start-Process -FilePath 'code' -ArgumentList 'E:\vs\TypeScript_Projects\_\vscode' -WindowStyle Normal
    
    Write-Host "   ✅ VS Code restarted" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️ VS Code restart failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "===================================================" -ForegroundColor Green
Write-Host "Extension v$newVersion installed and VS Code restarted!" -ForegroundColor Green
