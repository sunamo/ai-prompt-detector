# AI Copilot Prompt Detector - Mouse Click Detection Documentation

## Current Status (v1.1.383)
**❌ Mouse click detection is NOT working**
**✅ Keyboard (Enter) detection is working**

## The Problem
VS Code extensions run in Extension Host (Node.js context) while Copilot Chat UI runs in Renderer Process (Electron browser). Mouse clicks happen entirely in the renderer and don't generate any events accessible to the Extension Host.

## All Attempted Solutions (21 approaches tested)

### ❌ Failed Approaches

1. **Chat API (vscode.chat.onDidSubmitRequest)**
   - Requires `--enable-proposed-api` flag
   - Not available in production VS Code

2. **Command interception for mouse clicks**
   - Mouse clicks don't trigger commands
   - Only keyboard shortcuts trigger commands

3. **Webview panel monitoring**
   - Copilot doesn't use `createWebviewPanel`
   - Uses internal webview system

4. **DOM monitoring via window object**
   - `window is not defined` in Extension Host
   - Extensions can't access DOM

5. **DevTools Protocol**
   - Ports 9229, 9230, 9222, 9221, 5858 not open
   - VS Code doesn't run with debug ports

6. **Extension Host process monitoring**
   - Blocked by security sandbox
   - Can't access process from extension

7. **Workspace document changes**
   - Only detects file changes
   - Chat input isn't a workspace document

8. **Console injection**
   - Can't inject code into renderer
   - Processes are isolated

9. **Widget service access (IChatWidget)**
   - Internal VS Code services not exposed
   - `_getChatWidgets` command doesn't exist

10. **Extension module hooks**
    - Chat modules don't load through `require()`
    - Modules are isolated

11. **Network monitoring**
    - Local chat doesn't generate network traffic
    - API calls happen after processing

12. **VS Code state monitoring**
    - Only window focus changes visible
    - No chat-specific events

13. **Filesystem monitoring**
    - No files created on submission
    - History saved later

14. **Deep API reflection**
    - Found 65+ APIs
    - None provide submit events

15. **Memory/heap monitoring**
    - Requires native modules
    - Blocked by VS Code security

16. **System-level input monitoring**
    - Requires OS-level permissions
    - Outside VS Code extension scope

17. **IPC message monitoring**
    - Extension sandbox prevents IPC access
    - Processes are isolated

18. **Polling with getChatInputText**
    - Always returns empty string
    - Chat input not a standard text editor

19. **Active editor text capture**
    - Chat input not in activeTextEditor
    - Not in visibleTextEditors

20. **Copy commands (copyInput)**
    - Commands don't exist or return undefined
    - Not implemented for Copilot chat

21. **Clipboard monitoring**
    - Against extension policies
    - Interferes with user workflow

## Root Cause Analysis

From VS Code source code analysis:
- `ChatSubmitAction` in `chatExecuteActions.ts:154` handles submissions
- Calls `widget?.acceptInput()` which fires `onDidAcceptInput` event
- This happens entirely in Renderer Process
- No command or API event crosses to Extension Host for mouse clicks
- Enter key works because it triggers commands that DO cross process boundary

## The Only Real Solution

Run VS Code with `--enable-proposed-api sunamocz.ai-prompt-detector` flag to access:
- `vscode.chat.onDidSubmitRequest` - Direct chat submission events
- `vscode.chat.registerChatSessionItemProvider` - Session monitoring
- `vscode.chat.registerChatSessionContentProvider` - Content access

## Current Workaround Status

**None working** - All 21 approaches have failed due to architectural limitations.

## Recommendations

1. **For Users**: Use keyboard shortcuts (Enter, Ctrl+Enter) instead of mouse clicks
2. **For Development**: Request Microsoft to expose chat submission events in stable API
3. **Alternative**: Create a separate browser extension that can access DOM

## Technical Details

### Process Architecture
```
┌─────────────────┐     ┌──────────────────┐
│ Extension Host  │     │ Renderer Process │
│   (Node.js)     │     │    (Electron)    │
│                 │     │                  │
│ Our Extension   │ ❌  │  Copilot Chat UI │
│                 │     │                  │
│ Can intercept:  │     │ Mouse clicks     │
│ - Commands      │     │ happen here      │
│ - API calls     │     │                  │
└─────────────────┘     └──────────────────┘
        ↑                        ↓
        └── No events for ───────┘
            mouse clicks
```

### Why Enter Works
1. User presses Enter
2. VS Code keybinding system intercepts
3. Triggers command `workbench.action.chat.submit`
4. Command crosses to Extension Host
5. We can intercept the command

### Why Mouse Doesn't Work
1. User clicks button
2. Click handled in Renderer Process
3. Directly calls `widget.acceptInput()`
4. No command generated
5. Nothing for Extension Host to intercept

## Version History
- v1.1.382: Attempted clipboard monitoring (removed - policy violation)
- v1.1.383: Documented all 21 failed approaches