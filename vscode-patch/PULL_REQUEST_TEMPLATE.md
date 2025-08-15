# Add onDidSubmitInput event to chat proposed API

## Summary

This PR adds a new `onDidSubmitInput` event to the chat proposed API, enabling extensions to detect all chat input submissions, including those triggered by mouse clicks on the submit button.

## Problem

Currently, VS Code extensions can only detect chat submissions made via keyboard shortcuts (Enter, Ctrl+Enter, etc.) through command interception. Mouse clicks on the submit button are completely invisible to extensions because:

1. Mouse clicks directly call `widget.acceptInput()` in the Renderer Process
2. This bypasses the command system entirely
3. Extensions run in the Extension Host (Node.js) and cannot access Renderer Process events

This limitation prevents extensions from:
- Tracking all chat interactions for analytics
- Implementing comprehensive prompt monitoring
- Creating security or compliance tools
- Building productivity features that need to know about all submissions

## Solution

This PR exposes the existing internal `onDidAcceptInput` event from the chat widget to extensions through the proposed API system. The event fires for ALL submissions regardless of input method.

## Implementation Details

### Files Modified

1. **src/vscode-dts/vscode.proposed.chatParticipantPrivate.d.ts**
   - Added `ChatSubmitEvent` interface with prompt, location, sessionId, and isKeyboard properties
   - Added `onDidSubmitInput` event to the chat namespace

2. **src/vs/workbench/api/common/extHost.protocol.ts**
   - Added `IChatSubmitEventDto` interface for data transfer
   - Added `$onDidSubmitInput` method to `ExtHostChatAgentsShape2`

3. **src/vs/workbench/api/browser/mainThreadChatAgents2.ts**
   - Implemented widget listener attachment for all chat widgets
   - Captures input text before it's cleared
   - Determines if submission was via keyboard or mouse
   - Forwards events to extension host

4. **src/vs/workbench/api/common/extHostChatAgents2.ts**
   - Added event emitter for `onDidSubmitInput`
   - Implemented `$onDidSubmitInput` to receive events from main thread
   - Converts internal DTO to public API format

5. **src/vs/workbench/api/common/extHostApiImpl.ts**
   - Exposed `onDidSubmitInput` event in the chat API namespace
   - Protected with `chatParticipantPrivate` proposed API check

## API Usage

```typescript
// Extension code
vscode.chat.onDidSubmitInput((event) => {
  console.log(`Chat submitted: "${event.prompt}"`);
  console.log(`Location: ${event.location}`);
  console.log(`Session: ${event.sessionId}`);
  console.log(`Input method: ${event.isKeyboard ? 'keyboard' : 'mouse'}`);
});
```

## Testing

1. Build VS Code with this patch
2. Launch with `--enable-proposed-api your.extension.id`
3. Install an extension that uses the new API
4. Verify events fire for both keyboard and mouse submissions

## Compatibility

- **Backward compatible**: Only affects extensions that explicitly use the new API
- **Proposed API**: Requires `chatParticipantPrivate` permission
- **No performance impact**: Uses existing event infrastructure

## Use Cases

This API enables:
- **Prompt monitoring extensions**: Track all user interactions with AI assistants
- **Security tools**: Monitor for sensitive data in prompts
- **Analytics**: Understand how users interact with chat (keyboard vs mouse)
- **Productivity tools**: Implement features based on chat usage patterns
- **Compliance**: Audit AI assistant usage in regulated environments

## Related Issues

- Similar requests have been made for detecting all chat submissions
- Extensions currently resort to fragile workarounds like clipboard monitoring
- This provides a clean, official API for a common extension need

## Checklist

- [x] Code follows VS Code coding guidelines
- [x] TypeScript definitions added
- [x] Protected with proposed API check
- [x] No breaking changes to existing APIs
- [ ] Manual testing completed
- [ ] Unit tests added (if required)

## Notes for Reviewers

- The `isKeyboard` property helps extensions understand user interaction patterns
- The event fires before the input is cleared, ensuring the prompt text is available
- The implementation reuses existing widget events, minimizing new code
- This follows the pattern of other proposed chat APIs