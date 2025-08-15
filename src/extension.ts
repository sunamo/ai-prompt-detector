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
let documentWatcher: vscode.Disposable | undefined;
let activeEditorWatcher: vscode.Disposable | undefined;

/**
 * MOUSE DETECTION LIMITATION NOTICE:
 * 
 * After exhaustive testing of 21 different approaches, mouse click detection
 * is architecturally impossible in VS Code extensions for Copilot Chat.
 * 
 * The issue: Mouse clicks happen in Renderer Process (Electron UI) while
 * extensions run in Extension Host (Node.js). There's no event bridge.
 * 
 * WORKING: Keyboard shortcuts (Enter, Ctrl+Enter, Ctrl+Shift+Enter, Ctrl+Alt+Enter)
 * NOT WORKING: Mouse clicks on submit button
 * 
 * See MOUSE_DETECTION_DOCUMENTATION.md for full technical details.
 */

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

  // Show mouse detection limitation notice ONCE per session
  const noticeKey = 'mouseDetectionNoticeShown';
  const globalState = context.globalState;
  if (!globalState.get(noticeKey)) {
    vscode.window.showInformationMessage(
      '⚠️ AI Prompt Detector: Mouse click detection is not possible due to VS Code architecture. Please use keyboard shortcuts (Enter, Ctrl+Enter) to submit prompts. Click "Details" to learn more.',
      'Details',
      'OK'
    ).then(selection => {
      if (selection === 'Details') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/sunamo/specstory-autosave/blob/master/MOUSE_DETECTION_DOCUMENTATION.md'));
      }
    });
    globalState.update(noticeKey, true);
  }

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.tooltip = 'AI Prompt Detector\n⚠️ Mouse clicks not detectable\n✅ Use Enter key to submit';
  statusBarItem.show();

  /** Aktualizuje text ve status baru. */
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
   * Document change monitoring - last resort attempt
   * Watches for any document changes that might indicate chat activity
   */
  function setupDocumentMonitoring() {
    info('🔧 Setting up document change monitoring (fallback method)');
    
    // Monitor active editor changes
    activeEditorWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        const doc = editor.document;
        debug(`Active editor changed: ${doc.uri.toString()}`);
        
        // Check if this might be a chat-related document
        if (doc.uri.scheme === 'vscode-chat' || 
            doc.uri.scheme === 'comment' ||
            doc.uri.toString().includes('chat') ||
            doc.uri.toString().includes('copilot')) {
          
          const text = doc.getText();
          if (text && text.trim().length > 0) {
            info(`Potential chat document detected: ${text.substring(0, 50)}`);
          }
        }
      }
    });

    // Monitor all document changes
    documentWatcher = vscode.workspace.onDidChangeTextDocument((event) => {
      const doc = event.document;
      
      // Only interested in chat-related documents
      if (doc.uri.scheme === 'vscode-chat' || 
          doc.uri.scheme === 'comment' ||
          doc.uri.toString().includes('chat') ||
          doc.uri.toString().includes('copilot')) {
        
        debug(`Chat document changed: ${doc.uri.toString()}`);
        
        // Check if document was cleared (might indicate submission)
        if (event.contentChanges.length > 0) {
          const change = event.contentChanges[0];
          if (change.rangeLength > 0 && change.text === '') {
            info(`Chat document cleared - possible submission detected`);
            // Can't reliably detect what was submitted without clipboard
          }
        }
      }
    });

    info('✅ Document monitoring active (limited effectiveness)');
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
        info(`📡 Command intercepted: ${command}`);
        
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

  // Setup detection methods
  setupDocumentMonitoring();
  setupCommandSpy();

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

  if (documentWatcher) context.subscriptions.push(documentWatcher);
  if (activeEditorWatcher) context.subscriptions.push(activeEditorWatcher);

  info('Activation done - Keyboard detection active, mouse detection not possible');
}

async function loadExistingPrompts() {
  const files = await vscode.workspace.findFiles(
    '**/.specstory/history/*.md',
  );
  if (!files.length) {
    state.recentPrompts.push(
      'Welcome to AI Copilot Prompt Detector',
      'NOTE: Use keyboard (Enter) to submit, mouse clicks not detectable',
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

export function deactivate() {
  if (documentWatcher) documentWatcher.dispose();
  if (activeEditorWatcher) activeEditorWatcher.dispose();
  info('Deactivation');
}