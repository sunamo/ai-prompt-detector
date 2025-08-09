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

// Feature flag: disable legacy .md file detection per new requirement
const USE_FILE_WATCHERS = false;

// Copilot command event logging
function appendCopilotEvent(command: string) {
    try {
        if (!instructionsPath) return;
        const entry = `\n---\n[${new Date().toISOString()}] Copilot Event: ${command}\n`;
        fs.appendFileSync(instructionsPath, entry);
        log('debug', 'copilot event logged', { command });
    } catch (e) { logError('appendCopilotEvent failed', e); }
}

// Prompt detection configuration
const PROMPT_COMMAND_PREFIXES = ['github.copilot', 'copilot.'];
const PROMPT_COMMAND_EXACT = [
    'workbench.action.chat.submit',
    'workbench.action.chat.acceptChanges',
    'workbench.action.chat.send',
    'chat.submit',
    'chat.send'
];
let lastPromptSig: string | undefined;
let lastPromptTime = 0;
const PROMPT_DEDUPE_WINDOW_MS = 150; // avoid ultra-fast duplicates from multiple hooks

function isPromptCommand(command: string): boolean {
    if (PROMPT_COMMAND_EXACT.includes(command)) return true;
    return PROMPT_COMMAND_PREFIXES.some(p => command.startsWith(p));
}

function recordPrompt(source: string, meta?: any) {
    const now = Date.now();
    const sig = source + ':' + (meta?.command || meta?.doc || '');
    if (now - lastPromptTime < PROMPT_DEDUPE_WINDOW_MS && sig === lastPromptSig) {
        log('debug', 'prompt dedup (multi-source)', { source, sig });
        return;
    }
    lastPromptSig = sig;
    lastPromptTime = now;
    incPrompt();
    const s = getSession();
    updateStatusBar();
    vscode.window.showInformationMessage(`Prompt #${s.promptCount}`); // immediate popup
    if (workspaceRoot) runInstall(workspaceRoot);
    log('debug', 'prompt recorded (immediate)', { source, count: s.promptCount, meta });
}

function handleCopilotCommand(command: string) {
    try {
        recordPrompt('command', { command });
        appendCopilotEvent(command);
    } catch (e) { logError('handleCopilotCommand failed', e); }
}

// Central prompt handling WITHOUT dedup (kept for potential fallback)
function handlePrompt(file: string, source: string) {
    if (!USE_FILE_WATCHERS) return; // disabled mode
    try {
        incPrompt();
        appendPrompt(file);
        const s = getSession();
        updateStatusBar();
        vscode.window.setStatusBarMessage(`File prompt #${s.promptCount}`, 1500);
        if (workspaceRoot) runInstall(workspaceRoot);
        log('debug', 'file prompt handled', { file, source, count: s.promptCount });
    } catch (e) { logError('handlePrompt failed', e); }
}

// Status bar handling
let statusBar: vscode.StatusBarItem | undefined;
let extensionVersion = '0.0.0';
function initStatusBar(context: vscode.ExtensionContext) {
    try {
        if (!statusBar) {
            statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10000);
            statusBar.command = 'specstoryAutosave.showStatus';
            statusBar.tooltip = 'AI Prompt Detector – Copilot events';
            context.subscriptions.push(statusBar);
            log('debug', 'status bar item created (left)');
        }
        try {
            const pkgVersion = context.extension.packageJSON?.version;
            if (typeof pkgVersion === 'string') extensionVersion = pkgVersion;
        } catch (e) { logError('version resolve failed', e); }
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
    if (!USE_FILE_WATCHERS) return; // disabled
    try {
        const pattern = new vscode.RelativePattern(root, '**/.specstory/history/*.md');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidCreate(uri => handlePrompt(uri.fsPath, 'fs-create'), null, context.subscriptions);
        watcher.onDidChange(uri => handlePrompt(uri.fsPath, 'fs-change'), null, context.subscriptions);
        context.subscriptions.push(watcher);
        log('debug', 'prompt watcher registered', { root });
    } catch (e) { logError('registerPromptWatcher failed', e); }
}

// Polling disabled when file watchers off
function pollPromptFiles() { /* noop in command mode */ }

// Copilot command hook (fallback shim if onDidExecuteCommand not available)
function hookCopilotCommands(context: vscode.ExtensionContext) {
    const orig = vscode.commands.executeCommand;
    (vscode.commands as any).executeCommand = async function(command: string, ...rest: any[]) {
        try {
            if (isPromptCommand(command)) {
                handleCopilotCommand(command); // BEFORE executing original for zero latency
            }
        } catch (e) { logError('executeCommand hook error', e); }
        return orig.apply(this, [command, ...rest]);
    };
    context.subscriptions.push({ dispose: () => { (vscode.commands as any).executeCommand = orig; } });
    log('debug', 'copilot command hook installed (executeCommand patch)');
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
        loadHistory(root); // historical md (optional)
        if (USE_FILE_WATCHERS) {
            for (const f of vscode.workspace.workspaceFolders || []) registerPromptWatcher(context, f.uri.fsPath);
            // start polling only if enabled
            const pollInterval = setInterval(pollPromptFiles, 1500);
            context.subscriptions.push({ dispose: () => clearInterval(pollInterval) });
        } else {
            log('debug', 'file-based detection disabled (Copilot command mode active)');
        }
        updateStatusBar();
        runInstall(root); // startup install
    } else {
        updateStatusBar();
    }

    // Copilot command hook
    hookCopilotCommands(context);

    context.subscriptions.push(vscode.commands.registerCommand('specstoryAutosave.showStatus', () => {
        try {
            const s = getSession();
            vscode.window.showInformationMessage(`Copilot prompts this session: ${s.promptCount}. History loaded: ${s.prompts.length}`);
            log('normal', 'status requested', s);
        } catch (e) { logError('showStatus failed', e); }
    }));

    // Remove noisy listeners when not using file watchers
    if (USE_FILE_WATCHERS) {
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
            try { if (ev.document.fileName.includes('.specstory')) handlePrompt(ev.document.fileName, 'text-change'); } catch (e) { logError('prompt tracking failed', e); }
        }));
        context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => {
            try { if (doc.fileName.includes('.specstory')) handlePrompt(doc.fileName, 'open'); } catch (e) { logError('open doc prompt tracking failed', e); }
        }));
        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
            try { if (doc.fileName.includes('.specstory')) handlePrompt(doc.fileName, 'save'); } catch (e) { logError('save doc prompt tracking failed', e); }
        }));
    }

    // Chat document heuristic: detect user pressing Enter in chat input (content changes with newline)
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
        try {
            if (USE_FILE_WATCHERS) return; // skip in file watcher mode
            const doc = ev.document;
            const scheme = doc.uri.scheme;
            if (scheme.includes('chat') || doc.fileName.includes('copilot') || doc.languageId.includes('chat')) {
                if (ev.contentChanges.some(c => c.text.includes('\n'))) {
                    recordPrompt('chat-doc', { doc: doc.uri.toString() });
                }
            }
        } catch (e) { logError('chat doc heuristic failed', e); }
    }));

    log('debug', 'activate complete');
}

export function deactivate() { log('debug', 'deactivate'); }
