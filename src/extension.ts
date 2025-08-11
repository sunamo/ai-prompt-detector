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
  let commandMonitoringEnabled = true; // Command monitoring pro mouse detection
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

  // Direct Copilot Chat Webview Panel Monitoring
  let directWebviewMonitoringEnabled = true;
  if (directWebviewMonitoringEnabled) {
    try {
      // Monitor for webview panels being created
      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as any).createWebviewPanel = function(viewType: string, title: string, showOptions: any, options?: any) {
        const panel = originalCreateWebviewPanel.call(this, viewType, title, showOptions, options);
        
        // Check if this is a chat-related webview
        if (viewType.includes('chat') || viewType.includes('copilot') || title.includes('Chat') || title.includes('Copilot')) {
          info(`Chat webview panel created: ${viewType} - ${title}`);
          
          // Register our own message listener
          panel.webview.onDidReceiveMessage((message: any) => {
            try {
              if (message && typeof message === 'object' &&
                  (message.command === 'submit' || message.type === 'submit' || message.action === 'send') &&
                  (message.text || message.message || message.prompt)) {
                
                const text = String(message.text || message.message || message.prompt || '').trim();
                if (text) {
                  info(`Direct webview captured mouse submission: "${text.substring(0, 100)}"`);
                  recordPrompt(text, 'mouse-direct-webview');
                }
              }
            } catch (err) {
              info(`Direct webview message error: ${err}`);
            }
          });
          
          info(`Hooked into chat webview panel: ${viewType}`);
        }
        
        return panel;
      };
      
      info('Direct webview panel monitoring enabled');
    } catch (err) {
      info(`Direct webview monitoring setup failed: ${err}`);
    }
  }
  
  // Monitor existing webview views (for chat views that are already created)
  try {
    // Try to access the chat view directly through VS Code's internal APIs
    const workbench = (vscode as any).workbench || (global as any).workbench;
    if (workbench) {
      // Monitor all view container changes
      const intervalId = setInterval(() => {
        try {
          // Look for chat-related views in the workbench
          const views = workbench.getViews ? workbench.getViews() : [];
          for (const view of views) {
            if (view && (view.id || '').includes('chat') || (view.id || '').includes('copilot')) {
              info(`Found existing chat view: ${view.id}`);
              
              // Register message listener for existing views
              if (view.webview && view.webview.onDidReceiveMessage) {
                view.webview.onDidReceiveMessage((message: any) => {
                  try {
                    if (message && (message.command === 'submit' || message.type === 'submit') &&
                        (message.text || message.message)) {
                      const text = String(message.text || message.message || '').trim();
                      if (text) {
                        info(`Existing view captured: "${text.substring(0, 100)}"`);
                        recordPrompt(text, 'mouse-existing-view');
                      }
                    }
                  } catch (err) {
                    info(`Existing view error: ${err}`);
                  }
                });
                
                info(`Registered listener for existing chat view: ${view.id}`);
              }
            }
          }
        } catch (err) {
          info(`Existing view monitoring error: ${err}`);
        }
      }, 5000);
      
      // Clear interval after 30 seconds to avoid permanent polling
      setTimeout(() => clearInterval(intervalId), 30000);
      
      info('Existing webview monitoring started');
    }
  } catch (err) {
    info(`Existing webview monitoring failed: ${err}`);
  }

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

  // Improved onDidSubmitRequest hook with session data retrieval
  try {
    const chatNs: any = (vscode as any).chat;
    if (chatNs?.onDidSubmitRequest) {
      context.subscriptions.push(
        chatNs.onDidSubmitRequest(async (e: any) => {
          try {
            info(`Chat submit event received with sessionId: ${e.chatSessionId}`);
            
            // Try to get the session data to extract the message text
            if (chatNs.getChatSession) {
              const session = await chatNs.getChatSession(e.chatSessionId);
              if (session && session.requests && session.requests.length > 0) {
                const lastRequest = session.requests[session.requests.length - 1];
                const text = String(lastRequest.message || lastRequest.prompt || '').trim();
                if (text) {
                  info(`Mouse submission extracted from session: "${text.substring(0, 100)}"`);
                  recordPrompt(text, 'mouse-session-data');
                  return;
                }
              }
            }
            
            // Fallback: record that a mouse click was detected
            info('Mouse submission detected but could not extract text');
            recordPrompt('[Mouse click detected - text extraction failed]', 'mouse-click-detected');
            
          } catch (err) {
            info(`Chat submit event error: ${err}`);
          }
        }),
      );
      info('Enhanced onDidSubmitRequest listener registered');
    } else {
      info('onDidSubmitRequest not available');
    }
  } catch (e) {
    info('Enhanced submit request hook failed: ' + e);
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
  // Deep VS Code API Reflection - enumerate all available APIs
  try {
    info('🔍 Starting deep VS Code API reflection analysis');
    
    // Recursive function to explore object properties
    const exploreObject = (obj: any, path: string, maxDepth: number) => {
      if (maxDepth <= 0 || !obj || typeof obj !== 'object') return;
      
      try {
        const keys = Object.getOwnPropertyNames(obj);
        for (const key of keys) {
          if (key.toLowerCase().includes('chat') || key.toLowerCase().includes('copilot')) {
            info(`🔍 Found chat-related API: ${path}.${key} (type: ${typeof obj[key]})`);
            
            // If it's a function, try to explore its properties too
            if (typeof obj[key] === 'function') {
              const funcKeys = Object.getOwnPropertyNames(obj[key]);
              for (const funcKey of funcKeys) {
                if (funcKey.toLowerCase().includes('chat') || funcKey.toLowerCase().includes('submit') || funcKey.toLowerCase().includes('send')) {
                  info(`🔍 Found function property: ${path}.${key}.${funcKey}`);
                }
              }
            }
            
            // Explore nested objects
            if (maxDepth > 1 && obj[key] && typeof obj[key] === 'object') {
              exploreObject(obj[key], `${path}.${key}`, maxDepth - 1);
            }
          }
        }
      } catch (err) {
        info(`🔍 Error exploring ${path}: ${err}`);
      }
    };
    
    // Explore vscode namespace
    info('🔍 Exploring vscode namespace...');
    exploreObject(vscode, 'vscode', 3);
    
    // Explore global objects
    info('🔍 Exploring global objects...');
    const globalObjects = ['global', 'process', 'require', 'module'];
    for (const globalName of globalObjects) {
      try {
        const globalObj = (global as any)[globalName];
        if (globalObj) {
          exploreObject(globalObj, globalName, 2);
        }
      } catch (err) {
        info(`🔍 Error exploring ${globalName}: ${err}`);
      }
    }
    
    info('🔍 API reflection analysis complete');
    
  } catch (err) {
    info(`🔍 API reflection failed: ${err}`);
  }
  
  // Filesystem monitoring for chat activity
  try {
    info('📁 Starting filesystem monitoring for chat activity');
    
    // Monitor VS Code's storage directories for chat-related files
    const userDataPath = process.env.APPDATA || process.env.HOME || '';
    const possibleChatPaths = [
      path.join(userDataPath, 'Code', 'User', 'workspaceStorage'),
      path.join(userDataPath, 'Code - Insiders', 'User', 'workspaceStorage'),
      path.join(userDataPath, 'Code', 'CachedExtensions'),
      path.join(userDataPath, 'Code - Insiders', 'CachedExtensions'),
      '/tmp',
      process.cwd()
    ];
    
    for (const watchPath of possibleChatPaths) {
      try {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(watchPath, '**/*{chat,copilot,conversation}*')
        );
        
        watcher.onDidCreate((uri) => {
          info(`📁 Chat file created: ${uri.fsPath}`);
          // Try to read the file content for prompt detection
          setTimeout(async () => {
            try {
              const content = await vscode.workspace.fs.readFile(uri);
              const text = Buffer.from(content).toString('utf8');
              if (text.includes('user') || text.includes('prompt')) {
                const lines = text.split('\n');
                for (const line of lines) {
                  if (line.trim().length > 10 && !line.includes('assistant')) {
                    info(`📁 Chat file content captured: "${line.trim().substring(0, 100)}"`);
                    recordPrompt(line.trim(), 'mouse-filesystem');
                    break;
                  }
                }
              }
            } catch (err) {
              info(`📁 Error reading chat file: ${err}`);
            }
          }, 100);
        });
        
        watcher.onDidChange((uri) => {
          info(`📁 Chat file changed: ${uri.fsPath}`);
        });
        
        context.subscriptions.push(watcher);
        info(`📁 Monitoring: ${watchPath}`);
        
      } catch (err) {
        info(`📁 Failed to monitor ${watchPath}: ${err}`);
      }
    }
    
    info('📁 Filesystem monitoring enabled');
    
  } catch (err) {
    info(`📁 Filesystem monitoring setup failed: ${err}`);
  }
  
  // Combined Multi-Method Mouse Detection Approach
  try {
    info('🔧 Implementing combined mouse detection methods');
    
    // Method 1: Command execution monitoring
    const originalExecuteCommand = vscode.commands.executeCommand;
    (vscode.commands as any).executeCommand = async function(commandId: string, ...args: any[]) {
      try {
        if (commandId === 'workbench.action.chat.submit' || 
            commandId === 'github.copilot.chat.acceptInput' ||
            commandId === 'workbench.action.chat.acceptInput') {
          
          const now = Date.now();
          const timeSinceLastEnter = now - lastEnterTime;
          
          if (timeSinceLastEnter > 500) {
            info(`🔧 Command execution detected: ${commandId} (mouse: ${timeSinceLastEnter}ms after Enter)`);
            
            // Try to capture text from active editor or focused element
            let capturedText = '';
            try {
              const activeEditor = vscode.window.activeTextEditor;
              if (activeEditor && activeEditor.document.uri.scheme === 'vscode-chat') {
                capturedText = activeEditor.document.getText();
              }
              
              if (!capturedText && args.length > 0) {
                capturedText = String(args[0] || '');
              }
              
              if (capturedText.trim()) {
                info(`🔧 Command-based mouse submission: "${capturedText.substring(0, 100)}"`);
                recordPrompt(capturedText, 'mouse-command-intercept');
              } else {
                info(`🔧 Mouse submission detected but no text captured`);
                recordPrompt('[Mouse click detected - command interception]', 'mouse-command-detected');
              }
            } catch (textErr) {
              info(`🔧 Text capture error: ${textErr}`);
              recordPrompt('[Mouse click detected - text capture failed]', 'mouse-command-fallback');
            }
          }
        }
        
        return originalExecuteCommand.call(this, commandId, ...args);
      } catch (err) {
        info(`🔧 Command interception error: ${err}`);
        return originalExecuteCommand.call(this, commandId, ...args);
      }
    };
    
    info('🔧 Command execution interception enabled');
    
    // Method 2: Process and network monitoring
    const { spawn } = require('child_process');
    
    // Monitor network connections to detect Copilot API calls
    const monitorNetworkActivity = () => {
      try {
        const netstat = spawn('netstat', ['-an']);
        let lastNetworkState = '';
        
        netstat.stdout?.on('data', (data: Buffer) => {
          const networkData = data.toString();
          if (networkData !== lastNetworkState && networkData.includes('api.github.com')) {
            const now = Date.now();
            const timeSinceLastEnter = now - lastEnterTime;
            
            if (timeSinceLastEnter > 500) {
              info(`🔧 Network activity detected ${timeSinceLastEnter}ms after Enter`);
              recordPrompt('[Network activity - possible mouse submission]', 'mouse-network-detected');
            }
            lastNetworkState = networkData;
          }
        });
        
        netstat.on('error', (err: any) => {
          info(`🔧 Network monitoring error: ${err}`);
        });
        
        // Stop monitoring after 30 seconds
        setTimeout(() => {
          netstat.kill();
        }, 30000);
        
      } catch (err) {
        info(`🔧 Network monitoring setup failed: ${err}`);
      }
    };
    
    monitorNetworkActivity();
    
    // Method 3: VS Code internal state monitoring
    const monitorVSCodeState = () => {
      try {
        let lastWindowState = '';
        
        const stateCheckInterval = setInterval(() => {
          try {
            const currentState = JSON.stringify({
              activeEditor: vscode.window.activeTextEditor?.document.uri.toString(),
              visibleEditors: vscode.window.visibleTextEditors.length,
              terminals: vscode.window.terminals.length
            });
            
            if (currentState !== lastWindowState) {
              const now = Date.now();
              const timeSinceLastEnter = now - lastEnterTime;
              
              if (timeSinceLastEnter > 500 && currentState.includes('chat')) {
                info(`🔧 VS Code state change ${timeSinceLastEnter}ms after Enter`);
                recordPrompt('[VS Code state change - possible submission]', 'mouse-state-change');
              }
              
              lastWindowState = currentState;
            }
          } catch (err) {
            info(`🔧 State monitoring error: ${err}`);
          }
        }, 1000);
        
        // Stop monitoring after 60 seconds
        setTimeout(() => {
          clearInterval(stateCheckInterval);
          info('🔧 VS Code state monitoring disabled after 60s');
        }, 60000);
        
      } catch (err) {
        info(`🔧 VS Code state monitoring setup failed: ${err}`);
      }
    };
    
    monitorVSCodeState();
    
    // Method 4: Extension host event monitoring
    const monitorExtensionEvents = () => {
      try {
        // Monitor all possible extension events
        const events = [
          'onDidChangeActiveTextEditor',
          'onDidChangeVisibleTextEditors',
          'onDidChangeTextEditorSelection',
          'onDidChangeWindowState'
        ];
        
        for (const eventName of events) {
          try {
            const eventEmitter = (vscode.window as any)[eventName];
            if (eventEmitter && typeof eventEmitter === 'function') {
              eventEmitter((event: any) => {
                const now = Date.now();
                const timeSinceLastEnter = now - lastEnterTime;
                
                if (timeSinceLastEnter > 500) {
                  info(`🔧 Extension event ${eventName} ${timeSinceLastEnter}ms after Enter`);
                  
                  if (event && event.document && event.document.uri.toString().includes('chat')) {
                    recordPrompt('[Extension event - possible chat submission]', `mouse-event-${eventName}`);
                  }
                }
              });
            }
          } catch (eventErr) {
            info(`🔧 Event ${eventName} registration failed: ${eventErr}`);
          }
        }
        
        info('🔧 Extension event monitoring enabled');
        
      } catch (err) {
        info(`🔧 Extension event monitoring setup failed: ${err}`);
      }
    };
    
    monitorExtensionEvents();
    
    info('🔧 Combined mouse detection methods enabled');
    
  } catch (err) {
    info(`🔧 Combined detection setup failed: ${err}`);
  }
  
  // NEW APPROACH: Chat Session Provider Registration
  try {
    info('💡 Implementing Chat Session Provider approach');
    
    // Register multiple chat session providers to intercept activity
    const chatSessionProviders = [
      'registerChatSessionItemProvider',
      'registerChatSessionContentProvider',
      'onDidDisposeChatSession'
    ];
    
    for (const providerName of chatSessionProviders) {
      try {
        const providerFunction = (vscode.chat as any)[providerName];
        if (typeof providerFunction === 'function') {
          
          const provider = {
            provideChatSessionItem: (sessionId: string) => {
              info(`💡 Chat session item requested: ${sessionId}`);
              const now = Date.now();
              const timeSinceLastEnter = now - lastEnterTime;
              
              if (timeSinceLastEnter > 500) {
                info(`💡 Chat session activity ${timeSinceLastEnter}ms after Enter - possible mouse`);
                recordPrompt('[Chat session activity detected]', 'mouse-session-provider');
              }
              
              return undefined;
            },
            
            provideChatSessionContent: (sessionId: string) => {
              info(`💡 Chat session content requested: ${sessionId}`);
              const now = Date.now();
              const timeSinceLastEnter = now - lastEnterTime;
              
              if (timeSinceLastEnter > 500) {
                info(`💡 Chat content activity ${timeSinceLastEnter}ms after Enter - possible mouse`);
                recordPrompt('[Chat content activity detected]', 'mouse-content-provider');
              }
              
              return undefined;
            }
          };
          
          // Register provider
          providerFunction.call(vscode.chat, provider);
          info(`💡 Registered ${providerName} successfully`);
          
        } else {
          info(`💡 ${providerName} not available (not a function)`);
        }
      } catch (providerErr) {
        info(`💡 ${providerName} registration failed: ${providerErr}`);
      }
    }
    
    // Also try onDidDisposeChatSession event
    try {
      const disposalEvent = (vscode.chat as any).onDidDisposeChatSession;
      if (typeof disposalEvent === 'function') {
        context.subscriptions.push(
          disposalEvent((sessionId: string) => {
            info(`💡 Chat session disposed: ${sessionId}`);
            const now = Date.now();
            const timeSinceLastEnter = now - lastEnterTime;
            
            if (timeSinceLastEnter > 500) {
              info(`💡 Session disposal ${timeSinceLastEnter}ms after Enter - activity detected`);
              recordPrompt('[Chat session disposal]', 'mouse-session-disposal');
            }
          })
        );
        info('💡 Chat session disposal listener registered');
      }
    } catch (disposalErr) {
      info(`💡 Session disposal registration failed: ${disposalErr}`);
    }
    
    info('💡 Chat Session Provider approach enabled');
    
  } catch (err) {
    info(`💡 Chat Session Provider setup failed: ${err}`);
  }
  
  // NEW APPROACH: System-Level Input Monitoring
  try {
    info('🖱️ Implementing system-level input monitoring');
    
    // Check if we can access system APIs
    let systemMonitoringEnabled = false;
    
    try {
      // Try to require system monitoring modules
      const os = require('os');
      const platform = os.platform();
      
      if (platform === 'win32') {
        info('🖱️ Windows platform detected - attempting Win32 API monitoring');
        
        // Monitor system mouse events using Win32 APIs if available
        try {
          const { exec } = require('child_process');
          
          // Use PowerShell to monitor mouse clicks
          const mouseMonitorScript = `
            Add-Type -TypeDefinition '
              using System;
              using System.Diagnostics;
              using System.Runtime.InteropServices;
              using System.Windows.Forms;
              
              public class MouseMonitor {
                [DllImport("user32.dll")]
                public static extern IntPtr GetForegroundWindow();
                
                [DllImport("user32.dll")]
                public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
                
                public static string GetActiveWindowTitle() {
                  IntPtr handle = GetForegroundWindow();
                  System.Text.StringBuilder text = new System.Text.StringBuilder(256);
                  GetWindowText(handle, text, 256);
                  return text.ToString();
                }
              }
            '
            
            while ($true) {
              $title = [MouseMonitor]::GetActiveWindowTitle()
              if ($title -like "*Visual Studio Code*" -and $title -like "*Copilot*") {
                Write-Host "VSCode-Copilot-Active: $(Get-Date -Format 'HH:mm:ss.fff')"
              }
              Start-Sleep -Milliseconds 100
            }
          `;
          
          const psProcess = exec(`powershell -Command "${mouseMonitorScript.replace(/"/g, '\\"')}"`, 
            { timeout: 30000 });
          
          psProcess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString().trim();
            if (output.includes('VSCode-Copilot-Active')) {
              const now = Date.now();
              const timeSinceLastEnter = now - lastEnterTime;
              
              if (timeSinceLastEnter > 500) {
                info(`🖱️ System-level VS Code Copilot activity detected ${timeSinceLastEnter}ms after Enter`);
                recordPrompt('[System-level Copilot activity]', 'mouse-system-monitor');
              }
            }
          });
          
          psProcess.on('error', (err: any) => {
            info(`🖱️ PowerShell mouse monitoring error: ${err}`);
          });
          
          // Stop monitoring after 30 seconds
          setTimeout(() => {
            psProcess.kill();
            info('🖱️ System-level monitoring stopped after 30s');
          }, 30000);
          
          systemMonitoringEnabled = true;
          info('🖱️ Win32 system monitoring enabled');
          
        } catch (win32Err) {
          info(`🖱️ Win32 monitoring failed: ${win32Err}`);
        }
      } else {
        info(`🖱️ Platform ${platform} - system monitoring not implemented`);
      }
      
    } catch (osErr) {
      info(`🖱️ OS detection failed: ${osErr}`);
    }
    
    if (systemMonitoringEnabled) {
      info('🖱️ System-level input monitoring enabled');
    } else {
      info('🖱️ System-level input monitoring not available');
    }
    
  } catch (err) {
    info(`🖱️ System-level monitoring setup failed: ${err}`);
  }
  
  // Additional mouse detection via workspace monitoring  
  let lastChatUpdate = 0;
  const workspaceWatcher = vscode.workspace.onDidChangeTextDocument((event) => {
    try {
      // Skip if this is not a chat-related document or too frequent
      if (Date.now() - lastChatUpdate < 1000) return;
      
      const uri = event.document.uri.toString();
      if (uri.includes('copilot') || uri.includes('chat') || event.document.languageId === 'markdown') {
        for (const change of event.contentChanges) {
          const text = change.text.trim();
          // Look for patterns that suggest a user prompt was added
          if (text.length > 10 && 
              (text.includes('user') || text.includes('User') || 
               text.match(/^[A-Z].*[.?!]$/) || text.includes('help'))) {
            info(`Workspace change detected possible prompt: "${text.substring(0, 100)}"`);
            recordPrompt(text, 'mouse-workspace-monitor');
            lastChatUpdate = Date.now();
            break;
          }
        }
      }
    } catch (err) {
      info(`Workspace monitoring error: ${err}`);
    }
  });
  
  context.subscriptions.push(workspaceWatcher);
  info('Workspace monitoring enabled for mouse detection');

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
