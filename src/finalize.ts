import * as vscode from 'vscode';
import { runtime } from './runtime';
import { SOURCE_DIR_COPILOT, SOURCE_DIR_VSCODE, LOG_DIR } from './constants';

export async function finalizePrompt(source: string, directText?: string) {
	try {
		let txt = (directText || runtime.chatInputBuffer || runtime.lastNonEmptySnapshot).trim();
		if (!txt) return;
		if (txt === runtime.lastSubmittedText) { runtime.outputChannel?.appendLine(`ℹ️ Skipped duplicate finalize (${source})`); return; }
		runtime.lastSubmittedText = txt;
		runtime.recentPrompts.unshift(txt);
		if (runtime.recentPrompts.length > 1000) runtime.recentPrompts.splice(1000);
		runtime.chatInputBuffer = '';
		runtime.aiPromptCounter++;
		runtime.lastFinalizeAt = Date.now();
		const cfg = vscode.workspace.getConfiguration('specstory-autosave');
		const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
		vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`);
		runtime.providerRef?.refresh();
		runtime.outputChannel?.appendLine(`🛎️ Detected submit via ${source} | chars=${txt.length}`);
		runtime.outputChannel?.appendLine(`REFS SRC ${SOURCE_DIR_COPILOT} | ${SOURCE_DIR_VSCODE} | LOG ${LOG_DIR}`);
	} catch (e) { runtime.outputChannel?.appendLine(`❌ finalizePrompt error: ${e}`); }
}
