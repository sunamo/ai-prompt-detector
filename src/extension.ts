import * as vscode from 'vscode';
import * as fs from 'fs';

let statusBarItem: vscode.StatusBarItem;
let promptCount = 0;

export function activate(context: vscode.ExtensionContext) {
	console.log('SpecStory AutoSave + AI Copilot Prompt Detection is now active');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	updateStatusBar();
	statusBarItem.show();

	// Watch for new SpecStory files across entire workspace
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	
	watcher.onDidCreate(uri => {
		promptCount++;
		updateStatusBar();
		showNotification();
	});

	context.subscriptions.push(statusBarItem, watcher);
}

function updateStatusBar(): void {
	const version = vscode.extensions.getExtension('sunamocz.specstory-autosave')?.packageJSON.version || '1.1.38';
	statusBarItem.text = `$(comment-discussion) ${promptCount} | v${version}`;
	statusBarItem.tooltip = 'SpecStory AutoSave + AI Copilot Prompt Detection';
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
