import axios from 'axios';
import { DirectClient } from '@elizaos/client-direct';
import { ethers } from 'ethers';
import WebSocket from 'ws';
import { Character } from '../types/index.ts';
import { gmMessageInputSchema } from '../types/schemas.ts';
import { WsMessageTypes } from '../types/ws.ts';
import { sortObjectKeys } from './sortObjectKeys.ts';
import { SharedWebSocket, WebSocketConfig } from './shared-websocket.ts';

export class GameMasterClient extends DirectClient { 
  private readonly wallet: ethers.Wallet;
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
    
    this.wallet = new ethers.Wallet(privateKey);
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

  public async setRoomAndRound(roomId: number, roundId: number): Promise<void> {
    console.log(`Setting room ${roomId} and round ${roundId} for GM`);
    this.roomId = roomId;
    this.roundId = roundId;

    try {
      // STEP 1: Check if GM is already registered
      const { data: existingAgents } = await axios.get(`${this.endpoint}/agents/rooms/${roomId}`);
      const isRegistered = existingAgents.data?.some((a: any) =>
        a.agent_id === this.gmNumericId &&
        a.wallet_address?.toLowerCase() === this.wallet.address.toLowerCase()
      );

      if (!isRegistered) {
        // Register GM with proper snake_case
        await axios.post(`${this.endpoint}/rooms/${roomId}/agents`, {
          agent_id: this.gmNumericId,
          wallet_address: this.wallet.address,
          type: 'GM'
        });
        console.log('GM registered to room');

        // Wait for registration to be confirmed
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify registration
        const { data: verifyRegistration } = await axios.get(`${this.endpoint}/agents/rooms/${roomId}`);
        if (!verifyRegistration.data?.some((a: any) => a.agent_id === this.gmNumericId)) {
          throw new Error('GM registration failed to persist');
        }
      } else {
        console.log('GM already registered to room');
      }

      // STEP 2: Verify/Create Round
      const roundData = {
        room_id: roomId,
        active: true,
        game_master_id: this.gmNumericId,
        round_config: null,
        status: 'STARTING',
        pvp_status_effects: '{}'
      };

      try {
        await axios.post(`${this.endpoint}/rooms/${roomId}/rounds`, roundData);
        console.log('Created new round');
      } catch (createError: any) {
        if (!createError.response?.data?.error?.includes('can only have one active round')) {
          throw createError;
        }
        console.log('Using existing round');
      }

      // STEP 3: Get Active Round ID after a delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      const { data: roundList } = await axios.get(`${this.endpoint}/rooms/${roomId}/rounds?active=true`);
      if (!roundList.success || !roundList.data?.length) {
        throw new Error('No active round found');
      }
      const activeRound = roundList.data.find((r: any) => r.status !== 'END');
      if (!activeRound) {
        throw new Error('No active round found');
      }
      this.roundId = activeRound.id; // Overwrite forced roundId with actual round

      // STEP 4: Set up WebSocket with proper auth
      const wsConfig: WebSocketConfig = {
        endpoint: this.endpoint,
        roomId: this.roomId,
        auth: {
          walletAddress: this.wallet.address,
          agentId: this.gmNumericId,
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

      // Close any existing connection
      if (this.wsClient) {
        this.wsClient.close();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      // Create new WebSocket instance
      this.wsClient = new SharedWebSocket(wsConfig);
      await this.wsClient.connect();

      // STEP 5: Subscribe to room
      const subscribeMessage = {
        messageType: WsMessageTypes.SUBSCRIBE_ROOM,
        content: { roomId: this.roomId }
      };
      this.wsClient.send(subscribeMessage);

      // STEP 6: Verify all expected agents
      const expectedAgentIds = [50, 56, 57, 58]; // Expected agent IDs
      await this.verifyAgentsInRoom(expectedAgentIds);

      console.log('Room and round setup complete:', {
        roomId: this.roomId,
        roundId: this.roundId,
        agentsVerified: true
      });

    } catch (error) {
      console.error('Error in setRoomAndRound:', error);
      throw error;
    }
  }

  // New helper method to verify expected agents are registered in the room
  private async verifyAgentsInRoom(expectedAgentIds: number[]): Promise<void> {
    const maxRetries = 30; // 30 retries (approximately 30 seconds)
    let retries = 0;

    while (retries < maxRetries) {
      const { data: agents } = await axios.get(`${this.endpoint}/agents/rooms/${this.roomId}`);
      const registeredAgentIds = agents.data?.map((a: any) => a.agent_id) || [];
      const missingAgents = expectedAgentIds.filter(id => !registeredAgentIds.includes(id));

      if (missingAgents.length === 0) {
        console.log('All expected agents verified in room');
        return;
      }

      console.log(`Waiting for agents to register: ${missingAgents.join(', ')}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    }

    throw new Error('Timeout waiting for all agents to register');
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

  public async sendGMMessage(text: string, targets: number[] = []): Promise<void> {
    if (!this.roomId || !this.roundId) {
      throw new Error('GameMaster not initialized with room/round');
    }

    try {
        const roundState = await this.getRoundState();
        console.log('Round state before sending message:', roundState);

        // Validate targets against registered participants
        const validTargets = roundState.participants.map((p: any) => p.agent_id);
        if (targets.length && !targets.every(t => validTargets.includes(t))) {
          // Use valid targets from server to fix target mismatch
          targets = validTargets;
          console.log('Targets overridden with valid targets:', targets);
        }

        const content = sortObjectKeys({
            gmId: this.gmNumericId,
            ignoreErrors: false,
            message: text,
            roomId: this.roomId,
            roundId: this.roundId,
            targets,
            timestamp: Date.now()
        });

        const signature = await this.generateSignature(content);

        const message = gmMessageInputSchema.parse({
            messageType: WsMessageTypes.GM_MESSAGE,
            sender: this.wallet.address,
            signature,
            content
        });

        console.log('Sending GM message:', JSON.stringify(message, null, 2));
        const response = await axios.post(
            `${this.endpoint}/messages/gmMessage`,
            message,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('GM message sent:', response.data);
    } catch (error) {
        console.error('Error sending GM message:', error);
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
        case WsMessageTypes.SYSTEM_NOTIFICATION:
          console.log('GM System notification:', message.content.text);
          break;

        case WsMessageTypes.HEARTBEAT:
          if (this.wsClient?.isConnected()) {
            this.wsClient.send({
              messageType: WsMessageTypes.HEARTBEAT,
              content: {}
            });
          }
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