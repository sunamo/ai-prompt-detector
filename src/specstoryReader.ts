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
 * Načte prompt(y) ze souboru SpecStory a přidá je do pole recent.
 * Nově: prompty jednoho souboru se nejprve nasbírají do dočasného pole a poté
 * OBRÁTÍ (reverse), aby poslední uživatelský vstup z daného souboru byl
 * zobrazen jako první (#1) – uživatel požadoval nejnovější zprávy nahoře.
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
    // Obrácený pořadí v rámci souboru – nejnovější (poslední v souboru) jde první.
    for (const p of collected.reverse()) recent.push(p);
  } catch {}
}
