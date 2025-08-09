import * as vscode from 'vscode';
import { state } from './state';

export class PromptsProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'ai-prompt-detector-view';
	private _view?: vscode.WebviewView;

	constructor() {}

	public resolveWebviewView(view: vscode.WebviewView) {
		this._view = view;
		this.update();
	}

	public refresh() {
		this.update();
	}

	private update() {
		if (!this._view) return;
		const recent = state.recentPrompts;
		const max = vscode.workspace.getConfiguration('ai-prompt-detector').get<number>('maxPrompts', 50);
		const list = recent.slice(0, max).map((p, i) => `<div style='border-left:4px solid #007acc;padding:4px;margin:4px 0;font-size:11px'><b>#${i + 1}</b> ${escapeHtml(p.length > 150 ? p.slice(0, 150) + '...' : p)}</div>`).join('') || `<div style='opacity:.6;padding:12px;font-size:11px'>No SpecStory prompts found</div>`;
		this._view.webview.html = `<!DOCTYPE html><html><body style='background:#1e1e1e;color:#d4d4d4;font-family:Segoe UI;font-size:12px;margin:0;padding:8px'>
<div style='background:#0e639c;color:#fff;padding:6px;border-radius:3px;font-size:10px'>Total: ${recent.length} (max ${max})</div>${list}</body></html>`;
	}
}

function escapeHtml(s: string) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
