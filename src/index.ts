import { DirectClient as BaseDirectClient } from "@elizaos/client-direct";
import {
  elizaLogger,
  settings,
  stringToUuid,
  AgentRuntime as CoreAgentRuntime,
  AgentRuntime
} from "@elizaos/core";
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
import { 
  PVPVAIIntegration, 
  createPVPVAIClient, 
} from './clients/PVPVAIIntegration.ts';
import { AgentConfig, BroadcastContent, GameMasterConfig } from "./clients/types.ts";
import { DebateOrchestrator } from './DebateOrchestrator.ts';
import type { Character as ExtendedCharacter, ExtendedAgentRuntime, Character } from "./types/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
  const waitTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
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
  
  const pvpSettings = extendedChar.settings?.pvpvai;
  if (pvpSettings) {
    runtime.roomId = pvpSettings.roomId;
    runtime.creatorId = Number(pvpSettings.creatorId);
  }
  
  return runtime;
}

async function startAgent(character: Character, directClient: ExtendedDirectClient) {
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
    runtime.clients = await initializeClients(extendedChar, runtime);

    if (extendedChar.settings?.pvpvai) {
      const isGM = extendedChar.agentRole?.type === 'GM';
      
      try {
        const config: GameMasterConfig | AgentConfig = isGM ? {
          endpoint: extendedChar.settings.pvpvai.endpoint,
          roomId: extendedChar.settings.pvpvai.roomId,
          type: 'GM',
          gameMasterId: Number(extendedChar.settings.pvpvai.gameMasterId), // nr
          walletAddress: extendedChar.settings.pvpvai.eth_wallet_address, //  wallet address === id
          creatorId: Number(extendedChar.settings.pvpvai.creatorId) // nr
        } : {
          endpoint: extendedChar.settings.pvpvai.endpoint,
          roomId: extendedChar.settings.pvpvai.roomId,
          type: 'AGENT',
          agentId: Number(extendedChar.settings.pvpvai.agentId), // nr
          walletAddress: extendedChar.settings.pvpvai.eth_wallet_address, // wallet address === id
          creatorId: Number(extendedChar.settings.pvpvai.creatorId) // nr
        };

        const pvpvaiClient = createPVPVAIClient(runtime, config);
        runtime.clients = runtime.clients || {};
        runtime.clients['pvpvai'] = pvpvaiClient;
      } catch (error) {
        console.error('Failed to initialize PvPvAI client:', error);
      }
    }

    directClient.registerAgent(runtime);
    elizaLogger.debug(`Started ${extendedChar.name} as ${runtime.agentId}`);

    return runtime;
  } catch (error) {
    elizaLogger.error(
      `Error starting agent for character ${(character as unknown as ExtendedCharacter).name}:`,
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

declare module '@elizaos/client-direct' {
  interface DirectClient {
    getAgent(agentId: string): CoreAgentRuntime;
  }
}

class ExtendedDirectClient extends BaseDirectClient {
  private _agents: Map<string, ExtendedAgentRuntime> = new Map();

  public getActiveRuntimes(): ExtendedAgentRuntime[] {
    return Array.from(this._agents.values());
  }

  constructor() {
    super();
    
    this.app.post("/:agentId/pvp/action", async (req, res) => {
      const agentId = req.params.agentId;
      const runtime = this.getAgent(agentId) as ExtendedAgentRuntime;
      
      if (!runtime?.pvpvaiClient) {
        res.status(404).send("Agent not found or PVP/VAI not configured");
        return;
      }
    
      try {
        const client = runtime.pvpvaiClient.getClient();
        
        if ('sendAIMessage' in client) {
          await client.sendAIMessage({ text: req.body.content.text });
        } 
        else if ('broadcastToRoom' in client) {
          await client.broadcastToRoom({
            text: req.body.content.text,
            roundId: req.body.roundId || runtime.character.settings?.pvpvai?.roundId || 1
          } as BroadcastContent);  // Add type assertion here
        }
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
      
      if (!runtime?.pvpvaiClient) {
        res.status(404).send("Agent not found or PVP/VAI not configured");
        return;
      }

      try {
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
      
      if (!runtime?.pvpvaiClient) {
        res.status(404).send("Agent not found or GameMaster not configured");
        return;
      }
    
      try {
        const client = runtime.pvpvaiClient.getClient();
        
        if ('broadcastToRoom' in client) {
          await client.broadcastToRoom({
            text: req.body.content.text,
            roundId: req.body.roundId || runtime.character.settings?.pvpvai?.roundId || 1
          });
        } else {
          throw new Error('Not a GameMaster client');
        }
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({
          error: "Error processing GM action",
          details: error.message
        });
      }
    });
  }

  public override getAgent(agentId: string): ExtendedAgentRuntime | undefined {
    const agent = super.getAgent(agentId);
    return agent as ExtendedAgentRuntime | undefined;
  }

  public override registerAgent(runtime: ExtendedAgentRuntime): void {
    super.registerAgent(runtime);
    this._agents.set(runtime.agentId, runtime);
  }
}

const startAgents = async () => {
  const directClient = new ExtendedDirectClient();
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
      const extendedChar = char as unknown as ExtendedCharacter;
      if (!extendedChar.agentRole) {
        throw new Error(`Character ${extendedChar.name} missing required agentRole configuration`);
      }
      
      const extendedCharacter: Character = {
        ...extendedChar,
        settings: extendedChar.settings || {},
        agentRole: extendedChar.agentRole
      };
      await startAgent(extendedCharacter, directClient);
    }
  } catch (error) {
    elizaLogger.error("Error starting agents:", error);
  }

  while (!(await checkPortAvailable(serverPort))) {
    elizaLogger.warn(`Port ${serverPort} is in use, trying ${serverPort + 1}`);
    serverPort++;
  }

  directClient.startAgent = startAgent;
  directClient.start(serverPort);

  if (serverPort !== parseInt(settings.SERVER_PORT || "3000")) {
    elizaLogger.log(`Server started on alternate port ${serverPort}`);
  }

  const isDaemonProcess = process.env.DAEMON_PROCESS === "true";
  if(!isDaemonProcess) {
    elizaLogger.log("Chat started. Type 'exit' to quit.");
    
    const activeRuntimes = directClient.getActiveRuntimes();
    console.log('Active runtimes:', activeRuntimes.map(r => ({
      name: r.character.name,
      type: r.character.agentRole?.type,
      id: r.agentId
    })));
    
    const orchestrator = new DebateOrchestrator(activeRuntimes);
    
    elizaLogger.log("Waiting for connections to establish...");
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    try {
      elizaLogger.log("Starting debate...");
      await orchestrator.startDebate();
    } catch (error) {
      elizaLogger.error('Error starting debate:', error);
    }

    process.on('SIGINT', () => {
      elizaLogger.log("Stopping debate...");
      orchestrator.stopDebate();
      process.exit(0);
    });
  }
};

startAgents().catch((error) => {
  elizaLogger.error("Unhandled error in startAgents:", error);
  process.exit(1);
});