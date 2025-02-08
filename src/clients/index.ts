import { AutoClientInterface } from "@elizaos/client-auto";
import { DiscordClientInterface } from "@elizaos/client-discord";
import { TelegramClientInterface } from "@elizaos/client-telegram";
import { TwitterClientInterface } from "@elizaos/client-twitter";
import { IAgentRuntime } from "@elizaos/core";
import { Character } from "../types/index.ts";


/**
 * Initializes all configured clients for an agent runtime
 * 
 * @param character - Agent character configuration
 * @param runtime - Agent runtime instance
 * @returns Array of initialized clients
 */
export async function initializeClients(
  character: Character,
  runtime: IAgentRuntime
) {
  // Initialize clients object on runtime if it doesn't exist
  runtime.clients = runtime.clients || {};
  
  // Track all initialized clients
  const clients = [];

  // Get configured client types from character
  const clientTypes = character.clients?.map((str) => str.toLowerCase()) || [];

  // Initialize Auto client if configured
  if (clientTypes.includes("auto")) {
    const autoClient = await AutoClientInterface.start(runtime);
    if (autoClient) {
      clients.push(autoClient);
      runtime.clients['auto'] = autoClient;
    }
  }

  // Initialize Discord client if configured
  if (clientTypes.includes("discord")) {
    const discordClient = await DiscordClientInterface.start(runtime);
    if (discordClient) {
      clients.push(discordClient);
      runtime.clients['discord'] = discordClient;
    }
  }

  // Initialize Telegram client if configured
  if (clientTypes.includes("telegram")) {
    const telegramClient = await TelegramClientInterface.start(runtime);
    if (telegramClient) {
      clients.push(telegramClient);
      runtime.clients['telegram'] = telegramClient;
    }
  }

  // Initialize Twitter client if configured
  if (clientTypes.includes("twitter")) {
    const twitterClient = await TwitterClientInterface.start(runtime);
    if (twitterClient) {
      clients.push(twitterClient);
      runtime.clients['twitter'] = twitterClient;
    }
  }

  

  // Initialize plugin clients if any
  if (character.plugins?.length > 0) {
    for (const plugin of character.plugins) {
      if (plugin.clients) {
        for (const client of plugin.clients) {
          try {
            const pluginClient = await client.start(runtime);
            if (pluginClient) {
              clients.push(pluginClient);
              // Store in runtime.clients with plugin name if available
              if (plugin.name) {
                runtime.clients[plugin.name] = pluginClient;
              }
            }
          } catch (error) {
            console.error(`Failed to initialize plugin client:`, error);
          }
        }
      }
    }
  }

  // Log initialized clients
  console.log('Initialized clients for', character.name, ':', {
    total: clients.length,
    types: Object.keys(runtime.clients)
  });

  return clients;
}

// Export additional components
export { AgentClient } from './AgentClient.ts';
export { 
  PVPVAIIntegration,
  createPVPVAIClient,
  AGENT_CONFIGS,
  type Config
} from './PVPVAIIntegration.ts';
export { SharedWebSocket, type WebSocketConfig } from './shared-websocket.ts'; 