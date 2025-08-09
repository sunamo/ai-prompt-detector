import * as vscode from 'vscode';
import { writeLog } from './logger';
import { state } from './state';

export class PromptsProvider implements vscode.WebviewViewProvider {
	// Statický identifikátor webview panelu (aktivita v postranním panelu)
	public static readonly viewType = 'ai-prompt-detector-view';
	private _view?: vscode.WebviewView; // Uchování reference na webview pro pozdější aktualizace

	/**
	 * Konstruktor poskytovatele – inicializační log a příprava instance.
	 */
	constructor() {
		writeLog('🎯 PROMPTS: Provider created', true);
	}

	/**
	 * Metoda VS Code API volaná při vytvoření / zobrazení webview panelu.
	 * Nastaví možnosti webview a naplní jej HTML obsahem s prompty.
	 * @param webviewView Instance webview hostu
	 * @param context Kontext řešení webview (nevyužito)
	 * @param _token Token pro zrušení (nevyužito)
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		writeLog('🎯 PROMPTS: resolveWebviewView called', true);
		this._view = webviewView;
		webviewView.webview.options = { enableScripts: false, localResourceRoots: [] };
		this.updateWebview();
		writeLog('🎯 PROMPTS: Real prompts set', true);
		writeLog('🎯 PROMPTS: Showing real prompts from SpecStory files', false);
		writeLog(`🎯 PROMPTS: Number of prompts to display: ${state.recentPrompts.length}`, false);
	}

	/**
	 * Veřejná metoda pro obnovu obsahu webview z aktuálních promptů.
	 */
	public refresh(): void {
		if (this._view) this.updateWebview();
	}

	/**
	 * Interní aktualizace webview – generuje HTML a nastaví jej do webview instance.
	 */
	private updateWebview(): void {
		if (!this._view) { writeLog('🎯 PROMPTS: Webview not ready yet', true); return; }
		const html = this.createPromptsHtml();
		this._view.webview.html = html;
		writeLog(`🎯 PROMPTS: HTML set, displaying ${state.recentPrompts.length} prompts`, true);
	}

	/**
	 * Vytvoří HTML reprezentaci seznamu promptů pro zobrazení v postranním panelu.
	 * @returns Hotové HTML jako string.
	 */
	private createPromptsHtml(): string {
		let promptsHtml = '';
		const recentPrompts = state.recentPrompts;
		const config = vscode.workspace.getConfiguration('ai-prompt-detector');
		const maxPrompts = config.get<number>('maxPrompts', 50);
		if (recentPrompts.length > 0) {
			const displayPrompts = recentPrompts.slice(0, maxPrompts);
			promptsHtml = displayPrompts.map((prompt, index) => {
				const shortPrompt = prompt.length > 150 ? prompt.substring(0, 150) + '...' : prompt;
				const safePrompt = shortPrompt
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;');
				return `
<div class="prompt-item">
	<div class="prompt-number">#${index + 1}</div>
	<div class="prompt-text">${safePrompt}</div>
</div>`;
			}).join('');
		} else {
			promptsHtml = `
<div class="no-prompts">
	<p>🔍 No SpecStory prompts found</p>
	<p>Create a SpecStory conversation to display prompts</p>
</div>`;
		}
		const extensionVersion = vscode.extensions.getExtension('sunamocz.ai-prompt-detector')?.packageJSON.version || '1.1.79';
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>SpecStory Prompts</title>
	<style>
		body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #1e1e1e; color: #cccccc; margin: 0; padding: 8px; font-size: 12px; line-height: 1.4; }
		.prompt-item { background-color: #252526; border: 1px solid #3c3c3c; border-left: 4px solid #007acc; margin: 6px 0; padding: 8px; border-radius: 3px; transition: background-color 0.2s; }
		.prompt-item:hover { background-color: #2d2d30; }
		.prompt-number { font-weight: bold; color: #569cd6; margin-bottom: 4px; font-size: 11px; }
		.prompt-text { color: #d4d4d4; font-size: 11px; line-height: 1.3; word-wrap: break-word; }
		.no-prompts { text-align: center; padding: 20px; color: #888; }
		.header-bar { margin-bottom: 15px; padding: 8px; background-color: #0e639c; border-radius: 3px; text-align: center; color: white; font-size: 10px; }
	</style>
</head>
<body>

<div class="header-bar">
	📊 Total: ${recentPrompts.length} prompts (max ${maxPrompts}) | ⚙️ Change max count in settings
</div>

${promptsHtml}

</body>
</html>`;
	}
}
