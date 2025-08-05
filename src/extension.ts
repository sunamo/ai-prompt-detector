import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;

class UltraSimpleProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'specstory-autosave-view';

	constructor(private readonly _extensionUri: vscode.Uri) {
		console.log('🚀 ULTRA SIMPLE: Constructor called');
	}

	public resolveWebviewView(webviewView: vscode.WebviewView) {
		console.log('🚀 ULTRA SIMPLE: resolveWebviewView called');
		
		webviewView.webview.options = { enableScripts: false };
		
		// ABSOLUTNĚ NEJJEDNODUŠŠÍ HTML - ŽÁDNÉ VARIABLES, ŽÁDNÁ LOGIKA
		webviewView.webview.html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="color: white; background: #1e1e1e; font-family: Consolas; padding: 15px;">

<h1 style="color: #4CAF50;">🎯 ULTRA SIMPLE TEST</h1>

<div style="border: 1px solid #555; margin: 10px 0; padding: 10px; border-radius: 5px;">
<strong style="color: #FFD700;">#1:</strong> dobrý den a nic nedělje
</div>

<div style="border: 1px solid #555; margin: 10px 0; padding: 10px; border-radius: 5px;">
<strong style="color: #FFD700;">#2:</strong> FUNGUJE TO KONEČNĚ!
</div>

<div style="border: 1px solid #555; margin: 10px 0; padding: 10px; border-radius: 5px;">
<strong style="color: #FFD700;">#3:</strong> Extension je ŽIVÝ!
</div>

<p style="color: #888; margin-top: 20px;">
Pokud tohle vidíš, extension funguje!<br>
Čas aktivace: HNED TEĎ
</p>

</body>
</html>`;

		console.log('🚀 ULTRA SIMPLE: HTML nastaveno');
		if (outputChannel) {
			outputChannel.appendLine('🚀 HTML byl nastaven na webview');
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('🚀🚀🚀 ULTRA SIMPLE ACTIVATION START 🚀🚀🚀');
	
	outputChannel = vscode.window.createOutputChannel('SpecStory Ultra Simple');
	outputChannel.show();
	outputChannel.appendLine('🚀 ULTRA SIMPLE: Extension starting...');
	
	const provider = new UltraSimpleProvider(context.extensionUri);
	const registration = vscode.window.registerWebviewViewProvider('specstory-autosave-view', provider);
	
	context.subscriptions.push(outputChannel, registration);
	
	outputChannel.appendLine('🚀 ULTRA SIMPLE: Provider registered successfully');
	outputChannel.appendLine('🚀 ULTRA SIMPLE: Jdi do Activity Bar a otevři SpecStory panel!');
	
	console.log('🚀🚀🚀 ULTRA SIMPLE ACTIVATION COMPLETE 🚀🚀🚀');
}

export function deactivate() {
	console.log('🚀 ULTRA SIMPLE: Extension deactivated');
}
