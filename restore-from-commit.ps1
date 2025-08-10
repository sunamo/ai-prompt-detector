param(
    [Parameter(Mandatory=$true, Position=0)][string]$CommitHash,
    [Parameter(Mandatory=$false, Position=1)][string]$ExtraDescription = ''
)

function Fail($msg){ Write-Host "❌ $msg" -ForegroundColor Red; exit 1 }

Write-Host "AI Copilot Prompt Detector - Restore from commit $CommitHash" -ForegroundColor Green

# 1) Validate commit exists
$exists = git cat-file -e "$CommitHash^{commit}" 2>$null; if($LASTEXITCODE -ne 0){ Fail "Commit $CommitHash not found" }

# 2) Capture current version (must not decrement per policy)
if(-not (Test-Path './package.json')){ Fail 'package.json missing' }
$currentPackage = Get-Content './package.json' -Raw | ConvertFrom-Json
$currentVersion = $currentPackage.version
if(-not $currentVersion){ Fail 'Current version missing in package.json' }
Write-Host "Current version (will be preserved): $currentVersion" -ForegroundColor Cyan

# 3) List files in target commit
$commitFiles = git ls-tree -r --name-only $CommitHash | Sort-Object
$commitSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$commitFiles | ForEach-Object { [void]$commitSet.Add($_) }
Write-Host "Files in target commit: $($commitFiles.Count)" -ForegroundColor Cyan

# 4) Restore tracked files to that commit state (worktree + index)
git restore --source $CommitHash --worktree --staged . 2>$null
if($LASTEXITCODE -ne 0){ Fail 'git restore failed' }

# 5) Remove files that are present now but not in commit (excluding .git & this script & install.ps1 & commit-descriptions.log retention optional)
$allNow = Get-ChildItem -Recurse -File | ForEach-Object { $_.FullName.Substring((Get-Location).Path.Length+1).Replace('\','/') }
$removed = 0
foreach($f in $allNow){
    if($f -eq 'restore-from-commit.ps1'){ continue }
    if($f -eq 'install.ps1'){ continue } # keep install script even if not in commit per workflow policy
    if($f -eq 'commit-descriptions.log'){ continue } # optional audit retention
    if(-not $commitSet.Contains($f)){
        try { Remove-Item $f -Force; $removed++ } catch { Write-Host "Warn: could not remove $f" -ForegroundColor Yellow }
    }
}
Write-Host "Removed files not present in commit: $removed" -ForegroundColor Yellow

# 6) Re-apply preserved version if reverted file had older version
$restoredPackage = Get-Content './package.json' -Raw | ConvertFrom-Json
if($restoredPackage.version -ne $currentVersion){
    Write-Host "Restored package.json version $($restoredPackage.version) -> preserving $currentVersion" -ForegroundColor Yellow
    $rawPkg = Get-Content './package.json' -Raw
    $rawPkg = $rawPkg -replace '"version"\s*:\s*"'+[regex]::Escape($restoredPackage.version)+'"','"version": "'+$currentVersion+'"'
    Set-Content './package.json' $rawPkg -NoNewline
}

# 7) Run install.ps1 to bump patch & commit
$desc = "restore-from-$CommitHash $ExtraDescription".Trim()
Write-Host "Running install.ps1 with description: $desc" -ForegroundColor Green
./install.ps1 $desc
