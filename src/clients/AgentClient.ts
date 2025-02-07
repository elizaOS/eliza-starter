import axios from 'axios';
import { DirectClient } from '@elizaos/client-direct';
import { ethers, Wallet } from 'ethers';
import WebSocket from 'ws';
import { WsMessageTypes } from '../types/ws.ts';
import { agentMessageInputSchema, gmMessageInputSchema, observationMessageInputSchema } from '../types/schemas.ts';
import { sortObjectKeys } from './sortObjectKeys.ts';
import { SharedWebSocket, WebSocketConfig } from './shared-websocket.ts';
import { ExtendedAgentRuntime } from '../types/index.ts';
import { MessageHistoryEntry } from './types.ts';



export class AgentClient extends DirectClient {
  private readonly wallet: Wallet;
  private readonly walletAddress: string;
  private readonly agentNumericId: number;
  private roomId: number;
  private roundId: number;
  private readonly endpoint: string;
  private wsClient: SharedWebSocket; // Change from readonly to mutable
  private isActive = true;

  // Add PvP status tracking
  private activePvPEffects: Map<string, any> = new Map();

  // Add these properties after the existing private properties
  private messageContext: MessageHistoryEntry[] = [];
  private readonly MAX_CONTEXT_SIZE = 8;

  constructor(
    endpoint: string,
    walletAddress: string,
    agentNumericId: number,
    port: number
  ) {
    super();
    this.endpoint = endpoint;
    this.walletAddress = walletAddress;
    this.agentNumericId = agentNumericId;

    // Get agent's private key from environment
    const privateKey = process.env[`AGENT_${agentNumericId}_PRIVATE_KEY`];
    if (!privateKey) {
      throw new Error(`Private key not found for agent ${agentNumericId}`);
    }

    this.wallet = new ethers.Wallet(privateKey);
    if (this.wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error(`Private key mismatch for agent ${agentNumericId}`);
    }

    // Create initial WebSocket config
    const wsConfig: WebSocketConfig = {
      endpoint: this.endpoint,
      roomId: 0, // Will be set later in setRoomAndRound
      auth: {
        walletAddress: this.walletAddress,
        agentId: this.agentNumericId,
      },
      handlers: {
        onMessage: this.handleWebSocketMessage.bind(this),
        onError: console.error,
        onClose: () => console.log(`Agent ${this.agentNumericId} disconnected`)
      }
    };

    // Initialize WebSocket client
    this.wsClient = new SharedWebSocket(wsConfig);
  }

  // Update to only require roomId - backend manages round assignment
  public async setRoomAndRound(roomId: number): Promise<void> {
    console.log(`Connecting agent ${this.agentNumericId} to room ${roomId}`);
    this.roomId = roomId;
    
    // Get round ID from contract state
    try {
      const activeRound = await this.getActiveRoundFromContract();
      if (!activeRound) {
        throw new Error('No active round found');
      }
      this.roundId = activeRound;
      console.log(`Connected to room ${roomId} round ${activeRound}`);
    } catch (error) {
      console.error('Error getting active round:', error);
      throw error;
    }

    const timestamp = Date.now();
    const authContent = sortObjectKeys({
      walletAddress: this.wallet.address,
      agentId: this.agentNumericId,
      roomId: this.roomId,
      timestamp
    });
    
    const signature = await this.wallet.signMessage(JSON.stringify(authContent));

    // Create new WebSocket connection with updated config
    const wsConfig: WebSocketConfig = {
      endpoint: this.endpoint,
      roomId: this.roomId,
      auth: {
        walletAddress: this.wallet.address,
        agentId: this.agentNumericId,
        timestamp,
        signature
      },
      handlers: {
        onMessage: this.handleWebSocketMessage.bind(this),
        onError: console.error,
        onClose: () => {
          if (this.isActive) {
            console.log('Agent disconnected, reconnecting...');
            setTimeout(() => this.wsClient?.connect(), 5000);
          }
        }
      }
    };

    // Close existing connection if any
    if (this.wsClient) {
      this.wsClient.close();
    }

    // Create new connection
    this.wsClient = new SharedWebSocket(wsConfig);
    await this.wsClient.connect();
  }

  private async getActiveRoundFromContract(): Promise<number> {
    // TODO: Replace with actual contract call
    // For now return static value that matches backend
    return 570; 
  }

// Helper methods to match SQL data
  private getAgentImage(id: number): string {
    const images: {[key: number]: string} = {
      50: 'https://randomuser.me/api/portraits/lego/9.jpg',
      51: 'https://imgur.com/a/kTIC1Vf',
      56: 'https://randomuser.me/api/portraits/men/44.jpg',
      57: 'https://randomuser.me/api/portraits/women/45.jpg',
      58: 'https://randomuser.me/api/portraits/men/46.jpg'
    };
    return images[id] || 'https://placekitten.com/200/200';
  }

  private getAgentColor(id: number): string {
    const colors: {[key: number]: string} = {
      50: '#66f817',
      51: '#E0E722',
      56: '#627EEA',
      57: '#14F195',
      58: '#E84142'
    };
    return colors[id] || '#' + Math.floor(Math.random()*16777215).toString(16);
  }

  private getAgentName(id: number): string {
    const names: {[key: number]: string} = {
      50: 'Alfred',
      51: 'Gaia',
      56: 'Batman',
      57: 'Celine',
      58: 'Dolo'
    };
    return names[id] || `Agent ${id}`;
  }

  private getAgentSummary(id: number): string {
    const summaries: {[key: number]: string} = {
      50: 'Alfred, advocate for BTC',
      51: 'Not actually a mother',
      56: 'Ethereum maximalist focused on smart contract capabilities',
      57: 'Solana maximalist advocating for high performance',
      58: 'Avalanche maximalist championing subnet technology'
    };
    return summaries[id] || '';
  }

  public async sendAIMessage(content: { text: string }): Promise<void> {
    if (!this.roomId || !this.roundId) {
      throw new Error('Agent not initialized with room and round IDs');
    }

    try {
        // Create message content with fields in exact order
        const messageContent = sortObjectKeys({
            agentId: this.agentNumericId,
            roomId: this.roomId,
            roundId: this.roundId,
            text: content.text,
            timestamp: Date.now()
        });

        // Generate signature
        const signature = await this.generateSignature(messageContent);

        // Construct final message
        const message = {
            messageType: WsMessageTypes.AGENT_MESSAGE,
            signature,
            sender: this.walletAddress,
            content: messageContent
        };

        // Send message to backend message handler
        await axios.post(
            `${this.endpoint}/messages/agentMessage`,
            message,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

    } catch (error) {
        console.error('Error sending agent message:', error);
        throw error;
    }
}

  public getAgentId(): number {
    return this.agentNumericId;
  }

  private async generateSignature(content: any): Promise<string> {
    // Create message object with exact field order matching backend
    const messageObj = sortObjectKeys({
        agentId: content.agentId,
        roomId: content.roomId,
        roundId: content.roundId,
        text: content.text,
        timestamp: content.timestamp
    });

    const messageString = JSON.stringify(messageObj);
    console.log('Agent signing message:', messageString);
    return await this.wallet.signMessage(messageString);
}

  private async handleGMMessage(message: any): Promise<void> {
    try {
      const validatedMessage = gmMessageInputSchema.parse(message);
      // Generate response using the chat module
      const response = await this.processMessage(validatedMessage.content.message);
      if (response) {
        await this.sendAIMessage({ text: response });
      }
    } catch (error) {
      console.error('Error handling GM message:', error);
    }
  }

  private async handleAgentMessage(message: any): Promise<void> {
    try {
      const validatedMessage = agentMessageInputSchema.parse(message);
      // Only respond to messages from other agents
      if (validatedMessage.content.agentId !== this.agentNumericId) {
        const response = await this.processMessage(validatedMessage.content.text);
        if (response) {
          await this.sendAIMessage({ text: response });
        }
      }
    } catch (error) {
      console.error('Error handling agent message:', error);
    }
  }

  private async handleObservation(message: any): Promise<void> {
    try {
      const validatedMessage = observationMessageInputSchema.parse(message);
      // Process observation if for current round
      if (validatedMessage.content.roundId === this.roundId) {
        const response = await this.processMessage(
          `Observed: ${JSON.stringify(validatedMessage.content.data)}`
        );
        if (response) {
          await this.sendAIMessage({ text: response });
        }
      }
    } catch (error) {
      console.error('Error handling observation:', error);
    }
  }

  protected async processMessage(message: string): Promise<string | null> {
    try {
      // Handle raw string messages from GM
      if (typeof message === 'string' && !message.startsWith('{')) {
        const prompt = this.buildPromptWithContext(message);
        
        // For now returning the message as-is
        return message;
      }

      // Handle JSON messages
      const parsedMessage = JSON.parse(message);
      
      // First check if message should be processed based on PvP status
      if (this.isAffectedByPvP(parsedMessage)) {
        return null;
      }

      // Apply any PvP modifications
      const modifiedMessage = this.applyPvPEffects(parsedMessage);

      // Update context based on message type
      switch (modifiedMessage.messageType) {
        case WsMessageTypes.GM_MESSAGE:
          if (this.messageContext.length >= this.MAX_CONTEXT_SIZE) {
            this.messageContext.shift();
          }
          this.messageContext.push({
            timestamp: Date.now(),
            agentId: 51, // GM ID
            text: modifiedMessage.content.message,
            agentName: 'Game Master',
            role: 'gm'
          });
          const gmPrompt = this.buildPromptWithContext(modifiedMessage.content.message);
          return gmPrompt;

        case WsMessageTypes.AGENT_MESSAGE:
          if (modifiedMessage.content.agentId !== this.agentNumericId) {
            if (this.messageContext.length >= this.MAX_CONTEXT_SIZE) {
              this.messageContext.shift();
            }
            this.messageContext.push({
              timestamp: Date.now(),
              agentId: modifiedMessage.content.agentId,
              text: modifiedMessage.content.text,
              agentName: `Agent ${modifiedMessage.content.agentId}`,
              role: 'agent'
            });
            const agentPrompt = this.buildPromptWithContext(modifiedMessage.content.text);
            return agentPrompt;
          }
          return null;

        case WsMessageTypes.OBSERVATION:
          if (this.messageContext.length >= this.MAX_CONTEXT_SIZE) {
            this.messageContext.shift();
          }
          this.messageContext.push({
            timestamp: Date.now(),
            agentId: modifiedMessage.content.agentId,
            text: `Observation: ${JSON.stringify(modifiedMessage.content.data)}`,
            agentName: 'Oracle',
            role: 'oracle'
          });
          const obsPrompt = this.buildPromptWithContext(
            `Observation: ${JSON.stringify(modifiedMessage.content.data)}`
          );
          return obsPrompt;

        case WsMessageTypes.HEARTBEAT:
          return JSON.stringify({
            messageType: WsMessageTypes.HEARTBEAT,
            content: {}
          });

        case WsMessageTypes.SYSTEM_NOTIFICATION:
          console.log('System notification:', modifiedMessage.content);
          return null;

        default:
          console.log('Unknown message type:', modifiedMessage.messageType);
          return null;
      }
    } catch (error) {
      console.error('Error processing message:', error);
      return null;
    }
  }

  private buildPromptWithContext(text: string): string {
    let prompt = `You are participating in a crypto debate. Your message should be a direct response to the conversation context below.

Previous messages:
${this.messageContext.map(msg => 
  `${msg.agentName} (${msg.role}): ${msg.text}`
).join('\n')}

Based on this context, respond with your perspective on the discussion. Remember to:
1. Reference specific points made by others
2. Stay in character as your assigned chain advocate
3. Keep responses clear and focused
4. Support your arguments with technical merits
5. Maintain a professional but passionate tone

Your response to the current topic: ${text}
`;
    return prompt;
  }

  private isAffectedByPvP(message: any): boolean {
    // Check for silence/deafen effects
    const silenceEffect = this.activePvPEffects.get('SILENCE');
    const deafenEffect = this.activePvPEffects.get('DEAFEN');
    
    if (silenceEffect && message.messageType === 'agent_message') {
      return true; // Blocked by silence
    }
    if (deafenEffect && message.messageType === 'agent_message') {
      return true; // Blocked by deafen
    }
    return false;
  }

  private applyPvPEffects(message: any): any {
    let modified = {...message};
    
    // Apply poison effect if active
    const poisonEffect = this.activePvPEffects.get('POISON');
    if (poisonEffect && message.content?.text) {
      modified.content.text = this.applyPoisonEffect(
        message.content.text,
        poisonEffect
      );
    }
    
    return modified;
  }

  private applyPoisonEffect(text: string, effect: any): string {
    const {find, replace, caseSensitive} = effect;
    const regex = new RegExp(find, caseSensitive ? 'g' : 'gi');
    return text.replace(regex, replace);
  }

  // Handle PvP status updates
  private handlePvPStatusUpdate(message: any): void {
    if (message.type === 'PVP_ACTION_ENACTED') {
      this.activePvPEffects.set(message.action.type, message.action);
    } else if (message.type === 'PVP_STATUS_REMOVED') {
      this.activePvPEffects.delete(message.action.type);
    }
  }

  private async handleWebSocketMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.messageType) {
        case WsMessageTypes.GM_MESSAGE:
          // Process GM message and generate response
          const response = await this.processMessage(message.content.message);
          if (response) {
              await this.sendAIMessage({ text: response });
          }
          break;

        case WsMessageTypes.AGENT_MESSAGE:
          this.handleAgentMessage(message).catch(console.error);
          break;

        case WsMessageTypes.OBSERVATION:
          this.handleObservation(message).catch(console.error);
          break;

        case WsMessageTypes.SYSTEM_NOTIFICATION:
          console.log(`System notification for agent ${this.agentNumericId}:`, message.content.text);
          break;

        case WsMessageTypes.HEARTBEAT:
          // Send signed heartbeat response
          const heartbeatContent = sortObjectKeys({
              timestamp: Date.now()
          });
          
          const signature = await this.wallet.signMessage(
              JSON.stringify(heartbeatContent)
          );
          
          this.wsClient.send({
              messageType: WsMessageTypes.HEARTBEAT,
              content: heartbeatContent,
              signature,
              sender: this.walletAddress
          });
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  public getRoomId(): number {
    return this.roomId;
  }

  public getRoundId(): number {
    return this.roundId;
  }

  public override stop(): void {
    this.isActive = false;
    this.wsClient?.close();
    super.stop();
  }
}