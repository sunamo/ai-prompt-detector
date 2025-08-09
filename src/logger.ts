import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LOG_DIR } from './constants';

let channel: vscode.OutputChannel;
let dailyPath = '';
let debugEnabled = false;

// Načte nastavení, zda je povolen podrobný (debug) log
function refreshDebug() { debugEnabled = vscode.workspace.getConfiguration('ai-prompt-detector').get<boolean>('enableDebugLogs', false) || false; }

/**
 * Inicializace loggeru – vytvoření výstupního kanálu, reset denního log souboru
 * a registrace posluchače na změnu konfigurace.
 */
export function initLogger(): void {
	channel = vscode.window.createOutputChannel('SpecStory Prompts');
	refreshDebug();
	const dir = LOG_DIR;
	try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
	const today = new Date().toISOString().slice(0,10);
	dailyPath = path.join(dir, `extension-${today}.log`);
	try { fs.writeFileSync(dailyPath, ''); } catch {}
	info(`🧹 Cleared daily log file ${dailyPath}`);
	freshCheck();
	vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('ai-prompt-detector.enableDebugLogs')) refreshDebug(); });
}

// Nízká úroveň – zapíše řádek do kanálu i do souboru
function append(msg: string) {
	channel.appendLine(msg);
	try { fs.appendFileSync(dailyPath, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

// Veřejné funkce logování (info, error, debug)
export function info(m: string) { append(m); }
export function error(m: string) { append(m); }
export function debug(m: string) { if (debugEnabled) append(m); }
export function getDailyLogPath() { return dailyPath; }

// Kompatibilní alias pro starší kód používající writeLog(message,isDebug)
export function writeLog(message: string, isDebug: boolean) { if (isDebug) { debug(message); } else { info(message); } }

// Kontrola čerstvosti log souboru (diagnostika)
function freshCheck() {
	try { const st = fs.statSync(dailyPath); const age = Date.now() - st.mtime.getTime(); if (age > 5*60*1000) { error(`❌ Log file too old (${Math.round(age/1000)}s)`); } else { debug(`✅ Log fresh (${age}ms)`); } } catch {}
}
