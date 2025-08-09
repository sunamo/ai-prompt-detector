import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let channel: vscode.OutputChannel; let dailyPath=''; let debugEnabled=false;
function refreshDebug(){ debugEnabled = vscode.workspace.getConfiguration('ai-prompt-detector').get<boolean>('enableDebugLogs', false) || false; }
export function initLogger(){ channel = vscode.window.createOutputChannel('SpecStory Prompts'); refreshDebug(); const dir='C:/temp/ai-prompt-detector-logs'; try{ if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}); }catch{} dailyPath=path.join(dir,'extension-'+new Date().toISOString().slice(0,10)+'.log'); try{ fs.writeFileSync(dailyPath,''); }catch{} info('Log init'); vscode.workspace.onDidChangeConfiguration(e=>{ if(e.affectsConfiguration('ai-prompt-detector.enableDebugLogs')) refreshDebug(); }); }
function append(m:string){ channel.appendLine(m); try{ fs.appendFileSync(dailyPath,`[${new Date().toISOString()}] ${m}\n`);}catch{} }
export function info(m:string){ append(m); }
export function debug(m:string){ if(debugEnabled) append(m); }
export function error(m:string){ append(m); }
