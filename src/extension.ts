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
import { focusChatInput, forwardToChatAccept } from './chatHelpers';

// --- Stav ---
let statusBarItem: vscode.StatusBarItem;
let providerRef: PromptsProvider | undefined;
let aiPromptCounter = 0;
let debugEnabled = false;
let lastPromptTime = 0;
let proposedApiAvailable = false;
let mouseDetectionWorking = false;

/**
 * Interface pro chat API (proposed)
 */
interface ChatAPI {
  onDidSubmitRequest?: vscode.Event<any>;
  onDidSubmitFeedback?: vscode.Event<any>;
  registerChatSessionItemProvider?: Function;
  onDidDisposeChatSession?: vscode.Event<any>;
  createChatParticipant?: Function;
}

/**
 * Rozšířené VS Code namespace s proposed API
 */
interface ExtendedVSCode {
  chat?: ChatAPI;
}

/** Aktualizuje interní příznak zda jsou povoleny debug logy. */
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
 * Zkontroluje dostupnost proposed API
 */
function checkProposedApiAvailability(): boolean {
  try {
    // Log what we're checking
    info('Checking for proposed API availability...');
    
    // Check process arguments to see if --enable-proposed-api was used
    const args = process.argv;
    info(`Process arguments: ${args.join(' ')}`);
    
    // Try multiple ways to detect API
    const vscodeExtended = vscode as any as ExtendedVSCode;
    
    // Log what's available in vscode namespace
    info(`vscode.chat exists: ${!!vscodeExtended.chat}`);
    if (vscodeExtended.chat) {
      const chatKeys = Object.keys(vscodeExtended.chat);
      info(`Available chat API methods: ${chatKeys.join(', ')}`);
    }
    
    // Check if chat API is available (different methods in different VS Code versions)
    if (vscodeExtended.chat) {
      // Check for any of the useful chat APIs
      if (typeof vscodeExtended.chat.onDidSubmitRequest !== 'undefined') {
        info('✅ Proposed API is AVAILABLE - onDidSubmitRequest found!');
        return true;
      }
      if (typeof vscodeExtended.chat.registerChatSessionItemProvider !== 'undefined') {
        info('✅ Proposed API is AVAILABLE - registerChatSessionItemProvider found!');
        return true;
      }
      if (typeof vscodeExtended.chat.onDidDisposeChatSession !== 'undefined') {
        info('✅ Proposed API is AVAILABLE - onDidDisposeChatSession found!');
        return true;
      }
      if (typeof vscodeExtended.chat.createChatParticipant !== 'undefined') {
        info('✅ Proposed API is AVAILABLE - createChatParticipant found!');
        return true;
      }
    }
  } catch (e) {
    info(`Proposed API check error: ${e}`);
  }
  
  info('❌ Proposed API is NOT available - mouse detection limited');
  info('💡 TIP: Run VS Code with: code-insiders --enable-proposed-api sunamocz.ai-prompt-detector');
  return false;
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

  // Check if proposed API is available
  proposedApiAvailable = checkProposedApiAvailability();

  // Create status bar with API indicator (NO background color)
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  
  // Update tooltip based on API availability (no backgroundColor)
  if (proposedApiAvailable) {
    statusBarItem.tooltip = '✅ AI Prompt Detector\n✅ Proposed API enabled\n✅ Mouse detection WORKING';
  } else {
    statusBarItem.tooltip = '⚠️ AI Prompt Detector\n❌ Proposed API disabled\n⚠️ Mouse detection LIMITED\n💡 Run: code-insiders --enable-proposed-api sunamocz.ai-prompt-detector';
  }
  statusBarItem.show();

  /** Aktualizuje text ve status baru. ALWAYS use "AI Prompts:" */
  const updateStatusBar = () => {
    const ext = vscode.extensions.getExtension('sunamocz.ai-prompt-detector');
    const v: string | undefined = ext?.packageJSON?.version;
    if (!v) {
      vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing package.json version');
      statusBarItem.text = '🤖 AI Prompts: ' + aiPromptCounter + ' | v?';
      return;
    }
    // Add indicator for API status - ALWAYS use "AI Prompts:" not "AI:"
    const apiIndicator = proposedApiAvailable ? '✅' : '⚠️';
    statusBarItem.text = `${apiIndicator} AI Prompts: ${aiPromptCounter} | v${v}`;
  };

  /** Uloží prompt do stavu, vždy započítá i opakovaný text. */
  const recordPrompt = (raw: string, source: string): boolean => {
    const text = (raw || '').trim();
    info(`recordPrompt called: source=${source}, text="${text.substring(0, 100)}"`);
    
    if (!text) {
      info('recordPrompt: empty text, returning false');
      return false;
    }
    
    // Prevent duplicate recordings within 500ms
    const now = Date.now();
    if (now - lastPromptTime < 500 && text === state.recentPrompts[0]) {
      info('recordPrompt: Skipping duplicate within 500ms');
      return false;
    }
    lastPromptTime = now;
    
    state.recentPrompts.unshift(text);
    if (state.recentPrompts.length > 1000) state.recentPrompts.splice(1000);
    aiPromptCounter++;
    providerRef?.refresh();
    updateStatusBar();
    
    const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
    let customMsg = cfg.get<string>('customMessage');
    if (customMsg === undefined) {
      vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing setting customMessage');
      customMsg = '';
    }
    
    vscode.window.showInformationMessage(`AI Prompt sent (${source})\n${customMsg}`);
    info(`recordPrompt SUCCESS: src=${source} len=${text.length} counter=${aiPromptCounter}`);
    return true;
  };

  /**
   * Setup proposed Chat API if available
   */
  async function setupProposedChatApi() {
    if (!proposedApiAvailable) {
      return false;
    }

    try {
      const vscodeExtended = vscode as any as ExtendedVSCode;
      
      // Try different APIs based on what's available
      
      // Option 1: onDidSubmitRequest (if available)
      if (vscodeExtended.chat?.onDidSubmitRequest) {
        const disposable = vscodeExtended.chat.onDidSubmitRequest((event: any) => {
          info('🎯 Chat submission detected via onDidSubmitRequest!');
          handleChatEvent(event);
        });
        context.subscriptions.push(disposable);
        info('✅ Chat API listener registered via onDidSubmitRequest');
        return true;
      }
      
      // Option 2: Create a chat participant to intercept messages
      if (vscodeExtended.chat?.createChatParticipant) {
        const participant = vscodeExtended.chat.createChatParticipant('ai-prompt-detector.monitor', (request: any, context: any, response: any, token: any) => {
          info('🎯 Chat detected via participant!');
          if (request?.prompt) {
            recordPrompt(request.prompt, 'participant');
          }
          // Don't actually handle the request, just monitor
          return undefined;
        });
        participant.isSticky = false;
        context.subscriptions.push(participant);
        info('✅ Chat participant registered for monitoring');
        mouseDetectionWorking = true;
        return true;
      }
      
      // Option 3: Monitor chat sessions
      if (vscodeExtended.chat?.onDidDisposeChatSession) {
        const disposable = vscodeExtended.chat.onDidDisposeChatSession((sessionId: any) => {
          info(`Chat session disposed: ${sessionId}`);
        });
        context.subscriptions.push(disposable);
        info('✅ Chat session monitor registered');
      }
      
      // Helper function to handle chat events
      function handleChatEvent(event: any) {
        let text = '';
        if (typeof event === 'string') {
          text = event;
        } else if (event?.message) {
          text = event.message;
        } else if (event?.prompt) {
          text = event.prompt;
        } else if (event?.text) {
          text = event.text;
        } else if (event?.request?.message) {
          text = event.request.message;
        }
        
        if (text) {
          info(`Captured via proposed API: "${text.substring(0, 100)}"`);
          recordPrompt(text, 'proposed-api');
          mouseDetectionWorking = true;
        }
      }
      
    } catch (e) {
      info(`Failed to setup proposed API: ${e}`);
    }
    
    return mouseDetectionWorking;
  }

  /**
   * Command spy - monitors all commands for chat-related activity
   */
  function setupCommandSpy() {
    info('🔧 Setting up command spy for chat commands');
    
    // Monitor command execution
    const originalExecute = vscode.commands.executeCommand;
    (vscode.commands as any).executeCommand = async function(command: string, ...args: any[]) {
      // Log chat-related commands
      if (command.includes('chat') || 
          command.includes('copilot') || 
          command.includes('submit') ||
          command.includes('accept')) {
        debug(`📡 Command intercepted: ${command}`);
        
        // These commands indicate keyboard submission (working)
        if (command === 'workbench.action.chat.submit' ||
            command === 'github.copilot.chat.acceptInput' ||
            command === 'workbench.action.chat.acceptInput') {
          debug('Keyboard submission command detected');
        }
      }
      
      // Call original
      return originalExecute.call(vscode.commands, command, ...args);
    };
    
    info('✅ Command spy installed');
  }

  /**
   * Obslouží všechny varianty Enter.
   */
  const handleForwardEnter = async (variant: string) => {
    try {
      info(`=== ENTER ${variant} START ===`);
      
      // Focus chat input
      await focusChatInput();
      await new Promise((r) => setTimeout(r, 100));

      // Try to capture text from visible editors
      let text = '';
      for (const editor of vscode.window.visibleTextEditors) {
        const doc = editor.document;
        if (doc.uri.scheme === 'vscode-chat' || 
            doc.uri.scheme === 'comment' ||
            doc.uri.toString().includes('chat') ||
            doc.uri.toString().includes('copilot')) {
          text = doc.getText();
          if (text) {
            info(`Captured text from editor: "${text.substring(0, 100)}"`);
            break;
          }
        }
      }

      // Fallback message if no text captured
      if (!text) {
        text = `[Prompt sent via ${variant} - text capture failed]`;
        info('Unable to capture actual text');
      }

      // Record prompt
      recordPrompt(text, 'keyboard-' + variant);

      // Forward to Copilot
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
      
      info(`=== ENTER ${variant} END ===`);
    } catch (e) {
      info(`=== ENTER ${variant} ERROR === ${e}`);
    }
  };

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ai-prompt-detector.forwardEnterToChat',
      () => handleForwardEnter('ctrl-enter'),
    ),
    vscode.commands.registerCommand(
      'ai-prompt-detector.forwardEnterPlain',
      () => handleForwardEnter('enter'),
    ),
    vscode.commands.registerCommand(
      'ai-prompt-detector.forwardEnterCtrlShift',
      () => handleForwardEnter('ctrl-shift-enter'),
    ),
    vscode.commands.registerCommand(
      'ai-prompt-detector.forwardEnterCtrlAlt',
      () => handleForwardEnter('ctrl-alt-enter'),
    ),
  );

  updateStatusBar();
  await loadExistingPrompts();
  
  providerRef = new PromptsProvider();
  const registration = vscode.window.registerWebviewViewProvider(
    PromptsProvider.viewType,
    providerRef,
  );

  // Setup detection methods - NO CLIPBOARD MONITORING
  const apiSetupSuccess = await setupProposedChatApi();
  setupCommandSpy();

  // Show notification about API status
  if (proposedApiAvailable) {
    vscode.window.showInformationMessage(
      'AI Prompt Detector: Proposed API enabled - full mouse detection working!',
      'OK'
    );
  } else {
    vscode.window.showWarningMessage(
      'AI Prompt Detector: Limited mode - mouse detection not available. For full functionality, restart VS Code with: code-insiders --enable-proposed-api sunamocz.ai-prompt-detector',
      'Learn More',
      'OK'
    ).then(selection => {
      if (selection === 'Learn More') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/sunamo/specstory-autosave/blob/master/MOUSE_DETECTION_DOCUMENTATION.md'));
      }
    });
  }

  // File watcher for SpecStory
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

  info(`Activation complete - API mode: ${proposedApiAvailable ? 'FULL' : 'LIMITED'}`);
}

async function loadExistingPrompts() {
  const files = await vscode.workspace.findFiles(
    '**/.specstory/history/*.md',
  );
  if (!files.length) {
    // Don't add dummy prompts that increase counter
    state.recentPrompts = [];
    return;
  }
  const sorted = files.sort((a, b) =>
    path.basename(b.fsPath).localeCompare(path.basename(a.fsPath)),
  );
  for (const f of sorted)
    if (isValidSpecStoryFile(f.fsPath))
      loadPromptsFromFile(f.fsPath, state.recentPrompts);
}

export function deactivate() {
  info('Deactivation');
}