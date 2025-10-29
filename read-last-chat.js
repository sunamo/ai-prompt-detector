const fs = require('fs');
const path = require('path');

const chatFile = 'C:\\Users\\radek.jancik\\AppData\\Roaming\\Code - Insiders\\User\\workspaceStorage\\73d45157b904f923871698d9cedbb105\\chatSessions\\6165d438-7034-439f-8d1e-23d1fdfb2742.json';

const data = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
const lastRequest = data.requests[data.requests.length - 1];

console.log('Last request text:', lastRequest.message.text);
console.log('Request ID:', lastRequest.requestId);
console.log('Total requests:', data.requests.length);
