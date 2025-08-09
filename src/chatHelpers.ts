import * as vscode from 'vscode';

export const focusChatInput = async () => {
	for (const id of ['github.copilot.chat.focusInput','workbench.action.chat.focusInput','chat.focusInput']) {
		try { await vscode.commands.executeCommand(id); return; } catch {}
	}
};

export const forwardToChatAccept = async (): Promise<boolean> => {
		try {
			const all = await vscode.commands.getCommands(true);
			const ids = [
				'github.copilot.chat.acceptInput',
				'github.copilot.chat.send',
				'github.copilot.chat.submit',
				'workbench.action.chat.acceptInput',
				'workbench.action.chat.submit',
				'inlineChat.accept',
				'chat.acceptInput'
			].filter(i=>all.includes(i));
			for (const id of ids){
				try { await vscode.commands.executeCommand(id); return true; } catch {}
			}
			await vscode.commands.executeCommand('type',{text:'\n'});
			return true;
		} catch { return false; }
};

export const getChatInputText = async (): Promise<string> => {
	try {
		await focusChatInput();
		const prev = await vscode.env.clipboard.readText();
		let captured='';
		const all = await vscode.commands.getCommands(true);
		for (const id of ['workbench.action.chat.copyInput','chat.copyInput','github.copilot.chat.copyInput'].filter(i=>all.includes(i))) {
			try { await vscode.commands.executeCommand(id); captured = await vscode.env.clipboard.readText(); if(captured.trim()) break; } catch {}
		}
		if(!captured.trim())
			for (const sid of ['workbench.action.chat.selectAll','chat.selectAll'].filter(i=>all.includes(i))) {
				try { await vscode.commands.executeCommand(sid); await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); captured = await vscode.env.clipboard.readText(); if(captured.trim()) break; } catch {}
			}
		try { await vscode.env.clipboard.writeText(prev);}catch{}
		return captured.trim();
	} catch { return ''; }
};
