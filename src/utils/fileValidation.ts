import * as path from 'path';

export function isValidSpecStoryFile(filePath: string): boolean {
	const fileName = path.basename(filePath);
	return fileName.endsWith('.md') && fileName.includes('conversation-');
}
