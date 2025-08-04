import * as vscode from 'vscode';
import * as path from 'path';
import { state } from '../state';
import { writeLog } from '../utils/logging';
import { isValidSpecStoryFile } from '../utils/fileValidation';
import { addRecentPrompt } from '../utils/promptProcessing';
import { extractTimestampFromFileName } from '../utils/timeUtils';
import { updateStatusBar } from '../utils/statusBar';

export const usePrompts = () => {
	const loadExistingPrompts = async (): Promise<void> => {
		writeLog('=== LOAD EXISTING PROMPTS START ===', 'INFO');
		
		try {
			const files = await vscode.workspace.findFiles('**/.specstory/history/*.md');
			writeLog(`Found ${files.length} SpecStory files to analyze`, 'INFO');
			
			// Sort files by timestamp (newest first)
			const sortedFiles = files.sort((a, b) => {
				const nameA = path.basename(a.fsPath);
				const nameB = path.basename(b.fsPath);
				// Extract timestamp from filename for proper chronological sorting
				const timestampA = extractTimestampFromFileName(nameA);
				const timestampB = extractTimestampFromFileName(nameB);
				return timestampB.getTime() - timestampA.getTime(); // Newest first
			});
			
			// Clear existing prompts
			state.recentPrompts = [];
			
			// Process each file and extract user prompts
			sortedFiles.forEach(file => {
				writeLog(`Checking file: ${file.fsPath}`, 'DEBUG');
				if (isValidSpecStoryFile(file.fsPath)) {
					writeLog(`File ${file.fsPath} is valid SpecStory file, processing...`, 'DEBUG');
					addRecentPrompt(file.fsPath);
				} else {
					writeLog(`File ${file.fsPath} is NOT a valid SpecStory file`, 'DEBUG');
				}
			});
			
			writeLog(`Loaded ${state.recentPrompts.length} total prompts from ${sortedFiles.length} files`, 'INFO');
			updateStatusBar();
			
		} catch (error) {
			writeLog(`Error loading existing prompts: ${error}`, 'ERROR');
		}
		
		writeLog('=== LOAD EXISTING PROMPTS END ===', 'INFO');
	};

	return { loadExistingPrompts };
};
