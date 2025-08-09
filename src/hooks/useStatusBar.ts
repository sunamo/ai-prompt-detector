import * as vscode from 'vscode';
import { state } from '../state';
import { updateStatusBar } from '../utils/statusBar';

// Hook pro práci se status bar položkou rozšíření
export const useStatusBar = () => {
	/**
	 * Vytvoří a vrátí status bar item, nastaví příkaz a inicializační text.
	 */
	const createStatusBar = (): vscode.StatusBarItem => {
		const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		statusBar.command = 'ai-prompt-detector.showRecentPrompts';
		state.statusBar = statusBar;
		updateStatusBar();
		return statusBar;
	};
	return { createStatusBar };
};
