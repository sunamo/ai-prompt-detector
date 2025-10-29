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

/**
 * Aktualizuje příznak povolení debug výpisů z konfigurace.
 */
function refreshDebug() {
  debugEnabled = vscode
    .workspace
    .getConfiguration('ai-prompt-detector')
    .get<boolean>('enableDebugLogs', false) || false;
}

/**
 * Inicializuje logger: výstupní kanál + denní soubor v dostupné složce.
 */
export function initLogger() {
  channel = vscode.window.createOutputChannel('SpecStory Prompts');
  refreshDebug();
  const dir = 'E:/vs/TypeScript_Projects/_vscode/ai-prompt-detector/logs';
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

/**
 * Zapíše řádek do výstupního kanálu i souboru.
 */
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

/**
 * Info log – vždy se vypíše.
 */
export function info(m: string) { append(m); }

/**
 * Debug log – vypíše se jen když je zapnuta volba enableDebugLogs.
 */
export function debug(m: string) { if (debugEnabled) append(m); }

/**
 * Chybový log – vždy se vypíše (není zde separátní úroveň).
 */
export function error(m: string) { append(m); }
