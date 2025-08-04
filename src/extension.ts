import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let statusBarItem: vscode.StatusBarItem;
let promptCount = 0;
let recentPrompts: string[] = [];

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
		return recentPrompts.slice(0, 10); // Show max 10 recent prompts
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('SpecStory AutoSave + AI Copilot Prompt Detection is now active');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	updateStatusBar();
	statusBarItem.show();

	// Register activity bar provider
	const provider = new RecentPromptsProvider();
	vscode.window.registerTreeDataProvider('specstory-autosave-view', provider);

	// Watch for new SpecStory files across entire workspace
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	
	watcher.onDidCreate(uri => {
		promptCount++;
		addRecentPrompt(uri.fsPath);
		updateStatusBar();
		provider.refresh();
		showNotification();
	});

	context.subscriptions.push(statusBarItem, watcher);
}

function updateStatusBar(): void {
	const version = vscode.extensions.getExtension('sunamocz.specstory-autosave')?.packageJSON.version || '1.1.38';
	statusBarItem.text = `$(comment-discussion) ${promptCount} | v${version}`;
	statusBarItem.tooltip = 'SpecStory AutoSave + AI Copilot Prompt Detection';
}

function addRecentPrompt(filePath: string): void {
	const fileName = path.basename(filePath, '.md');
	const displayText = `#${promptCount}`;
	const timeText = fileName.substring(0, 16).replace('_', ' '); // Extract date/time
	recentPrompts.unshift(`${displayText}\n${timeText}`);
	if (recentPrompts.length > 10) {
		recentPrompts = recentPrompts.slice(0, 10);
	}
}

function showNotification(): void {
	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const customMessage = config.get<string>('customMessage', '');
	
	if (customMessage.trim()) {
		vscode.window.showInformationMessage(`AI prompt detected\n${customMessage}`);
	} else {
		vscode.window.showInformationMessage(
			'AI prompt detected\nPlease set your custom message in settings',
			'Open Settings'
		).then(selection => {
			if (selection === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'specstory-autosave.customMessage');
			}
		});
	}
}

export function deactivate() {
	// Cleanup handled by subscriptions
}
