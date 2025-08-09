import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const LOG_DIR = 'C:/temp/ai-prompt-detector-logs';
const MAX_LOG_AGE_MS = 5 * 60 * 1000; // 5 minutes

export type LogLevel = 'normal' | 'debug';

function ensureDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

function ts() {
    return new Date().toISOString();
}

function settingDebug(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>('specstoryAutosave.debugLogging', true) ?? true;
}

function write(line: string) {
    ensureDir();
    const file = path.join(LOG_DIR, 'extension.log');
    fs.appendFileSync(file, line + '\n');
}

export function log(level: LogLevel, message: string, data?: any) {
    if (level === 'debug' && !settingDebug()) return;
    const line = `[${ts()}][${level}] ${message}` + (data !== undefined ? ` | ${safe(data)}` : '');
    write(line);
}

export function logError(message: string, err: any) {
    write(`[${ts()}][error] ${message} | ${safe(err)}`);
}

function safe(obj: any) {
    try { return typeof obj === 'string' ? obj : JSON.stringify(obj); } catch { return String(obj); }
}

export function validateRecentLogs(): void {
    ensureDir();
    const file = path.join(LOG_DIR, 'extension.log');
    if (!fs.existsSync(file)) {
        throw new Error('Log file not found - logging not functioning');
    }
    const stats = fs.statSync(file);
    const age = Date.now() - stats.mtimeMs;
    if (age > MAX_LOG_AGE_MS) {
        throw new Error('Logs older than 5 minutes - logging malfunction');
    }
}
