import { z } from 'zod';
import { PvpActionCategories, PvpActions } from '../types/pvp.ts';
import { WsMessageTypes } from '../types/ws.ts';

export const baseMessageSchema = z.object({
  messageType: z.nativeEnum(WsMessageTypes),
  timestamp: z.number(),
  signature: z.string(),
  sender: z.string(),
  content: z.any()
});

export const gmMessageSchema = baseMessageSchema.extend({
  content: z.object({
    text: z.string(),
    targets: z.array(z.number())
  })
});

/*
  SUBSCRIBE ROOM MESSAGES SCHEMA:
  Sent by:
    - WS: Users on room load over WS
  Received by: 
    - Single user: subscribeRoomOutputMessageSchema
  Supported by:
    - WS exclusive
  Purpose: Gives the user the number of participants in the room
*/
export const subscribeRoomInputMessageSchema = z.object({
  messageType: z.literal(WsMessageTypes.SUBSCRIBE_ROOM),
  content: z.object({
    roomId: z.number(),
  }),
});

export const subscribeRoomOutputMessageSchema = subscribeRoomInputMessageSchema; //Passthrough

/*
  HEARTBEAT MESSAGES SCHEMA:
  Sent by:
    - WS: Users send this in response to a heartbeat message from the server
  Received by: 
    - Single user: heartbeatOutputMessageSchema
  Supported by:
    - WS exclusive
  Purpose: Keeps the user's connection alive
*/
export const heartbeatInputMessageSchema = z.object({
  messageType: z.literal(WsMessageTypes.HEARTBEAT),
  content: z.object({}),
});

export const heartbeatOutputMessageSchema = heartbeatInputMessageSchema; //Passthrough

/* 
  OBSERVATION MESSAGES SCHEMA:
  Sent by: Oracle agents
  Received by: 
    - Agents: observationMessageAgentOutputSchema
    - Users (AI Chat): observationMessageAiChatOutputSchema
  Supported by:
    - REST: POST /messages/observations
    - (TODO Not currently supported by WS)

  Purpose: Provide data from external sources to agents to help inform their decisions
*/
export enum ObservationType {
  WALLET_BALANCES = 'wallet-balances',
  PRICE_DATA = 'price-data',
  GAME_EVENT = 'game-event',
}

export const observationMessageInputSchema = z.object({
  messageType: z.literal('observation'),
  signature: z.string(),
  sender: z.string(),
  content: z.object({
    agentId: z.number().int().positive(), //The agent who sent the message
    timestamp: z.number(),
    roomId: z.number(), // Redundant with path, but kept here since this message is passthrough to AI Chat for frontend.
    roundId: z.number(),
    observationType: z.nativeEnum(ObservationType),
    data: z.any(), // TODO Tighten up this type later
  }),
});

// Only difference between input and output is that the output message will be signed by GM
export const observationMessageAgentOutputSchema = observationMessageInputSchema; // Message sent to agents
export const observationMessageAiChatOutputSchema = observationMessageInputSchema; // Message sent to player facing AI Chat

/*
  PUBLIC CHAT MESSAGES SCHEMA:
  Sent by: 
    - Users
  Received by: 
    - Users: publicChatMessageOutputSchema
  Supported by:
    - WS
  Purpose: Allow users to send messages to all participants in a room, rendered in Public Chat control
*/
export const publicChatMessageInputSchema = z.object({
  messageType: z.literal('public_chat'),
  signature: z.string(),
  sender: z.string(),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    userId: z.number(),
    text: z.string(),
  }),
});
export const publicChatMessageOutputSchema = publicChatMessageInputSchema; //Passthrough

/* 
--- AGENT MESSAGES SCHEMA ---
  Sent by: 
    - Agents
  Supported by:
    - REST (POST /messages/agentMessage)
  Received by: 
    - Agents: agentMessageAgentOutputSchema
    - Users (AI Chat): agentMessageAiChatOutputSchema
  Note: PvP rules applied on message sent to agents, additional details sent to users in AI Chat
  Purpose: Messages from agents to the room and other agents.
*/
export const agentMessageInputSchema = z.object({
  messageType: z.literal(WsMessageTypes.AGENT_MESSAGE),
  signature: z.string(), // GM receives message signed by agent
  sender: z.string(),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    agentId: z.number(),
    text: z.string(),
  }),
});

// Message sent to agents, only difference between input and output message is that the output message's signature will be from the GM
export const agentMessageAgentOutputSchema = agentMessageInputSchema;
// Message sent to AI Chat (players) includes PvP details
export const agentMessageAiChatOutputSchema = z.object({
  messageType: z.literal(WsMessageTypes.AGENT_MESSAGE),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    senderId: z.number(),
    originalMessage: agentMessageInputSchema,
    originalTargets: z.array(z.number()),
    postPvpMessages: z.record(z.string(), agentMessageAgentOutputSchema),
    pvpStatusEffects: z.record(z.string(), z.array(z.any())), //TODO replace with actual PvP status effect schema
  }),
});

/*
  SYSTEM NOTIFICATION SCHEMA:
  Sent by: 
    - Nobody
  Received by: 
    - Single User: systemNotificationOutputSchema
    - Single Agent: systemNotificationOutputSchema
  Supported by:
    - WS exclusive
  Purpose: Informs a user or agent of a failed action when they invoked the action over WS
  Note: As this cannot be received no input schema is needed.
*/
export const systemNotificationOutputSchema = z.object({
  messageType: z.literal(WsMessageTypes.SYSTEM_NOTIFICATION),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number().optional(),
    roundId: z.number().optional(),
    text: z.string(),
    error: z.boolean(),
    originalMessage: z.any().optional(), // The original message that caused the notification to be sent
  }),
});

/*
  PARTICIPANTS MESSAGES SCHEMA:
  Sent by: 
    - WS: Users on room load over WS
  Received by: 
    - Single user: participantsOutputMessageSchema
    - Users in room: participantsOutputMessageSchema
  Supported by:
    - WS exclusive
  Purpose: Gives the user the number of participants in the room
*/
export const participantsInputMessageSchema = z.object({
  messageType: z.literal(WsMessageTypes.PARTICIPANTS),
  content: z.object({
    roomId: z.number().int().positive(),
  }),
});

export const participantsOutputMessageSchema = z.object({
  messageType: z.literal(WsMessageTypes.PARTICIPANTS),
  content: z.object({
    timestamp: z.number().int().positive(),
    roomId: z.number().int().positive(),
    count: z.number().int().nonnegative(),
  }),
});

/*
  GM MESSAGES SCHEMA:
  Sent by:
    - GM over ???
  Received by:
    - One or more agents: gmMessageAgentOutputSchema
    - All users in the room: gmMessageAiChatOutputSchema
  Purpose: Sent when the GM wants to send a message to all agents or all users in the room
*/
export const gmMessageInputSchema = z.object({
  messageType: z.literal(WsMessageTypes.GM_MESSAGE),
  signature: z.string(),
  sender: z.string(),
  content: z.object({
    gmId: z.number(),
    timestamp: z.number(),
    targets: z.array(z.number()), // List of agent ids to send the message to
    roomId: z.number(),
    roundId: z.number(),
    message: z.string(),
    deadline: z.number().optional(), // Time in which the Agent must respond to the GM message before slashing/kicking
    additionalData: z.record(z.string(), z.any()).optional(),
    ignoreErrors: z.boolean().optional().default(false), // There are a few checks that a GM can ignore, like if the round is open or not, in case of emergency
  }),
});
export const gmMessageAgentOutputSchema = gmMessageInputSchema; // GM messages are passthrough to agents
export const gmMessageAiChatOutputSchema = gmMessageInputSchema; // GM messages are passthrough to AI Chat

/*
  PVP_ACTION_ENACTED MESSAGES SCHEMA:
  Sent by:
  - WS: Backend
  Received by:
  - Users in the room: aiChatPvpActionEnactedOutputSchema
  - (TODO Agents with the clairvoyance buff)
  Purpose: Sent when the Backend (or GM?) performs a direct action on an agent or applies a status effect to an agent
  Note:
  - After the user has finished their wallet interaction, they may eagerly send a message to the backend saying they placed the transaction.
  - The backend can then echo the message to that user individually so the user gets early feedback when they took an action
 */
const durationOptionsSchema = z.union([z.literal(5), z.literal(10), z.literal(30)]);

// Create schemas for each PvP action type
const amnesiaActionSchema = z.object({
  actionType: z.literal(PvpActions.AMNESIA),
  actionCategory: z.literal(PvpActionCategories.DIRECT_ACTION),
  parameters: z.object({
    target: z.number(),
  }),
});

const attackActionSchema = z.object({
  actionType: z.literal(PvpActions.ATTACK),
  actionCategory: z.literal(PvpActionCategories.DIRECT_ACTION),
  parameters: z.object({
    target: z.number(),
    message: z.string(),
  }),
});

const deceiveStatusSchema = z.object({
  actionType: z.literal(PvpActions.DECEIVE),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.number(),
    duration: durationOptionsSchema,
    newPersona: z.string(),
  }),
});

const blindStatusSchema = z.object({
  actionType: z.literal(PvpActions.BLIND),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.number(),
    duration: durationOptionsSchema,
  }),
});

const silenceStatusSchema = z.object({
  actionType: z.literal(PvpActions.SILENCE),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.number(),
    duration: durationOptionsSchema,
  }),
});

const deafenStatusSchema = z.object({
  actionType: z.literal(PvpActions.DEAFEN),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.number(),
    duration: durationOptionsSchema,
  }),
});

const poisonStatusSchema = z.object({
  actionType: z.literal(PvpActions.POISON),
  actionCategory: z.literal(PvpActionCategories.STATUS_EFFECT),
  parameters: z.object({
    target: z.number(),
    duration: durationOptionsSchema,
    find: z.string(),
    replace: z.string(),
    case_sensitive: z.boolean(),
  }),
});

// Combine all action schemas
const pvpActionSchema = z.discriminatedUnion('actionType', [
  amnesiaActionSchema,
  attackActionSchema,
  deceiveStatusSchema,
  blindStatusSchema,
  silenceStatusSchema,
  deafenStatusSchema,
  poisonStatusSchema,
]);

export type PvpAttackActionType = z.infer<typeof attackActionSchema>;
export type PvpDeceiveStatusType = z.infer<typeof deceiveStatusSchema>;
export type PvpBlindStatusType = z.infer<typeof blindStatusSchema>;
export type PvpSilenceStatusType = z.infer<typeof silenceStatusSchema>;
export type PvpDeafenStatusType = z.infer<typeof deafenStatusSchema>;
export type PvpPoisonStatusType = z.infer<typeof poisonStatusSchema>;
export type PvpAmnesiaActionType = z.infer<typeof amnesiaActionSchema>;

export type PvpAllPvpActionsType = z.infer<typeof pvpActionSchema>;

// Update the pvpActionEnactedAiChatOutputSchema
export const pvpActionEnactedAiChatOutputSchema = z.object({
  messageType: z.literal(WsMessageTypes.PVP_ACTION_ENACTED),
  signature: z.string(),
  sender: z.string(),
  content: z.object({
    timestamp: z.number(),
    roomId: z.number(),
    roundId: z.number(),
    instigator: z.number(),
    instigatorAddress: z.string(),
    txHash: z.string(),
    fee: z.number().optional(),
    action: pvpActionSchema,
  }),
});

// Response to every POST request to /messages
export const messagesRestResponseSchema = z.object({
  message: z.string().optional(),
  data: z.any().optional(),
  error: z.string().optional(),
});

export type AllOutputSchemaTypes =
  | z.infer<typeof publicChatMessageOutputSchema>
  | z.infer<typeof participantsOutputMessageSchema>
  | z.infer<typeof systemNotificationOutputSchema>
  | z.infer<typeof agentMessageAiChatOutputSchema>;

// All types of messages that the backend can receive
export type AllInputSchemaTypes =
  | z.infer<typeof observationMessageInputSchema>
  | z.infer<typeof agentMessageInputSchema>
  | z.infer<typeof publicChatMessageInputSchema>
  | z.infer<typeof participantsInputMessageSchema>
  | z.infer<typeof gmMessageInputSchema>
  | z.infer<typeof heartbeatInputMessageSchema>
  | z.infer<typeof subscribeRoomInputMessageSchema>;

// All types of messages that will be sent to/received by agents
export type AllAgentChatMessageSchemaTypes =
  | z.infer<typeof observationMessageAgentOutputSchema>
  | z.infer<typeof agentMessageAgentOutputSchema>
  | z.infer<typeof gmMessageAgentOutputSchema>;
//TODO GM message type will go here;

// All types of messages that will be sent to/received by users to render in AI Chat
export type AllAiChatMessageSchemaTypes =
  | z.infer<typeof observationMessageAiChatOutputSchema>
  | z.infer<typeof agentMessageAiChatOutputSchema>
  | z.infer<typeof gmMessageAiChatOutputSchema>
  | z.infer<typeof pvpActionEnactedAiChatOutputSchema>;
// Common schemas
export const validEthereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const signatureSchema = z.string();
export const timestampSchema = z.number().int().positive();

// Room related schemas
export const roomConfigSchema = z.object({
  round_duration: z.number().int().positive(),
  pvp_config: z.object({
    enabled: z.boolean(),
    enabled_rules: z.array(z.string()),
  }),
});

export const agentConfigSchema = z.object({
  // wallet: walletAddressSchema,
  webhook: z.string().url(),

});

export const roomSetupContentSchema = z.object({
    timestamp: z.number(),
    name: z.string().min(1),
    room_type: z.string(),
    color: z
      .string()
      .optional()
      .default('#' + Math.floor(Math.random() * 16777215).toString(16)),
    image_url: z.string().url().optional().default('https://avatar.iran.liara.run/public'), 
    token: validEthereumAddressSchema,
    token_webhook: z.string().url(),
    agents: z.array(z.number()),
    // agents: z.record(z.string(), agentConfigSchema),
    gm: z.number(),
    chain_id: z.number(),
    chain_family: z.string(),
    room_config: roomConfigSchema,
    transaction_hash: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/)
      .optional(),
  })

export const roomSetupSchema = z.object({
  messageType: z.literal(WsMessageTypes.CREATE_ROOM),
  sender: validEthereumAddressSchema,
  signature: signatureSchema,
  content: roomSetupContentSchema,
});

export const agentAddSchema = z.object({
  agent_id: z.number().int().positive(),
  wallet_address: z.string(),
  wallet_json: z.any(),
});

export const agentBulkAddSchema = z.object({
  agents: z.array(
    z.object({
      id: z.number().int().positive(),
      walletAddress: z.string(),
    })
  ),
});

// Round related schemas
// export const roundMessageSchema = z.object({
//   agent_id: z.number().int().positive(),
//   timestamp: timestampSchema,
//   signature: signatureSchema,
//   content: z.object({
//     text: z.union([
//       z.string(),
//       z.object({
//         text: z.string(),
//       }),
//     ]),
//   }),
// });

// Add this schema for authenticated messages
export const authenticatedMessageSchema = z.object({
  timestamp: z.number(),
  signature: z.string(),
  sender: z.string(),
});

// Add the agent message input schema
export const roundMessageInputSchema = authenticatedMessageSchema.extend({
  type: z.literal(WsMessageTypes.AGENT_MESSAGE),
  content: z.object({
    agentId: z.number().int().positive(),
    roundId: z.number().int().positive(),
    text: z.string(),
  }),
});

// Update the interface to use the schema type

export const roundOutcomeSchema = z.object({
  reason: z.string().optional(),
  timestamp: z.string().datetime(),
  data: z.record(z.any()).optional(),
});

export const endRoundSchema = z.object({
  outcome: roundOutcomeSchema.optional(),
});

export const kickParticipantSchema = z.object({
  agentId: z.number().int().positive(),
});

// Export types generated from schemas
export type RoomAgentAdd = z.infer<typeof agentAddSchema>;
export type RoomAgentBulkAdd = z.infer<typeof agentBulkAddSchema>;
export type RoundMessage = z.infer<typeof roundMessageInputSchema>;
export type RoundOutcome = z.infer<typeof roundOutcomeSchema>;
export type KickParticipant = z.infer<typeof kickParticipantSchema>;
