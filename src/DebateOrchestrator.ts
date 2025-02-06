import { z } from 'zod';
import { AgentRuntime, generateText, stringToUuid, type UUID } from '@elizaos/core';
import type { ExtendedAgentRuntime } from './types/index.ts';
import { 
  PvpAllPvpActionsType
} from './types/schemas.ts';
import { PvpActions, PvpActionCategories } from './types/pvp.ts';
import axios from 'axios';
import { WsMessageTypes } from './types/ws.ts';
import type { Data } from 'ws';



interface DebateState {
  phase: 'init' | 'discussion' | 'voting' | 'end';
  currentTurn: number;
  messageHistory: Array<{
    agentId: number;
    agentName: string;
    text: string;
    timestamp: number;
  }>;
}

/**
 * DebateOrchestrator coordinates the high-level debate flow between agents
 * 
 * Responsibilities:
 * - Initializes GM and agents
 * - Coordinates debate rounds
 * - Validates agent connections
 * - Manages debate state transitions
 * - Coordinates agent turns
 * 
 * Debate Flow:
 * 1. Initialize GM
 * 2. Initialize agents with room/round IDs 
 * 3. Verify all agent connections
 * 4. Start debate loop
 * 5. Process agent turns sequentially
 * 6. Apply random PvP effects
 * 
 * @class DebateOrchestrator
 */
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
    messageHistory: []
  };

  // Configuration
  private readonly TURN_DELAY = 5000;  // 5 seconds between turns
  private readonly ROUND_DELAY = 10000; // 10 seconds between rounds
  private readonly PVP_CHANCE = 0.2;   // 20% chance of PvP action per turn
  private readonly MAX_HISTORY = 8;     // Max messages in history
  private readonly VERIFY_CONNECTION_RETRY_DELAY = 2000; // 2 seconds between retries
  private readonly MAX_CONNECTION_RETRIES = 3;

  /**
   * Creates new debate orchestrator instance
   * 
   * @param runtimes - Array of agent runtimes including GM
   */
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

  /**
   * Initializes agent clients and verifies connections
   * 
   * @throws Error if agent initialization or verification fails
   */
  private async initializeAgents() {
    console.log('Initializing agent clients...');
    
    try {
      // Initialize GM first and wait for connection
      if (!this.gameMaster?.clients?.pvpvai) {
        throw new Error('GM client not initialized');
      }
      
      const gmClient = this.gameMaster.clients.pvpvai;
      console.log('Initializing GM and waiting for connection...');
      
      await gmClient.initialize();
      
      // Add delay to ensure GM WebSocket fully connects
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get room/round IDs from GM settings
      const settings = (this.gameMaster.character as any).settings?.pvpvai;
      this.roomId = settings?.roomId;
      this.roundId = settings?.roundId;

      if (!this.roomId || !this.roundId) {
        throw new Error('Room/Round initialization failed - missing IDs');
      }

      // Verify GM WebSocket before proceeding
      const gmWsClient = gmClient.getClient()?.wsClient;
      if (!gmWsClient?.isConnected()) {
        throw new Error('GM WebSocket failed to connect');
      }

      console.log('GM WebSocket connected successfully');

      // Bulk register agents with retries
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

      let registerRetries = 0;
      while (registerRetries < 3) {
        try {
          await axios.post(
            `${gmClient.getClient().endpoint}/rooms/${this.roomId}/agents/bulk`,
            { agents: agentsToRegister }
          );
          break;
        } catch (error) {
          console.error('Failed to register agents, retrying...');
          registerRetries++;
          if (registerRetries === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Initialize agents sequentially to avoid race conditions
      for (const agent of this.agents) {
        const client = agent.clients?.pvpvai;
        if (!client) {
          throw new Error(`Agent ${agent.character?.name} missing pvpvai client`);
        }

        const pvpvaiClient = client.getClient();
        await pvpvaiClient.setRoomAndRound(this.roomId!, this.roundId!);
        
        // Wait for agent WebSocket to connect
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update agent settings
        const agentSettings = (agent.character as any).settings?.pvpvai;
        if (agentSettings) {
          agentSettings.roomId = this.roomId;
          agentSettings.roundId = this.roundId;
        }
      }

      // Final connection verification
      await this.verifyConnections();

    } catch (error) {
      console.error('Failed to initialize agents:', error);
      throw error;
    }
  }

  /**
   * Verifies all agents have connected WebSocket connections
   * Retries up to MAX_CONNECTION_RETRIES with delay between attempts
   * 
   * @throws Error if verification fails after max retries
   */
  private async verifyConnections(): Promise<void> {
    if (!this.roomId) throw new Error('No room ID');
    
    const maxRetries = 5;
    const retryDelay = 2000;
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        const gmClient = this.gameMaster?.clients?.pvpvai?.getClient();
        if (!gmClient?.wsClient?.isConnected()) {
          console.log('Waiting for GM WebSocket connection...');
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retries++;
          continue;
        }

        // Send participant count request
        const message = {
          messageType: WsMessageTypes.PARTICIPANTS,
          content: {
            roomId: this.roomId,
            timestamp: Date.now()
          }
        };
        
        gmClient.wsClient.send(message);

        // Wait for response
        const participantCount = await new Promise<number>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Participant count timeout'));
          }, 10000);

          const handler = (data: any) => {
            try {
              const response = JSON.parse(data.toString());
              if (response.messageType === WsMessageTypes.PARTICIPANTS) {
                clearTimeout(timeout);
                resolve(response.content.count);
              }
            } catch (error) {
              console.error('Error parsing participant message:', error);
            }
          };

          gmClient.wsClient.ws?.once('message', handler);
        });

        const expectedConnections = this.agents.length + 1;
        if (participantCount >= expectedConnections) {
          console.log(`All ${participantCount} connections verified`);
          return;
        }
        
        console.log(`Waiting for connections (${participantCount}/${expectedConnections})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retries++;
        
      } catch (error) {
        console.error('Error verifying connections:', error);
        retries++;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    throw new Error('Failed to verify all agent connections');
  }

  private async debateLoop() {
    console.log(`Starting debate loop with ${this.agents.length} agents`);
    
    while (this.isDebating && this.state.phase === 'discussion') {
      // Process each agent's turn
      for (const agent of this.agents) {
        if (!this.isDebating) break;

        try {
          // Generate and send message
          await this.processAgentTurn(agent);

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

    try {
      // Send message through PvPvAI client
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

      // Random PvP test action through backend
      if (Math.random() < this.PVP_CHANCE) {
        const pvpEffect: PvpAllPvpActionsType = {
          actionType: PvpActions.POISON,
          actionCategory: PvpActionCategories.STATUS_EFFECT,
          parameters: {
            target: agentId,
            duration: 30,
            find: 'blockchain',
            replace: 'sparklechain',
            case_sensitive: false
          }
        };

        await gmClient.applyPvPEffect(pvpEffect);
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