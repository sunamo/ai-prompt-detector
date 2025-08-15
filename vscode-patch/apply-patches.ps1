#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Applies the VS Code patches to enable onDidSubmitInput event for extensions
.DESCRIPTION
    This script applies all patch files to the VS Code source code to expose
    the chat input submission event to extensions.
.PARAMETER VsCodePath
    Path to the VS Code source code directory
.PARAMETER Reverse
    If specified, reverses the patches (removes the changes)
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$VsCodePath,
    
    [switch]$Reverse
)

# Colors for output
$Red = [ConsoleColor]::Red
$Green = [ConsoleColor]::Green
$Yellow = [ConsoleColor]::Yellow
$Blue = [ConsoleColor]::Blue

# Verify VS Code path exists
if (-not (Test-Path $VsCodePath)) {
    Write-Host "ERROR: VS Code path does not exist: $VsCodePath" -ForegroundColor $Red
    exit 1
}

# Verify it's a VS Code repository
if (-not (Test-Path "$VsCodePath\package.json")) {
    Write-Host "ERROR: Not a valid VS Code repository: $VsCodePath" -ForegroundColor $Red
    exit 1
}

# Get patch directory
$PatchDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# List of patch files in order
$Patches = @(
    "1-vscode.proposed.chatParticipantPrivate.d.ts.patch",
    "2-extHost.protocol.ts.patch", 
    "3-mainThreadChatAgents2.ts.patch",
    "4-extHostChatAgents2.ts.patch",
    "5-extHostApiImpl.ts.patch"
)

Write-Host "`n=== VS Code Chat Event Patch Application ===" -ForegroundColor $Blue
Write-Host "VS Code Path: $VsCodePath" -ForegroundColor $Yellow
Write-Host "Patch Directory: $PatchDir" -ForegroundColor $Yellow

if ($Reverse) {
    Write-Host "Mode: REVERSE (removing patches)" -ForegroundColor $Yellow
} else {
    Write-Host "Mode: APPLY (adding patches)" -ForegroundColor $Green
}

Write-Host "`n--- Applying Patches ---" -ForegroundColor $Blue

$Success = $true
foreach ($PatchFile in $Patches) {
    $PatchPath = Join-Path $PatchDir $PatchFile
    
    if (-not (Test-Path $PatchPath)) {
        Write-Host "  ❌ Missing patch file: $PatchFile" -ForegroundColor $Red
        $Success = $false
        continue
    }
    
    Write-Host "  Applying: $PatchFile" -ForegroundColor $Yellow
    
    # Change to VS Code directory for patch to work
    Push-Location $VsCodePath
    
    try {
        if ($Reverse) {
            # Reverse the patch
            $Output = git apply --reverse --check $PatchPath 2>&1
            if ($LASTEXITCODE -eq 0) {
                git apply --reverse $PatchPath
                Write-Host "    ✅ Reversed successfully" -ForegroundColor $Green
            } else {
                Write-Host "    ⚠️ Already reversed or conflicts: $Output" -ForegroundColor $Yellow
            }
        } else {
            # Apply the patch
            $Output = git apply --check $PatchPath 2>&1
            if ($LASTEXITCODE -eq 0) {
                git apply $PatchPath
                Write-Host "    ✅ Applied successfully" -ForegroundColor $Green
            } else {
                Write-Host "    ⚠️ Already applied or conflicts: $Output" -ForegroundColor $Yellow
            }
        }
    } catch {
        Write-Host "    ❌ Error: $_" -ForegroundColor $Red
        $Success = $false
    } finally {
        Pop-Location
    }
}

Write-Host "`n--- Summary ---" -ForegroundColor $Blue

if ($Success) {
    if ($Reverse) {
        Write-Host "✅ Patches reversed successfully!" -ForegroundColor $Green
        Write-Host "`nThe onDidSubmitInput event has been removed from VS Code." -ForegroundColor $Yellow
    } else {
        Write-Host "✅ Patches applied successfully!" -ForegroundColor $Green
        Write-Host "`nNext steps:" -ForegroundColor $Yellow
        Write-Host "1. Build VS Code: yarn && yarn compile" -ForegroundColor $White
        Write-Host "2. Run VS Code: .\\scripts\\code.bat --enable-proposed-api sunamocz.ai-prompt-detector" -ForegroundColor $White
        Write-Host "3. Test the extension with the new API" -ForegroundColor $White
    }
} else {
    Write-Host "❌ Some patches failed to apply" -ForegroundColor $Red
    Write-Host "Please check for conflicts or existing changes" -ForegroundColor $Yellow
}

Write-Host ""