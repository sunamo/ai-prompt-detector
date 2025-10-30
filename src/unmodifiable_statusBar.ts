/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

/**
 * ⚠️ UNMODIFIABLE COMPONENT - DO NOT MODIFY! ⚠️
 *
 * This file contains FROZEN, WORKING functionality that must NOT be changed.
 * Any modifications to this file are STRICTLY FORBIDDEN without explicit user permission.
 *
 * Component: Status Bar Display
 * Purpose: Shows version and prompt counter in VS Code status bar
 * Created: 2025-10-30
 * Status: LOCKED ✅
 */

import * as vscode from 'vscode';

/**
 * Status bar configuration and state.
 */
export interface StatusBarConfig {
  /** VS Code status bar item instance */
  item: vscode.StatusBarItem;
  /** Current prompt counter value */
  counter: number;
  /** Whether proposed API is available */
  proposedApiAvailable: boolean;
}

/**
 * Vytvoří a inicializuje status bar item.
 * @param proposedApiAvailable Zda je dostupné proposed API
 * @returns Nakonfigurovaný status bar item
 */
export function createStatusBar(proposedApiAvailable: boolean): vscode.StatusBarItem {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );

  // Update tooltip based on API availability (no backgroundColor)
  if (proposedApiAvailable) {
    statusBarItem.tooltip = '✅ AI Prompt Detector\n✅ Proposed API enabled\n✅ Mouse detection WORKING';
  } else {
    statusBarItem.tooltip = '⚠️ AI Prompt Detector\n❌ Proposed API disabled\n⚠️ Mouse detection LIMITED\n💡 Run: code-insiders --enable-proposed-api sunamocz.ai-prompt-detector';
  }

  statusBarItem.show();
  return statusBarItem;
}

/**
 * Aktualizuje text ve status baru.
 * ALWAYS use "AI Prompts:" prefix (never just "AI:")
 * @param statusBarItem Status bar item k aktualizaci
 * @param counter Aktuální počet promptů
 * @param proposedApiAvailable Zda je dostupné proposed API
 */
export function updateStatusBar(
  statusBarItem: vscode.StatusBarItem,
  counter: number,
  proposedApiAvailable: boolean
): void {
  const ext = vscode.extensions.getExtension('sunamocz.ai-prompt-detector');
  const version: string | undefined = ext?.packageJSON?.version;

  if (!version) {
    vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing package.json version');
    statusBarItem.text = '🤖 AI Prompts: ' + counter + ' | v?';
    return;
  }

  // Add indicator for API status - ALWAYS use "AI Prompts:" not "AI:"
  const apiIndicator = proposedApiAvailable ? '✅' : '⚠️';
  statusBarItem.text = `${apiIndicator} AI Prompts: ${counter} | v${version}`;
}

/**
 * Nastaví tooltip když je patch API detekováno.
 * @param statusBarItem Status bar item k aktualizaci
 */
export function setStatusBarPatchedTooltip(statusBarItem: vscode.StatusBarItem): void {
  statusBarItem.tooltip = '🎉 AI Prompt Detector\n✅ VS Code PATCHED\n✅ onDidSubmitInput API WORKING\n✅ Mouse detection FULLY WORKING!';
}
