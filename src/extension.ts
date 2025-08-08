import * as vscode from 'vscode';
import * as path from 'path';
import { initLogger, writeLog } from './logger';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { startAutoSave, createAutoSaveDisposable } from './autoSave';

let recentPrompts: string[] = [];
let aiPromptCounter = 0;
let statusBarItem: vscode.StatusBarItem;
let chatInputBuffer = '';

export async function activate(context: vscode.ExtensionContext) {
	initLogger(vscode.window.createOutputChannel('SpecStory Prompts'));
	writeLog('🚀 ACTIVATION: Extension starting...', true);

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.show();
	const updateStatusBar = () => {
		const v = vscode.extensions.getExtension('sunamocz.specstory-autosave')?.packageJSON.version || '1.1.79';
		statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter} | v${v}`;
		statusBarItem.tooltip = 'SpecStory AutoSave + AI Copilot Prompt Detection';
	};
	updateStatusBar();

	await loadExistingPrompts();
	const provider = new PromptsProvider(recentPrompts);
	const registration = vscode.window.registerWebviewViewProvider(PromptsProvider.viewType, provider);
	writeLog('🚀 PROMPTS: Provider registered successfully', false);

	// Auto-open our Activity Bar view on startup
	setTimeout(async () => {
		try {
			await vscode.commands.executeCommand('workbench.view.extension.specstory-activity');
			await vscode.commands.executeCommand('workbench.viewsService.openView', PromptsProvider.viewType, true);
			writeLog('🎯 Activity Bar view opened on startup', false);
		} catch (e) {
			writeLog(`⚠️ Failed to open Activity Bar view on startup: ${e}`, false);
		}
	}, 400);

	// Helpers
	const focusChatInput = async () => {
		for (const id of ['github.copilot.chat.focusInput','workbench.action.chat.focusInput','chat.focusInput']) {
			try { await vscode.commands.executeCommand(id); break; } catch { /* next */ }
		}
	};
	const forwardToChatAccept = async (): Promise<boolean> => {
		try {
			const all = await vscode.commands.getCommands(true);
			const ids = ['github.copilot.chat.acceptInput','workbench.action.chat.acceptInput','workbench.action.chat.submit','workbench.action.chat.executeSubmit','workbench.action.chat.send','workbench.action.chat.sendMessage','inlineChat.accept','interactive.acceptInput','chat.acceptInput'].filter(i => all.includes(i));
			for (const id of ids) { try { await vscode.commands.executeCommand(id); writeLog(`📨 Forwarded Enter using: ${id}`, false); return true; } catch { /* next */ } }
			try { await vscode.commands.executeCommand('type', { text: '\n' }); writeLog('↩️ Fallback: simulated Enter via type command', false); return true; } catch {}
			return false;
		} catch { return false; }
	};
	const getChatInputText = async (): Promise<string> => {
		try {
			await focusChatInput();
			const prev = await vscode.env.clipboard.readText();
			let captured = '';
			const all = await vscode.commands.getCommands(true);
			for (const id of ['workbench.action.chat.copyInput','chat.copyInput','github.copilot.chat.copyInput'].filter(i => all.includes(i))) {
				try { await vscode.commands.executeCommand(id); captured = await vscode.env.clipboard.readText(); if (captured?.trim()) break; } catch {}
			}
			if (!captured?.trim()) {
				for (const sid of ['workbench.action.chat.selectAll','chat.selectAll'].filter(i => all.includes(i))) {
					try { await vscode.commands.executeCommand(sid); await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); captured = await vscode.env.clipboard.readText(); if (captured?.trim()) break; } catch {}
				}
			}
			try { await vscode.env.clipboard.writeText(prev); } catch {}
			return (captured || '').trim();
		} catch { return ''; }
	};

	// Enter → add prompt immediately (#1), then forward to Copilot, then notify
	context.subscriptions.push(vscode.commands.registerCommand('specstory-autosave.forwardEnterToChat', async () => {
		try {
			let text = await getChatInputText();
			if (!text) text = chatInputBuffer.trim();
			if (text) { recentPrompts.unshift(text); if (recentPrompts.length > 1000) recentPrompts.splice(1000); provider.refresh(); }
			chatInputBuffer = '';
			await focusChatInput();
			const ok = await forwardToChatAccept();
			if (ok) { aiPromptCounter++; updateStatusBar(); provider.refresh(); }
			const cfg = vscode.workspace.getConfiguration('specstory-autosave');
			const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
			setTimeout(() => { provider.refresh(); vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`); }, 10);
		} catch (e) { writeLog(`❌ Error in forwardEnterToChat: ${e}`, false); }
	}));

	// Buffer typed/pasted text (best effort)
	const commandsAny = vscode.commands as any;
	if (typeof commandsAny?.onDidExecuteCommand === 'function') {
		context.subscriptions.push(commandsAny.onDidExecuteCommand((ev: any) => {
			try {
				const cmd = ev?.command as string | undefined;
				if (cmd === 'type') { const t = ev?.args?.[0]?.text as string | undefined; if (!t || t.includes('\n')) return; chatInputBuffer += t; }
				else if (cmd === 'editor.action.clipboardPasteAction') { vscode.env.clipboard.readText().then(txt => chatInputBuffer += txt); }
				else if (cmd === 'deleteLeft') { if (chatInputBuffer) chatInputBuffer = chatInputBuffer.slice(0, -1); }
				else if (cmd === 'cut' || cmd === 'editor.action.clipboardCutAction' || cmd === 'cancelSelection') { chatInputBuffer = ''; }
			} catch {}
		}));
	}

	// Watch SpecStory exports
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	watcher.onDidCreate(uri => { if (isValidSpecStoryFile(uri.fsPath)) { writeLog(`📝 New SpecStory file: ${path.basename(uri.fsPath)}`, false); loadPromptsFromFile(uri.fsPath, recentPrompts); provider.refresh(); } });

	// React to settings changes
	const configWatcher = vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('specstory-autosave.maxPrompts')) provider.refresh(); });

	// Auto-save
	startAutoSave();
	const autoSaveDisposable = createAutoSaveDisposable();

	context.subscriptions.push(registration, watcher, configWatcher, statusBarItem, autoSaveDisposable);
	writeLog(`🚀 PROMPTS: Activation complete - total ${recentPrompts.length} prompts`, false);
}

async function loadExistingPrompts(): Promise<void> {
	writeLog('🔍 Searching for existing SpecStory files...', false);
	const files = await vscode.workspace.findFiles('**/.specstory/history/*.md');
	writeLog(`📊 Found ${files.length} SpecStory files`, false);
	if (files.length === 0) { recentPrompts.push('Welcome to SpecStory AutoSave + AI Copilot Prompt Detection', 'TEST: Dummy prompt for demonstration'); return; }
	const sorted = files.sort((a, b) => path.basename(b.fsPath).localeCompare(path.basename(a.fsPath)));
	sorted.forEach(f => { if (isValidSpecStoryFile(f.fsPath)) loadPromptsFromFile(f.fsPath, recentPrompts); });
	writeLog(`✅ Total loaded ${recentPrompts.length} prompts from ${sorted.length} files`, false);
}

export function deactivate() { writeLog('🚀 DEACTIVATION: Extension shutting down', false); writeLog('🚀 Extension deactivated', false); }
