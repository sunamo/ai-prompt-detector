import * as vscode from 'vscode';
import { log, logError, validateRecentLogs } from './logging';
import { loadHistory, incPrompt, getSession } from './datastore';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

let instructionsPath: string | undefined; // new
let workspaceRoot: string | undefined; // added

function ensureInstructions(root: string) {
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
function appendPrompt(file: string) {
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

// Added: run install.ps1 after each prompt (guard + debounce)
let installing = false;
let lastInstall = 0;
let pendingInstall = false; // added queue flag
const INSTALL_DEBOUNCE_MS = 0; // no debounce (always run)
function runInstall(root: string) {
    try {
        const script = path.join(root, 'install.ps1');
        if (!fs.existsSync(script)) {
            log('debug', 'install.ps1 not found, skipping');
            return;
        }
        if (installing) {
            pendingInstall = true; // queue another run
            log('debug', 'install already running, queued');
            return;
        }
        installing = true;
        pendingInstall = false;
        lastInstall = Date.now();
        log('normal', 'running install.ps1 (auto)');
        const ps = spawn('powershell', ['-ExecutionPolicy','Bypass','-File', script], { cwd: root, stdio: 'inherit' });
        ps.on('exit', code => {
            installing = false;
            if (code === 0) {
                log('normal', 'install.ps1 completed', { code });
            } else {
                logError('install.ps1 failed', { code });
                vscode.window.showWarningMessage(`install.ps1 failed (code ${code})`);
            }
            if (pendingInstall) {
                log('debug', 'running queued install');
                runInstall(root);
            }
        });
        ps.on('error', err => {
            installing = false;
            logError('install.ps1 spawn failed', err);
            if (pendingInstall) runInstall(root);
        });
    } catch (e) {
        installing = false;
        logError('runInstall failed', e);
    }
}

// Central prompt handling WITHOUT dedup (every event counts)
function handlePrompt(file: string, source: string) {
    try {
        incPrompt();
        appendPrompt(file);
        const s = getSession();
        updateStatusBar();
        vscode.window.showInformationMessage(`Prompt odeslán (#${s.promptCount})`);
        if (workspaceRoot) runInstall(workspaceRoot);
        log('debug', 'prompt handled (no dedup)', { file, source, count: s.promptCount });
    } catch (e) {
        logError('handlePrompt failed', e);
    }
}

// Status bar handling
let statusBar: vscode.StatusBarItem | undefined;
let extensionVersion = '0.0.0';
function initStatusBar(context: vscode.ExtensionContext) {
    try {
        if (!statusBar) {
            // Put LEFT with very high priority so it appears first and immediately
            statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10000);
            statusBar.command = 'specstoryAutosave.showStatus';
            statusBar.tooltip = 'AI Prompt Detector – click for session stats';
            context.subscriptions.push(statusBar);
            log('debug', 'status bar item created (left)');
        }
        // Resolve version
        try {
            const pkgVersion = context.extension.packageJSON?.version;
            if (typeof pkgVersion === 'string') extensionVersion = pkgVersion;
        } catch (e) { logError('version resolve failed', e); }
        // Initial text instantly (even before any prompts)
        const s = getSession();
        statusBar.text = `$(comment-discussion) AI Prompt: ${s.promptCount} | v${extensionVersion}`;
        statusBar.show();
    } catch (e) { logError('initStatusBar failed', e); }
}
function updateStatusBar() {
    if (!statusBar) return;
    const s = getSession();
    statusBar.text = `$(comment-discussion) AI Prompt: ${s.promptCount} | v${extensionVersion}`;
    statusBar.show();
}

function registerPromptWatcher(context: vscode.ExtensionContext, root: string) {
    try {
        const pattern = new vscode.RelativePattern(root, '.specstory/history/*.md');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidCreate(uri => handlePrompt(uri.fsPath, 'fs-create'), null, context.subscriptions);
        watcher.onDidChange(uri => handlePrompt(uri.fsPath, 'fs-change'), null, context.subscriptions);
        context.subscriptions.push(watcher);
        log('debug', 'prompt watcher registered');
    } catch (e) { logError('registerPromptWatcher failed', e); }
}

export async function activate(context: vscode.ExtensionContext) {
    log('debug', 'activate start');
    initStatusBar(context);
    setTimeout(() => { try { updateStatusBar(); } catch {/* ignore */} }, 1200);
    try { validateRecentLogs(); } catch (e) { logError('log validation failed', e); }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
        workspaceRoot = root;
        ensureInstructions(root);
        loadHistory(root);
        registerPromptWatcher(context, root);
        updateStatusBar();
        runInstall(root); // auto run at startup
    } else {
        updateStatusBar();
    }

    context.subscriptions.push(vscode.commands.registerCommand('specstoryAutosave.showStatus', () => {
        try {
            const s = getSession();
            vscode.window.showInformationMessage(`Prompts this session: ${s.promptCount}. Loaded history: ${s.prompts.length}`);
            log('normal', 'status requested', s);
        } catch (e) { logError('showStatus failed', e); }
    }));

    // Text change inside .specstory
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
        try { if (ev.document.fileName.includes('.specstory')) handlePrompt(ev.document.fileName, 'text-change'); } catch (e) { logError('prompt tracking failed', e); }
    }));
    // Open document
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => {
        try { if (doc.fileName.includes('.specstory')) handlePrompt(doc.fileName, 'open'); } catch (e) { logError('open doc prompt tracking failed', e); }
    }));
    // Save document
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        try { if (doc.fileName.includes('.specstory')) handlePrompt(doc.fileName, 'save'); } catch (e) { logError('save doc prompt tracking failed', e); }
    }));

    log('debug', 'activate complete');
}

export function deactivate() { log('debug', 'deactivate'); }
