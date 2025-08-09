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
const chatDocState = new Map<string, { last: string; typed: boolean }>();
const explicitSubmitCommands = new Set([
	'github.copilot.chat.acceptInput',
	'github.copilot.chat.submit',
	'github.copilot.chat.send',
	'github.copilot.chat.sendMessage',
	'workbench.action.chat.acceptInput',
	'workbench.action.chat.submit',
	'workbench.action.chat.executeSubmit',
	'workbench.action.chat.send',
	'workbench.action.chat.sendMessage',
	'chat.acceptInput',
	'inlineChat.accept',
	'interactive.acceptInput'
]);

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
	let isInternalForward = false; // guard to prevent recursion when we internally invoke submit commands
	const forwardToChatAccept = async (): Promise<boolean> => {
		try {
			isInternalForward = true;
			const all = await vscode.commands.getCommands(true);
			const ids = ['github.copilot.chat.acceptInput','workbench.action.chat.acceptInput','workbench.action.chat.submit','workbench.action.chat.executeSubmit','workbench.action.chat.send','workbench.action.chat.sendMessage','inlineChat.accept','interactive.acceptInput','chat.acceptInput'].filter(i => all.includes(i));
			for (const id of ids) { try { await vscode.commands.executeCommand(id); outputChannel.appendLine(`📨 Forwarded Enter using: ${id}`); isInternalForward = false; return true; } catch { /* next */ } }
			try { await vscode.commands.executeCommand('type', { text: '\n' }); outputChannel.appendLine('↩️ Fallback: simulated Enter via type command'); return true; } catch {}
			return false;
		} catch { return false; }
		finally { isInternalForward = false; }
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
	const captureChatInputSilently = async (): Promise<string> => {
		try {
			await vscode.commands.executeCommand('github.copilot.chat.focusInput');
		} catch {}
		const prev = await vscode.env.clipboard.readText();
		let captured = '';
		try {
			const all = await vscode.commands.getCommands(true);
			const copyIds = ['workbench.action.chat.copyInput','chat.copyInput','github.copilot.chat.copyInput'];
			for (const id of copyIds.filter(i => all.includes(i))) {
				try { await vscode.commands.executeCommand(id); captured = await vscode.env.clipboard.readText(); if (captured.trim()) break; } catch {}
			}
			if (!captured.trim()) {
				for (const sid of ['workbench.action.chat.selectAll','chat.selectAll'].filter(i => all.includes(i))) {
					try { await vscode.commands.executeCommand(sid); await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); captured = await vscode.env.clipboard.readText(); if (captured.trim()) break; } catch {}
				}
			}
		} finally {
			try { await vscode.env.clipboard.writeText(prev); } catch {}
		}
		return captured.trim();
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
				if (!cmd) return;
				if (cmd.includes('copilot') || cmd.includes('chat')) { outputChannel.appendLine(`🔎 CMD: ${cmd}`); }
				if (cmd === 'type') { const t = ev?.args?.[0]?.text as string | undefined; if (!t || t.includes('\n')) return; chatInputBuffer += t; return; }
				if (cmd === 'editor.action.clipboardPasteAction') { vscode.env.clipboard.readText().then(txt => chatInputBuffer += txt); return; }
				if (cmd === 'deleteLeft') { if (chatInputBuffer) chatInputBuffer = chatInputBuffer.slice(0, -1); return; }
				if (cmd === 'cut' || cmd === 'editor.action.clipboardCutAction' || cmd === 'cancelSelection') { chatInputBuffer = ''; return; }

				const lower = cmd.toLowerCase();
				const heuristicSubmit = lower.includes('chat') && (lower.includes('accept') || lower.includes('submit') || lower.includes('send') || lower.includes('execute') || lower.includes('dispatch'));
				const now = Date.now();
				const handleSubmit = () => {
					lastEnterSubmitAt = now;
					(async () => {
						let txt = chatInputBuffer.trim();
						if (!txt) txt = await getChatInputText();
						if (txt) {
							recentPrompts.unshift(txt);
							if (recentPrompts.length > 1000) recentPrompts.splice(1000);
							chatInputBuffer = '';
							provider.refresh();
						} else {
							outputChannel.appendLine('⚠️ Fallback submit detected but no prompt text');
						}
						aiPromptCounter++;
						const cfg = vscode.workspace.getConfiguration('specstory-autosave');
						const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
						vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`);
						provider.refresh();
					})();
				};

				if (explicitSubmitCommands.has(cmd) || heuristicSubmit) {
					if (now - lastEnterSubmitAt > 120) handleSubmit();
					return;
				}

				// Broad Copilot fallback: any other github.copilot.* command (excluding focus/copy/select) when buffer has content and no recent submit
				if (cmd.startsWith('github.copilot.') && chatInputBuffer.trim() && now - lastEnterSubmitAt > 150) {
					if (!/focus|copy|select|type|acceptinput|help|status/i.test(cmd)) {
						outputChannel.appendLine(`⚡ Fallback Copilot submit via command: ${cmd}`);
						handleSubmit();
					}
				}
			} catch (e) { outputChannel.appendLine(`❌ onDidExecuteCommand handler error: ${e}`); }
		}));
	}

	// Start improved poller using actual chat input snapshot (not our buffer) to detect button submits
	let lastSnapshot = '';
	let lastHandledPrompt = '';
	let pollTimer: NodeJS.Timeout | undefined;
	if (!pollTimer) {
		pollTimer = setInterval(async () => {
			try {
				const current = await captureChatInputSilently();
				// Detect transition from non-empty -> empty without Enter handler (button click)
				if (!current && lastSnapshot && lastSnapshot !== lastHandledPrompt) {
					// Ensure we did not just handle Enter
					if (Date.now() - lastEnterSubmitAt > 140) {
						if (recentPrompts[0] !== lastSnapshot) {
							recentPrompts.unshift(lastSnapshot);
							if (recentPrompts.length > 1000) recentPrompts.splice(1000);
							aiPromptCounter++;
							const cfg = vscode.workspace.getConfiguration('specstory-autosave');
							const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
							vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`);
							provider.refresh();
							lastHandledPrompt = lastSnapshot;
						}
					}
				}
				if (current) lastSnapshot = current; // update snapshot only when there's content
			} catch {}
		}, 500);
		context.subscriptions.push({ dispose: () => { if (pollTimer) clearInterval(pollTimer); } });
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
