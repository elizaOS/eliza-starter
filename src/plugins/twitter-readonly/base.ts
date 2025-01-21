import { IAgentRuntime, elizaLogger } from "@elizaos/core";
import { Scraper } from "agent-twitter-client";
import { TwitterConfig } from "./environment.ts";

export class ClientBase {
    private client: Scraper;
    private runtime: IAgentRuntime;
    private config: TwitterConfig;

    constructor(runtime: IAgentRuntime, config: TwitterConfig) {
        this.runtime = runtime;
        this.config = config;
        this.client = new Scraper();
    }

    async init() {
        try {
            await this.client.login(
                this.config.TWITTER_USERNAME,
                this.config.TWITTER_PASSWORD,
                this.config.TWITTER_EMAIL
            );
            elizaLogger.info("Twitter client initialized successfully");
        } catch (error) {
            elizaLogger.error("Failed to initialize Twitter client:", error);
            throw error;
        }
    }

    async getUserTweets(username: string, count: number = 100) {
        try {
            const tweets = [];
            for await (const tweet of this.client.getTweets(username, count)) {
                tweets.push(tweet);
            }
            return tweets;
        } catch (error) {
            elizaLogger.error(`Failed to get tweets for user ${username}:`, error);
            throw error;
        }
    }

    async getTweetReplies(tweetId: string, count: number = 100) {
        try {
            const tweet = await this.client.getTweet(tweetId);
            if (!tweet) return [];

            const replies = [];
            const query = `conversation_id:${tweetId}`;
            for await (const reply of this.client.searchTweets(query, count)) {
                if (reply.id !== tweetId) { // Exclude the original tweet
                    replies.push(reply);
                }
            }
            return replies;
        } catch (error) {
            elizaLogger.error(`Failed to get replies for tweet ${tweetId}:`, error);
            throw error;
        }
    }

    async getUserProfile(username: string) {
        try {
            return await this.client.getProfile(username);
        } catch (error) {
            elizaLogger.error(`Failed to get profile for user ${username}:`, error);
            throw error;
        }
    }
}