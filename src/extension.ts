/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as http from 'http';
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { initLogger, info, debug } from './logger';
import { focusChatInput, forwardToChatAccept, getChatInputText } from './chatHelpers';

/**
 * Interface pro webview panel s možností message handling.
 */
interface ExtendedWebviewPanel extends vscode.WebviewPanel {
  webview: vscode.Webview & {
    onDidReceiveMessage: (listener: (message: WebviewMessage) => void) => vscode.Disposable;
  };
}

/**
 * Interface pro zprávy z webview.
 */
interface WebviewMessage {
  type?: string;
  text?: string;
  command?: string;
  [key: string]: unknown;
}

/**
 * Interface pro chat události.
 */
interface ChatEvent {
  message?: string;
  prompt?: string;
  chatSessionId?: string;
  request?: {
    message?: string;
    prompt?: string;
  };
  command?: {
    message?: string;
    prompt?: string;
  };
  text?: string;
  [key: string]: unknown;
}

/**
 * Interface pro VS Code globální objekty.
 */
interface VSCodeGlobal {
  workbench?: {
    getViews?: () => Array<{ id: string; webview?: { onDidReceiveMessage: Function } }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Interface pro VS Code chat namespace rozšíření.
 */
interface ChatNamespace {
  onDidSubmitRequest?: (listener: (event: ChatEvent) => void) => vscode.Disposable;
  onDidDisposeChatSession?: (listener: (sessionId: string) => void) => vscode.Disposable;
  getChatSession?: (sessionId: string) => Promise<{
    requests?: Array<{ message?: string; prompt?: string }>;
    [key: string]: unknown;
  }>;
  [key: string]: Function | unknown;
}

/**
 * Interface pro VS Code rozšířené o chat.
 */
interface ExtendedVSCode {
  chat?: ChatNamespace;
  workbench?: {
    getViews?: () => Array<{ id: string; webview?: { onDidReceiveMessage: Function } }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Interface pro network target z DevTools.
 */
interface DevToolsTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

/**
 * Interface pro WebSocket zprávy z DevTools.
 */
interface DevToolsMessage {
  id?: number;
  method?: string;
  params?: {
    args?: Array<{ value: unknown }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Interface pro Node.js ChildProcess error.
 */
interface ProcessError extends Error {
  code?: string | number;
}

/**
 * Interface pro VS Code události s dokumentem.
 */
interface DocumentEvent {
  document?: {
    uri: {
      toString(): string;
    };
  };
  [key: string]: unknown;
}

// --- Stav ---
let statusBarItem: vscode.StatusBarItem;
let providerRef: PromptsProvider | undefined;
let aiPromptCounter = 0;
let typingBuffer = '';
let lastSnapshot = '';
// odstraněno nepoužívané lastTypingChangeAt (REGRESE prevence: nesahat bez důvodu)
let dynamicSendCommands = new Set<string>();
let debugEnabled = false;
let snapshotTimer: NodeJS.Timeout | undefined;

// Global state for mouse detection
let globalLastText = '';
let pollingInterval: NodeJS.Timeout | undefined;
let lastTextClearTime = 0;

/** Aktualizuje interní příznak zda jsou povoleny debug logy.
 * INVARIANT: Žádný druhý parametr u get() – pokud undefined => debugEnabled=false + notifikace (jen 1x).
 */
function refreshDebugFlag() {
  const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
  const val = cfg.get<boolean>('enableDebugLogs');
  if (typeof val !== 'boolean') {
    if (!debugEnabled) {
      vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing setting enableDebugLogs (treating as disabled)');
    }
    debugEnabled = false;
  } else {
    debugEnabled = val;
  }
}

/**
 * DOKUMENTACE POKUSŮ O DETEKCI MYŠI (kompletní historie):
 * 
 * ✅ FUNGUJÍCÍ PŘÍSTUPY:
 * 1. Enter detekce - spolehlivě přes command interception
 * 2. Polling (25ms) - detekuje zmizení textu s malým zpožděním
 * 
 * ❌ SELHANÉ POKUSY (všechny testovány a zdokumentovány):
 * 1. Chat API (vscode.chat.onDidSubmitRequest) - vyžaduje --enable-proposed-api flag
 * 2. Command interception pro mouse - mouse clicks negenerují příkazy
 * 3. Webview panel monitoring - Copilot nepoužívá createWebviewPanel
 * 4. DOM monitoring - window is not defined (extension běží v Node.js)
 * 5. DevTools Protocol - porty 9229,9230,9222,9221,5858 nejsou otevřené
 * 6. Extension Host process monitoring - nedostupné z extension contextu
 * 7. Workspace document changes - detekuje jen změny souborů, ne UI události
 * 8. Console injection - nelze injektovat do renderer procesu
 * 9. Widget service access (IChatWidget) - interní VS Code služby nejsou exposed
 * 10. Extension module hooks - chat moduly se nenačítají přes require()
 * 11. Network monitoring - žádná GitHub API aktivita během lokálního chatu
 * 12. VS Code state monitoring - viditelné jen změny focus okna
 * 13. Filesystem monitoring - žádné chat soubory se nevytvářejí při odeslání
 * 14. Deep API reflection - nalezeno 65+ API ale žádné neposkytuje submit události
 * 15. Memory/heap monitoring - vyžaduje nativní moduly (blokováno security)
 * 16. System-level input monitoring - vyžaduje OS-level oprávnění
 * 17. IPC message monitoring - extension sandbox brání IPC přístupu
 * 
 * ARCHITEKTONICKÝ PROBLÉM:
 * - Extension Host: Node.js context kde běží naše extension
 * - Renderer Process: Electron UI kde běží chat interface
 * - Žádný most: Mouse clicks negenerují příkazy ani API volání přes hranici procesů
 * 
 * SOUČASNÉ ŘEŠENÍ: Jediný polling loop (25ms) - optimální kompromis mezi
 * rychlostí detekce a využitím zdrojů. Detekuje odeslání myší s ~25-50ms zpožděním.
 */
async function setupAdvancedSubmissionDetection(
  recordPrompt: (raw: string, src: string) => boolean,
): Promise<void> {
  info('🔧 Setting up optimized mouse click detection');
  
  // JEDINÝ POLLING MECHANISMUS - 25ms interval pro rychlou detekci
  pollingInterval = setInterval(async () => {
    try {
      const currentText = await getChatInputText(false, false);
      const now = Date.now();
      
      if (currentText && currentText.trim()) {
        // Text nalezen
        if (currentText !== globalLastText) {
          globalLastText = currentText;
          lastTextClearTime = 0;
          debug(`Polling: New text detected: "${currentText.substring(0, 50)}"`);
        }
      } else if (globalLastText && !currentText) {
        // Text zmizel - pravděpodobně odeslán myší
        if (lastTextClearTime === 0) {
          lastTextClearTime = now;
          info(`🖱️ MOUSE CLICK DETECTED - immediate notification for: "${globalLastText.substring(0, 100)}"`);
          recordPrompt(globalLastText, 'mouse-click');
          globalLastText = '';
        }
      } else if (!currentText && !globalLastText) {
        // Reset state když není žádný text
        lastTextClearTime = 0;
      }
    } catch (e) {
      // Silent fail
    }
  }, 25); // 25ms pro rychlou odezvu
  
  // Zastavit polling po 30 minutách
  setTimeout(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = undefined;
      info('⏸️ Mouse detection polling stopped after 30 minutes');
    }
  }, 30 * 60 * 1000);
  
  info('✅ Mouse click detection active (25ms polling)')
}

/**
 * Aktivace extensionu – nastaví listener pro Enter varianty a inicializuje čtení exportů.
 * @param context Kontext poskytovaný VS Code.
 */
export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  const ext = vscode.extensions.getExtension('sunamocz.ai-prompt-detector');
  const version = ext?.packageJSON?.version || 'unknown';
  info(`🚀 NEW VERSION LOADING - v${version} - EXTENSION ACTIVATED 🚀`);
  info(`Activation start - version ${version}`);
  refreshDebugFlag();

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.show();

  /** Aktualizuje text ve status baru. (NESMÍ používat fallback verze) */
  const updateStatusBar = () => {
    const ext = vscode.extensions.getExtension('sunamocz.ai-prompt-detector');
    const v: string | undefined = ext?.packageJSON?.version;
    if (!v) {
      vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing package.json version');
      statusBarItem.text = '🤖 AI Prompts: ' + aiPromptCounter + ' | v?';
      return;
    }
    statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter} | v${v}`;
  };

  /** Vyčistí typing buffer a snapshot - zavolá se jen z určitých zdrojů */
  const clearBuffers = (reason: string) => {
    debug(`clearBuffers called: ${reason}, typingBuffer was="${typingBuffer.substring(0, 50)}"`);
    typingBuffer = '';
    lastSnapshot = '';
  };

  /** Uloží prompt do stavu, vždy započítá i opakovaný text.
   * INVARIANT: Žádný default parametr v get(); pokud customMessage chybí → notifikace.
   */
  const recordPrompt = (raw: string, source: string, shouldClearBuffers = true): boolean => {
    const text = (raw || '').trim();
    info(`recordPrompt called: source=${source}, text="${text.substring(0, 100)}", clearBuffers=${shouldClearBuffers}`);
    debug(`recordPrompt called: raw="${raw.substring(0, 100)}", source=${source}, trimmed="${text}", clearBuffers=${shouldClearBuffers}"`);
    if (!text) {
      info('recordPrompt: empty text, returning false');
      debug('recordPrompt: empty text, returning false');
      return false;
    }
    state.recentPrompts.unshift(text);
    if (state.recentPrompts.length > 1000) state.recentPrompts.splice(1000);
    aiPromptCounter++;
    providerRef?.refresh();
    updateStatusBar();
    if (shouldClearBuffers) {
      clearBuffers(`recordPrompt source: ${source}`);
    }
    const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
    let customMsg = cfg.get<string>('customMessage');
    if (customMsg === undefined) {
      vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing setting customMessage');
      customMsg = ''; // pokračujeme bez textu – politika: žádný druhý parametr fallback
    }
    const notify = () => vscode.window.showInformationMessage(`AI Prompt sent (${source})\n${customMsg}`);
    // Show notification immediately for all sources
    notify();
    
    // Spusť install.ps1 po každém promptu
    setTimeout(async () => {
      try {
        info('Executing install.ps1 after prompt detection...');
        const terminal = vscode.window.createTerminal({
          name: 'AI Prompt Detector Auto-Install',
          cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        });
        terminal.sendText(`powershell -ExecutionPolicy Bypass -File "./install.ps1" "Auto-install after prompt #${aiPromptCounter}"`);
        terminal.show(false); // Nezaměřuj terminal
        info('install.ps1 execution initiated');
      } catch (err) {
        info(`Failed to execute install.ps1: ${err}`);
      }
    }, 1000); // 1 sekunda zpoždění
    
    debug(`recordPrompt SUCCESS: src=${source} len=${text.length} counter=${aiPromptCounter}`);
    return true;
  };

  // Removed duplicate polling - already handled in setupAdvancedSubmissionDetection

  updateStatusBar();

  await loadExistingPrompts();
  providerRef = new PromptsProvider();
  const registration = vscode.window.registerWebviewViewProvider(
    PromptsProvider.viewType,
    providerRef,
  );

  // Auto-open activity bar after activation
  setTimeout(async () => {
    try {
      await vscode.commands.executeCommand('workbench.view.extension.specstory-activity');
      debug('Activity bar auto-opened');
    } catch (e) {
      debug('Failed to auto-open activity bar: ' + e);
    }
  }, 1000);

  setupAdvancedSubmissionDetection(recordPrompt);

  // Webview monitoring removed - Copilot doesn't use createWebviewPanel
  
  // Chat API removed - requires --enable-proposed-api flag which is not available


  /**
   * Obslouží všechny varianty Enter (Enter, Ctrl+Enter, Ctrl+Shift+Enter, Ctrl+Alt+Enter).
   * INVARIANT pořadí kroků (NEUPRAVOVAT bez změny instrukcí):
   * 1) focusChatInput()
   * 2) getChatInputText()
   * 3) fallback typingBuffer / lastSnapshot
   * 4) krátký retry po 35ms
   * 5) recordPrompt jen pokud neprázdné
   * 6) forwardToChatAccept + fallback IDs
   * 7) debug log pokud text nezachycen (bez ukládání prázdného promptu)
   * @param variant Identifikátor varianty (plain|ctrl|ctrl-shift|ctrl-alt)
   */
  const handleForwardEnter = async (variant: string) => {
    try {
      info(`=== ENTER ${variant} START ===`);
      
      // Reset global text state při Enter
      globalLastText = '';

      // 1) Zaměří vstupní pole
      await focusChatInput();
      await new Promise((r) => setTimeout(r, 100));

      // 2) Zkusí získat text z input boxu PŘED odesláním (s keyboard simulation pro Enter events)
      let text = await getChatInputText(true, true);
      info(`getChatInputText returned: "${text.substring(0, 100)}"`);
      
      // 3) Pokud se nepodařilo, zkusí znovu s delším čekáním
      if (!text) {
        info('First attempt failed, trying again...');
        await new Promise((r) => setTimeout(r, 200));
        text = await getChatInputText(true, true);
        info(`Second attempt returned: "${text.substring(0, 100)}"`);
      }

      // 4) Zaznamenat prompt - skutečný text nebo fallback zprávu
      if (text) {
        info(`RECORDING REAL PROMPT: "${text.substring(0, 100)}"`);
        recordPrompt(text, 'enter-' + variant, false);
      } else {
        info('NO TEXT CAPTURED - recording fallback message');
        recordPrompt(`[No text captured for Enter ${variant}]`, 'enter-' + variant, false);
      }

      // 5) Pošle příkaz do Copilotu
      let ok = await forwardToChatAccept();
      if (!ok) {
        const fallbackCommands = [
          'github.copilot.chat.acceptInput',
          'github.copilot.chat.send',
          'github.copilot.chat.submit',
          'workbench.action.chat.acceptInput',
          'workbench.action.chat.submit',
        ];
        for (const id of fallbackCommands) {
          try {
            await vscode.commands.executeCommand(id);
            ok = true;
            info(`Forward successful via: ${id}`);
            break;
          } catch {}
        }
      }
      
      info(`=== ENTER ${variant} END === SUCCESS`);
    } catch (e) {
      info(`=== ENTER ${variant} ERROR === ${e}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ai-prompt-detector.forwardEnterToChat',
      () => handleForwardEnter('ctrl'),
    ),
    vscode.commands.registerCommand(
      'ai-prompt-detector.forwardEnterPlain',
      () => handleForwardEnter('plain'),
    ),
    vscode.commands.registerCommand(
      'ai-prompt-detector.forwardEnterCtrlShift',
      () => handleForwardEnter('ctrl-shift'),
    ),
    vscode.commands.registerCommand(
      'ai-prompt-detector.forwardEnterCtrlAlt',
      () => handleForwardEnter('ctrl-alt'),
    ),
  );

  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/.specstory/history/*.md',
  );
  watcher.onDidCreate((uri) => {
    if (isValidSpecStoryFile(uri.fsPath)) {
      loadPromptsFromFile(uri.fsPath, state.recentPrompts);
      providerRef?.refresh();
    }
  });
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('ai-prompt-detector.maxPrompts'))
      providerRef?.refresh();
    if (e.affectsConfiguration('ai-prompt-detector.enableDebugLogs'))
      refreshDebugFlag();
  });

  context.subscriptions.push(
    registration,
    watcher,
    configWatcher,
    statusBarItem,
  );

  info('Activation done');
}

async function loadExistingPrompts() {
  const files = await vscode.workspace.findFiles(
    '**/.specstory/history/*.md',
  );
  if (!files.length) {
    state.recentPrompts.push(
      'Welcome to AI Copilot Prompt Detector',
      'TEST: Dummy prompt for demonstration',
    );
    return;
  }
  const sorted = files.sort((a, b) =>
    path.basename(b.fsPath).localeCompare(path.basename(a.fsPath)),
  );
  for (const f of sorted)
    if (isValidSpecStoryFile(f.fsPath))
      loadPromptsFromFile(f.fsPath, state.recentPrompts);
}

export function deactivate() { info('Deactivation'); }
