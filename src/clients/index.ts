import { AutoClientInterface } from "@elizaos/client-auto";
import { DiscordClientInterface } from "@elizaos/client-discord";
import { TelegramClientInterface } from "@elizaos/client-telegram";
import { TwitterClientInterface } from "@elizaos/client-twitter";
import { IAgentRuntime } from "@elizaos/core";
import { Character } from "../types/index.ts";
import { createPVPVAIClient } from "./PVPVAIIntegration.ts";
import { AgentRuntime } from "@elizaos/core";
// Changed import to include .ts extension to resolve module loading issues
import { AgentConfig, GameMasterConfig } from "./types.ts";

export async function initializeClients(
  character: Character,
  runtime: IAgentRuntime
) {
  const clients = [];
  const clientTypes = character.clients?.map((str) => str.toLowerCase()) || [];

  if (clientTypes.includes("auto")) {
    const autoClient = await AutoClientInterface.start(runtime);
    if (autoClient) clients.push(autoClient);
  }

  if (clientTypes.includes("discord")) {
    clients.push(await DiscordClientInterface.start(runtime));
  }

  if (clientTypes.includes("telegram")) {
    const telegramClient = await TelegramClientInterface.start(runtime);
    if (telegramClient) clients.push(telegramClient);
  }

  if (clientTypes.includes("twitter")) {
    const twitterClients = await TwitterClientInterface.start(runtime);
    clients.push(twitterClients);
  }

  // Initialize PvPvAI client if configured
  if (character.settings?.pvpvai) {
    const isGM = character.agentRole?.type === "GM";
    
    try {
      if (isGM && character.settings.pvpvai.gameMasterId) {
        const gmConfig: GameMasterConfig = {
          endpoint: character.settings.pvpvai.endpoint,
          roomId: character.settings.pvpvai.roomId,
          creatorId: character.settings.pvpvai.creatorId,
          type: 'GM',
          gameMasterId: character.settings.pvpvai.gameMasterId,
          walletAddress: character.settings.pvpvai.walletAddress
        };
        const pvpvaiClient = createPVPVAIClient(runtime as AgentRuntime, gmConfig);
        clients.push(pvpvaiClient);
      } else if (character.settings.pvpvai.agentId) {
        const agentConfig: AgentConfig = {
          endpoint: character.settings.pvpvai.endpoint,
          roomId: character.settings.pvpvai.roomId,
          creatorId: character.settings.pvpvai.creatorId,
          type: 'AGENT',
          agentId: character.settings.pvpvai.agentId,
          walletAddress: character.settings.pvpvai.walletAddress
        };
        const pvpvaiClient = createPVPVAIClient(runtime as AgentRuntime, agentConfig);
        clients.push(pvpvaiClient);
      }
    } catch (error) {
      console.error('Failed to initialize PvPvAI client:', error);
    }
  }

  if (character.plugins?.length > 0) {
    for (const plugin of character.plugins) {
      if (plugin.clients) {
        for (const client of plugin.clients) {
          clients.push(await client.start(runtime));
        }
      }
    }
  }

  return clients;
}

export * from './types.ts';
export * from './AgentClient.ts';
export * from './GameMasterClient.ts';
export * from './PVPVAIIntegration.ts';
