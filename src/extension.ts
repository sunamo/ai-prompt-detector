import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { startAutoSave, createAutoSaveDisposable } from './autoSave';

let outputChannel: vscode.OutputChannel;
let recentPrompts: string[] = state.recentPrompts;
let aiPromptCounter: number = 0;
let statusBarItem: vscode.StatusBarItem;
let chatInputBuffer: string = '';
let lastEnterSubmitAt = 0; // timestamp of last submission to avoid duplicate notifications

export async function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('SpecStory Prompts');
	outputChannel.appendLine('🚀 ACTIVATION: Extension starting...');

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.show();
	const updateStatusBar = () => {
		const v = vscode.extensions.getExtension('sunamocz.specstory-autosave')?.packageJSON.version || '1.1.79';
		statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter} | v${v}`;
		statusBarItem.tooltip = 'SpecStory AutoSave + AI Copilot Prompt Detection';
	};
	updateStatusBar();

	await loadExistingPrompts();
	const provider = new PromptsProvider();
	const registration = vscode.window.registerWebviewViewProvider(PromptsProvider.viewType, provider);
	outputChannel.appendLine('🚀 PROMPTS: Provider registered successfully');

	// Auto-open our Activity Bar view on startup
	setTimeout(async () => {
		try {
			await vscode.commands.executeCommand('workbench.view.extension.specstory-activity');
			await vscode.commands.executeCommand('workbench.viewsService.openView', PromptsProvider.viewType, true);
			outputChannel.appendLine('🎯 Activity Bar view opened on startup');
		} catch (e) {
			outputChannel.appendLine(`⚠️ Failed to open Activity Bar view on startup: ${e}`);
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
			for (const id of ids) { try { await vscode.commands.executeCommand(id); outputChannel.appendLine(`📨 Forwarded Enter using: ${id}`); return true; } catch { /* next */ } }
			try { await vscode.commands.executeCommand('type', { text: '\n' }); outputChannel.appendLine('↩️ Fallback: simulated Enter via type command'); return true; } catch {}
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
			lastEnterSubmitAt = Date.now();
			const ok = await forwardToChatAccept();
			if (ok) { aiPromptCounter++; updateStatusBar(); provider.refresh(); }
			const cfg = vscode.workspace.getConfiguration('specstory-autosave');
			const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
			setTimeout(() => { provider.refresh(); vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`); }, 10);
		} catch (e) { outputChannel.appendLine(`❌ Error in forwardEnterToChat: ${e}`); }
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

				// Generic detection for button-based submit (send/dispatch/accept) not handled by our Enter override
				if (cmd) {
					const lower = cmd.toLowerCase();
					const isSubmit = lower.includes('chat') && (lower.includes('accept') || lower.includes('submit') || lower.includes('send') || lower.includes('execute') || lower.includes('dispatch'));
					if (isSubmit) {
						const now = Date.now();
						if (now - lastEnterSubmitAt > 250) { // avoid duplicates when multiple internal commands fire
							lastEnterSubmitAt = now;
							(async () => {
								let txt = await getChatInputText();
								if (!txt) txt = chatInputBuffer.trim();
								if (txt) {
									recentPrompts.unshift(txt);
									if (recentPrompts.length > 1000) recentPrompts.splice(1000);
									provider.refresh();
									chatInputBuffer = '';
								}
								aiPromptCounter++;
								updateStatusBar();
								const cfg = vscode.workspace.getConfiguration('specstory-autosave');
								const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
								vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`);
							})();
						}
					}
				}
			} catch {}
		}));
	}

	// Watch SpecStory exports
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	watcher.onDidCreate(uri => { if (isValidSpecStoryFile(uri.fsPath)) { outputChannel.appendLine(`📝 New SpecStory file: ${path.basename(uri.fsPath)}`); loadPromptsFromFile(uri.fsPath, recentPrompts); provider.refresh(); } });

	// React to settings changes
	const configWatcher = vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('specstory-autosave.maxPrompts')) provider.refresh(); });

	// Auto-save
	startAutoSave();
	const autoSaveDisposable = createAutoSaveDisposable();

	context.subscriptions.push(registration, watcher, configWatcher, statusBarItem, autoSaveDisposable);
	outputChannel.appendLine(`🚀 PROMPTS: Activation complete - total ${recentPrompts.length} prompts`);
}

async function loadExistingPrompts(): Promise<void> {
	outputChannel.appendLine('🔍 Searching for existing SpecStory files...');
	const files = await vscode.workspace.findFiles('**/.specstory/history/*.md');
	outputChannel.appendLine(`📊 Found ${files.length} SpecStory files`);
	if (files.length === 0) { recentPrompts.push('Welcome to SpecStory AutoSave + AI Copilot Prompt Detection', 'TEST: Dummy prompt for demonstration'); return; }
	const sorted = files.sort((a, b) => path.basename(b.fsPath).localeCompare(path.basename(a.fsPath)));
	sorted.forEach(f => { if (isValidSpecStoryFile(f.fsPath)) loadPromptsFromFile(f.fsPath, recentPrompts); });
	outputChannel.appendLine(`✅ Total loaded ${recentPrompts.length} prompts from ${sorted.length} files`);
}

export function deactivate() { outputChannel.appendLine('🚀 DEACTIVATION: Extension shutting down'); outputChannel.appendLine('🚀 Extension deactivated'); }
