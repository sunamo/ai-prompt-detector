import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs'; // added for file logging
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { startAutoSave, createAutoSaveDisposable } from './autoSave';
import { initLogger, info } from './logger';
import { setupChatResponseWatcher } from './chatResponseWatcher';
import { registerChatApiHook } from './chatApiHook';
import { runtime } from './runtime';
import { finalizePrompt as externalFinalizePrompt } from './finalize';
import { registerCommandListener } from './commandListener';
import { SOURCE_DIR_COPILOT, SOURCE_DIR_VSCODE, LOG_DIR } from './constants';
import { focusChatInput, forwardToChatAccept, getChatInputText, captureChatInputSilently } from './chatHelpers';
import { startDetectionTimers } from './detectionTimers';

let outputChannel: vscode.OutputChannel; // legacy local retained for minimal change
let recentPrompts: string[] = state.recentPrompts;
let aiPromptCounter = 0;
let statusBarItem: vscode.StatusBarItem;
let chatInputBuffer = '';
let lastEnterSubmitAt = 0;
const explicitSubmitCommands = new Set([
	'github.copilot.chat.acceptInput','github.copilot.chat.submit','github.copilot.chat.send','github.copilot.chat.sendMessage',
	'workbench.action.chat.acceptInput','workbench.action.chat.submit','workbench.action.chat.submitWithoutDispatching','workbench.action.chat.submitWithCodebase','workbench.action.chat.sendToNewChat','workbench.action.chat.createRemoteAgentJob','workbench.action.chat.executeSubmit','workbench.action.chat.send','workbench.action.chat.sendMessage',
	'chat.acceptInput','inlineChat.accept','interactive.acceptInput'
]);
let providerRef: PromptsProvider | undefined;
let lastNonEmptySnapshot = '';
let lastSubmittedText = '';
let lastFinalizeAt = 0;
const chatDocState = new Map<string,string>();
let lastEditorPollText = '';
let lastBufferChangedAt = Date.now();
// Use external finalize (shows prompt snippet)
const finalize = externalFinalizePrompt;

// Lightweight finalize wrapper also used by heuristic watcher
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
		const cfg = vscode.workspace.getConfiguration('specstory-autosave');
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
	// Daily log file handling (clear on each activation)
	try {
		const logDir = LOG_DIR; // reference constant so it is tracked
		if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
		const today = new Date().toISOString().slice(0,10);
		const dailyLogPath = path.join(logDir, `extension-${today}.log`);
		fs.writeFileSync(dailyLogPath, ''); // clear file
		const origAppend = outputChannel.appendLine.bind(outputChannel);
		outputChannel.appendLine = (v: string) => { origAppend(v); try { fs.appendFileSync(dailyLogPath, `[${new Date().toISOString()}] ${v}\n`); } catch {} };
		outputChannel.appendLine(`🧹 Cleared daily log file ${dailyLogPath}`);
	} catch {}
	outputChannel.appendLine('🚀 ACTIVATION: Extension starting...');
	outputChannel.appendLine(`REFS SRC ${SOURCE_DIR_COPILOT} | ${SOURCE_DIR_VSCODE} | LOG ${LOG_DIR}`); // activation reference line

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
	runtime.providerRef = providerRef; runtime.outputChannel = outputChannel;

	setTimeout(async () => {
		try { await vscode.commands.executeCommand('workbench.view.extension.specstory-activity'); } catch (e) { outputChannel.appendLine(`⚠️ view open fallback only: ${e}`); }
	}, 400);

	// Setup heuristic watcher (additive)
	setupChatResponseWatcher(context, doFinalize);
	registerChatApiHook(context, doFinalize);
	registerCommandListener(context);
	startDetectionTimers(context);

	// helpers imported now (previous local implementations removed)

	context.subscriptions.push(vscode.commands.registerCommand('specstory-autosave.forwardEnterToChat', async () => {
		try {
			outputChannel.appendLine('🧪 forwardEnterToChat start');
			// Capture multiple sources BEFORE sending (chat will clear afterwards)
			const rawDirect = await getChatInputText();
			const rawSilent = await captureChatInputSilently();
			const buf = runtime.chatInputBuffer;
			const lastSnap = runtime.lastNonEmptySnapshot;
			let snapshotCandidates = [rawDirect, rawSilent, buf, lastSnap].filter((v): v is string => !!v && v.trim().length > 0);
			// Choose longest (most complete) snapshot
			let text = snapshotCandidates.sort((a,b)=>b.length-a.length)[0] || '';
			if (text) { runtime.chatInputBuffer = text; runtime.lastNonEmptySnapshot = text; }
			outputChannel.appendLine(`🧪 snapshot pre-send len=${text.length}`);
			await focusChatInput(); runtime.lastEnterSubmitAt = Date.now(); lastEnterSubmitAt = runtime.lastEnterSubmitAt;
			await forwardToChatAccept();
			// Immediate finalize with captured snapshot
			setTimeout(() => { const finalSnap = text || runtime.chatInputBuffer || runtime.lastNonEmptySnapshot || ''; outputChannel.appendLine(`🧪 finalize enter-forward primary len=${finalSnap.length}`); externalFinalizePrompt('enter-forward', finalSnap); }, 12);
			// Safety late finalize if first snapshot was empty but later snapshot appears
			if (!text) { setTimeout(()=>{ const late = runtime.lastNonEmptySnapshot || runtime.chatInputBuffer || ''; if (late.trim()) { outputChannel.appendLine(`🧪 late snapshot finalize len=${late.length}`); externalFinalizePrompt('enter-forward-late', late); } }, 60); }
		} catch (e) { outputChannel.appendLine(`❌ Error in forwardEnterToChat: ${e}`); }
	}));

	const commandsAny = vscode.commands as any;
	if (typeof commandsAny?.onDidExecuteCommand === 'function') {
		outputChannel.appendLine('🛰️ Command listener active');
		context.subscriptions.push(commandsAny.onDidExecuteCommand((ev: any) => {
			try { const cmd = ev?.command as string | undefined; if (!cmd) return; if (cmd.includes('copilot') || cmd.includes('chat')) outputChannel.appendLine(`🔎 CMD: ${cmd}`); if (cmd === 'type') { const t = ev?.args?.[0]?.text as string | undefined; if (!t || t.includes('\n')) return; chatInputBuffer += t; lastBufferChangedAt = Date.now(); lastNonEmptySnapshot = chatInputBuffer; return; } if (cmd === 'editor.action.clipboardPasteAction') { vscode.env.clipboard.readText().then(txt => { chatInputBuffer += txt; lastBufferChangedAt = Date.now(); lastNonEmptySnapshot = chatInputBuffer; }); return; } if (cmd === 'deleteLeft') { if (chatInputBuffer) { chatInputBuffer = chatInputBuffer.slice(0, -1); lastBufferChangedAt = Date.now(); lastNonEmptySnapshot = chatInputBuffer; } return; } if (cmd === 'cut' || cmd === 'editor.action.clipboardCutAction' || cmd === 'cancelSelection') { chatInputBuffer = ''; lastBufferChangedAt = Date.now(); return; } const lower = cmd.toLowerCase(); const heuristicSubmit = lower.includes('chat') && (lower.includes('accept') || lower.includes('submit') || lower.includes('send') || lower.includes('execute') || lower.includes('dispatch')); const now = Date.now(); if (explicitSubmitCommands.has(cmd) || heuristicSubmit) { if (now - lastEnterSubmitAt > 100 && now - lastFinalizeAt > 100) setTimeout(() => finalizePrompt(`command:${cmd}`), 30); return; } if ((cmd.startsWith('github.copilot.') || lower.includes('chat')) && now - lastEnterSubmitAt > 120) { if (!/focus|copy|select|type|status|help|acceptinput/i.test(cmd) && (chatInputBuffer.trim() || lastNonEmptySnapshot)) setTimeout(() => finalizePrompt(`fallback:${cmd}`), 50); } } catch (e) { outputChannel.appendLine(`❌ onDidExecuteCommand handler error: ${e}`); }
		}));
	}

	// NEW: log any Copilot/Chat related document open (response appears) -> finalize if pending
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => {
		try {
			const name = doc.fileName.toLowerCase();
			if (/(copilot|chat)/.test(name)) {
				outputChannel.appendLine(`📄 OPEN doc=${path.basename(doc.fileName)} len=${doc.getText().length} lang=${doc.languageId}`);
				// If we have a buffered prompt not yet finalized, finalize now (button likely used)
				if ((chatInputBuffer.trim() || lastNonEmptySnapshot) && Date.now() - lastFinalizeAt > 120) {
					finalizePrompt('open-doc');
				}
			}
		} catch {}
	}));

	// Strengthen change listener: always log when chat doc transitions to empty
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
		try {
			const doc = ev.document; const name = doc.fileName.toLowerCase(); if (!(name.includes('copilot') || name.includes('chat'))) return;
			const id = doc.uri.toString(); const prev = chatDocState.get(id) || ''; const curr = doc.getText();
			if (curr.trim()) { chatDocState.set(id, curr); }
			if (prev && !curr.trim()) {
				outputChannel.appendLine(`🧹 CLEAR doc=${path.basename(doc.fileName)} prevLen=${prev.length}`);
				if (Date.now() - lastFinalizeAt > 120) { lastNonEmptySnapshot = prev; finalizePrompt('doc-clear2', prev); }
			}
		} catch {}
	}));

	let pollTimer: NodeJS.Timeout | undefined; let lastPollHadText = false; let forceSnapshotTimer: NodeJS.Timeout | undefined;
	if (!pollTimer) {
		pollTimer = setInterval(async () => { try { const current = await captureChatInputSilently(); if (current) { lastNonEmptySnapshot = current; lastPollHadText = true; lastEditorPollText = current; } else { if (lastEditorPollText && !current) { // transition non-empty -> empty in editor
				// If internal buffer still holds text we likely had a button submission
				if (chatInputBuffer.trim() && Date.now() - lastFinalizeAt > 140) {
					outputChannel.appendLine('🧲 Heuristic: editor cleared while buffer still has text (button send?)');
					await finalizePrompt('editor-clear-buffer');
				}
			}
			if (lastPollHadText && lastNonEmptySnapshot && Date.now() - lastFinalizeAt > 140) { await finalizePrompt('poll-clear'); }
			lastPollHadText = false; lastEditorPollText = current; } } catch {} }, 150);
		context.subscriptions.push({ dispose: () => { if (pollTimer) clearInterval(pollTimer); if (forceSnapshotTimer) clearInterval(forceSnapshotTimer); } });
		forceSnapshotTimer = setInterval(async () => { try { if (!lastNonEmptySnapshot && chatInputBuffer.trim().length > 2) { const txt = await getChatInputText(); if (txt) { lastNonEmptySnapshot = txt; outputChannel.appendLine('🧪 Forced snapshot captured'); } } } catch {} }, 800);
	}

	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	watcher.onDidCreate(uri => { if (isValidSpecStoryFile(uri.fsPath)) { outputChannel.appendLine(`📝 New SpecStory file: ${path.basename(uri.fsPath)}`); loadPromptsFromFile(uri.fsPath, recentPrompts); providerRef?.refresh(); } });
	const configWatcher = vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('specstory-autosave.maxPrompts')) providerRef?.refresh(); });
	startAutoSave();
	const autoSaveDisposable = createAutoSaveDisposable();
	context.subscriptions.push(registration, watcher, configWatcher, statusBarItem, autoSaveDisposable);
	outputChannel.appendLine(`🚀 PROMPTS: Activation complete - total ${recentPrompts.length} prompts`);

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(ed => { try { if (!ed) return; if (!(ed.document.fileName.toLowerCase().includes('copilot') || ed.document.fileName.toLowerCase().includes('chat'))) { if (chatInputBuffer.trim()) finalizePrompt('focus-change', chatInputBuffer.trim()); chatInputBuffer = ''; } } catch {} }));
}

async function loadExistingPrompts(): Promise<void> { outputChannel.appendLine('🔍 Searching for existing SpecStory files...'); const files = await vscode.workspace.findFiles('**/.specstory/history/*.md'); outputChannel.appendLine(`📊 Found ${files.length} SpecStory files`); if (files.length === 0) { recentPrompts.push('Welcome to SpecStory AutoSave + AI Copilot Prompt Detection', 'TEST: Dummy prompt for demonstration'); return; } const sorted = files.sort((a, b) => path.basename(b.fsPath).localeCompare(path.basename(a.fsPath))); sorted.forEach(f => { if (isValidSpecStoryFile(f.fsPath)) loadPromptsFromFile(f.fsPath, recentPrompts); }); outputChannel.appendLine(`✅ Total loaded ${recentPrompts.length} prompts from ${sorted.length} files`); }

export function deactivate() { outputChannel.appendLine('🚀 DEACTIVATION: Extension shutting down'); outputChannel.appendLine('🚀 Extension deactivated'); }
