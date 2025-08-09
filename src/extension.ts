import * as vscode from 'vscode';
import * as path from 'path';
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { initLogger, info, debug } from './logger';
import { focusChatInput, forwardToChatAccept, getChatInputText } from './chatHelpers';

// --- Stav ---
let statusBarItem: vscode.StatusBarItem;
let providerRef: PromptsProvider | undefined;
let lastSubmittedText = '';
let aiPromptCounter = 0;
let typingBuffer = '';
let lastSnapshot = '';
let lastTypingChangeAt = Date.now();
let dynamicSendCommands = new Set<string>();
let debugEnabled = false;
let snapshotTimer: NodeJS.Timeout | undefined;

/**
 * Aktualizuje interní příznak zda jsou povoleny debug logy.
 */
function refreshDebugFlag() {
	debugEnabled = vscode.workspace.getConfiguration('ai-prompt-detector').get<boolean>('enableDebugLogs', false) ?? false;
}

/**
 * Rekurzivně prochází exporty Copilot Chat a pokouší se připojit k eventům submit.
 * @param recordPrompt Callback k uložení promptu.
 */
async function hookCopilotExports(recordPrompt: (raw: string, src: string) => boolean) {
	try {
		const ext = vscode.extensions.getExtension('GitHub.copilot-chat') || vscode.extensions.getExtension('github.copilot-chat');
		if (!ext) { debug('Copilot Chat extension not found'); return; }
		if (!ext.isActive) { await ext.activate(); }
		const visited = new Set<any>();
		const scan = (obj: any, depth = 0) => {
			if (!obj || typeof obj !== 'object' || visited.has(obj) || depth > 6) return;
			visited.add(obj);
			for (const k of Object.keys(obj)) {
				const v = (obj as any)[k];
				try {
					if (/submit|send|accept/i.test(k) && v && typeof v === 'object' && typeof (v as any).event === 'function') {
						(v as any).event((e: any) => {
							try {
								const txt = String(e?.message || e?.prompt || e?.request?.message || e?.request?.prompt || '').trim();
								if (txt) { if (recordPrompt(txt, 'copilot-exports')) debug('Captured via Copilot exports: ' + k); }
							} catch (err) { debug('exports event err ' + err); }
						});
						debug('Hooked export event: ' + k);
					}
				} catch {}
				if (typeof v === 'object') scan(v, depth + 1);
			}
		};
		scan(ext.exports);
	} catch (e) { debug('hookCopilotExports err ' + e); }
}

/**
 * Aktivace rozšíření – registrace všech listenerů a inicializace UI.
 */
export async function activate(context: vscode.ExtensionContext) {
	initLogger();
	info('Activation start');
	refreshDebugFlag();

	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);
	statusBarItem.show();

	/** Aktualizuje text ve status baru. */
	const updateStatusBar = () => {
		const v =
			vscode.extensions.getExtension('sunamocz.ai-prompt-detector')
				?.packageJSON.version || '1.x';
		statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter} | v${v}`;
	};

	/** Uloží prompt do stavu, vždy započítá i opakovaný (již poslaný) text.
	 * Původní kontrola na duplikát byla odstraněna, aby šel počet navyšovat i při identických vstupech.
	 */
	const recordPrompt = (raw: string, source: string): boolean => {
		const text = (raw || '').trim();
		if (!text) return false; // prázdné nic neukládáme
		lastSubmittedText = text; // stále uchováme poslední (může se hodit pro další logiku)
		state.recentPrompts.unshift(text);
		if (state.recentPrompts.length > 1000) state.recentPrompts.splice(1000);
		aiPromptCounter++;
		providerRef?.refresh();
		updateStatusBar();
		typingBuffer = '';
		lastSnapshot = '';
		const msg = vscode.workspace.getConfiguration('ai-prompt-detector').get<string>('customMessage', '') || 'We will verify quality & accuracy.';
		const notify = () => vscode.window.showInformationMessage(`AI Prompt sent (${source})\n${msg}`);
		// Enter varianta bez zpoždění, ostatní se zpožděním
		if (source.startsWith('enter')) notify(); else setTimeout(notify, 250);
		debug(`recordPrompt ok src=${source} len=${text.length} (duplicates allowed)`);
		return true;
	};

	// Periodický snapshot pro případ kdy text není zachycen přes type eventy.
	if (!snapshotTimer) {
		snapshotTimer = setInterval(async () => {
			try {
				const txt = await getChatInputText();
				if (txt && txt !== typingBuffer) {
					lastSnapshot = txt;
				}
			} catch {}
		}, 1200);
		context.subscriptions.push({ dispose: () => snapshotTimer && clearInterval(snapshotTimer) });
	}

	updateStatusBar();

	await loadExistingPrompts();
	providerRef = new PromptsProvider();
	const registration = vscode.window.registerWebviewViewProvider(
		PromptsProvider.viewType,
		providerRef
	);

	hookCopilotExports(recordPrompt);

	// Chat API listener
	try {
		const chatNs: any = (vscode as any).chat;
		if (chatNs?.onDidSubmitRequest) {
			context.subscriptions.push(
				chatNs.onDidSubmitRequest((e: any) => {
					try {
						const txt = String(
							e?.request?.message ||
							e?.request?.prompt ||
							e?.prompt ||
							''
						).trim();
						if (recordPrompt(txt, 'chatApi')) debug('chatApi captured');
					} catch (err) {
						debug('chat api err ' + err);
					}
				})
			);
		}
	} catch (e) {
		debug('chat api init err ' + e);
	}

	// Command listener + heuristika
	try {
		const cmdsAny = vscode.commands as any;
		if (cmdsAny?.onDidExecuteCommand) {
			const sendCommands = new Set([
				'github.copilot.chat.acceptInput',
				'github.copilot.chat.send',
				'github.copilot.chat.sendMessage',
				'github.copilot.chat.submit',
				'github.copilot.chat.executeSubmit',
				'github.copilot.chat.inlineSubmit',
				'github.copilot.interactive.submit',
				'github.copilot.interactive.acceptInput',
				'workbench.action.chat.acceptInput',
				'workbench.action.chat.submit',
				'workbench.action.chat.executeSubmit',
				'workbench.action.chat.submitWithCodebase',
				'workbench.action.chat.submitWithoutDispatching',
				'workbench.action.chat.send',
				'workbench.action.chat.sendMessage',
				'workbench.action.chat.sendToNewChat',
				'workbench.action.chatEditor.acceptInput',
				'chat.acceptInput',
				'inlineChat.accept',
				'interactive.acceptInput'
			]);
			context.subscriptions.push(
				cmdsAny.onDidExecuteCommand(async (ev: any) => {
					try {
						const cmd = ev?.command as string;
						if (!cmd) return;
						if (debugEnabled) debug('CMD ' + cmd);
						if (cmd === 'type') {
							const t = ev?.args?.[0]?.text;
							if (t && !String(t).includes('\n')) {
								typingBuffer += t;
								lastTypingChangeAt = Date.now();
								if (typingBuffer.length > 8000)
									typingBuffer = typingBuffer.slice(-8000);
							}
							return;
						}
						if (cmd === 'deleteLeft') {
							typingBuffer = typingBuffer.slice(0, -1);
							lastTypingChangeAt = Date.now();
							return;
						}
						if (cmd === 'editor.action.clipboardPasteAction') {
							try {
								const clip = await vscode.env.clipboard.readText();
								if (clip) {
									typingBuffer += clip;
									lastTypingChangeAt = Date.now();
								}
							} catch {}
							return;
						}
						const lower = cmd.toLowerCase();
						const heuristicMatch =
							!sendCommands.has(cmd) &&
							(lower.includes('copilot') || lower.includes('chat')) &&
							(lower.includes('submit') ||
								lower.includes('send') ||
								lower.includes('accept'));
						if (heuristicMatch) {
							debug('Heuristic SEND command detected: ' + cmd);
							sendCommands.add(cmd);
						}
						if (
							!sendCommands.has(cmd) &&
							!heuristicMatch &&
							typingBuffer.trim().length > 0
						) {
							setTimeout(() => {
								if (!typingBuffer.trim()) {
									dynamicSendCommands.add(cmd);
									debug('Dynamic SEND detected & added: ' + cmd);
								}
							}, 40);
						}
						if (
							sendCommands.has(cmd) ||
							heuristicMatch ||
							dynamicSendCommands.has(cmd)
						) {
							const immediate = typingBuffer.trim() || lastSnapshot;
							if (immediate) {
								recordPrompt(
									immediate,
									typingBuffer.trim()
										? heuristicMatch
											? 'heuristic-buffer'
											: dynamicSendCommands.has(cmd)
											? 'dynamic-buffer'
											: 'cmd-buffer'
										: 'snapshot'
								);
							} else {
								setTimeout(async () => {
									try {
										const snap = await getChatInputText();
										if (
											!recordPrompt(
												snap,
												dynamicSendCommands.has(cmd)
													? 'dynamic-cmd'
													: heuristicMatch
													? 'heuristic-cmd'
													: 'cmd'
											)
										) {
											if (lastSnapshot)
												recordPrompt(lastSnapshot, 'snapshot-late');
										}
									} catch (e2) {
										debug('post-send capture err ' + e2);
									}
								}, 25);
							}
						}
					} catch (err) {
						debug('cmd hook err ' + err);
					}
				})
			);
		}
	} catch (e) {
		debug('cmd hook init err ' + e);
	}

	/** Zpracování Enter (varianty) – pokusí se získat text a pak spustí jeden z akceptačních příkazů. */
	const handleForwardEnter = async (variant: string) => {
		try {
			debug('Enter variant invoked: ' + variant);
			let text = await getChatInputText();
			if (text) recordPrompt(text, 'enter-' + variant);
			else if (typingBuffer.trim()) recordPrompt(typingBuffer, 'enter-buffer-' + variant);
			else if (lastSnapshot) recordPrompt(lastSnapshot, 'enter-snapshot-' + variant);
			await focusChatInput();
			let ok = await forwardToChatAccept();
			if (!ok) {
				for (const id of [
					'github.copilot.chat.acceptInput',
					'github.copilot.chat.send',
					'github.copilot.chat.submit',
					'github.copilot.interactive.submit',
					'workbench.action.chat.acceptInput',
					'workbench.action.chat.submit',
					'workbench.action.chatEditor.acceptInput'
				]) {
					try { await vscode.commands.executeCommand(id); ok = true; break; } catch {}
				}
			}
			if (ok && !text && !typingBuffer.trim() && !lastSnapshot) recordPrompt('(empty prompt)', 'enter-empty-' + variant);
		} catch (e) {
			debug('forward err ' + e);
		}
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('ai-prompt-detector.forwardEnterToChat', () => handleForwardEnter('ctrl')),
		vscode.commands.registerCommand('ai-prompt-detector.forwardEnterPlain', () => handleForwardEnter('plain')),
		vscode.commands.registerCommand('ai-prompt-detector.forwardEnterCtrlShift', () => handleForwardEnter('ctrl-shift')),
		vscode.commands.registerCommand('ai-prompt-detector.forwardEnterCtrlAlt', () => handleForwardEnter('ctrl-alt'))
	);

	// SpecStory watcher + konfigurace
	const watcher = vscode.workspace.createFileSystemWatcher(
		'**/.specstory/history/*.md'
	);
	watcher.onDidCreate((uri) => {
		if (isValidSpecStoryFile(uri.fsPath)) {
			loadPromptsFromFile(uri.fsPath, state.recentPrompts);
			providerRef?.refresh();
		}
	});
	const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('ai-prompt-detector.maxPrompts'))
			providerRef?.refresh();
		if (e.affectsConfiguration('ai-prompt-detector.enableDebugLogs'))
			refreshDebugFlag();
	});

	context.subscriptions.push(
		registration,
		watcher,
		configWatcher,
		statusBarItem
	);
	info('Activation done');
}

/**
 * Načte existující prompty ze souborů (používá glob).
 */
async function loadExistingPrompts() {
	const files = await vscode.workspace.findFiles(
		'**/.specstory/history/*.md'
	);
	if (!files.length) {
		state.recentPrompts.push(
			'Welcome to AI Copilot Prompt Detector',
			'TEST: Dummy prompt for demonstration'
		);
		return;
	}
	const sorted = files.sort((a, b) =>
		path.basename(b.fsPath).localeCompare(path.basename(a.fsPath))
	);
	for (const f of sorted)
		if (isValidSpecStoryFile(f.fsPath))
			loadPromptsFromFile(f.fsPath, state.recentPrompts);
}

/**
 * Deaktivace – pouze info log.
 */
export function deactivate() {
	info('Deactivation');
}
