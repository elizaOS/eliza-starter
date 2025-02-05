import axios from 'axios';
import { DirectClient } from '@elizaos/client-direct';
import { AgentMessage, AIResponse, GMMessage, MessageHistoryEntry } from './types.ts';

export class AgentClient extends DirectClient {
  private readonly walletAddress: string;        // Wallet address for auth
  private readonly agentNumericId: number;       // Database ID for agent
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
  
  // Message context management
  private messageContext: MessageHistoryEntry[] = [];
  private readonly MAX_CONTEXT_SIZE = 8;

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

  public async handleGMMessage(message: GMMessage): Promise<void> {
    const history = message.content.additionalData?.messageHistory;
    if (history && Array.isArray(history)) {
      this.messageContext = history.slice(-this.MAX_CONTEXT_SIZE);
      console.log('Updated message context from GM:', this.messageContext);
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
  
    const timestamp = Date.now();
    
    // Build message with context
    const messageContent = {
      timestamp,
      roomId: this.roomId,
      roundId: this.roundId,
      agentId: this.agentNumericId,
      text: content.text,
      context: {
        messageHistory: this.messageContext
      }
    };

    const signature = this.generateDevSignature(messageContent);

    const message: AgentMessage = {
      messageType: 'agent_message',
      signature,
      sender: this.walletAddress,
      content: messageContent
    };

    try {
      console.log("Sending message with context:", message);

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

      // Update own context with sent message
      if (this.messageContext.length >= this.MAX_CONTEXT_SIZE) {
        this.messageContext.shift(); // Remove oldest message
      }
      this.messageContext.push({
        timestamp,
        agentId: this.agentNumericId,
        text: content.text,
        agentName: `Agent ${this.agentNumericId}`,
        role: 'agent'
      });

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
    this.messageContext = [];
    super.stop();
  }
}