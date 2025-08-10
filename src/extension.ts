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

  /** Uloží prompt do stavu, vždy započítá i opakovaný text.
   * INVARIANT: Žádný default parametr v get(); pokud customMessage chybí → notifikace.
   */
  const recordPrompt = (raw: string, source: string): boolean => {
    const text = (raw || '').trim();
    if (!text) return false;
    state.recentPrompts.unshift(text);
    if (state.recentPrompts.length > 1000) state.recentPrompts.splice(1000);
    aiPromptCounter++;
    providerRef?.refresh();
    updateStatusBar();
    typingBuffer = '';
    lastSnapshot = '';
    const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
    let customMsg = cfg.get<string>('customMessage');
    if (customMsg === undefined) {
      vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing setting customMessage');
      customMsg = ''; // pokračujeme bez textu – politika: žádný druhý parametr fallback
    }
    const notify = () => vscode.window.showInformationMessage(`AI Prompt sent (${source})\n${customMsg}`);
    if (source.startsWith('enter')) notify(); else setTimeout(notify, 250);
    debug(`recordPrompt ok src=${source} len=${text.length} (duplicates allowed)`);
    return true;
  };

  if (!snapshotTimer) {
    snapshotTimer = setInterval(async () => {
      try {
        // Nepřetahovat fokus při pasivním snapshotu (attemptFocus=false)
        const txt = await getChatInputText(false);
        if (txt && txt !== typingBuffer) {
          lastSnapshot = txt;
        }
      } catch {}
    }, 1200);
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
              if (t && !String(t).includes('\n')) {
                typingBuffer += t;
                if (typingBuffer.length > 8000)
                  typingBuffer = typingBuffer.slice(-8000);
              }
              return;
            }
            if (cmd === 'deleteLeft') {
              typingBuffer = typingBuffer.slice(0, -1);
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
                    const snap = await getChatInputText();
                    if (
                      !recordPrompt(
                        snap,
                        dynamicSendCommands.has(cmd)
                          ? 'dynamic-cmd'
                          : heuristicMatch
                            ? 'heuristic-cmd'
                            : 'cmd',
                      )
                    ) {
                      if (lastSnapshot)
                        recordPrompt(lastSnapshot, 'snapshot-late');
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
   * 7) prázdný prompt log pouze pokud nic nezískáno ale odeslání proběhlo
   * @param variant Identifikátor varianty (plain|ctrl|ctrl-shift|ctrl-alt)
   */
  const handleForwardEnter = async (variant: string) => {
    try {
      debug('Enter variant invoked: ' + variant);

      // 1) Fokus do vstupu – zvyšuje šanci na úspěšné čtení textu
      await focusChatInput();

      // 2) Primární pokus o zachycení textu
      let text = await getChatInputText();

      // 3) Fallback na buffer nebo snapshot (buffer má přednost – je nejčerstvější)
      if (!text && typingBuffer.trim()) text = typingBuffer.trim();
      else if (!text && lastSnapshot) text = lastSnapshot;

      // 4) Pokud stále nic, krátký retry po drobném zpoždění (focus se mohl aplikovat)
      if (!text) {
        await new Promise((r) => setTimeout(r, 35));
        const retry = await getChatInputText();
        if (retry) text = retry;
        else if (typingBuffer.trim()) text = typingBuffer.trim();
        else if (lastSnapshot) text = lastSnapshot;
      }

      // 5) Logujeme pouze skutečný neprázdný text – neukládáme prázdné placeholdery
      if (text && text.trim()) {
        recordPrompt(text, 'enter-' + variant);
      }

      // 6) Dopředné odeslání akce do Copilot / Chat
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
            break;
          } catch {}
        }
      }

      // 7) Skutečně prázdný prompt – nyní přidán DODATEČNÝ late-capture pokus před uložením placeholderu
      if (ok && !text) {
        try {
          // Krátké zpoždění – po odeslání se model někdy naplní (race condition)
          await new Promise((r) => setTimeout(r, 45));
          let late = await getChatInputText();
          if (!late && typingBuffer.trim()) late = typingBuffer.trim();
          else if (!late && lastSnapshot) late = lastSnapshot;
          if (late && late.trim()) {
            recordPrompt(late, 'enter-late-' + variant);
          } else {
            recordPrompt('(empty prompt)', 'enter-empty-' + variant);
          }
        } catch {
          recordPrompt('(empty prompt)', 'enter-empty-' + variant);
        }
      }
    } catch (e) {
      debug('forward err ' + e);
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
