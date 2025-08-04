import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { state } from '../state';

const LOG_FILE_PATH = 'C:\\temp\\specstory-autosave-logs\\extension.log';

// Ensure log directory exists
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
	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const debugEnabled = config.get<boolean>('debugLogging', false);

	// Skip debug messages if debugging is disabled
	if (level === 'DEBUG' && !debugEnabled) {
		return;
	}

	const now = new Date();
	const czechTime = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // UTC+2 for Czech timezone
	const timeString = czechTime.toISOString().replace('T', ' ').substring(0, 19);
	const logMessage = `[${timeString}] [${level}] ${message}`;

	// Always write to VS Code output channel
	if (state.outputChannel) {
		state.outputChannel.appendLine(logMessage);
	}

	// Also write to file
	try {
		ensureLogDirectory();
		fs.appendFileSync(LOG_FILE_PATH, logMessage + '\n', 'utf8');
	} catch (error) {
		console.error('Failed to write to log file:', error);
	}
}
