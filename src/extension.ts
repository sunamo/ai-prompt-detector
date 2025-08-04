import * as vscode from 'vscode';
import { state } from './state';
import { useWebview } from './hooks/useWebview';
import { useStatusBar } from './hooks/useStatusBar';
import { usePrompts } from './hooks/usePrompts';
import { useLogging } from './hooks/useLogging';
import { writeLog } from './utils/logging';
import { updateStatusBar } from './utils/statusBar';

// For activation function reference
let webviewRefresh: () => void;

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

export async function activate(context: vscode.ExtensionContext) {
	console.log('=== SPECSTORY EXTENSION ACTIVATION START ===');
	
	// Store extension URI in state
	state.extensionUri = context.extensionUri;
	
	// Initialize hooks
	const { initializeLogging } = useLogging();
	const { createStatusBar } = useStatusBar();
	const { loadExistingPrompts } = usePrompts();
	const { createWebviewProvider, refreshWebview } = useWebview();
	
	// Store refresh function for global access
	webviewRefresh = refreshWebview;
	
	// Initialize logging FIRST - clear previous session
	initializeLogging();
	writeLog('=== EXTENSION ACTIVATION START ===', 'INFO');
	writeLog('VS Code session started', 'INFO');

	// Create status bar item
	const statusBar = createStatusBar();
	writeLog('Status bar created', 'INFO');

	// Register activity bar provider
	const provider = createWebviewProvider();
	const viewType = 'specstory-autosave-view';
	writeLog(`About to register webview provider with viewType: ${viewType}`, 'INFO');
	const registration = vscode.window.registerWebviewViewProvider(viewType, provider);
	writeLog('Activity bar provider registered successfully', 'INFO');

	// Register refresh command
	const refreshCommand = vscode.commands.registerCommand('specstory-autosave.refresh', async () => {
		writeLog('Manual refresh command executed', 'INFO');
		await loadExistingPrompts();
		// Only refresh webview if it exists
		if (state.webviewView) {
			refreshWebview();
		} else {
			writeLog('Webview not ready for manual refresh', 'DEBUG');
		}
		writeLog(`Refresh complete: ${state.recentPrompts.length} total prompts loaded`, 'INFO');
	});

	// Watch for new SpecStory files across entire workspace
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	writeLog('File watcher created for pattern: **/.specstory/history/*.md');
	
	// Load existing prompts at startup
	await loadExistingPrompts();
	writeLog(`Loaded ${state.recentPrompts.length} total prompts at startup`, 'INFO');
	
	watcher.onDidCreate(uri => {
		writeLog(`File created event: ${uri.fsPath}`);
		// Trigger reload of all prompts when new file is created
		loadExistingPrompts().then(() => {
			updateStatusBar();
			// Only refresh webview if it exists
			if (state.webviewView) {
				refreshWebview();
			} else {
				writeLog('Webview not ready for refresh after file creation', 'DEBUG');
			}
			showNotification();
			writeLog(`Updated: ${state.recentPrompts.length} total prompts`);
		});
	});

	context.subscriptions.push(statusBar, watcher, state.outputChannel!, refreshCommand, registration);
	writeLog('Extension activation complete - all components registered');
}

export function deactivate() {
	writeLog('Extension deactivated');
	// Cleanup handled by subscriptions
}
