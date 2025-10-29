/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as fs from 'fs';
import * as path from 'path';
import { info } from './logger';

/**
 * Ověří zda soubor odpovídá očekávanému formátu názvu SpecStory exportu.
 * @param filePath Absolutní cesta k souboru.
 * @returns true pokud název i existence souboru vyhovují.
 */
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

/**
 * Načte prompty z jednoho souboru SpecStory – pořadí v souboru se převrací (collected.reverse())
 * aby nejnovější prompty daného souboru byly dříve a zachovala se globální invariantní logika.
 * Invariant (NEPORUŠIT): Pořadí se připravuje takto:
 * 1. Nasbíráme prompty v pořadí výskytu v souboru (nejstarší -> nejnovější)
 * 2. Poté provedeme collected.reverse() aby nejNOVĚJŠÍ (poslední) byl jako první
 * 3. Výsledek pushujeme do global recent pole v tomto již otočeném pořadí
 * UI (activityBarProvider) NESMÍ přidávat reverse – spoleh na zdejší úpravu.
 * Jakákoliv změna (např. zrušení reverse a náhrada obracením v UI) je REGRESE.
 * @param filePath Cesta k markdown souboru.
 * @param recent Pole do něhož se přidávají nalezené prompty.
 */
export function loadPromptsFromFile(filePath: string, recent: string[]): void {
  info(`📂 ============ LOADING PROMPTS FROM FILE ============`);
  info(`File path: "${filePath}"`);
  info(`Current recent prompts count BEFORE load: ${recent.length}`);

  try {
    const c = fs.readFileSync(filePath, 'utf8');
    info(`📄 File size: ${c.length} characters`);

    const sections = c.split(/(?=_\*\*User\*\*_)/);
    info(`📋 Found ${sections.length} sections in file`);

    const collected: string[] = [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (s.includes('_**User**_')) {
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

    // NEODSTRAŇOVAT: Obrácené pořadí v rámci souboru – nejnovější (poslední v souboru) jde první.
    const reversed = collected.reverse();
    for (let i = 0; i < reversed.length; i++) {
      const p = reversed[i];
      recent.push(p);
      info(`  Added prompt ${i+1}/${reversed.length}: "${p.substring(0, 60)}..."`);
    }

    info(`✅ Loading complete - recent prompts count AFTER load: ${recent.length}`);
    info(`📂 ============ FILE LOADING END ============`);
  } catch (e) {
    info(`❌ ERROR loading file: ${e}`);
    info(`📂 ============ FILE LOADING END (WITH ERROR) ============`);
  }
}
