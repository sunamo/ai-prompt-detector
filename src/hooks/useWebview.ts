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

export const useWebview = () => {
	const { loadExistingPrompts } = usePrompts();
	
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

				webviewView.webview.options = {
					enableScripts: true,
					localResourceRoots: state.extensionUri ? [state.extensionUri] : []
				};
				writeLog('Webview options set', 'INFO');

				// Use existing prompts data instead of reloading
				writeLog('Using existing prompts data for webview initialization', 'INFO');
				writeLog(`Existing prompts count: ${state.recentPrompts.length}`, 'INFO');
				
				// Immediately refresh webview with existing data
				refreshWebview();

				webviewView.webview.onDidReceiveMessage(data => {
					switch (data.type) {
						case 'refresh':
							writeLog('Manual refresh requested from activity bar', 'INFO');
							
							// Use centralized loading function
							loadExistingPrompts().then(() => {
								updateStatusBar();
								refreshWebview();
								writeLog(`Manual refresh complete: ${state.recentPrompts.length} total prompts loaded`, 'INFO');
							});
							break;
					}
				});
				
				writeLog('=== RESOLVE WEBVIEW VIEW END ===', 'INFO');
			}
		};
	};

	const refreshWebview = (): void => {
		writeLog('=== PUBLIC REFRESH START ===', 'INFO');
		writeLog('PUBLIC refresh() method called', 'INFO');
		writeLog(`Current state.recentPrompts length: ${state.recentPrompts.length}`, 'INFO');
		writeLog(`webviewView exists: ${!!state.webviewView}`, 'INFO');
		
		// Only refresh if webview is ready
		if (!state.webviewView) {
			writeLog('Webview not ready yet, skipping refresh', 'INFO');
			writeLog('=== PUBLIC REFRESH END (SKIPPED) ===', 'INFO');
			return;
		}
		
		refreshFromPrompts();
		writeLog('PUBLIC refresh() method completed', 'INFO');
		writeLog('=== PUBLIC REFRESH END ===', 'INFO');
	};

	const refreshFromPrompts = (): void => {
		writeLog(`=== REFRESH FROM PROMPTS START ===`, 'INFO');
		writeLog(`state.recentPrompts.length: ${state.recentPrompts.length}`, 'INFO');
		writeLog(`webviewView exists: ${!!state.webviewView}`, 'INFO');
		
		// Apply maxPrompts limit and convert to display format
		const config = vscode.workspace.getConfiguration('specstory-autosave');
		const maxPrompts = config.get<number>('maxPrompts', 50);
		
		writeLog(`refreshFromPrompts called with ${state.recentPrompts.length} total prompts`, 'DEBUG');
		
		// Take only the most recent prompts
		const limitedPrompts = state.recentPrompts.slice(0, maxPrompts);
		
		writeLog(`Limited to ${limitedPrompts.length} prompts (max: ${maxPrompts})`, 'DEBUG');
		
		// Convert to display format with proper numbering
		const prompts = limitedPrompts.map((prompt: string, index: number) => {
			const shortPrompt = prompt.length > 120 ? prompt.substring(0, 120) + '...' : prompt;
			writeLog(`Creating prompt #${index + 1}: "${shortPrompt.substring(0, 50)}..."`, 'DEBUG');
			return {
				number: `#${index + 1}`,
				shortPrompt: shortPrompt,
				fullContent: prompt
			};
		});
		
		writeLog(`Activity bar will show ${prompts.length} prompts`, 'INFO');
		writeLog(`First 3 prompts: ${prompts.slice(0, 3).map((p: {number: string; shortPrompt: string; fullContent: string}) => p.number + ': ' + p.shortPrompt.substring(0, 30)).join(' | ')}`, 'INFO');
		
		writeLog(`About to call updateView()`, 'INFO');
		updateView(prompts);
		writeLog(`=== REFRESH FROM PROMPTS END ===`, 'INFO');
	};

	const updateView = (prompts: Array<{number: string; shortPrompt: string; fullContent: string}>): void => {
		writeLog(`=== UPDATE VIEW START ===`, 'INFO');
		writeLog(`updateView called, webviewView exists: ${!!state.webviewView}`, 'INFO');
		writeLog(`prompts.length: ${prompts.length}`, 'INFO');
		
		if (state.webviewView) {
			writeLog(`Updating webview HTML with ${prompts.length} prompts`, 'INFO');
			
			const htmlContent = getHtmlForWebview(prompts);
			writeLog(`Generated HTML length: ${htmlContent.length} characters`, 'INFO');
			writeLog(`HTML preview: ${htmlContent.substring(0, 200)}...`, 'DEBUG');
			
			state.webviewView.webview.html = htmlContent;
			writeLog('Activity Bar view HTML updated successfully', 'INFO');
		} else {
			writeLog('Cannot update view - webviewView is null, webview not yet resolved', 'INFO');
		}
		writeLog(`=== UPDATE VIEW END ===`, 'INFO');
	};

	return { createWebviewProvider, refreshWebview };
};
