import * as vscode from 'vscode';
import { state } from '../state';

/**
 * Aktualizuje text a tooltip status bar položky podle počtu promptů.
 */
export function updateStatusBar(): void {
	if (state.statusBar) {
		state.statusBar.text = `$(history) AI Prompts: ${state.recentPrompts.length}`;
		state.statusBar.tooltip = `AI Prompt Detector: ${state.recentPrompts.length} recent AI prompts detected`;
		state.statusBar.show();
	}
}
