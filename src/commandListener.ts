import * as vscode from 'vscode';
import { finalizePrompt } from './finalize';
import { runtime } from './runtime';

// Explicitní sada příkazů indikujících odeslání promptu
const explicitSubmitCommands = new Set([
	'github.copilot.chat.acceptInput','github.copilot.chat.submit','github.copilot.chat.send','github.copilot.chat.sendMessage',
	'workbench.action.chat.acceptInput','workbench.action.chat.submit','workbench.action.chat.submitWithoutDispatching','workbench.action.chat.submitWithCodebase','workbench.action.chat.sendToNewChat','workbench.action.chat.createRemoteAgentJob','workbench.action.chat.executeSubmit','workbench.action.chat.send','workbench.action.chat.sendMessage',
	'chat.acceptInput','inlineChat.accept','interactive.acceptInput'
]);

/**
 * Registruje globální odposlech vykonaných příkazů a heuristicky detekuje odeslání promptu.
 * Zachytává: psaní (type), paste, deleteLeft, cut, explicitní submit příkazy a fallback scénáře.
 */
export function registerCommandListener(context: vscode.ExtensionContext) {
	const commandsAny = vscode.commands as any;
	if (typeof commandsAny?.onDidExecuteCommand !== 'function') return;
	runtime.outputChannel?.appendLine('🛰️ Command listener active');
	context.subscriptions.push(commandsAny.onDidExecuteCommand((ev: any) => {
		try {
			const cmd = ev?.command as string | undefined; if (!cmd) return;
			if (cmd.includes('copilot') || cmd.includes('chat')) runtime.outputChannel?.appendLine(`🔎 CMD: ${cmd}`);
			// Psaní do vstupu – akumulujeme text
			if (cmd === 'type') { const t = ev?.args?.[0]?.text as string | undefined; if (!t || t.includes('\n')) return; runtime.chatInputBuffer += t; runtime.lastBufferChangedAt = Date.now(); runtime.lastNonEmptySnapshot = runtime.chatInputBuffer; return; }
			// Vkládání z clipboardu
			if (cmd === 'editor.action.clipboardPasteAction') { vscode.env.clipboard.readText().then(txt => { runtime.chatInputBuffer += txt; runtime.lastBufferChangedAt = Date.now(); runtime.lastNonEmptySnapshot = runtime.chatInputBuffer; }); return; }
			// Backspace
			if (cmd === 'deleteLeft') { if (runtime.chatInputBuffer) { runtime.chatInputBuffer = runtime.chatInputBuffer.slice(0,-1); runtime.lastBufferChangedAt = Date.now(); runtime.lastNonEmptySnapshot = runtime.chatInputBuffer; } return; }
			// Vyprázdnění bufferu (cut / zrušení výběru)
			if (cmd === 'cut' || cmd === 'editor.action.clipboardCutAction' || cmd === 'cancelSelection') { runtime.chatInputBuffer=''; runtime.lastBufferChangedAt=Date.now(); return; }
			const lower = cmd.toLowerCase();
			const isDispatch = lower.includes('dispatch');
			const isCopilot = lower.includes('copilot');
			const heuristicSubmit = (lower.includes('chat') || isCopilot) && (lower.includes('accept')||lower.includes('submit')||lower.includes('send')||lower.includes('execute')||lower.includes('dispatch'));
			const now = Date.now();
			if (explicitSubmitCommands.has(cmd) || heuristicSubmit || isDispatch) {
				// Snapshot před vyprázdněním UI
				const snap = (runtime.chatInputBuffer || runtime.lastNonEmptySnapshot || '').trim();
				if (snap) runtime.outputChannel?.appendLine(`🧲 Snapshot capture for ${cmd} chars=${snap.length}`);
				if (now - runtime.lastEnterSubmitAt > 100 && now - runtime.lastFinalizeAt > 100) {
					setTimeout(()=>finalizePrompt(`command:${cmd}`, snap),10); // malá prodleva pro dokončení bufferu
				}
				return;
			}
			// Fallback – jiný copilot/chat příkaz, který může implikovat submit
			if ((lower.includes('github.copilot') || lower.includes('chat') || isDispatch) && now - runtime.lastEnterSubmitAt > 120) {
				const snap = (runtime.chatInputBuffer || runtime.lastNonEmptySnapshot || '').trim();
				if (!/focus|copy|select|type|status|help|acceptinput/i.test(cmd) && snap) setTimeout(()=>finalizePrompt(`fallback:${cmd}`, snap),50);
			}
		} catch (e) { runtime.outputChannel?.appendLine(`❌ onDidExecuteCommand handler error: ${e}`); }
	}));
}
