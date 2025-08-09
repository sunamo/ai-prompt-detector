import { runtime } from './runtime';
import { finalizePrompt } from './finalize';

export function startDetectionTimers(context: { subscriptions: { push(d: any): void } }) {
	let silenceTimer: NodeJS.Timeout | undefined;
	silenceTimer = setInterval(() => {
		try {
			if (!runtime.lastNonEmptySnapshot) return;
			if (runtime.chatInputBuffer.trim()) return; // still editing
			const now = Date.now();
			// Silence window after user stopped typing and before any finalize
			if (now - runtime.lastBufferChangedAt > 450 && now - runtime.lastBufferChangedAt < 4500 && now - runtime.lastFinalizeAt > 300) {
				runtime.outputChannel?.appendLine('🕒 Silence heuristic finalize');
				finalizePrompt('silence');
			}
		} catch {}
	}, 300);
	context.subscriptions.push({ dispose: () => silenceTimer && clearInterval(silenceTimer) });
}
