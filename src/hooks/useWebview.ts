import * as vscode from 'vscode';
import * as path from 'path';
import { state } from '../state';
import { writeLog } from '../utils/logging';
import { isValidSpecStoryFile } from '../utils/fileValidation';
import { addRecentPrompt } from '../utils/promptProcessing';
import { extractTimestampFromFileName } from '../utils/timeUtils';
import { getHtmlForWebview } from '../utils/htmlGenerator';
import { updateStatusBar } from '../utils/statusBar';
import { usePrompts } from './usePrompts';

// Hook pro vytvoření a správu webview panelu v Activity baru
export const useWebview = () => {
	const { loadExistingPrompts } = usePrompts();
	/**
	 * Vytvoří provider který VS Code použije k inicializaci webview panelu.
	 */
	const createWebviewProvider = (): vscode.WebviewViewProvider => {
		return {
			resolveWebviewView: (
				webviewView: vscode.WebviewView,
				context: vscode.WebviewViewResolveContext,
				_token: vscode.CancellationToken,
			) => {
				writeLog('=== RESOLVE WEBVIEW VIEW START ===', 'INFO');
				writeLog('resolveWebviewView called - Activity bar is being initialized', 'INFO');
				writeLog(`Global state.recentPrompts.length at resolve time: ${state.recentPrompts.length}`, 'INFO');
				state.webviewView = webviewView;
				writeLog(`webviewView assigned, exists: ${!!state.webviewView}`, 'INFO');
				webviewView.webview.options = { enableScripts: true, localResourceRoots: state.extensionUri ? [state.extensionUri] : [] };
				writeLog('Webview options set', 'INFO');
				writeLog('Using existing prompts data for webview initialization', 'INFO');
				writeLog(`Existing prompts count: ${state.recentPrompts.length}`, 'INFO');
				// Okamžité zobrazení
				refreshWebview();
				// Poslech zpráv z webview (např. manuální refresh)
				webviewView.webview.onDidReceiveMessage(data => { switch (data.type) { case 'refresh': writeLog('Manual refresh requested from activity bar', 'INFO'); loadExistingPrompts().then(() => { updateStatusBar(); refreshWebview(); writeLog(`Manual refresh complete: ${state.recentPrompts.length} total prompts loaded`, 'INFO'); }); break; } });
				writeLog('=== RESOLVE WEBVIEW VIEW END ===', 'INFO');
			}
		};
	};

	/** Veřejná metoda pro osvěžení obsahu webview podle aktuálního stavu. */
	const refreshWebview = (): void => {
		writeLog('=== PUBLIC REFRESH START ===', 'INFO');
		writeLog('PUBLIC refresh() method called', 'INFO');
		writeLog(`Current state.recentPrompts length: ${state.recentPrompts.length}`, 'INFO');
		writeLog(`webviewView exists: ${!!state.webviewView}`, 'INFO');
		if (!state.webviewView) { writeLog('Webview not ready yet, skipping refresh', 'INFO'); writeLog('=== PUBLIC REFRESH END (SKIPPED) ===', 'INFO'); return; }
		refreshFromPrompts();
		writeLog('PUBLIC refresh() method completed', 'INFO');
		writeLog('=== PUBLIC REFRESH END ===', 'INFO');
	};

	/** Aktualizuje webview HTML podle pole recentPrompts (aplikuje limit). */
	const refreshFromPrompts = (): void => {
		writeLog(`=== REFRESH FROM PROMPTS START ===`, 'INFO');
		writeLog(`state.recentPrompts.length: ${state.recentPrompts.length}`, 'INFO');
		writeLog(`webviewView exists: ${!!state.webviewView}`, 'INFO');
		const config = vscode.workspace.getConfiguration('ai-prompt-detector');
		const maxPrompts = config.get<number>('maxPrompts', 50);
		writeLog(`refreshFromPrompts called with ${state.recentPrompts.length} total prompts`, 'DEBUG');
		const limitedPrompts = state.recentPrompts.slice(0, maxPrompts);
		writeLog(`Limited to ${limitedPrompts.length} prompts (max: ${maxPrompts})`, 'DEBUG');
		const prompts = limitedPrompts.map((prompt: string, index: number) => { const shortPrompt = prompt.length > 120 ? prompt.substring(0, 120) + '...' : prompt; writeLog(`Creating prompt #${index + 1}: "${shortPrompt.substring(0, 50)}..."`, 'DEBUG'); return { number: `#${index + 1}`, shortPrompt: shortPrompt, fullContent: prompt }; });
		writeLog(`Activity bar will show ${prompts.length} prompts`, 'INFO');
		writeLog(`First 3 prompts: ${prompts.slice(0, 3).map((p: {number: string; shortPrompt: string; fullContent: string}) => p.number + ': ' + p.shortPrompt.substring(0, 30)).join(' | ')}`, 'INFO');
		writeLog(`About to call updateView()`, 'INFO');
		updateView(prompts);
		writeLog(`=== REFRESH FROM PROMPTS END ===`, 'INFO');
	};

	/** Nastaví vygenerované HTML do webview. */
	const updateView = (prompts: Array<{number: string; shortPrompt: string; fullContent: string}>): void => {
		writeLog(`=== UPDATE VIEW START ===`, 'INFO');
		writeLog(`updateView called, webviewView exists: ${!!state.webviewView}`, 'INFO');
		writeLog(`prompts.length: ${prompts.length}`, 'INFO');
		if (state.webviewView) { writeLog(`Updating webview HTML with ${prompts.length} prompts`, 'INFO'); const htmlContent = getHtmlForWebview(prompts); writeLog(`Generated HTML length: ${htmlContent.length} characters`, 'INFO'); writeLog(`HTML preview: ${htmlContent.substring(0, 200)}...`, 'DEBUG'); state.webviewView.webview.html = htmlContent; writeLog('Activity Bar view HTML updated successfully', 'INFO'); } else { writeLog('Cannot update view - webviewView is null, webview not yet resolved', 'INFO'); }
		writeLog(`=== UPDATE VIEW END ===`, 'INFO');
	};

	return { createWebviewProvider, refreshWebview };
};
