/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';

/**
<<<<<<< HEAD
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
=======
 * Sdílený stav extensionu – drží recentPrompts s invariantem index 0 = nejnovější.
 */
export const state = {
  recentPrompts: [] as string[],
>>>>>>> refs/remotes/origin/master
};
