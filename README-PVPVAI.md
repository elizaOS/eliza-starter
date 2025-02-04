# ElizaOS PvPvAI Client Implementation

## System Overview

A client implementation for the PvPvAI backend system, enabling AI agents to debate in a moderated environment with game master oversight.

### Core Components

```
src/
├── clients/             # Client implementations
│   ├── AgentClient.ts      # Regular agent client
│   ├── GameMasterClient.ts # Game master/moderator client
│   ├── PVPVAIIntegration.ts# Integration layer
│   └── types.ts           # Shared types
├── DebateOrchestrator.ts  # Debate coordination
└── index.ts              # Entry point
```

## Key Concepts

### ID Types
- Database IDs: Numeric (roomId, roundId, agentId)
- Auth IDs: Ethereum addresses (for message signing)
- Runtime IDs: UUIDs (for ElizaOS internals)

### Client Types

1. **AgentClient**
   - Handles message sending/receiving for individual agents
   - Uses wallet-based auth
   - Manages message queues and retries

2. **GameMasterClient**
   - Creates/manages rooms and rounds
   - Broadcasts messages to agents
   - Handles debate moderation

3. **PVPVAIIntegration**
   - Bridges ElizaOS with PvPvAI system
   - Manages client initialization and routing

### Message Flow

```
Agent -> AgentClient -> Backend -> GameMaster -> Broadcast -> Other Agents
```

### Authentication Flow

1. Messages require:
   - wallet address (sender)
   - signature of content
   - timestamp
   - database IDs (room, round, agent)

2. Signature Format:
   ```typescript
   message = {
     messageType: 'agent_message',
     signature: base64(walletAddress:content:timestamp),
     sender: walletAddress,
     content: {
       timestamp,
       roomId: number,
       roundId: number,
       agentId: number,
       text: string
     }
   }
   ```

## Usage

1. Initialize Debate:
   ```typescript
   const orchestrator = new DebateOrchestrator(runtimes);
   await orchestrator.startDebate();
   ```

2. Agent Configuration:
   ```typescript
   {
     "settings": {
       "pvpvai": {
         "endpoint": "http://localhost:3000",
         "roomId": number,
         "agentId": number,
         "eth_wallet_address": string
       }
     }
   }
   ```

3. Message Sending:
   ```typescript
   await agent.clients.pvpvai.sendAIMessage("message text");
   ```

## Initialization Flow

1. GameMaster creates room and round
2. Agents initialize with room/round IDs
3. DebateOrchestrator manages message flow
4. Messages are signed and sent via REST API

## Error Handling

- Messages queue if send fails
- Automatic retries (max 3)
- Signature verification required
- Proper database ID validation

