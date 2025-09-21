<#
.SYNOPSIS
    Sofistikovaný nástroj pro návrat projektu na předchozí commit při zachování aktuální verze.
    Umožňuje bezpečný rollback změn bez narušení verzovacího schématu.

.DESCRIPTION
    Tento skript obnovuje stav projektu na zadaný Git commit, ale NIKDY nesnižuje číslo verze.
    Je navržen tak, aby umožnil návrat k funkční verzi kódu při zachování kontinuity verzování,
    což je kritické pro správnou funkci extension marketplace a uživatelských aktualizací.
    
    Proces obnovení probíhá v následujících krocích:
    1. Validace existence zadaného commitu v Git historii
    2. Uložení aktuální verze z package.json (tato verze bude zachována)
    3. Vytvoření seznamu všech souborů v cílovém commitu pomocí git ls-tree
    4. Obnovení všech souborů na stav z cílového commitu (git restore)
    5. Odstranění souborů, které existují nyní, ale nebyly v cílovém commitu
    6. Zachování kritických souborů (install.ps1, restore-from-commit.ps1, commit-descriptions.log)
    7. Re-aplikace původní verze do package.json (pokud byla změněna)
    8. Automatické spuštění install.ps1 pro vytvoření nového commitu s popisem restore
    
    Speciální vlastnosti:
    - Verze NIKDY neklesne, i když cílový commit má nižší verzi
    - Zachovává audit trail v commit-descriptions.log
    - Nemaže sám sebe ani install.ps1 (potřebné pro dokončení procesu)
    - Používá HashSet pro efektivní porovnání souborů
    - Automaticky vytváří nový commit s popisem "restore-from-[hash]"
    
    Bezpečnostní opatření:
    - Kontroluje existenci commitu před zahájením
    - Zachovává důležité workflow soubory
    - Nepřepisuje verzi na nižší číslo
    - Loguje všechny důležité kroky

.PARAMETER CommitHash
    [POVINNÝ] Git commit hash, na který chcete projekt obnovit.
    Může být plný 40-znakový hash nebo zkrácená verze (minimálně 7 znaků).
    Commit musí existovat v aktuální Git historii.

.PARAMETER ExtraDescription
    [NEPOVINNÝ] Dodatečný popis, který bude přidán k restore commit message.
    Výsledná message bude: "restore-from-[hash] [ExtraDescription]"

.EXAMPLE
    ./restore-from-commit.ps1 9fd8c29
    
    Obnoví projekt na commit 9fd8c29, zachová aktuální verzi a vytvoří nový commit.

.EXAMPLE
    ./restore-from-commit.ps1 16a18e4 "před problematickou změnou detekce myši"
    
    Obnoví na commit 16a18e4 s dodatečným popisem v commit message.

.EXAMPLE
    ./restore-from-commit.ps1 HEAD~5
    
    Obnoví projekt o 5 commitů zpět od aktuálního HEAD.

.NOTES
    - Skript NIKDY nesníží číslo verze
    - Automaticky spouští install.ps1 po dokončení restore
    - Zachovává historii v commit-descriptions.log
    - Ideální pro rollback problematických změn
    - Podporuje i relativní reference (HEAD~n, HEAD^, atd.)

.PREREQUISITES
    - Git repozitář s historií
    - Funkční install.ps1 skript
    - package.json s version polem
    - Git nainstalovaný a dostupný v PATH

.OUTPUTS
    - Obnovené soubory na stav z cílového commitu
    - Zachovaná aktuální verze v package.json
    - Nový Git commit s popisem restore
    - Aktualizovaný commit-descriptions.log
    - Spuštění install.ps1 pro finalizaci
#>
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
