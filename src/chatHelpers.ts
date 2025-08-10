/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';

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
 * Získá text z chat inputu neinvazivně (pouze copyInput příkazy) a ponechá původní schránku.
 * Zaměřuje se výhradně na obsah input boxu, NIKDY nepoužívá copyAll nebo selectAll.
 * @param attemptFocus Pokud true, pokusí se přesměrovat fokus na input box.
 * @returns Trimovaný text uživatelského vstupu nebo prázdný řetězec.
 */
export const getChatInputText = async (
	attemptFocus?: boolean,
): Promise<string> => {
  try {
    const wantFocus = attemptFocus !== false;
    if (wantFocus) {
      await focusChatInput();
      // Krátká pauza aby se fokus aplikoval
      await new Promise(r => setTimeout(r, 50));
    }
    
    const prev = await vscode.env.clipboard.readText();
    let captured = '';
    const all = await vscode.commands.getCommands(true);
    
    // POUZE copyInput příkazy - zachytí jen obsah input boxu, ne celou konverzaci
    const copyCommands = [
      'workbench.action.chat.copyInput',
      'github.copilot.chat.copyInput', 
      'chat.copyInput',
      'workbench.action.chatEditor.copyInput',
      'github.copilot.interactive.copyInput',
    ].filter((i) => all.includes(i));
    
    for (const id of copyCommands) {
      try {
        await vscode.commands.executeCommand(id);
        await new Promise(r => setTimeout(r, 30));
        captured = await vscode.env.clipboard.readText();
        if (captured.trim() && captured !== prev) {
          console.log(`getChatInputText: Success via ${id}`);
          break;
        }
      } catch {}
    }
    
    // Obnoví původní obsah schránky
    try { 
      await vscode.env.clipboard.writeText(prev); 
    } catch {}
    
    const result = captured.trim();
    console.log(`getChatInputText result: "${result.substring(0, 100)}${result.length > 100 ? '...' : ''}"`);
    return result;
  } catch (e) { 
    console.log(`getChatInputText error: ${e}`);
    return ''; 
  }
};
