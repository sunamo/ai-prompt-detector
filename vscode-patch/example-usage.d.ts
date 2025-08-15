/**
 * Example usage of the new onDidSubmitInput event API
 * This shows how the AI Prompt Detector extension would use the API
 * once the patch is applied to VS Code
 */
import * as vscode from 'vscode';
export declare function activate(context: vscode.ExtensionContext): void;
export declare function deactivate(): void;
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
//# sourceMappingURL=example-usage.d.ts.map