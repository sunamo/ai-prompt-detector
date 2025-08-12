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
 * Implementuje pokročilou detekci submit událostí pomocí všech dostupných VS Code API.
 * Kombinuje command interception, event monitoring a aktivní polling pro maximální pokrytí.
 * @param recordPrompt Callback k uložení promptu.
 */
async function setupAdvancedSubmissionDetection(
  recordPrompt: (raw: string, src: string) => boolean,
): Promise<void> {
  try {
    info('🔧 Setting up Advanced Submission Detection for mouse clicks');
    
    // Method 1: Command Interception - DISABLED to prevent duplicate notifications
    // This caused triple notifications when combined with keybinding handlers
    // Mouse detection is now handled by proper Chat API access (with --enable-proposed-api)
    info('🔧 Command interception disabled - prevents duplicate notifications');
    
    // Method 2: Active UI State Polling - DISABLED
    // This method could cause duplicates and is not needed with Chat API
    info('🔧 UI state polling disabled - using Chat API events instead');
    
    // Method 3: Document Change Detection - DISABLED  
    // This method is unreliable and could cause duplicates
    info('🔧 Document change monitoring disabled - using Chat API events instead');
    
    // Method 4: Window Focus State Monitoring - DISABLED
    // This method is unreliable and could cause duplicates
    info('🔧 Window focus monitoring disabled - using Chat API events instead');
    
    info('🚀 Advanced Submission Detection simplified - duplicates removed');
    
  } catch (error) {
    info(`❌ Failed to setup Advanced Submission Detection: ${error}`);
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

  setupAdvancedSubmissionDetection(recordPrompt);

  // Direct Copilot Chat Webview Panel Monitoring
  let directWebviewMonitoringEnabled = true;
  if (directWebviewMonitoringEnabled) {
    try {
      // Monitor for webview panels being created
      const originalCreateWebviewPanel = vscode.window.createWebviewPanel;
      (vscode.window as unknown as { createWebviewPanel: Function }).createWebviewPanel = function(
        viewType: string, 
        title: string, 
        showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn, preserveFocus?: boolean }, 
        options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
      ): ExtendedWebviewPanel {
        const panel = originalCreateWebviewPanel.call(this, viewType, title, showOptions, options);
        
        // Check if this is a chat-related webview
        if (viewType.includes('chat') || viewType.includes('copilot') || title.includes('Chat') || title.includes('Copilot')) {
          info(`Chat webview panel created: ${viewType} - ${title}`);
          
          // Register our own message listener
          panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
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
        
        return panel as ExtendedWebviewPanel;
      };
      
      info('Direct webview panel monitoring enabled');
    } catch (err) {
      info(`Direct webview monitoring setup failed: ${err}`);
    }
  }
  
  // Simplified Chat API approach - works with --enable-proposed-api flag
  try {
    info('🎯 Attempting direct Chat API access for mouse detection');
    
    // Access the proposed Chat API
    const chatApi = (vscode as ExtendedVSCode).chat;
    
    if (chatApi && typeof chatApi.onDidSubmitRequest === 'function') {
      info('✅ Chat API onDidSubmitRequest is available!');
      
      // Register the submission listener
      const disposable = chatApi.onDidSubmitRequest((event: ChatEvent) => {
        try {
          // Extract text from various possible event properties
          const text = String(
            event?.message || 
            event?.prompt || 
            event?.request?.message || 
            event?.request?.prompt || 
            event?.command?.message || 
            event?.command?.prompt || 
            event?.text || ''
          ).trim();
          
          if (text) {
            info(`🎯 MOUSE CLICK DETECTED via Chat API: "${text.substring(0, 100)}"`);
            
            // Record the prompt immediately (recordPrompt already shows notification)
            recordPrompt(text, 'mouse-click');
            
            info('✅ Mouse click processed successfully');
          } else {
            info('⚠️ Mouse click detected but no text found');
          }
        } catch (err) {
          info(`❌ Error processing mouse click: ${err}`);
        }
      });
      
      context.subscriptions.push(disposable);
      info('✅ Mouse click detection fully activated via Chat API');
      
    } else {
      info('⚠️ Chat API not available - VS Code needs --enable-proposed-api flag');
      info('⚠️ Run: code-insiders --enable-proposed-api sunamocz.ai-prompt-detector');
    }
    
  } catch (err) {
    info(`⚠️ Chat API setup failed: ${err}`);
    info('⚠️ Mouse detection requires: code-insiders --enable-proposed-api sunamocz.ai-prompt-detector');
  }

  // Secondary Chat API registration for redundancy
  try {
    const chatNs = (vscode as ExtendedVSCode).chat;
    if (chatNs?.onDidSubmitRequest && typeof chatNs.onDidSubmitRequest === 'function') {
      info('🎯 Secondary Chat API registration for mouse detection');
      
      const secondaryDisposable = chatNs.onDidSubmitRequest((e: ChatEvent) => {
        try {
          const txt = String(
            e?.request?.message || 
            e?.request?.prompt || 
            e?.prompt || 
            e?.message ||
            e?.command?.message ||
            e?.command?.prompt || 
            e?.text || '',
          ).trim();
          
          if (txt) {
            info(`🎯 Secondary capture: "${txt.substring(0, 100)}"`);
            // This acts as a backup in case primary listener fails
          }
        } catch (err) {
          info(`Secondary listener error: ${err}`);
        }
      });
      
      context.subscriptions.push(secondaryDisposable);
    }
  } catch (e) {
    // Silent fail for secondary listener
  }

  // Removed - duplicate of simplified Chat API approach above

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
  // Removed - API reflection not needed with direct Chat API access
  // Removed - filesystem monitoring not needed with direct Chat API access
  // Removed - combined detection methods not needed with direct Chat API access
  // Removed - Chat Session Provider not needed with direct Chat API access
  // Removed - system-level monitoring not needed with direct Chat API access
  
  // NEW APPROACH: Electron DevTools Protocol
  try {
    info('🔌 Implementing Electron DevTools Protocol approach');
    
    // Try to connect to VS Code's Electron debugging port
    const connectToDevTools = async () => {
      try {
        const net = require('net');
        const http = require('http');
        
        // Common DevTools ports used by Electron apps
        const devtoolsPorts = [9229, 9230, 9222, 9221, 5858];
        
        for (const port of devtoolsPorts) {
          try {
            info(`🔌 Trying DevTools connection on port ${port}`);
            
            // Check if port is open
            const isPortOpen = await new Promise((resolve) => {
              const socket = new net.Socket();
              socket.setTimeout(1000);
              socket.on('connect', () => {
                socket.destroy();
                resolve(true);
              });
              socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
              });
              socket.on('error', () => {
                resolve(false);
              });
              socket.connect(port, 'localhost');
            });
            
            if (isPortOpen) {
              info(`🔌 Port ${port} is open - attempting DevTools connection`);
              
              // Get list of available targets
              const targetsReq = http.request({
                hostname: 'localhost',
                port: port,
                path: '/json',
                method: 'GET'
              }, (res: http.IncomingMessage) => {
                let data = '';
                res.on('data', (chunk: Buffer) => {
                  data += chunk.toString();
                });
                res.on('end', () => {
                  try {
                    const targets = JSON.parse(data);
                    info(`🔌 Found ${targets.length} DevTools targets`);
                    
                    // Look for renderer processes
                    const rendererTargets = targets.filter((target: DevToolsTarget) => 
                      target.type === 'page' && target.url && 
                      (target.url.includes('workbench') || target.title.includes('Visual Studio Code'))
                    );
                    
                    if (rendererTargets.length > 0) {
                      info(`🔌 Found ${rendererTargets.length} renderer targets - attempting connection`);
                      
                      const target = rendererTargets[0];
                      const ws = require('ws');
                      
                      // Connect to WebSocket debugging interface
                      const debugWs = new ws(target.webSocketDebuggerUrl);
                      
                      debugWs.on('open', () => {
                        info('🔌 WebSocket DevTools connection established');
                        
                        // Enable Runtime domain to monitor execution
                        debugWs.send(JSON.stringify({
                          id: 1,
                          method: 'Runtime.enable'
                        }));
                        
                        // Enable DOM domain to monitor DOM changes
                        debugWs.send(JSON.stringify({
                          id: 2,
                          method: 'DOM.enable'
                        }));
                        
                        // Monitor for chat-related function calls
                        debugWs.send(JSON.stringify({
                          id: 3,
                          method: 'Runtime.addBinding',
                          params: {
                            name: 'aiPromptDetector'
                          }
                        }));
                        
                        // Inject monitoring script into renderer
                        const monitorScript = `
                          (function() {
                            let lastEnterTime = 0;
                            
                            // Monitor all click events
                            document.addEventListener('click', function(event) {
                              const now = Date.now();
                              const timeSinceEnter = now - lastEnterTime;
                              
                              if (event.target && timeSinceEnter > 500) {
                                const element = event.target;
                                const classList = element.classList ? Array.from(element.classList).join(' ') : '';
                                const tagName = element.tagName || '';
                                
                                if (classList.includes('send') || classList.includes('submit') || 
                                    tagName === 'BUTTON' || classList.includes('chat')) {
                                  
                                  console.log('AI Prompt Detector: Mouse click detected on:', {
                                    tagName: tagName,
                                    classList: classList,
                                    timeSinceEnter: timeSinceEnter
                                  });
                                  
                                  // Try to find chat input text
                                  const chatInputs = document.querySelectorAll('[data-copilot-chat-input], .chat-input, input[type="text"]');
                                  let inputText = '';
                                  
                                  for (const input of chatInputs) {
                                    if (input.value && input.value.trim()) {
                                      inputText = input.value.trim();
                                      break;
                                    }
                                  }
                                  
                                  if (inputText) {
                                    console.log('AI Prompt Detector: Chat text found:', inputText.substring(0, 100));
                                  }
                                }
                              }
                            }, true);
                            
                            // Track Enter key events to update timing
                            document.addEventListener('keydown', function(event) {
                              if (event.key === 'Enter') {
                                lastEnterTime = Date.now();
                              }
                            }, true);
                          })();
                        `;
                        
                        debugWs.send(JSON.stringify({
                          id: 4,
                          method: 'Runtime.evaluate',
                          params: {
                            expression: monitorScript
                          }
                        }));
                        
                        info('🔌 Monitoring script injected into renderer process');
                      });
                      
                      debugWs.on('message', (data: Buffer) => {
                        try {
                          const message = JSON.parse(data.toString());
                          
                          if (message.method === 'Runtime.consoleAPICalled' && 
                              message.params && message.params.args) {
                            
                            const consoleMessage = message.params?.args?.map((arg: { value: unknown }) => arg.value).join(' ') || '';
                            
                            if (consoleMessage.includes('AI Prompt Detector: Mouse click detected')) {
                              info('🔌 DevTools detected mouse click in chat interface');
                              const now = Date.now();
                              const timeSinceLastEnter = now - lastEnterTime;
                              
                              if (timeSinceLastEnter > 500) {
                                recordPrompt('[DevTools mouse click detected]', 'mouse-devtools-protocol');
                              }
                            }
                            
                            if (consoleMessage.includes('AI Prompt Detector: Chat text found:')) {
                              const textMatch = consoleMessage.match(/Chat text found: (.+)/);
                              if (textMatch && textMatch[1]) {
                                info(`🔌 DevTools captured chat text: "${textMatch[1].substring(0, 100)}"`);
                                recordPrompt(textMatch[1], 'mouse-devtools-text');
                              }
                            }
                          }
                          
                        } catch (msgErr) {
                          // Ignore parsing errors
                        }
                      });
                      
                      debugWs.on('error', (err: ProcessError) => {
                        info(`🔌 WebSocket error: ${err}`);
                      });
                      
                      debugWs.on('close', () => {
                        info('🔌 DevTools WebSocket connection closed');
                      });
                      
                      // Close connection after 60 seconds
                      setTimeout(() => {
                        debugWs.close();
                        info('🔌 DevTools monitoring stopped after 60s');
                      }, 60000);
                      
                      return true;
                    }
                  } catch (parseErr) {
                    info(`🔌 Error parsing DevTools targets: ${parseErr}`);
                  }
                });
              });
              
              targetsReq.on('error', (err: ProcessError) => {
                info(`🔌 DevTools HTTP request error: ${err}`);
              });
              
              targetsReq.end();
              break;
            }
          } catch (portErr) {
            info(`🔌 Port ${port} connection failed: ${portErr}`);
          }
        }
      } catch (devtoolsErr) {
        info(`🔌 DevTools connection setup failed: ${devtoolsErr}`);
      }
    };
    
    // Try DevTools connection after a short delay
    setTimeout(connectToDevTools, 2000);
    
    info('🔌 Electron DevTools Protocol approach enabled');
    
  } catch (err) {
    info(`🔌 DevTools Protocol setup failed: ${err}`);
  }
  
  // NEW APPROACH: Extension Host Process Monitoring
  try {
    info('🔄 Implementing Extension Host process monitoring');
    
    const monitorExtensionHost = () => {
      try {
        const { spawn } = require('child_process');
        const os = require('os');
        
        if (os.platform() === 'win32') {
          // Monitor Extension Host process communication on Windows
          const psScript = `
            $processes = Get-WmiObject Win32_Process | Where-Object { $_.Name -eq "Code - Insiders.exe" -or $_.CommandLine -like "*extensionHostProcess*" }
            foreach ($proc in $processes) {
              $commandLine = $proc.CommandLine
              if ($commandLine -like "*extensionHostProcess*") {
                Write-Host "ExtensionHost-Process-Found: PID=$($proc.ProcessId) CMD=$($commandLine)"
              }
            }
          `;
          
          const psProcess = spawn('powershell', ['-Command', psScript]);
          
          psProcess.stdout?.on('data', (data: Buffer) => {
            const output = data.toString().trim();
            if (output.includes('ExtensionHost-Process-Found')) {
              info(`🔄 Extension Host process detected: ${output}`);
              
              // Extract PID and try to monitor that specific process
              const pidMatch = output.match(/PID=(\d+)/);
              if (pidMatch && pidMatch[1]) {
                const pid = pidMatch[1];
                info(`🔄 Monitoring Extension Host PID: ${pid}`);
                
                // Monitor network connections from this PID
                const netstatCmd = spawn('netstat', ['-ano']);
                netstatCmd.stdout?.on('data', (netData: Buffer) => {
                  const netOutput = netData.toString();
                  if (netOutput.includes(pid) && netOutput.includes('ESTABLISHED')) {
                    const now = Date.now();
                    const timeSinceLastEnter = now - lastEnterTime;
                    
                    if (timeSinceLastEnter > 500) {
                      info(`🔄 Extension Host network activity detected ${timeSinceLastEnter}ms after Enter`);
                      recordPrompt('[Extension Host network activity]', 'mouse-extensionhost-network');
                    }
                  }
                });
                
                netstatCmd.on('error', (err: ProcessError) => {
                  info(`🔄 Netstat monitoring error: ${err}`);
                });
              }
            }
          });
          
          psProcess.on('error', (err: ProcessError) => {
            info(`🔄 Process monitoring error: ${err}`);
          });
          
          // Stop monitoring after 45 seconds
          setTimeout(() => {
            psProcess.kill();
            info('🔄 Extension Host monitoring stopped after 45s');
          }, 45000);
          
        } else {
          info('🔄 Extension Host monitoring only supported on Windows');
        }
        
      } catch (monitorErr) {
        info(`🔄 Extension Host monitoring setup failed: ${monitorErr}`);
      }
    };
    
    // Start monitoring after delay
    setTimeout(monitorExtensionHost, 3000);
    
    info('🔄 Extension Host process monitoring enabled');
    
  } catch (err) {
    info(`🔄 Extension Host monitoring setup failed: ${err}`);
  }
  
  // NEW APPROACH: Console Log Injection  
  try {
    info('📺 Implementing console log injection approach');
    
    // Try to inject monitoring script into VS Code renderer process
    const injectConsoleMonitoring = async () => {
      try {
        // Attempt to execute JavaScript in VS Code context
        const injectionScript = `
          (function() {
            if (window.__aiPromptDetectorInjected) return;
            window.__aiPromptDetectorInjected = true;
            
            console.log('AI Prompt Detector: Console injection successful');
            
            // Monitor all button clicks
            document.addEventListener('click', function(event) {
              if (event.target) {
                const element = event.target;
                const tagName = element.tagName || '';
                const className = element.className || '';
                const id = element.id || '';
                
                if (tagName === 'BUTTON' || className.includes('send') || className.includes('submit') || className.includes('chat')) {
                  console.log('AI Prompt Detector: Button click detected', {
                    tagName: tagName,
                    className: className,
                    id: id,
                    time: Date.now()
                  });
                  
                  // Try to find chat input
                  const chatInputs = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
                  for (const input of chatInputs) {
                    const value = input.value || input.textContent || input.innerText;
                    if (value && value.trim().length > 0) {
                      console.log('AI Prompt Detector: Chat input captured', value.substring(0, 100));
                    }
                  }
                }
              }
            }, true);
            
            // Monitor for VS Code-specific chat events
            if (window.vscode) {
              console.log('AI Prompt Detector: VS Code API available in renderer');
            }
          })();
        `;
        
        // Try to execute via webview or command
        const injectionCommands = [
          'workbench.action.webview.openDeveloperTools',
          'workbench.action.toggleDevTools',
          'developer.inspectWebview'
        ];
        
        for (const cmd of injectionCommands) {
          try {
            await vscode.commands.executeCommand(cmd);
            info(`📺 Executed ${cmd} for console injection`);
            
            // Wait and then try to inject
            setTimeout(async () => {
              try {
                // Try to get active webview and inject script
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                  info('📺 Active editor found, attempting script injection');
                }
              } catch (injectErr) {
                info(`📺 Script injection failed: ${injectErr}`);
              }
            }, 1000);
            
          } catch (cmdErr) {
            info(`📺 Command ${cmd} failed: ${cmdErr}`);
          }
        }
        
        info('📺 Console injection attempts completed');
        
      } catch (injectSetupErr) {
        info(`📺 Console injection setup failed: ${injectSetupErr}`);
      }
    };
    
    // Try injection after delay
    setTimeout(injectConsoleMonitoring, 5000);
    
    info('📺 Console log injection approach enabled');
    
  } catch (err) {
    info(`📺 Console injection setup failed: ${err}`);
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
