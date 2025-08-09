import * as vscode from 'vscode';
import { state } from '../state';
import { writeLog, verifyLogFile } from '../utils/logging';

export const useLogging = () => {
	const initializeLogging = (): vscode.OutputChannel => {
		const outputChannel = vscode.window.createOutputChannel('AI Prompt Detector + AI Copilot Prompt Detection');
		state.outputChannel = outputChannel;
		
		// Write initial log entry
		writeLog('=== NEW SESSION STARTED ===', 'INFO');
		
		// Verify logging works after a short delay
		setTimeout(() => {
			verifyLogFile();
		}, 1000);
		
		return outputChannel;
	};

	return { initializeLogging };
};
