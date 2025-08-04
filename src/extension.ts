import * as vscode from 'vscode';
import { AutoSaveManager } from './autoSaveManager';
import { ConfigurationManager } from './configurationManager';
import { StatusBarManager } from './statusBarManager';
import { SpecStoryPromptProvider } from './activityBarProvider';

let autoSaveManager: AutoSaveManager;
let configurationManager: ConfigurationManager;
let statusBarManager: StatusBarManager;

export function activate(context: vscode.ExtensionContext) {
	console.log('SpecStory AutoSave extension is now active');

	// Initialize managers
	configurationManager = new ConfigurationManager();
	statusBarManager = new StatusBarManager();
	autoSaveManager = new AutoSaveManager(configurationManager, statusBarManager);

	// Register activity bar provider
	const promptProvider = new SpecStoryPromptProvider();
	vscode.window.registerTreeDataProvider('specstory-autosave-view', promptProvider);
	context.subscriptions.push(promptProvider);

	// Register commands
	const enableCommand = vscode.commands.registerCommand('specstory-autosave.enable', () => {
		autoSaveManager.enable();
		vscode.window.showInformationMessage('SpecStory AutoSave enabled');
	});

	const disableCommand = vscode.commands.registerCommand('specstory-autosave.disable', () => {
		autoSaveManager.disable();
		vscode.window.showInformationMessage('SpecStory AutoSave disabled');
	});

	const configureCommand = vscode.commands.registerCommand('specstory-autosave.configure', () => {
		vscode.commands.executeCommand('workbench.action.openSettings', 'specstory-autosave');
	});

	// Add to subscriptions
	context.subscriptions.push(
		enableCommand,
		disableCommand,
		configureCommand,
		autoSaveManager,
		configurationManager,
		statusBarManager
	);

	// Start auto-save if enabled
	if (configurationManager.isEnabled()) {
		autoSaveManager.enable();
	} else {
		statusBarManager.showDisabled();
	}
}

export function deactivate() {
	if (autoSaveManager) {
		autoSaveManager.dispose();
	}
	if (configurationManager) {
		configurationManager.dispose();
	}
}
