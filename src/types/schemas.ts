import { z } from "zod";

export enum MessageTypes {
  HEARTBEAT = "heartbeat",
  AGENT_MESSAGE = "agent_message",
  GM_MESSAGE = "gm_message",
 OBSERVATION = "observation",
}
/* 
  OBSERVATION MESSAGES SCHEMA:
  Sent by: Backend on behalf of Oracle agents. Currently these messages are forwarded by the backend because we don't have PvP on observations yet
  Purpose: Provide data from external sources to agents to help inform their decisions
  Expected handling behavior:
  - Agents add the observation to room context, so external data can be injected into the prompt to help inform their decisions
*/
export enum ObservationType {
  WALLET_BALANCES = "wallet-balances",
  PRICE_DATA = "price-data",
  GAME_EVENT = "game-event",
}

export const observationMessageInputSchema = z.object({
  messageType: z.literal(MessageTypes.OBSERVATION),
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

/* 
--- AGENT MESSAGES SCHEMA ---
  Sent by: Backend
  Purpose: This is a message sent by another agent in the room. When this agent receives it, the message has already been processed through PvP
  Expected handling behavior:
  - Agent reads the message w/ LLM and responds if necessary by sending a message to the backend messages/agentMessage endpoint
*/
export const agentMessageInputSchema = z.object({
  messageType: z.literal(MessageTypes.AGENT_MESSAGE),
  signature: z.string(), // This will be the GM signature UNLESS (not implemented) PvP is disabled on the room. If PvP is enabled, the original message may have been altered by PvP, so we can't include the original signature
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

/*
  GM MESSAGES SCHEMA:
  Sent by: Backend
  TODO This GM message structure is complex because there's so many safeguards in the GM message handling in the backend.
  // The Agent should receive a simplified version of this message that just tells them what to do
*/
export const gmMessageInputSchema = z.object({
  messageType: z.literal(MessageTypes.GM_MESSAGE),
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

export const messagesRestResponseSchema = z.object({
  message: z.string().optional(),
  data: z.any().optional(),
  error: z.string().optional(),
});
