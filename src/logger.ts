/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let channel: vscode.OutputChannel;
let dailyPath = '';
let debugEnabled = false;

<<<<<<< HEAD
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
=======
/** Aktualizuje příznak povolení debug výpisů z konfigurace. */
function refreshDebug() {
  debugEnabled = vscode
    .workspace
    .getConfiguration('ai-prompt-detector')
    .get<boolean>('enableDebugLogs', false) || false;
}

/** Inicializuje logger: výstupní kanál + denní soubor v dostupné složce. */
export function initLogger() {
  channel = vscode.window.createOutputChannel('SpecStory Prompts');
  refreshDebug();
  const dir = 'E:/vs/TypeScript_Projects/_/logs';
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
  dailyPath = path.join(
    dir,
    'ai-prompt-detector-' + new Date().toISOString().slice(0, 10) + '.log'
  );
  try { fs.writeFileSync(dailyPath, ''); } catch {}
  info('Log init - logging to: ' + dailyPath);
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('ai-prompt-detector.enableDebugLogs')) refreshDebug();
  });
}

/** Zapíše řádek do výstupního kanálu i souboru. */
function append(m: string) {
  channel.appendLine(m);
  try {
    const now = new Date();
    const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, -5);
    fs.appendFileSync(
      dailyPath,
      `[${localTime}] ${m}\n`
    );
  } catch {}
}

/** Info log – vždy se vypíše. */
>>>>>>> refs/remotes/origin/master
export function info(m: string) { append(m); }

/** Debug log – vypíše se jen když je zapnuta volba enableDebugLogs. */
export function debug(m: string) { if (debugEnabled) append(m); }

<<<<<<< HEAD
// Kompatibilní alias pro starší kód používající writeLog(message,isDebug)
export function writeLog(message: string, isDebug: boolean) { if (isDebug) { debug(message); } else { info(message); } }

// Kontrola čerstvosti log souboru (diagnostika)
function freshCheck() {
	try { const st = fs.statSync(dailyPath); const age = Date.now() - st.mtime.getTime(); if (age > 5*60*1000) { error(`❌ Log file too old (${Math.round(age/1000)}s)`); } else { debug(`✅ Log fresh (${age}ms)`); } } catch {}
=======
/** Chybový log – vždy se vypíše (není zde separátní úroveň). */
export function error(m: string) { append(m); }

/**
 * Inicializuje logger s možností přepínat debug výpisy.
 */
export class Logger {
  /** Zapíše řádek do výstupního kanálu i souboru. */
  private static append(m: string) {
    channel.appendLine(m);
    try {
      const now = new Date();
      const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, -5);
      fs.appendFileSync(
        dailyPath,
        `[${localTime}] ${m}\n`
      );
    } catch {}
  }

  /** Info log – vždy se vypíše. */
  public static info(m: string) { Logger.append(m); }

  /** Debug log – vypíše se jen když je zapnuta volba enableDebugLogs. */
  public static debug(m: string) { if (debugEnabled) Logger.append(m); }

  /** Chybový log – vždy se vypíše (není zde separátní úroveň). */
  public static error(m: string) { Logger.append(m); }
>>>>>>> refs/remotes/origin/master
}
