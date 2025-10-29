/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { info } from './logger';

/**
 * Struktura jednoho chat requestu v JSON souboru.
 */
interface ChatRequest {
	requestId: string;
	message: {
		text: string;
		parts: Array<{
			text: string;
			kind: string;
		}>;
	};
	variableData?: unknown;
	response?: unknown[];
	responseId?: string;
	result?: unknown;
}

/**
 * Struktura celého chat session JSON souboru.
 */
interface ChatSession {
	version: number;
	requesterUsername: string;
	responderUsername: string;
	initialLocation: string;
	requests: ChatRequest[];
}

/**
 * Najde cestu k VS Code User Data složce podle platformy.
 * @returns Cesta k User Data složce nebo undefined pokud se nepodaří zjistit.
 */
function getVSCodeUserDataPath(): string | undefined {
	const isInsiders = vscode.env.appName.includes('Insiders');
	const appName = isInsiders ? 'Code - Insiders' : 'Code';

	if (process.platform === 'win32') {
		return path.join(process.env.APPDATA || '', appName, 'User');
	} else if (process.platform === 'darwin') {
		return path.join(process.env.HOME || '', 'Library', 'Application Support', appName, 'User');
	} else {
		return path.join(process.env.HOME || '', '.config', appName, 'User');
	}
}

/**
 * Najde aktuální workspace storage složku.
 * @param workspaceFolder Aktuální workspace folder z VS Code.
 * @returns Cesta k workspace storage nebo undefined.
 */
function findWorkspaceStoragePath(workspaceFolder: vscode.WorkspaceFolder): string | undefined {
	const userDataPath = getVSCodeUserDataPath();
	if (!userDataPath) {
		info('❌ Could not determine VS Code User Data path');
		return undefined;
	}

	const workspaceStoragePath = path.join(userDataPath, 'workspaceStorage');
	if (!fs.existsSync(workspaceStoragePath)) {
		info(`❌ Workspace storage path does not exist: ${workspaceStoragePath}`);
		return undefined;
	}

	// Find workspace storage by checking workspace.json in each folder
	const workspaceFolders = fs.readdirSync(workspaceStoragePath);
	const workspacePath = workspaceFolder.uri.fsPath;

	info(`🔍 Searching for workspace storage matching: ${workspacePath}`);
	info(`   Checking ${workspaceFolders.length} workspace storage folders...`);

	for (const folder of workspaceFolders) {
		const workspaceJsonPath = path.join(workspaceStoragePath, folder, 'workspace.json');
		if (fs.existsSync(workspaceJsonPath)) {
			try {
				const workspaceJson = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8'));
				if (workspaceJson.folder && workspaceJson.folder.toLowerCase() === workspacePath.toLowerCase()) {
					info(`✅ Found matching workspace storage: ${folder}`);
					return path.join(workspaceStoragePath, folder);
				}
			} catch (e) {
				// Skip invalid JSON
			}
		}
	}

	info(`⚠️ No matching workspace storage found for: ${workspacePath}`);
	return undefined;
}

/**
 * Najde nejnovější chat session soubor.
 * @param workspaceStoragePath Cesta k workspace storage složce.
 * @returns Cesta k nejnovějšímu chat session souboru nebo undefined.
 */
function findLatestChatSessionFile(workspaceStoragePath: string): string | undefined {
	const chatSessionsPath = path.join(workspaceStoragePath, 'chatSessions');
	if (!fs.existsSync(chatSessionsPath)) {
		info(`⚠️ No chatSessions folder found in: ${workspaceStoragePath}`);
		return undefined;
	}

	const files = fs.readdirSync(chatSessionsPath)
		.filter(f => f.endsWith('.json'))
		.map(f => ({
			name: f,
			path: path.join(chatSessionsPath, f),
			mtime: fs.statSync(path.join(chatSessionsPath, f)).mtime
		}))
		.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

	if (files.length === 0) {
		info(`⚠️ No chat session JSON files found in: ${chatSessionsPath}`);
		return undefined;
	}

	info(`✅ Found ${files.length} chat session files, latest: ${files[0].name} (modified: ${files[0].mtime.toLocaleString()})`);
	return files[0].path;
}

/**
 * Přečte poslední chat request z nejnovějšího chat session souboru.
 * @returns Text posledního requestu nebo undefined pokud se nepodaří načíst.
 */
export async function getLastChatRequest(): Promise<string | undefined> {
	try {
		info('🔍 Attempting to read last chat request from VS Code chat session files...');

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			info('❌ No workspace folder found');
			return undefined;
		}

		const workspaceStoragePath = findWorkspaceStoragePath(workspaceFolder);
		if (!workspaceStoragePath) {
			return undefined;
		}

		const chatSessionFile = findLatestChatSessionFile(workspaceStoragePath);
		if (!chatSessionFile) {
			return undefined;
		}

		info(`📖 Reading chat session file: ${chatSessionFile}`);
		const data: ChatSession = JSON.parse(fs.readFileSync(chatSessionFile, 'utf8'));

		if (!data.requests || data.requests.length === 0) {
			info('⚠️ No requests found in chat session file');
			return undefined;
		}

		const lastRequest = data.requests[data.requests.length - 1];
		const text = lastRequest.message.text;

		info(`✅ Successfully read last chat request: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
		return text;

	} catch (e) {
		info(`❌ Error reading chat session: ${e}`);
		return undefined;
	}
}

/**
 * Nastaví watch na chat session soubory pro detekci nových promptů.
 * @param callback Funkce která se zavolá když se objeví nový prompt.
 * @returns Disposable pro zrušení watchování.
 */
export function watchChatSessions(callback: (promptText: string) => void): vscode.Disposable {
	try {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			info('❌ Cannot watch chat sessions - no workspace folder');
			return { dispose: () => {} };
		}

		const workspaceStoragePath = findWorkspaceStoragePath(workspaceFolder);
		if (!workspaceStoragePath) {
			info('❌ Cannot watch chat sessions - workspace storage not found');
			return { dispose: () => {} };
		}

		const chatSessionsPath = path.join(workspaceStoragePath, 'chatSessions');
		if (!fs.existsSync(chatSessionsPath)) {
			info(`❌ Cannot watch chat sessions - folder does not exist: ${chatSessionsPath}`);
			return { dispose: () => {} };
		}

		info(`👀 Starting to watch chat sessions folder: ${chatSessionsPath}`);

		let lastRequestCount = 0;
		let chatSessionFile: string | undefined;

		// Initial read to get current state
		chatSessionFile = findLatestChatSessionFile(workspaceStoragePath);
		if (chatSessionFile) {
			try {
				const data: ChatSession = JSON.parse(fs.readFileSync(chatSessionFile, 'utf8'));
				lastRequestCount = data.requests.length;
				info(`📊 Initial state: ${lastRequestCount} requests in latest chat session`);
			} catch (e) {
				info(`⚠️ Error reading initial state: ${e}`);
			}
		}

		// Watch for changes
		const watcher = fs.watch(chatSessionsPath, (eventType, filename) => {
			try {
				// Re-find latest file in case a new session was created
				const latestFile = findLatestChatSessionFile(workspaceStoragePath);
				if (!latestFile) {
					return;
				}

				// If file changed, update our reference
				if (latestFile !== chatSessionFile) {
					info(`📁 New chat session file detected: ${path.basename(latestFile)}`);
					chatSessionFile = latestFile;
					lastRequestCount = 0; // Reset counter for new file
				}

				const data: ChatSession = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
				const currentRequestCount = data.requests.length;

				if (currentRequestCount > lastRequestCount) {
					const newRequest = data.requests[currentRequestCount - 1];
					const text = newRequest.message.text;
					info(`🆕 NEW CHAT REQUEST DETECTED: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
					callback(text);
					lastRequestCount = currentRequestCount;
				}
			} catch (e) {
				// Ignore errors during watch (file might be mid-write)
			}
		});

		return {
			dispose: () => {
				watcher.close();
				info('👋 Stopped watching chat sessions');
			}
		};

	} catch (e) {
		info(`❌ Error setting up chat session watch: ${e}`);
		return { dispose: () => {} };
	}
}
