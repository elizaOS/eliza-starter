# Eliza

## Edit the character files

Open `src/character.ts` to modify the default character. Uncomment and edit.

### Custom characters

To load custom characters instead:
- Use `pnpm start --characters="path/to/your/character.json"`
- Multiple character files can be loaded simultaneously

### Add clients

```diff
- clients: [],
+ clients: [Clients.TWITTER, Clients.DISCORD],
```

## Duplicate the .env.example template

```bash
cp .env.example .env
```

\* Fill out the .env file with your own values.

### Add login credentials and keys to .env

```diff
-DISCORD_APPLICATION_ID=
-DISCORD_API_TOKEN= # Bot token
+DISCORD_APPLICATION_ID="000000772361146438"
+DISCORD_API_TOKEN="OTk1MTU1NzcyMzYxMT000000.000000.00000000000000000000000000000000"
...
-OPENROUTER_API_KEY=
+OPENROUTER_API_KEY="sk-xx-xx-xxx"
...
-TWITTER_USERNAME= # Account username
-TWITTER_PASSWORD= # Account password
-TWITTER_EMAIL= # Account email
+TWITTER_USERNAME="username"
+TWITTER_PASSWORD="password"
+TWITTER_EMAIL="your@email.com"
```

## Install dependencies and start your agent

```bash
pnpm i && pnpm start
```
Note: this requires node to be at least version 22 when you install packages and run the agent.
