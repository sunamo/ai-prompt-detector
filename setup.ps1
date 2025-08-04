#!/usr/bin/env pwsh

Write-Host "Installing dependencies for SpecStory AutoSave VS Code Extension..." -ForegroundColor Green

# Check if pnpm is installed
if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "pnpm is not installed. Installing pnpm globally..." -ForegroundColor Yellow
    npm install -g pnpm
}

# Install dependencies
Write-Host "Installing project dependencies..." -ForegroundColor Yellow
pnpm install

# Compile the project
Write-Host "Compiling TypeScript..." -ForegroundColor Yellow
pnpm run compile

Write-Host "Setup complete! You can now:" -ForegroundColor Green
Write-Host "  - Press F5 to run the extension in a new Extension Development Host window" -ForegroundColor Cyan
Write-Host "  - Use 'pnpm run watch' to start development mode" -ForegroundColor Cyan
Write-Host "  - Use 'pnpm run test' to run tests" -ForegroundColor Cyan
