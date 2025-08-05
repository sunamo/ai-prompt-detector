import * as vscode from 'vscode';
import { writeLog } from './logger';

export function detectPotentialPrompt(text: string): boolean {
	return text.length > 10 && (
		text.toLowerCase().includes('explain') ||
		text.toLowerCase().includes('help me') ||
		text.toLowerCase().includes('generate') ||
		text.toLowerCase().includes('create') ||
		text.toLowerCase().includes('fix') ||
		text.toLowerCase().includes('debug') ||
		text.toLowerCase().includes('how to') ||
		text.toLowerCase().includes('what is') ||
		text.includes('?') ||
		(text.length > 30 && text.trim().split(' ').length > 5)
	);
}

export function processPotentialPrompt(
	promptText: string, 
	recentPrompts: string[], 
	aiPromptCounter: { value: number },
	updateStatusBar: () => void,
	promptsProvider: { refresh: () => void }
): void {
	try {
		const cleanPrompt = promptText.trim();
		if (cleanPrompt.length < 15 || cleanPrompt.length > 1000) {
			return;
		}
		
		if (recentPrompts.includes(cleanPrompt)) {
			writeLog(`🔄 DUPLICATE PROMPT: "${cleanPrompt.substring(0, 30)}..."`, true);
			return;
		}
		
		aiPromptCounter.value++;
		writeLog(`🤖 NEW AI PROMPT DETECTED! Counter: ${aiPromptCounter.value}`, false);
		writeLog(`📝 PROMPT: "${cleanPrompt}"`, false);
		
		const config = vscode.workspace.getConfiguration('specstory-autosave');
		const customMessage = config.get<string>('customMessage', '');
		
		const notificationMessage = customMessage 
			? `AI Prompt detected\n${customMessage}`
			: 'AI Prompt detected\nCheck: Quality & accuracy of response';
		
		vscode.window.showInformationMessage(notificationMessage);
		writeLog(`📢 NOTIFICATION SHOWN: ${notificationMessage.replace('\n', ' | ')}`, false);
		
		recentPrompts.unshift(cleanPrompt);
		writeLog(`➕ PROMPT ADDED TO ACTIVITY BAR: "${cleanPrompt.substring(0, 50)}..."`, false);
		
		if (recentPrompts.length > 1000) {
			recentPrompts.splice(1000);
			writeLog(`🔄 TRIMMED PROMPTS ARRAY TO 1000 ITEMS`, true);
		}
		
		updateStatusBar();
		promptsProvider.refresh();
		writeLog(`🔄 UI UPDATED`, true);
		
	} catch (error) {
		writeLog(`❌ Error processing prompt: ${error}`, false);
	}
}
