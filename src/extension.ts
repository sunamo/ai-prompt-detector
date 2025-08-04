import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let statusBarItem: vscode.StatusBarItem;
let promptCount = 0;
let recentPrompts: string[] = [];
let logFile: string;
let outputChannel: vscode.OutputChannel;

function initializeLogging(): void {
	// Use fixed path that works for all users including guest accounts
	const logFolder = path.join('C:', 'temp', 'specstory-autosave-logs');
	
	if (!fs.existsSync(logFolder)) {
		fs.mkdirSync(logFolder, { recursive: true });
	}
	
	logFile = path.join(logFolder, `extension-${new Date().toISOString().split('T')[0]}.log`);
	outputChannel = vscode.window.createOutputChannel('SpecStory AutoSave + AI Copilot Prompt Detection');
	
	writeLog('Extension initialized', 'INFO');
}

function writeLog(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO'): void {
	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const enableDebugLogs = config.get<boolean>('enableDebugLogs', false);
	
	// Skip debug logs if disabled
	if (level === 'DEBUG' && !enableDebugLogs) {
		return;
	}
	
	const timestamp = new Date().toISOString();
	const logEntry = `[${timestamp}] ${level}: ${message}`;
	
	// Write to VS Code output channel
	outputChannel.appendLine(logEntry);
	
	// Write to temp file
	try {
		fs.appendFileSync(logFile, logEntry + '\n');
	} catch (error) {
		console.error('Failed to write log:', error);
	}
}

class RecentPromptsProvider implements vscode.TreeDataProvider<string> {
	private _onDidChangeTreeData: vscode.EventEmitter<string | undefined | null | void> = new vscode.EventEmitter<string | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<string | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: string): vscode.TreeItem {
		const item = new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
		item.contextValue = 'promptItem';
		return item;
	}

	getChildren(): string[] {
		const config = vscode.workspace.getConfiguration('specstory-autosave');
		const maxPrompts = config.get<number>('maxPrompts', 10);
		return recentPrompts.slice(0, maxPrompts);
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('SpecStory AutoSave + AI Copilot Prompt Detection is now active');
	
	// Initialize logging
	initializeLogging();
	writeLog('Extension activated');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	updateStatusBar();
	statusBarItem.show();
	writeLog('Status bar created');

	// Register activity bar provider
	const provider = new RecentPromptsProvider();
	vscode.window.registerTreeDataProvider('specstory-autosave-view', provider);
	writeLog('Activity bar provider registered');

	// Watch for new SpecStory files across entire workspace
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	writeLog('File watcher created for pattern: **/.specstory/history/*.md');
	
	watcher.onDidCreate(uri => {
		promptCount++;
		writeLog(`New prompt detected: ${uri.fsPath}`, 'INFO');
		addRecentPrompt(uri.fsPath);
		updateStatusBar();
		provider.refresh();
		showNotification();
		writeLog(`Prompt count updated to: ${promptCount}`);
	});

	context.subscriptions.push(statusBarItem, watcher, outputChannel);
	writeLog('Extension activation complete');
}

function updateStatusBar(): void {
	const version = vscode.extensions.getExtension('sunamocz.specstory-autosave')?.packageJSON.version || '1.1.38';
	statusBarItem.text = `$(comment-discussion) ${promptCount} | v${version}`;
	statusBarItem.tooltip = 'SpecStory AutoSave + AI Copilot Prompt Detection';
}

function addRecentPrompt(filePath: string): void {
	const fileName = path.basename(filePath, '.md');
	const timeText = fileName.substring(0, 16).replace('_', ' '); // Extract date/time
	recentPrompts.unshift(`#1\n${timeText}`);
	writeLog(`Added prompt from file: ${fileName}`, 'DEBUG');
	
	// Re-number all prompts so newest is always #1
	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const maxPrompts = config.get<number>('maxPrompts', 10);
	
	recentPrompts = recentPrompts.slice(0, maxPrompts).map((prompt, index) => {
		const parts = prompt.split('\n');
		return `#${index + 1}\n${parts[1]}`;
	});
	
	writeLog(`Prompt list updated, showing ${recentPrompts.length} prompts (max: ${maxPrompts})`, 'DEBUG');
}

function showNotification(): void {
	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const customMessage = config.get<string>('customMessage', '');
	
	if (customMessage.trim()) {
		vscode.window.showInformationMessage(`AI prompt detected\n${customMessage}`);
		writeLog(`Showed custom notification: ${customMessage}`, 'INFO');
	} else {
		vscode.window.showInformationMessage(
			'AI prompt detected\nPlease set your custom message in settings',
			'Open Settings'
		).then(selection => {
			if (selection === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'specstory-autosave.customMessage');
				writeLog('User opened settings to configure custom message', 'INFO');
			}
		});
		writeLog('Showed default notification (no custom message set)', 'INFO');
	}
}

export function deactivate() {
	writeLog('Extension deactivated');
	// Cleanup handled by subscriptions
}
