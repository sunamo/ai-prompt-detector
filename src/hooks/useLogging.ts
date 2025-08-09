import * as vscode from 'vscode';
import { state } from '../state';
import { writeLog, verifyLogFile } from '../utils/logging';

export const useLogging = () => {
	const initializeLogging = (): vscode.OutputChannel => {
		const outputChannel = vscode.window.createOutputChannel('SpecStory AutoSave + AI Copilot Prompt Detection');
		state.outputChannel = outputChannel;
		
		// Zapsat počáteční log záznam
		writeLog('=== NEW SESSION STARTED ===', 'INFO');
		
		// Ověřit, že logování funguje po krátkém zpoždění
		setTimeout(() => {
			verifyLogFile();
		}, 1000);
		
		return outputChannel;
	};

	return { initializeLogging };
};
