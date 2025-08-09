import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LOG_DIR } from './constants';

let channel: vscode.OutputChannel;
let dailyPath = '';
let debugEnabled = false;

function refreshDebug() { debugEnabled = vscode.workspace.getConfiguration('specstory-autosave').get<boolean>('enableDebugLogs', false) || false; }

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
	vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('specstory-autosave.enableDebugLogs')) refreshDebug(); });
}

function append(msg: string) {
	channel.appendLine(msg);
	try { fs.appendFileSync(dailyPath, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

export function info(m: string) { append(m); }
export function error(m: string) { append(m); }
export function debug(m: string) { if (debugEnabled) append(m); }
export function getDailyLogPath() { return dailyPath; }

// Compatibility shim for older code still importing writeLog(message, isDebug)
export function writeLog(message: string, isDebug: boolean) { if (isDebug) { debug(message); } else { info(message); } }

function freshCheck() {
	try { const st = fs.statSync(dailyPath); const age = Date.now() - st.mtime.getTime(); if (age > 5*60*1000) { error(`❌ Log file too old (${Math.round(age/1000)}s)`); } else { debug(`✅ Log fresh (${age}ms)`); } } catch {}
}
