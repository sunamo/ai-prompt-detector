import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const LOG_DIR = 'C:/temp/ai-prompt-detector-logs';
const MAX_LOG_AGE_MS = 5 * 60 * 1000; // 5 minutes

export type LogLevel = 'normal' | 'debug';

/**
 * CZ: Zajistí existenci adresáře pro logy.
 */
function ensureDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

/**
 * CZ: Vrací aktuální čas ve formátu ISO.
 */
function ts() {
    return new Date().toISOString();
}

/**
 * CZ: Zjišťuje, zda je povoleno debug logování (nastavení ve workspace).
 */
function settingDebug(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>('specstoryAutosave.debugLogging', true) ?? true;
}

/**
 * CZ: Zapíše jeden řádek do log souboru (vytvoří jej pokud neexistuje).
 */
function write(line: string) {
    ensureDir();
    const file = path.join(LOG_DIR, 'extension.log');
    fs.appendFileSync(file, line + '\n');
}

/**
 * CZ: Zapíše log zprávu podle úrovně (debug se zapisuje jen pokud je povoleno nastavením).
 */
export function log(level: LogLevel, message: string, data?: any) {
    if (level === 'debug' && !settingDebug()) return;
    const line = `[${ts()}][${level}] ${message}` + (data !== undefined ? ` | ${safe(data)}` : '');
    write(line);
}

/**
 * CZ: Zapíše chybu (vždy) bez ohledu na nastavení debug režimu.
 */
export function logError(message: string, err: any) {
    write(`[${ts()}][error] ${message} | ${safe(err)}`);
}

/**
 * CZ: Bezpečně serializuje objekt do textu (pokus o JSON, jinak fallback String).
 */
function safe(obj: any) {
    try { return typeof obj === 'string' ? obj : JSON.stringify(obj); } catch { return String(obj); }
}

/**
 * CZ: Ověří, že log soubor existuje a jeho stáří není větší než MAX_LOG_AGE_MS.
 * Vyhodí chybu pokud podmínky nesplňuje.
 */
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
