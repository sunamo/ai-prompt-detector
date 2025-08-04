import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
	private statusBarItem: vscode.StatusBarItem;

	constructor() {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right, 
			100
		);
		this.statusBarItem.command = 'specstory-autosave.configure';
	}

	public showEnabled(): void {
		this.statusBarItem.text = "$(check) AutoSave";
		this.statusBarItem.tooltip = "AutoSave is enabled. Click to configure.";
		this.statusBarItem.backgroundColor = undefined;
		this.statusBarItem.show();
	}

	public showDisabled(): void {
		this.statusBarItem.text = "$(x) AutoSave";
		this.statusBarItem.tooltip = "AutoSave is disabled. Click to configure.";
		this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		this.statusBarItem.show();
	}

	public hide(): void {
		this.statusBarItem.hide();
	}

	public dispose(): void {
		this.statusBarItem.dispose();
	}
}
