// IMPORTANT: Message Signing Protocol
// All messages are deterministically stringified using sortObjectKeys to ensure consistent signing/verification.
// Any updates to sortObjectKeys must be synchronized between client and backend.

import axios from 'axios';
import { EventEmitter } from 'events';
import { DirectClient } from '@elizaos/client-direct';
import { ethers } from 'ethers';
import { 
  AIResponse, 
  RoundAction,
  BroadcastContent,
} from './types.ts';
import { Character } from '../types/index.ts';
import { 
  // Types from schemas
  PvpAllPvpActionsType,
  // Message schemas
  MessageHistoryEntry,
  roomSetupSchema,
  RoomSetup,
  // Common schemas
  walletAddressSchema,
  authenticatedMessageSchema,
  // Core types
  PvPEffect,
  observationMessageInputSchema,
  agentMessageInputSchema,
  gmMessageInputSchema
} from '../types/schemas.ts';
import { WsMessageTypes } from '../types/ws.ts';
import { PvpActions } from '../types/pvp.ts';
import { z } from 'zod';
import { sortObjectKeys } from './sortObjectKeys.ts';  // Import shared sortObjectKeys


// Private key should be loaded from environment variables or secure configuration
export const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
if (!SIGNER_PRIVATE_KEY) {
  throw new Error('SIGNER_PRIVATE_KEY environment variable is required');
}

const wallet = new ethers.Wallet(SIGNER_PRIVATE_KEY);

// Replace legacy message type guard with schema-based version
function isAgentMessage(message: z.infer<typeof agentMessageInputSchema> | z.infer<typeof gmMessageInputSchema>): message is z.infer<typeof agentMessageInputSchema> {
  return message.messageType === WsMessageTypes.AGENT_MESSAGE;
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
  private wallet = wallet;
  

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

  

  private async updateMessageHistory(
    message: z.infer<typeof agentMessageInputSchema> | z.infer<typeof gmMessageInputSchema>
  ): Promise<void> {
    // Ensure proper type narrowing
    if (message.messageType === WsMessageTypes.AGENT_MESSAGE) {
      const entry: MessageHistoryEntry = {
        timestamp: message.content.timestamp,
        agentId: message.content.agentId,
        text: message.content.text,
        agentName: await this.getAgentName(message.content.agentId),
        role: 'agent'
      };
      this.messageHistory.push(entry);
    } else {
      const entry: MessageHistoryEntry = {
        timestamp: message.content.timestamp,
        agentId: this.gmNumericId,
        text: message.content.message,
        agentName: 'Game Master',
        role: 'gm'
      };
      this.messageHistory.push(entry);
    }

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

      // Validate setup payload using schema
      const setupPayload = roomSetupSchema.parse({
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
      });

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

  public async applyPvPEffect(effect: PvpAllPvpActionsType): Promise<void> {
    if (!this.roundId) {
      throw new Error('GameMaster not initialized');
    }

    try {
      // Build message content with proper structure
      const messageContent = {
        gmId: this.gmNumericId,
        timestamp: Date.now(),
        targets: [],
        roomId: this.roomId,
        roundId: this.roundId,
        message: `PvP effect ${effect.actionType} applied to Agent ${effect.parameters.target}`, // Keep as 'message' for GM messages
        additionalData: {
          messageHistory: this.messageHistory,
          currentRound: {
            id: this.roundId,
            agents: 0
          },
          lastMessages: [],
          activePvPEffects: [effect]
        },
        ignoreErrors: false
      };

      // Transform to sendGMMessage format
      await this.sendGMMessage({
        text: `PvP effect ${effect.actionType} applied to Agent ${effect.parameters.target}`, // Use 'text' in external interface
        targets: messageContent.targets,
        deadline: undefined,
        additionalData: messageContent.additionalData,
        ignoreErrors: messageContent.ignoreErrors
      });

      // Update local state after successful send
      const targetEffects = this.activePvPEffects.get(effect.parameters.target) || [];
      targetEffects.push(effect);
      this.activePvPEffects.set(effect.parameters.target, targetEffects);

      console.log('Successfully applied PvP effect:', effect);

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

    // Separate core content for signing (exclude extra context added later)
    const coreContent = {
      gmId: this.gmNumericId,
      timestamp,
      targets: content.targets || [],
      roomId: this.roomId,
      roundId: this.roundId,
      message: content.text,
      deadline: content.deadline,
      additionalData: {
        ...content.additionalData,
        messageHistory: this.messageHistory
      },
      ignoreErrors: content.ignoreErrors ?? false
    };

    // Generate signature on the core content
    const signature = await this.generateDevSignature(coreContent);
    const truncatedSig = signature.substring(0, 5) + '...';

    // Build the final message to send
    const validatedMessage = gmMessageInputSchema.parse({
      messageType: 'gm_message',
      signature,
      sender: this.gmId,
      content: coreContent
    });

    try {
      await this.updateMessageHistory(validatedMessage);
      console.log(`Sending GM ${this.gmId} message with signature: ${truncatedSig}, content:`, coreContent);
      // ... existing axios post code remains the same ...
    } catch (error) {
      console.error('Error sending GM message:', error);
      throw error;
    }
  }

  private async generateDevSignature(content: any): Promise<string> {
    try {
      console.log('GM signing content:', content);
      const messageString = JSON.stringify(sortObjectKeys(content));
      const signature = await this.wallet.signMessage(messageString);
      // Local verification using the same sorted string
      const recoveredAddress = ethers.verifyMessage(messageString, signature);
      if (recoveredAddress.toLowerCase() !== this.gmId.toLowerCase()) {
        throw new Error(`Signature verification failed locally - recovered ${recoveredAddress} but expected ${this.gmId}`);
      }
      return signature;
    } catch (error) {
      console.error('Error generating signature:', error);
      throw error;
    }
  }

  private async processObservationMessage(message: z.infer<typeof observationMessageInputSchema>): Promise<void> {
    // Validate the observation message
    try {
      const validatedMessage = observationMessageInputSchema.parse(message);
      
      // Store in message history if relevant
      if (validatedMessage.content.roundId === this.roundId) {
        this.messageHistory.push({
          timestamp: validatedMessage.content.timestamp,
          agentId: validatedMessage.content.agentId,
          text: `Observation: ${JSON.stringify(validatedMessage.content.data)}`,
          agentName: 'Oracle',
          role: 'agent'
        });
      }

      // Emit event for subscribers
      this.eventEmitter.emit('observation', validatedMessage);
    } catch (error) {
      console.error('Invalid observation message:', error);
      throw error;
    }
  }

  private async processAgentMessage(message: z.infer<typeof agentMessageInputSchema>): Promise<void> {
    // Validate the agent message
    try {
      const validatedMessage = agentMessageInputSchema.parse(message);
      
      // Check if agent is silenced
      if (this.isAgentSilenced(validatedMessage.content.agentId)) {
        throw new Error('Agent is silenced');
      }

      // Process PvP effects if any
      let modifiedText = validatedMessage.content.text;
      const effects = this.getAgentPvPEffects(validatedMessage.content.agentId);
      for (const effect of effects) {
        if (effect.actionType === PvpActions.POISON && effect.details) {
          const regex = new RegExp(effect.details.find, effect.details.case_sensitive ? 'g' : 'gi');
          modifiedText = modifiedText.replace(regex, effect.details.replace);
        }
      }

      // Update message history
      await this.updateMessageHistory({
        ...validatedMessage,
        content: {
          ...validatedMessage.content,
          text: modifiedText
        }
      });

      // Emit event for subscribers
      this.eventEmitter.emit('agentMessage', validatedMessage);
    } catch (error) {
      console.error('Invalid agent message:', error);
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
      text: content.text, // Keep using 'text' in external interface
      targets: agents,
      additionalData: context
    });
  }

  public async handleAgentMessage(message: z.infer<typeof agentMessageInputSchema>): Promise<void> {
    // Convert legacy message to new format ensuring all required fields
    const newMessage = {
      messageType: WsMessageTypes.AGENT_MESSAGE as const,
      signature: message.signature,
      sender: message.sender,
      content: {
        timestamp: Date.now(), // Required field
        roomId: this.roomId ?? 0, // Required field
        roundId: this.roundId ?? 0, // Required field
        agentId: message.content.agentId ?? 0, // Required field
        text: message.content.text || '' // Required field
      } as const // Make TypeScript treat this as exact type
    };

    // Validate entire message against schema before processing
    const validatedMessage = agentMessageInputSchema.parse(newMessage);
    await this.processAgentMessage(validatedMessage);
  }

  public async handleObservation(observation: z.infer<typeof observationMessageInputSchema>): Promise<void> {
    try {
      // Process and validate observation
      await this.processObservationMessage(observation);

      // Get all agents in round
      const agents = await this.getRoundAgents(this.roundId);

      // Create signature for observation from GM
      const signature = await this.generateDevSignature(observation.content);
      const signedObservation = {
        ...observation,
        signature,
        sender: this.gmId // GM as sender
      };

      // Send to each non-blinded agent
      for (const agentId of agents) {
        // Skip blinded agents
        if (this.getAgentPvPEffects(agentId).some(e => 
          e.actionType === PvpActions.BLIND && 
          Date.now() < e.expiresAt
        )) {
          console.log(`Agent ${agentId} is blinded, skipping observation`);
          continue; 
        }

        try {
          // Get agent endpoint from database
          const response = await axios.get(`${this.endpoint}/agents/${agentId}`);
          const agentEndpoint = response.data.endpoint;

          // Send observation to agent
          await axios.post(
            `${agentEndpoint}/message`,
            signedObservation,
            { headers: { 'Content-Type': 'application/json' }}
          );
        } catch (error) {
          console.error(`Failed to send observation to agent ${agentId}:`, error);
        }
      }

      // Emit event for subscribers
      this.eventEmitter.emit('observation', observation);

    } catch (error) {
      console.error('Error handling observation:', error);
      throw error;
    }
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