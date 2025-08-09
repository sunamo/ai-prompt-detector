import * as vscode from 'vscode';
import { log, logError, validateRecentLogs } from './logging';
import { loadHistory, incPrompt, getSession } from './datastore';

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

    // Example of tracking prompts: here we hook into Chat input (placeholder - integrate with real APIs referencing other repos later)
    // Minimal placeholder: onDidChangeTextDocument for files in history directory as a stand-in for prompt events
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
        try {
            if (ev.document.fileName.includes('.specstory')) {
                incPrompt();
                log('debug', 'prompt increment', { file: ev.document.fileName });
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
