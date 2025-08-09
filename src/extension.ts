import * as vscode from 'vscode';
import { log, logError, validateRecentLogs } from './logging';
import { loadHistory, incPrompt, getSession } from './datastore';

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

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
        loadHistory(root);
        registerPromptWatcher(context, root);
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
