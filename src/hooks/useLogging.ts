import * as vscode from 'vscode';
import { state } from '../state';
import { writeLog, verifyLogFile } from '../utils/logging';

// Hook pro inicializaci logování – vytváří output channel a provádí základní ověření souboru logu.
export const useLogging = () => {
	/**
	 * Vytvoří a vrátí výstupní kanál pro logování, provede první zápis a naplánuje verifikaci.
	 */
	const initializeLogging = (): vscode.OutputChannel => {
		const outputChannel = vscode.window.createOutputChannel('AI Prompt Detector + AI Copilot Prompt Detection');
		state.outputChannel = outputChannel;
		
		// Write initial log entry
		writeLog('=== NEW SESSION STARTED ===', 'INFO');
		
		// Verify logging works after a short delay
		setTimeout(() => {
			verifyLogFile();
		}, 1000); // krátké zpoždění pro ověření zápisu
		
		return outputChannel;
	};

	return { initializeLogging };
};
