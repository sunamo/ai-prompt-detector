/**
 * ČITELNOST: Soubor musí zůstat vždy plně čitelný pro programátora.
 * Žádné umělé zkracování řádků, slučování nesouvisejících příkazů na jeden řádek
 * ani minifikace. Snížení počtu řádků bez jasného, zdokumentovaného zlepšení
 * čitelnosti je REGRESE a musí být vráceno. Zachovávej logické bloky a vertikální strukturu.
 */

import * as vscode from 'vscode';

export function testNewApi(context: vscode.ExtensionContext): boolean {
    console.log('🔍 Testing for new onDidSubmitInput API...');
    
    // Cast to any to access proposed API
    const vscodeExtended = vscode as any;
    
    // Check if the new API exists
    if (vscodeExtended.chat?.onDidSubmitInput) {
        console.log('✅ NEW API FOUND: onDidSubmitInput is available!');
        
        try {
            // Subscribe to the new event
            const disposable = vscodeExtended.chat.onDidSubmitInput((event: any) => {
                console.log('🎯 CHAT SUBMISSION via NEW API');
                console.log('  Prompt:', event.prompt);
                console.log('  Location:', event.location); 
                console.log('  Session:', event.sessionId);
                console.log('  Method:', event.isKeyboard ? 'KEYBOARD' : 'MOUSE');
                
                // Show notification
                vscode.window.showInformationMessage(
                    `✅ NEW API: Chat sent via ${event.isKeyboard ? 'keyboard' : 'MOUSE CLICK'}!`
                );
            });
            
            context.subscriptions.push(disposable);
            
            vscode.window.showInformationMessage(
                '🎉 NEW onDidSubmitInput API is active! Mouse detection should work!'
            );
            
            return true;
        } catch (error) {
            console.error('Error subscribing to onDidSubmitInput:', error);
            return false;
        }
    } else {
        console.log('❌ NEW API NOT FOUND: onDidSubmitInput is not available');
        console.log('Available chat methods:', Object.keys(vscodeExtended.chat || {}));
        
        // Show what's available
        if (vscodeExtended.chat) {
            for (const key of Object.keys(vscodeExtended.chat)) {
                console.log(`  - chat.${key}: ${typeof vscodeExtended.chat[key]}`);
            }
        }
        
        return false;
    }
}

/**
 * Check API status and return detailed information
 */
export function getApiStatus(): {
    hasNewApi: boolean;
    availableMethods: string[];
    proposedApiEnabled: boolean;
} {
    const vscodeExtended = vscode as any;
    
    return {
        hasNewApi: !!vscodeExtended.chat?.onDidSubmitInput,
        availableMethods: vscodeExtended.chat ? Object.keys(vscodeExtended.chat) : [],
        proposedApiEnabled: !!vscodeExtended.chat
    };
}