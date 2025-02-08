import { DirectClient as BaseDirectClient } from "@elizaos/client-direct";
import { AgentRuntime, elizaLogger, stringToUuid } from "@elizaos/core";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import { createNodePlugin } from "@elizaos/plugin-node";
import { solanaPlugin } from "@elizaos/plugin-solana";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDbCache } from "./cache/index.ts";
import { character } from "./character.ts";
import {
  AGENT_CONFIGS,
  createPVPVAIClient,
} from "./clients/PVPVAIIntegration.ts";
import {
  getTokenForProvider,
  loadCharacters,
  parseArguments,
} from "./config/index.ts";
import { initializeDatabase } from "./database/index.ts";
import { DebateOrchestrator } from "./DebateOrchestrator.ts";
import { Database } from "./types/database.types.ts";
import type {
  Character,
  ExtendedAgentRuntime,
  Character as ExtendedCharacter,
} from "./types/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//TODO Move variables into ExtendedCharacter config later
export const supabase = createClient<Database>(
  process.env.PVPVAI_SUPABASE_URL!,
  process.env.PVPVAI_SUPABASE_ANON_KEY!
);

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
  const waitTime =
    Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};

let nodePlugin: any | undefined;

export function createAgent(
  character: Character,
  db: any,
  cache: any,
  token: string
): ExtendedAgentRuntime {
  const extendedChar = character as unknown as ExtendedCharacter;
  const extendedAgentRole = extendedChar.agentRole;

  elizaLogger.success(
    elizaLogger.successesTitle,
    "Creating runtime for character",
    extendedChar.name
  );

  nodePlugin ??= createNodePlugin();

  const runtime = new AgentRuntime({
    databaseAdapter: db,
    token,
    modelProvider: extendedChar.modelProvider,
    evaluators: [],
    character: extendedChar,
    plugins: [
      bootstrapPlugin,
      nodePlugin,
      extendedChar.settings?.secrets?.WALLET_PUBLIC_KEY ? solanaPlugin : null,
    ].filter(Boolean),
    providers: [],
    actions: [],
    services: [],
    managers: [],
    cacheManager: cache,
  }) as ExtendedAgentRuntime;

  // Add chat interface to runtime

  const pvpSettings = extendedChar.settings?.pvpvai;
  if (pvpSettings) {
    runtime.roomId = pvpSettings.roomId;
    runtime.creatorId = Number(pvpSettings.creatorId);
  }

  return runtime;
}

async function startAgent(
  character: Character,
  directClient: BaseDirectClient
) {
  try {
    const extendedChar = character as unknown as ExtendedCharacter;
    extendedChar.id ??= stringToUuid(extendedChar.name);
    extendedChar.username ??= extendedChar.name;

    const token = getTokenForProvider(extendedChar.modelProvider, extendedChar);
    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = initializeDatabase(dataDir);
    await db.init();

    const cache = initializeDbCache(extendedChar, db);
    const runtime = createAgent(extendedChar, db, cache, token);

    await runtime.initialize();
    runtime.clients = {};

    if (extendedChar.settings?.pvpvai) {
      const isGM = extendedChar.agentRole?.type.toUpperCase() === "GM";

      try {
        console.log(
          `Initializing ${isGM ? "GM" : "Agent"} for ${
            extendedChar.name
          } with role ${extendedChar.agentRole?.type}`
        );

        // Get port based on role
        const portConfig = isGM
          ? AGENT_CONFIGS.GAMEMASTER
          : extendedChar.settings.pvpvai.agentId === 50
          ? AGENT_CONFIGS.AGENT1
          : extendedChar.settings.pvpvai.agentId === 56
          ? AGENT_CONFIGS.AGENT2
          : extendedChar.settings.pvpvai.agentId === 57
          ? AGENT_CONFIGS.AGENT3
          : AGENT_CONFIGS.AGENT4;

        // Add private key to config
        const privateKeyEnv = isGM
          ? "GM_PRIVATE_KEY"
          : `AGENT_${extendedChar.settings.pvpvai.agentId}_PRIVATE_KEY`;

        const config = {
          endpoint: portConfig.endpoint,
          walletAddress: extendedChar.settings.pvpvai.ethWalletAddress,
          creatorId: Number(extendedChar.settings.pvpvai.creatorId),
          port: portConfig.port,
          agentId: Number(extendedChar.settings.pvpvai.agentId),
          privateKey: process.env[privateKeyEnv],
        };

        // Create and initialize client
        const pvpvaiClient = await createPVPVAIClient(runtime, config);
        if (pvpvaiClient) {
          await pvpvaiClient.initialize();
          runtime.clients["pvpvai"] = pvpvaiClient;
        }

        // Start listening on the appropriate port
        await new Promise<void>((resolve, reject) => {
          try {
            directClient.app.listen(portConfig.port, () => {
              console.log(
                `${extendedChar.name} listening on port ${portConfig.port}`
              );
              resolve();
            });
          } catch (err) {
            reject(err);
          }
        });

        console.log(
          `Successfully initialized ${isGM ? "GM" : "Agent"} client for ${
            extendedChar.name
          }`
        );
      } catch (error) {
        console.error(
          `Failed to initialize PvPvAI client for ${extendedChar.name}:`,
          error
        );
        throw error; // Re-throw to handle failure
      }
    }

    directClient.registerAgent(runtime);
    elizaLogger.debug(`Started ${extendedChar.name} as ${runtime.agentId}`);

    return runtime;
  } catch (error) {
    elizaLogger.error(
      `Error starting agent for character ${
        (character as unknown as ExtendedCharacter).name
      }:`,
      error
    );
    console.error(error);
    throw error;
  }
}

const startAgents = async () => {
  const directClient = new BaseDirectClient();
  const args = parseArguments();

  let charactersArg = args.characters || args.character;
  let characters = [character];

  if (charactersArg) {
    characters = await loadCharacters(charactersArg);
  }

  try {
    // Start all agents
    const runtimes: ExtendedAgentRuntime[] = [];

    for (const char of characters) {
      const extendedChar = char as unknown as ExtendedCharacter;
      if (!extendedChar.agentRole) {
        throw new Error(
          `Character ${extendedChar.name} missing required agentRole configuration`
        );
      }

      const extendedCharacter: Character = {
        ...extendedChar,
        settings: extendedChar.settings || {},
        agentRole: extendedChar.agentRole,
      };

      const runtime = await startAgent(extendedCharacter, directClient);
      runtimes.push(runtime);

      console.log("Started agent:", {
        name: runtime.character.name,
        type: runtime.character.agentRole?.type,
        id: runtime.agentId,
      });
    }

    // Find GM in runtimes
    const gmRuntime = runtimes.find(
      (r) => r.character.agentRole?.type.toUpperCase() === "GM"
    );
    if (gmRuntime) {
      // Start debate orchestrator with all runtimes
      const orchestrator = new DebateOrchestrator(runtimes);
      elizaLogger.log("Waiting for connections to establish...");
      await new Promise((resolve) => setTimeout(resolve, 8000));

      try {
        elizaLogger.log("Starting debate...");
        const roomId = process.env.ROOM_ID
          ? parseInt(process.env.ROOM_ID)
          : 290;
        await orchestrator.initialize(roomId);
        await orchestrator.startDebate();
      } catch (error) {
        elizaLogger.error("Error starting debate:", error);
      }

      process.on("SIGINT", () => {
        elizaLogger.log("Stopping debate...");
        orchestrator.stopDebate();
        process.exit(0);
      });
    }
  } catch (error) {
    elizaLogger.error("Error starting agents:", error);
    process.exit(1);
  }
};

startAgents().catch((error) => {
  elizaLogger.error("Unhandled error in startAgents:", error);
  process.exit(1);
});
