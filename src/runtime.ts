import * as vscode from 'vscode';
import { state } from './state';
import type { PromptsProvider } from './activityBarProvider';

// Centralizovaný běhový (mutable) stav používaný více moduly –
// zjednodušené sdílení dat bez nutnosti předávat parametry napříč funkcemi.
export const runtime = {
	outputChannel: undefined as vscode.OutputChannel | undefined, // kanál pro logování
	recentPrompts: state.recentPrompts, // reference na globální pole promptů
	aiPromptCounter: 0, // čítač detekovaných promptů
	statusBarItem: undefined as vscode.StatusBarItem | undefined, // status bar položka
	chatInputBuffer: '', // průběžně stavěný text z 'type' / paste událostí
	lastEnterSubmitAt: 0, // čas posledního Enter submitu (ms timestamp)
	lastNonEmptySnapshot: '', // poslední nesmazaný snapshot textu inputu
	lastSubmittedText: '', // naposledy finalizovaný prompt (pro deduplikaci)
	lastFinalizeAt: 0, // čas posledního finalize (ms)
	chatDocState: new Map<string,string>(), // obsah chat dokumentů pro detekci clear
	lastEditorPollText: '', // poslední hodnota z editor pollingu
	lastBufferChangedAt: Date.now(), // čas poslední změny bufferu
	providerRef: undefined as PromptsProvider | undefined // reference na webview provider
};
