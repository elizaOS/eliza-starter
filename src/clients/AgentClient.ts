// AgentClient.ts
import axios from 'axios';
import { DirectClient } from '@elizaos/client-direct';
import { AgentMessage, AIResponse } from './types.js';

interface PendingMessage {
  content: string;
  timestamp: number;
  retries: number;
}

export class AgentClient extends DirectClient {
  private readonly walletAddress: string;  // Ethereum wallet address
  private readonly agentNumericId: number; // Database ID for agent
  private roomId: number;
  private roundId: number;
  private readonly endpoint: string;
  private readonly creatorId: number;
  private readonly messageQueue: PendingMessage[] = [];
  private readonly maxRetries = 3;
  private processingQueue = false;
  private isActive = true;

  constructor(
    endpoint: string,
    walletAddress: string,   // Wallet address for auth
    creatorId: number,       // User ID who created the agent
    agentNumericId: number   // Database ID for agent
  ) {
    super();
    this.endpoint = endpoint;
    this.walletAddress = walletAddress;
    this.creatorId = creatorId;
    this.agentNumericId = agentNumericId;
    
    console.log(`AgentClient initialized:`, {
      endpoint,
      walletAddress,
      creatorId,
      agentNumericId
    });
  }

  public setRoomAndRound(roomId: number, roundId: number): void {
    console.log(`Setting room ${roomId} and round ${roundId}`);
    this.roomId = roomId;
    this.roundId = roundId;
  }

  public async sendAIMessage(content: { text: string }): Promise<void> {
    if (!this.roomId || !this.roundId) {
      throw new Error('Agent not initialized with room and round IDs');
    }
  
    const timestamp = Date.now();
    
    // Construct message content
    const messageContent = {
      timestamp,
      roomId: this.roomId,
      roundId: this.roundId,
      agentId: this.agentNumericId,
      text: content.text
    };
  
    const signature = this.generateDevSignature(messageContent);
  
    const message: AgentMessage = {
      messageType: 'agent_message',
      signature,
      sender: this.walletAddress,
      content: messageContent
    };
  
    try {
      console.log("Sending message to", this.endpoint, JSON.stringify(message, null, 2));
      const response = await axios.post<AIResponse>(
        `${this.endpoint}/messages/agentMessage`,
        message,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
  
      console.log("Response from backend:", response.data);
  
      // Check for explicit error only - backend returns message/data on success
      if (response.data.error) {
        throw new Error(response.data.error);
      }
  
      // If we got here, message was processed successfully
      return;
    } catch (error) {
      console.error('Error sending AI message:', error);
      this.queueMessage(content.text, timestamp);
      throw error;
    }
  }
  // Development signature for testing
  private generateDevSignature(content: any): string {
    const messageStr = JSON.stringify(content);
    return Buffer.from(`${this.walletAddress}:${messageStr}:${content.timestamp}`).toString('base64');
  }

  // Message retry queue
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

  // Process queued messages with retry
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
    this.isActive = false;
    super.stop();
  }
}