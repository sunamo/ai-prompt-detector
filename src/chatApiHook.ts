import * as vscode from 'vscode';
import { writeLog } from './logger';

// Optional VS Code Chat API hook (future-proof). Minimal and safe.
export function registerChatApiHook(context: vscode.ExtensionContext, finalize: (source: string, text: string)=>void) {
	try {
		const chatNs: any = (vscode as any).chat;
		if (chatNs?.onDidSubmitRequest) {
			writeLog('🧩 Chat API hook active', true);
			context.subscriptions.push(chatNs.onDidSubmitRequest((e: any) => {
				try {
					const prompt = e?.request?.message || e?.request?.prompt || e?.prompt || '';
					if (prompt && prompt.trim().length > 2) {
						writeLog('🧩 Chat API onDidSubmitRequest captured prompt', true);
						finalize('chatApi', String(prompt).trim());
					}
				} catch (err) { writeLog('❌ Chat API event error: '+err, true); }
			}));
		} else {
			writeLog('🧩 Chat API not available', true);
		}
	} catch (e) {
		writeLog('❌ registerChatApiHook error: '+e, true);
	}
}
