import * as fs from 'fs';
import * as path from 'path';
import { log } from './logging';

const HISTORY_GLOB = '.specstory/history';

export interface SessionData {
    promptCount: number;
    prompts: { file: string; content: string; }[];
}

let session: SessionData = { promptCount: 0, prompts: [] };

/**
 * CZ: Resetuje session data (vynuluje čítač a seznam promptů).
 */
export function resetSession() {
    session = { promptCount: 0, prompts: [] };
}

/**
 * CZ: Inkrementuje počet promptů v aktuální session.
 */
export function incPrompt() {
    session.promptCount++;
}

/**
 * CZ: Vrací objekt s daty aktuální session.
 */
export function getSession(): SessionData { return session; }

/**
 * CZ: Načte historické prompt soubory (pokud existují) a přidá je do session.prompts.
 */
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
