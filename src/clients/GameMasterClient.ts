import axios from 'axios';
import { DirectClient } from '@elizaos/client-direct';
import { Wallet } from 'ethers';
import WebSocket from 'ws';
import { Character } from '../types/index.ts';
import { gmMessageInputSchema } from '../types/schemas.ts';
import { WsMessageTypes } from '../types/ws.ts';
import { sortObjectKeys } from './sortObjectKeys.ts';
import { SharedWebSocket, WebSocketConfig } from './shared-websocket.ts';

export class GameMasterClient extends DirectClient { 
  private readonly wallet: Wallet;
  private readonly gmId: string;                 
  private readonly gmNumericId: number; 
  private roomId: number;
  private roundId: number;
  public readonly endpoint: string;
  private readonly creatorId: number;
  public wsClient: SharedWebSocket;
  private isActive = true;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 5000; // 5 seconds
  private readonly MAX_RETRIES = 60; // 5 minutes maximum polling time
  private retryCount = 0;
  private debateStarted = false;

  constructor(endpoint: string, gmId: string, creatorId: number, character: Character) {
    super();
    this.endpoint = endpoint;
    this.gmId = character.settings?.pvpvai?.eth_wallet_address || gmId;
    this.creatorId = creatorId;
    this.gmNumericId = character.settings?.pvpvai?.gameMasterId || 51;
    
    const privateKey = process.env.GM_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('GM_PRIVATE_KEY environment variable is required');
    }
    
    this.wallet = new Wallet(privateKey);
    if (this.wallet.address.toLowerCase() !== this.gmId.toLowerCase()) {
      throw new Error(`GameMaster wallet address mismatch: ${this.wallet.address} != ${this.gmId}`);
    }
    
    console.log('GameMasterClient initialized:', {
      endpoint,
      gmId: this.gmId,
      walletAddress: this.wallet.address,
      creatorId,
    });
  }

  private async generateSignature(content: any): Promise<string> {
    // Create message object with exact field order using sortObjectKeys
    const messageObj = sortObjectKeys({
        gmId: this.gmNumericId,
        ignoreErrors: false,
        message: content.message,
        roomId: content.roomId,
        roundId: content.roundId,
        targets: content.targets,
        timestamp: content.timestamp
    });

    const messageString = JSON.stringify(messageObj);
    console.log('GM signing message:', messageString);
    return await this.wallet.signMessage(messageString);
  }

  public async setRoomAndRound(roomId: number): Promise<void> {
    console.log(`Connecting to room ${roomId}`);
    this.roomId = roomId;
    
    // Get active round ID directly from contract
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

    // Initialize WS with proper auth
    const timestamp = Date.now();
    const authContent = sortObjectKeys({
      walletAddress: this.wallet.address,
      agentId: this.gmNumericId,
      roomId: this.roomId,
      timestamp
    });
    
    const signature = await this.wallet.signMessage(JSON.stringify(authContent));

    const wsConfig: WebSocketConfig = {
      endpoint: this.endpoint,
      roomId: this.roomId,
      auth: {
        walletAddress: this.wallet.address,
        agentId: this.gmNumericId,
        timestamp,
        signature
      },
      handlers: {
        onMessage: this.handleWebSocketMessage.bind(this),
        onError: console.error,
        onClose: () => {
          if (this.isActive) {
            console.log('GM disconnected, reconnecting...');
            setTimeout(() => this.wsClient?.connect(), 5000);
          }
        }
      }
    };

    // Create WebSocket connection
    this.wsClient = new SharedWebSocket(wsConfig);
    await this.wsClient.connect();

    // Subscribe to room
    const subscribeContent = sortObjectKeys({
      roomId: this.roomId,
      timestamp: Date.now()
    });

    const subscribeMessage = {
      messageType: WsMessageTypes.SUBSCRIBE_ROOM,
      content: subscribeContent,
      signature: await this.wallet.signMessage(JSON.stringify(subscribeContent)),
      sender: this.wallet.address
    };

    this.wsClient.send(subscribeMessage);
  }

  private async getActiveRoundFromContract(): Promise<number> {
    // TODO: Replace with actual contract call once you have the ABI
    // For now return static value that matches backend
    return 570;
  }

  public async sendGMMessage(text: string, targets: number[] = []): Promise<void> {
    if (!this.roomId || !this.roundId) {
      throw new Error('GameMaster not initialized with room/round');
    }

    const content = sortObjectKeys({
      gmId: this.gmNumericId,
      timestamp: Date.now(),
      roomId: this.roomId,
      roundId: this.roundId,
      message: text,
      targets,
      ignoreErrors: false
    });

    const messageString = JSON.stringify(content);
    const signature = await this.wallet.signMessage(messageString);

    const message = gmMessageInputSchema.parse({
      messageType: WsMessageTypes.GM_MESSAGE,
      signature,
      sender: this.wallet.address,
      content
    });

    await this.wsClient.send(message);
  }

  private async getRoundState(): Promise<any> {
    try {
      // First check if round exists
      const roundCheck = await axios.get(
        `${this.endpoint}/rooms/${this.roomId}/rounds/${this.roundId}`
      );
      
      if (!roundCheck.data.success) {
        throw new Error('Round not found');
      }

      // Then get participants
      const participantsResp = await axios.get(
        `${this.endpoint}/agents/rooms/${this.roomId}`
      );
      
      if (!participantsResp.data.success) {
        throw new Error('Failed to get room participants');
      }

      // Combine data into state object
      return {
        round: roundCheck.data.data,
        participants: participantsResp.data.data?.filter((p: any) => 
          // Include both agents and GM in participants list
          p.wallet_address?.toLowerCase() !== this.wallet.address.toLowerCase()
        ) || []
      };

    } catch (error) {
      console.error('Error getting round state:', error);
      throw error;
    }
  }

  private async startPollingForAgents(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      if (this.retryCount >= this.MAX_RETRIES) {
        console.log('Max retries reached, stopping agent polling');
        this.stopPolling();
        return;
      }

      try {
        const roundState = await this.getRoundState();
        // Remove type check, just look for non-GM participants
        const agents = roundState?.participants?.filter((p: any) => p.id !== this.gmNumericId) || [];
        
        if (agents.length > 0) {
          console.log(`Found ${agents.length} agents in room, starting debate...`);
          this.stopPolling();
          await this.startDebate();
        } else {
          console.log('No agents found, retrying...');
          this.retryCount++;
        }
      } catch (error) {
        console.error('Error polling for agents:', error);
        this.retryCount++;
      }
    }, this.POLL_INTERVAL);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // Added validation method to return only registered agent IDs
  private async validateAgents(agentIds: number[]): Promise<number[]> {
    const roundState = await this.getRoundState();
    const registeredAgents = roundState.participants.map((p: any) => p.agent_id);
    return agentIds.filter(id => registeredAgents.includes(id));
  }

  // Added method for explicit target validation
  private async validateTargetAgents(targets: number[]): Promise<number[]> {
    const { data: agents } = await axios.get(`${this.endpoint}/agents/rooms/${this.roomId}`);
    const registeredAgents = agents.data?.map((a: any) => a.agent_id) || [];
    return targets.filter(target => registeredAgents.includes(target));
  }

  public async startDebate(): Promise<void> {
    if (this.debateStarted) {
      console.log('Debate already started');
      return;
    }

    try {
      const roundState = await this.getRoundState();
      if (!roundState?.participants?.length) {
        console.warn('No participants found in round state');
        return;
      }

      // Send initial messages
      await this.sendGMMessage('Room initialized. Beginning debate round.', []);
      await this.sendGMMessage('Beginning discussion phase. Agents may now engage in debate.', []);

      // Get agent IDs from participants
      const agentIds = roundState.participants.map((p: any) => p.agent_id);

      // Validate agents using the new method
      const validAgentIds = await this.validateAgents(agentIds);
      if (validAgentIds.length === 0) {
        throw new Error('No valid agents found in room');
      }
      
      const topic = "Let's discuss the future of cryptocurrency. What are your thoughts on Bitcoin versus Ethereum?";
      await this.sendGMMessage(topic, validAgentIds);
      
      this.debateStarted = true;
    } catch (error) {
      console.error('Error starting debate:', error);
      throw error;
    }
  }

  public async broadcastToRoom(content: { text: string }): Promise<void> {
    await this.sendGMMessage(content.text, []);
  }

  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.messageType) {
        case WsMessageTypes.HEARTBEAT:
          // Respond to heartbeat with signed message
          const heartbeatContent = sortObjectKeys({
            timestamp: Date.now()
          });
          
          this.wallet.signMessage(JSON.stringify(heartbeatContent))
            .then(signature => {
              this.wsClient?.send({
                messageType: WsMessageTypes.HEARTBEAT,
                content: heartbeatContent,
                signature,
                sender: this.wallet.address
              });
            })
            .catch(console.error);
          break;

        case WsMessageTypes.SYSTEM_NOTIFICATION:
          console.log('GM System notification:', message.content.text);
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
    this.stopPolling();
    this.isActive = false;
    if (this.wsClient) {
      this.wsClient.close();
    }
    super.stop();
  }
}