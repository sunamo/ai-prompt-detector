import * as vscode from 'vscode';
import * as path from 'path';
import { initLogger, writeLog, checkLogHealth } from './logger';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryParser';
import { detectCopilotEnter, processCopilotPrompt, isCopilotContext } from './promptDetector';
import { startAutoSave, createAutoSaveDisposable } from './autoSave';
import { PromptsProvider } from './activityBarProvider';

let recentPrompts: string[] = [];
let aiPromptCounter = { value: 0 };
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
	writeLog('🚀 ACTIVATION: Extension starting...', true);
	
	const outputChannel = vscode.window.createOutputChannel('SpecStory Prompts');
	outputChannel.show();
	initLogger(outputChannel);
	writeLog('🚀 PROMPTS: Extension starting...', false);
	
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.show();
	
	const updateStatusBar = () => {
		const extensionVersion = vscode.extensions.getExtension('sunamocz.specstory-autosave')?.packageJSON.version || '1.1.79';
		statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter.value} | v${extensionVersion}`;
		statusBarItem.tooltip = 'SpecStory AutoSave + AI Copilot Prompt Detection';
	};
	updateStatusBar();
	
	await loadExistingPrompts();
	writeLog(`🚀 PROMPTS: After loading we have ${recentPrompts.length} prompts`, false);
	
	const promptsProvider = new PromptsProvider(recentPrompts);
	
	writeLog(`🚀 PROMPTS: Registering provider with viewType: ${PromptsProvider.viewType}`, true);
	const registration = vscode.window.registerWebviewViewProvider(
		PromptsProvider.viewType,
		promptsProvider
	);
	
	writeLog('🚀 PROMPTS: Provider registered successfully', false);
	
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md');
	
	watcher.onDidCreate(uri => {
		if (isValidSpecStoryFile(uri.fsPath)) {
			writeLog(`📝 New SpecStory file: ${path.basename(uri.fsPath)}`, false);
			loadPromptsFromFile(uri.fsPath, recentPrompts);
			promptsProvider.refresh();
		}
	});

	const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('specstory-autosave.maxPrompts')) {
			const config = vscode.workspace.getConfiguration('specstory-autosave');
			const maxPrompts = config.get<number>('maxPrompts', 50);
			writeLog(`⚙️ Settings changed: maxPrompts = ${maxPrompts}`, false);
			promptsProvider.refresh();
		}
	});

	// IMMEDIATE Enter key detection for Copilot Chat
	const enterDetector = vscode.commands.registerCommand('type', (args) => {
		if (detectCopilotEnter(args)) {
			writeLog(`⌨️ ENTER DETECTED`, true);
			
			// Check if we're in Copilot context
			if (isCopilotContext()) {
				writeLog(`🎯 COPILOT CONTEXT CONFIRMED - Processing immediately`, true);
				
				// IMMEDIATE processing - no delay
				processCopilotPrompt(recentPrompts, aiPromptCounter, updateStatusBar, promptsProvider);
			} else {
				writeLog(`❌ NOT IN COPILOT CONTEXT - ignoring`, true);
			}
		}
		
		// Continue with default typing behavior
		return vscode.commands.executeCommand('default:type', args);
	});

	startAutoSave();
	
	context.subscriptions.push(
		outputChannel, 
		registration, 
		watcher, 
		configWatcher, 
		enterDetector, 
		statusBarItem,
		createAutoSaveDisposable()
	);
	
	writeLog(`🚀 PROMPTS: Activation complete - total ${recentPrompts.length} prompts`, false);
	writeLog('🚀 PROMPTS: Open Activity Bar panel SpecStory AI!', false);
	
	// Check log health after 10 seconds
	setTimeout(() => {
		checkLogHealth();
	}, 10000);
}

async function loadExistingPrompts(): Promise<void> {
	try {
		writeLog('🔍 Searching for existing SpecStory files...', false);
		
		const files = await vscode.workspace.findFiles('**/.specstory/history/*.md');
		writeLog(`📊 Found ${files.length} SpecStory files`, false);
		
		if (files.length > 0) {
			const sortedFiles = files.sort((a, b) => {
				const nameA = path.basename(a.fsPath);
				const nameB = path.basename(b.fsPath);
				return nameB.localeCompare(nameA);
			});
			
			sortedFiles.forEach(file => {
				if (isValidSpecStoryFile(file.fsPath)) {
					loadPromptsFromFile(file.fsPath, recentPrompts);
				}
			});
			
			writeLog(`✅ Total loaded ${recentPrompts.length} prompts from ${sortedFiles.length} files`, false);
		} else {
			writeLog('ℹ️ No SpecStory files found', false);
			recentPrompts.push('Welcome to SpecStory AutoSave + AI Copilot Prompt Detection');
			recentPrompts.push('TEST: Dummy prompt for demonstration');
			writeLog('🎯 Added test prompts for demonstration', false);
		}
	} catch (error) {
		writeLog(`❌ Error loading prompts: ${error}`, false);
	}
}

export function deactivate() {
	writeLog('🚀 DEACTIVATION: Extension shutting down', false);
	writeLog('🚀 Extension deactivated', false);
}
