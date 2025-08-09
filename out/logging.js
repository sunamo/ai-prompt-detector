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
exports.log = log;
exports.logError = logError;
exports.validateRecentLogs = validateRecentLogs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const LOG_DIR = 'C:/temp/specstory-autosave-logs';
const MAX_LOG_AGE_MS = 5 * 60 * 1000; // 5 minutes
function ensureDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}
function ts() {
    return new Date().toISOString();
}
function settingDebug() {
    return vscode.workspace.getConfiguration().get('specstoryAutosave.debugLogging', true) ?? true;
}
function write(line) {
    ensureDir();
    const file = path.join(LOG_DIR, 'extension.log');
    fs.appendFileSync(file, line + '\n');
}
function log(level, message, data) {
    if (level === 'debug' && !settingDebug())
        return;
    const line = `[${ts()}][${level}] ${message}` + (data !== undefined ? ` | ${safe(data)}` : '');
    write(line);
}
function logError(message, err) {
    write(`[${ts()}][error] ${message} | ${safe(err)}`);
}
function safe(obj) {
    try {
        return typeof obj === 'string' ? obj : JSON.stringify(obj);
    }
    catch {
        return String(obj);
    }
}
function validateRecentLogs() {
    ensureDir();
    const file = path.join(LOG_DIR, 'extension.log');
    if (!fs.existsSync(file)) {
        throw new Error('Log file not found - logging not functioning');
    }
    const stats = fs.statSync(file);
    const age = Date.now() - stats.mtimeMs;
    if (age > MAX_LOG_AGE_MS) {
        throw new Error('Logs older than 5 minutes - logging malfunction');
    }
}
//# sourceMappingURL=logging.js.map