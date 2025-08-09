import * as vscode from 'vscode';
import * as path from 'path';
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { initLogger, info, debug } from './logger';
import { focusChatInput, forwardToChatAccept, getChatInputText } from './chatHelpers';

let outputChannel: vscode.OutputChannel;
let aiPromptCounter = 0;
let statusBarItem: vscode.StatusBarItem;
let providerRef: PromptsProvider | undefined;
let lastSubmittedText = '';

export async function activate(context: vscode.ExtensionContext) {
	initLogger();
	outputChannel = vscode.window.createOutputChannel('SpecStory Prompts');
	info('Activation start');
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.show();
	const updateStatusBar = () => {
		const v = vscode.extensions.getExtension('sunamocz.ai-prompt-detector')?.packageJSON.version || '1.1.x';
		statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter} | v${v}`;
	};
	updateStatusBar();

	await loadExistingPrompts();
	providerRef = new PromptsProvider();
	const registration = vscode.window.registerWebviewViewProvider(PromptsProvider.viewType, providerRef);

	// Chat API hook
	try {
		const chatNs: any = (vscode as any).chat;
		if (chatNs?.onDidSubmitRequest) {
			context.subscriptions.push(chatNs.onDidSubmitRequest((e: any) => {
				try {
					const prompt = e?.request?.message || e?.request?.prompt || e?.prompt || '';
					const text = String(prompt).trim();
					if (!text || text === lastSubmittedText) return;
					lastSubmittedText = text;
					state.recentPrompts.unshift(text);
					if (state.recentPrompts.length > 1000) state.recentPrompts.splice(1000);
					aiPromptCounter++;
					providerRef?.refresh();
					updateStatusBar();
					const msg = vscode.workspace.getConfiguration('ai-prompt-detector').get<string>('customMessage', '') || 'We will verify quality & accuracy.';
					vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`);
				} catch (err) { debug('chat api err ' + err); }
			}));
		}
	} catch (e) { debug('chat api init err ' + e); }

	// Minimalni listener pro zachyceni kliknuti na GUI tlacitko (Send / Dispatch / New Chat / With Codebase)
	try {
		const commandsAny = vscode.commands as any;
		if (commandsAny?.onDidExecuteCommand) {
			const sendCommands = new Set([
				'github.copilot.chat.acceptInput',
				'github.copilot.chat.send',
				'github.copilot.chat.submit',
				'workbench.action.chat.acceptInput',
				'workbench.action.chat.submit',
				'workbench.action.chat.submitWithCodebase',
				'workbench.action.chat.sendToNewChat',
				'workbench.action.chat.submitWithoutDispatching'
			]);
			context.subscriptions.push(commandsAny.onDidExecuteCommand((ev: any) => {
				try {
					const cmd = ev?.command as string; if (!sendCommands.has(cmd)) return;
					// Zpozdeni aby Chat API melo prednost (zabrani dvojitemu zapoctu)
					setTimeout(async () => {
						try {
							const text = await getChatInputText();
							if (!text || text === lastSubmittedText) return;
							lastSubmittedText = text;
							state.recentPrompts.unshift(text);
							if (state.recentPrompts.length > 1000) state.recentPrompts.splice(1000);
							aiPromptCounter++;
							providerRef?.refresh();
							updateStatusBar();
							const msg = vscode.workspace.getConfiguration('ai-prompt-detector').get<string>('customMessage', '') || 'We will verify quality & accuracy.';
							vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`);
						} catch(e2){ debug('cmd capture err '+e2); }
					}, 25);
				} catch(err){ debug('cmd hook err '+err); }
			}));
		}
	} catch(e){ debug('cmd hook init err '+e); }

	context.subscriptions.push(vscode.commands.registerCommand('ai-prompt-detector.forwardEnterToChat', async () => {
		try {
			const text = await getChatInputText();
			if (text) {
				lastSubmittedText = text;
				state.recentPrompts.unshift(text);
				if (state.recentPrompts.length > 1000) state.recentPrompts.splice(1000);
				providerRef?.refresh();
			}
			await focusChatInput();
			let ok = await forwardToChatAccept();
			if (!ok) {
				for (const id of [
					'github.copilot.chat.acceptInput',
					'github.copilot.chat.send',
					'github.copilot.chat.submit',
					'workbench.action.chat.acceptInput',
					'workbench.action.chat.submit'
				]) { try { await vscode.commands.executeCommand(id); ok = true; break; } catch {} }
			}
			if (ok) {
				aiPromptCounter++;
				providerRef?.refresh();
				const msg = vscode.workspace.getConfiguration('ai-prompt-detector').get<string>('customMessage', '') || 'We will verify quality & accuracy.';
				setTimeout(() => vscode.window.showInformationMessage(`AI Prompt sent${text ? '\n' + msg : ''}`), 10);
				updateStatusBar();
			}
		} catch (e) { outputChannel.appendLine('forward err ' + e); }
	}));

	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	watcher.onDidCreate(uri => { if (isValidSpecStoryFile(uri.fsPath)) { loadPromptsFromFile(uri.fsPath, state.recentPrompts); providerRef?.refresh(); } });
	const configWatcher = vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('ai-prompt-detector.maxPrompts')) providerRef?.refresh(); });
	context.subscriptions.push(registration, watcher, configWatcher, statusBarItem);
	info('Activation done');
}

async function loadExistingPrompts() {
	const files = await vscode.workspace.findFiles('**/.specstory/history/*.md');
	if (!files.length) { state.recentPrompts.push('Welcome to AI Copilot Prompt Detector', 'TEST: Dummy prompt for demonstration'); return; }
	const sorted = files.sort((a, b) => path.basename(b.fsPath).localeCompare(path.basename(a.fsPath)));
	for (const f of sorted) if (isValidSpecStoryFile(f.fsPath)) loadPromptsFromFile(f.fsPath, state.recentPrompts);
}

export function deactivate() { info('Deactivation'); }
