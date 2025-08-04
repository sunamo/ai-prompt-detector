import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// State management hooks
interface ExtensionState {
	statusBarItem: vscode.StatusBarItem | null;
	sessionPromptCount: number;
	recentPrompts: string[];
	logFile: string;
	outputChannel: vscode.OutputChannel | null;
	webviewView: vscode.WebviewView | null;
	extensionUri: vscode.Uri | null;
}

// Global state
let state: ExtensionState = {
	statusBarItem: null,
	sessionPromptCount: 0,
	recentPrompts: [],
	logFile: '',
	outputChannel: null,
	webviewView: null,
	extensionUri: null
};

// State management hooks
const useState = <T>(initialValue: T): [() => T, (value: T) => void] => {
	let currentValue = initialValue;
	return [
		() => currentValue,
		(newValue: T) => { currentValue = newValue; }
	];
};

const useStatusBar = () => {
	const updateStatusBar = () => {
		if (!state.statusBarItem) return;
		const version = vscode.extensions.getExtension('sunamocz.specstory-autosave')?.packageJSON.version || '1.1.28';
		state.statusBarItem.text = `$(comment-discussion) ${state.sessionPromptCount} prompts | v${version}`;
		state.statusBarItem.tooltip = `SpecStory AutoSave + AI Copilot Prompt Detection - ${state.sessionPromptCount} prompts in current session`;
	};

	const initStatusBar = () => {
		state.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		updateStatusBar();
		state.statusBarItem.show();
		writeLog('Status bar created', 'INFO');
	};

	return { initStatusBar, updateStatusBar };
};

const usePrompts = () => {
	const addPrompts = (prompts: string[]) => {
		prompts.forEach(prompt => {
			state.recentPrompts.push(prompt);
		});
	};

	const clearPrompts = () => {
		state.recentPrompts = [];
	};

	const getPrompts = () => [...state.recentPrompts];

	const incrementSessionCount = () => {
		state.sessionPromptCount++;
	};

	return { addPrompts, clearPrompts, getPrompts, incrementSessionCount };
};

const useLogging = () => {
	const initializeLogging = (): void => {
		// Use fixed path that works for all users including guest accounts
		const logFolder = path.join('C:', 'temp', 'specstory-autosave-logs');
		
		console.log(`Creating log folder: ${logFolder}`);
		if (!fs.existsSync(logFolder)) {
			fs.mkdirSync(logFolder, { recursive: true });
			console.log(`Log folder created: ${logFolder}`);
		}
		
		// Get current date in Czech timezone (UTC+2 summer time)
		const now = new Date();
		// Get Czech date correctly - create date from formatted string
		const czechTimeString = now.toLocaleDateString("en-CA", {timeZone: "Europe/Prague"}); // YYYY-MM-DD format
		const dateStr = czechTimeString; // Already in YYYY-MM-DD format
		state.logFile = path.join(logFolder, `extension-${dateStr}.log`);
		
		console.log(`Current UTC time: ${now.toISOString()}`);
		console.log(`Czech date string: ${czechTimeString}`);
		console.log(`Date string: ${dateStr}`);
		console.log(`Log file path: ${state.logFile}`);
		
		// CRITICAL: Clear log file at start of each session
		try {
			fs.writeFileSync(state.logFile, ''); // Clear the file completely
			console.log(`Log file cleared successfully: ${state.logFile}`);
		} catch (error) {
			console.error('Failed to clear log file:', error);
			console.error('Error details:', error);
		}
		
		state.outputChannel = vscode.window.createOutputChannel('SpecStory AutoSave + AI Copilot Prompt Detection');
		console.log('Output channel created');
		
		// Force first log entry to ensure logging works - use Czech time
		const czechTime = new Date(new Date().getTime() + (2 * 60 * 60 * 1000)); // Add 2 hours
		const czechTimestamp = czechTime.toISOString();
		const firstEntry = `[${czechTimestamp}] INFO: === NEW SESSION STARTED ===\n`;
		try {
			fs.appendFileSync(state.logFile, firstEntry);
			console.log('First log entry written successfully');
			
			// Verify log was actually written by reading it back
			setTimeout(() => {
				try {
					if (fs.existsSync(state.logFile)) {
						const logContent = fs.readFileSync(state.logFile, 'utf8');
						const logLines = logContent.split('\n').filter(line => line.trim());
						
						if (logLines.length > 0) {
							const lastLine = logLines[logLines.length - 1];
							const logTimestampMatch = lastLine.match(/\[([^\]]+)\]/);
							
							if (logTimestampMatch) {
								const logTime = new Date(logTimestampMatch[1]);
								const now = new Date();
								const ageMinutes = (now.getTime() - logTime.getTime()) / (1000 * 60);
								
								if (ageMinutes <= 5) {
									console.log(`✅ Log verification passed - log is ${ageMinutes.toFixed(1)} minutes old`);
								} else {
									console.error(`❌ LOG ERROR: Log is too old (${ageMinutes.toFixed(1)} minutes)! Logging may not be working properly.`);
									vscode.window.showErrorMessage(`SpecStory Extension: Logging system error - logs are ${ageMinutes.toFixed(1)} minutes old!`);
								}
							} else {
								console.error('❌ LOG ERROR: Cannot parse log timestamp');
								vscode.window.showErrorMessage('SpecStory Extension: Log timestamp parsing error');
							}
						} else {
							console.error('❌ LOG ERROR: Log file is empty after writing');
							vscode.window.showErrorMessage('SpecStory Extension: Log file is empty - logging failed');
						}
					} else {
						console.error('❌ LOG ERROR: Log file does not exist after writing');
						vscode.window.showErrorMessage('SpecStory Extension: Log file missing - logging failed');
					}
				} catch (verifyError) {
					console.error('❌ LOG ERROR: Failed to verify log file:', verifyError);
					vscode.window.showErrorMessage(`SpecStory Extension: Log verification failed - ${verifyError}`);
				}
			}, 1000); // Wait 1 second for file system to flush
			
		} catch (error) {
			console.error('Failed to write first log entry:', error);
		}
		
		writeLog('Extension initialized - log file cleared', 'INFO');
	};

	return { initializeLogging };
};

function writeLog(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO'): void {
	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const enableDebugLogs = config.get<boolean>('enableDebugLogs', false);
	
	// Skip only DEBUG logs if disabled, always write INFO and ERROR
	if (level === 'DEBUG' && !enableDebugLogs) {
		return;
	}
	
	// Create Czech time properly - add 2 hours to UTC (summer time)
	const now = new Date();
	const czechTime = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // Add 2 hours in milliseconds
	const czechTimestamp = czechTime.toISOString();
	const czechLogEntry = `[${czechTimestamp}] ${level}: ${message}`;
	
	// Always write to console for debugging (with Czech time)
	console.log(`LOG: ${czechLogEntry}`);
	
	// Write to VS Code output channel (with Czech time)
	if (state.outputChannel) {
		state.outputChannel.appendLine(czechLogEntry);
	} else {
		console.log('Output channel not available');
	}
	
	// Write to temp file (with Czech time)
	try {
		if (state.logFile) {
			fs.appendFileSync(state.logFile, czechLogEntry + '\n');
		} else {
			console.error('Log file path not set!');
		}
	} catch (error) {
		console.error('Failed to write log:', error);
		console.error('Log file path:', state.logFile);
		console.error('Log entry:', czechLogEntry);
	}
}

function isValidSpecStoryFile(filePath: string): boolean {
	try {
		const fileName = path.basename(filePath);
		writeLog(`Validating file: ${fileName}`, 'DEBUG');
		
		// Check if filename matches SpecStory pattern: YYYY-MM-DD_HH-mmZ-*.md
		const specStoryPattern = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}Z-.+\.md$/;
		if (!specStoryPattern.test(fileName)) {
			writeLog(`File ${fileName} doesn't match SpecStory pattern`, 'DEBUG');
			return false;
		}
		
		writeLog(`File ${fileName} matches SpecStory pattern`, 'DEBUG');
		
		// Check if file exists and is readable
		if (!fs.existsSync(filePath)) {
			writeLog(`File ${fileName} doesn't exist`, 'DEBUG');
			return false;
		}
		
		// Check if file contains SpecStory header
		const content = fs.readFileSync(filePath, 'utf8');
		const hasSpecStoryMarker = content.includes('<!-- Generated by SpecStory -->') || 
		                          content.includes('_**User**_') || 
		                          content.includes('_**Assistant**_');
		
		writeLog(`File ${fileName} has SpecStory markers: ${hasSpecStoryMarker}`, 'DEBUG');
		return hasSpecStoryMarker;
	} catch (error) {
		writeLog(`Error validating SpecStory file ${filePath}: ${error}`, 'ERROR');
		return false;
	}
}

// Webview hooks
const useWebview = () => {
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
		writeLog(`First 3 prompts: ${prompts.slice(0, 3).map(p => p.number + ': ' + p.shortPrompt.substring(0, 30)).join(' | ')}`, 'INFO');
		
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

// HTML generation function
const getHtmlForWebview = (prompts: Array<{number: string; shortPrompt: string; fullContent: string}>): string => {
	writeLog(`=== GET HTML START ===`, 'INFO');
	writeLog(`getHtmlForWebview called with ${prompts.length} prompts`, 'INFO');
	
	const notificationsList = prompts.length > 0 
		? prompts.map((prompt, index) => {
			writeLog(`Generating HTML for prompt ${index + 1}: ${prompt.number} - ${prompt.shortPrompt.substring(0, 30)}...`, 'DEBUG');
			return `<div class="notification">
				<div class="notification-header">
					<span class="notification-time">${prompt.number}</span>
				</div>
				<div class="notification-content">
					<div class="notification-title">${prompt.shortPrompt}</div>
				</div>
			</div>`;
		}).join('')
		: '<div class="no-notifications">No AI prompts detected yet...<br><button onclick="refresh()">🔄 Refresh</button></div>';

	writeLog(`Generated notifications HTML length: ${notificationsList.length} chars`, 'INFO');
	writeLog(`Will show: ${prompts.length > 0 ? `${prompts.length} prompts` : 'no notifications message'}`, 'INFO');
	writeLog(`Notifications HTML preview: ${notificationsList.substring(0, 200)}...`, 'DEBUG');

	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const maxPrompts = config.get<number>('maxPrompts', 50);

	const fullHtml = `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>AI Activity</title>
		<style>
			body {
				font-family: var(--vscode-font-family);
				font-size: var(--vscode-font-size);
				line-height: 1.4;
				color: var(--vscode-foreground);
				background-color: var(--vscode-editor-background);
				margin: 0;
				padding: 8px;
			}
			.header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 8px;
				padding-bottom: 8px;
				border-bottom: 1px solid var(--vscode-widget-border);
			}
			.header-title {
				font-size: 12px;
				font-weight: bold;
				color: var(--vscode-foreground);
			}
			.header-count {
				font-size: 10px;
				color: var(--vscode-descriptionForeground);
			}
			.notification {
				background-color: var(--vscode-list-hoverBackground);
				border: 1px solid var(--vscode-widget-border);
				border-left: 3px solid var(--vscode-charts-blue);
				margin: 4px 0;
				border-radius: 4px;
				overflow: hidden;
				transition: background-color 0.2s ease;
			}
			.notification:hover {
				background-color: var(--vscode-list-activeSelectionBackground);
			}
			.notification-header {
				padding: 4px 8px;
				background-color: var(--vscode-editor-selectionBackground);
				border-bottom: 1px solid var(--vscode-widget-border);
				text-align: center;
			}
			.notification-time {
				font-size: 10px;
				font-weight: bold;
				color: var(--vscode-charts-blue);
			}
			.notification-content {
				padding: 6px 8px;
			}
			.notification-title {
				font-size: 11px;
				font-weight: 500;
				color: var(--vscode-foreground);
				margin-bottom: 2px;
			}
			.no-notifications {
				color: var(--vscode-descriptionForeground);
				font-style: italic;
				text-align: center;
				padding: 20px;
				font-size: 11px;
			}
			.no-notifications button {
				margin-top: 8px;
				padding: 4px 8px;
				background: var(--vscode-button-background);
				color: var(--vscode-button-foreground);
				border: none;
				border-radius: 2px;
				cursor: pointer;
			}
			.settings-note {
				font-size: 9px;
				color: var(--vscode-descriptionForeground);
				text-align: center;
				margin-top: 8px;
				padding-top: 8px;
				border-top: 1px solid var(--vscode-widget-border);
			}
		</style>
		<script>
			const vscode = acquireVsCodeApi();
			function refresh() {
				vscode.postMessage({type: 'refresh'});
			}
		</script>
	</head>
	<body>
		<div class="header">
			<span class="header-title">Recent AI Prompts</span>
			<span class="header-count">Max: ${maxPrompts}</span>
		</div>
		${notificationsList}
		<div class="settings-note">
			Showing latest ${Math.min(prompts.length, maxPrompts)} prompts
		</div>
	</body>
	</html>`;
	
	writeLog(`Full HTML length: ${fullHtml.length} characters`, 'INFO');
	writeLog(`=== GET HTML END ===`, 'INFO');
	return fullHtml;
};

export async function activate(context: vscode.ExtensionContext) {
	console.log('=== SPECSTORY EXTENSION ACTIVATION START ===');
	
	// Store extension URI in state
	state.extensionUri = context.extensionUri;
	
	// Initialize hooks
	const { initializeLogging } = useLogging();
	const { initStatusBar, updateStatusBar } = useStatusBar();
	const { addPrompts, clearPrompts, getPrompts, incrementSessionCount } = usePrompts();
	const { createWebviewProvider, refreshWebview } = useWebview();
	
	// Initialize logging FIRST - clear previous session
	initializeLogging();
	writeLog('=== EXTENSION ACTIVATION START ===', 'INFO');
	writeLog('VS Code session started', 'INFO');

	// Create status bar item
	initStatusBar();
	writeLog('Status bar created', 'INFO');

	// Register activity bar provider
	const provider = createWebviewProvider();
	const viewType = 'specstory-autosave-view';
	writeLog(`About to register webview provider with viewType: ${viewType}`, 'INFO');
	const registration = vscode.window.registerWebviewViewProvider(viewType, provider);
	writeLog('Activity bar provider registered successfully', 'INFO');
	writeLog(`Provider viewType: ${viewType}`, 'INFO');
	writeLog(`Registration object exists: ${!!registration}`, 'INFO');

	// Register refresh command
	const refreshCommand = vscode.commands.registerCommand('specstory-autosave.refresh', async () => {
		writeLog('Manual refresh command executed', 'INFO');
		writeLog(`Searching in workspace folders:`, 'INFO');
		if (vscode.workspace.workspaceFolders) {
			vscode.workspace.workspaceFolders.forEach((folder, index) => {
				writeLog(`  Workspace ${index + 1}: ${folder.uri.fsPath}`, 'INFO');
			});
		}
		
		// Clear existing prompts and reload from all files
		clearPrompts();
		
		try {
			const files = await vscode.workspace.findFiles('**/.specstory/history/*.md');
			writeLog(`Refresh: Found ${files.length} SpecStory files to process`, 'INFO');
			
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
				writeLog(`Refresh: Processing file: ${file.fsPath}`, 'DEBUG');
				if (isValidSpecStoryFile(file.fsPath)) {
					addRecentPrompt(file.fsPath);
				}
			});
			
			updateStatusBar();
			refreshWebview();
			writeLog(`Refresh complete: ${state.recentPrompts.length} total prompts loaded`, 'INFO');
		} catch (error) {
			writeLog(`Error during refresh: ${error}`, 'ERROR');
		}
	});

	// Watch for new SpecStory files across entire workspace
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	writeLog('File watcher created for pattern: **/.specstory/history/*.md');
	writeLog(`Workspace folders: ${vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath).join(', ') || 'none'}`);
	
	// Check for existing SpecStory files at startup
	writeLog('Starting search for SpecStory files...', 'INFO');
	writeLog(`Current workspace folders:`, 'INFO');
	if (vscode.workspace.workspaceFolders) {
		vscode.workspace.workspaceFolders.forEach((folder, index) => {
			writeLog(`  Workspace ${index + 1}: ${folder.uri.fsPath}`, 'INFO');
		});
	} else {
		writeLog('  No workspace folders found!', 'INFO');
	}
	
	try {
		const files = await vscode.workspace.findFiles('**/.specstory/history/*.md');
		writeLog(`Found ${files.length} existing SpecStory files at startup`, 'INFO');
		
		if (files.length > 0) {
			writeLog(`Files found:`, 'INFO');
			files.forEach((file, index) => {
				writeLog(`  ${index + 1}. ${file.fsPath}`, 'INFO');
			});
		} else {
			writeLog('No SpecStory files found in current workspace', 'INFO');
			// Try alternative patterns to debug
			const altFiles = await vscode.workspace.findFiles('**/*specstory*/**/*.md');
			writeLog(`Alternative search (*specstory*) found ${altFiles.length} files`, 'INFO');
			if (altFiles.length > 0) {
				altFiles.forEach((file, index) => {
					writeLog(`  Alt ${index + 1}. ${file.fsPath}`, 'INFO');
				});
			}
			
			// Try searching for any .md files in .specstory folders
			const anyMdFiles = await vscode.workspace.findFiles('**/.specstory/**/*.md');
			writeLog(`Any .md files in .specstory folders: ${anyMdFiles.length}`, 'INFO');
			if (anyMdFiles.length > 0) {
				anyMdFiles.forEach((file, index) => {
					writeLog(`  MD ${index + 1}. ${file.fsPath}`, 'INFO');
				});
			}
		}
		
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
			writeLog(`Existing file: ${file.fsPath}`, 'INFO');
			if (isValidSpecStoryFile(file.fsPath)) {
				addRecentPrompt(file.fsPath);
				// Don't increment sessionPromptCount for existing files - only for new ones in this session
			}
		});
		
		updateStatusBar();
		writeLog(`Loaded ${state.recentPrompts.length} total prompts from ${sortedFiles.length} files`, 'INFO');
		writeLog(`Session prompts: ${state.sessionPromptCount}, Total prompts: ${state.recentPrompts.length}`, 'INFO');
		writeLog('Note: Activity bar will load prompts when user first opens it', 'INFO');
	} catch (error) {
		writeLog(`Error loading existing SpecStory files: ${error}`, 'ERROR');
	}
	
	watcher.onDidCreate(uri => {
		writeLog(`File created event: ${uri.fsPath}`);
		// Validate this is actually a SpecStory export file
		if (isValidSpecStoryFile(uri.fsPath)) {
			writeLog(`New SpecStory export detected: ${path.basename(uri.fsPath)}`, 'INFO');
			addRecentPrompt(uri.fsPath);
			incrementSessionCount(); // Increment session prompt count
			updateStatusBar();
			refreshWebview();
			showNotification();
			writeLog(`Session prompts: ${state.sessionPromptCount}, total prompts: ${state.recentPrompts.length}`);
		} else {
			writeLog(`Ignored non-SpecStory file: ${path.basename(uri.fsPath)}`, 'DEBUG');
		}
	});

	context.subscriptions.push(state.statusBarItem!, watcher, state.outputChannel!, refreshCommand, registration);
	writeLog('Extension activation complete - all components registered');
}

function updateStatusBar(): void {
	if (!state.statusBarItem) return;
	const version = vscode.extensions.getExtension('sunamocz.specstory-autosave')?.packageJSON.version || '1.1.28';
	state.statusBarItem.text = `$(comment-discussion) ${state.sessionPromptCount} prompts | v${version}`;
	state.statusBarItem.tooltip = `SpecStory AutoSave + AI Copilot Prompt Detection - ${state.sessionPromptCount} prompts in current session`;
}

function addRecentPrompt(filePath: string): void {
	try {
		writeLog(`=== ADD RECENT PROMPT START ===`, 'INFO');
		writeLog(`Processing SpecStory file: ${filePath}`, 'INFO');
		
		// Read and parse the SpecStory file content
		const content = fs.readFileSync(filePath, 'utf8');
		writeLog(`File content length: ${content.length} characters`, 'DEBUG');
		
		const extractedPrompts = extractPromptsFromContent(content);
		
		writeLog(`Extracted ${extractedPrompts.length} prompts from ${path.basename(filePath)}`, 'INFO');
		
		// Log each prompt being added
		extractedPrompts.forEach((prompt, index) => {
			writeLog(`Adding prompt ${index + 1}: "${prompt.substring(0, 100)}..."`, 'DEBUG');
		});
		
		// Add all prompts from this file to the end (maintain file order: newest file first)
		// Since files are processed newest first, and prompts within file are already newest first,
		// we append each file's prompts to maintain proper chronological order
		extractedPrompts.forEach(prompt => {
			state.recentPrompts.push(prompt);
		});
		
		writeLog(`Total prompts after adding file: ${state.recentPrompts.length}`, 'INFO');
		writeLog(`=== ADD RECENT PROMPT END ===`, 'INFO');
		
	} catch (error) {
		writeLog(`Error processing SpecStory file ${filePath}: ${error}`, 'ERROR');
	}
}

function extractTimestampFromFileName(fileName: string): Date {
	// Extract timestamp from SpecStory filename like "2025-08-03_07-59Z-description.md"
	const match = fileName.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})Z/);
	if (match) {
		const [, date, hour, minute] = match;
		const [year, month, day] = date.split('-').map(Number);
		return new Date(year, month - 1, day, Number(hour), Number(minute), 0);
	}
	
	// Fallback to epoch time if parsing fails (will be sorted last)
	return new Date(0);
}

function extractPromptsFromContent(content: string): string[] {
	const prompts: string[] = [];
	
	try {
		writeLog(`Starting extraction from content (${content.length} chars)`, 'DEBUG');
		
		// Split content by user/assistant markers
		const sections = content.split(/(?=_\*\*User\*\*_|_\*\*Assistant\*\*_)/);
		writeLog(`Split content into ${sections.length} sections`, 'DEBUG');
		
		for (let i = 0; i < sections.length; i++) {
			const section = sections[i];
			// Look for user sections
			if (section.includes('_**User**_')) {
				writeLog(`Processing user section ${i + 1}`, 'DEBUG');
				
				// Extract text after the user marker
				const lines = section.split('\n');
				const userPrompt: string[] = [];
				let foundUserMarker = false;
				
				for (const line of lines) {
					if (line.includes('_**User**_')) {
						foundUserMarker = true;
						writeLog(`Found User marker in line: "${line.trim()}"`, 'DEBUG');
						continue;
					}
					
					if (foundUserMarker) {
						// Stop at separator or assistant marker
						if (line.includes('---') || line.includes('_**Assistant**_')) {
							writeLog(`Stopping at separator/assistant marker: "${line.trim()}"`, 'DEBUG');
							break;
						}
						
						// Add non-empty lines to prompt
						const trimmedLine = line.trim();
						if (trimmedLine) {
							userPrompt.push(trimmedLine);
						}
					}
				}
				
				// Join the prompt lines and add if not empty
				if (userPrompt.length > 0) {
					const fullPrompt = userPrompt.join(' ').trim();
					if (fullPrompt.length > 0) {
						prompts.push(fullPrompt);
						writeLog(`Extracted prompt (${fullPrompt.length} chars): "${fullPrompt.substring(0, 100)}..."`, 'DEBUG');
					}
				}
			}
		}
		
		// CRITICAL: Reverse prompts so newest prompts in file come first
		// In SpecStory files, prompts are chronological (oldest first), but we want newest first
		const reversedPrompts = prompts.reverse();
		writeLog(`Successfully extracted and reversed ${reversedPrompts.length} user prompts`, 'DEBUG');
		
		return reversedPrompts;
		
	} catch (error) {
		writeLog(`Error extracting prompts from content: ${error}`, 'ERROR');
	}
	
	return prompts;
}

function showNotification(): void {
	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const customMessage = config.get<string>('customMessage', '');
	
	if (customMessage.trim()) {
		vscode.window.showInformationMessage(`AI prompt detected\n${customMessage}`);
		writeLog(`Showed custom notification`, 'INFO');
	} else {
		vscode.window.showInformationMessage('AI prompt detected\nSpecStory conversation exported');
		writeLog('Showed default notification', 'INFO');
	}
}

export function deactivate() {
	writeLog('Extension deactivated');
	// Cleanup handled by subscriptions
}
