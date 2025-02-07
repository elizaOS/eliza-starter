import { stringToUuid, type UUID } from '@elizaos/core';
import type { ExtendedAgentRuntime } from './types/index.ts';
import { WsMessageTypes } from './types/ws.ts';
import { GameMasterClient } from './clients/GameMasterClient.ts';

interface DebateState {
  phase: 'init' | 'discussion' | 'voting' | 'end';
  currentTurn: number;
}

/**
 * Simplified DebateOrchestrator that only handles LLM coordination
 * All message routing and effects are handled by backend
 */
class DebateOrchestrator {
  private agents: ExtendedAgentRuntime[] = [];
  private gameMaster?: ExtendedAgentRuntime;
  private isDebating = false;
  private currentTopicId: UUID;
  private roomId?: number;
  private roundId?: number;

  private state: DebateState = {
    phase: 'init',
    currentTurn: 0
  };

  constructor(runtimes: ExtendedAgentRuntime[]) {
    this.currentTopicId = stringToUuid('debate-topic') as UUID;
    
    // Separate GM from regular agents
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

  public async initialize(roomId: number): Promise<void> {
    if (!this.gameMaster) {
      throw new Error('GameMaster not found!');
    }

    this.roomId = roomId;

    const gmClient = this.gameMaster.clients?.pvpvai?.getClient() as GameMasterClient;
    if (!gmClient) {
      throw new Error('GM client not initialized');
    }

    // Initialize GM first
    await gmClient.setRoomAndRound(roomId);
    // Set roundId from GM client
    this.roundId = gmClient.getRoundId();

    // Initialize other agents
    for (const agent of this.agents) {
      const agentClient = agent.clients?.pvpvai?.getClient();
      if (!agentClient) {
        throw new Error(`Agent client not initialized for ${agent.character.name}`);
      }
      await agentClient.setRoomAndRound(roomId);
    }

    // Wait for all connections to be established
    await this.verifyConnections();
    
    console.log(`DebateOrchestrator initialized with room ${this.roomId} and round ${this.roundId}`);
  }

  public async startDebate() {
    try {
        // Add log to help debug
        console.log('Starting debate with:', {
            roomId: this.roomId,
            roundId: this.roundId
        });

        if (!this.roomId || !this.roundId) {
            throw new Error('Must call initialize() with room and round IDs first');
        }

        this.isDebating = true;
        this.state.phase = 'init';

        const gmClient = this.gameMaster?.clients?.pvpvai?.getClient() as GameMasterClient;
        if (!gmClient) {
            throw new Error('GM client not initialized');
        }

        // Start debate session
        await gmClient.sendGMMessage("Room initialized. Beginning debate round.", []);
        await gmClient.sendGMMessage("Beginning discussion phase. Agents may now engage in debate.", []);
        
        const topic = "Let's discuss the future of cryptocurrency. What are your thoughts on Bitcoin versus Ethereum?";
        const validAgentIds = this.agents.map(a => a.character.settings?.pvpvai?.agentId).filter(Boolean);
        await gmClient.sendGMMessage(topic, validAgentIds);
        
        this.state.phase = 'discussion';

    } catch (error) {
        console.error('Error in startDebate:', error);
        throw error;
    }
  }

  private async verifyConnections(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 2000;
    let retries = 0;

    while (retries < maxRetries) {
      const allConnected = [
        this.gameMaster?.clients?.pvpvai?.getClient()?.wsClient?.isConnected(),
        ...this.agents.map(agent => 
          agent.clients?.pvpvai?.getClient()?.wsClient?.isConnected()
        )
      ].every(Boolean);

      if (allConnected) {
        console.log('All agents connected successfully');
        return;
      }

      await new Promise(r => setTimeout(r, retryDelay));
      retries++;
    }

    throw new Error('Failed to establish connections for all agents');
  }

  public stopDebate() {
    const gmClient = this.gameMaster?.clients?.pvpvai?.getClient() as GameMasterClient;
    
    console.log('Stopping debate...');
    this.isDebating = false;
    this.state.phase = 'end';
    
    if (gmClient) {
      gmClient.sendGMMessage("Debate session ended.", [])
        .catch(error => console.error('Error sending debate end message:', error));
    }
  }
}

export { DebateOrchestrator };