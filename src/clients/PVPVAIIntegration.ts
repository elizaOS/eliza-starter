import { supabase } from "../index.ts";
import type {
  ExtendedAgentRuntime,
  Character as ExtendedCharacter,
} from "../types/index.ts";
import { AgentClient } from "./AgentClient.ts";
import { GameMasterClient } from "./GameMasterClient.ts";

const HARDCODED_ROOM_ID = Number(process.env.ROOM_ID) || 290;
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
    roomId: Number(process.env.ROOM_ID) || 290,
  },
  AGENT1: {
    port: 3331,
    endpoint: process.env.BACKEND_URL || "http://localhost:3000",
    roomId: Number(process.env.ROOM_ID) || 290,
  },
  AGENT2: {
    port: 3332,
    endpoint: process.env.BACKEND_URL || "http://localhost:3000",
    roomId: Number(process.env.ROOM_ID) || 290,
  },
  AGENT3: {
    port: 3333,
    endpoint: process.env.BACKEND_URL || "http://localhost:3000",
    roomId: Number(process.env.ROOM_ID) || 290,
  },
  AGENT4: {
    port: 3334,
    endpoint: process.env.BACKEND_URL || "http://localhost:3000",
    roomId: Number(process.env.ROOM_ID) || 290,
  },
};

export class PVPVAIIntegration {
  private client: AgentClient;
  private runtime: ExtendedAgentRuntime;
  private agentId: number;
  private privateKey: string;

  constructor(runtime: ExtendedAgentRuntime, config: Config) {
    this.runtime = runtime;
    const char = runtime.character as unknown as ExtendedCharacter;
    const isGM = char.agentRole?.type.toUpperCase() === "GM";

    const walletAddress =
      char.settings?.pvpvai?.ethWalletAddress || config.walletAddress;
    if (!walletAddress) {
      throw new Error(
        "No eth_wallet_address found in character settings or config"
      );
    }

    const agentId = char.settings?.pvpvai?.agentId || config.agentId;
    if (!agentId) {
      throw new Error("No agentId found in character settings or config");
    }
    this.agentId = agentId;

    const privateKeyEnv = `AGENT_${agentId}_PRIVATE_KEY`;
    const privateKey = process.env[privateKeyEnv] || config.privateKey;
    if (!privateKey) {
      throw new Error(`${privateKeyEnv} not found in environment variables`);
    }
    this.privateKey = privateKey;

    const pvpvaiUrl = char.settings?.pvpvai?.pvpvaiServerUrl || config.endpoint;
  }

  public async initialize(): Promise<void> {
    const agentConfig = this.getAgentConfig(this.agentId);

    this.client = new AgentClient(
      this.runtime,
      config.endpoint,
      walletAddress,
      agentId,
      roomId,
      config.port || agentConfig.port
    );
    // Connect to room - backend will handle round assignment
    await this.client.setRoomAndRound(roomId);
  }

  private async getAgentConfig(agentId?: number) {
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (agentError) {
      throw agentError;
    }
    return agent;
  }

  public async sendAIMessage(text: string): Promise<void> {
    try {
      if (this.client instanceof GameMasterClient) {
        await this.client.broadcastToRoom({ text });
      } else {
        await this.client.sendAIMessage({ text });
      }
    } catch (error) {
      console.error("Error sending message:", error);
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
