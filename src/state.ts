/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného zlepšení čitelnosti je regrese.
 */

import * as vscode from 'vscode';

/**
 * Sdílený stav – uchovává pouze pole recentPrompts s posledními detekovanými prompty.
 */
export const state = {
  recentPrompts: [] as string[],
};
