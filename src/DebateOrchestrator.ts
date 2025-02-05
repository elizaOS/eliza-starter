import { AgentRuntime, generateText, stringToUuid, type UUID } from '@elizaos/core';
import type { ExtendedAgentRuntime } from './types/index.ts';

// Types for PvP simulation
interface PvPEffect {
  type: 'SILENCE' | 'DEAFEN' | 'POISON';
  targetId: number;
  duration: number;  // in milliseconds
  startTime: number;
  details?: {
    find?: string;
    replace?: string;
  };
}

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
  private simulatePvPAction(): PvPEffect | null {
    if (Math.random() > this.PVP_CHANCE) return null;

    const types: PvPEffect['type'][] = ['SILENCE', 'DEAFEN', 'POISON'];
    const type = types[Math.floor(Math.random() * types.length)];
    const targetAgent = this.agents[Math.floor(Math.random() * this.agents.length)];
    const targetId = (targetAgent.character as any).settings?.pvpvai?.agentId;

    const effect: PvPEffect = {
      type,
      targetId,
      duration: 30000, // 30 seconds
      startTime: Date.now()
    };

    // Add POISON replacement text if needed
    if (type === 'POISON') {
      effect.details = {
        find: 'blockchain',
        replace: 'sparklechain'
      };
    }

    return effect;
  }

  // Check if an agent is affected by a PvP effect
  private isAffectedByPvP(agentId: number, type: PvPEffect['type']): boolean {
    return this.state.activePvPEffects.some(effect => 
      effect.targetId === agentId && 
      effect.type === type && 
      Date.now() - effect.startTime < effect.duration
    );
  }

  // Clean up expired PvP effects
  private cleanupPvPEffects() {
    this.state.activePvPEffects = this.state.activePvPEffects.filter(effect =>
      Date.now() - effect.startTime < effect.duration
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
    for (const agent of this.agents) {
      try {
        const client = agent.clients?.pvpvai?.getClient();
        if (!client || !('setRoomAndRound' in client)) continue;

        client.setRoomAndRound(this.roomId!, this.roundId!);
        
        // Update agent settings
        const agentSettings = (agent.character as any).settings?.pvpvai;
        if (agentSettings) {
          agentSettings.roomId = this.roomId;
          agentSettings.roundId = this.roundId;
        }
      } catch (error) {
        console.error(`Failed to initialize agent ${agent.character?.name}:`, error);
      }
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
          if (this.isAffectedByPvP(agentId, 'SILENCE')) {
            console.log(`Agent ${agent.character?.name} is silenced, skipping turn`);
            continue;
          }

          // Generate and send message
          await this.processAgentTurn(agent);

          // Simulate random PvP action after turn
          const pvpEffect = this.simulatePvPAction();
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
    const chainName = character.agentRole?.name || 'Unknown';
    
    // Generate response using chat history
    const response = await generateText({
      runtime: agent as AgentRuntime,
      context: this.buildPrompt(agent),
      modelClass: 'large',
    });

    // Store in message history
    this.state.messageHistory.push({
      agentId: character.settings?.pvpvai?.agentId,
      agentName: chainName,
      text: response,
      timestamp: Date.now()
    });

    // Trim history if needed
    if (this.state.messageHistory.length > this.MAX_HISTORY) {
      this.state.messageHistory.shift();
    }

    // Send through PvPvAI client
    const pvpvaiClient = agent.clients?.pvpvai;
    if (pvpvaiClient) {
      await pvpvaiClient.sendAIMessage(response);
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