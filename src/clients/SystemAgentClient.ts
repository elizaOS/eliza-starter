// THIS IS INCASE WE WANT AN AGENT THAT WATCHES PUBLIC CHAT

// import axios from 'axios';
// import { EventEmitter } from 'events';
// import { DirectClient, DirectClientInterface } from '@elizaos/client-direct';
// import {
//   SystemMessage,
//   SystemResponse,
//   SystemState,
//   PvPActionType,
//   SystemMessageType,
//   PublicChatMessage
// } from './types.ts';

// export class SystemClient extends DirectClient {
//   private readonly systemId: string;
//   private readonly roomId: number;
//   private readonly endpoint: string;
//   private readonly creatorId: string;
//   private readonly eventEmitter: EventEmitter;
//   private isActive = true;
//   private publicWs: WebSocket | null = null;

//   // System state cache
//   private systemState: SystemState = {
//     activeAgents: [],
//     activeEffects: [],
//     systemStatus: {
//       isHealthy: true,
//       lastUpdate: Date.now()
//     }
//   };

//   constructor(endpoint: string, roomId: number, systemId: string, creatorId: string, publicChatUrl?: string) {
//     super();
//     this.endpoint = endpoint;
//     this.roomId = roomId;
//     this.systemId = systemId;
//     this.creatorId = creatorId;
//     this.eventEmitter = new EventEmitter();
    
//     // Initialize system state and public chat if URL provided
//     this.initializeSystemState();
//     if (publicChatUrl) {
//       this.setupPublicChatMonitor(publicChatUrl);
//     }
//   }

//   private setupPublicChatMonitor(wsUrl: string): void {
//     if (typeof WebSocket !== 'undefined') {
//       this.publicWs = new WebSocket(wsUrl);
      
//       this.publicWs.onmessage = (event) => {
//         try {
//           const message: PublicChatMessage = JSON.parse(event.data);
//           // Broadcast to all connected clients
//           this.broadcastPublicChat(message);
//         } catch (error) {
//           console.error('Error parsing public chat message:', error);
//         }
//       };

//       this.publicWs.onerror = (error) => {
//         console.error('WebSocket error:', error);
//         this.attemptReconnect(wsUrl);
//       };

//       this.publicWs.onclose = () => {
//         if (this.isActive) {
//           this.attemptReconnect(wsUrl);
//         }
//       };
//     }
//   }

//   private async attemptReconnect(wsUrl: string, retryDelay: number = 5000): Promise<void> {
//     if (!this.isActive) return;

//     console.log('Attempting to reconnect to WebSocket...');
//     setTimeout(() => {
//       this.setupPublicChatMonitor(wsUrl);
//     }, retryDelay);
//   }

//   private async broadcastPublicChat(message: PublicChatMessage): Promise<void> {
//     this.eventEmitter.emit('public_chat', message);
    
//     // Broadcast to all connected agents
//     await this.broadcastSystemMessage('SYSTEM_BROADCAST', {
//       type: 'PUBLIC_CHAT',
//       message
//     });
//   }

//   private async initializeSystemState(): Promise<void> {
//     try {
//       const response = await axios.get<SystemResponse>(
//         `${this.endpoint}/${this.roomId}/...`, // Missing endpoint
//         {
//           headers: {
//             'Content-Type': 'application/json'
//           }
//         }
//       );

//       if (response.data.state) {
//         this.systemState = {
//           ...this.systemState,
//           ...response.data.state
//         };
//       }
//     } catch (error) {
//       console.error('Error initializing system state:', error);
//     }
//   }

//   public async executePvPAction(
//     sourceId: string,
//     actionType: PvPActionType,
//     targetId: string,
//     duration: number
//   ): Promise<void> {
//     const timestamp = Date.now();
//     const message: SystemMessage = {
//       agent_id: sourceId,
//       systemId: this.systemId,
//       timestamp,
//       signature: this.generateSignature(actionType, timestamp),
//       messageType: 'PVP_ACTION',
//       payload: {
//         actionType,
//         sourceId,
//         targetId,
//         duration,
//         timestamp
//       },
//       content: {
//         text: `System executing PvP action: ${actionType}`,
//         timestamp,
//         actionType
//       }
//     };

//     try {
//       const response = await axios.post<SystemResponse>(
//         `${this.endpoint}/${this.roomId}/...`, // Missing endpoint
//         message,
//         {
//           headers: {
//             'Content-Type': 'application/json'
//           }
//         }
//       );

//       if (!response.data.success) {
//         throw new Error(response.data.error || 'Failed to execute PvP action');
//       }

//       if (response.data.state) {
//         this.updateSystemState(response.data.state);
//       }
//     } catch (error) {
//       console.error('Error executing PvP action:', error);
//       throw error;
//     }
//   }

//   public async broadcastSystemMessage(
//     messageType: SystemMessageType,
//     payload: any
//   ): Promise<void> {
//     const timestamp = Date.now();
//     const message: SystemMessage = {
//       agent_id: 'SYSTEM',
//       systemId: this.systemId,
//       timestamp,
//       signature: this.generateSignature(messageType, timestamp),
//       messageType,
//       payload,
//       content: {
//         text: `System broadcast: ${messageType}`,
//         timestamp
//       }
//     };

//     try {
//       await axios.post(
//         `${this.endpoint}/${this.roomId}/...`, // Missing endpoint
//         message,
//         {
//           headers: {
//             'Content-Type': 'application/json'
//           }
//         }
//       );
//     } catch (error) {
//       console.error('Error broadcasting system message:', error);
//       throw error;
//     }
//   }

//   public async getSystemState(): Promise<SystemState> {
//     return this.systemState;
//   }

//   private updateSystemState(newState: Partial<SystemState>): void {
//     this.systemState = {
//       ...this.systemState,
//       ...newState
//     };
//     this.eventEmitter.emit('state_update', this.systemState);
//   }

//   private generateSignature(content: string, timestamp: number): string {
//     return Buffer.from(`${this.systemId}:${content}:${timestamp}`).toString('base64');
//   }

//   public on(event: string, listener: (...args: any[]) => void): void {
//     this.eventEmitter.on(event, listener);
//   }

//   public off(event: string, listener: (...args: any[]) => void): void {
//     this.eventEmitter.off(event, listener);
//   }

//   public override stop(): void {
//     this.isActive = false;
//     if (this.publicWs) {
//       this.publicWs.close();
//     }
//     this.eventEmitter.removeAllListeners();
//     super.stop();
//   }
// }