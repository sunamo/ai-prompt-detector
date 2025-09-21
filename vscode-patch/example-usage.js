"use strict";
/**
 * Example usage of the new onDidSubmitInput event API
 * This shows how the AI Prompt Detector extension would use the API
 * once the patch is applied to VS Code
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
function activate(context) {
    console.log('AI Prompt Detector activating with new API...');
    // Check if the new API is available
    const vscodeExtended = vscode;
    if (!vscodeExtended.chat?.onDidSubmitInput) {
        vscode.window.showWarningMessage('Chat submission API not available. Please ensure VS Code is running with the patch applied and --enable-proposed-api flag.');
        return;
    }
    // Counter for tracking submissions
    let promptCounter = 0;
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = `🤖 AI Prompts: ${promptCounter}`;
    statusBarItem.show();
    // Subscribe to the new event
    const disposable = vscodeExtended.chat.onDidSubmitInput((event) => {
        console.log('Chat submission detected!', {
            prompt: event.prompt,
            location: event.location,
            sessionId: event.sessionId,
            inputMethod: event.isKeyboard ? 'keyboard' : 'mouse'
        });
        // Increment counter
        promptCounter++;
        statusBarItem.text = `🤖 AI Prompts: ${promptCounter}`;
        // Show notification
        const inputMethod = event.isKeyboard ? 'keyboard' : 'mouse';
        vscode.window.showInformationMessage(`AI Prompt sent via ${inputMethod}: "${event.prompt.substring(0, 50)}..."`);
        // Log to extension output
        const outputChannel = vscode.window.createOutputChannel('AI Prompt Detector');
        outputChannel.appendLine(`[${new Date().toISOString()}] Prompt submitted`);
        outputChannel.appendLine(`  Method: ${inputMethod}`);
        outputChannel.appendLine(`  Location: ${event.location}`);
        outputChannel.appendLine(`  Session: ${event.sessionId || 'N/A'}`);
        outputChannel.appendLine(`  Prompt: ${event.prompt}`);
        outputChannel.appendLine('---');
    });
    context.subscriptions.push(disposable);
    context.subscriptions.push(statusBarItem);
    console.log('✅ AI Prompt Detector activated with mouse detection support!');
}
function deactivate() {
    console.log('AI Prompt Detector deactivated');
}
/**
 * Benefits of this approach over current workarounds:
 *
 * 1. ✅ Detects ALL submissions (keyboard AND mouse)
 * 2. ✅ No polling or performance overhead
 * 3. ✅ Clean, official API (no hacks)
 * 4. ✅ Access to full prompt text
 * 5. ✅ Knows input method (keyboard vs mouse)
 * 6. ✅ Works across all chat locations
 * 7. ✅ No clipboard interference
 * 8. ✅ No command interception needed
 * 9. ✅ Future-proof solution
 * 10. ✅ Simple to implement
 */ 
//# sourceMappingURL=example-usage.js.map