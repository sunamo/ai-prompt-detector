import * as vscode from 'vscode';
import { writeLog } from './logger';
import { SOURCE_DIR_COPILOT, SOURCE_DIR_VSCODE, LOG_DIR } from './constants';

// Optional VS Code Chat API hook (future-proof). Minimal and safe.
export function registerChatApiHook(context: vscode.ExtensionContext, finalize: (source: string, text: string)=>void) {
	try {
		const chatNs: any = (vscode as any).chat;
		if (chatNs?.onDidSubmitRequest) {
			writeLog(`🧩 Chat API hook active | refs ${SOURCE_DIR_COPILOT} ${SOURCE_DIR_VSCODE} ${LOG_DIR}`, true);
			context.subscriptions.push(chatNs.onDidSubmitRequest((e: any) => {
				try {
					const prompt = e?.request?.message || e?.request?.prompt || e?.prompt || '';
					const text = String(prompt).trim();
					if (text && text.length > 2) {
						writeLog('🧩 Chat API onDidSubmitRequest captured prompt', true);
						finalize('chatApi', text);
						if (/save and dispatch/i.test(text)) {
							writeLog('🧩 Explicit Save and Dispatch detected', true);
							finalize('dispatchButton', text);
						}
					}
				} catch (err) { writeLog('❌ Chat API event error: '+err, true); }
			}));
		} else {
			writeLog(`🧩 Chat API not available | refs ${SOURCE_DIR_COPILOT} ${SOURCE_DIR_VSCODE} ${LOG_DIR}`, true);
		}
	} catch (e) {
		writeLog(`❌ registerChatApiHook error: ${e} | refs ${SOURCE_DIR_COPILOT} ${SOURCE_DIR_VSCODE} ${LOG_DIR}`, true);
	}
}
