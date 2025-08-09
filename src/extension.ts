import * as vscode from 'vscode';
import { log, logError, validateRecentLogs } from './logging';
import { loadHistory, incPrompt, getSession } from './datastore';

let workspaceRoot: string | undefined;

const PROMPT_COMMAND_PREFIXES = ['github.copilot', 'copilot.'];
const PROMPT_COMMAND_EXACT = [ 'workbench.action.chat.submit', 'workbench.action.chat.acceptChanges', 'workbench.action.chat.send', 'chat.submit', 'chat.send' ];
let lastPromptSig: string | undefined; let lastPromptTime = 0; const PROMPT_DEDUPE_WINDOW_MS = 0;
/**
 * CZ: Rozhodne, zda je příkaz považován za Copilot prompt (podle prefixu nebo přesného názvu).
 */
function isPromptCommand(command: string): boolean { if (PROMPT_COMMAND_EXACT.includes(command)) return true; return PROMPT_COMMAND_PREFIXES.some(p => command.startsWith(p)); }

/**
 * CZ: Zaznamená detekovaný prompt (inkrementuje čítač, aktualizuje status bar, zobrazí notifikaci).
 */
function recordPrompt(source: string, meta?: any) {
    incPrompt();
    const s = getSession();
    statusBar?.show();
    if (statusBar) statusBar.text = `$(comment-discussion) AI Prompt: ${s.promptCount} | v${extensionVersion}`;
    queueMicrotask(() => updateStatusBar());
    vscode.window.showInformationMessage(`Prompt #${s.promptCount}`);
    out('Prompt detected', { source, count: s.promptCount, meta });
}

/**
 * CZ: Obsluha Copilot příkazu (jen zaznamená prompt).
 */
function handleCopilotCommand(command: string) { try { recordPrompt('command', { command }); } catch (e) { logError('handleCopilotCommand failed', e); out('handleCopilotCommand failed'); } }

// Removed: handlePrompt, registerPromptWatcher, pollPromptFiles

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

/**
 * CZ: Hook (patch) na executeCommand pro zachycení Copilot příkazů ještě před jejich vykonáním.
 */
function hookCopilotCommands(context: vscode.ExtensionContext) {
    const orig = vscode.commands.executeCommand;
    (vscode.commands as any).executeCommand = async function(command: string, ...rest: any[]) {
        try { if (isPromptCommand(command)) { handleCopilotCommand(command); } } catch (e) { logError('executeCommand hook error', e); }
        return orig.apply(this, [command, ...rest]);
    };
    context.subscriptions.push({ dispose: () => { (vscode.commands as any).executeCommand = orig; } });
    log('debug', 'copilot command hook installed (executeCommand patch)');
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

/**
 * CZ: Aktivace rozšíření – připraví výstup, status bar, načte historii a nasadí hooky.
 */
export async function activate(context: vscode.ExtensionContext) {
    ensureOutputChannel();
    out('activate start');
    log('debug', 'activate start');
    initStatusBar(context);
    try { validateRecentLogs(); } catch (e) { logError('log validation failed', e); out('log validation failed'); }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) { workspaceRoot = root; loadHistory(root); updateStatusBar(); }
    hookCopilotCommands(context);
    context.subscriptions.push(vscode.commands.registerCommand('specstoryAutosave.showStatus', () => { try { const s = getSession(); vscode.window.showInformationMessage(`Copilot prompts this session: ${s.promptCount}. History loaded: ${s.prompts.length}`); out('showStatus', s); } catch (e) { logError('showStatus failed', e); out('showStatus failed'); } }));
    // Chat heuristic remains (still Copilot-related)
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => { try { const doc = ev.document; const scheme = doc.uri.scheme; if (scheme.includes('chat') || doc.fileName.includes('copilot') || doc.languageId.includes('chat')) { if (ev.contentChanges.some(c => c.text.includes('\n'))) { recordPrompt('chat-doc', { doc: doc.uri.toString() }); } } } catch (e) { logError('chat doc heuristic failed', e); out('chat heuristic failed'); } }));
    out('activate complete');
    log('debug', 'activate complete');
}

/**
 * CZ: Deaktivace rozšíření – pouze loguje.
 */
export function deactivate() { log('debug', 'deactivate'); }
