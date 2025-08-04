export function getHtmlForWebview(prompts: Array<{number: string; shortPrompt: string; fullContent: string}>): string {
	console.log(`getHtmlForWebview called with ${prompts.length} prompts`);
	
	if (prompts.length === 0) {
		console.log('Generating empty state HTML');
		return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Recent AI Prompts</title>
			<style>
				body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); }
				.no-prompts { text-align: center; color: var(--vscode-descriptionForeground); margin: 20px 0; }
				.refresh-btn { 
					background: var(--vscode-button-background); 
					color: var(--vscode-button-foreground); 
					border: none; 
					padding: 8px 16px; 
					border-radius: 4px; 
					cursor: pointer; 
					font-size: 12px;
					margin: 10px 0;
				}
				.refresh-btn:hover { background: var(--vscode-button-hoverBackground); }
			</style>
		</head>
		<body>
			<div class="no-prompts">No AI prompts detected yet</div>
			<button class="refresh-btn" onclick="refresh()">Refresh</button>
			<script>
				const vscode = acquireVsCodeApi();
				function refresh() {
					vscode.postMessage({ type: 'refresh' });
				}
			</script>
		</body>
		</html>`;
	}

	const promptItems = prompts.map(prompt => `
		<div class="prompt-item">
			<div class="prompt-number">${prompt.number}</div>
			<div class="prompt-text" title="${prompt.fullContent.replace(/"/g, '&quot;')}">${prompt.shortPrompt}</div>
		</div>
	`).join('');

	console.log(`Generated promptItems HTML for ${prompts.length} prompts, HTML length: ${promptItems.length}`);
	console.log('First 3 prompts preview:', prompts.slice(0, 3).map(p => `${p.number}: ${p.shortPrompt.substring(0, 30)}...`).join(' | '));

	return `
	<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Recent AI Prompts</title>
		<style>
			body { 
				font-family: var(--vscode-font-family); 
				padding: 8px; 
				margin: 0; 
				color: var(--vscode-foreground); 
				background: var(--vscode-sideBar-background);
				font-size: 12px;
			}
			.header { 
				font-weight: bold; 
				margin-bottom: 8px; 
				color: var(--vscode-sideBarTitle-foreground);
				font-size: 11px;
				text-transform: uppercase;
			}
			.prompt-item { 
				display: flex; 
				padding: 4px 0; 
				border-bottom: 1px solid var(--vscode-sideBar-border);
				align-items: flex-start;
			}
			.prompt-item:last-child { border-bottom: none; }
			.prompt-number { 
				color: var(--vscode-charts-blue); 
				font-weight: bold; 
				margin-right: 6px; 
				min-width: 24px;
				font-size: 10px;
			}
			.prompt-text { 
				flex: 1; 
				line-height: 1.3; 
				word-wrap: break-word;
				font-size: 11px;
				color: var(--vscode-sideBar-foreground);
			}
			.refresh-btn { 
				background: var(--vscode-button-background); 
				color: var(--vscode-button-foreground); 
				border: none; 
				padding: 4px 8px; 
				border-radius: 2px; 
				cursor: pointer; 
				font-size: 10px;
				margin: 4px 0;
				width: 100%;
			}
			.refresh-btn:hover { background: var(--vscode-button-hoverBackground); }
		</style>
	</head>
	<body>
		<div class="header">Recent AI Prompts (${prompts.length})</div>
		<button class="refresh-btn" onclick="refresh()">Refresh</button>
		${promptItems}
		<script>
			const vscode = acquireVsCodeApi();
			function refresh() {
				vscode.postMessage({ type: 'refresh' });
			}
		</script>
	</body>
	</html>`;
}
