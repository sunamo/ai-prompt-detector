import * as vscode from 'vscode';
import * as path from 'path';
import { state } from '../state';
import { writeLog } from '../utils/logging';
import { isValidSpecStoryFile } from '../utils/fileValidation';
import { addRecentPrompt } from '../utils/promptProcessing';
import { extractTimestampFromFileName } from '../utils/timeUtils';
import { getHtmlForWebview } from '../utils/htmlGenerator';
import { updateStatusBar } from '../utils/statusBar';

export const useWebview = () => {
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

				// CRITICAL: Force immediate data loading and wait for completion
				writeLog('Forcing immediate data loading for webview', 'INFO');
				
				// Always force reload from files to ensure fresh data
				vscode.workspace.findFiles('**/.specstory/history/*.md').then(files => {
					writeLog(`Webview resolve: Found ${files.length} SpecStory files to process`, 'INFO');
					
					// Clear and reload
					state.recentPrompts = [];
					
					// Sort files by timestamp (newest first)
					const sortedFiles = files.sort((a, b) => {
						const nameA = path.basename(a.fsPath);
						const nameB = path.basename(b.fsPath);
						const timestampA = extractTimestampFromFileName(nameA);
						const timestampB = extractTimestampFromFileName(nameB);
						return timestampB.getTime() - timestampA.getTime();
					});
					
					// Process all files to extract prompts
					sortedFiles.forEach(file => {
						if (isValidSpecStoryFile(file.fsPath)) {
							addRecentPrompt(file.fsPath);
						}
					});
					
					writeLog(`After loading: ${state.recentPrompts.length} total prompts`, 'INFO');
					
					// Now refresh the webview with loaded data
					writeLog('Data loaded, refreshing webview display', 'INFO');
					refreshWebview();
				});

				webviewView.webview.onDidReceiveMessage(data => {
					switch (data.type) {
						case 'refresh':
							writeLog('Manual refresh requested from activity bar', 'INFO');
							
							// Clear existing prompts and reload from all files
							state.recentPrompts = [];
							
							vscode.workspace.findFiles('**/.specstory/history/*.md').then(files => {
								writeLog(`Activity bar refresh: Found ${files.length} SpecStory files to process`, 'INFO');
								
								// Sort files by timestamp (newest first)
								const sortedFiles = files.sort((a, b) => {
									const nameA = path.basename(a.fsPath);
									const nameB = path.basename(b.fsPath);
									// Extract timestamp from filename for proper chronological sorting
									const timestampA = extractTimestampFromFileName(nameA);
									const timestampB = extractTimestampFromFileName(nameB);
									return timestampB.getTime() - timestampA.getTime(); // Newest first
								});
								
								// Process all files to extract prompts
								sortedFiles.forEach(file => {
									if (isValidSpecStoryFile(file.fsPath)) {
										addRecentPrompt(file.fsPath);
									}
								});
								
								updateStatusBar();
								refreshWebview();
								writeLog(`Refresh complete: ${state.recentPrompts.length} total prompts from ${sortedFiles.length} files`, 'INFO');
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
