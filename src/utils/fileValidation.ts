import * as path from 'path';
import { writeLog } from './logging';

export function isValidSpecStoryFile(filePath: string): boolean {
	const fileName = path.basename(filePath);
	writeLog(`Validating file: ${fileName}`, 'DEBUG');
	
	const isMarkdown = fileName.endsWith('.md');
	const hasConversation = fileName.includes('conversation-');
	
	writeLog(`File ${fileName}: isMarkdown=${isMarkdown}, hasConversation=${hasConversation}`, 'DEBUG');
	
	const isValid = isMarkdown && hasConversation;
	writeLog(`File ${fileName} validation result: ${isValid}`, 'DEBUG');
	
	return isValid;
}
