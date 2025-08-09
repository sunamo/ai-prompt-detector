import { runtime } from './runtime';
import { finalizePrompt } from './finalize';

export function startDetectionTimers(context: { subscriptions: { push(d: any): void } }) {
	let silenceTimer: NodeJS.Timeout | undefined;
	silenceTimer = setInterval(() => {
		try {
			if (!runtime.lastNonEmptySnapshot) return;
			if (runtime.chatInputBuffer.trim()) return; // stále edituje
			const now = Date.now();
			// Okno ticha poté, co uživatel přestal psát a před jakýmkoliv finalizováním
			if (now - runtime.lastBufferChangedAt > 450 && now - runtime.lastBufferChangedAt < 4500 && now - runtime.lastFinalizeAt > 300) {
				runtime.outputChannel?.appendLine('🕒 Silence heuristic finalize');
				finalizePrompt('silence');
			}
		} catch {}
	}, 300);
	context.subscriptions.push({ dispose: () => silenceTimer && clearInterval(silenceTimer) });
}
