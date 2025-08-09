import * as vscode from 'vscode';
import * as path from 'path';
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { startAutoSave, createAutoSaveDisposable } from './autoSave';

let outputChannel: vscode.OutputChannel;
let recentPrompts: string[] = state.recentPrompts;
let aiPromptCounter = 0;
let statusBarItem: vscode.StatusBarItem;
let chatInputBuffer = '';
let lastEnterSubmitAt = 0;
const explicitSubmitCommands = new Set([
	'github.copilot.chat.acceptInput','github.copilot.chat.submit','github.copilot.chat.send','github.copilot.chat.sendMessage',
	'workbench.action.chat.acceptInput','workbench.action.chat.submit','workbench.action.chat.executeSubmit','workbench.action.chat.send','workbench.action.chat.sendMessage',
	'chat.acceptInput','inlineChat.accept','interactive.acceptInput'
]);
let providerRef: PromptsProvider | undefined;
let lastNonEmptySnapshot = '';
let lastSubmittedText = '';
let lastFinalizeAt = 0;
const chatDocState = new Map<string,string>();

async function finalizePrompt(source: string, directText?: string) {
	try {
		let txt = (directText || chatInputBuffer || lastNonEmptySnapshot).trim();
		if (!txt) return;
		if (txt === lastSubmittedText) return;
		lastSubmittedText = txt;
		recentPrompts.unshift(txt);
		if (recentPrompts.length > 1000) recentPrompts.splice(1000);
		chatInputBuffer = '';
		aiPromptCounter++;
		lastFinalizeAt = Date.now();
		const cfg = vscode.workspace.getConfiguration('specstory-autosave');
		const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
		vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`);
		providerRef?.refresh();
		outputChannel.appendLine(`🛎️ Detected submit via ${source}`);
	} catch (e) { outputChannel.appendLine(`❌ finalizePrompt error: ${e}`); }
}

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
	providerRef = new PromptsProvider();
	const registration = vscode.window.registerWebviewViewProvider(PromptsProvider.viewType, providerRef);
	outputChannel.appendLine('🚀 PROMPTS: Provider registered successfully');

	setTimeout(async () => {
		try {
			await vscode.commands.executeCommand('workbench.view.extension.specstory-activity');
			await vscode.commands.executeCommand('workbench.viewsService.openView', PromptsProvider.viewType, true);
			outputChannel.appendLine('🎯 Activity Bar view opened on startup');
		} catch (e) { outputChannel.appendLine(`⚠️ Failed to open Activity Bar view on startup: ${e}`); }
	}, 400);

	const focusChatInput = async () => {
		for (const id of ['github.copilot.chat.focusInput','workbench.action.chat.focusInput','chat.focusInput']) { try { await vscode.commands.executeCommand(id); break; } catch {} }
	};
	const forwardToChatAccept = async (): Promise<boolean> => {
		try {
			const all = await vscode.commands.getCommands(true);
			const ids = ['github.copilot.chat.acceptInput','workbench.action.chat.acceptInput','workbench.action.chat.submit','workbench.action.chat.executeSubmit','workbench.action.chat.send','workbench.action.chat.sendMessage','inlineChat.accept','interactive.acceptInput','chat.acceptInput'].filter(i => all.includes(i));
			for (const id of ids) { try { await vscode.commands.executeCommand(id); outputChannel.appendLine(`📨 Forwarded Enter using: ${id}`); return true; } catch {} }
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
			for (const id of ['workbench.action.chat.copyInput','chat.copyInput','github.copilot.chat.copyInput'].filter(i => all.includes(i))) { try { await vscode.commands.executeCommand(id); captured = await vscode.env.clipboard.readText(); if (captured.trim()) break; } catch {} }
			if (!captured.trim()) {
				for (const sid of ['workbench.action.chat.selectAll','chat.selectAll'].filter(i => all.includes(i))) { try { await vscode.commands.executeCommand(sid); await vscode.commands.executeCommand('editor.action.clipboardCopyAction'); captured = await vscode.env.clipboard.readText(); if (captured.trim()) break; } catch {} }
			}
			try { await vscode.env.clipboard.writeText(prev); } catch {}
			return captured.trim();
		} catch { return ''; }
	};
	const captureChatInputSilently = async (): Promise<string> => {
		try { await vscode.commands.executeCommand('github.copilot.chat.focusInput'); } catch {}
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

	context.subscriptions.push(vscode.commands.registerCommand('specstory-autosave.forwardEnterToChat', async () => {
		try {
			let text = await getChatInputText();
			if (!text) text = chatInputBuffer.trim();
			if (text) { recentPrompts.unshift(text); if (recentPrompts.length > 1000) recentPrompts.splice(1000); providerRef?.refresh(); lastSubmittedText = text; }
			chatInputBuffer = '';
			await focusChatInput();
			lastEnterSubmitAt = Date.now();
			const ok = await forwardToChatAccept();
			if (ok) { aiPromptCounter++; updateStatusBar(); providerRef?.refresh(); }
			const cfg = vscode.workspace.getConfiguration('specstory-autosave');
			const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
			setTimeout(() => { providerRef?.refresh(); vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`); }, 10);
		} catch (e) { outputChannel.appendLine(`❌ Error in forwardEnterToChat: ${e}`); }
	}));

	const commandsAny = vscode.commands as any;
	if (typeof commandsAny?.onDidExecuteCommand === 'function') {
		outputChannel.appendLine('🛰️ Command listener active');
		context.subscriptions.push(commandsAny.onDidExecuteCommand((ev: any) => {
			try {
				const cmd = ev?.command as string | undefined; if (!cmd) return;
				if (cmd.includes('copilot') || cmd.includes('chat')) outputChannel.appendLine(`🔎 CMD: ${cmd}`);
				if (cmd === 'type') { const t = ev?.args?.[0]?.text as string | undefined; if (!t || t.includes('\n')) return; chatInputBuffer += t; return; }
				if (cmd === 'editor.action.clipboardPasteAction') { vscode.env.clipboard.readText().then(txt => { chatInputBuffer += txt; }); return; }
				if (cmd === 'deleteLeft') { if (chatInputBuffer) chatInputBuffer = chatInputBuffer.slice(0, -1); return; }
				if (cmd === 'cut' || cmd === 'editor.action.clipboardCutAction' || cmd === 'cancelSelection') { chatInputBuffer = ''; return; }
				const lower = cmd.toLowerCase();
				const heuristicSubmit = lower.includes('chat') && (lower.includes('accept') || lower.includes('submit') || lower.includes('send') || lower.includes('execute') || lower.includes('dispatch'));
				const now = Date.now();
				if (explicitSubmitCommands.has(cmd) || heuristicSubmit) {
					if (now - lastEnterSubmitAt > 120 && now - lastFinalizeAt > 120) setTimeout(() => finalizePrompt(`command:${cmd}`), 40);
					return;
				}
				if ((cmd.startsWith('github.copilot.') || lower.includes('chat')) && now - lastEnterSubmitAt > 150) {
					if (!/focus|copy|select|type|status|help|acceptinput/i.test(cmd) && (chatInputBuffer.trim() || lastNonEmptySnapshot)) setTimeout(() => finalizePrompt(`fallback:${cmd}`), 60);
				}
			} catch (e) { outputChannel.appendLine(`❌ onDidExecuteCommand handler error: ${e}`); }
		}));
	}

	// NEW: detect chat input document clearing (button submit) via onDidChangeTextDocument
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
		try {
			const doc = ev.document;
			const name = doc.fileName.toLowerCase();
			if (!(name.includes('copilot') || name.includes('chat'))) return;
			const id = doc.uri.toString();
			const prev = chatDocState.get(id) || '';
			const curr = doc.getText();
			if (prev && !curr.trim() && Date.now() - lastEnterSubmitAt > 120 && Date.now() - lastFinalizeAt > 150) {
				lastNonEmptySnapshot = prev; // preserve
				finalizePrompt('doc-clear', prev);
			}
			if (curr.trim()) chatDocState.set(id, curr);
		} catch {}
	}));

	let pollTimer: NodeJS.Timeout | undefined;
	let lastPollHadText = false;
	if (!pollTimer) {
		pollTimer = setInterval(async () => {
			try {
				const current = await captureChatInputSilently();
				if (current) { lastNonEmptySnapshot = current; lastPollHadText = true; }
				else {
					if (lastPollHadText && lastNonEmptySnapshot && Date.now() - lastEnterSubmitAt > 150 && Date.now() - lastFinalizeAt > 180) {
						await finalizePrompt('poll-clear');
					}
					lastPollHadText = false;
				}
			} catch {}
		}, 180);
		context.subscriptions.push({ dispose: () => { if (pollTimer) clearInterval(pollTimer); } });
	}

	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	watcher.onDidCreate(uri => { if (isValidSpecStoryFile(uri.fsPath)) { outputChannel.appendLine(`📝 New SpecStory file: ${path.basename(uri.fsPath)}`); loadPromptsFromFile(uri.fsPath, recentPrompts); providerRef?.refresh(); } });
	const configWatcher = vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('specstory-autosave.maxPrompts')) providerRef?.refresh(); });
	startAutoSave();
	const autoSaveDisposable = createAutoSaveDisposable();
	context.subscriptions.push(registration, watcher, configWatcher, statusBarItem, autoSaveDisposable);
	outputChannel.appendLine(`🚀 PROMPTS: Activation complete - total ${recentPrompts.length} prompts`);

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(ed => {
		try { if (!ed) return; if (!(ed.document.fileName.toLowerCase().includes('copilot') || ed.document.fileName.toLowerCase().includes('chat'))) { if (chatInputBuffer.trim()) finalizePrompt('focus-change', chatInputBuffer.trim()); chatInputBuffer = ''; } } catch {}
	}));
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
