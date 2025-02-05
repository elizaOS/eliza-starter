import axios from 'axios';
import { EventEmitter } from 'events';
import { DirectClient } from '@elizaos/client-direct';
import { 
  AIResponse, 
  GMMessage, 
  RoundAction,
  RoomSetup,
  BroadcastContent,
  AgentMessage,
  MessageHistoryEntry,
} from './types.ts';
import { Character } from '../types/index.ts';

export enum PvpActions {
  // Direct/single use actions
  ATTACK = 'ATTACK', // Player sends direct DM to agent
  AMNESIA = 'AMNESIA', //Agent deletes short term memory
  MURDER = 'MURDER', // Kick an agent from the room

  // Status effects
  SILENCE = 'SILENCE', // Agent can't send messages
  DEAFEN = 'DEAFEN', // Agent stops receiving Agent messages
  POISON = 'POISON', // Find and replace a word in the Agent message
  BLIND = 'BLIND', // Agent stops receiving observations
  DECEIVE = 'DECEIVE', // Agent temporarily takes on another persona
  MIND_CONTROL = 'MIND_CONTROL', // For the status duration, all messages sent from an agent will be buffered for a player to modify, send, or reject freely.
  FRENZY = 'FRENZY', // Dump N messages from public chat into AI Chat
  OVERLOAD = 'OVERLOAD', // Messages will only be received by agent in stacks of 5
  CHARM = 'CHARM', // All messages from another agent will be given the highest trust score
  INVISIBLE = 'INVISIBLE', // TODO needs a better name, spoof sentiment for an agent 

  // Buffs
  CLAIRVOYANCE = 'CLAIRVOYANCE', // Agent will become aware of when a message has been modified by PvP Actions as well as when a PvP Action has been taken against them
}

export interface PvPEffect {
  effectId: string;
  actionType: PvpActions;
  sourceId: string;
  targetId: number;
  duration: number;
  createdAt: number;
  expiresAt: number;
  details?: {
    find: string;
    replace: string;
    case_sensitive?: boolean;
  };
}

// Add type guard before the class definition
function isAgentMessage(message: AgentMessage | GMMessage): message is AgentMessage {
  return message.messageType === 'agent_message';
}

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

  // Message history tracking
  private messageHistory: MessageHistoryEntry[] = [];
  private readonly MAX_HISTORY = 8;
  private agentNameMap: Map<number, string> = new Map();

  // Add PvP effect tracking
  private activePvPEffects: Map<number, PvPEffect[]> = new Map();
  private readonly PVP_SYNC_INTERVAL = 5000; // 5 seconds

  constructor(endpoint: string, gmId: string, creatorId: number, character: Character) {
    super();
    this.endpoint = endpoint;
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

    this.startPvPSync();
  }

  private async updateMessageHistory(message: AgentMessage | GMMessage): Promise<void> {
    const entry: MessageHistoryEntry = isAgentMessage(message) 
      ? {
          timestamp: message.content.timestamp,
          agentId: message.content.agentId,
          text: message.content.text,
          agentName: await this.getAgentName(message.content.agentId),
          role: 'agent'
        }
      : {
          timestamp: message.content.timestamp,
          agentId: this.gmNumericId,
          text: message.content.message,
          agentName: 'Game Master',
          role: 'gm'
        };

    this.messageHistory.push(entry);

    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory = this.messageHistory.slice(-this.MAX_HISTORY);
    }
  }

  private async getAgentName(agentId: number): Promise<string> {
    if (this.agentNameMap.has(agentId)) {
      return this.agentNameMap.get(agentId)!;
    }

    try {
      const response = await axios.get(`${this.endpoint}/agents/${agentId}`);
      const name = response.data.name || `Agent ${agentId}`;
      this.agentNameMap.set(agentId, name);
      return name;
    } catch (error) {
      console.error(`Error fetching agent name for ${agentId}:`, error);
      return `Agent ${agentId}`;
    }
  }

  public async initialize(): Promise<void> {
    try {
      console.log('Starting GameMaster initialization...');

      const setupPayload: RoomSetup = {
        name: "Crypto Debate Room",
        room_type: "buy_hold_sell",
        token: "0x0000000000000000000000000000000000000000",
        token_webhook: `${this.endpoint}/webhook`,
        agents: {},
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

      const roomResponse = await axios.post(
        `${this.endpoint}/rooms/setup`, 
        setupPayload,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!roomResponse.data?.roomId) {
        throw new Error('Invalid room setup response: missing roomId');
      }

      this.roomId = roomResponse.data.roomId;
      
      if (this.character?.settings?.pvpvai) {
        this.character.settings.pvpvai.roomId = this.roomId;
      }

      console.log('Creating new round...');
      
      const roundResponse = await axios.post(
        `${this.endpoint}/rooms/${this.roomId}/rounds`,
        {
          game_master_id: this.gmNumericId,
          round_config: {
            messageHistory: true // Enable message history tracking
          }
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!roundResponse.data?.id) {
        throw new Error('Failed to create round - no round ID returned');
      }

      this.roundId = roundResponse.data.id;

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

  private async startPvPSync() {
    setInterval(async () => {
      if (this.roundId) {
        await this.syncRoundState();
      }
    }, this.PVP_SYNC_INTERVAL);
  }

  private async syncRoundState(): Promise<void> {
    try {
      const response = await axios.get(
        `${this.endpoint}/rounds/${this.roundId}/state`,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (response.data.success) {
        const effectsMap = new Map<number, PvPEffect[]>();
        response.data.data.activePvPEffects.forEach(effect => {
          const targetEffects = effectsMap.get(effect.targetId) || [];
          targetEffects.push(effect);
          effectsMap.set(effect.targetId, targetEffects);
        });
        this.activePvPEffects = effectsMap;

        if (response.data.data.messageHistory?.length > 0) {
          this.messageHistory = response.data.data.messageHistory
            .slice(-this.MAX_HISTORY)
            .map(msg => ({
              timestamp: msg.timestamp,
              agentId: msg.agentId,
              text: msg.text,
              agentName: msg.agentName || `Agent ${msg.agentId}`,
              role: msg.role || 'agent'
            }));
        }
      }
    } catch (error) {
      console.error('Error syncing round state:', error);
    }
  }

  public async applyPvPEffect(effect: PvPEffect): Promise<void> {
    if (!this.roundId) {
      throw new Error('GameMaster not initialized');
    }

    try {
      // First apply the effect to backend
      const response = await axios.post(
        `${this.endpoint}/rounds/${this.roundId}/pvp`,
        {
          actionType: effect.actionType,
          effectId: effect.effectId,
          sourceId: effect.sourceId,
          targetId: effect.targetId,
          duration: effect.duration,
          createdAt: effect.createdAt,
          expiresAt: effect.expiresAt,
          details: effect.details
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (response.data.success) {
        // Update local state after successful backend update
        const targetEffects = this.activePvPEffects.get(effect.targetId) || [];
        targetEffects.push(effect);
        this.activePvPEffects.set(effect.targetId, targetEffects);

        // Broadcast notification only after successful effect application
        await this.broadcastToRoom({
          text: `PvP effect ${effect.actionType} applied to Agent ${effect.targetId}`,
          roundId: this.roundId
        });

        console.log('Successfully applied PvP effect:', effect);
      } else {
        throw new Error(response.data.error || 'Failed to apply PvP effect');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error applying PvP effect:', errorMessage);
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
      additionalData: {
        ...content.additionalData,
        messageHistory: this.messageHistory // Include message history
      },
      ignoreErrors: content.ignoreErrors ?? false
    };

    const signature = this.generateDevSignature(messageContent);

    const message: GMMessage = {
      messageType: 'gm_message',
      signature,
      sender: this.gmId,
      content: messageContent
    };

    try {
      await this.updateMessageHistory(message);

      console.log('Sending GM message:', message);

      const response = await axios.post(
        `${this.endpoint}/messages/gmMessage`,
        message,
        { headers: { 'Content-Type': 'application/json' } }
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
    
    // Always ensure we have the latest message history from database
    try {
      const response = await axios.get(
        `${this.endpoint}/rounds/${this.roundId}/messages`,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (response.data.messages) {
        // Update local message history with database state
        this.messageHistory = response.data.messages
          .slice(-this.MAX_HISTORY)
          .map(msg => ({
            timestamp: msg.timestamp,
            agentId: msg.agentId,
            text: msg.text,
            agentName: msg.agentName || `Agent ${msg.agentId}`,
            role: msg.role || 'agent'
          }));
      }
    } catch (error) {
      console.warn('Failed to fetch message history from database:', error);
      // Continue with existing history if fetch fails
    }

    // Build context with guaranteed message history
    const context = {
      messageHistory: this.messageHistory,
      currentRound: {
        id: this.roundId,
        agents: agents.length
      },
      // Force include last 3 messages minimum
      lastMessages: this.messageHistory.slice(-3).map(msg => ({
        agentName: msg.agentName,
        text: msg.text
      })),
      activePvPEffects: Array.from(this.activePvPEffects.values()).flat()
    };

    // Broadcast to all agents with context
    await this.sendGMMessage({
      text: content.text,
      targets: agents,
      additionalData: context
    });
  }

  public async handleAgentMessage(message: AgentMessage): Promise<void> {
    await this.updateMessageHistory(message);
    
    // Optionally trigger events or handle specific message patterns
    this.eventEmitter.emit('agentMessage', message);
  }

  public getMessageContext(): MessageHistoryEntry[] {
    return [...this.messageHistory];
  }

  public async getRoundAgents(roundId: number): Promise<number[]> {
    try {
      const response = await axios.get(
        `${this.endpoint}/rounds/${roundId}/agents`,
        { headers: { 'Content-Type': 'application/json' } }
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
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to end round');
      }

      // Clear message history on round end
      this.messageHistory = [];
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
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to kick participant');
      }

      // Remove kicked agent's messages from history
      this.messageHistory = this.messageHistory.filter(
        msg => msg.agentId !== parseInt(agentId)
      );
    } catch (error) {
      console.error('Error kicking participant:', error);
      throw error;
    }
  }

  private generateDevSignature(content: any): string {
    const messageStr = JSON.stringify(content);
    return Buffer.from(`${this.gmId}:${messageStr}:${content.timestamp}`).toString('base64');
  }

  private getAgentPvPEffects(agentId: number): PvPEffect[] {
    return this.activePvPEffects.get(agentId) || [];
  }

  public isAgentSilenced(agentId: number): boolean {
    return this.getAgentPvPEffects(agentId).some(
      effect => effect.actionType === 'SILENCE' && Date.now() < effect.expiresAt
    );
  }

  public isAgentDeafened(agentId: number): boolean {
    return this.getAgentPvPEffects(agentId).some(
      effect => effect.actionType === 'DEAFEN' && Date.now() < effect.expiresAt
    );
  }

  public getRoomId(): number {
    return this.roomId;
  }

  public getRoundId(): number {
    return this.roundId;
  }

  public override stop(): void {
    this.isActive = false;
    this.messageHistory = [];
    this.agentNameMap.clear();
    this.activePvPEffects.clear();
    super.stop();
  }
}