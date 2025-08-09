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
let lastEnterSubmitAt = 0;
let providerRef: PromptsProvider | undefined;
let lastNonEmptySnapshot = '';
let lastSubmittedText = '';
let lastFinalizeAt = 0;
const chatDocState = new Map<string,string>();
let lastEditorPollText = '';
let lastBufferChangedAt = Date.now();

// Lehký obal pro finalize funkci používaný také heuristickým pozorovatelem
function doFinalize(source: string, directText?: string) { externalFinalizePrompt(source, directText); }

async function finalizePrompt(source: string, directText?: string) {
	try {
		let txt = (directText || chatInputBuffer || lastNonEmptySnapshot).trim();
		if (!txt) return;
		if (txt === lastSubmittedText) { outputChannel.appendLine(`ℹ️ Skipped duplicate finalize (${source})`); return; }
		lastSubmittedText = txt;
		recentPrompts.unshift(txt);
		if (recentPrompts.length > 1000) recentPrompts.splice(1000);
		chatInputBuffer = '';
		aiPromptCounter++;
		lastFinalizeAt = Date.now();
		const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
		const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
		vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`);
		providerRef?.refresh();
		outputChannel.appendLine(`🛎️ Detected submit via ${source} | chars=${txt.length}`);
		outputChannel.appendLine(`REFS SRC ${SOURCE_DIR_COPILOT} | ${SOURCE_DIR_VSCODE} | LOG ${LOG_DIR}`); // visible reference line
	} catch (e) { outputChannel.appendLine(`❌ finalizePrompt error: ${e}`); }
}

export async function activate(context: vscode.ExtensionContext) {
	initLogger();
	outputChannel = vscode.window.createOutputChannel('SpecStory Prompts');
	info('🚀 ACTIVATION: Extension starting...');
	// Zpracování denních log souborů (vymazat při každé aktivaci)
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

	// Nastavení: pouze chat API hook + ruční Enter forward. Všechny heuristiky (watchery, polling, silence timers) odstraněny.
	registerChatApiHook(context, doFinalize);

	context.subscriptions.push(vscode.commands.registerCommand('ai-prompt-detector.forwardEnterToChat', async () => {
		try {
			let text = await getChatInputText();
			if (!text) text = chatInputBuffer.trim();
			if (text) {
				recentPrompts.unshift(text);
				if (recentPrompts.length > 1000) recentPrompts.splice(1000);
				providerRef?.refresh();
				lastSubmittedText = text;
			}
			chatInputBuffer = '';
			await focusChatInput();
			lastEnterSubmitAt = Date.now();
			const ok = await forwardToChatAccept();
			if (ok) {
				aiPromptCounter++;
				providerRef?.refresh();
			}
			const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
			const msg = cfg.get<string>('customMessage', '') || 'We will verify quality & accuracy.';
			setTimeout(() => { providerRef?.refresh(); vscode.window.showInformationMessage(`AI Prompt sent\n${msg}`); }, 10);
		} catch (e) { outputChannel.appendLine(`❌ Error in forwardEnterToChat: ${e}`); }
	}));
	// Odstraněno: command listener, document open/change watch, polling interval, forced snapshot, detection timers.
	// Zachován jen file watcher pro SpecStory soubory.
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	watcher.onDidCreate(uri => { if (isValidSpecStoryFile(uri.fsPath)) { outputChannel.appendLine(`📝 New SpecStory file: ${path.basename(uri.fsPath)}`); loadPromptsFromFile(uri.fsPath, recentPrompts); providerRef?.refresh(); } });
	const configWatcher = vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('ai-prompt-detector.maxPrompts')) providerRef?.refresh(); });
	context.subscriptions.push(registration, watcher, configWatcher, statusBarItem);
	outputChannel.appendLine(`🚀 PROMPTS: Activation complete - total ${recentPrompts.length} prompts`);

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(ed => { try { if (!ed) return; if (!(ed.document.fileName.toLowerCase().includes('copilot') || ed.document.fileName.toLowerCase().includes('chat'))) { if (chatInputBuffer.trim()) finalizePrompt('focus-change', chatInputBuffer.trim()); chatInputBuffer = ''; } } catch {} }));
}

async function loadExistingPrompts(): Promise<void> { outputChannel.appendLine('🔍 Searching for existing SpecStory files...'); const files = await vscode.workspace.findFiles('**/.specstory/history/*.md'); outputChannel.appendLine(`📊 Found ${files.length} SpecStory files`); if (files.length === 0) { recentPrompts.push('Welcome to AI Prompt Detector + AI Copilot Prompt Detection', 'TEST: Dummy prompt for demonstration'); return; } const sorted = files.sort((a, b) => path.basename(b.fsPath).localeCompare(path.basename(a.fsPath))); sorted.forEach(f => { if (isValidSpecStoryFile(f.fsPath)) loadPromptsFromFile(f.fsPath, recentPrompts); }); outputChannel.appendLine(`✅ Total loaded ${recentPrompts.length} prompts from ${sorted.length} files`); }

export function deactivate() { outputChannel.appendLine('🚀 DEACTIVATION: Extension shutting down'); outputChannel.appendLine('🚀 Extension deactivated'); }
