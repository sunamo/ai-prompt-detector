/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { state, PromptEntry } from './state';
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
  onDidSubmitRequest?: vscode.Event<unknown>;
  onDidSubmitFeedback?: vscode.Event<unknown>;
  registerChatSessionItemProvider?: Function;
  onDidDisposeChatSession?: vscode.Event<unknown>;
  createChatParticipant?: Function;
  createDynamicChatParticipant?: Function;
  registerChatSessionContentProvider?: Function;
  registerRelatedFilesProvider?: Function;
  registerChatOutputRenderer?: Function;
  registerMappedEditsProvider?: Function;
  registerChatParticipantDetectionProvider?: Function;
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
    const vscodeExtended = vscode as unknown as ExtendedVSCode;
    
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

  // Track when we detect via keyboard
  let lastKeyboardDetection = 0;
  
  /** Uloží prompt do stavu, vždy započítá i opakovaný text. */
  const recordPrompt = (raw: string, source: string): boolean => {
    const text = (raw || '').trim();
    info(`recordPrompt called: source=${source}, text="${text.substring(0, 100)}"`);
    
    // Mark keyboard detection time
    if (source.includes('keyboard')) {
      lastKeyboardDetection = Date.now();
    }
    
    if (!text) {
      info('recordPrompt: empty text, returning false');
      return false;
    }
    
    // Prevent duplicate recordings within 500ms
    const now = Date.now();
    if (now - lastPromptTime < 500 && text === state.recentPrompts[0]?.text) {
      info('recordPrompt: Skipping duplicate within 500ms');
      return false;
    }
    lastPromptTime = now;
    
    state.recentPrompts.unshift({ text, isLive: false, timestamp: now, id: `record-${now}` });
    if (state.recentPrompts.length > 1000) state.recentPrompts.splice(1000);
    
    // Always increment counter and show notification
    aiPromptCounter++;
    providerRef?.refresh();
    updateStatusBar();
    
    const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
    let customMsg = cfg.get<string>('customMessage');
    if (customMsg === undefined) {
      vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing setting customMessage');
      customMsg = '';
    }

    // Truncate text for notification if too long (max 200 chars)
    const displayText = text.length > 200 ? text.substring(0, 200) + '...' : text;

    // Show notification with actual prompt text
    const notificationText = customMsg
      ? `AI Prompt sent (${source})\n${customMsg}\n\nPrompt: ${displayText}`
      : `AI Prompt sent (${source})\n\nPrompt: ${displayText}`;

    vscode.window.showInformationMessage(notificationText);
    info(`recordPrompt SUCCESS: src=${source} len=${text.length} counter=${aiPromptCounter}`);
    return true;
  };

  // Removed tryGetChatWidget - it may interfere with normal chat functionality

  /**
   * Setup proposed Chat API if available
   */
  async function setupProposedChatApi() {
    if (!proposedApiAvailable) {
      return false;
    }

    try {
      const vscodeExtended = vscode as unknown as ExtendedVSCode;
      
      // Try different APIs based on what's available
      
      // Option 0: Try to get widget and listen to onDidAcceptInput
      // DISABLED: This approach may interfere with normal mouse functionality
      // const widget = await tryGetChatWidget();
      // if (widget) {
      //   const w = widget as { onDidAcceptInput?: vscode.Event<void> };
      //   if (w.onDidAcceptInput) {
      //     const disposable = w.onDidAcceptInput(() => {
      //       info('🎯 MOUSE/KEYBOARD DETECTED via widget.onDidAcceptInput!');
      //       // Try to get input text from widget
      //       const wInput = widget as { input?: { getValue?: () => string }; getInput?: () => string };
      //       let text = '';
      //       if (wInput.getInput && typeof wInput.getInput === 'function') {
      //         text = wInput.getInput();
      //       } else if (wInput.input?.getValue && typeof wInput.input.getValue === 'function') {
      //         text = wInput.input.getValue();
      //       }
      //       if (text) {
      //         recordPrompt(text, 'widget-accept');
      //       } else {
      //         recordPrompt('[Prompt sent - text capture failed]', 'widget-accept');
      //       }
      //     });
      //     context.subscriptions.push(disposable);
      //     info('✅ Widget onDidAcceptInput listener registered - MOUSE DETECTION SHOULD WORK!');
      //     mouseDetectionWorking = true;
      //     return true;
      //   }
      // }
      
      // Option 1: onDidSubmitRequest (if available)
      if (vscodeExtended.chat?.onDidSubmitRequest) {
        const disposable = vscodeExtended.chat.onDidSubmitRequest((event: unknown) => {
          info('🎯 Chat submission detected via onDidSubmitRequest!');
          handleChatEvent(event);
        });
        context.subscriptions.push(disposable);
        info('✅ Chat API listener registered via onDidSubmitRequest');
        return true;
      }
      
      // Option 2: Try multiple participant approaches
      // 2a: Dynamic chat participant
      if (vscodeExtended.chat?.createDynamicChatParticipant) {
        try {
          const dynamicParticipant = vscodeExtended.chat.createDynamicChatParticipant('ai-prompt-detector.dynamic', {
            name: 'AI Detector',
            description: 'Monitors AI prompts',
            handler: (request: unknown, context: unknown, response: unknown, token: unknown) => {
              info('🎯 Chat detected via DYNAMIC participant!');
              const req = request as { prompt?: string };
              if (req?.prompt) {
                recordPrompt(req.prompt, 'dynamic-participant');
              }
              return undefined;
            }
          });
          context.subscriptions.push(dynamicParticipant);
          info('✅ Dynamic chat participant registered');
        } catch (e) {
          info(`Dynamic participant failed: ${e}`);
        }
      }
      
      // 2b: Standard chat participant
      if (vscodeExtended.chat?.createChatParticipant) {
        const participant = vscodeExtended.chat.createChatParticipant('ai-prompt-detector.monitor', (request: unknown, context: unknown, response: unknown, token: unknown) => {
          info('🎯 Chat detected via participant!');
          const req = request as { prompt?: string };
          if (req?.prompt) {
            recordPrompt(req.prompt, 'participant');
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
      
      // Option 3: Try all session-related APIs
      // 3a: Session disposal
      if (vscodeExtended.chat?.onDidDisposeChatSession) {
        const disposable = vscodeExtended.chat.onDidDisposeChatSession((sessionId: unknown) => {
          info(`Chat session disposed: ${sessionId}`);
        });
        context.subscriptions.push(disposable);
        info('✅ Chat session disposal monitor registered');
      }
      
      // 3b: Session Item Provider
      if (vscodeExtended.chat?.registerChatSessionItemProvider) {
        try {
          const provider = vscodeExtended.chat.registerChatSessionItemProvider('ai-prompt-detector.session', {
            provideItems: (session: unknown) => {
              const sess = session as { id?: string };
              info(`Session items requested for: ${sess?.id}`);
              return [];
            }
          });
          context.subscriptions.push(provider);
          info('✅ Chat session item provider registered');
        } catch (e) {
          info(`Session item provider failed: ${e}`);
        }
      }
      
      // 3c: Session Content Provider
      if (vscodeExtended.chat?.registerChatSessionContentProvider) {
        try {
          const contentProvider = vscodeExtended.chat.registerChatSessionContentProvider('ai-prompt-detector.content', {
            provideContent: (session: unknown) => {
              const sess = session as { id?: string };
              info(`Session content requested for: ${sess?.id}`);
              return undefined;
            }
          });
          context.subscriptions.push(contentProvider);
          info('✅ Chat session content provider registered');
        } catch (e) {
          info(`Session content provider failed: ${e}`);
        }
      }
      
      // 3d: Related Files Provider
      if (vscodeExtended.chat?.registerRelatedFilesProvider) {
        try {
          const relatedProvider = vscodeExtended.chat.registerRelatedFilesProvider('ai-prompt-detector.related', {
            provideRelatedFiles: (request: unknown, token: unknown) => {
              const req = request as { prompt?: string };
              info(`Related files requested for prompt: "${req?.prompt?.substring(0, 50)}"`);
              // Try to capture the prompt here
              if (req?.prompt) {
                recordPrompt(req.prompt, 'related-files');
              }
              return [];
            }
          });
          context.subscriptions.push(relatedProvider);
          info('✅ Related files provider registered');
        } catch (e) {
          info(`Related files provider failed: ${e}`);
        }
      }
      
      // 3e: Chat Output Renderer
      if (vscodeExtended.chat?.registerChatOutputRenderer) {
        try {
          const renderer = vscodeExtended.chat.registerChatOutputRenderer('ai-prompt-detector.renderer', {
            render: (output: unknown) => {
              info(`Chat output render requested`);
              return undefined;
            }
          });
          context.subscriptions.push(renderer);
          info('✅ Chat output renderer registered');
        } catch (e) {
          info(`Chat output renderer failed: ${e}`);
        }
      }
      
      // 3f: Mapped Edits Provider
      if (vscodeExtended.chat?.registerMappedEditsProvider) {
        try {
          const editsProvider = vscodeExtended.chat.registerMappedEditsProvider('ai-prompt-detector.edits', {
            provideMappedEdits: (document: unknown, codeBlocks: unknown, context: unknown, token: unknown) => {
              info(`Mapped edits requested`);
              return undefined;
            }
          });
          context.subscriptions.push(editsProvider);
          info('✅ Mapped edits provider registered');
        } catch (e) {
          info(`Mapped edits provider failed: ${e}`);
        }
      }
      
      // 3g: Chat Participant Detection Provider
      if (vscodeExtended.chat?.registerChatParticipantDetectionProvider) {
        try {
          const detectionProvider = vscodeExtended.chat.registerChatParticipantDetectionProvider({
            provideParticipants: (text: string, token: unknown) => {
              info(`Participant detection for text: "${text.substring(0, 50)}"`);
              // Try to capture prompts here
              if (text && text.length > 2) {
                recordPrompt(text, 'detection-provider');
              }
              return [];
            }
          });
          context.subscriptions.push(detectionProvider);
          info('✅ Chat participant detection provider registered');
        } catch (e) {
          info(`Participant detection provider failed: ${e}`);
        }
      }
      
      // Helper function to handle chat events
      function handleChatEvent(event: unknown) {
        let text = '';
        if (typeof event === 'string') {
          text = event;
        } else {
          const evt = event as { message?: string; prompt?: string; text?: string; request?: { message?: string } };
          if (evt?.message) {
            text = evt.message;
          } else if (evt?.prompt) {
            text = evt.prompt;
          } else if (evt?.text) {
            text = evt.text;
          } else if (evt?.request?.message) {
            text = evt.request.message;
          }
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
   * Setup monitoring of chat submissions without blocking
   * 
   * WHAT WORKS:
   * - Keyboard detection via keybindings (Enter, Ctrl+Enter)
   * - Command interception for keyboard-triggered commands
   * 
   * WHAT DOESN'T WORK FOR MOUSE:
   * - Command interception (mouse doesn't generate commands)
   * - Chat API events (not accessible without special APIs)
   * - Widget access (runs in different process)
   * - Clipboard monitoring (disabled per user request)
   * - File watchers (chat doesn't create immediate files)
   * 
   * ONLY POSSIBLE SOLUTION FOR MOUSE:
   * - Regular polling to detect when prompts are sent
   */
  function setupChatMonitoring(context: vscode.ExtensionContext) {
    info('🔧 Setting up chat monitoring');
    
    // Track if we're in our own command to avoid double detection
    let isOurCommand = false;
    
    // Method 1: Monitor command execution (WORKS FOR KEYBOARD ONLY)
    // Mouse clicks DON'T generate commands - they call widget.acceptInput() directly
    const originalExecute = vscode.commands.executeCommand;
    (vscode.commands as unknown as { executeCommand: Function }).executeCommand = async function(command: string, ...args: unknown[]) {
      // Skip if this is our own forwarded command
      if (isOurCommand) {
        return originalExecute.call(vscode.commands, command, ...args);
      }
      
      // Note: Mouse submissions NEVER appear here because they don't use commands
      // This only catches keyboard shortcuts that we don't handle ourselves
      
      // Call original
      return originalExecute.call(vscode.commands, command, ...args);
    };
    
    // Method 2: Removed - context monitoring doesn't detect submissions
    
    // Method 3: Keyboard detection (WORKS PERFECTLY)
    context.subscriptions.push(
      vscode.commands.registerCommand('ai-prompt-detector.detectEnter', async () => {
        info('🎯 ============ ENTER DETECTED ============');
        info(`Current state.recentPrompts count: ${state.recentPrompts.length}`);
        info(`Current state.recentPrompts[0]?.text: "${state.recentPrompts[0]?.text.substring(0, 100) || 'EMPTY'}"`);
        info(`Current aiPromptCounter: ${aiPromptCounter}`);

        // Try to get actual text from VS Code chat session files
        let capturedText = '';
        info('🔍 Attempting to capture prompt text from chat session files...');

        try {
          const { getLastChatRequest } = await import('./chatSessionReader');
          capturedText = await getLastChatRequest() || '';
          info(`📝 Captured text from chat session: "${capturedText.substring(0, 100)}"`);
        } catch (e) {
          info(`⚠️ Chat session read failed: ${e}`);
        }

        // Forward to chat submit (since our keybinding blocks default behavior)
        info('Forwarding to workbench.action.chat.submit...');
        try {
          await vscode.commands.executeCommand('workbench.action.chat.submit');
          info('✅ Chat submit executed');
        } catch (e) {
          info(`❌ Chat submit failed: ${e}`);
        }

        // If we got text, add it to state immediately as live prompt
        if (capturedText && capturedText.trim()) {
          const liveEntry: PromptEntry = {
            text: capturedText.trim(),
            isLive: true,
            timestamp: Date.now(),
            id: `live-${Date.now()}`
          };
          state.recentPrompts.unshift(liveEntry);
          info(`✅ Added LIVE prompt with real text to state - count now: ${state.recentPrompts.length}`);
        } else {
          // Fallback: add placeholder
          info(`⚠️ Could not capture text, using placeholder`);
          const placeholderEntry: PromptEntry = {
            text: '⏳ Prompt sent (text capture failed)',
            isLive: true,
            timestamp: Date.now(),
            id: `live-${Date.now()}`
          };
          state.recentPrompts.unshift(placeholderEntry);
          info(`📝 Added placeholder prompt to state - count now: ${state.recentPrompts.length}`);
        }

        // Increment counter immediately and update keyboard timestamp
        const oldCounter = aiPromptCounter;
        aiPromptCounter++;
        lastKeyboardDetection = Date.now();
        info(`📈 Counter: ${oldCounter} → ${aiPromptCounter}, lastKeyboardDetection updated`);

        updateStatusBar();
        const ext = vscode.extensions.getExtension('sunamocz.ai-prompt-detector');
        const v = ext?.packageJSON?.version || '?';
        info(`📊 Status bar text now: "AI Prompts: ${aiPromptCounter} | v${v}"`);

        // Refresh activity bar to show live prompt immediately
        providerRef?.refresh();
        info(`🔄 Provider refresh called IMMEDIATELY - will show ${state.recentPrompts.length} prompts`);

        // Show notification with captured text
        const latestPrompt = state.recentPrompts[0]?.text || 'Prompt sent via Enter';
        const displayText = latestPrompt.length > 200 ? latestPrompt.substring(0, 200) + '...' : latestPrompt;
        info(`Display text (truncated): "${displayText}"`);

        const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
        let customMsg = cfg.get<string>('customMessage') || '';
        info(`Custom message from config: "${customMsg}"`);

        const notificationText = customMsg
          ? `AI Prompt sent (keyboard-enter)\n${customMsg}\n\nPrompt: ${displayText}`
          : `AI Prompt sent (keyboard-enter)\n\nPrompt: ${displayText}`;

        info(`Showing notification: "${notificationText.substring(0, 100)}..."`);
        vscode.window.showInformationMessage(notificationText);

        info(`✅ ENTER detection complete - final counter: ${aiPromptCounter}`);
        info('🎯 ============ ENTER DETECTION END ============');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('ai-prompt-detector.detectCtrlEnter', async () => {
        info('🎯 ============ CTRL+ENTER DETECTED ============');
        info(`Current state.recentPrompts count: ${state.recentPrompts.length}`);
        info(`Current state.recentPrompts[0]?.text: "${state.recentPrompts[0]?.text.substring(0, 100) || 'EMPTY'}"`);
        info(`Current aiPromptCounter: ${aiPromptCounter}`);

        // Try to get actual text from chat input BEFORE submitting
        let capturedText = '';
        info('🔍 Attempting to capture prompt text...');

        try {
          const { getChatInputText } = await import('./chatHelpers');
          capturedText = await getChatInputText(true);
          info(`📝 Captured text via getChatInputText: "${capturedText.substring(0, 100)}"`);
        } catch (e) {
          info(`⚠️ getChatInputText failed: ${e}`);
        }

        // Add to state immediately as live prompt with real text (or fallback)
        const promptText = capturedText && capturedText.trim()
          ? capturedText.trim()
          : 'Prompt sent via Ctrl+Enter';

        const liveEntry: PromptEntry = {
          text: promptText,
          isLive: true,
          timestamp: Date.now(),
          id: `live-${Date.now()}`
        };
        state.recentPrompts.unshift(liveEntry);
        info(`✅ Added LIVE prompt to state - text: "${promptText.substring(0, 100)}", count now: ${state.recentPrompts.length}`);

        // Increment counter immediately and update keyboard timestamp
        const oldCounter = aiPromptCounter;
        aiPromptCounter++;
        lastKeyboardDetection = Date.now();
        info(`📈 Counter: ${oldCounter} → ${aiPromptCounter}, lastKeyboardDetection updated`);

        updateStatusBar();
        const ext = vscode.extensions.getExtension('sunamocz.ai-prompt-detector');
        const v = ext?.packageJSON?.version || '?';
        info(`📊 Status bar text now: "AI Prompts: ${aiPromptCounter} | v${v}"`);

        // Refresh activity bar to show live prompt immediately
        providerRef?.refresh();
        info(`🔄 Provider refresh called IMMEDIATELY - will show ${state.recentPrompts.length} prompts`);

        // Show notification with captured text
        const latestPrompt = state.recentPrompts[0]?.text || 'Prompt sent via Ctrl+Enter';
        const displayText = latestPrompt.length > 200 ? latestPrompt.substring(0, 200) + '...' : latestPrompt;
        info(`Display text (truncated): "${displayText}"`);

        const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
        let customMsg = cfg.get<string>('customMessage') || '';
        info(`Custom message from config: "${customMsg}"`);

        const notificationText = customMsg
          ? `AI Prompt sent (keyboard-ctrl-enter)\n${customMsg}\n\nPrompt: ${displayText}`
          : `AI Prompt sent (keyboard-ctrl-enter)\n\nPrompt: ${displayText}`;

        info(`Showing notification: "${notificationText.substring(0, 100)}..."`);
        vscode.window.showInformationMessage(notificationText);

        // Refresh again to show final text (in case it changed)
        providerRef?.refresh();
        info(`🔄 Provider refresh called AFTER SpecStory load - final count: ${state.recentPrompts.length}`);

        info(`✅ CTRL+ENTER detection complete - final counter: ${aiPromptCounter}`);
        info('🎯 ============ CTRL+ENTER DETECTION END ============');
      })
    );
    
    // Method 4: Monitor counter changes for mouse detection
    // Since counter somehow increases on mouse clicks, monitor it
    let lastSeenCounter = aiPromptCounter;
    
    const monitorInterval = setInterval(async () => {
      if (aiPromptCounter > lastSeenCounter) {
        info(`📊 Counter change detected: ${lastSeenCounter} → ${aiPromptCounter}`);
        const now = Date.now();
        const timeSinceLastKeyboard = now - lastKeyboardDetection;
        info(`⏱️ Time since last keyboard detection: ${timeSinceLastKeyboard}ms`);

        // If counter increased and we haven't detected it recently via keyboard
        if (timeSinceLastKeyboard > 500) {
          info('🎯 ============ MOUSE DETECTED ============');
          info('Counter increased without recent keyboard detection - must be mouse');
          info(`state.recentPrompts count BEFORE: ${state.recentPrompts.length}`);

          // Try to capture actual text from chat input
          let capturedText = '';
          info('🔍 Attempting to capture prompt text for mouse...');

          try {
            const { getChatInputText } = await import('./chatHelpers');
            capturedText = await getChatInputText(true);
            info(`📝 Captured text via getChatInputText: "${capturedText.substring(0, 100)}"`);
          } catch (e) {
            info(`⚠️ getChatInputText failed: ${e}`);
          }

          // Add to state immediately as live prompt with real text (or fallback)
          const promptText = capturedText && capturedText.trim()
            ? capturedText.trim()
            : 'Prompt sent via mouse';

          const liveEntry: PromptEntry = {
            text: promptText,
            isLive: true,
            timestamp: Date.now(),
            id: `live-mouse-${Date.now()}`
          };
          state.recentPrompts.unshift(liveEntry);
          info(`✅ Added LIVE prompt (mouse) to state - text: "${promptText.substring(0, 100)}", count now: ${state.recentPrompts.length}`);

          // Refresh activity bar
          providerRef?.refresh();
          info(`🔄 Provider refresh called for mouse detection`);

          // Show notification with captured text
          const cfg = vscode.workspace.getConfiguration('ai-prompt-detector');
          let customMsg = cfg.get<string>('customMessage') || '';
          info(`Custom message from config: "${customMsg}"`);

          const displayText = promptText.length > 200 ? promptText.substring(0, 200) + '...' : promptText;
          const notificationText = customMsg
            ? `AI Prompt sent (mouse)\n${customMsg}\n\nPrompt: ${displayText}`
            : `AI Prompt sent (mouse)\n\nPrompt: ${displayText}`;

          info(`Showing notification: "${notificationText.substring(0, 100)}..."`);
          vscode.window.showInformationMessage(notificationText);
          info('🎯 ============ MOUSE DETECTION END ============');
        } else {
          info(`⏩ Skipping mouse notification - recent keyboard detection (${timeSinceLastKeyboard}ms ago)`);
        }
        lastSeenCounter = aiPromptCounter;
        info(`Updated lastSeenCounter to: ${lastSeenCounter}`);
      }
    }, 250); // Check every 250ms
    
    context.subscriptions.push({
      dispose: () => clearInterval(monitorInterval)
    });
    
    info('✅ Chat monitoring installed');
  }

  // Removed problematic code that was blocking mouse functionality

  updateStatusBar();
  await loadExistingPrompts();
  
  providerRef = new PromptsProvider();
  const registration = vscode.window.registerWebviewViewProvider(
    PromptsProvider.viewType,
    providerRef,
  );

  // Try new onDidSubmitInput API first (if VS Code is patched)
  const tryNewApi = () => {
    const vscodeExtended = vscode as unknown as ExtendedVSCode;
    
    // Check if our patched API is available
    if (vscodeExtended.chat && typeof (vscodeExtended.chat as any).onDidSubmitInput !== 'undefined') {
      info('🎉 NEW onDidSubmitInput API DETECTED from our VS Code patch!');
      info('  Type of onDidSubmitInput: ' + typeof (vscodeExtended.chat as any).onDidSubmitInput);
      
      try {
        const disposable = (vscodeExtended.chat as any).onDidSubmitInput((event: any) => {
          info('🎯 NEW PATCHED API EVENT FIRED!');
          info(`  Event type: ${typeof event}`);
          info(`  Event keys: ${event ? Object.keys(event).join(', ') : 'null'}`);
          info(`  Is Keyboard: ${event?.isKeyboard}`);
          info(`  Prompt: "${event?.prompt?.substring(0, 100)}"`);
          info(`  Location: ${event?.location}`);
          info(`  Session ID: ${event?.sessionId}`);
          
          // Show success notification
          vscode.window.showInformationMessage(
            `🎉 VS Code patch works! Detected ${event.isKeyboard ? 'KEYBOARD' : '🖱️ MOUSE'} submission!`
          );
          
          recordPrompt(event.prompt || '[Prompt via patched API]', event.isKeyboard ? 'patch-keyboard' : 'patch-mouse');
        });
        
        context.subscriptions.push(disposable);
        info('✅ Successfully subscribed to PATCHED onDidSubmitInput API!');
        info('🎉 MOUSE DETECTION NOW WORKING via our VS Code patch!');
        mouseDetectionWorking = true;
        
        // Update status bar to show patch is working
        statusBarItem.tooltip = '🎉 AI Prompt Detector\n✅ VS Code PATCHED\n✅ onDidSubmitInput API WORKING\n✅ Mouse detection FULLY WORKING!';
        
        return true;
      } catch (e) {
        info(`Failed to subscribe to patched API: ${e}`);
      }
    } else {
      info('❌ Patched onDidSubmitInput API not found');
      info('  Available chat methods: ' + (vscodeExtended.chat ? Object.keys(vscodeExtended.chat).join(', ') : 'none'));
    }
    
    return false;
  };

  // Try new API first
  const newApiWorking = tryNewApi();
  
  // Setup detection methods - NO CLIPBOARD MONITORING  
  const apiSetupSuccess = !newApiWorking ? await setupProposedChatApi() : true;
  setupChatMonitoring(context);

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
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/sunamo/ai-prompt-detector/blob/master/MOUSE_DETECTION_DOCUMENTATION.md'));
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