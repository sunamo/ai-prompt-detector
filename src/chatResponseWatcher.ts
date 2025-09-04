import * as vscode from 'vscode';
import { writeLog } from './logger';

// Heuristic watcher to detect Copilot / Chat button submissions by
// observing new / changed chat response documents and extracting the
// most recent user prompt when our other interception paths miss.
// Minimal, additive, can be removed without affecting other logic.
export function setupChatResponseWatcher(
	context: vscode.ExtensionContext,
	finalize: (source: string, text: string) => void
) {
	const processed = new Set<string>();
	let lastCandidate = '';

	function tryExtractAndFinalize(doc: vscode.TextDocument, reason: string) {
		try {
			const name = doc.fileName.toLowerCase();
			if (!(name.includes('copilot') || name.includes('chat'))) return;
			if (processed.has(doc.uri.toString())) return;
			const full = doc.getText();
			if (full.length < 40) return; // too small to contain response

			// Heuristic: take first non-empty line (not markdown heading) that looks like a user prompt
			const lines = full.split(/\r?\n/);
			let candidate = '';
			for (const ln of lines) {
				const t = ln.trim();
				if (!t) continue;
				if (t.startsWith('#')) continue; // skip headings
				if (/assistant|copilot/i.test(t)) continue; // skip meta lines
				if (t.length < 3) continue;
				candidate = t;
				break;
			}
			if (!candidate && full.toLowerCase().includes('dispatch')) {
				candidate = full.split(/\r?\n/).find(l=>l.toLowerCase().includes('dispatch'))?.trim() || '';
			}
			if (!candidate) return;
			// Avoid noise or duplicates
			if (candidate === lastCandidate) return;
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
