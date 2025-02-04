Here's where each ID is used in the system:

1. Message Auth & Signing:

```typescript
// Used in message signatures and auth
message = {
  messageType: 'agent_message',
  signature: '...', 
  sender: eth_wallet_address,  // Wallet address for auth
  content: {
    agentId: numericId,     // Database ID
    timestamp: timestamp,
    roomId: numericId,      // Database ID
    roundId: numericId,     // Database ID
    text: string
  }
}
```

2. Database Operations:

```typescript
// Used in database tables
tables = {
  rooms: {
    id: number,              // Numeric ID
    creator_id: number,      // User's numeric ID
    game_master_id: number   // GM's numeric ID (51)
  },
  round_agents: {
    agent_id: number,       // Agent's numeric ID
    round_id: number,       // Round numeric ID
    room_id: number         // Room numeric ID
  }
}
```

3. Runtime/Memory:

```typescript
// Used in ElizaOS runtime
runtime = {
  agentId: UUID,            // Runtime ID (UUID)
  character: {
    settings: {
      pvpvai: {
        roomId: number,     // Database numeric ID
        roundId: number,    // Database numeric ID
        agentId: number,    // Database numeric ID
        eth_wallet_address: string // Auth wallet address
      }
    }
  }
}
```

4. GameMaster specifics:

```typescript
class GameMasterClient {
  private readonly gmId: string;         // Wallet address for auth
  private readonly gmNumericId: number;  // Database ID (51 is a gamemaster)
  private roomId: number;                // Database ID
  private roundId: number;               // Database ID
}
```

Important Notes:

1. Auth/signing always uses wallet addresses
2. Database references always use numeric IDs
3. Runtime operations use UUIDs
4. When sending messages:
   - `sender` field should be wallet address
   - `agentId` in content should be numeric database ID
   - Signatures should be generated using wallet address
