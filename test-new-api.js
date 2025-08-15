/**
 * Test script for the new onDidSubmitInput API
 * This will test if the patched VS Code exposes the new event
 */

const vscode = require('vscode');

function activate(context) {
    console.log('Testing new onDidSubmitInput API...');
    
    // Check if the API exists
    if (vscode.chat && vscode.chat.onDidSubmitInput) {
        console.log('✅ SUCCESS: onDidSubmitInput API is available!');
        
        // Subscribe to the event
        const disposable = vscode.chat.onDidSubmitInput((event) => {
            console.log('=== CHAT SUBMISSION DETECTED ===');
            console.log('Prompt:', event.prompt);
            console.log('Location:', event.location);
            console.log('Session ID:', event.sessionId);
            console.log('Input Method:', event.isKeyboard ? 'KEYBOARD' : 'MOUSE');
            console.log('================================');
            
            // Show notification
            vscode.window.showInformationMessage(
                `Chat submitted via ${event.isKeyboard ? 'KEYBOARD' : 'MOUSE'}: "${event.prompt.substring(0, 50)}..."`
            );
        });
        
        context.subscriptions.push(disposable);
        
        vscode.window.showInformationMessage('✅ New onDidSubmitInput API is working! Try submitting chat with mouse or keyboard.');
    } else {
        console.log('❌ FAILURE: onDidSubmitInput API is NOT available');
        console.log('Available chat methods:', Object.keys(vscode.chat || {}));
        
        vscode.window.showErrorMessage(
            'onDidSubmitInput API not found. VS Code needs to be rebuilt with the patch applied.'
        );
    }
}

function deactivate() {
    console.log('Test deactivated');
}

module.exports = {
    activate,
    deactivate
};