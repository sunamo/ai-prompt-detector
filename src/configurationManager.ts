import * as vscode from 'vscode';

export class ConfigurationManager implements vscode.Disposable {
	private configurationWatcher: vscode.Disposable;

	constructor() {
		// Watch for configuration changes
		this.configurationWatcher = vscode.workspace.onDidChangeConfiguration(
			this.onConfigurationChanged,
			this
		);
	}

	public isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration('specstory-autosave');
		return config.get<boolean>('enabled', true);
	}

	public getInterval(): number {
		const config = vscode.workspace.getConfiguration('specstory-autosave');
		return config.get<number>('interval', 5000);
	}

	public getFilePatterns(): string[] {
		const config = vscode.workspace.getConfiguration('specstory-autosave');
		return config.get<string[]>('filePatterns', ['**/*.md', '**/*.txt', '**/*.json']);
	}

	private onConfigurationChanged(event: vscode.ConfigurationChangeEvent): void {
		if (event.affectsConfiguration('specstory-autosave')) {
			// Notify other components about configuration changes
			vscode.commands.executeCommand('specstory-autosave.configurationChanged');
		}
	}

	public dispose(): void {
		this.configurationWatcher.dispose();
	}
}
