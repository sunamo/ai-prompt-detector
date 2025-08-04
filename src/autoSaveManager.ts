import * as vscode from 'vscode';
import { ConfigurationManager } from './configurationManager';
import { StatusBarManager } from './statusBarManager';

export class AutoSaveManager implements vscode.Disposable {
	private timer: NodeJS.Timeout | undefined;
	private isActive = false;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private configManager: ConfigurationManager,
		private statusBarManager: StatusBarManager
	) {
		// Watch for text document changes
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument(this.onDocumentChanged, this),
			vscode.commands.registerCommand('specstory-autosave.configurationChanged', this.onConfigurationChanged, this)
		);
	}

	public enable(): void {
		if (this.isActive) {
			return;
		}

		this.isActive = true;
		this.statusBarManager.showEnabled();
		this.startTimer();
		vscode.window.showInformationMessage('AutoSave is now enabled');
	}

	public disable(): void {
		if (!this.isActive) {
			return;
		}

		this.isActive = false;
		this.statusBarManager.showDisabled();
		this.stopTimer();
		vscode.window.showInformationMessage('AutoSave is now disabled');
	}

	private startTimer(): void {
		this.stopTimer();

		if (!this.isActive) {
			return;
		}

		const interval = this.configManager.getInterval();
		this.timer = setTimeout(() => {
			this.saveAllDocuments();
			this.startTimer(); // Restart timer
		}, interval);
	}

	private stopTimer(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	private async saveAllDocuments(): Promise<void> {
		if (!this.isActive) {
			return;
		}

		const filePatterns = this.configManager.getFilePatterns();
		const dirtyDocuments = vscode.workspace.textDocuments.filter(doc => 
			doc.isDirty && this.matchesPatterns(doc.uri.fsPath, filePatterns)
		);

		for (const document of dirtyDocuments) {
			try {
				await document.save();
			} catch (error) {
				console.error(`Failed to save ${document.uri.fsPath}:`, error);
			}
		}

		if (dirtyDocuments.length > 0) {
			vscode.window.setStatusBarMessage(
				`AutoSaved ${dirtyDocuments.length} file(s)`,
				2000
			);
		}
	}

	private matchesPatterns(filePath: string, patterns: string[]): boolean {
		return patterns.some(pattern => {
			const glob = new RegExp(
				pattern
					.replace(/\*\*/g, '.*')
					.replace(/\*/g, '[^/\\\\]*')
					.replace(/\?/g, '[^/\\\\]')
			);
			return glob.test(filePath);
		});
	}

	private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
		// Could implement smart saving logic here
		// For example, save after a certain number of changes
	}

	private onConfigurationChanged(): void {
		if (this.isActive) {
			// Restart timer with new interval
			this.startTimer();
		}
	}

	public dispose(): void {
		this.stopTimer();
		this.disposables.forEach(d => d.dispose());
	}
}
