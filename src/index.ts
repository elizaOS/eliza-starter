import type { DirectClient } from "@ai16z/client-direct";
import { DirectClientInterface } from "@ai16z/client-direct";
import {
  AgentRuntime,
  elizaLogger,
  stringToUuid,
  type Character,
} from "@ai16z/eliza";
import { bootstrapPlugin } from "@ai16z/plugin-bootstrap";
import { nodePlugin } from "@ai16z/plugin-node";
import { solanaPlugin } from "@ai16z/plugin-solana";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { intializeDbCache } from "./cache/index.js";
import { character } from "./character.js";
import { startChat } from "./chat/index.js";
import { initializeClients } from "./clients/index.js";
import {
  getTokenForProvider,
  loadCharacters,
  parseArguments,
} from "./config/index.js";
import { initializeDatabase } from "./database/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
  const waitTime =
    Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};

export function createAgent(
  character: Character,
  db: any,
  cache: any,
  token: string
) {
  elizaLogger.success(
    elizaLogger.successesTitle,
    "Creating runtime for character",
    character.name
  );
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
  });
}

async function startAgent(character: Character, directClient: DirectClient) {
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

    const cache = intializeDbCache(character, db);
    const runtime = createAgent(character, db, cache, token);

    await runtime.initialize();

    const clients = await initializeClients(character, runtime);

    directClient.registerAgent(runtime);

    return clients;
  } catch (error) {
    elizaLogger.error(
      `Error starting agent for character ${character.name}:`,
      error
    );
    console.error(error);
    throw error;
  }
}

const startAgents = async () => {
  const directClient = await DirectClientInterface.start();
  const args = parseArguments();

  let charactersArg = args.characters || args.character;

  let characters = [character];
  console.log("charactersArg", charactersArg);
  if (charactersArg) {
    characters = await loadCharacters(charactersArg);
  }
  console.log("characters", characters);
  try {
    for (const character of characters) {
      await startAgent(character, directClient as DirectClient);
    }
  } catch (error) {
    elizaLogger.error("Error starting agents:", error);
  }

  elizaLogger.log("Chat started. Type 'exit' to quit.");
  const chat = startChat(characters);
  chat();
};

startAgents().catch((error) => {
  elizaLogger.error("Unhandled error in startAgents:", error);
  process.exit(1);
});
