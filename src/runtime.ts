import * as vscode from 'vscode';
import { state } from './state';
import type { PromptsProvider } from './activityBarProvider';

export const runtime = {
	outputChannel: undefined as vscode.OutputChannel | undefined,
	recentPrompts: state.recentPrompts,
	aiPromptCounter: 0,
	statusBarItem: undefined as vscode.StatusBarItem | undefined,
	chatInputBuffer: '',
	lastEnterSubmitAt: 0,
	lastNonEmptySnapshot: '',
	lastSubmittedText: '',
	lastFinalizeAt: 0,
	chatDocState: new Map<string,string>(),
	lastEditorPollText: '',
	lastBufferChangedAt: Date.now(),
	providerRef: undefined as PromptsProvider | undefined
};
