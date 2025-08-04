import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let statusBarItem: vscode.StatusBarItem;
let promptCount = 0;

class SpecStoryProvider implements vscode.TreeDataProvider<string> {
	private _onDidChangeTreeData: vscode.EventEmitter<string | undefined | null | void> = new vscode.EventEmitter<string | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<string | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: string): vscode.TreeItem {
		return new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.None);
	}

	getChildren(element?: string): string[] {
		if (!element) {
			return [`Detected prompts: ${promptCount}`, 'Monitoring workspace...'];
		}
		return [];
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('SpecStory AutoSave + AI Copilot Prompt Detection is now active');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	updateStatusBar();
	statusBarItem.show();

	// Register activity bar provider
	const provider = new SpecStoryProvider();
	vscode.window.registerTreeDataProvider('specstory-autosave-view', provider);

	// Watch for new SpecStory files across entire workspace
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	
	watcher.onDidCreate(uri => {
		promptCount++;
		updateStatusBar();
		provider.refresh();
		analyzeAndNotify(uri.fsPath);
	});

	context.subscriptions.push(statusBarItem, watcher);
}

function updateStatusBar(): void {
	const version = vscode.extensions.getExtension('sunamocz.specstory-autosave')?.packageJSON.version || '1.1.35';
	statusBarItem.text = `$(comment-discussion) ${promptCount} | v${version}`;
	statusBarItem.tooltip = 'SpecStory AutoSave + AI Copilot Prompt Detection';
}

async function analyzeAndNotify(filePath: string): Promise<void> {
	try {
		const content = fs.readFileSync(filePath, 'utf8');
		const message = generateSmartMessage(content);
		
		vscode.window.showInformationMessage(message, 'View File').then(selection => {
			if (selection === 'View File') {
				vscode.workspace.openTextDocument(filePath).then(doc => {
					vscode.window.showTextDocument(doc);
				});
			}
		});
	} catch (error) {
		console.error('Error analyzing SpecStory file:', error);
	}
}

function generateSmartMessage(content: string): string {
	const lower = content.toLowerCase();
	
	if (lower.includes('debug') || lower.includes('error') || lower.includes('fix')) {
		return 'AI just debugged! Check: • Fixed actual root cause? • Introduced new bugs? • Test edge cases';
	}
	if (lower.includes('html') || lower.includes('css') || lower.includes('ui') || lower.includes('design')) {
		return 'AI worked with UI! Check: • Responsive design • Accessibility • Cross-browser compatibility';
	}
	if (lower.includes('database') || lower.includes('sql') || lower.includes('query')) {
		return 'AI modified database! Check: • Data integrity • Performance impact • Backup strategy';
	}
	if (lower.includes('api') || lower.includes('endpoint') || lower.includes('rest')) {
		return 'AI created API! Check: • Error handling • Security • API documentation';
	}
	
	return 'AI conversation detected! Review the changes and test thoroughly.';
}

export function deactivate() {
	// Cleanup handled by subscriptions
}
