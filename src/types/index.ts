import {
  AgentRuntime as BaseAgentRuntime,
  Character as BaseCharacter,
  UUID,
} from "@elizaos/core";
import { PVPVAIIntegration } from "../clients/PVPVAIIntegration.ts";

// Define our additional types
export interface AgentRole {
  type: "GM" | "AGENT";
  name: string;
  description: string;
  chain_family?: string;
  chain_id?: number;
}

export interface PVPVAISettings {
  pvpvaiServerUrl: string;
  type: "GM" | "AGENT";
  agentId: number;
  ethWalletAddress?: string; // === eth_wallet_address
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
