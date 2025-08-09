/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';
import { debug, info } from './logger';
import { state } from './state';

/**
 * Poskytuje webview s výpisem zachycených promptů ve vlastním panelu Activity Bar.
 */
export class PromptsProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ai-prompt-detector-view';
  private _view?: vscode.WebviewView;

  /**
   * Konstruktor – pouze trace log vytvoření provideru.
   */
  constructor() { debug('🎯 PROMPTS: Provider created'); }

  /**
   * Inicializace webview – nastaví možnosti a naplní HTML.
   * @param webviewView Cílový webview container.
   */
  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: false, localResourceRoots: [] };
    this.updateWebview();
    info(`🎯 PROMPTS: Number of prompts to display: ${state.recentPrompts.length}`);
  }

  /**
   * Veřejný refresh – přegeneruje HTML pokud je webview k dispozici.
   */
  public refresh(): void { if (this._view) this.updateWebview(); }

  /**
   * Interní aktualizace HTML obsahu webview.
   */
  private updateWebview(): void { if (!this._view) return; this._view.webview.html = this.createPromptsHtml(); }

  /**
   * Vytvoří HTML pro výpis promptů – bezpečně escapuje a limituje počet.
   * Nově: obrací pořadí tak, aby NEJNOVĚJŠÍ byl úplně nahoře (uživatel požadoval).
   * @returns Sestavený HTML řetězec.
   */
  private createPromptsHtml(): string {
    let promptsHtml = '';
    const recentPrompts = state.recentPrompts;
    const config = vscode.workspace.getConfiguration('ai-prompt-detector');
    const maxPrompts = config.get<number>('maxPrompts', 50);

    if (recentPrompts.length > 0) {
      // Kopie omezeného seznamu + obrácení pořadí pro zobrazení (nejnovější první)
      const renderList = recentPrompts.slice(0, maxPrompts).reverse();
      promptsHtml = renderList
        .map((prompt, index) => {
          const shortPrompt = prompt.length > 150 ? prompt.substring(0, 150) + '…' : prompt;
          const safePrompt = shortPrompt
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
          return (
            `<div class="prompt-item" data-index="${index}">\n` +
            `\t<div class="ln">#${index + 1}</div>\n` +
            `\t<div class="txt" title="${safePrompt}">${safePrompt}</div>\n` +
            `</div>`
          );
        })
        .join('');
    } else {
      promptsHtml = (
        `<div class="empty">\n` +
        `\t<p>🔍 No SpecStory prompts found</p>\n` +
        `\t<p>Create a SpecStory conversation to display prompts</p>\n` +
        `</div>`
      );
    }

    const extensionVersion = vscode.extensions.getExtension('sunamocz.ai-prompt-detector')?.packageJSON.version || '1.1.x';

    return (
      `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width,initial-scale=1.0" />\n<title>AI Copilot Prompt Detector</title>\n<style>\n` +
      `:root {\n` +
      `\t--bg: var(--vscode-sideBar-background);\n` +
      `\t--fg: var(--vscode-foreground);\n` +
      `\t--accent: var(--vscode-charts-blue);\n` +
      `\t--border: var(--vscode-sideBar-border, #3c3c3c);\n` +
      `\t--item-bg: rgba(255,255,255,0.02);\n` +
      `\t--item-bg-hover: rgba(255,255,255,0.06);\n` +
      `\t--header-grad: linear-gradient(90deg, var(--vscode-button-background) 0%, var(--vscode-button-hoverBackground) 100%);\n` +
      `}\n` +
      `body { margin:0; padding:6px 6px 10px; font-family: var(--vscode-font-family); background: var(--bg); color: var(--fg); font-size:11px; line-height:1.3; }\n` +
      `.header-bar { background: var(--header-grad); border:1px solid var(--border); border-radius:4px; padding:6px 8px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; font-size:10px; display:flex; align-items:center; justify-content:space-between; box-shadow: 0 1px 2px rgba(0,0,0,.35); }\n` +
      `.header-bar .meta { opacity:.75; font-weight:400; }\n` +
      `.list { margin-top:8px; }\n` +
      `.prompt-item { display:flex; flex-direction:column; gap:2px; border:1px solid var(--border); border-left:4px solid var(--accent); background: var(--item-bg); padding:5px 6px 6px; margin:4px 0; border-radius:3px; cursor:default; transition: background .12s, border-color .12s; }\n` +
      `.prompt-item:hover { background: var(--item-bg-hover); border-left-color: var(--vscode-textLink-activeForeground,var(--accent)); }\n` +
      `.ln { font-weight:600; color: var(--accent); font-size:10px; opacity:.95; }\n` +
      `.txt { flex:1; word-break:break-word; color: var(--fg); }\n` +
      `.empty { text-align:center; padding:18px 4px; opacity:.7; }\n` +
      `.footer { margin-top:10px; font-size:9px; opacity:.55; text-align:center; }\n` +
      `::-webkit-scrollbar { width:8px; }\n` +
      `::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius:4px; }\n` +
      `::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }\n` +
      `</style>\n</head>\n<body>\n` +
      `<div class="header-bar"> <span>📊 Total: ${recentPrompts.length}/${maxPrompts}</span><span class="meta">v${extensionVersion}</span></div>\n` +
      `<div class="list">${promptsHtml}</div>\n` +
      `<div class="footer">AI Copilot Prompt Detector</div>\n` +
      `</body>\n</html>`
    );
  }
}
