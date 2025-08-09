import * as vscode from 'vscode';

/**
 * Sdílený stav – uchovává pouze pole recentPrompts s posledními detekovanými prompty.
 */
export const state = {
  recentPrompts: [] as string[],
};
