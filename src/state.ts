import * as vscode from 'vscode';

/**
 * Rozhraní reprezentující sdílený stav rozšíření –
 * centralizace pro snadnější testování a ladění.
 */
export interface ExtensionState {
	recentPrompts: string[]; // Poslední zachycené prompty (nejnovější nahoře)
	statusBar: vscode.StatusBarItem | undefined; // Reference na status bar položku
	webviewView: vscode.WebviewView | undefined; // Reference na webview (aktivní panel)
	extensionUri: vscode.Uri | undefined; // URI root rozšíření
	outputChannel: vscode.OutputChannel | undefined; // Kanál pro logování
}

// Inicializace výchozího stavu
export const state: ExtensionState = {
	recentPrompts: [],
	statusBar: undefined,
	webviewView: undefined,
	extensionUri: undefined,
	outputChannel: undefined
};
