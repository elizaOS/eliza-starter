import axios from 'axios';
import { EventEmitter } from 'events';
import { DirectClient } from '@elizaos/client-direct';
import { 
  AIResponse, 
  GMMessage, 
  RoundAction,
  RoomSetup,
  BroadcastContent,
} from './types.ts';
import { Character } from '../types/index.ts';

export class GameMasterClient extends DirectClient {
  private readonly gmId: string;                  // Wallet address
  private readonly gmNumericId: number = 51;      // Database ID
  private roomId: number;
  private roundId: number;
  private readonly endpoint: string;
  private readonly creatorId: number; 
  private readonly eventEmitter: EventEmitter;
  private isActive = true;
  private character: Character;

  constructor(endpoint: string, gmId: string, creatorId: number, character: Character) {
    super();
    this.endpoint = endpoint;
    // Use the eth_wallet_address from character settings if available
    this.gmId = character.settings?.pvpvai?.eth_wallet_address || gmId;
    this.creatorId = creatorId;
    this.eventEmitter = new EventEmitter();
    this.character = character;

    console.log('GameMasterClient initialized:', {
      endpoint,
      gmId: this.gmId,
      creatorId,
      characterName: character.name
    });
  }

  public async initialize(): Promise<void> {
    try {
      console.log('Starting GameMaster initialization...');

      // Room setup payload
      const setupPayload: RoomSetup = {
        name: "Crypto Debate Room",
        room_type: "buy_hold_sell",
        token: "0x0000000000000000000000000000000000000000",
        token_webhook: `${this.endpoint}/webhook`,
        agents: {},  // Will be populated by agents joining
        gm: this.gmId,
        chain_id: "1",
        chain_family: "EVM",
        room_config: {
          round_duration: 300,
          pvp_config: {
            enabled: true,
            enabled_rules: ["Silence", "Deafen", "Attack", "Poison"]
          }
        },
        transaction_hash: "0x0000000000000000000000000000000000000000000000000000000000000000"
      };

      console.log('Creating room with setup:', setupPayload);

      // Create room
      const roomResponse = await axios.post(
        `${this.endpoint}/rooms/setup`, 
        setupPayload,
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      console.log("Room setup response:", roomResponse.data);
      
      if (!roomResponse.data?.roomId) {
        throw new Error('Invalid room setup response: missing roomId');
      }

      this.roomId = roomResponse.data.roomId;
      
      // Update character settings
      if (this.character?.settings?.pvpvai) {
        this.character.settings.pvpvai.roomId = this.roomId;
      }

      console.log('Creating new round...');
      
      // Create first round
      const roundResponse = await axios.post(
        `${this.endpoint}/rooms/${this.roomId}/rounds`, 
        {
          game_master_id: this.gmNumericId,
          round_config: {}
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!roundResponse.data?.id) {
        throw new Error('Failed to create round - no round ID returned');
      }

      this.roundId = roundResponse.data.id;

      // Update character settings
      if (this.character?.settings?.pvpvai) {
        this.character.settings.pvpvai.roundId = this.roundId;
      }

      console.log('GameMaster initialization complete:', {
        roomId: this.roomId,
        roundId: this.roundId
      });

    } catch (error) {
      console.error('GameMaster initialization failed:', error);
      throw error;
    }
  }

  public async sendGMMessage(content: { 
    text: string; 
    targets?: number[];
    deadline?: number;
    additionalData?: Record<string, any>;
    ignoreErrors?: boolean;
  }): Promise<void> {
    if (!this.roomId || !this.roundId) {
      throw new Error('GameMaster not initialized - call initialize() first');
    }

    const timestamp = Date.now();
    const messageContent = {
      gmId: this.gmId,
      timestamp,
      targets: content.targets || [],
      roomId: this.roomId,
      roundId: this.roundId,
      message: content.text,
      deadline: content.deadline,
      additionalData: content.additionalData,
      ignoreErrors: content.ignoreErrors ?? false
    };

    // Generate dev signature
    const signature = this.generateDevSignature(messageContent);

    const message: GMMessage = {
      messageType: 'gm_message',
      signature, 
      sender: this.gmId,
      content: messageContent
    };

    try {
      console.log('Sending GM message:', message);

      const response = await axios.post(
        `${this.endpoint}/messages/gmMessage`,
        message,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('GM message response:', response.data);

      if (response.data.error) {
        throw new Error(response.data.error);
      }
    } catch (error) {
      console.error('Error sending GM message:', error);
      throw error;
    }
  }

  public async broadcastToRoom(content: BroadcastContent): Promise<void> {
    if (!this.roomId || !this.roundId) {
      throw new Error('GameMaster not initialized - call initialize() first');
    }

    console.log('Broadcasting to room:', content);

    // Get all agents in the round
    const agents = await this.getRoundAgents(content.roundId || this.roundId);
    
    // Broadcast to all agents
    await this.sendGMMessage({
      text: content.text,
      targets: agents,
    });
  }

  public async getRoundAgents(roundId: number): Promise<number[]> {
    try {
      const response = await axios.get(
        `${this.endpoint}/rounds/${roundId}/agents`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data.agents || [];
    } catch (error) {
      console.error('Error getting round agents:', error);
      return [];
    }
  }

  public async endRound(outcome?: any): Promise<void> {
    if (!this.roundId) {
      throw new Error('GameMaster not initialized - call initialize() first');
    }

    const action: RoundAction = { 
      roundId: this.roundId, 
      outcome 
    };

    try {
      const response = await axios.post<AIResponse>(
        `${this.endpoint}/rounds/${this.roundId}/end`,
        action,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to end round');
      }
    } catch (error) {
      console.error('Error ending round:', error);
      throw error;
    }
  }

  public async kickParticipant(agentId: string): Promise<void> {
    if (!this.roundId) {
      throw new Error('GameMaster not initialized - call initialize() first');
    }

    try {
      const response = await axios.post<AIResponse>(
        `${this.endpoint}/rounds/${this.roundId}/kick`,
        { agentId },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to kick participant');
      }
    } catch (error) {
      console.error('Error kicking participant:', error);
      throw error;
    }
  }

  // Development signature for testing
  private generateDevSignature(content: any): string {
    const messageStr = JSON.stringify(content);
    return Buffer.from(`${this.gmId}:${messageStr}:${content.timestamp}`).toString('base64');
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