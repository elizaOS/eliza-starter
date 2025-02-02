// src/clients/index.ts

import { AutoClientInterface } from "@elizaos/client-auto";
import { DiscordClientInterface } from "@elizaos/client-discord";
import { TelegramClientInterface } from "@elizaos/client-telegram";
import { TwitterClientInterface } from "@elizaos/client-twitter";
import { IAgentRuntime } from "@elizaos/core";
import { Character } from "../types/index.ts";
import { createPVPVAIClient } from "./PVPVAIIntegration.ts";
import { AgentRuntime } from "@elizaos/core";

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
    const config = character.settings.pvpvai;
    const isGM = character.agentRole?.type === "GM";
    
    try {
      if (isGM && config.gameMasterId) {
        const gmConfig = {
          wsUrl: config.wsUrl,
          roomId: config.roomId,
          endpoint: config.endpoint,
          gameMasterId: config.gameMasterId
        };
        const pvpvaiClient = createPVPVAIClient(runtime as AgentRuntime, gmConfig);
        clients.push(pvpvaiClient);
      } else if (config.agentId) {
        const agentConfig = {
          wsUrl: config.wsUrl,
          roomId: config.roomId,
          endpoint: config.endpoint,
          agentId: parseInt(config.agentId.toString(), 10) // Ensure agentId is a number
        };

        // Validate that we have a valid number
        if (isNaN(agentConfig.agentId)) {
          throw new Error('Invalid agentId: must be a valid number');
        }

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