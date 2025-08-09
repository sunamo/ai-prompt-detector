import * as fs from 'fs';
import * as path from 'path';
import { log } from './logging';

const HISTORY_GLOB = '.specstory/history';

export interface SessionData {
    promptCount: number;
    prompts: { file: string; content: string; }[];
}

let session: SessionData = { promptCount: 0, prompts: [] };

export function resetSession() {
    session = { promptCount: 0, prompts: [] };
}

export function incPrompt() {
    session.promptCount++;
}

export function getSession(): SessionData { return session; }

export function loadHistory(workspaceRoot: string) {
    const dir = path.join(workspaceRoot, HISTORY_GLOB);
    if (!fs.existsSync(dir)) {
        log('debug', 'history dir missing', { dir });
        return;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const f of files) {
        try {
            const full = path.join(dir, f);
            const content = fs.readFileSync(full, 'utf8');
            session.prompts.push({ file: f, content });
        } catch (e) {
            log('debug', 'failed reading history file', { f, e: String(e) });
        }
    }
    log('debug', 'history loaded', { count: session.prompts.length });
}
