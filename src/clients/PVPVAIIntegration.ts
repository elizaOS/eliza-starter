import { AgentRuntime } from '@elizaos/core';
import { GameMasterClient } from './GameMasterClient.ts';
import { AgentClient } from './AgentClient.ts';
import type { Character as ExtendedCharacter, ExtendedAgentRuntime } from '../types/index.ts';

export interface Config {
  endpoint: string;
  walletAddress: string;
  creatorId: number;
  agentId?: number;
  port: number;
  privateKey?: string;
  roomId?: number; // roundid is doen in backend
}

// Configuration for different agents
export const AGENT_CONFIGS = {
  GAMEMASTER: {
    port: 3330,
    endpoint: process.env.BACKEND_URL || "http://localhost:3000",
    roomId: Number(process.env.ROOM_ID) || 290
  },
  AGENT1: {
    port: 3331,
    endpoint: process.env.BACKEND_URL || "http://localhost:3000",
    roomId: Number(process.env.ROOM_ID) || 290
  },
  AGENT2: {
    port: 3332,
    endpoint: process.env.BACKEND_URL || "http://localhost:3000",
    roomId: Number(process.env.ROOM_ID) || 290
  },
  AGENT3: {
    port: 3333,
    endpoint: process.env.BACKEND_URL || "http://localhost:3000",
    roomId: Number(process.env.ROOM_ID) || 290
  },
  AGENT4: {
    port: 3334,
    endpoint: process.env.BACKEND_URL || "http://localhost:3000",
    roomId: Number(process.env.ROOM_ID) || 290
  }
};

export class PVPVAIIntegration {
  private client: GameMasterClient | AgentClient;
  private runtime: ExtendedAgentRuntime;

  constructor(runtime: ExtendedAgentRuntime, config: Config) {
    this.runtime = runtime;
    
    const char = runtime.character as unknown as ExtendedCharacter;
    const isGM = char.agentRole?.type.toUpperCase() === 'GM';
    
    const walletAddress = char.settings?.pvpvai?.eth_wallet_address || config.walletAddress;
    if (!walletAddress) {
      throw new Error('No eth_wallet_address found in character settings or config');
    }

    if (isGM) {
      const privateKey = process.env.GM_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('GM_PRIVATE_KEY not found in environment variables');
      }
      
      this.client = new GameMasterClient(
        config.endpoint,
        walletAddress,        
        config.creatorId,
        char,
      );
    } else {
      const agentId = char.settings?.pvpvai?.agentId || config.agentId;
      if (!agentId) {
        throw new Error('No agentId found in character settings or config');
      }
      
      const privateKeyEnv = `AGENT_${agentId}_PRIVATE_KEY`;
      const privateKey = process.env[privateKeyEnv] || config.privateKey;
      if (!privateKey) {
        throw new Error(`${privateKeyEnv} not found in environment variables`);
      }

      const agentConfig = this.getAgentConfig(agentId);

      this.client = new AgentClient(
        config.endpoint,
        walletAddress,        
        agentId,
        config.port || agentConfig.port
      );
    }
  }

  public async initialize(): Promise<void> {
    const isGM = this.client instanceof GameMasterClient;
    const roomId = Number(process.env.ROOM_ID) || 290;

    // Connect to room - backend will handle round assignment
    await this.client.setRoomAndRound(roomId);
  }

  private getAgentConfig(agentId?: number) {
    const id = agentId || (this.runtime.character as any).settings?.pvpvai?.agentId;
    const config = {
      roomId: Number(process.env.ROOM_ID) || 290,
      ...(() => {
        switch(id) {
          case 50: return AGENT_CONFIGS.AGENT1;
          case 56: return AGENT_CONFIGS.AGENT2; 
          case 57: return AGENT_CONFIGS.AGENT3;
          case 58: return AGENT_CONFIGS.AGENT4;
          default: throw new Error(`Unknown agent ID: ${id}`);
        }
      })()
    };
    return config;
  }

  public async sendAIMessage(text: string): Promise<void> {
    try {
      if (this.client instanceof GameMasterClient) {
        await this.client.broadcastToRoom({ text });
      } else {
        await this.client.sendAIMessage({ text });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  public getClient() {
    return this.client;
  }

  public close(): void {
    this.client.stop();
  }
}

// Factory function to create PVPVAIIntegration
export const createPVPVAIClient = (
  runtime: ExtendedAgentRuntime,
  config: Config
): PVPVAIIntegration => {
  return new PVPVAIIntegration(runtime, config);
};