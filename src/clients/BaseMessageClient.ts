// TODO for later
// import { DirectClient } from '@elizaos/client-direct';
// import { ethers } from 'ethers';
// import { WsMessageTypes } from '../types/ws.ts';
// import { sortObjectKeys } from './sortObjectKeys.ts';
// import { SharedWebSocket, WebSocketConfig } from './shared-websocket.ts';

// export abstract class BaseMessageClient extends DirectClient {
//   protected readonly wallet: ethers.Wallet;
//   protected readonly walletAddress: string;
//   protected roomId: number;
//   protected wsClient: SharedWebSocket;
//   protected isActive = true;
//   protected readonly endpoint: string;

//   constructor(
//     endpoint: string,
//     walletAddress: string,
//     privateKeyEnv: string
//   ) {
//     super();
//     this.endpoint = endpoint;
//     this.walletAddress = walletAddress;

//     const privateKey = process.env[privateKeyEnv];
//     if (!privateKey) {
//       throw new Error(`${privateKeyEnv} not found in environment variables`);
//     }

//     this.wallet = new ethers.Wallet(privateKey);
//     if (this.wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
//       throw new Error('Private key mismatch');
//     }
//   }

//   protected async initializeWebSocket(config: WebSocketConfig): Promise<void> {
//     if (this.wsClient) {
//       this.wsClient.close();
//     }
//     this.wsClient = new SharedWebSocket(config);
//     await this.wsClient.connect();
//   }

//   protected async generateSignature(content: any): Promise<string> {
//     const messageString = JSON.stringify(sortObjectKeys(content));
//     return await this.wallet.signMessage(messageString);
//   }

//   protected async handleHeartbeat(): Promise<void> {
//     const heartbeatContent = sortObjectKeys({
//       timestamp: Date.now()
//     });
    
//     const signature = await this.generateSignature(heartbeatContent);
    
//     this.wsClient.send({
//       messageType: WsMessageTypes.HEARTBEAT,
//       content: heartbeatContent,
//       signature,
//       sender: this.walletAddress
//     });
//   }

//   public getRoomId(): number {
//     return this.roomId;
//   }

//   public override stop(): void {
//     this.isActive = false;
//     this.wsClient?.close();
//     super.stop();
//   }
// }
