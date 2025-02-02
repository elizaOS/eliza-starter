import { Character as BaseCharacter, AgentRuntime as BaseAgentRuntime, ModelProviderName } from "@elizaos/core";
import { PVPVAIIntegration } from '../clients/PVPVAIIntegration';
import { DirectClient } from "@elizaos/client-direct";

interface PVPVAISettings {
  wsUrl: string;
  roomId: number;
  endpoint: string;
  type: 'GM' | 'AGENT';
  gameMasterId?: string;
  agentId?: string;

}

export interface AgentRole {
  type: 'GM' | 'AGENT';
  name?: string;
}

export interface Character extends BaseCharacter {
  settings: NonNullable<BaseCharacter['settings']> & {
    pvpvai?: PVPVAISettings;
  };
  modelProvider: ModelProviderName;
  agentRole?: AgentRole;
}

// Make clients required since it's required in IAgentRuntime
export interface ExtendedAgentRuntime extends BaseAgentRuntime {
  pvpvaiClient?: PVPVAIIntegration;
  clients: Record<string, any>; // Required as per IAgentRuntime
}

export interface ExtendedDirectClient extends DirectClient {
  getAgent(agentId: string): ExtendedAgentRuntime;
}

export { BaseAgentRuntime as AgentRuntime };