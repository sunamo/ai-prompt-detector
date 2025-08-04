import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const HISTORY_DIR = 'C:/Proj_Net/portal-ui/.specstory/history/';

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
		return Promise.resolve(getLatestPrompts());
	}
}

function getLatestPrompts(): PromptItem[] {
	if (!fs.existsSync(HISTORY_DIR)) return [];
	const files = fs.readdirSync(HISTORY_DIR)
		.filter(f => f.endsWith('.md'))
		.sort()
		.reverse(); // newest first by filename

	const prompts: PromptItem[] = [];
	for (const file of files) {
		const filePath = path.join(HISTORY_DIR, file);
		const content = fs.readFileSync(filePath, 'utf8');
		const matches = Array.from(content.matchAll(/^_\*\*User\*\*_[\r\n]+([\s\S]*?)(?:---|$)/gm));
		for (const match of matches) {
			const prompt = match[1].trim();
			if (prompt) {
				prompts.push(new PromptItem(prompt, filePath));
			}
		}
	}
	// newest prompts at the top
	return prompts.reverse();
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
