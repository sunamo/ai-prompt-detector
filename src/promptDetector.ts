import * as vscode from 'vscode';
import { writeLog } from './logger';
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';

/** Pokusí se aktivovat / zaostřit chat vstup pro následnou manipulaci. */
async function focusChatInput(): Promise<boolean> {
	const candidates = [
		'workbench.action.chat.focus',
		'workbench.action.chat.open',
		'inlineChat.start',
		'chat.start',
		'workbench.panel.chat.view.focus',
		'workbench.view.extension.chatExplorer',
	];
	for (const cmd of candidates) { try { await vscode.commands.executeCommand(cmd); return true; } catch {} }
	return false;
}

/**
 * Získá text z aktuálního chat inputu (clipboard technika) – obnoví původní obsah schránky.
 */
async function getChatInputText(): Promise<string> {
	try { await focusChatInput(); const original = await vscode.env.clipboard.readText(); let captured = ''; try { await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); captured = await vscode.env.clipboard.readText(); } catch {} if (!captured) { try { await vscode.commands.executeCommand('editor.action.selectAll'); await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); captured = await vscode.env.clipboard.readText(); } catch {} } await vscode.env.clipboard.writeText(original); return captured || ''; } catch (e) { writeLog(`⚠️ getChatInputText failed: ${String(e)}`, true); return ''; }
}

/**
 * Pokusí se odeslat obsah chat inputu – různé fallback příkazy + simulace Enter.
 */
async function forwardToChatAccept(): Promise<boolean> {
	const candidates = [ 'workbench.action.chat.acceptInput', 'inlineChat.accept', 'chat.acceptInput', 'workbench.action.quickchat.accept' ];
	for (const cmd of candidates) { try { await vscode.commands.executeCommand(cmd); return true; } catch {} }
	try { await vscode.commands.executeCommand('type', { text: '\n' }); return true; } catch {}
	return false;
}

/**
 * Registrace handleru pro přesměrování Enter na chat – získá text, uloží, odešle.
 */
export function registerEnterHandler(context: vscode.ExtensionContext, provider: PromptsProvider) {
	context.subscriptions.push(vscode.commands.registerCommand('ai-prompt-detector.forwardEnterToChat', async () => {
		try { const text = (await getChatInputText())?.trim(); if (text) { state.recentPrompts.unshift(text); provider.refresh(); } const accepted = await forwardToChatAccept(); writeLog(`➡️ Forwarded Enter to Copilot: ${accepted}`, true); if (text) { vscode.window.setStatusBarMessage('AI just received your prompt. Review results.', 1500); } } catch (e) { writeLog(`❌ Enter handler failed: ${String(e)}`, true); }
	}));
}

/** Určí zda zadané argumenty příkazu typu signalizují Enter (nový řádek). */
export function detectCopilotEnter(args: any): boolean { if (args && typeof args.text === 'string') { return args.text.includes('\n') || args.text.includes('\r'); } return false; }

/** Heuristická kontrola, zda je aktivní editor v kontextu Copilot / chat. */
export function isCopilotContext(): boolean {
	try { const editor = vscode.window.activeTextEditor; if (!editor) return false; const document = editor.document; const fileName = document.fileName.toLowerCase(); const languageId = document.languageId; return ( fileName.includes('copilot') || fileName.includes('chat') || languageId === 'markdown' || document.getText().toLowerCase().includes('copilot') || vscode.window.activeTextEditor?.viewColumn !== undefined ); } catch { return false; }
}

/**
 * Zpracuje prompt z aktuálního editoru – extrakce textu, filtrace duplicit, update UI, notifikace.
 */
export function processCopilotPrompt(
	recentPrompts: string[], 
	aiPromptCounter: { value: number },
	updateStatusBar: () => void,
	promptsProvider: { refresh: () => void }
): void {
	try { writeLog(`🔍 PROCESSING COPILOT PROMPT...`, true); const editor = vscode.window.activeTextEditor; if (!editor) { writeLog(`❌ No active editor`, true); return; } const selection = editor.selection; let promptText = ''; if (!selection.isEmpty) { promptText = editor.document.getText(selection).trim(); } else { const currentLine = editor.document.lineAt(selection.active.line); promptText = currentLine.text.trim(); } writeLog(`📝 EXTRACTED PROMPT: "${promptText}"`, true); if (promptText.length < 5) { writeLog(`❌ Prompt too short: ${promptText.length} chars`, true); return; } if (recentPrompts.includes(promptText)) { writeLog(`🔄 DUPLICATE PROMPT: "${promptText.substring(0, 30)}..."`, true); return; } aiPromptCounter.value++; writeLog(`🤖 NEW AI PROMPT DETECTED! Counter: ${aiPromptCounter.value}`, false); writeLog(`📝 PROMPT: "${promptText}"`, false); updateStatusBar(); const config = vscode.workspace.getConfiguration('ai-prompt-detector'); const customMessage = config.get<string>('customMessage', ''); const notificationMessage = customMessage ? `AI Prompt detected\n${customMessage}` : 'AI Prompt detected\nCheck: Quality & accuracy of response'; vscode.window.showInformationMessage(notificationMessage); writeLog(`📢 NOTIFICATION SHOWN: ${notificationMessage.replace('\n', ' | ')}`, false); recentPrompts.unshift(promptText); writeLog(`➕ PROMPT ADDED TO ACTIVITY BAR: "${promptText.substring(0, 50)}..."`, false); if (recentPrompts.length > 1000) { recentPrompts.splice(1000); writeLog(`🔄 TRIMMED PROMPTS ARRAY TO 1000 ITEMS`, true); } promptsProvider.refresh(); writeLog(`🔄 UI UPDATED IMMEDIATELY`, true); } catch (error) { writeLog(`❌ Error processing prompt: ${error}`, false); }
}
