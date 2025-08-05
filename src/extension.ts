import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let statusBarItem: vscode.StatusBarItem;
let logFile: string;
let outputChannel: vscode.OutputChannel;

function initializeLogging(): void {
	// Use fixed path that works for all users including guest accounts
	const logFolder = path.join('C:', 'temp', 'specstory-autosave-logs');
	
	if (!fs.existsSync(logFolder)) {
		fs.mkdirSync(logFolder, { recursive: true });
	}
	
	logFile = path.join(logFolder, `extension-${new Date().toISOString().split('T')[0]}.log`);
	
	// CRITICAL: Clear log file at start of each session
	try {
		fs.writeFileSync(logFile, ''); // Clear the file completely
		console.log(`Log file cleared: ${logFile}`);
	} catch (error) {
		console.error('Failed to clear log file:', error);
	}
	
	outputChannel = vscode.window.createOutputChannel('SpecStory AutoSave + AI Copilot Prompt Detection');
	
	writeLog('=== NEW SESSION STARTED ===', 'INFO');
	writeLog('Extension initialized - log file cleared', 'INFO');
}

function writeLog(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO'): void {
	const config = vscode.workspace.getConfiguration('specstory-autosave');
	const enableDebugLogs = config.get<boolean>('enableDebugLogs', false);
	
	// Skip only DEBUG logs if disabled, always write INFO and ERROR
	if (level === 'DEBUG' && !enableDebugLogs) {
		return;
	}
	
	const timestamp = new Date().toISOString();
	const logEntry = `[${timestamp}] ${level}: ${message}`;
	
	// Write to VS Code output channel
	if (outputChannel) {
		outputChannel.appendLine(logEntry);
	}
	
	// Write to temp file
	try {
		if (logFile) {
			fs.appendFileSync(logFile, logEntry + '\n');
		}
	} catch (error) {
		console.error('Failed to write log:', error);
	}
}

class RecentPromptsProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'specstory-autosave-view';

	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) {
		writeLog('RecentPromptsProvider constructor called', 'INFO');
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		writeLog('RADIKÁLNÍ: resolveWebviewView called', 'INFO');
		
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		// RADIKÁLNÍ ŘEŠENÍ: Okamžitě nastav HTML s test prompty
		const html = `<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<style>
				body { font-family: var(--vscode-font-family); padding: 8px; color: var(--vscode-foreground); }
				.prompt { margin: 8px 0; padding: 8px; border: 1px solid #444; border-radius: 4px; }
				.header { font-weight: bold; color: #007ACC; }
			</style>
		</head>
		<body>
			<h3>SpecStory Prompts (v1.1.53)</h3>
			<div class="prompt">
				<div class="header">#1</div>
				<div>dobrý den a nic nedělje</div>
			</div>
			<div class="prompt">
				<div class="header">#2</div>
				<div>naschledanou a nic nedělej</div>
			</div>
			<div class="prompt">
				<div class="header">#3</div>
				<div>ahoj a nic nedělej</div>
			</div>
			<div class="prompt">
				<div class="header">#4</div>
				<div>RADIKÁLNÍ TEST: Extension funguje!</div>
			</div>
		</body>
		</html>`;

		webviewView.webview.html = html;
		writeLog('RADIKÁLNÍ: HTML nastaven okamžitě!', 'INFO');
	}

	public refresh(): void {
		writeLog('RADIKÁLNÍ: refresh() called', 'INFO');
		if (this._view) {
			// Znovu nastav HTML
			this.resolveWebviewView(this._view, {} as any, {} as any);
		}
	}
}

export async function activate(context: vscode.ExtensionContext) {
	console.log('=== RADIKÁLNÍ AKTIVACE ===');
	
	// Initialize logging FIRST
	initializeLogging();
	writeLog('=== RADIKÁLNÍ START ===', 'INFO');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = `$(comment-discussion) SpecStory v1.1.54`;
	statusBarItem.tooltip = `SpecStory AutoSave + AI Copilot Prompt Detection`;
	statusBarItem.show();
	writeLog('Status bar created', 'INFO');

	// Register activity bar provider
	const provider = new RecentPromptsProvider(context.extensionUri);
	const registration = vscode.window.registerWebviewViewProvider(RecentPromptsProvider.viewType, provider);
	writeLog('Activity bar provider registered', 'INFO');

	context.subscriptions.push(statusBarItem, outputChannel, registration);
	writeLog('RADIKÁLNÍ: Extension activation complete');
}

function updateStatusBar(): void {
	// Minimální status bar
	if (statusBarItem) {
		statusBarItem.text = `$(comment-discussion) SpecStory v1.1.54`;
	}
}

export function deactivate() {
	writeLog('Extension deactivated');
}
