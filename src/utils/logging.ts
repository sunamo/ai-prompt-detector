import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { state } from '../state';

const LOG_FILE_PATH = 'C:\\temp\\ai-prompt-detector-logs\\extension.log';

// Zajistit, že log adresář existuje
function ensureLogDirectory(): void {
	const logDir = path.dirname(LOG_FILE_PATH);
	if (!fs.existsSync(logDir)) {
		try {
			fs.mkdirSync(logDir, { recursive: true });
		} catch (error) {
			console.error('Failed to create log directory:', error);
		}
	}
}

export function writeLog(message: string, level: 'INFO' | 'DEBUG' | 'ERROR' = 'INFO'): void {
	const config = vscode.workspace.getConfiguration('ai-prompt-detector');
	const debugEnabled = config.get<boolean>('enableDebugLogs', true);

	// Přeskočit debug zprávy, pokud je debugging vypnut
	if (level === 'DEBUG' && !debugEnabled) {
		return;
	}

	const now = new Date();
	const czechTime = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // UTC+2 pro český časový pás
	const timeString = czechTime.toISOString().replace('T', ' ').substring(0, 19);
	const logMessage = `[${timeString}] [${level}] ${message}`;

	// Vždy zapisovat do VS Code output channel
	if (state.outputChannel) {
		state.outputChannel.appendLine(logMessage);
	}

	// Také zapisovat do souboru
	try {
		ensureLogDirectory();
		fs.appendFileSync(LOG_FILE_PATH, logMessage + '\n', 'utf8');
	} catch (error) {
		console.error('Failed to write to log file:', error);
	}
}

export function verifyLogFile(): void {
	try {
		if (fs.existsSync(LOG_FILE_PATH)) {
			const logContent = fs.readFileSync(LOG_FILE_PATH, 'utf8');
			const logLines = logContent.split('\n').filter(line => line.trim());
			
			if (logLines.length > 0) {
				const lastLine = logLines[logLines.length - 1];
				const logTimestampMatch = lastLine.match(/\[([^\]]+)\]/);
				
				if (logTimestampMatch) {
					const logTimeString = logTimestampMatch[1];
					const logTime = new Date(logTimeString.replace(' ', 'T') + 'Z');
					const now = new Date();
					const ageMinutes = (now.getTime() - logTime.getTime()) / (1000 * 60);
					
					if (ageMinutes <= 5) {
						console.log(`✅ Log verification passed - log is ${ageMinutes.toFixed(1)} minutes old`);
						writeLog(`Log verification passed - log is ${ageMinutes.toFixed(1)} minutes old`, 'INFO');
					} else {
						const errorMsg = `LOG ERROR: Log is too old (${ageMinutes.toFixed(1)} minutes)! Logging may not be working properly.`;
						console.error(`❌ ${errorMsg}`);
						writeLog(errorMsg, 'ERROR');
						vscode.window.showErrorMessage(`SpecStory Extension: ${errorMsg}`);
					}
				} else {
					const errorMsg = 'LOG ERROR: Cannot parse log timestamp';
					console.error(`❌ ${errorMsg}`);
					writeLog(errorMsg, 'ERROR');
					vscode.window.showErrorMessage(`SpecStory Extension: ${errorMsg}`);
				}
			} else {
				const errorMsg = 'LOG ERROR: Log file is empty after writing';
				console.error(`❌ ${errorMsg}`);
				writeLog(errorMsg, 'ERROR');
				vscode.window.showErrorMessage(`SpecStory Extension: ${errorMsg}`);
			}
		} else {
			const errorMsg = 'LOG ERROR: Log file does not exist after writing';
			console.error(`❌ ${errorMsg}`);
			writeLog(errorMsg, 'ERROR');
			vscode.window.showErrorMessage(`SpecStory Extension: ${errorMsg}`);
		}
	} catch (verifyError) {
		const errorMsg = `LOG ERROR: Failed to verify log file: ${verifyError}`;
		console.error(`❌ ${errorMsg}`);
		writeLog(errorMsg, 'ERROR');
		vscode.window.showErrorMessage(`SpecStory Extension: ${errorMsg}`);
	}
}
