# Find VS Code Insiders chat sessions
$workspaces = Get-ChildItem "$env:APPDATA\Code - Insiders\User\workspaceStorage" -Directory | Sort-Object LastWriteTime -Descending

foreach ($workspace in $workspaces) {
    $chatPath = Join-Path $workspace.FullName 'chatSessions'
    if (Test-Path $chatPath) {
        Write-Host "Workspace: $($workspace.Name)"
        Write-Host "  chatSessions folder exists!"
        $files = Get-ChildItem $chatPath -File
        Write-Host "  Files count: $($files.Count)"
        $files | Select-Object -First 5 | ForEach-Object {
            Write-Host "    - $($_.Name) ($(($_.Length/1KB).ToString('0.00')) KB, $($_.LastWriteTime))"
        }
        Write-Host ""
    }
}
