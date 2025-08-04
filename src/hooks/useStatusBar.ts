import * as vscode from 'vscode';
import { state } from '../state';
import { updateStatusBar } from '../utils/statusBar';

export const useStatusBar = () => {
	const createStatusBar = (): vscode.StatusBarItem => {
		const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		statusBar.command = 'specstory-autosave.showRecentPrompts';
		state.statusBar = statusBar;
		updateStatusBar();
		return statusBar;
	};

	return { createStatusBar };
};
