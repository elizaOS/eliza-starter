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

export interface RoomSetup {
  name: string;
  room_type: string;
  token: string; 
  token_webhook: string;
  agents: Record<string, {
    wallet: string;
    webhook: string;
  }>;
  gm: string; // This should be wallet address
  chain_id: string;
  chain_family: string;
  room_config: {
    round_duration: number;
    pvp_config: {
      enabled: boolean;
      enabled_rules: string[];
    };
  };
  transaction_hash: string;
}

export interface PVPVAISettings {
  wsUrl: string;
  endpoint: string;
  roomId: number;
  roundId: number;
  type: 'GM' | 'AGENT';
  // For GM
  gameMasterId?: number;
  // For Agent
  agentId?: number;
  walletAddress?: string; // === eth_wallet_address
  solanaWalletAddress?: string; // solana_wallet_address
  creatorId: number; // Changed from string to number to match DB schema
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
  creatorId?: string;
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
  creatorId?: number;
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
  creatorId: UUID;
  agentId: UUID;
  timestamp: number;
}

// Re-export BaseAgentRuntime for backward compatibility
export { BaseAgentRuntime as AgentRuntime };
