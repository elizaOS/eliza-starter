import { z } from "zod";
import { IAgentRuntime } from "@elizaos/core";

export const TwitterConfig = z.object({
    TWITTER_USERNAME: z.string(),
    TWITTER_PASSWORD: z.string(),
    TWITTER_EMAIL: z.string(),
    TWITTER_COOKIE: z.string().optional().nullable(),
    TWITTER_SCRAPE_INTERVAL: z.number().default(60000), // Default to 1 minute
    TWITTER_TARGET_ACCOUNTS: z.array(z.string()), // List of accounts to scrape
});

export type TwitterConfig = z.infer<typeof TwitterConfig>;

export async function validateTwitterConfig(
    runtime: IAgentRuntime
): Promise<TwitterConfig> {
    const config = {
        TWITTER_USERNAME: runtime.getSetting("TWITTER_USERNAME"),
        TWITTER_PASSWORD: runtime.getSetting("TWITTER_PASSWORD"),
        TWITTER_EMAIL: runtime.getSetting("TWITTER_EMAIL"),
        TWITTER_COOKIE: runtime.getSetting("TWITTER_COOKIE") || undefined,
        TWITTER_SCRAPE_INTERVAL: Number(runtime.getSetting("TWITTER_SCRAPE_INTERVAL") || "60000"),
        TWITTER_TARGET_ACCOUNTS: (runtime.getSetting("TWITTER_TARGET_ACCOUNTS") || "").split(",").filter(Boolean),
    };

    return TwitterConfig.parse(config);
}