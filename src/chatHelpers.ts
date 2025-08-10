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
 * Získá text z chat inputu neinvazivně (pouze kopírovacími příkazy) a ponechá původní schránku.
 * NIKDY nepoužívá selectAll příkazy aby se zabránilo označování textu v copilotu.
 * @param attemptFocus Pokud true (vyžádáno volajícím), pokusí se přesměrovat fokus. Hodnota undefined => bere se jako true (explicitní rozhodnutí, bez default param syntaxe).
 * @returns Trimovaný text vstupu nebo prázdný řetězec.
 */
export const getChatInputText = async (
	attemptFocus?: boolean,
): Promise<string> => {
  try {
    const wantFocus = attemptFocus !== false; // žádný default v signatuře, jen logická interpretace
    if (wantFocus) await focusChatInput();
    
    const prev = await vscode.env.clipboard.readText();
    let captured = '';
    const all = await vscode.commands.getCommands(true);
    
    // POUZE kopírovací příkazy - žádné selectAll aby se neoznačoval text
    const copyCommands = [
      'workbench.action.chat.copyInput',
      'github.copilot.chat.copyInput',
      'chat.copyInput',
      'workbench.action.chatEditor.copyInput',
      'github.copilot.interactive.copyInput',
      'workbench.action.chat.copyAll',
      'github.copilot.chat.copyAll',
      'chat.copyAll',
      'workbench.action.chatEditor.copyAll',
    ].filter((i) => all.includes(i));
    
    for (const id of copyCommands) {
      try {
        await vscode.commands.executeCommand(id);
        await new Promise(r => setTimeout(r, 25)); // krátká pauza pro async operace
        captured = await vscode.env.clipboard.readText();
        if (captured.trim() && captured !== prev) {
          console.log(`getChatInputText success via: ${id}`);
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
