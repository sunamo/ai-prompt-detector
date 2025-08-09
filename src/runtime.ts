import * as vscode from 'vscode';
import { state } from './state';
import type { PromptsProvider } from './activityBarProvider';

// Legacy removed: runtime.ts (global mutable state). Superseded by local closure state in extension.ts. Do NOT recreate without explicit request.

export function activate(context: vscode.ExtensionContext) {
	// Extension activation logic here
}

export function deactivate() {
	// Extension deactivation logic here
}
