import * as vscode from 'vscode';
import { writeLog } from './logger';
import { SOURCE_DIR_COPILOT, SOURCE_DIR_VSCODE, LOG_DIR } from './constants';

// Volitelný hook do VS Code Chat API – zatím lehká implementace, která
// zachytí odeslaný prompt přes oficiální API (pokud je dostupné) a předá jej finalize logice.
export function registerChatApiHook(context: vscode.ExtensionContext, finalize: (source: string, text: string)=>void) {
	try {
		const chatNs: any = (vscode as any).chat; // přístup k navrhovanému API
		if (chatNs?.onDidSubmitRequest) {
			writeLog(`🧩 Chat API hook active | refs ${SOURCE_DIR_COPILOT} ${SOURCE_DIR_VSCODE} ${LOG_DIR}`, true);
			context.subscriptions.push(chatNs.onDidSubmitRequest((e: any) => {
				try {
					const prompt = e?.request?.message || e?.request?.prompt || e?.prompt || '';
					const text = String(prompt).trim();
					if (text && text.length > 2) {
						writeLog('🧩 Chat API onDidSubmitRequest captured prompt', true);
						finalize('chatApi', text); // standardní finalize
						if (/save and dispatch/i.test(text)) { // speciální varianta tlačítka
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
