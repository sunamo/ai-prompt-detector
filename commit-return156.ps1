Param(
    [string]$Extra = ''
)
Write-Host 'Custom commit script starting...' -ForegroundColor Cyan
if(!(Test-Path package.json)){ Write-Error 'package.json not found'; exit 1 }
try { $pkg = Get-Content package.json -Raw | ConvertFrom-Json } catch { Write-Error 'Failed to parse package.json'; exit 1 }
$version = $pkg.version
if(-not $version){ Write-Error 'Version not found in package.json'; exit 1 }
$baseMessage = "v$version return to code of version 1.1.156"
if($Extra){ $baseMessage = "$baseMessage $Extra" }
Write-Host "Commit message: $baseMessage" -ForegroundColor Yellow
$changes = git status --porcelain
if(-not $changes){ Write-Host 'No changes to commit. Exiting.' -ForegroundColor Green; exit 0 }
# Stage all
git add .
# Commit
try { git commit -m "$baseMessage" } catch { Write-Error 'Git commit failed'; exit 1 }
# Push
try { git push origin master } catch { Write-Error 'Git push failed'; exit 1 }
Write-Host 'Custom commit completed.' -ForegroundColor Green
