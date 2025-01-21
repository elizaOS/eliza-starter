import { Client, elizaLogger, IAgentRuntime, Plugin } from "@elizaos/core";
import { ClientBase } from "./base.ts";
import { validateTwitterConfig, TwitterConfig } from "./environment.ts";
import { TwitterScraper } from "./scraper.ts";

class TwitterManager {
    client: ClientBase;
    scraper: TwitterScraper;

    constructor(runtime: IAgentRuntime, config: TwitterConfig) {
        this.client = new ClientBase(runtime, config);
        this.scraper = new TwitterScraper(
            this.client,
            runtime,
            config.TWITTER_SCRAPE_INTERVAL,
            config.TWITTER_TARGET_ACCOUNTS
        );
    }
}

const TwitterReadonlyClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        const twitterConfig = await validateTwitterConfig(runtime);

        if (!twitterConfig.TWITTER_TARGET_ACCOUNTS.length) {
            elizaLogger.warn("No target accounts specified for Twitter Readonly client");
            return;
        }

        elizaLogger.log("Twitter Readonly client started");
        elizaLogger.log(`Target accounts: ${twitterConfig.TWITTER_TARGET_ACCOUNTS.join(", ")}`);

        const manager = new TwitterManager(runtime, twitterConfig);

        // Initialize login/session
        await manager.client.init();

        // Start the scraping process
        await manager.scraper.start();

        return manager;
    },

    async stop(_runtime: IAgentRuntime) {
        elizaLogger.warn("Twitter Readonly client does not support stopping yet");
    },
};

export const twitterReadonlyPlugin: Plugin = {
    name: "twitter-readonly",
    description: "Twitter Readonly client",
    clients: [TwitterReadonlyClientInterface],
};
