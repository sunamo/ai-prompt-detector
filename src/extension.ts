import * as vscode from 'vscode';
import { log, logError, validateRecentLogs, clearLogFile } from './logging';
import { loadHistory, incPrompt, getSession } from './datastore';

let workspaceRoot: string | undefined;

const PROMPT_COMMAND_PREFIXES = ['github.copilot', 'copilot.'];
const PROMPT_COMMAND_EXACT = [ 'workbench.action.chat.submit', 'workbench.action.chat.acceptChanges', 'workbench.action.chat.send', 'chat.submit', 'chat.send' ];
let lastPromptSig: string | undefined; let lastPromptTime = 0; const PROMPT_DEDUPE_WINDOW_MS = 0;
/**
 * CZ: Rozhodne, zda je příkaz považován za Copilot prompt (podle prefixu nebo přesného názvu).
 */
function isPromptCommand(command: string): boolean {
    if (PROMPT_COMMAND_EXACT.includes(command)) return true;
    if (command.startsWith('workbench.action.chat.')) return true; // širší chat akce
    return PROMPT_COMMAND_PREFIXES.some(p => command.startsWith(p));
}

/**
 * CZ: Zaznamená detekovaný prompt (inkrementuje čítač, aktualizuje status bar, zobrazí notifikaci).
 */
function recordPrompt(source: string, meta?: any) {
    const t0 = Date.now();
    incPrompt();
    const s = getSession();
    if (statusBar) {
        statusBar.text = `$(comment-discussion) AI Prompt: ${s.promptCount} | v${extensionVersion}`;
        statusBar.show();
    }
    updateStatusBar(); // okamžitě, bez queueMicrotask
    vscode.window.showInformationMessage(`Prompt #${s.promptCount}`);
    const dt = Date.now() - t0;
    out('Prompt detected', { source, count: s.promptCount, meta, dtMs: dt });
    log('debug', 'prompt recorded immediate', { source, count: s.promptCount, dtMs: dt });
}

/**
 * CZ: Obsluha Copilot příkazu (jen zaznamená prompt).
 */
function handleCopilotCommand(command: string) { try { recordPrompt('executeCommandPatch', { command }); } catch (e) { logError('handleCopilotCommand failed', e); out('handleCopilotCommand failed'); } }

// Removed legacy file-based functions

let statusBar: vscode.StatusBarItem | undefined;
let extensionVersion = '0.0.0';
/**
 * CZ: Inicializuje položku v status baru a nastaví počáteční text (verze + počet promptů).
 */
function initStatusBar(context: vscode.ExtensionContext) {
    try {
        if (!statusBar) {
            statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10000);
            statusBar.command = 'specstoryAutosave.showStatus';
            statusBar.tooltip = 'AI Prompt Detector – Copilot events only';
            context.subscriptions.push(statusBar);
            log('debug', 'status bar item created (left)'); out('status bar created');
        }
        try { const pkgVersion = context.extension.packageJSON?.version; if (typeof pkgVersion === 'string') extensionVersion = pkgVersion; } catch (e) { logError('version resolve failed', e); }
        const s = getSession();
        statusBar.text = `$(comment-discussion) AI Prompt: ${s.promptCount} | v${extensionVersion}`;
        statusBar.show();
    } catch (e) { logError('initStatusBar failed', e); out('initStatusBar failed'); }
}
/**
 * CZ: Aktualizuje text status baru dle aktuálního počtu promptů.
 */
function updateStatusBar() { if (!statusBar) return; const s = getSession(); statusBar.text = `$(comment-discussion) AI Prompt: ${s.promptCount} | v${extensionVersion}`; statusBar.show(); out('status bar update', { count: s.promptCount }); }

// New: onDidExecuteCommand listener (primary detection) – fallback to patch if not available
function installCommandListener(context: vscode.ExtensionContext) {
    const anyCommands: any = vscode.commands as any;
    if (typeof anyCommands.onDidExecuteCommand === 'function') {
        const disp = anyCommands.onDidExecuteCommand((ev: { command: string }) => {
            try {
                if (isPromptCommand(ev.command)) {
                    log('debug', 'onDidExecuteCommand match', { cmd: ev.command });
                    recordPrompt('onDidExecuteCommand', { command: ev.command });
                }
            } catch (e) { logError('onDidExecuteCommand handler failed', e); out('onDidExecuteCommand handler failed'); }
        });
        context.subscriptions.push(disp);
        log('debug', 'onDidExecuteCommand listener installed');
    } else {
        // Fallback patch
        const orig = vscode.commands.executeCommand;
        (vscode.commands as any).executeCommand = async function(command: string, ...rest: any[]) {
            try { if (isPromptCommand(command)) { log('debug', 'executeCommand patch match', { cmd: command }); recordPrompt('executeCommandPatch', { command }); } } catch (e) { logError('executeCommand hook error', e); }
            return orig.apply(this, [command, ...rest]);
        };
        context.subscriptions.push({ dispose: () => { (vscode.commands as any).executeCommand = orig; } });
        log('debug', 'executeCommand patch installed (fallback)');
    }
}

let outputChannel: vscode.OutputChannel | undefined;
/**
 * CZ: Zajistí vytvoření a zobrazení výstupního kanálu pro ladicí výpisy.
 */
function ensureOutputChannel() { if (!outputChannel) { outputChannel = vscode.window.createOutputChannel('AI Prompt Detector'); outputChannel.appendLine('[startup] output channel initialized'); outputChannel.show(true); } }
/**
 * CZ: Zapíše zprávu (volitelně s daty) do výstupního kanálu.
 */
function out(msg: string, data?: any) { if (!outputChannel) return; const line = `[${new Date().toISOString()}] ${msg}` + (data ? ' ' + safeJson(data) : ''); outputChannel.appendLine(line); }
/**
 * CZ: Bezpečně serializuje objekt do JSON (fallback na String při chybě).
 */
function safeJson(o: any) { try { return JSON.stringify(o); } catch { return String(o); } }

let chatDocState = new Map<string, { lastText: string; lastPromptTime: number }>();
const CHAT_DOC_DEDUPE_MS = 150; // reduced for faster successive detection

/**
 * CZ: Aktivace rozšíření – připraví výstup, status bar, načte historii a nasadí hooky.
 */
export async function activate(context: vscode.ExtensionContext) {
    clearLogFile();
    ensureOutputChannel();
    out('activate start');
    log('debug', 'activate start');
    initStatusBar(context);
    try { validateRecentLogs(); } catch (e) { logError('log validation failed', e); out('log validation failed'); }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) { workspaceRoot = root; loadHistory(root); updateStatusBar(); }
    installCommandListener(context);
    context.subscriptions.push(vscode.commands.registerCommand('specstoryAutosave.showStatus', () => { try { const s = getSession(); vscode.window.showInformationMessage(`Copilot prompts this session: ${s.promptCount}. History loaded: ${s.prompts.length}`); out('showStatus', s); } catch (e) { logError('showStatus failed', e); out('showStatus failed'); } }));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
        try {
            const doc = ev.document;
            const id = doc.uri.toString();
            const scheme = doc.uri.scheme;
            const lang = doc.languageId || '';
            const file = doc.fileName || '';
            const qualifies = scheme.includes('chat') || file.toLowerCase().includes('copilot') || lang.includes('chat') || lang.includes('copilot');
            if (!qualifies) return;
            let state = chatDocState.get(id);
            if (!state) { state = { lastText: doc.getText(), lastPromptTime: 0 }; chatDocState.set(id, state); }
            const oldText = state.lastText;
            const newText = doc.getText();
            const now = Date.now();
            const rec = (reason: string, extra?: any) => {
                if (now - state!.lastPromptTime < CHAT_DOC_DEDUPE_MS) return; // tighter per-doc dedupe window
                recordPrompt(reason, { doc: id, ...extra });
                state!.lastPromptTime = now;
            };
            // Heuristic 1: explicit newline typed (often submission by Enter key)
            if (ev.contentChanges.some(c => c.text.includes('\n'))) {
                rec('chat-doc-newline', { oldLen: oldText.length, newLen: newText.length });
            } else {
                // Heuristic 2: content cleared after being non-empty (covers button send even for short prompts)
                if (oldText.length > 0 && newText.length === 0) {
                    rec(oldText.length <= 5 ? 'chat-doc-clear-small' : 'chat-doc-clear', { oldLen: oldText.length });
                }
                // Heuristic 3: large truncation (e.g., Copilot cleared input but not fully)
                else if (oldText.length > 20 && newText.length < oldText.length / 4) { // lowered threshold from 40 to 20 for sensitivity
                    rec('chat-doc-truncate', { oldLen: oldText.length, newLen: newText.length });
                }
            }
            state.lastText = newText;
        } catch (e) { logError('enhanced chat heuristic failed', e); out('enhanced chat heuristic failed'); }
    }));
    out('activate complete');
    log('debug', 'activate complete');
}

/**
 * CZ: Deaktivace rozšíření – pouze loguje.
 */
export function deactivate() { log('debug', 'deactivate'); }
