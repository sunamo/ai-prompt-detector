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
      debug('Copilot Chat extension not found');
      return;
    }
    if (!ext.isActive) {
      await ext.activate();
    }
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
                    '',
                ).trim();
                if (txt) {
                  if (recordPrompt(txt, 'copilot-exports'))
                    debug('Captured via Copilot exports: ' + k);
                }
              } catch (err) {
                debug('exports event err ' + err);
              }
            });
            debug('Hooked export event: ' + k);
          }
        } catch {}
        if (typeof v === 'object') scan(v, depth + 1);
      }
    };
    scan(ext.exports);
  } catch (e) {
    debug('hookCopilotExports err ' + e);
  }
}

/**
 * Aktivace extensionu – nastaví listener pro Enter varianty a inicializuje čtení exportů.
 * @param context Kontext poskytovaný VS Code.
 */
export async function activate(context: vscode.ExtensionContext) {
  initLogger();
  info('Activation start');
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
    debug(`recordPrompt SUCCESS: src=${source} len=${text.length} counter=${aiPromptCounter}`);
    return true;
  };

  if (!snapshotTimer) {
    snapshotTimer = setInterval(async () => {
      try {
        // Nepřetahovat fokus při pasivním snapshotu (attemptFocus=false)
        const txt = await getChatInputText(false);
        if (txt && txt !== lastSnapshot && txt.length > 0) {
          lastSnapshot = txt;
          debug(`Snapshot updated: "${txt.substring(0, 50)}"`);
          // Také aktualizuj typing buffer pokud je prázdný
          if (!typingBuffer.trim() && txt.trim()) {
            typingBuffer = txt;
            debug(`TypingBuffer updated from snapshot: "${txt.substring(0, 50)}"`);
          }
        }
      } catch {}
    }, 800);
    context.subscriptions.push({
      dispose: () => snapshotTimer && clearInterval(snapshotTimer),
    });
  }

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
    if (chatNs?.onDidSubmitRequest) {
      context.subscriptions.push(
        chatNs.onDidSubmitRequest((e: any) => {
          try {
            const txt = String(
              e?.request?.message || e?.request?.prompt || e?.prompt || '',
            ).trim();
            if (recordPrompt(txt, 'chatApi')) debug('chatApi captured');
          } catch (err) {
            debug('chat api err ' + err);
          }
        }),
      );
    }
  } catch (e) {
    debug('chat api init err ' + e);
  }

  try {
    const cmdsAny = vscode.commands as any;
    if (cmdsAny?.onDidExecuteCommand) {
      const sendCommands = new Set([
        'github.copilot.chat.acceptInput',
        'github.copilot.chat.send',
        'github.copilot.chat.sendMessage',
        'github.copilot.chat.submit',
        'github.copilot.chat.executeSubmit',
        'github.copilot.chat.inlineSubmit',
        'github.copilot.interactive.submit',
        'github.copilot.interactive.acceptInput',
        'workbench.action.chat.acceptInput',
        'workbench.action.chat.submit',
        'workbench.action.chat.executeSubmit',
        'workbench.action.chat.submitWithCodebase',
        'workbench.action.chat.submitWithoutDispatching',
        'workbench.action.chat.send',
        'workbench.action.chat.sendMessage',
        'workbench.action.chat.sendToNewChat',
        'workbench.action.chatEditor.acceptInput',
        'chat.acceptInput',
        'inlineChat.accept',
        'interactive.acceptInput',
      ]);
      context.subscriptions.push(
        cmdsAny.onDidExecuteCommand(async (ev: any) => {
          try {
            const cmd = ev?.command as string;
            if (!cmd) return;
            if (debugEnabled) debug('CMD ' + cmd);
            if (cmd === 'type') {
              const t = ev?.args?.[0]?.text;
              if (t) {
                // Přijímáme i newlines - možná jsou součástí promptu
                typingBuffer += t;
                if (typingBuffer.length > 8000)
                  typingBuffer = typingBuffer.slice(-8000);
                debug(`TYPE: added "${t.replace(/\n/g, '\\n')}", buffer now="${typingBuffer.substring(0, 100)}"`);
              }
              return;
            }
            if (cmd === 'deleteLeft') {
              typingBuffer = typingBuffer.slice(0, -1);
              debug(`DELETE: buffer now="${typingBuffer}"`);
              return;
            }
            if (cmd === 'editor.action.clipboardPasteAction') {
              try {
                const clip = await vscode.env.clipboard.readText();
                if (clip) {
                  typingBuffer += clip;
                }
              } catch {}
              return;
            }
            const lower = cmd.toLowerCase();
            const heuristicMatch =
              !sendCommands.has(cmd) &&
              (lower.includes('copilot') || lower.includes('chat')) &&
              (lower.includes('submit') ||
                lower.includes('send') ||
                lower.includes('accept'));
            if (heuristicMatch) {
              debug('Heuristic SEND command detected: ' + cmd);
              sendCommands.add(cmd);
            }
            if (
              !sendCommands.has(cmd) &&
              !heuristicMatch &&
              typingBuffer.trim().length > 0
            ) {
              setTimeout(() => {
                if (!typingBuffer.trim()) {
                  dynamicSendCommands.add(cmd);
                  debug('Dynamic SEND detected & added: ' + cmd);
                }
              }, 40);
            }
            if (
              sendCommands.has(cmd) ||
              heuristicMatch ||
              dynamicSendCommands.has(cmd)
            ) {
              const immediate = typingBuffer.trim() || lastSnapshot;
              if (immediate) {
                recordPrompt(
                  immediate,
                  typingBuffer.trim()
                    ? heuristicMatch
                      ? 'heuristic-buffer'
                      : dynamicSendCommands.has(cmd)
                        ? 'dynamic-buffer'
                        : 'cmd-buffer'
                    : 'snapshot',
                );
              } else {
                setTimeout(async () => {
                  try {
                    const snap = await getChatInputText(true);
                    if (snap && snap.trim()) {
                      recordPrompt(
                        snap,
                        dynamicSendCommands.has(cmd)
                          ? 'dynamic-cmd'
                          : heuristicMatch
                            ? 'heuristic-cmd'
                            : 'cmd',
                      );
                    } else if (lastSnapshot && lastSnapshot.trim()) {
                      recordPrompt(lastSnapshot, 'snapshot-late');
                    } else {
                      debug(`No valid text captured for command: ${cmd}`);
                    }
                  } catch (e2) {
                    debug('post-send capture err ' + e2);
                  }
                }, 25);
              }
            }
          } catch (err) {
            debug('cmd hook err ' + err);
          }
        }),
      );
    }
  } catch (e) {
    debug('cmd hook init err ' + e);
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
      info(`=== ENTER ${variant} START === (always logged)`);
      debug(`=== ENTER ${variant} START === typingBuffer="${typingBuffer}"`);

      // 1) ZACHOVAT originální buffery PŘED jejich smazáním
      const savedTypingBuffer = typingBuffer;
      const savedSnapshot = lastSnapshot;
      info(`Saved buffers - typing: "${savedTypingBuffer.substring(0, 50)}", snapshot: "${savedSnapshot.substring(0, 50)}"`);

      // 2) Zaměří vstupní pole
      await focusChatInput();
      await new Promise((r) => setTimeout(r, 50));

      // 3) Zkusí získat text různými způsoby - vyzkoušej všechny metody
      let text = '';
      
      // První pokus: současný obsah input boxu PŘED odesláním  
      debug('Trying getChatInputText BEFORE sending...');
      text = await getChatInputText(true);
      debug(`getChatInputText returned: "${text}"`);
      
      // Druhý pokus: typing buffer (co se napísalo)
      if (!text && savedTypingBuffer.trim()) {
        text = savedTypingBuffer.trim();
        debug(`USING savedTypingBuffer: "${text}"`);
      }
      
      // Třetí pokus: snapshot (poslední zachycený obsah)
      if (!text && savedSnapshot.trim()) {
        text = savedSnapshot.trim();
        debug(`USING savedSnapshot: "${text}"`);
      }
      
      // Čtvrtý pokus: Ještě jeden pokus na getChatInputText s kratším čekáním
      if (!text) {
        debug('Final attempt at getChatInputText...');
        await new Promise((r) => setTimeout(r, 50));
        text = await getChatInputText(true);
        debug(`Final getChatInputText returned: "${text}"`);
      }

      // 4) Zaznamenat prompt - buď skutečný text nebo informaci o problému
      if (text) {
        debug(`RECORDING REAL PROMPT: "${text}"`);
        recordPrompt(text, 'enter-' + variant, false); // Nečistit buffery hned
      } else {
        debug('NO TEXT CAPTURED - recording fallback message');
        // Pokud se nepodařilo zachytit text, zaznamenat to pro debugging
        recordPrompt(`[No text captured for Enter ${variant}]`, 'enter-' + variant, false);
      }

      // 5) Pošle příkaz do Copilotu
      let ok = await forwardToChatAccept();
      if (!ok) {
        for (const id of [
          'github.copilot.chat.acceptInput',
          'github.copilot.chat.send',
          'github.copilot.chat.submit',
          'github.copilot.interactive.submit',
          'workbench.action.chat.acceptInput',
          'workbench.action.chat.submit',
          'workbench.action.chatEditor.acceptInput',
        ]) {
          try {
            await vscode.commands.executeCommand(id);
            ok = true;
            debug(`Forward successful via: ${id}`);
            break;
          } catch {}
        }
      }
      
      // 6) Vyčistit buffery až na konci po úspěšném odeslání
      clearBuffers(`handleForwardEnter ${variant} completed`);
      info(`=== ENTER ${variant} END === SUCCESS`);
      debug(`=== ENTER ${variant} END === buffers cleared`);
    } catch (e) {
      info(`=== ENTER ${variant} ERROR === ${e}`);
      debug('forward err ' + e);
      // Při chybě neukládáme testovací prompt - jen logujeme chybu
      // Buffery nečistíme při chybě
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
