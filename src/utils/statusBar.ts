import * as vscode from 'vscode';
import { state } from '../state';

export function updateStatusBar(): void {
	if (state.statusBar) {
		state.statusBar.text = `$(history) AI Prompts: ${state.recentPrompts.length}`;
		state.statusBar.tooltip = `SpecStory AutoSave: ${state.recentPrompts.length} recent AI prompts detected`;
		state.statusBar.show();
	}
}
