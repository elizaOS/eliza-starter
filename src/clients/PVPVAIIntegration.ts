// PVPVAIIntegration.ts
import { AgentRuntime } from '@elizaos/core';
import { GameMasterClient } from './GameMasterClient.ts';
import { AgentClient } from './AgentClient.ts';
import { GameMasterConfig, AgentConfig } from './types.ts';
import type { Character as ExtendedCharacter } from '../types/index.ts';

export class PVPVAIIntegration {
  private client: GameMasterClient | AgentClient;
  private runtime: AgentRuntime;

  constructor(runtime: AgentRuntime, config: GameMasterConfig | AgentConfig) {
    this.runtime = runtime;
    
    // Get character and role type
    const char = runtime.character as unknown as ExtendedCharacter;
    const isGM = char.agentRole?.type === 'GM';
    
    // Get wallet address from character settings
    const walletAddress = char.settings?.pvpvai?.eth_wallet_address;
    if (!walletAddress) {
      throw new Error('No eth_wallet_address found in character settings');
    }

    console.log('Initializing PVPVAIIntegration:', {
      isGM,
      walletAddress,
      config
    });

    if (isGM) {
      // Create GM client
      const gmConfig = config as GameMasterConfig;
      this.client = new GameMasterClient(
        gmConfig.endpoint,
        walletAddress,        // Use wallet address from settings
        gmConfig.creatorId,
        char
      );
    } else {
      // Create agent client
      const agentConfig = config as AgentConfig;
      this.client = new AgentClient(
        agentConfig.endpoint,
        walletAddress,        // Use wallet address from settings
        agentConfig.creatorId,
        agentConfig.agentId   // Numeric ID for database
      );
    }
  }

  public async initialize(): Promise<void> {
    if (this.client instanceof GameMasterClient) {
      // GM creates room and round
      console.log('Initializing GM client...');
      await this.client.initialize();
      
      // Update runtime settings with new IDs
      const pvpSettings = (this.runtime.character as unknown as ExtendedCharacter).settings?.pvpvai;
      if (pvpSettings) {
        pvpSettings.roomId = this.client.getRoomId();
        pvpSettings.roundId = this.client.getRoundId();
        console.log('Updated GM settings:', {
          roomId: pvpSettings.roomId,
          roundId: pvpSettings.roundId
        });
      }
    } else {
      // Agents wait for room/round IDs
      console.log('Initializing Agent client...');
      const pvpSettings = (this.runtime.character as unknown as ExtendedCharacter).settings?.pvpvai;
      if (!pvpSettings?.roomId || !pvpSettings?.roundId) {
        throw new Error('Agent requires room and round IDs to be set');
      }
      this.client.setRoomAndRound(pvpSettings.roomId, pvpSettings.roundId);
      console.log('Agent initialized with:', {
        roomId: pvpSettings.roomId,
        roundId: pvpSettings.roundId
      });
    }
  }

  public async sendAIMessage(text: string): Promise<void> {
    console.log('Sending message:', { text });
    if (this.client instanceof AgentClient) {
      await this.client.sendAIMessage({ text });
    } else {
      await this.client.broadcastToRoom({ 
        text,
        roundId: this.client.getRoundId()
      });
    }
  }

  public async broadcastToRoom(text: string): Promise<void> {
    if (this.client instanceof GameMasterClient) {
      console.log('Broadcasting to room:', { text });
      await this.client.broadcastToRoom({ 
        text,
        roundId: this.client.getRoundId()
      });
    }
  }

  public getClient() {
    return this.client;
  }

  public close(): void {
    console.log('Closing PVPVAIIntegration client');
    this.client.stop();
  }
}

export const createPVPVAIClient = (
  runtime: AgentRuntime,
  config: GameMasterConfig | AgentConfig
): PVPVAIIntegration => {
  console.log('Creating new PVPVAIIntegration client');
  return new PVPVAIIntegration(runtime, config);
};