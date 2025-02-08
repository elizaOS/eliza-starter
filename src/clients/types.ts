import { UUID } from '@elizaos/core';
import { PvpAllPvpActionsType } from '../types/schemas';

export type PvPActionType = 'Silence' | 'Deafen' | 'Attack' | 'Poison';

// Base message types
export type MessageType = 'agent_message' | 'gm_message' | 'observation' | 'system_message';

export interface BaseMessage {
  messageType: MessageType;
  signature: string;         // Cryptographic signature of the message
  sender: string;           // Ethereum wallet address for authentication
  content: {
    timestamp: number;      // UTC timestamp in milliseconds
    roomId: number;         // Database ID of the room
    roundId: number;        // Database ID of the round
  };
}
export interface MessageHistoryEntry {
  timestamp: number;
  agentId: number;
  agentName: string;
  text: string;
}

export interface BroadcastContent {
  text: string;
  roundId: number;
  pvpAction?: PvpAllPvpActionsType;
}

export interface AgentMessage extends BaseMessage {
  messageType: 'agent_message';
  content: {
    timestamp: number;
    roomId: number;
    roundId: number;
    agentId: number;       // Numeric database ID of the agent
    text: string;
  };
}

export interface GMMessage extends BaseMessage {
  messageType: 'gm_message';
  content: {
    gmId: number;          // Game Master's wallet address
    timestamp: number;
    targets: number[];     // Array of numeric agent IDs
    roomId: number;
    roundId: number;
    message: string;
    deadline?: number;
    additionalData?: Record<string, any>;
    ignoreErrors?: boolean;
  };
}

// System-related types
export type SystemMessageType = 
  | 'STATE_UPDATE'
  | 'PVP_ACTION'
  | 'SYSTEM_BROADCAST'
  | 'ERROR_NOTIFICATION';

export interface SystemMessage extends BaseMessage {
  messageType: 'system_message';
  systemId: string;
  type: SystemMessageType;
  payload: any;
}

export interface SystemState {
  activeAgents: string[];      // Wallet addresses of active agents
  activeEffects: PvPAction[];
  systemStatus: {
    isHealthy: boolean;
    lastUpdate: number;
    activeRound?: number;
  };
}

export interface PublicChatMessage {
  id: string;
  sender: {
    id: string;          // User's database ID
    name: string;
    type: 'USER' | 'SYSTEM' | 'GM';
  };
  content: string;
  timestamp: number;
  roomId: string;
  metadata?: {
    [key: string]: any;
  };
}

// Response types
export interface AIResponse {
  success: boolean;
  error?: string;
  data?: {
    messageId: string;
    timestamp: number;
  };
}

export interface SystemResponse extends AIResponse {
  state?: Partial<SystemState>;
}

// Action types
export interface RoundAction {
  roundId: number;
  outcome?: any;
}

// Config types
export interface BaseConfig {
  endpoint: string;
  roomId: number;
  creatorId: number;     // Database ID of the creator
}

export interface GameMasterConfig extends BaseConfig {
  type: 'GM';
  gameMasterId: number;  // Database ID of the Game Master
  walletAddress: string; // Ethereum wallet address
}

export interface AgentConfig extends BaseConfig {
  type: 'AGENT';
  agentId: number;       // Database ID of the agent
  walletAddress: string; // Ethereum wallet address
}

export interface SystemConfig extends BaseConfig {
  type: 'SYSTEM';
  systemId: string;
}

// PvP types
export interface PvPAction {
  actionType: PvPActionType;
  sourceId: string;     // Wallet address of source
  targetId: string;     // Wallet address of target
  duration: number;
  timestamp: number;
}

export interface AgentState {
  silenced: boolean;
  deafened: boolean;
  poisoned: boolean;
  effects: PvPAction[];
  lastMessageId?: string;
}

export interface RoomSetup {
  name: string;
  room_type: string;
  color?: string;
  image_url?: string;
  token: string;         // Token contract address
  token_webhook: string;
  agents: Record<string, {
    wallet: string;      // Agent's wallet address
    webhook: string;
  }>;
  gm: string;           // Game Master's wallet address
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

export interface SetupResponse {
  roomId: number;
  roundId: number;
}