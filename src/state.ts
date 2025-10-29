/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';

/**
 * Typ pro prompt entry - rozlišuje live prompty od SpecStory promptů
 */
export interface PromptEntry {
  text: string;
  isLive: boolean; // true = přidáno okamžitě při detekci, false = načteno ze SpecStory
  timestamp: number; // Date.now() kdy byl přidán
  id: string; // Unikátní ID pro pozdější nahrazení
}

/**
 * Sdílený stav extensionu – drží recentPrompts s invariantem index 0 = nejnovější.
 */
export const state = {
  recentPrompts: [] as PromptEntry[],
  specStoryPrompts: new Set<string>(), // Set textů ze SpecStory pro rychlé vyhledávání
};
