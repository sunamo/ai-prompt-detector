import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs'; // přidáno pro logování do souborů
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { initLogger, info } from './logger';
import { registerChatApiHook } from './chatApiHook';
import { runtime } from './runtime';
import { finalizePrompt as externalFinalizePrompt } from './finalize';
import { SOURCE_DIR_COPILOT, SOURCE_DIR_VSCODE, LOG_DIR } from './constants';
import { focusChatInput, forwardToChatAccept, getChatInputText } from './chatHelpers';

let outputChannel: vscode.OutputChannel; // starší lokální proměnná zachována pro minimální změny
let recentPrompts: string[] = state.recentPrompts;
let aiPromptCounter = 0;
let statusBarItem: vscode.StatusBarItem;
let chatInputBuffer = '';
let providerRef: PromptsProvider | undefined;

// Lehký obal – ponecháno pro chat API hook
function doFinalize(source: string, directText?: string) { externalFinalizePrompt(source, directText); }

export async function activate(context: vscode.ExtensionContext) {
	initLogger();
	outputChannel = vscode.window.createOutputChannel('SpecStory Prompts');
	info('🚀 ACTIVATION: Extension starting...');
	try {
		const logDir = LOG_DIR; // reference konstanty pro sledování
		if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
		const today = new Date().toISOString().slice(0,10);
		const dailyLogPath = path.join(logDir, `extension-${today}.log`);
		fs.writeFileSync(dailyLogPath, ''); // vymazat soubor
		const origAppend = outputChannel.appendLine.bind(outputChannel);
		outputChannel.appendLine = (v: string) => { origAppend(v); try { fs.appendFileSync(dailyLogPath, `[${new Date().toISOString()}] ${v}\n`); } catch {} };
		outputChannel.appendLine(`🧹 Cleared daily log file ${dailyLogPath}`);
	} catch {}
	outputChannel.appendLine('🚀 ACTIVATION: Extension starting...');
	outputChannel.appendLine(`REFS SRC ${SOURCE_DIR_COPILOT} | ${SOURCE_DIR_VSCODE} | LOG ${LOG_DIR}`); // referenční řádek aktivace

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.show();
	const updateStatusBar = () => {
		const v = vscode.extensions.getExtension('sunamocz.ai-prompt-detector')?.packageJSON.version || '1.1.79';
		statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter} | v${v}`;
		statusBarItem.tooltip = 'AI Prompt Detector + AI Copilot Prompt Detection';
	};
	updateStatusBar();

	await loadExistingPrompts();
	providerRef = new PromptsProvider();
	const registration = vscode.window.registerWebviewViewProvider(PromptsProvider.viewType, providerRef);
	runtime.providerRef = providerRef; runtime.outputChannel = outputChannel;

	setTimeout(async () => {
		try { await vscode.commands.executeCommand('workbench.view.extension.specstory-activity'); } catch (e) { outputChannel.appendLine(`⚠️ view open fallback only: ${e}`); }
	}, 400);

	registerChatApiHook(context, doFinalize);

	context.subscriptions.push(vscode.commands.registerCommand('ai-prompt-detector.forwardEnterToChat', async () => {
		try {
			let text = await getChatInputText();
			if (!text) text = chatInputBuffer.trim();
			if (text) {
				recentPrompts.unshift(text);
				if (recentPrompts.length > 1000) recentPrompts.splice(1000);
				providerRef?.refresh();
			}
			chatInputBuffer = '';
			await focusChatInput();
			const ok = await forwardToChatAccept();
			if (ok) {
				aiPromptCounter++;
				providerRef?.refresh();
				updateStatusBar();
			}
			const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
			const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
			setTimeout(() => { providerRef?.refresh(); vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`); }, 10);
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
	if (files.length === 0) { recentPrompts.push('Welcome to AI Prompt Detector + AI Copilot Prompt Detection', 'TEST: Dummy prompt for demonstration'); return; }
	const sorted = files.sort((a, b) => path.basename(b.fsPath).localeCompare(path.basename(a.fsPath)));
	sorted.forEach(f => { if (isValidSpecStoryFile(f.fsPath)) loadPromptsFromFile(f.fsPath, recentPrompts); });
	outputChannel.appendLine(`✅ Total loaded ${recentPrompts.length} prompts from ${sorted.length} files`);
}

export function deactivate() { outputChannel.appendLine('🚀 DEACTIVATION: Extension shutting down'); outputChannel.appendLine('🚀 Extension deactivated'); }
