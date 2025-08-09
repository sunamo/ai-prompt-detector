import * as vscode from 'vscode';
import { state } from '../state';

export function updateStatusBar(): void {
	if (state.statusBar) {
		state.statusBar.text = `$(history) AI Prompts: ${state.recentPrompts.length}`;
		state.statusBar.tooltip = `AI Copilot Prompt Detector: ${state.recentPrompts.length} recent AI prompts detected`;
		state.statusBar.show();
	}
}
