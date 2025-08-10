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
 * Získá text z chat inputu pomocí copyInput příkazů s rozšířeným seznamem variant.
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
      // Delší pauza aby se fokus aplikoval
      await new Promise(r => setTimeout(r, 120));
    }
    
    const prev = await vscode.env.clipboard.readText();
    let captured = '';
    const all = await vscode.commands.getCommands(true);
    
    // Rozšířený seznam copyInput příkazů - více variant pro lepší kompatibilitu
    const copyCommands = [
      'workbench.action.chat.copyInput',
      'github.copilot.chat.copyInput', 
      'chat.copyInput',
      'workbench.action.chatEditor.copyInput',
      'github.copilot.interactive.copyInput',
      'workbench.action.chat.copyCurrentInput',
      'github.copilot.chat.copyCurrentInput',
      'copilot.chat.copyInput',
      'interactive.copyInput',
      'chatEditor.copyInput',
    ].filter((i) => all.includes(i));
    
    info(`getChatInputText: Available copy commands: ${copyCommands.length} out of 10`);
    
    if (copyCommands.length > 0) {
      info(`Available commands: ${copyCommands.join(', ')}`);
      
      // Pokus s každým příkazem, s delšími pauzami
      for (const id of copyCommands) {
        try {
          info(`Trying copy command: ${id}`);
          await vscode.commands.executeCommand(id);
          await new Promise(r => setTimeout(r, 80));
          captured = await vscode.env.clipboard.readText();
          if (captured.trim() && captured !== prev) {
            info(`getChatInputText: Success via ${id} - captured: "${captured.substring(0, 100)}"`);
            break;
          } else {
            info(`getChatInputText: Command ${id} executed but no new text in clipboard`);
          }
        } catch (err) {
          info(`getChatInputText: Command ${id} failed: ${err}`);
        }
      }
    } else {
      // Fallback: použij keyboard shortcuts pro select all + copy
      info('No copyInput commands available - trying keyboard simulation');
      try {
        // Ctrl+A pro označení všeho v input boxu
        await vscode.commands.executeCommand('editor.action.selectAll');
        await new Promise(r => setTimeout(r, 50));
        
        // Ctrl+C pro kopírování
        await vscode.commands.executeCommand('editor.action.clipboardCopyAction');
        await new Promise(r => setTimeout(r, 80));
        
        captured = await vscode.env.clipboard.readText();
        if (captured.trim() && captured !== prev) {
          info(`getChatInputText: Keyboard simulation success - captured: "${captured.substring(0, 100)}"`);
        } else {
          info('getChatInputText: Keyboard simulation failed - no new text in clipboard');
        }
      } catch (err) {
        info(`getChatInputText: Keyboard simulation error: ${err}`);
      }
    }
    
    // Žádný fallback s selectAll - může způsobit označení textu v UI
    // Pokud copyInput příkazy nefungují, raději neposkytujeme text
    
    // Obnoví původní obsah schránky
    try { 
      await vscode.env.clipboard.writeText(prev); 
    } catch {}
    
    const result = captured.trim();
    if (result) {
      info(`getChatInputText result: "${result.substring(0, 100)}${result.length > 100 ? '...' : ''}"`);
    } else {
      info('getChatInputText: No text captured via copyInput commands');
    }
    return result;
  } catch (e) { 
    info(`getChatInputText error: ${e}`);
    return ''; 
  }
};
