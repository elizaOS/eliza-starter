import { DirectClient as BaseDirectClient } from "@elizaos/client-direct";
import {
  elizaLogger,
  settings,
  stringToUuid,
  AgentRuntime as CoreAgentRuntime
} from "@elizaos/core";
import { type Character, type ExtendedAgentRuntime, AgentRuntime } from "./types";
import { bootstrapPlugin } from "@elizaos/plugin-bootstrap";
import { createNodePlugin } from "@elizaos/plugin-node";
import { solanaPlugin } from "@elizaos/plugin-solana";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDbCache } from "./cache/index.ts";
import { character } from "./character.ts";
import { startChat } from "./chat/index.ts";
import { initializeClients } from "./clients/index.ts";
import {
  getTokenForProvider,
  loadCharacters,
  parseArguments,
} from "./config/index.ts";
import { initializeDatabase } from "./database/index.ts";
import { PVPVAIAgent, PVPVAIGameMaster } from './clients/PVPVAIIntegration';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
) {
  elizaLogger.success(
    elizaLogger.successesTitle,
    "Creating runtime for character",
    character.name,
  );

  nodePlugin ??= createNodePlugin();

  return new AgentRuntime({
    databaseAdapter: db,
    token,
    modelProvider: character.modelProvider,
    evaluators: [],
    character,
    plugins: [
      bootstrapPlugin,
      nodePlugin,
      character.settings?.secrets?.WALLET_PUBLIC_KEY ? solanaPlugin : null,
    ].filter(Boolean),
    providers: [],
    actions: [],
    services: [],
    managers: [],
    cacheManager: cache,
  }) as ExtendedAgentRuntime;
}

async function startAgent(character: Character, directClient: ExtendedDirectClient) {
  try {
    character.id ??= stringToUuid(character.name);
    character.username ??= character.name;

    const token = getTokenForProvider(character.modelProvider, character);
    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = initializeDatabase(dataDir);

    await db.init();

    const cache = initializeDbCache(character, db);
    const runtime = createAgent(character, db, cache, token);

    await runtime.initialize();

    runtime.clients = await initializeClients(character, runtime);

    // Initialize PVP/VAI integration if configured
    if (character.settings?.pvpvai) {
      const config = {
        wsUrl: character.settings.pvpvai.wsUrl,
        roomId: character.settings.pvpvai.roomId,
        endpoint: character.settings.pvpvai.endpoint,
        agentId: parseInt(runtime.agentId)
      };
      
      runtime.pvpvaiAgent = new PVPVAIAgent(config);
    }

    directClient.registerAgent(runtime);

    // report to console
    elizaLogger.debug(`Started ${character.name} as ${runtime.agentId}`);

    return runtime;
  } catch (error) {
    elizaLogger.error(
      `Error starting agent for character ${character.name}:`,
      error,
    );
    console.error(error);
    throw error;
  }
}

const checkPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
};

// Update the declaration without protected modifier
declare module '@elizaos/client-direct' {
  interface DirectClient {
    getAgent(agentId: string): CoreAgentRuntime;
  }
}

class ExtendedDirectClient extends BaseDirectClient {
  constructor() {
    super();
    
    // Add PVP/VAI endpoints
    this.app.post("/:agentId/pvp/action", async (req, res) => {
      const agentId = req.params.agentId;
      const runtime = this.getAgent(agentId) as ExtendedAgentRuntime;
      
      if (!runtime?.pvpvaiAgent) {
        res.status(404).send("Agent not found or PVP/VAI not configured");
        return;
      }

      try {
        await runtime.pvpvaiAgent.handleMessage(req.body);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({
          error: "Error processing PVP action",
          details: error.message
        });
      }
    });

    this.app.post("/:agentId/pvp/status", async (req, res) => {
      const agentId = req.params.agentId;
      const runtime = this.getAgent(agentId) as ExtendedAgentRuntime;
      
      if (!runtime || !runtime.pvpvaiAgent) {
        res.status(404).send("Agent not found or PVP/VAI not configured");
        return;
      }

      try {
        runtime.pvpvaiAgent.updatePvPStatus(req.body);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({
          error: "Error updating PVP status",
          details: error.message
        });
      }
    });

    this.app.post("/:agentId/gm/action", async (req, res) => {
      const agentId = req.params.agentId;
      const runtime = this.getAgent(agentId) as ExtendedAgentRuntime;
      
      if (!runtime || !runtime.gameMaster) {
        res.status(404).send("Agent not found or GameMaster not configured");
        return;
      }

      try {
        await runtime.gameMaster.handleMessage(req.body);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({
          error: "Error processing GM action",
          details: error.message
        });
      }
    });
  }

  // Override the getAgent method with correct typing
  public override getAgent(agentId: string): ExtendedAgentRuntime | undefined {
    const agent = super.getAgent(agentId);
    return agent as ExtendedAgentRuntime | undefined;
  }
}

const startAgents = async () => {
  const directClient = new ExtendedDirectClient(); // Use extended client instead
  let serverPort = parseInt(settings.SERVER_PORT || "3000");
  const args = parseArguments();

  let charactersArg = args.characters || args.character;
  let characters = [character];

  console.log("charactersArg", charactersArg);
  if (charactersArg) {
    characters = await loadCharacters(charactersArg);
  }
  console.log("characters", characters);
  try {
    for (const char of characters) {
      const extendedChar: Character = {
        ...char,
        settings: char.settings || {},
      };
      await startAgent(extendedChar, directClient as ExtendedDirectClient);
    }
  } catch (error) {
    elizaLogger.error("Error starting agents:", error);
  }

  while (!(await checkPortAvailable(serverPort))) {
    elizaLogger.warn(`Port ${serverPort} is in use, trying ${serverPort + 1}`);
    serverPort++;
  }

  // upload some agent functionality into directClient
  directClient.startAgent = async (character: Character) => {
    // wrap it so we don't have to inject directClient later
    return startAgent(character, directClient);
  };

  directClient.start(serverPort);

  if (serverPort !== parseInt(settings.SERVER_PORT || "3000")) {
    elizaLogger.log(`Server started on alternate port ${serverPort}`);
  }

  const isDaemonProcess = process.env.DAEMON_PROCESS === "true";
  if(!isDaemonProcess) {
    elizaLogger.log("Chat started. Type 'exit' to quit.");
    const chat = startChat(characters);
    chat();
  }
};

startAgents().catch((error) => {
  elizaLogger.error("Unhandled error in startAgents:", error);
  process.exit(1);
});