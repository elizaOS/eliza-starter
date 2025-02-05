import { z } from 'zod';
import { AgentRuntime, generateText, stringToUuid, type UUID } from '@elizaos/core';
import type { ExtendedAgentRuntime } from './types/index.ts';
import { 
  agentMessageInputSchema,
  gmMessageInputSchema,
  observationMessageInputSchema,
  PvPEffect,
  PvpAllPvpActionsType
} from './types/schemas.ts';
import { PvpActions, PvpActionCategories } from './types/pvp.ts';
import { WsMessageTypes } from './types/ws.ts';
import axios from 'axios';



interface DebateState {
  phase: 'init' | 'discussion' | 'voting' | 'end';
  currentTurn: number;
  messageHistory: Array<{
    agentId: number;
    agentName: string;
    text: string;
    timestamp: number;
  }>;
  activePvPEffects: PvPEffect[];
}

class DebateOrchestrator {
  private agents: ExtendedAgentRuntime[] = [];
  private gameMaster?: ExtendedAgentRuntime;
  private isDebating = false;
  private currentTopicId: UUID;
  private roomId?: number;
  private roundId?: number;

  // Debate state management
  private state: DebateState = {
    phase: 'init',
    currentTurn: 0,
    messageHistory: [],
    activePvPEffects: []
  };

  // Configuration
  private readonly TURN_DELAY = 5000;  // 5 seconds between turns
  private readonly ROUND_DELAY = 10000; // 10 seconds between rounds
  private readonly PVP_CHANCE = 0.2;   // 20% chance of PvP action per turn
  private readonly MAX_HISTORY = 8;     // Max messages in history

  constructor(runtimes: ExtendedAgentRuntime[]) {
    this.currentTopicId = stringToUuid('debate-topic') as UUID;
    
    // Sort runtimes to ensure GM is processed first
    runtimes.forEach(runtime => {
      const character = runtime.character as any;
      if (character.agentRole?.type === 'GM') {
        this.gameMaster = runtime;
      } else {
        this.agents.push(runtime);
      }
    });

    console.log('DebateOrchestrator initialized with:', {
      gameMaster: this.gameMaster?.character?.name,
      agents: this.agents.map(a => a.character?.name)
    });
  }

  // Simulate a random PvP action
  private simulatePvPEffect(): {
    type: PvpActions;
    details?: { find: string; replace: string };
  } | null {
    if (Math.random() > this.PVP_CHANCE) return null;

    const types = [PvpActions.SILENCE, PvpActions.DEAFEN, PvpActions.POISON];
    const type = types[Math.floor(Math.random() * types.length)];
    
    if (type === PvpActions.POISON) {
      return {
        type,
        details: {
          find: 'blockchain',
          replace: 'sparklechain'
        }
      };
    }

    return { type };
  }

  // Check if an agent is affected by a PvP effect
  private isAffectedByPvP(agentId: number, actionType: PvpActions): boolean {
    return this.state.activePvPEffects.some(effect => 
      effect.targetId === agentId && 
      effect.actionType === actionType && 
      Date.now() < effect.expiresAt
    );
  }

  // Clean up expired PvP effects
  private cleanupPvPEffects() {
    const now = Date.now();
    this.state.activePvPEffects = this.state.activePvPEffects.filter(effect => 
      now < effect.expiresAt
    );
  }

  public async startDebate() {
    try {
      this.isDebating = true;
      this.state.phase = 'init';

      if (!this.gameMaster) {
        throw new Error('GameMaster not found!');
      }

      // Initialize GM and setup
      const gmClient = this.gameMaster.clients?.pvpvai;
      if (!gmClient) throw new Error('GM client not initialized');

      await gmClient.initialize();

      // Get and verify room/round IDs
      const settings = (this.gameMaster.character as any).settings?.pvpvai;
      this.roomId = settings?.roomId;
      this.roundId = settings?.roundId;

      if (!this.roomId || !this.roundId) {
        throw new Error('Room/Round initialization failed - missing IDs');
      }

      // Initialize agents
      await this.initializeAgents();

      // Start discussion phase
      this.state.phase = 'discussion';
      await this.debateLoop();
    } catch (error) {
      console.error('Error in startDebate:', error);
      throw error;
    }
  }

  private async initializeAgents() {
    console.log('Initializing agent clients...');
    
    try {
      // First ensure GM is initialized to create room/round
      if (!this.gameMaster?.clients?.pvpvai) {
        throw new Error('GM client not initialized');
      }
      const gmClient = this.gameMaster.clients.pvpvai;
      await gmClient.initialize();

      // Get room/round IDs from GM
      const settings = (this.gameMaster.character as any).settings?.pvpvai;
      this.roomId = settings?.roomId;
      this.roundId = settings?.roundId;

      if (!this.roomId || !this.roundId) {
        throw new Error('Room/Round initialization failed - missing IDs');
      }

      // Bulk register agents with the room // NOT SURE WHERE THIS SHOULD BE, could be in the gamemaster client as well
      const agentsToRegister = this.agents.map(agent => {
        const settings = (agent.character as any).settings?.pvpvai;
        if (!settings?.agentId || !settings?.eth_wallet_address) {
          throw new Error(`Missing agent ID or wallet for ${agent.character?.name}`);
        }
        return {
          id: settings.agentId,
          walletAddress: settings.eth_wallet_address
        };
      });

      // Register agents with room via backend
      const response = await axios.post(
        `${gmClient.getClient().endpoint}/rooms/${this.roomId}/agents/bulk`,
        { agents: agentsToRegister },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.data || response.status !== 200) {
        throw new Error('Failed to register agents with room');
      }

      // Initialize each agent's client with room/round IDs
      for (const agent of this.agents) {
        const client = agent.clients?.pvpvai;
        if (!client) {
          throw new Error(`Agent ${agent.character?.name} missing pvpvai client`);
        }

        const pvpvaiClient = client.getClient();
        if (!pvpvaiClient || !('setRoomAndRound' in pvpvaiClient)) {
          throw new Error(`Agent ${agent.character?.name} has invalid pvpvai client`);
        }

        // Set room and round
        pvpvaiClient.setRoomAndRound(this.roomId!, this.roundId!);
        
        // Update agent settings
        const agentSettings = (agent.character as any).settings?.pvpvai;
        if (agentSettings) {
          agentSettings.roomId = this.roomId;
          agentSettings.roundId = this.roundId;
        }

        console.log(`Initialized agent ${agent.character?.name} with:`, {
          roomId: this.roomId,
          roundId: this.roundId,
          hasClient: !!pvpvaiClient
        });
      }

    } catch (error) {
      console.error('Failed to initialize agents:', error);
      throw error;
    }
  }

  private async debateLoop() {
    console.log(`Starting debate loop with ${this.agents.length} agents`);
    
    while (this.isDebating && this.state.phase === 'discussion') {
      // Cleanup expired PvP effects
      this.cleanupPvPEffects();

      // Process each agent's turn
      for (const agent of this.agents) {
        if (!this.isDebating) break;

        try {
          // Check for PvP effects
          const agentId = (agent.character as any).settings?.pvpvai?.agentId;
          if (this.isAffectedByPvP(agentId, PvpActions.SILENCE)) { // Use enum instead of string
            console.log(`Agent ${agent.character?.name} is silenced, skipping turn`);
            continue;
          }

          // Generate and send message
          await this.processAgentTurn(agent);

          // Simulate random PvP action after turn
          const pvpEffect = this.simulatePvPEffect();
          if (pvpEffect) {
            console.log('Simulated PvP effect:', pvpEffect);
            this.state.activePvPEffects.push(pvpEffect);
          }

          // Wait between turns
          await new Promise(resolve => setTimeout(resolve, this.TURN_DELAY));

        } catch (error) {
          console.error(`Error processing turn for ${agent.character?.name}:`, error);
        }
      }

      // Wait between rounds
      await new Promise(resolve => setTimeout(resolve, this.ROUND_DELAY));
    }
  }

  private async processAgentTurn(agent: ExtendedAgentRuntime) {
    const character = agent.character as any;
    const agentId = character.settings?.pvpvai?.agentId;
    const pvpvaiClient = agent.clients?.pvpvai?.getClient();
    const gmClient = this.gameMaster?.clients?.pvpvai?.getClient();

    if (!pvpvaiClient || !gmClient) {
      throw new Error('Missing required clients');
    }

    // Generate response using chat history
    const response = await generateText({
      runtime: agent as AgentRuntime,
      context: this.buildPrompt(agent),
      modelClass: 'large',
    });

    // Validate and send message through PvPvAI client
    try {
      const messageContent = {
        timestamp: Date.now(),
        roomId: pvpvaiClient.getRoomId(),
        roundId: pvpvaiClient.getRoundId(),
        agentId: agentId,
        text: response
      };

      // Validate message
      const validatedMessage = agentMessageInputSchema.parse({
        messageType: WsMessageTypes.AGENT_MESSAGE,
        signature: '', // Will be added by client
        sender: character.settings?.pvpvai?.eth_wallet_address || '',
        content: messageContent
      });

      await pvpvaiClient.sendAIMessage({ text: response });

      // Store in message history
      this.state.messageHistory.push({
        agentId: agentId,
        agentName: character.agentRole?.name || 'Unknown',
        text: response,
        timestamp: Date.now()
      });

      // Trim history if needed
      if (this.state.messageHistory.length > this.MAX_HISTORY) {
        this.state.messageHistory.shift();
      }

      // Simulate and apply PvP effect
      const pvpEffect = this.simulatePvPEffect();
      if (pvpEffect) {
        const effect: PvpAllPvpActionsType = {
          actionType: pvpEffect.type === PvpActions.POISON ? PvpActions.POISON : 
                     pvpEffect.type === PvpActions.SILENCE ? PvpActions.SILENCE :
                     pvpEffect.type === PvpActions.DEAFEN ? PvpActions.DEAFEN :
                     PvpActions.BLIND,
          actionCategory: PvpActionCategories.STATUS_EFFECT,
          parameters: {
            target: agentId,
            duration: 30 as const,
            ...(pvpEffect.type === PvpActions.POISON ? {
              find: pvpEffect.details?.find || '',
              replace: pvpEffect.details?.replace || '',
              case_sensitive: false
            } : {})
          }
        };

        await gmClient.applyPvPEffect(effect);
        console.log('Applied PvP effect:', effect);
      }

    } catch (error) {
      console.error(`Error processing turn for ${agent.character?.name}:`, error);
      throw error;
    }
  }

  private buildPrompt(agent: ExtendedAgentRuntime): string {
    const character = agent.character as any;
    const chainName = character.agentRole?.name;
    const messageHistory = this.state.messageHistory
      .map(m => `${m.agentName}: ${m.text}`)
      .join('\n');

    return `You are ${chainName}, ${character.agentRole.description}.
Previous messages:
${messageHistory}

Based on your role and perspective, provide a response that:
1. Stays in character as a ${character.agentRole.description}
2. Addresses points made in previous messages
3. Promotes your chain's strengths
4. Respectfully challenges other chains' weaknesses
5. Keep responses concise (2-3 sentences)

Your response should maintain a professional but passionate tone. Avoid personal attacks and focus on technical merits.

Response:`;
  }

  public stopDebate() {
    console.log('Stopping debate...');
    this.isDebating = false;
    this.state.phase = 'end';
  }
}

export { DebateOrchestrator };