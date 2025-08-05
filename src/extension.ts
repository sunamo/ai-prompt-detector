import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;

// ÚPLNĚ NOVÝ ACTIVITY BAR PROVIDER S DUMMY OBSAHEM
class DummyActivityBarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'specstory-autosave-view';

	constructor() {
		console.log('🎯 DUMMY: Activity Bar Provider vytvořen');
	}

	public resolveWebviewView(webviewView: vscode.WebviewView) {
		console.log('🎯 DUMMY: resolveWebviewView ZAČÍNÁ');
		
		// Nastavení webview - bez skriptů
		webviewView.webview.options = {
			enableScripts: false,
			localResourceRoots: []
		};

		// DUMMY OBSAH - hardcoded HTML s test prompty
		const dummyHtml = this.createDummyHtml();
		webviewView.webview.html = dummyHtml;
		
		console.log('🎯 DUMMY: HTML nastaven, délka:', dummyHtml.length);
		
		if (outputChannel) {
			outputChannel.appendLine('🎯 DUMMY: Webview HTML byl nastaven');
			outputChannel.appendLine('🎯 DUMMY: Obsah obsahuje "dobrý den a nic nedělje"');
		}
	}

	private createDummyHtml(): string {
		return `<!DOCTYPE html>
<html lang="cs">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>SpecStory Dummy</title>
	<style>
		body {
			font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
			background-color: #252526;
			color: #cccccc;
			margin: 0;
			padding: 10px;
			font-size: 13px;
		}
		.header {
			background-color: #2d2d30;
			padding: 10px;
			border-radius: 5px;
			margin-bottom: 15px;
			text-align: center;
		}
		.prompt-item {
			background-color: #1e1e1e;
			border: 1px solid #3c3c3c;
			border-left: 4px solid #007acc;
			margin: 8px 0;
			padding: 12px;
			border-radius: 3px;
		}
		.prompt-number {
			font-weight: bold;
			color: #569cd6;
			margin-bottom: 5px;
		}
		.prompt-text {
			color: #d4d4d4;
			line-height: 1.4;
		}
		.status {
			margin-top: 20px;
			padding: 10px;
			background-color: #0e639c;
			border-radius: 3px;
			text-align: center;
			color: white;
		}
	</style>
</head>
<body>

<div class="header">
	<h2 style="margin: 0; color: #4ec9b0;">📋 SpecStory Prompts</h2>
	<small>Dummy test content v1.1.57</small>
</div>

<div class="prompt-item">
	<div class="prompt-number">Prompt #1</div>
	<div class="prompt-text">dobrý den a nic nedělje</div>
</div>

<div class="prompt-item">
	<div class="prompt-number">Prompt #2</div>
	<div class="prompt-text">naschledanou a nic nedělej</div>
</div>

<div class="prompt-item">
	<div class="prompt-number">Prompt #3</div>
	<div class="prompt-text">ahoj a nic nedělej</div>
</div>

<div class="prompt-item">
	<div class="prompt-number">Prompt #4</div>
	<div class="prompt-text">DUMMY TEST: Extension je aktivní a funguje perfektně!</div>
</div>

<div class="prompt-item">
	<div class="prompt-number">Prompt #5</div>
	<div class="prompt-text">Pokud tohle vidíš, Activity Bar provider pracuje správně</div>
</div>

<div class="status">
	✅ Extension loaded successfully<br>
	🚀 Activity Bar Provider active<br>
	📅 Generated: ${new Date().toLocaleString('cs-CZ')}
</div>

</body>
</html>`;
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('🚀 AKTIVACE: Extension se spouští...');
	
	// Vytvoř output channel pro debugging
	outputChannel = vscode.window.createOutputChannel('SpecStory Dummy Test');
	outputChannel.show();
	outputChannel.appendLine('🚀 DUMMY EXTENSION: Spouštění...');
	
	// Vytvoř nový dummy provider
	const dummyProvider = new DummyActivityBarProvider();
	
	// Registruj provider v VS Code
	const registration = vscode.window.registerWebviewViewProvider(
		DummyActivityBarProvider.viewType,
		dummyProvider
	);
	
	// Přidej do subscriptions pro cleanup
	context.subscriptions.push(outputChannel, registration);
	
	outputChannel.appendLine('🚀 DUMMY: Provider zaregistrován');
	outputChannel.appendLine('🚀 DUMMY: Jdi do Activity Bar a otevři SpecStory panel!');
	outputChannel.appendLine('🚀 DUMMY: Měl bys vidět "dobrý den a nic nedělje" jako první prompt');
	
	console.log('🚀 AKTIVACE: Extension úspěšně aktivován');
}

export function deactivate() {
	console.log('🚀 DEAKTIVACE: Extension se vypíná');
	if (outputChannel) {
		outputChannel.appendLine('🚀 DUMMY: Extension deactivated');
	}
}
