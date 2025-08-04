import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class SpecStoryPromptProvider implements vscode.TreeDataProvider<PromptItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<PromptItem | undefined | void> = new vscode.EventEmitter<PromptItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<PromptItem | undefined | void> = this._onDidChangeTreeData.event;

	dispose(): void {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: PromptItem): vscode.TreeItem {
		return element;
	}

	getChildren(): Thenable<PromptItem[]> {
		return Promise.resolve(this.getLatestPrompts());
	}

	private getLatestPrompts(): PromptItem[] {
		const prompts: PromptItem[] = [];
		
		// Check all workspace folders for .specstory/history
		if (vscode.workspace.workspaceFolders) {
			for (const folder of vscode.workspace.workspaceFolders) {
				const historyDir = path.join(folder.uri.fsPath, '.specstory', 'history');
				if (fs.existsSync(historyDir)) {
					const files = fs.readdirSync(historyDir)
						.filter(f => f.endsWith('.md'))
						.sort()
						.reverse(); // newest first

					for (const file of files) {
						const filePath = path.join(historyDir, file);
						const content = fs.readFileSync(filePath, 'utf8');
						const matches = Array.from(content.matchAll(/^_\*\*User\*\*_[\r\n]+([\s\S]*?)(?:---|$)/gm));
						
						for (const match of matches) {
							const prompt = match[1].trim();
							if (prompt && prompt.length > 10) { // Only meaningful prompts
								prompts.push(new PromptItem(prompt.slice(0, 80) + '...', filePath));
							}
						}
					}
				}
			}
		}
		
		return prompts.slice(0, 20); // Show max 20 recent prompts
	}
}

class PromptItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly filePath: string
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.tooltip = filePath;
	}
}
