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

  // Added new method to register agents
  private async registerAgents(): Promise<void> {
    for (const agent of this.agents) {
      await agent.clients?.pvpvai?.getClient().setRoomAndRound(this.roomId, this.roundId);
    }
    console.log('Agents registered, waiting for confirmation...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds for registration to complete
  }

  public async startDebate() {
    try {
      this.isDebating = true;
      this.state.phase = 'init';

      if (!this.gameMaster) {
        throw new Error('GameMaster not found!');
      }

      const gmClient = this.gameMaster.clients?.pvpvai?.getClient() as GameMasterClient;
      if (!gmClient) {
        throw new Error('GM client not initialized');
      }

      // Register agents first
      await this.registerAgents();
      
      // Wait for connections to establish
      await this.verifyConnections();

      // Start debate session
      await gmClient.sendGMMessage("Room initialized. Beginning debate round.", []);
      await gmClient.sendGMMessage("Beginning discussion phase. Agents may now engage in debate.", []);
      
      this.state.phase = 'discussion';

    } catch (error) {
      console.error('Error in startDebate:', error);
      throw error;
    }
  }

  private async verifyConnections(): Promise<void> {
    const gmClient = this.gameMaster?.clients?.pvpvai?.getClient();
    if (!gmClient?.wsClient) {
      throw new Error('GM client not initialized');
    }

    // Wait for WebSocket to connect
    const maxRetries = 10;
    const retryDelay = 2000;
    let retries = 0;

    while (retries < maxRetries) {
      console.log('Checking WebSocket connection...', {
        isConnected: gmClient.wsClient.isConnected(),
        retry: retries + 1
      });

      if (gmClient.wsClient.isConnected()) {
        console.log('WebSocket connected successfully');
        return;
      }

      await new Promise(r => setTimeout(r, retryDelay));
      retries++;
    }

    throw new Error('Failed to establish WebSocket connection');
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