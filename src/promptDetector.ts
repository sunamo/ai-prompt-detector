import * as vscode from 'vscode';
import { writeLog } from './logger';

export function detectCopilotEnter(args: any): boolean {
	// Only detect Enter key press (newline)
	if (args && typeof args.text === 'string') {
		return args.text.includes('\n') || args.text.includes('\r');
	}
	return false;
}

export function isCopilotContext(): boolean {
	try {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return false;
		
		const document = editor.document;
		const fileName = document.fileName.toLowerCase();
		const languageId = document.languageId;
		
		// Check if we're in a Copilot context
		return (
			fileName.includes('copilot') ||
			fileName.includes('chat') ||
			languageId === 'markdown' ||
			document.getText().toLowerCase().includes('copilot') ||
			vscode.window.activeTextEditor?.viewColumn !== undefined
		);
	} catch (error) {
		return false;
	}
}

export function processCopilotPrompt(
	recentPrompts: string[], 
	aiPromptCounter: { value: number },
	updateStatusBar: () => void,
	promptsProvider: { refresh: () => void }
): void {
	try {
		writeLog(`🔍 PROCESSING COPILOT PROMPT...`, true);
		
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			writeLog(`❌ No active editor`, true);
			return;
		}
		
		// Get current line text
		const selection = editor.selection;
		let promptText = '';
		
		if (!selection.isEmpty) {
			// If there's a selection, use that
			promptText = editor.document.getText(selection).trim();
		} else {
			// Otherwise use current line
			const currentLine = editor.document.lineAt(selection.active.line);
			promptText = currentLine.text.trim();
		}
		
		writeLog(`📝 EXTRACTED PROMPT: "${promptText}"`, true);
		
		// Must be substantial enough to be a real prompt
		if (promptText.length < 5) {
			writeLog(`❌ Prompt too short: ${promptText.length} chars`, true);
			return;
		}
		
		// Check if it's not a duplicate
		if (recentPrompts.includes(promptText)) {
			writeLog(`🔄 DUPLICATE PROMPT: "${promptText.substring(0, 30)}..."`, true);
			return;
		}
		
		// IMMEDIATE processing - increment counter first
		aiPromptCounter.value++;
		writeLog(`🤖 NEW AI PROMPT DETECTED! Counter: ${aiPromptCounter.value}`, false);
		writeLog(`📝 PROMPT: "${promptText}"`, false);
		
		// IMMEDIATE UI updates
		updateStatusBar();
		
		// IMMEDIATE notification
		const config = vscode.workspace.getConfiguration('specstory-autosave');
		const customMessage = config.get<string>('customMessage', '');
		
		const notificationMessage = customMessage 
			? `AI Prompt detected\n${customMessage}`
			: 'AI Prompt detected\nCheck: Quality & accuracy of response';
		
		vscode.window.showInformationMessage(notificationMessage);
		writeLog(`📢 NOTIFICATION SHOWN: ${notificationMessage.replace('\n', ' | ')}`, false);
		
		// Add to recent prompts (newest first)
		recentPrompts.unshift(promptText);
		writeLog(`➕ PROMPT ADDED TO ACTIVITY BAR: "${promptText.substring(0, 50)}..."`, false);
		
		// Trim array if too long
		if (recentPrompts.length > 1000) {
			recentPrompts.splice(1000);
			writeLog(`🔄 TRIMMED PROMPTS ARRAY TO 1000 ITEMS`, true);
		}
		
		// IMMEDIATE webview refresh
		promptsProvider.refresh();
		writeLog(`🔄 UI UPDATED IMMEDIATELY`, true);
		
	} catch (error) {
		writeLog(`❌ Error processing prompt: ${error}`, false);
	}
}
