import * as vscode from 'vscode';
import { log, logError, validateRecentLogs } from './logging';
import { loadHistory, incPrompt, getSession } from './datastore';
import * as fs from 'fs';
import * as path from 'path';

let instructionsPath: string | undefined; // new
function ensureInstructions(root: string) { // new
    try {
        const dir = path.join(root, '.github');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        instructionsPath = path.join(dir, 'copilot-instructions.md');
        if (!fs.existsSync(instructionsPath)) {
            fs.writeFileSync(instructionsPath, '# Copilot Instructions (auto-collected prompts)\n\n');
            log('debug', 'created instructions file');
        }
    } catch (e) { logError('ensureInstructions failed', e); }
}
function appendPrompt(file: string) { // new
    try {
        if (!instructionsPath) return;
        if (!fs.existsSync(file)) return;
        const content = fs.readFileSync(file, 'utf8');
        const snippet = content.length > 2000 ? content.slice(0, 2000) + '…' : content;
        const entry = `\n---\n[${new Date().toISOString()}] ${path.basename(file)}\n\n${snippet}\n`;
        fs.appendFileSync(instructionsPath, entry);
        log('debug', 'prompt recorded', { file });
    } catch (e) { logError('appendPrompt failed', e); }
}

// Status bar handling
let statusBar: vscode.StatusBarItem | undefined;
let extensionVersion = '0.0.0';
function initStatusBar(context: vscode.ExtensionContext) {
    try {
        if (!statusBar) {
            statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
            statusBar.command = 'specstoryAutosave.showStatus';
            context.subscriptions.push(statusBar);
        }
        const selfExt = vscode.extensions.getExtension('sunamocz.specstory-autosave');
        if (selfExt && typeof selfExt.packageJSON?.version === 'string') {
            extensionVersion = selfExt.packageJSON.version;
        }
        updateStatusBar();
        statusBar.show();
    } catch (e) { logError('initStatusBar failed', e); }
}
function updateStatusBar() {
    if (!statusBar) return;
    const s = getSession();
    statusBar.text = `AI Prompt: ${s.promptCount} | v${extensionVersion}`;
}

// New: prompt event handling via FS watcher
function registerPromptWatcher(context: vscode.ExtensionContext, root: string) {
    try {
        const pattern = new vscode.RelativePattern(root, '.specstory/history/*.md');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const handled = new Set<string>();
        const onEvent = (uri: vscode.Uri, kind: 'create' | 'change') => {
            try {
                // Debounce duplicate events
                const key = uri.fsPath + ':' + kind + ':' + Date.now().toString().slice(0, -2);
                if (handled.has(key)) return;
                handled.add(key);
                incPrompt();
                const s = getSession();
                log('debug', 'prompt detected (fs)', { file: uri.fsPath, kind, promptCount: s.promptCount });
                appendPrompt(uri.fsPath); // new
                updateStatusBar();
                vscode.window.showInformationMessage(`Prompt odeslán (#${s.promptCount})`);
            } catch (e) {
                logError('prompt watcher handler failed', e);
            }
        };
        watcher.onDidCreate(uri => onEvent(uri, 'create'), null, context.subscriptions);
        watcher.onDidChange(uri => onEvent(uri, 'change'), null, context.subscriptions);
        context.subscriptions.push(watcher);
        log('debug', 'prompt watcher registered');
    } catch (e) {
        logError('registerPromptWatcher failed', e);
    }
}

export async function activate(context: vscode.ExtensionContext) {
    try {
        log('debug', 'activate start');
        validateRecentLogs();
    } catch (e) {
        logError('log validation failed', e);
    }

    initStatusBar(context);

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
        ensureInstructions(root); // new
        loadHistory(root);
        registerPromptWatcher(context, root);
        updateStatusBar();
    }

    context.subscriptions.push(vscode.commands.registerCommand('specstoryAutosave.showStatus', () => {
        try {
            const s = getSession();
            vscode.window.showInformationMessage(`Prompts this session: ${s.promptCount}. Loaded history: ${s.prompts.length}`);
            log('normal', 'status requested', s);
        } catch (e) {
            logError('showStatus failed', e);
        }
    }));

    // Legacy placeholder (keep): text change listener inside .specstory
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
        try {
            if (ev.document.fileName.includes('.specstory')) {
                incPrompt();
                log('debug', 'prompt increment (text change)', { file: ev.document.fileName });
                appendPrompt(ev.document.fileName); // new
                updateStatusBar();
            }
        } catch (e) {
            logError('prompt tracking failed', e);
        }
    }));

    log('debug', 'activate complete');
}

export function deactivate() {
    log('debug', 'deactivate');
}
