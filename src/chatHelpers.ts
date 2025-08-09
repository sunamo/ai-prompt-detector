import * as vscode from 'vscode';

/**
 * Pokusí se zaostřit vstupní pole chat / Copilot. Prochází několik ID příkazů
 * protože různé verze VS Code / rozšíření mohou používat jiné identifikátory.
 */
export const focusChatInput = async () => {
	for (const id of ['github.copilot.chat.focusInput','workbench.action.chat.focusInput','chat.focusInput']) {
		try { await vscode.commands.executeCommand(id); break; } catch {}
	}
};

/**
 * Pokusí se odeslat aktuální obsah chat inputu přes známé příkazy.
 * Pokud nic neprojde, fallback je simulace Enter (type s \n).
 * @returns true pokud se podařilo odeslat.
 */
export const forwardToChatAccept = async (): Promise<boolean> => {
	try {
		const all = await vscode.commands.getCommands(true);
		const ids = [
			'github.copilot.chat.acceptInput','workbench.action.chat.acceptInput','workbench.action.chat.submit','workbench.action.chat.executeSubmit','workbench.action.chat.send','workbench.action.chat.sendMessage','inlineChat.accept','interactive.acceptInput','chat.acceptInput'
		].filter(i => all.includes(i));
		for (const id of ids) { try { await vscode.commands.executeCommand(id); return true; } catch {} }
		try { await vscode.commands.executeCommand('type', { text: '\n' }); return true; } catch {}
		return false;
	} catch { return false; }
};

/**
 * Získá aktuální text z chat inputu nenásilnou cestou:
 * 1. Zaostří input
 * 2. Pokusí se použít copy příkazy (specifické pro chat)
 * 3. Pokud selže, zkusí selectAll + standardní kopírování
 * 4. Vrátí clipboard do původního stavu
 */
export const getChatInputText = async (): Promise<string> => {
	try {
		await focusChatInput();
		const prev = await vscode.env.clipboard.readText();
		let captured = '';
		const all = await vscode.commands.getCommands(true);
		for (const id of ['workbench.action.chat.copyInput','chat.copyInput','github.copilot.chat.copyInput'].filter(i => all.includes(i))) {
			try { await vscode.commands.executeCommand(id); captured = await vscode.env.clipboard.readText(); if (captured.trim()) break; } catch {}
		}
		if (!captured.trim()) {
			for (const sid of ['workbench.action.chat.selectAll','chat.selectAll'].filter(i => all.includes(i))) {
				try { await vscode.commands.executeCommand(sid); await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); captured = await vscode.env.clipboard.readText(); if (captured.trim()) break; } catch {}
			}
		}
		try { await vscode.env.clipboard.writeText(prev); } catch {}
		return captured.trim();
	} catch { return ''; }
};

/**
 * Tichý snapshot vstupu (např. pro pooling heuristik) – podobné jako getChatInputText,
 * ale nevyužívá fallback simulaci selectAll pokud není potřeba.
 */
export const captureChatInputSilently = async (): Promise<string> => {
	try { for (const id of ['workbench.action.chat.focusInput','github.copilot.chat.focusInput','chat.focusInput']) { try { await vscode.commands.executeCommand(id); break; } catch {} } } catch {}
	const prev = await vscode.env.clipboard.readText();
	let captured = '';
	try {
		const all = await vscode.commands.getCommands(true);
		for (const id of ['workbench.action.chat.copyInput','chat.copyInput','github.copilot.chat.copyInput'].filter(i => all.includes(i))) { try { await vscode.commands.executeCommand(id); captured = await vscode.env.clipboard.readText(); if (captured.trim()) break; } catch {} }
		if (!captured.trim()) {
			for (const sid of ['workbench.action.chat.selectAll','chat.selectAll'].filter(i => all.includes(i))) { try { await vscode.commands.executeCommand(sid); await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); captured = await vscode.env.clipboard.readText(); if (captured.trim()) break; } catch {} }
		}
	} finally { try { await vscode.env.clipboard.writeText(prev); } catch {} }
	return captured.trim();
};
