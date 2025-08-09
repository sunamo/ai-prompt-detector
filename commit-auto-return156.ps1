Param(
  [switch]$Force,
  [string]$Extra = ''
)
# Ensures we stage, set version already present, and commit with required message
if(!(Test-Path package.json)){ Write-Error 'package.json missing'; exit 1 }
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$ver = $pkg.version
if(-not $ver){ Write-Error 'version missing in package.json'; exit 1 }
$msg = "v$ver return to code of version 1.1.156"
if($Extra){ $msg = "$msg $Extra" }
Write-Host "Preparing commit: $msg" -ForegroundColor Cyan
$dirty = git status --porcelain
if(-not $dirty){ Write-Host 'No changes to commit'; exit 0 }
git add .
try { git commit -m "$msg" } catch { Write-Error 'Commit failed'; exit 1 }
if($Force){ git push origin master --force } else { git push origin master }
Write-Host 'Done.' -ForegroundColor Green
