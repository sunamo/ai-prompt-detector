/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Ověří zda soubor odpovídá očekávanému formátu názvu SpecStory exportu.
 * @param filePath Absolutní cesta k souboru.
 * @returns true pokud název i existence souboru vyhovují.
 */
export function isValidSpecStoryFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return (
    /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}Z-.+\.md$/.test(fileName) &&
    fs.existsSync(filePath)
  );
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
  try {
    const c = fs.readFileSync(filePath, 'utf8');
    const sections = c.split(/(?=_\*\*User\*\*_)/);
    const collected: string[] = [];
    for (const s of sections) {
      if (s.includes('_**User**_')) {
        const body = s
          .split('\n')
          .slice(1)
          .join(' ')
          .split('---')[0]
          .trim();
        if (body && body.length > 0) collected.push(body);
      }
    }
    // NEODSTRAŇOVAT: Obrácené pořadí v rámci souboru – nejnovější (poslední v souboru) jde první.
    for (const p of collected.reverse()) recent.push(p);
  } catch {}
}
