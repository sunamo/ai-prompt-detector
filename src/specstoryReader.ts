/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as fs from 'fs';
import * as path from 'path';
import { info } from './logger';
import { PromptEntry, state } from './state';

export function isValidSpecStoryFile(filePath: string): boolean {
  info(`🔍 Checking if file is valid SpecStory file: "${filePath}"`);
  const fileName = path.basename(filePath);
  const isValid = (
    /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}Z-.+\.md$/.test(fileName) &&
    fs.existsSync(filePath)
  );
  info(`  Result: ${isValid ? '✅ VALID' : '❌ INVALID'} - fileName: "${fileName}"`);
  return isValid;
}

export function loadPromptsFromFile(filePath: string, recent: PromptEntry[]): void {
  info(`📂 ============ LOADING PROMPTS FROM FILE ============`);
  info(`File path: "${filePath}"`);
  info(`Current recent prompts count BEFORE load: ${recent.length}`);
  info(`Current specStoryPrompts set size: ${state.specStoryPrompts.size}`);

  try {
    const c = fs.readFileSync(filePath, 'utf8');
    info(`📄 File size: ${c.length} characters`);

    const sections = c.split(/(?=_\*\*User)/);
    info(`📋 Found ${sections.length} sections in file`);

    const collected: string[] = [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.includes('_**User')) {
        const body = s
          .split('\n')
          .slice(1)
          .join(' ')
          .split('---')[0]
          .trim();
        if (body && body.length > 0) {
          collected.push(body);
          info(`  ✅ Section ${i}: Found prompt (${body.length} chars): "${body.substring(0, 80)}..."`);
        } else {
          info(`  ⏩ Section ${i}: Skipped - empty body`);
        }
      } else {
        info(`  ⏩ Section ${i}: Skipped - no User marker`);
      }
    }

    info(`📊 Collected ${collected.length} prompts from file`);
    info(`🔄 Reversing order (newest in file will be first)...`);

    const reversed = collected.reverse();
    let replacedCount = 0;

    for (let i = 0; i < reversed.length; i++) {
      const p = reversed[i];
      state.specStoryPrompts.add(p);

      let replaced = false;
      for (let j = 0; j < recent.length; j++) {
        const entry = recent[j];
        if (entry.isLive && (entry.text === p || entry.text.includes('Loading prompt from SpecStory'))) {
          info(`  🔄 Replacing live prompt at index ${j} with SpecStory text`);
          recent[j] = {
            text: p,
            isLive: false,
            timestamp: entry.timestamp,
            id: entry.id
          };
          replaced = true;
          replacedCount++;
          break;
        }
      }

      if (!replaced) {
        const entry: PromptEntry = {
          text: p,
          isLive: false,
          timestamp: Date.now(),
          id: `specstory-${Date.now()}-${i}`
        };
        recent.push(entry);
        info(`  Added new prompt ${i+1}/${reversed.length}: "${p.substring(0, 60)}..."`);
      }
    }

    info(`✅ Loading complete - recent prompts count AFTER load: ${recent.length}`);
    info(`📊 Replaced ${replacedCount} live prompts with SpecStory text`);
    info(`📊 specStoryPrompts set size AFTER load: ${state.specStoryPrompts.size}`);
    info(`📂 ============ FILE LOADING END ============`);
  } catch (e) {
    info(`❌ ERROR loading file: ${e}`);
    info(`📂 ============ FILE LOADING END (WITH ERROR) ============`);
  }
}
