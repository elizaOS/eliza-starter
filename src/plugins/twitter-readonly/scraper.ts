import { IAgentRuntime, elizaLogger, stringToUuid } from "@elizaos/core";
import { ClientBase } from "./base.ts";
import { CleanProfile, CleanTweet, ScraperState } from "./types.ts";

export class TwitterScraper {
    private client: ClientBase;
    private runtime: IAgentRuntime;
    private scrapeInterval: number;
    private targetAccounts: string[];
    private isRunning: boolean = false;
    private lastScrapedTweets: Map<string, string> = new Map(); // username -> last tweet ID
    private readonly stateId = "twitter-scraper-state";

    constructor(client: ClientBase, runtime: IAgentRuntime, scrapeInterval: number, targetAccounts: string[]) {
        this.client = client;
        this.runtime = runtime;
        this.scrapeInterval = scrapeInterval;
        this.targetAccounts = targetAccounts;
    }

    async start() {
        if (this.isRunning) {
            elizaLogger.warn("Twitter scraper is already running");
            return;
        }

        this.isRunning = true;
        elizaLogger.warn("Twitter scraper started");

        // Load persisted state first
        await this.loadState();
        // Then initialize any missing tweets from knowledge base
        await this.initializeLastScrapedTweets();

        await this.scrapeData();

        // Set up periodic scraping
        setInterval(() => {
            this.scrapeData().catch(error => {
                elizaLogger.error("Error during periodic scrape:", error);
            });
        }, this.scrapeInterval);
    }

    private async loadState() {
        try {
            const state = await this.runtime.ragKnowledgeManager.getKnowledge({
                id: stringToUuid(this.stateId),
            });

            if (state.length > 0) {
                const scraperState = JSON.parse(state[0].content.text) as ScraperState;
                // Convert record to Map
                Object.entries(scraperState.lastScrapedTweets).forEach(([username, tweetId]) => {
                    this.lastScrapedTweets.set(username, tweetId);
                });
                elizaLogger.info("Loaded persisted scraper state");
            }
        } catch (error) {
            elizaLogger.error("Failed to load scraper state:", error);
        }
    }

    private async saveState() {
        try {
            // Convert Map to record for JSON serialization
            const state: ScraperState = {
                lastScrapedTweets: Object.fromEntries(this.lastScrapedTweets),
                lastUpdated: Date.now()
            };

            await this.storeKnowledge(this.stateId, JSON.stringify(state, null, 2));
            elizaLogger.info("Saved scraper state");
        } catch (error) {
            elizaLogger.error("Failed to save scraper state:", error);
        }
    }

    private async initializeLastScrapedTweets() {
        for (const username of this.targetAccounts) {
            // Skip if we already have this username's state
            if (this.lastScrapedTweets.has(username)) {
                continue;
            }

            try {
                const existingTweets = await this.runtime.ragKnowledgeManager.getKnowledge({
                    id: stringToUuid(`${username}-tweets`),
                });

                if (existingTweets.length > 0) {
                    const tweets = JSON.parse(existingTweets[0].content.text) as CleanTweet[];
                    if (tweets.length > 0) {
                        // Store the most recent tweet ID
                        this.lastScrapedTweets.set(username, tweets[0].id);
                        elizaLogger.info(`Initialized last tweet ID for ${username}: ${tweets[0].id}`);
                    }
                }
            } catch (error) {
                elizaLogger.error(`Failed to initialize last tweet for ${username}:`, error);
            }
        }
    }

    private cleanProfile(profile: any): CleanProfile {
        return {
            id: profile.id || profile.rest_id,
            username: profile.screenName || profile.screen_name,
            name: profile.name,
            description: profile.description,
            followersCount: profile.followersCount || profile.followers_count,
            followingCount: profile.friendsCount || profile.friends_count,
            tweetsCount: profile.statusesCount || profile.statuses_count,
            verified: profile.verified,
        };
    }

    private cleanTweet(tweet: any): CleanTweet {
        const legacy = tweet.legacy || tweet;
        return {
            id: tweet.id || tweet.rest_id,
            text: legacy.full_text || tweet.text || legacy.text,
            createdAt: tweet.createdAt || legacy.created_at,
            authorId: tweet.authorId || legacy.user_id_str,
            authorName: tweet.authorName || legacy.user?.name,
            authorUsername: tweet.authorUsername || legacy.user?.screen_name,
            metrics: {
                likes: legacy.favorite_count || legacy.favourites_count,
                retweets: legacy.retweet_count,
                replies: legacy.reply_count,
                views: legacy.view_count,
            },
        };
    }

    private async scrapeData() {
        for (const username of this.targetAccounts) {
            try {
                // Get user profile (always update as it changes frequently)
                const profile = await this.client.getUserProfile(username);
                const cleanedProfile = this.cleanProfile(profile);
                await this.storeKnowledge(`${username}-profile`, JSON.stringify(cleanedProfile, null, 2));

                elizaLogger.info(`Scraped profile for ${username}`);

                // Get user tweets
                const tweets = await this.client.getUserTweets(username);
                const lastScrapedId = this.lastScrapedTweets.get(username);

                // Filter only new tweets
                const newTweets = lastScrapedId
                    ? tweets.filter(tweet => tweet.id > lastScrapedId)
                    : tweets;

                if (newTweets.length === 0) {
                    elizaLogger.info(`No new tweets for ${username}`);
                    continue;
                }

                // Process each tweet individually
                for (const tweet of newTweets) {
                    elizaLogger.info(`Scraping tweet`, tweet);
                    const cleanedTweet = this.cleanTweet(tweet);

                    // Get replies for this tweet
                    const replies = await this.client.getTweetReplies(tweet.id);
                    if (replies.length > 0) {
                        cleanedTweet.replies = replies.map(reply => this.cleanTweet(reply));
                    }

                    // Store each tweet as a separate document
                    await this.storeKnowledge(
                        `tweet-${tweet.id}`,
                        JSON.stringify(cleanedTweet, null, 2)
                    );
                    elizaLogger.info(`Stored tweet ${tweet.id} with ${cleanedTweet.replies?.length || 0} replies`);
                }

                // Update last scraped ID
                if (newTweets.length > 0) {
                    this.lastScrapedTweets.set(username, newTweets[0].id);
                    await this.saveState();
                    elizaLogger.info(`Updated last tweet ID for ${username}: ${newTweets[0].id}`);
                }

                elizaLogger.info(`Successfully scraped data for ${username}`);
            } catch (error) {
                elizaLogger.error(`Failed to scrape data for ${username}:`, error);
            }
        }
    }

    private async storeKnowledge(id: string, content: string) {
        try {
            await this.runtime.ragKnowledgeManager.createKnowledge({
                id: stringToUuid(id),
                agentId: this.runtime.agentId,
                content: {
                    text: content,
                    metadata: {
                        source: "twitter-readonly",
                        type: "json",
                        createdAt: Date.now(),
                        isShared: true
                    },
                },
            });
        } catch (error) {
            elizaLogger.error(`Failed to store knowledge for ${id}:`, error);
            throw error;
        }
    }
}