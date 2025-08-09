"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const logging_1 = require("./logging");
const datastore_1 = require("./datastore");
async function activate(context) {
    try {
        (0, logging_1.log)('debug', 'activate start');
        (0, logging_1.validateRecentLogs)();
    }
    catch (e) {
        (0, logging_1.logError)('log validation failed', e);
    }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
        (0, datastore_1.loadHistory)(root);
    }
    context.subscriptions.push(vscode.commands.registerCommand('specstoryAutosave.showStatus', () => {
        try {
            const s = (0, datastore_1.getSession)();
            vscode.window.showInformationMessage(`Prompts this session: ${s.promptCount}. Loaded history: ${s.prompts.length}`);
            (0, logging_1.log)('normal', 'status requested', s);
        }
        catch (e) {
            (0, logging_1.logError)('showStatus failed', e);
        }
    }));
    // Example of tracking prompts: here we hook into Chat input (placeholder - integrate with real APIs referencing other repos later)
    // Minimal placeholder: onDidChangeTextDocument for files in history directory as a stand-in for prompt events
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(ev => {
        try {
            if (ev.document.fileName.includes('.specstory')) {
                (0, datastore_1.incPrompt)();
                (0, logging_1.log)('debug', 'prompt increment', { file: ev.document.fileName });
            }
        }
        catch (e) {
            (0, logging_1.logError)('prompt tracking failed', e);
        }
    }));
    (0, logging_1.log)('debug', 'activate complete');
}
function deactivate() {
    (0, logging_1.log)('debug', 'deactivate');
}
//# sourceMappingURL=extension.js.map