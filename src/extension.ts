import * as vscode from 'vscode';
import * as path from 'path';
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { initLogger, info } from './logger';
import { registerChatApiHook } from './chatApiHook';
import { runtime } from './runtime';
import { finalizePrompt as externalFinalizePrompt } from './finalize';
import { focusChatInput, forwardToChatAccept, getChatInputText } from './chatHelpers';

let outputChannel: vscode.OutputChannel;
let recentPrompts: string[] = state.recentPrompts;
let aiPromptCounter = 0;
let statusBarItem: vscode.StatusBarItem;
let providerRef: PromptsProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
	initLogger();
	outputChannel = vscode.window.createOutputChannel('SpecStory Prompts');
	info('🚀 ACTIVATION: Extension starting...');

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.show();
	const updateStatusBar = () => {
		const v = vscode.extensions.getExtension('sunamocz.ai-prompt-detector')?.packageJSON.version || '1.1.79';
		statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter} | v${v}`;
		statusBarItem.tooltip = 'AI Copilot Prompt Detector';
	};
	updateStatusBar();

	await loadExistingPrompts();
	providerRef = new PromptsProvider();
	const registration = vscode.window.registerWebviewViewProvider(PromptsProvider.viewType, providerRef);
	runtime.providerRef = providerRef; runtime.outputChannel = outputChannel;

	registerChatApiHook(context, externalFinalizePrompt);

	context.subscriptions.push(vscode.commands.registerCommand('ai-prompt-detector.forwardEnterToChat', async () => {
		try {
			let text = await getChatInputText();
			// NEVRACEJ se pri prazdnem textu - Enter musí projít dál
			if (text) {
				recentPrompts.unshift(text);
				if (recentPrompts.length > 1000) recentPrompts.splice(1000);
				providerRef?.refresh();
			}
			await focusChatInput();
			let ok = await forwardToChatAccept();
			if (!ok) {
				for (const id of ['github.copilot.chat.acceptInput','workbench.action.chat.acceptInput','workbench.action.chat.submit']) {
					try { await vscode.commands.executeCommand(id); ok = true; break; } catch {}
				}
			}
			if (ok) {
				// Inkrement jen pokud jsme skutečně odeslali a máme nějaký obsah
				if (text) { aiPromptCounter++; }
				providerRef?.refresh();
				const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
				const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
				// Notifikace vždy po úspěšném odeslání
				setTimeout(() => { vscode.window.showInformationMessage(`AI Prompt sent${text ? '\n'+msg : ''}`); }, 10);
				const v = vscode.extensions.getExtension('sunamocz.ai-prompt-detector')?.packageJSON.version || '';
				statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter} | v${v}`;
			}
		} catch (e) { outputChannel.appendLine(`❌ Error in forwardEnterToChat: ${e}`); }
	}));

	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	watcher.onDidCreate(uri => { if (isValidSpecStoryFile(uri.fsPath)) { outputChannel.appendLine(`📝 New SpecStory file: ${path.basename(uri.fsPath)}`); loadPromptsFromFile(uri.fsPath, recentPrompts); providerRef?.refresh(); } });
	const configWatcher = vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('ai-prompt-detector.maxPrompts')) providerRef?.refresh(); });
	context.subscriptions.push(registration, watcher, configWatcher, statusBarItem);
	outputChannel.appendLine(`🚀 PROMPTS: Activation complete - total ${recentPrompts.length} prompts`);
}

async function loadExistingPrompts(): Promise<void> {
	outputChannel.appendLine('🔍 Searching for existing SpecStory files...');
	const files = await vscode.workspace.findFiles('**/.specstory/history/*.md');
	outputChannel.appendLine(`📊 Found ${files.length} SpecStory files`);
	if (files.length === 0) { recentPrompts.push('Welcome to AI Copilot Prompt Detector', 'TEST: Dummy prompt for demonstration'); return; }
	const sorted = files.sort((a, b) => path.basename(b.fsPath).localeCompare(path.basename(a.fsPath)));
	sorted.forEach(f => { if (isValidSpecStoryFile(f.fsPath)) loadPromptsFromFile(f.fsPath, recentPrompts); });
	outputChannel.appendLine(`✅ Total loaded ${recentPrompts.length} prompts from ${sorted.length} files`);
}

export function deactivate() { outputChannel.appendLine('🚀 DEACTIVATION: Extension shutting down'); outputChannel.appendLine('🚀 Extension deactivated'); }
