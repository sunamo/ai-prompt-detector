const fs = require('fs');
const path = require('path');

const chatFile = 'C:\\Users\\radek.jancik\\AppData\\Roaming\\Code - Insiders\\User\\workspaceStorage\\73d45157b904f923871698d9cedbb105\\chatSessions\\6165d438-7034-439f-8d1e-23d1fdfb2742.json';

let lastRequestCount = 0;

console.log('Watching chat file for updates...');
console.log('File:', chatFile);
console.log('');

// Initial read
try {
    const data = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
    lastRequestCount = data.requests.length;
    const lastRequest = data.requests[data.requests.length - 1];
    console.log(`[${new Date().toLocaleTimeString()}] Initial state:`);
    console.log(`  Total requests: ${data.requests.length}`);
    console.log(`  Last request: "${lastRequest.message.text}"`);
    console.log('');
} catch (e) {
    console.error('Error reading file:', e.message);
}

// Watch for changes
fs.watch(chatFile, (eventType, filename) => {
    try {
        const data = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
        const currentRequestCount = data.requests.length;

        if (currentRequestCount !== lastRequestCount) {
            const lastRequest = data.requests[data.requests.length - 1];
            console.log(`[${new Date().toLocaleTimeString()}] NEW REQUEST DETECTED!`);
            console.log(`  Requests: ${lastRequestCount} → ${currentRequestCount}`);
            console.log(`  New prompt text: "${lastRequest.message.text}"`);
            console.log(`  Request ID: ${lastRequest.requestId}`);
            console.log('');
            lastRequestCount = currentRequestCount;
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] File updated (no new requests, probably response update)`);
        }
    } catch (e) {
        console.log(`[${new Date().toLocaleTimeString()}] Error: ${e.message}`);
    }
});

console.log('Press Ctrl+C to stop watching...');
