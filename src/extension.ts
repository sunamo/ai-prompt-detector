import * as vscode from 'vscode';
import { log, logError, validateRecentLogs, clearLogFile } from './logging';
import { loadHistory, incPrompt, getSession } from './datastore';

let workspaceRoot: string | undefined;

const PROMPT_COMMAND_PREFIXES = ['github.copilot', 'copilot.'];
const PROMPT_COMMAND_EXACT = [ 'workbench.action.chat.submit', 'workbench.action.chat.acceptChanges', 'workbench.action.chat.send', 'chat.submit', 'chat.send' ];
// Additional Copilot chat related commands discovered / potential
const PROMPT_COMMAND_EXTRA = [
    'github.copilot.chat.submit',
    'github.copilot.chat.send',
    'github.copilot.chat.acceptChanges',
    'github.copilot.generate',
    'github.copilot.inlineChat.acceptChanges'
];
let logAllCopilotCommands = true; // temporary verbose logging to discover command names

let lastPromptSig: string | undefined; let lastPromptTime = 0; const PROMPT_DEDUPE_WINDOW_MS = 0;
/**
 * CZ: Rozhodne, zda je příkaz považován za Copilot prompt (rozšířené heuristiky).
 */
function isPromptCommand(command: string): boolean {
    if (PROMPT_COMMAND_EXACT.includes(command)) return true;
    if (PROMPT_COMMAND_EXTRA.includes(command)) return true;
    if (command.startsWith('workbench.action.chat.')) return true;
    // Any cmd containing 'chat' and an action keyword
    if (/chat/i.test(command) && /(submit|send|accept|generate)/i.test(command)) return true;
    // Generic copilot prefix + action keyword
    if (PROMPT_COMMAND_PREFIXES.some(p => command.startsWith(p))) {
        return /(submit|send|accept|generate)/i.test(command) || command.endsWith('.chat');
    }
    return false;
}

/**
 * CZ: Zaznamená detekovaný prompt (inkrementuje čítač, aktualizuje status bar, zobrazí notifikaci / fallback).
 */
function recordPrompt(source: string, meta?: any) {
    const t0 = Date.now();
    try {
        incPrompt();
        const s = getSession();
        if (statusBar) {
            statusBar.text = `$(comment-discussion) AI Prompt: ${s.promptCount} | v${extensionVersion}`;
            statusBar.show();
        }
        updateStatusBar();
        try {
            vscode.window.showInformationMessage(`AI Prompt #${s.promptCount}`);
        } catch (e) {
            // Fallback: flash status bar if notifications blocked
            if (statusBar) {
                const orig = statusBar.text;
                statusBar.text = `$(bell) Prompt #${s.promptCount}`;
                setTimeout(() => { if (statusBar) statusBar.text = orig; }, 1200);
            }
            log('debug', 'notification fallback used', { err: String(e) });
        }
        const dt = Date.now() - t0;
        out('Prompt detected', { source, count: s.promptCount, meta, dtMs: dt });
        log('debug', 'prompt recorded immediate', { source, count: s.promptCount, dtMs: dt });
    } catch (e) {
        logError('recordPrompt failed', e); out('recordPrompt failed');
    }
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
        try { const pkgVersion = (context as any).extension.packageJSON?.version; if (typeof pkgVersion === 'string') extensionVersion = pkgVersion; } catch (e) { logError('version resolve failed', e); }
        const s = getSession();
        statusBar.text = `$(comment-discussion) AI Prompt: ${s.promptCount} | v${extensionVersion}`;
        statusBar.show();
    } catch (e) { logError('initStatusBar failed', e); out('initStatusBar failed'); }
}
/**
 * CZ: Aktualizuje text status baru dle aktuálního počtu promptů.
 */
function updateStatusBar() { if (!statusBar) return; const s = getSession(); statusBar.text = `$(comment-discussion) AI Prompt: ${s.promptCount} | v${extensionVersion}`; statusBar.show(); out('status bar update', { count: s.promptCount }); }

// Enhanced listener / fallback patch with raw logging for discovery
function installCommandListener(context: vscode.ExtensionContext) {
    const anyCommands: any = vscode.commands as any;
    if (typeof anyCommands.onDidExecuteCommand === 'function') {
        const disp = anyCommands.onDidExecuteCommand((ev: { command: string }) => {
            try {
                const cmd = ev.command;
                if (logAllCopilotCommands && (cmd.toLowerCase().includes('copilot') || cmd.toLowerCase().includes('chat'))) { out('CMD RAW', { cmd }); log('debug', 'cmd raw', { cmd }); }
                if (isPromptCommand(cmd)) { out('CMD MATCH', { cmd }); log('debug', 'onDidExecuteCommand match', { cmd }); recordPrompt('onDidExecuteCommand', { command: cmd }); }
            } catch (e) { logError('onDidExecuteCommand handler failed', e); out('onDidExecuteCommand handler failed'); }
        });
        context.subscriptions.push(disp);
        log('debug', 'onDidExecuteCommand listener installed');
    } else {
        const orig = vscode.commands.executeCommand;
        (vscode.commands as any).executeCommand = async function(command: string, ...rest: any[]) {
            try {
                const cmdLower = (command || '').toLowerCase();
                if (logAllCopilotCommands && (cmdLower.includes('copilot') || cmdLower.includes('chat'))) { out('CMD RAW', { cmd: command }); log('debug', 'cmd raw', { cmd: command }); }
                if (isPromptCommand(command)) { out('CMD MATCH', { cmd: command }); log('debug', 'executeCommand patch match', { cmd: command }); recordPrompt('executeCommandPatch', { command }); }
            } catch (e) { logError('executeCommand hook error', e); }
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
    // Manual test command
    context.subscriptions.push(vscode.commands.registerCommand('specstoryAutosave.testPrompt', () => { recordPrompt('manual-test', { manual: true }); }));
    // Lightweight newline heuristic (kept minimal now)
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
        try {
            const doc = ev.document;
            const scheme = doc.uri.scheme;
            const lang = doc.languageId || '';
            const file = doc.fileName || '';
            const qualifies = scheme.includes('chat') || file.toLowerCase().includes('copilot') || lang.includes('chat') || lang.includes('copilot');
            if (!qualifies) return;
            if (ev.contentChanges.some(c => c.text.includes('\n'))) {
                out('HEURISTIC NEWLINE', { file });
                recordPrompt('chat-doc-newline', { file });
            }
        } catch (e) { logError('newline heuristic failed', e); }
    }));
    out('activate complete');
    log('debug', 'activate complete');
}

/**
 * CZ: Deaktivace rozšíření – pouze loguje.
 */
export function deactivate() { log('debug', 'deactivate'); }
