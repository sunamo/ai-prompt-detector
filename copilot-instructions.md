# AI Copilot Prompt Detector - Development Instructions

## Code - OSS Configuration
**IMPORTANT**: This project uses Code - OSS for development and testing, NOT regular VS Code or VS Code Insiders.

### Code - OSS Location
- **Executable Path**: `E:\vs\TypeScript_Projects\_\vscode\.build\electron\Code - OSS.exe`
- **Working Directory**: `E:\vs\TypeScript_Projects\_\vscode`

### Install Script Configuration
The `install.ps1` script is configured to:
1. Close Code - OSS before installation (`Get-Process -Name "Code - OSS"`)
2. Install the extension using regular `code` command (for compatibility)
3. Restart Code - OSS after installation using the full path

### Important Notes
- Never use regular VS Code (`Code.exe`) or VS Code Insiders (`Code - Insiders.exe`)
- Always use Code - OSS for testing this extension
- The extension is tested in Code - OSS, not in regular VS Code
- install.ps1 handles the Code - OSS lifecycle automatically