import * as vscode from 'vscode';

export interface ExtensionState {
	recentPrompts: string[];
	statusBar: vscode.StatusBarItem | undefined;
	webviewView: vscode.WebviewView | undefined;
	extensionUri: vscode.Uri | undefined;
	outputChannel: vscode.OutputChannel | undefined;
}

export const state: ExtensionState = {
	recentPrompts: [],
	statusBar: undefined,
	webviewView: undefined,
	extensionUri: undefined,
	outputChannel: undefined
};
