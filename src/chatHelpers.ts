import * as vscode from 'vscode';

export const focusChatInput = async () => {
	for (const id of ['github.copilot.chat.focusInput','workbench.action.chat.focusInput','chat.focusInput']) {
		try { await vscode.commands.executeCommand(id); break; } catch {}
	}
};

export const forwardToChatAccept = async (): Promise<boolean> => {
	try {
		const all = await vscode.commands.getCommands(true);
		// Rozsireny seznam prikazu pro odeslani (pro ruzne buildy Copilot / Chat UI)
		const ids = [
			'github.copilot.chat.acceptInput',
			'github.copilot.chat.send',
			'github.copilot.chat.sendMessage',
			'github.copilot.chat.submit',
			'github.copilot.chat.executeSubmit',
			'github.copilot.chat.inlineSubmit',
			'workbench.action.chat.acceptInput',
			'workbench.action.chat.submit',
			'workbench.action.chat.executeSubmit',
			'workbench.action.chat.send',
			'workbench.action.chat.sendMessage',
			'inlineChat.accept',
			'interactive.acceptInput',
			'chat.acceptInput'
		].filter(i => all.includes(i));
		for (const id of ids) { try { await vscode.commands.executeCommand(id); return true; } catch {} }
		try { await vscode.commands.executeCommand('type', { text: '\n' }); return true; } catch {}
		return false;
	} catch { return false; }
};

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

export const captureChatInputSilently = async (): Promise<string> => {
	try {
		for (const id of ['workbench.action.chat.focusInput','github.copilot.chat.focusInput','chat.focusInput']) { try { await vscode.commands.executeCommand(id); break; } catch {} }
	} catch {}
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
