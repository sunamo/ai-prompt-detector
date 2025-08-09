import * as vscode from 'vscode';
import { runtime } from './runtime';
import { SOURCE_DIR_COPILOT, SOURCE_DIR_VSCODE, LOG_DIR } from './constants';

/**
 * Dokončí (finalizuje) detekovaný prompt: uloží jej do historie, zvýší čítač,
 * zobrazí notifikaci a aktualizuje UI. Obsah je získán z přímého parametru
 * nebo z runtime bufferů a snapshotů.
 * @param source Zdroj / typ heuristiky která prompt zachytila
 * @param directText Volitelný text promptu pokud již byl extrahován
 */
export async function finalizePrompt(source: string, directText?: string) {
	try {
		let txt = (directText || runtime.chatInputBuffer || runtime.lastNonEmptySnapshot).trim();
		if (!txt) return; // nic ke zpracování
		// Rychlá filtrace duplicit těsně po sobě
		if (txt === runtime.lastSubmittedText && Date.now() - runtime.lastFinalizeAt < 300) { runtime.outputChannel?.appendLine(`ℹ️ Skip duplicate finalize (${source})`); return; }
		runtime.lastSubmittedText = txt;
		runtime.recentPrompts.unshift(txt);
		if (runtime.recentPrompts.length > 1000) runtime.recentPrompts.splice(1000);
		runtime.chatInputBuffer = '';
		runtime.aiPromptCounter++;
		runtime.lastFinalizeAt = Date.now();
		const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
		const custom = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
		const short = txt.length > 160 ? txt.slice(0,160)+'…' : txt;
		vscode.window.showInformationMessage(`AI Prompt sent (${source})\n${short}\n${custom}`);
		runtime.providerRef?.refresh();
		runtime.outputChannel?.appendLine(`🛎️ finalize via ${source} chars=${txt.length}`);
		runtime.outputChannel?.appendLine(`REFS SRC ${SOURCE_DIR_COPILOT} | ${SOURCE_DIR_VSCODE} | LOG ${LOG_DIR}`);
	} catch (e) { runtime.outputChannel?.appendLine(`❌ finalizePrompt error: ${e}`); }
}
