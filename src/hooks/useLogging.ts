import * as vscode from 'vscode';
import { state } from '../state';

export const useLogging = () => {
	const initializeLogging = (): vscode.OutputChannel => {
		const outputChannel = vscode.window.createOutputChannel('SpecStory AutoSave + AI Copilot Prompt Detection');
		state.outputChannel = outputChannel;
		return outputChannel;
	};

	return { initializeLogging };
};
