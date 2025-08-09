import * as vscode from 'vscode';
import { writeLog } from './logger';

// Heuristický watcher sledující otevření / změnu dokumentů souvisejících s chatem / Copilotem
// Cílem je zachytit scénáře, kdy uživatel odešle prompt tlačítkem a jiná logika jej
// nezaregistruje včas. Minimalistický a odnímatelný.
export function setupChatResponseWatcher(
	context: vscode.ExtensionContext,
	finalize: (source: string, text: string) => void
) {
	const processed = new Set<string>(); // již zpracované dokumenty
	let lastCandidate = '';

	/**
	 * Pokusí se heuristicky extrahovat poslední uživatelský prompt z nového / změněného dokumentu.
	 * @param doc Textový dokument (typicky obsah generovaný chatem)
	 * @param reason Důvod spuštění (open/change)
	 */
	function tryExtractAndFinalize(doc: vscode.TextDocument, reason: string) {
		try {
			const name = doc.fileName.toLowerCase();
			if (!(name.includes('copilot') || name.includes('chat'))) return; // filtrace pouze na relevantní dokumenty
			if (processed.has(doc.uri.toString())) return; // zabránění duplicitám
			const full = doc.getText();
			if (full.length < 40) return; // příliš krátké
			// Heuristika: první nenulový řádek který nevypadá jako heading / meta
			const lines = full.split(/\r?\n/);
			let candidate = '';
			for (const ln of lines) {
				const t = ln.trim();
				if (!t) continue;
				if (t.startsWith('#')) continue;
				if (/assistant|copilot/i.test(t)) continue;
				if (t.length < 3) continue;
				candidate = t; break;
			}
			if (!candidate && full.toLowerCase().includes('dispatch')) {
				candidate = full.split(/\r?\n/).find(l=>l.toLowerCase().includes('dispatch'))?.trim() || '';
			}
			if (!candidate) return;
			if (candidate === lastCandidate) return; // duplicitní
			lastCandidate = candidate;
			processed.add(doc.uri.toString());
			writeLog(`🧲 Heuristic prompt capture (${reason}): "${candidate.substring(0,80)}"`, true);
			finalize(`heuristic-${reason}`, candidate);
		} catch (e) {
			writeLog(`❌ heuristic capture error: ${e}`, true);
		}
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(doc => tryExtractAndFinalize(doc, 'open')),
		vscode.workspace.onDidChangeTextDocument(ev => tryExtractAndFinalize(ev.document, 'change'))
	);
}
