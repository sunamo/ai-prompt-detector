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
exports.testNewAPI = testNewAPI;
const vscode = __importStar(require("vscode"));
function testNewAPI() {
    console.log('Testing new onDidSubmitInput API...');
    // Check if vscode.chat exists
    if (!vscode.chat) {
        console.error('❌ vscode.chat API not available');
        return;
    }
    console.log('✅ vscode.chat API available');
    // Check if the new onDidSubmitInput event is available
    if ('onDidSubmitInput' in vscode.chat) {
        console.log('✅ onDidSubmitInput API AVAILABLE!');
        // Try to subscribe to the event
        const disposable = vscode.chat.onDidSubmitInput((event) => {
            console.log('🎉 Chat submission detected via new API!');
            console.log('  - Prompt:', event.prompt);
            console.log('  - Location:', event.location);
            console.log('  - Session ID:', event.sessionId);
            console.log('  - Is Keyboard:', event.isKeyboard);
            vscode.window.showInformationMessage(`🎉 New API works! Detected ${event.isKeyboard ? 'keyboard' : 'MOUSE'} submission: "${event.prompt}"`);
        });
        console.log('✅ Successfully subscribed to onDidSubmitInput event');
        // Clean up after 5 minutes
        setTimeout(() => {
            disposable.dispose();
            console.log('Test subscription cleaned up');
        }, 5 * 60 * 1000);
    }
    else {
        console.error('❌ onDidSubmitInput API NOT available');
        console.log('Available chat methods:', Object.keys(vscode.chat));
    }
}
// Run the test
testNewAPI();
//# sourceMappingURL=test-api.js.map