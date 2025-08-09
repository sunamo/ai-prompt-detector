import * as fs from 'fs';
import * as path from 'path';

export function isValidSpecStoryFile(filePath: string): boolean {
	const fileName = path.basename(filePath);
	return /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}Z-.+\.md$/.test(fileName) && fs.existsSync(filePath);
}

export function loadPromptsFromFile(filePath: string, recent: string[]): void {
	try {
		const c = fs.readFileSync(filePath,'utf8');
		const sections = c.split(/(?=_\*\*User\*\*_)/);
		for (const s of sections) if (s.includes('_**User**_')) {
			const body = s.split('\n').slice(1).join(' ').split('---')[0].trim();
			if (body && body.length>0) recent.push(body);
		}
	} catch {}
}
