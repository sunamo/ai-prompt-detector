import { runtime } from './runtime';
import { finalizePrompt } from './finalize';

/**
 * Spustí časovače heuristik, které sledují období ticha po psaní a pokusí se
 * automaticky vyvolat finalize, pokud uživatel přestal psát ale submit se
 * z nějakého důvodu neodpálil (např. ztracený event Enter / tlačítka).
 */
export function startDetectionTimers(context: { subscriptions: { push(d: any): void } }) {
	let silenceTimer: NodeJS.Timeout | undefined;
	// Periodická kontrola ticha
	silenceTimer = setInterval(() => {
		try {
			if (!runtime.lastNonEmptySnapshot) return; // nic zatím
			if (runtime.chatInputBuffer.trim()) return; // stále píše
			const now = Date.now();
			// Okno ticha (0.45s až 4.5s od poslední změny) a žádný recent finalize
			if (now - runtime.lastBufferChangedAt > 450 && now - runtime.lastBufferChangedAt < 4500 && now - runtime.lastFinalizeAt > 300) {
				runtime.outputChannel?.appendLine('🕒 Silence heuristic finalize');
				finalizePrompt('silence');
			}
		} catch {}
	}, 300);
	context.subscriptions.push({ dispose: () => silenceTimer && clearInterval(silenceTimer) });
}
