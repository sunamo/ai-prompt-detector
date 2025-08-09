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
exports.resetSession = resetSession;
exports.incPrompt = incPrompt;
exports.getSession = getSession;
exports.loadHistory = loadHistory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logging_1 = require("./logging");
const HISTORY_GLOB = '.specstory/history';
let session = { promptCount: 0, prompts: [] };
function resetSession() {
    session = { promptCount: 0, prompts: [] };
}
function incPrompt() {
    session.promptCount++;
}
function getSession() { return session; }
function loadHistory(workspaceRoot) {
    const dir = path.join(workspaceRoot, HISTORY_GLOB);
    if (!fs.existsSync(dir)) {
        (0, logging_1.log)('debug', 'history dir missing', { dir });
        return;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const f of files) {
        try {
            const full = path.join(dir, f);
            const content = fs.readFileSync(full, 'utf8');
            session.prompts.push({ file: f, content });
        }
        catch (e) {
            (0, logging_1.log)('debug', 'failed reading history file', { f, e: String(e) });
        }
    }
    (0, logging_1.log)('debug', 'history loaded', { count: session.prompts.length });
}
//# sourceMappingURL=datastore.js.map