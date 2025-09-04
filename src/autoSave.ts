import * as vscode from 'vscode';
import * as path from 'path';
import { writeLog } from './logger';

const AUTO_SAVE_ENABLED = true;
const AUTO_SAVE_INTERVAL = 5000;
const AUTO_SAVE_PATTERNS = ['**/*.md', '**/*.txt', '**/*.json'];
let autoSaveTimer: NodeJS.Timeout | undefined;

export function startAutoSave(): void {
	if (!AUTO_SAVE_ENABLED) return;
	
	writeLog(`💾 AUTO-SAVE: Enabled with interval ${AUTO_SAVE_INTERVAL}ms`, false);
	writeLog(`💾 AUTO-SAVE: Patterns: ${AUTO_SAVE_PATTERNS.join(', ')}`, false);
	
	if (autoSaveTimer) {
		clearInterval(autoSaveTimer);
	}
	
	autoSaveTimer = setInterval(async () => {
		try {
			const dirtyEditors = vscode.window.visibleTextEditors.filter(editor => 
				editor.document.isDirty && 
				AUTO_SAVE_PATTERNS.some(pattern => 
					editor.document.fileName.includes('.md') || 
					editor.document.fileName.includes('.txt') || 
					editor.document.fileName.includes('.json')
				)
			);
			
			if (dirtyEditors.length > 0) {
				writeLog(`💾 AUTO-SAVE: Saving ${dirtyEditors.length} dirty files`, true);
				
				for (const editor of dirtyEditors) {
					await editor.document.save();
					writeLog(`💾 AUTO-SAVE: Saved ${path.basename(editor.document.fileName)}`, true);
				}
			}
		} catch (error) {
			writeLog(`❌ AUTO-SAVE: Error saving files: ${error}`, false);
		}
	}, AUTO_SAVE_INTERVAL);
}

export function stopAutoSave(): void {
	if (autoSaveTimer) {
		clearInterval(autoSaveTimer);
		autoSaveTimer = undefined;
		writeLog('💾 AUTO-SAVE: Timer cleared', false);
	}
}

export function createAutoSaveDisposable(): vscode.Disposable {
	return {
		dispose: () => {
			stopAutoSave();
		}
	};
}
