/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';
import { info } from './logger';

/**
 * Zaměří vstupní pole Copilot/Chat (projede více možných ID příkazů).
 * @returns Promise bez hodnoty – při úspěchu prostě skončí, chyby jsou ignorovány.
 */
export const focusChatInput = async () => {
	for (const id of ['github.copilot.chat.focusInput','workbench.action.chat.focusInput','chat.focusInput']) {
		try { await vscode.commands.executeCommand(id); return; } catch {}
	}
};

/**
 * Pokusí se odeslat aktuální obsah chatu přes řadu známých příkazů.
 * @returns true pokud se podařilo spustit odeslací příkaz (nebo simulovaný enter), jinak false.
 */
export const forwardToChatAccept = async (): Promise<boolean> => {
		try {
			const all = await vscode.commands.getCommands(true);
			const ids = [
				'github.copilot.chat.acceptInput',
				'github.copilot.chat.send',
				'github.copilot.chat.submit',
				'workbench.action.chat.acceptInput',
				'workbench.action.chat.submit',
				'inlineChat.accept',
				'chat.acceptInput',
			].filter((i) => all.includes(i));
			for (const id of ids){
				try { await vscode.commands.executeCommand(id); return true; } catch {}
			}
			await vscode.commands.executeCommand('type', { text: '\n' });
			return true;
		} catch { return false; }
};

/**
 * Získá text z chat inputu - používá copyInput příkazy místo clipboard.
 * @param attemptFocus Pokud true, pokusí se přesměrovat fokus na input box.
 * @param allowKeyboardSimulation Pokud true, pokusí se simulovat keyboard pro získání textu.
 * @returns Text z chat inputu nebo prázdný řetězec.
 */
export const getChatInputText = async (
	attemptFocus?: boolean,
	allowKeyboardSimulation = false,
): Promise<string> => {
  try {
    if (attemptFocus) {
      await focusChatInput();
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Try copyInput commands that might return text directly
    const copyCommands = [
      'workbench.action.chat.copyInput',
      'github.copilot.chat.copyInput',
      'chat.copyInput'
    ];
    
    for (const cmd of copyCommands) {
      try {
        const result = await vscode.commands.executeCommand(cmd);
        if (result && typeof result === 'string') {
          info(`getChatInputText: Got text via ${cmd}: "${result.substring(0, 50)}"`);
          return result;
        }
      } catch {
        // Silent fail for individual commands
      }
    }
    
    // If no direct text, return empty
    info('getChatInputText: No text captured via copyInput commands');
    return '';
  } catch (e) { 
    info(`getChatInputText error: ${e}`);
    return ''; 
  }
};
