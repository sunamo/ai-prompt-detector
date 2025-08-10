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
 * Získá text z chat inputu neinvazivně (kopírovacími příkazy) a ponechá původní schránku.
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
    
    // Pokus 1: Příkazy pro kopírování obsahu chat inputu
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
        await new Promise(r => setTimeout(r, 20)); // krátká pauza pro async operace
        captured = await vscode.env.clipboard.readText();
        if (captured.trim() && captured !== prev) {
          break;
        }
      } catch {}
    }
    
    // Pokus 2: Select All + Copy pokud copyInput nefunguje
    if (!captured.trim() || captured === prev) {
      const selectCommands = [
        'workbench.action.chat.selectAll',
        'github.copilot.chat.selectAll',
        'chat.selectAll',
        'workbench.action.chatEditor.selectAll',
      ].filter((i) => all.includes(i));
      
      for (const sid of selectCommands) {
        try {
          await vscode.commands.executeCommand(sid);
          await new Promise(r => setTimeout(r, 20));
          await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
          await new Promise(r => setTimeout(r, 20));
          captured = await vscode.env.clipboard.readText();
          if (captured.trim() && captured !== prev) {
            break;
          }
        } catch {}
      }
    }
    
    // Pokus 3: Standardní Ctrl+A + Ctrl+C jako fallback
    if (!captured.trim() || captured === prev) {
      try {
        await vscode.commands.executeCommand('editor.action.selectAll');
        await new Promise(r => setTimeout(r, 20));
        await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
        await new Promise(r => setTimeout(r, 20));
        const fallback = await vscode.env.clipboard.readText();
        if (fallback.trim() && fallback !== prev) {
          captured = fallback;
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
