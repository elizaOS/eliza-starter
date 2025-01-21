export interface CleanTweet {
    id: string;
    text: string;
    createdAt?: string;
    authorId?: string;
    authorName?: string;
    authorUsername?: string;
    metrics?: {
        likes?: number;
        retweets?: number;
        replies?: number;
        views?: number;
    };
    replies?: CleanTweet[]; // Add replies to the tweet structure
}

export interface CleanProfile {
    id: string;
    username: string;
    name: string;
    description?: string;
    followersCount?: number;
    followingCount?: number;
    tweetsCount?: number;
    verified?: boolean;
}

export interface ScraperState {
    lastScrapedTweets: Record<string, string>; // username -> last tweet ID
    lastUpdated: number;
}