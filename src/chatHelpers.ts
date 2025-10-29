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
 * Získá text z chat inputu - používá aktivní editor jako zdroj textu.
 * @param attemptFocus Pokud true, pokusí se přesměrovat fokus na input box.
 * @param allowKeyboardSimulation Pokud true, pokusí se simulovat keyboard pro získání textu.
 * @returns Text z chat inputu nebo prázdný řetězec.
 */
export const getChatInputText = async (
	attemptFocus?: boolean,
	allowKeyboardSimulation = false,
): Promise<string> => {
  try {
    info(`getChatInputText called: attemptFocus=${attemptFocus}`);

    // ALWAYS focus first and wait longer to ensure chat input is active editor
    info('Focusing chat input and waiting for editor to become active...');
    await focusChatInput();
    await new Promise(r => setTimeout(r, 200)); // Increased wait time from 50ms to 200ms
    info('Focus and wait completed');

    // Try to get text from active text editor (chat input is often a text editor)
    const activeEditor = vscode.window.activeTextEditor;
    info(`Active editor exists: ${!!activeEditor}`);

    if (activeEditor) {
      const document = activeEditor.document;
      info(`Active editor URI: ${document.uri.toString()}`);
      info(`Active editor scheme: ${document.uri.scheme}`);
      info(`Active editor languageId: ${document.languageId}`);
      info(`Active editor has text: ${document.getText().length > 0}`);

      // Check if this is a chat input by URI or language ID
      if (document.uri.scheme === 'vscode-chat' ||
          document.uri.scheme === 'comment' ||
          document.languageId === 'copilot-chat' ||
          document.uri.toString().includes('chat') ||
          document.uri.toString().includes('copilot')) {
        const text = document.getText();
        if (text) {
          info(`getChatInputText: Got text from active editor: "${text.substring(0, 50)}"`);
          return text;
        }
      }
    }

    // Try visible text editors
    info(`Checking ${vscode.window.visibleTextEditors.length} visible editors`);
    for (let i = 0; i < vscode.window.visibleTextEditors.length; i++) {
      const editor = vscode.window.visibleTextEditors[i];
      const document = editor.document;
      info(`  Editor ${i}: URI=${document.uri.toString()}, scheme=${document.uri.scheme}, lang=${document.languageId}`);

      if (document.uri.scheme === 'vscode-chat' ||
          document.uri.scheme === 'comment' ||
          document.languageId === 'copilot-chat' ||
          document.uri.toString().includes('chat') ||
          document.uri.toString().includes('copilot')) {
        const text = document.getText();
        info(`  Editor ${i} is chat-related, text length: ${text.length}`);
        if (text) {
          info(`getChatInputText: Got text from visible editor ${i}: "${text.substring(0, 50)}"`);
          return text;
        }
      }
    }

    // If no text found, return empty
    info('getChatInputText: No text captured from editors');
    return '';
  } catch (e) {
    info(`getChatInputText error: ${e}`);
    return '';
  }
};
