/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { initLogger, info, debug } from './logger';
import { focusChatInput, forwardToChatAccept, getChatInputText } from './chatHelpers';

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
 * Rekurzivně prochází exporty Copilot Chat a pokouší se připojit k eventům submit.
 * @param recordPrompt Callback k uložení promptu.
 */
async function hookCopilotExports(
  recordPrompt: (raw: string, src: string) => boolean,
) {
  try {
    const ext =
      vscode.extensions.getExtension('GitHub.copilot-chat') ||
      vscode.extensions.getExtension('github.copilot-chat');
    if (!ext) {
      info('Copilot Chat extension not found');
      return;
    }
    info(`Copilot Chat extension found: ${ext.id}, active: ${ext.isActive}`);
    if (!ext.isActive) {
      await ext.activate();
      info('Copilot Chat extension activated');
    }
    
    let hookCount = 0;
    const visited = new Set<any>();
    const scan = (obj: any, depth = 0) => {
      if (!obj || typeof obj !== 'object' || visited.has(obj) || depth > 6) return;
      visited.add(obj);
      for (const k of Object.keys(obj)) {
        const v = (obj as any)[k];
        try {
          if (
            /submit|send|accept/i.test(k) &&
            v &&
            typeof v === 'object' &&
            typeof (v as any).event === 'function'
          ) {
            (v as any).event((e: any) => {
              try {
                const txt = String(
                  e?.message ||
                    e?.prompt ||
                    e?.request?.message ||
                    e?.request?.prompt ||
                    e?.command?.message ||
                    e?.command?.prompt ||
                    e?.text ||
                    '',
                ).trim();
                if (txt) {
                  info(`Copilot exports captured mouse submission: "${txt.substring(0, 100)}" via ${k}`);
                  if (recordPrompt(txt, 'mouse-copilot-exports'))
                    info('Mouse submission via Copilot exports recorded successfully');
                } else {
                  info(`Copilot exports: no text found in event via ${k}`);
                }
              } catch (err) {
                info('exports event err ' + err);
              }
            });
            hookCount++;
            info('Hooked export event: ' + k);
          }
        } catch {}
        if (typeof v === 'object') scan(v, depth + 1);
      }
    };
    scan(ext.exports);
    info(`Copilot exports scan complete: ${hookCount} hooks registered`);
  } catch (e) {
    info('hookCopilotExports err ' + e);
  }
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
    if (source.startsWith('enter')) notify(); else setTimeout(notify, 250);
    
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

  // Send button detection disabled - clipboard usage prohibited
  let lastEnterTime = 0; // Čas posledního Enter eventu pro Chat Participant debouncing
  info('Send button polling disabled - clipboard usage prohibited');

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

  hookCopilotExports(recordPrompt);

  try {
    const chatNs: any = (vscode as any).chat;
    info(`Chat API available: ${!!chatNs}, onDidSubmitRequest: ${!!chatNs?.onDidSubmitRequest}`);
    if (chatNs?.onDidSubmitRequest) {
      context.subscriptions.push(
        chatNs.onDidSubmitRequest((e: any) => {
          try {
            const txt = String(
              e?.request?.message || 
              e?.request?.prompt || 
              e?.prompt || 
              e?.message ||
              e?.command?.message ||
              e?.command?.prompt || '',
            ).trim();
            if (txt) {
              info(`Chat API captured mouse submission: "${txt.substring(0, 100)}"`);
              if (recordPrompt(txt, 'mouse-chatapi')) {
                info('Mouse submission via chatApi recorded successfully');
              }
            } else {
              info('Chat API: no text found in submission event');
            }
          } catch (err) {
            info('chat api err ' + err);
          }
        }),
      );
      info('Chat API listener registered successfully');
    } else {
      info('Chat API onDidSubmitRequest not available');
    }
  } catch (e) {
    info('chat api init err ' + e);
  }

  // Pokus o registraci Chat Participant pro okamžitou detekci
  try {
    // Chat Participant approach - zachytává všechny chat requesty okamžitě
    const chatApi = (vscode as any).chat;
    if (chatApi && chatApi.createChatParticipant) {
      const participant = chatApi.createChatParticipant('prompt-detector', (request: any, context: any, stream: any, token: any) => {
        try {
          const text = request.prompt || request.message || String(request.command?.prompt || request.command?.message || '');
          if (text && text.trim()) {
            info(`Chat Participant captured mouse/send: "${text.substring(0, 100)}"`);
            recordPrompt(text.trim(), 'mouse-send-detected');
            
            // Aktualizuj lastEnterTime aby se předešlo duplicate notifikacím z polling
            lastEnterTime = Date.now();
          } else {
            info('Chat Participant: no text found in request object');
          }
        } catch (err) {
          info('Chat Participant error: ' + err);
        }
        
        // Return empty result to not interfere
        return {};
      });
      
      context.subscriptions.push(participant);
      info('Chat Participant registered for Send button detection');
    } else {
      info('Chat Participant API not available - keeping polling fallback');
    }
  } catch (e) {
    info('Chat Participant registration failed - keeping polling fallback: ' + e);
  }

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
      
      // Zaznamenej čas Enter eventu pro debouncing
      lastEnterTime = Date.now();

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
