import { Character as BaseCharacter, AgentRuntime as BaseAgentRuntime, ModelProviderName, UUID } from "@elizaos/core";
import { PVPVAIIntegration } from '../clients/PVPVAIIntegration.ts';

// Define our additional types
export interface AgentRole {
  type: 'GM' | 'AGENT';
  name: string;
  description: string;
  chain_family?: string;
  chain_id?: number;
}

export interface PVPVAISettings {
  endpoint: string;
  roomId: number;
  roundId?: number;
  type: 'GM' | 'AGENT';
  gameMasterId?: string;
  agentId?: string;
  userId: string;
}

export interface Environment {
  type: string;
  description: string;
  rules: string[];
}

// Make all extended properties optional to maintain compatibility
export interface ExtendedCharacterProps {
  agentRole: AgentRole;
  environment?: Environment;
  roomId?: number;
  userId?: string;
  settings?: {
    pvpvai?: PVPVAISettings;
    model?: string;
    secrets?: Record<string, string>;
  };
  clients?: string[];
  plugins?: any[];
}

// Define Character as intersection type (avoid duplicate extension issues)
export type Character = BaseCharacter & ExtendedCharacterProps;

// Replace class with type alias to avoid conflicts with private members
export type ExtendedAgentRuntime = BaseAgentRuntime & {
  pvpvaiClient?: PVPVAIIntegration;
  clients: Record<string, any>;
  character: Character;
  roomId?: number;
  userId?: number;
};
export interface MessageContent {
  text: string;
  gm_id?: string;
  targets?: string[];
  timestamp?: number;
  actionType?: 'Silence' | 'Deafen' | 'Attack' | 'Poison';
}

export interface PvPAction {
  actionType: 'Silence' | 'Deafen' | 'Attack' | 'Poison';
  sourceId: string;
  targetId: string;
  duration: number;
  timestamp: number;
}

export interface DebateMemory {
  id: UUID;
  content: {
    text: string;
    inReplyTo?: UUID;
    action?: string;
  };
  roomId: UUID;
  userId: UUID;
  agentId: UUID;
  timestamp: number;
}

// Re-export BaseAgentRuntime for backward compatibility
export { BaseAgentRuntime as AgentRuntime };
