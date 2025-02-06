// IMPORTANT: Message Signing Protocol
// All messages are deterministically stringified by sorting object keys recursively (using sortObjectKeys)
// before signing. Ensure the client and server use the identical sorting function.

import axios from 'axios';
import { DirectClient } from '@elizaos/client-direct';
import { AIResponse, MessageHistoryEntry } from './types.ts';
import { agentMessageInputSchema, gmMessageInputSchema, observationMessageInputSchema } from '../types/schemas.ts';
import { WsMessageTypes } from '../types/ws.ts';
import { z } from 'zod';
import { PvPEffect } from '../types/schemas.ts';
import { PvpActions } from '../types/pvp.ts';
import { ethers } from 'ethers';
import { sortObjectKeys } from './sortObjectKeys.ts';  // Imported shared sortObjectKeys
import WebSocket from 'ws'; // Import WebSocket
import { SharedWebSocket, WebSocketConfig } from './shared-websocket.ts';

/**
 * AgentClient handles individual agent interactions with the PvPvAI system
 * 
 * Key responsibilities:
 * - Maintains WebSocket connection to server
 * - Handles message signing and verification
 * - Processes PvP effects received from GM
 * - Manages message queue with retries
 * - Maintains message history context
 * 
 * Communication channels:
 * - WebSocket for real-time updates
 * - REST API for message sending
 * 
 * @class AgentClient
 * @extends DirectClient
 */

export class AgentClient extends DirectClient {
  private readonly walletAddress: string;
  private readonly agentNumericId: number;
  private roomId: number;
  private roundId: number;
  private readonly endpoint: string;
  private readonly creatorId: number;
  private readonly messageQueue: Array<{
    content: string;
    timestamp: number;
    retries: number;
  }> = [];
  private readonly maxRetries = 3;
  private processingQueue = false;
  private isActive = true;
  private activeEffects: PvPEffect[] = [];
  private messageContext: MessageHistoryEntry[] = [];
  private readonly MAX_CONTEXT_SIZE = 8;
  private readonly wallet: ethers.Wallet;  // Use the existing wallet property
  private wsClient: SharedWebSocket;

  /**
   * Initializes a new agent client instance
   * 
   * @param endpoint - Server endpoint URL
   * @param walletAddress - Agent's Ethereum wallet address
   * @param creatorId - Creator's unique identifier
   * @param agentNumericId - Agent's numeric database ID
   */
  constructor(
    endpoint: string,
    walletAddress: string,
    creatorId: number,
    agentNumericId: number
  ) {
    super();
    this.endpoint = endpoint;
    this.walletAddress = walletAddress;
    this.creatorId = creatorId;
    this.agentNumericId = agentNumericId;

    const privateKey = process.env[`AGENT_${agentNumericId}_PRIVATE_KEY`] || process.env.AGENT_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(`Private key not found for agent ${agentNumericId}`);
    }

    const derivedWallet = new ethers.Wallet(privateKey);
    if (derivedWallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error(
        `Private key mismatch - derived address ${derivedWallet.address} does not match expected ${walletAddress}`
      );
    }

    this.wallet = derivedWallet; // Assign to the class property

    console.log(`AgentClient initialized:`, {
      endpoint,
      walletAddress,
      creatorId,
      agentNumericId
    });

    // Initialize wsClient in setRoomAndRound instead
    this.wsClient = null;
  }

  public setRoomAndRound(roomId: number, roundId: number): void {
    console.log(`Setting room ${roomId} and round ${roundId}`);
    this.roomId = roomId;
    this.roundId = roundId;

    // Configure WebSocket
    const wsConfig: WebSocketConfig = {
      endpoint: this.endpoint,
      roomId: this.roomId,
      auth: {
        walletAddress: this.walletAddress,
        agentId: this.agentNumericId,
      },
      handlers: {
        onMessage: this.handleWebSocketMessage.bind(this),
        onError: (error) => console.error(`Agent ${this.agentNumericId} WebSocket error:`, error),
        onClose: () => console.log(`Agent ${this.agentNumericId} WebSocket connection closed`)
      }
    };

    // Create and connect WebSocket
    this.wsClient = new SharedWebSocket(wsConfig);
    this.wsClient.connect().catch(console.error);
  }

  public async handleGMMessage(message: z.infer<typeof gmMessageInputSchema>): Promise<void> {
    try {
      const validatedMessage = gmMessageInputSchema.parse(message);
      const deafened = this.activeEffects.some(
        e => e.actionType === PvpActions.DEAFEN && Date.now() < e.expiresAt
      );

      if (!deafened) {
        if (this.messageContext.length >= this.MAX_CONTEXT_SIZE) {
          this.messageContext.shift();
        }

        this.messageContext.push({
          timestamp: validatedMessage.content.timestamp,
          agentId: 51, // GM ID
          text: validatedMessage.content.message,
          agentName: 'Game Master',
          role: 'gm'
        });

        if (validatedMessage.content.additionalData?.activePvPEffects) {
          for (const effect of validatedMessage.content.additionalData.activePvPEffects) {
            await this.handlePvPEffect(effect);
          }
        }
      }
    } catch (error) {
      console.error('Invalid GM message:', error);
      throw error;
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

  public async sendAIMessage(content: { text: string }): Promise<void> {
    if (!this.roomId || !this.roundId) {
      throw new Error('Agent not initialized with room and round IDs');
    }

    const silenced = this.activeEffects.some(
      e => e.actionType === PvpActions.SILENCE && Date.now() < e.expiresAt
    );
    if (silenced) {
      console.log(`Agent ${this.agentNumericId} is silenced, cannot send message`);
      return;
    }

    let modifiedText = content.text;
    const poisonEffects = this.activeEffects.filter(
      e => e.actionType === PvpActions.POISON && Date.now() < e.expiresAt
    );

    for (const effect of poisonEffects) {
      if (effect.details) {
        const regex = new RegExp(
          effect.details.find,
          effect.details.case_sensitive ? 'g' : 'gi'
        );
        modifiedText = modifiedText.replace(regex, effect.details.replace);
        console.log(`Applied POISON effect to message:`, {
          original: content.text,
          modified: modifiedText,
          effect
        });
      }
    }

    const timestamp = Date.now();

    // Extract core content for signing only
    const signedContent = {
      timestamp,
      roomId: this.roomId,
      roundId: this.roundId,
      agentId: this.agentNumericId,
      text: modifiedText
    };

    // Generate signature on the core content
    const signature = await this.generateDevSignature(signedContent);

    // Build full message including context separately
    const message = agentMessageInputSchema.parse({
      messageType: WsMessageTypes.AGENT_MESSAGE,
      signature,
      sender: this.walletAddress,
      content: {
        ...signedContent,
        context: {
          messageHistory: this.messageContext
        }
      }
    });

    try {
      const truncatedSignature = signature.substring(0, 5) + "...";
      console.log(`Sending message with context: {..., signature: ${truncatedSignature}, ...}`);

      const response = await axios.post<AIResponse>(
        `${this.endpoint}/messages/agentMessage`,
        message,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      if (this.messageContext.length >= this.MAX_CONTEXT_SIZE) {
        this.messageContext.shift();
      }
      this.messageContext.push({
        timestamp,
        agentId: this.agentNumericId,
        text: modifiedText,
        agentName: `Agent ${this.agentNumericId}`,
        role: 'agent'
      });

    } catch (error) {
      console.error('Error sending AI message:', error);
      this.queueMessage(content.text, timestamp);  // Keep original text for retries
      throw error;
    }
  }

  private async generateDevSignature(content: any): Promise<string> {
    try {
      // Log the content being signed for debugging purposes
      console.log('Signing content:', content);
      // Use deterministic stringification via sorted keys
      const messageString = JSON.stringify(sortObjectKeys(content));
      const signature = await this.wallet.signMessage(messageString);

      // Local verification using the same sorted string
      const recoveredAddress = ethers.verifyMessage(messageString, signature);
      if (recoveredAddress.toLowerCase() !== this.walletAddress.toLowerCase()) {
        throw new Error(`Signature verification failed locally - recovered ${recoveredAddress} but expected ${this.walletAddress}`);
      }
      return signature;
    } catch (error) {
      console.error('Error generating signature:', error);
      throw error;
    }
  }

  private queueMessage(content: string, timestamp: number) {
    this.messageQueue.push({
      content,
      timestamp,
      retries: 0
    });

    if (!this.processingQueue) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (!this.isActive || this.messageQueue.length === 0) {
      this.processingQueue = false;
      return;
    }

    this.processingQueue = true;
    const message = this.messageQueue[0];

    try {
      await this.sendAIMessage({ text: message.content });
      this.messageQueue.shift();
    } catch (error) {
      message.retries++;
      if (message.retries >= this.maxRetries) {
        console.error('Message failed after max retries, dropping:', message);
        this.messageQueue.shift();
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000 * message.retries));
      }
    }

    if (this.messageQueue.length > 0) {
      setTimeout(() => this.processQueue(), 1000);
    } else {
      this.processingQueue = false;
    }
  }

  public getRoomId(): number {
    return this.roomId;
  }

  public getRoundId(): number {
    return this.roundId;
  }

  public override stop(): void {
    if (this.wsClient) {
      this.wsClient.close();
    }
    this.isActive = false;
    this.messageContext = [];
    super.stop();
  }

    public async handlePvPEffect(effect: PvPEffect): Promise<void> {
    // Store effect
    this.activeEffects.push(effect);
    console.log(`PvP effect applied to agent ${this.agentNumericId}:`, effect);

    // Clean expired effects
    this.activeEffects = this.activeEffects.filter(e => Date.now() < e.expiresAt);
  }

  // Modified to only handle GM-validated observations
  public async handleObservation(observation: z.infer<typeof observationMessageInputSchema>): Promise<void> {
    try {
      // Check if agent is blinded before processing
      if (this.activeEffects.some(
        e => e.actionType === 'BLIND' && Date.now() < e.expiresAt  // Use string literal instead of enum
      )) {
        console.log(`Agent ${this.agentNumericId} is blinded, ignoring observation`);
        return;
      }
      
      // Store in message context if in current round
      if (observation.content.roundId === this.roundId) {
        if (this.messageContext.length >= this.MAX_CONTEXT_SIZE) {
          this.messageContext.shift();
        }
        
        this.messageContext.push({
          timestamp: observation.content.timestamp,
          agentId: observation.content.agentId,
          text: `Observation: ${JSON.stringify(observation.content.data)}`,
          agentName: 'Oracle',
          role: 'agent'
        });
      }
    } catch (error) {
      console.error('Error handling observation:', error);
      throw error;
    }
  }

  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.messageType) {
        case WsMessageTypes.SYSTEM_NOTIFICATION:
          console.log(`Agent ${this.agentNumericId} notification:`, message.content.text);
          break;
          
        case WsMessageTypes.HEARTBEAT:
          if (this.wsClient.isConnected()) {
            this.wsClient.send({
              messageType: WsMessageTypes.HEARTBEAT,
              content: {}
            });
          }
          break;

        case WsMessageTypes.GM_MESSAGE:
          this.handleGMMessage(message).catch(err => 
            console.error('Error handling GM message:', err)
          );
          break;

        case WsMessageTypes.OBSERVATION:
          this.handleObservation(message).catch(err => 
            console.error('Error handling observation:', err)
          );
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }
}