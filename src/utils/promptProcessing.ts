import * as fs from 'fs';
import { state } from '../state';
import { writeLog } from './logging';

export function addRecentPrompt(filePath: string): void {
	try {
		writeLog(`Processing SpecStory file: ${filePath}`, 'DEBUG');
		const content = fs.readFileSync(filePath, 'utf8');
		const userMessages = extractUserMessages(content);
		
		writeLog(`Extracted ${userMessages.length} user messages from ${filePath}`, 'DEBUG');
		
		userMessages.forEach(message => {
			const cleanMessage = message.trim();
			if (cleanMessage.length > 0 && !state.recentPrompts.includes(cleanMessage)) {
				state.recentPrompts.push(cleanMessage);
				writeLog(`Added prompt from ${filePath}: "${cleanMessage.substring(0, 50)}..."`, 'DEBUG');
			} else if (cleanMessage.length > 0) {
				writeLog(`Skipped duplicate prompt: "${cleanMessage.substring(0, 50)}..."`, 'DEBUG');
			}
		});
		
		writeLog(`Total prompts after processing ${filePath}: ${state.recentPrompts.length}`, 'DEBUG');
	} catch (error) {
		writeLog(`Error reading file ${filePath}: ${error}`, 'ERROR');
	}
}

function extractUserMessages(content: string): string[] {
	const messages: string[] = [];
	const lines = content.split('\n');
	let isUserMessage = false;
	let currentMessage = '';
	
	for (const line of lines) {
		if (line.trim() === '_**User**_') {
			isUserMessage = true;
			currentMessage = '';
		} else if (line.trim() === '---' || line.trim() === '_**Assistant**_') {
			if (isUserMessage && currentMessage.trim()) {
				messages.push(currentMessage.trim());
			}
			isUserMessage = false;
			currentMessage = '';
		} else if (isUserMessage && line.trim()) {
			if (currentMessage) {
				currentMessage += ' ';
			}
			currentMessage += line.trim();
		}
	}
	
	// Handle last message if file doesn't end with separator
	if (isUserMessage && currentMessage.trim()) {
		messages.push(currentMessage.trim());
	}
	
	return messages;
}
