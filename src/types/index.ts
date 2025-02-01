import { Character as BaseCharacter, AgentRuntime as BaseAgentRuntime, ModelProviderName } from "@elizaos/core";
import { PVPVAIAgent } from '../clients/PVPVAIIntegration';
import { DirectClient } from "@elizaos/client-direct";

interface PVPVAISettings {
  wsUrl: string;
  roomId: number;
  endpoint: string;
}

export interface Character extends BaseCharacter {
  settings: NonNullable<BaseCharacter['settings']> & {
    pvpvai?: PVPVAISettings;
  };
  modelProvider: ModelProviderName;
}

export interface ExtendedAgentRuntime extends BaseAgentRuntime {
  pvpvaiAgent?: PVPVAIAgent;
  gameMaster?: any; 
}

export interface ExtendedDirectClient extends DirectClient {
  getAgent(agentId: string): ExtendedAgentRuntime | undefined;
}

export { BaseAgentRuntime as AgentRuntime };
