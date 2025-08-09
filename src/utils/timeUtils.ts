/**
 * Extrahuje timestamp z názvu SpecStory souboru ve formátu
 * YYYY-MM-DD_HH-mmZ-... a vrátí Date objekt. Při chybě vrací aktuální čas.
 */
export function extractTimestampFromFileName(fileName: string): Date {
	// Extract timestamp from SpecStory filename format: YYYY-MM-DD_HH-mmZ-conversation-description.md
	const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})Z/);
	if (match) {
		const [, year, month, day, hour, minute] = match;
		return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
	}
	// Fallback to current time if parsing fails
	return new Date();
}
