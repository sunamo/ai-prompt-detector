/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného zlepšení čitelnosti je regrese.
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
 * Načte prompt(y) ze souboru SpecStory a přidá je do pole recent.
 * Jednoduché parsování: sekce oddělené markerem uživatele.
 * @param filePath Cesta k markdown souboru.
 * @param recent Pole do něhož se přidávají nalezené prompty.
 */
export function loadPromptsFromFile(filePath: string, recent: string[]): void {
  try {
    const c = fs.readFileSync(filePath, 'utf8');
    const sections = c.split(/(?=_\*\*User\*\*_)/);
    for (const s of sections) {
      if (s.includes('_**User**_')) {
        const body = s
          .split('\n')
          .slice(1)
          .join(' ')
          .split('---')[0]
          .trim();
        if (body && body.length > 0) recent.push(body);
      }
    }
  } catch {}
}
