
import { Character, ModelProviderName, settings, validateCharacterConfig, elizaLogger } from "@elizaos/core";
import fs from "fs";
import path from "path";
import yargs from "yargs";

export function parseArguments(): {
  character?: string;
  characters?: string;
} {
  try {
    return yargs(process.argv.slice(2))
      .option("character", {
        type: "string",
        description: "Path to the character JSON file",
      })
      .option("characters", {
        type: "string",
        description: "Comma separated list of paths to character JSON files",
      })
      .parseSync();
  } catch (error) {
    console.error("Error parsing arguments:", error);
    return {};
  }
}

export async function loadCharacters(
  charactersArg: string
): Promise<Character[]> {
  let characterPaths = charactersArg?.split(",").map((filePath) => {
    if (path.basename(filePath) === filePath) {
      filePath = "../characters/" + filePath;
    }
    return path.resolve(process.cwd(), filePath.trim());
  });

  const loadedCharacters = [];

  if (characterPaths?.length > 0) {
    for (const path of characterPaths) {
      try {
        const character = JSON.parse(fs.readFileSync(path, "utf8"));

        validateCharacterConfig(character);

        loadedCharacters.push(character);
      } catch (e) {
        console.error(`Error loading character from ${path}: ${e}`);
        // don't continue to load if a specified file is not found
        process.exit(1);
      }
    }
  }

  return loadedCharacters;
}

export function getTokenForProvider(
  provider: ModelProviderName,
  character: Character
): string | undefined {
  switch (provider) {
      // no key needed for llama_local, ollama, lmstudio, gaianet or bedrock
      case ModelProviderName.LLAMALOCAL:
          return "";
      case ModelProviderName.OLLAMA:
          return "";
      case ModelProviderName.LMSTUDIO:
          return "";
      case ModelProviderName.GAIANET:
          return "";
      case ModelProviderName.BEDROCK:
          return "";
      case ModelProviderName.OPENAI:
          return (
              character.settings?.secrets?.OPENAI_API_KEY ||
              settings.OPENAI_API_KEY
          );
      case ModelProviderName.ETERNALAI:
          return (
              character.settings?.secrets?.ETERNALAI_API_KEY ||
              settings.ETERNALAI_API_KEY
          );
      case ModelProviderName.NINETEEN_AI:
          return (
              character.settings?.secrets?.NINETEEN_AI_API_KEY ||
              settings.NINETEEN_AI_API_KEY
          );
      case ModelProviderName.LLAMACLOUD:
      case ModelProviderName.TOGETHER:
          return (
              character.settings?.secrets?.LLAMACLOUD_API_KEY ||
              settings.LLAMACLOUD_API_KEY ||
              character.settings?.secrets?.TOGETHER_API_KEY ||
              settings.TOGETHER_API_KEY ||
              character.settings?.secrets?.OPENAI_API_KEY ||
              settings.OPENAI_API_KEY
          );
      case ModelProviderName.CLAUDE_VERTEX:
      case ModelProviderName.ANTHROPIC:
          return (
              character.settings?.secrets?.ANTHROPIC_API_KEY ||
              character.settings?.secrets?.CLAUDE_API_KEY ||
              settings.ANTHROPIC_API_KEY ||
              settings.CLAUDE_API_KEY
          );
      case ModelProviderName.REDPILL:
          return (
              character.settings?.secrets?.REDPILL_API_KEY ||
              settings.REDPILL_API_KEY
          );
      case ModelProviderName.OPENROUTER:
          return (
              character.settings?.secrets?.OPENROUTER_API_KEY ||
              settings.OPENROUTER_API_KEY
          );
      case ModelProviderName.GROK:
          return (
              character.settings?.secrets?.GROK_API_KEY ||
              settings.GROK_API_KEY
          );
      case ModelProviderName.HEURIST:
          return (
              character.settings?.secrets?.HEURIST_API_KEY ||
              settings.HEURIST_API_KEY
          );
      case ModelProviderName.GROQ:
          return (
              character.settings?.secrets?.GROQ_API_KEY ||
              settings.GROQ_API_KEY
          );
      case ModelProviderName.GALADRIEL:
          return (
              character.settings?.secrets?.GALADRIEL_API_KEY ||
              settings.GALADRIEL_API_KEY
          );
      case ModelProviderName.FAL:
          return (
              character.settings?.secrets?.FAL_API_KEY || settings.FAL_API_KEY
          );
      case ModelProviderName.ALI_BAILIAN:
          return (
              character.settings?.secrets?.ALI_BAILIAN_API_KEY ||
              settings.ALI_BAILIAN_API_KEY
          );
      case ModelProviderName.VOLENGINE:
          return (
              character.settings?.secrets?.VOLENGINE_API_KEY ||
              settings.VOLENGINE_API_KEY
          );
      case ModelProviderName.NANOGPT:
          return (
              character.settings?.secrets?.NANOGPT_API_KEY ||
              settings.NANOGPT_API_KEY
          );
      case ModelProviderName.HYPERBOLIC:
          return (
              character.settings?.secrets?.HYPERBOLIC_API_KEY ||
              settings.HYPERBOLIC_API_KEY
          );

      case ModelProviderName.VENICE:
          return (
              character.settings?.secrets?.VENICE_API_KEY ||
              settings.VENICE_API_KEY
          );
      case ModelProviderName.ATOMA:
          return (
              character.settings?.secrets?.ATOMASDK_BEARER_AUTH ||
              settings.ATOMASDK_BEARER_AUTH
          );
      case ModelProviderName.NVIDIA:
          return (
              character.settings?.secrets?.NVIDIA_API_KEY ||
              settings.NVIDIA_API_KEY
          );
      case ModelProviderName.AKASH_CHAT_API:
          return (
              character.settings?.secrets?.AKASH_CHAT_API_KEY ||
              settings.AKASH_CHAT_API_KEY
          );
      case ModelProviderName.GOOGLE:
          return (
              character.settings?.secrets?.GOOGLE_GENERATIVE_AI_API_KEY ||
              settings.GOOGLE_GENERATIVE_AI_API_KEY
          );
      case ModelProviderName.MISTRAL:
          return (
              character.settings?.secrets?.MISTRAL_API_KEY ||
              settings.MISTRAL_API_KEY
          );
      case ModelProviderName.LETZAI:
          return (
              character.settings?.secrets?.LETZAI_API_KEY ||
              settings.LETZAI_API_KEY
          );
      case ModelProviderName.INFERA:
          return (
              character.settings?.secrets?.INFERA_API_KEY ||
              settings.INFERA_API_KEY
          );
      case ModelProviderName.DEEPSEEK:
          return (
              character.settings?.secrets?.DEEPSEEK_API_KEY ||
              settings.DEEPSEEK_API_KEY
          );
      case ModelProviderName.LIVEPEER:
          return (
              character.settings?.secrets?.LIVEPEER_GATEWAY_URL ||
              settings.LIVEPEER_GATEWAY_URL
          );
      default:
          const errorMessage = `Failed to get token - unsupported model provider: ${provider}`;
          elizaLogger.error(errorMessage);
          throw new Error(errorMessage);
  }
}
