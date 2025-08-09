import * as vscode from 'vscode';
import * as path from 'path';
import { state } from './state';
import { PromptsProvider } from './activityBarProvider';
import { isValidSpecStoryFile, loadPromptsFromFile } from './specstoryReader';
import { initLogger, info, debug } from './logger';
import { focusChatInput, forwardToChatAccept, getChatInputText } from './chatHelpers';

let statusBarItem: vscode.StatusBarItem; let providerRef: PromptsProvider | undefined; let lastSubmittedText=''; let aiPromptCounter=0; let typingBuffer='';

export async function activate(context: vscode.ExtensionContext) {
	initLogger(); info('Activation start');
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100); statusBarItem.show();
	const updateStatusBar = () => { const v = vscode.extensions.getExtension('sunamocz.ai-prompt-detector')?.packageJSON.version || '1.x'; statusBarItem.text = `🤖 AI Prompts: ${aiPromptCounter} | v${v}`; };
	const recordPrompt = (text: string, source: string) => { const t = text.trim(); if (!t || t === lastSubmittedText) return false; lastSubmittedText = t; state.recentPrompts.unshift(t); if (state.recentPrompts.length > 1000) state.recentPrompts.splice(1000); aiPromptCounter++; providerRef?.refresh(); updateStatusBar(); typingBuffer=''; const msg = vscode.workspace.getConfiguration('ai-prompt-detector').get<string>('customMessage','') || 'We will verify quality & accuracy.'; vscode.window.showInformationMessage(`AI Prompt sent (${source})\n${msg}`); return true; };
	updateStatusBar();

	await loadExistingPrompts(); providerRef = new PromptsProvider(); const registration = vscode.window.registerWebviewViewProvider(PromptsProvider.viewType, providerRef);

	// Chat API
	try { const chatNs: any = (vscode as any).chat; if (chatNs?.onDidSubmitRequest) context.subscriptions.push(chatNs.onDidSubmitRequest((e:any)=>{ try { if(recordPrompt(String(e?.request?.message||e?.request?.prompt||e?.prompt||'').trim(),'chatApi')) debug('chatApi captured'); } catch(err){ debug('chat api err '+err); } })); } catch(e){ debug('chat api init err '+e); }

	// Command listener + typing buffer
	try { const cmdsAny = vscode.commands as any; if (cmdsAny?.onDidExecuteCommand) { const sendCommands = new Set([
		'github.copilot.chat.acceptInput','github.copilot.chat.send','github.copilot.chat.sendMessage','github.copilot.chat.submit','github.copilot.chat.executeSubmit','github.copilot.chat.inlineSubmit',
		'workbench.action.chat.acceptInput','workbench.action.chat.submit','workbench.action.chat.executeSubmit','workbench.action.chat.submitWithCodebase','workbench.action.chat.submitWithoutDispatching','workbench.action.chat.send','workbench.action.chat.sendMessage','workbench.action.chat.sendToNewChat',
		'inlineChat.accept','chat.acceptInput','interactive.acceptInput'
	]); context.subscriptions.push(cmdsAny.onDidExecuteCommand(async (ev:any)=>{ try { const cmd = ev?.command as string; if(!cmd) return; if (cmd === 'type') { const txt = ev?.args?.[0]?.text as string|undefined; if (txt && !txt.includes('\n')) { typingBuffer += txt; if (typingBuffer.length>4000) typingBuffer = typingBuffer.slice(-4000); } return; } if (cmd === 'deleteLeft') { typingBuffer = typingBuffer.slice(0,-1); return; } if (cmd === 'editor.action.clipboardPasteAction') { try { const clip = await vscode.env.clipboard.readText(); if (clip) typingBuffer += clip; } catch{} return; } if (sendCommands.has(cmd)) { setTimeout(async ()=>{ try { let snapshot = typingBuffer.trim(); if (!snapshot) snapshot = await getChatInputText(); if (snapshot) recordPrompt(snapshot,'cmd'); } catch(e2){ debug('post-send capture err '+e2); } }, 10); } } catch(err){ debug('cmd hook err '+err); } })); } } catch(e){ debug('cmd hook init err '+e); }

	// Enter / klavesove zkratky
	context.subscriptions.push(vscode.commands.registerCommand('ai-prompt-detector.forwardEnterToChat', async () => { try { const text = await getChatInputText(); if (text) { recordPrompt(text,'enter'); } else if (typingBuffer.trim()) { recordPrompt(typingBuffer,'enter-buffer'); } await focusChatInput(); let ok = await forwardToChatAccept(); if(!ok){ for (const id of ['github.copilot.chat.acceptInput','github.copilot.chat.send','github.copilot.chat.submit','workbench.action.chat.acceptInput','workbench.action.chat.submit']) { try { await vscode.commands.executeCommand(id); ok=true; break; } catch{} } } if (ok && !text && !typingBuffer.trim()) { recordPrompt('(empty prompt)','enter-empty'); } } catch(e){ debug('forward err '+e); } }));

	// SpecStory watcher
	const watcher = vscode.workspace.createFileSystemWatcher('**/.specstory/history/*.md'); watcher.onDidCreate(uri => { if (isValidSpecStoryFile(uri.fsPath)) { loadPromptsFromFile(uri.fsPath, state.recentPrompts); providerRef?.refresh(); } }); const configWatcher = vscode.workspace.onDidChangeConfiguration(e=>{ if(e.affectsConfiguration('ai-prompt-detector.maxPrompts')) providerRef?.refresh(); }); context.subscriptions.push(registration, watcher, configWatcher, statusBarItem); info('Activation done');
}

async function loadExistingPrompts(){ const files = await vscode.workspace.findFiles('**/.specstory/history/*.md'); if(!files.length){ state.recentPrompts.push('Welcome to AI Copilot Prompt Detector','TEST: Dummy prompt for demonstration'); return; } const sorted = files.sort((a,b)=>path.basename(b.fsPath).localeCompare(path.basename(a.fsPath))); for(const f of sorted) if(isValidSpecStoryFile(f.fsPath)) loadPromptsFromFile(f.fsPath, state.recentPrompts); }

export function deactivate(){ info('Deactivation'); }
