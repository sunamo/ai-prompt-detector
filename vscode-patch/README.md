# VS Code Patch for Chat Input Submission Event

This patch exposes the `onDidAcceptInput` event from the chat widget to extensions through the proposed API system, enabling extensions to detect all chat submissions (both keyboard and mouse).

## Problem Statement

Currently, VS Code extensions cannot detect when users submit prompts to GitHub Copilot Chat using the mouse button. The `onDidAcceptInput` event exists internally but is not exposed to extensions.

### Technical Details

- **Mouse clicks** in the chat UI directly call `widget.acceptInput()` in the Renderer Process
- This bypasses the command system entirely, making it invisible to extensions
- The event `onDidAcceptInput` fires for ALL submissions (E:\vs\TypeScript_Projects\_\vscode\src\vs\workbench\contrib\chat\browser\chatWidget.ts:1769)
- Extensions run in the Extension Host and cannot access Renderer Process events without proper API exposure

## Solution

This patch adds `onDidSubmitInput` event to the chat proposed API, allowing extensions to detect all chat submissions regardless of input method.

## Files Modified

1. `src/vscode-dts/vscode.proposed.chatParticipantPrivate.d.ts` - Add event definition
2. `src/vs/workbench/api/browser/mainThreadChatAgents2.ts` - Implement event bridge
3. `src/vs/workbench/api/common/extHost.protocol.ts` - Add protocol definition
4. `src/vs/workbench/api/common/extHostChatAgents2.ts` - Expose event to extensions

## Usage

After applying this patch, extensions can use:

```typescript
vscode.chat.onDidSubmitInput((event) => {
  console.log('Chat input submitted:', event.prompt);
});
```

## Installation

1. Apply the patch to VS Code source
2. Build VS Code
3. Launch with `--enable-proposed-api your.extension.id`