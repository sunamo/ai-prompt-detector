/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';
import { debug, info } from './logger';
import { state, PromptEntry } from './state';

/**
 * Poskytuje webview s výpisem zachycených promptů ve vlastním panelu Activity Bar.
 * INVARIANTS (Activity Bar Rendering Policy):
 *  - Pořadí dat je již připraveno v `state.recentPrompts` (nejnovější = index 0)
 *  - ZDE NESMÍ být volán reverse() ani sort()
 *  - Zobrazuje se pouze slice(0, maxPrompts)
 *  - Číslování #index+1 reflektuje původní pořadí
 *  - Přidání jakéhokoli přetřídění = REGRESE (porušení Activity Bar Rendering Policy)
 */
export class PromptsProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ai-prompt-detector-view';
  private _view?: vscode.WebviewView;

  /**
   * Konstruktor – trace log vytvoření provideru.
   * MUSÍ zůstat jednoduchý (žádná logika navíc).
   */
  constructor() { debug('🎯 PROMPTS: Provider created'); }

  /**
   * Inicializace webview – nastaví možnosti a naplní HTML.
   * @param webviewView Cílový webview container (poskytuje webview).
   * NESMÍ přidávat reorder logiku – pouze deleguje na update.
   */
  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    // SECURITY: Skripty zakázány – pouze statický HTML + CSS (policy requirement)
    webviewView.webview.options = { enableScripts: false, localResourceRoots: [] };
    this.updateWebview();
    info(`🎯 PROMPTS: Number of prompts to display: ${state.recentPrompts.length}`);
  }

  /**
   * Veřejný refresh – přegeneruje HTML pokud je webview k dispozici.
   * Nesmí měnit pořadí dat – pouze re-render.
   */
  public refresh(): void { if (this._view) this.updateWebview(); }

  /**
   * Interní aktualizace HTML obsahu webview.
   * Nevkládat reverse/sort – striktně deleguje na createPromptsHtml.
   */
  private updateWebview(): void { if (!this._view) return; this._view.webview.html = this.createPromptsHtml(); }

  /**
   * Výpis promptů: pořadí vychází přímo z `state.recentPrompts`.
   * INVARIANT: Žádné reverse/sort/secondary slice od konce – pouze slice(0, maxPrompts).
   * ZMĚNA tohoto chování = REGRESE (viz Activity Bar Rendering Policy v instrukcích).
   * @returns HTML string pro webview (statický, bez skriptů) nebo chybový HTML při neplatné konfiguraci.
   */
  private createPromptsHtml(): string {
    let promptsHtml = '';
    const recentPrompts = state.recentPrompts; // pořadí: newest file first + newest prompt first (index 0 = nejnovější)
    const config = vscode.workspace.getConfiguration('ai-prompt-detector');

    // KONFIGURACE BEZ DEFAULTU: NESMÍME používat druhý parametr get(). Pokud není hodnota nastavena, zobrazíme chybu.
    const rawMax = config.get<number>('maxPrompts');
    if (typeof rawMax !== 'number' || !Number.isFinite(rawMax) || rawMax <= 0) {
      vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing/invalid setting "ai-prompt-detector.maxPrompts" – please set a positive number.');
      return '<html><body><div style="padding:8px;font-size:11px;color:#f55">Config error: set ai-prompt-detector.maxPrompts</div></body></html>';
    }
    const maxPrompts = rawMax; // platná hodnota z nastavení

    // Filter: show only live prompts NOT in SpecStory + all SpecStory prompts
    info(`🎨 Activity Bar: Filtering prompts - total: ${recentPrompts.length}, SpecStory Set size: ${state.specStoryPrompts.size}`);
    const filteredPrompts = recentPrompts.filter(prompt => {
      if (prompt.isLive) {
        // ALWAYS show placeholder prompts (they're temporary and will be updated)
        if (prompt.text.includes('⏳ Waiting') || prompt.text.includes('text capture failed')) {
          info(`  ⏳ PLACEHOLDER prompt: "${prompt.text.substring(0, 60)}..." - ALWAYS SHOWN`);
          return true;
        }
        // Show live prompt only if NOT in SpecStory Set
        const isInSpecStory = state.specStoryPrompts.has(prompt.text);
        info(`  🔍 Live prompt: "${prompt.text.substring(0, 60)}..." - in SpecStory: ${isInSpecStory} - ${isInSpecStory ? 'HIDDEN' : 'SHOWN'}`);
        return !isInSpecStory;
      }
      // Always show non-live (SpecStory) prompts
      info(`  ✅ SpecStory prompt: "${prompt.text.substring(0, 60)}..." - SHOWN`);
      return true;
    });
    info(`🎨 Activity Bar: After filtering - ${filteredPrompts.length} prompts to display`);

    if (filteredPrompts.length > 0) {
      // Take last N prompts (chronological order: oldest first, newest last)
      const startIndex = Math.max(0, filteredPrompts.length - maxPrompts);
      const renderList = filteredPrompts.slice(startIndex);
      promptsHtml = renderList
        .map((prompt, index) => {
          const promptText = prompt.text;
          const shortPrompt = promptText.length > 150 ? promptText.substring(0, 150) + '…' : promptText;
          const safePrompt = shortPrompt
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
          // Reverse numbering: last item (newest) = #1, first item (oldest) = highest number
          const displayNumber = renderList.length - index;
          return (
            `<div class="prompt-item" data-index="${index}">\n` +
            `\t<div class="ln">#${displayNumber}</div>\n` +
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

    // VERZE: Žádné fallbacky typu || '1.1.x' – pokud chybí, notifikace + chybový HTML.
    const ext = vscode.extensions.getExtension('sunamocz.ai-prompt-detector');
    const extensionVersion: string | undefined = ext?.packageJSON?.version;
    if (!extensionVersion) {
      vscode.window.showErrorMessage('AI Copilot Prompt Detector: missing extension version in package.json');
      return '<html><body><div style="padding:8px;font-size:11px;color:#f55">Missing extension version in package.json</div></body></html>';
    }

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
      `<div class="header-bar"> <span>📊 Total: ${filteredPrompts.length}/${maxPrompts}</span><span class="meta">v${extensionVersion}</span></div>\n` +
      `<div class="list">${promptsHtml}</div>\n` +
      `<div class="footer">AI Copilot Prompt Detector</div>\n` +
      `</body>\n</html>`
    );
  }
}

/**
 * Vytvoří HTML reprezentaci seznamu promptů bez změny pořadí.
 * @param prompts Seřazené prompty (index 0 = nejnovější globálně).
 * @param max Maximální počet zobrazených.
 */
function renderPrompts(prompts: PromptEntry[], max: number): string {
  let promptsHtml = '';

  if (prompts.length > 0) {
    const renderList = prompts.slice(0, max); // Take first N (newest first)
    promptsHtml = renderList
      .map((prompt, index) => {
          const promptText = prompt.text;
          const shortPrompt = promptText.length > 150 ? promptText.substring(0, 150) + '…' : promptText;
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

  return promptsHtml;
}

/**
 * Bezpečně načte číslo maxPrompts z konfigurace bez fallbacku; chyby signalizuje null.
 */
function readMaxPrompts(): number | null {
  const config = vscode.workspace.getConfiguration('aiCopilotPromptDetector');
  const raw = config.get<number>('maxPrompts'); // žádný default dle politiky
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}
