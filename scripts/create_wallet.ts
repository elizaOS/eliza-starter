import { ethers } from 'ethers';
import * as fs from 'fs';

// Create 5 wallets (4 agents + 1 GM)
const wallets = Array.from({length: 5}, () => {
    const wallet = ethers.Wallet.createRandom();
    return {
        privateKey: wallet.privateKey,
        address: wallet.address,
        agentId: 0 // We'll fill this in
    };
});

// Assign agent IDs
wallets[0].agentId = 51; // GM
wallets[1].agentId = 50; // Agent 1 
wallets[2].agentId = 56; // Agent 2
wallets[3].agentId = 55; // Agent 3  
wallets[4].agentId = 54; // Agent 4

// Create .env format content
let envContent = '# Wallet Private Keys\n\n';
envContent += '# Primary signer key for GM\n';
envContent += `SIGNER_PRIVATE_KEY=${wallets[0].privateKey}\n\n`;
envContent += '# Agent private keys\n';
for (let i = 1; i < wallets.length; i++) {
    envContent += `AGENT_${wallets[i].agentId}_PRIVATE_KEY=${wallets[i].privateKey}\n`;
}

envContent += '\n# Wallet Addresses for Reference\n';
envContent += `# GM: ${wallets[0].address}\n`;
for (let i = 1; i < wallets.length; i++) {
    envContent += `# Agent ${wallets[i].agentId}: ${wallets[i].address}\n`;
}

// Write to wallet_config.txt
fs.writeFileSync('wallet_config.txt', envContent);
console.log('Wallet configuration saved to wallet_config.txt');