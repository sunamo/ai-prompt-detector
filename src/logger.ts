import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let outputChannel: vscode.OutputChannel;

// Cross-platform log directory
function getLogDir(): string {
	const platform = os.platform();
	if (platform === 'win32') {
		return 'C:\\temp\\specstory-autosave-logs';
	} else {
		return path.join(os.tmpdir(), 'specstory-autosave-logs');
	}
}

const LOG_DIR = getLogDir();

function ensureLogDir(): void {
	try {
		if (!fs.existsSync(LOG_DIR)) {
			fs.mkdirSync(LOG_DIR, { recursive: true });
		}
	} catch (error) {
		console.error('Failed to create log directory:', error);
	}
}

export function initLogger(channel: vscode.OutputChannel): void {
	outputChannel = channel;
	ensureLogDir();
}

export function writeLog(message: string, isDebug: boolean = false): void {
	const timestamp = new Date().toISOString();
	const logMessage = `[${timestamp}] ${message}`;
	
	if (outputChannel) {
		outputChannel.appendLine(logMessage);
	}
	
	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const debugEnabled = config.get<boolean>('enableDebugLogs', false);
	
	if (!isDebug || debugEnabled) {
		try {
			ensureLogDir();
			const logFile = path.join(LOG_DIR, `extension-${new Date().toISOString().split('T')[0]}.log`);
			fs.appendFileSync(logFile, logMessage + '\n', 'utf8');
		} catch (error) {
			console.error('Failed to write to log file:', error);
		}
	}
}
