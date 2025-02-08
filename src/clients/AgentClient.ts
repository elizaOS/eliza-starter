import { DirectClient } from "@elizaos/client-direct";
import axios, { AxiosError } from "axios";
import { ethers, Wallet } from "ethers";
import WebSocket from "ws";
import { z } from "zod";
import { supabase } from "../index.ts";
import { Tables } from "../types/database.types.ts";
import {
  agentMessageAgentOutputSchema,
  agentMessageInputSchema,
  MessageTypes,
  observationMessageInputSchema,
} from "../types/schemas.ts";
import { WsMessageTypes } from "../types/ws.ts";
import { SharedWebSocket } from "./shared-websocket.ts";
import { sortObjectKeys } from "./sortObjectKeys.ts";
import { MessageHistoryEntry } from "./types.ts";
import { IAgentRuntime } from "@elizaos/core";

interface RoundResponse {
  // for get active rounds
  success: boolean;
  data?: {
    id: number;
    room_id: number;
    active: boolean;
    [key: string]: any; // For other round fields
  };
  error?: string;
}
type RoundContext = {
  id: number;
  status: string;
  startedAt: number;
  agents: Record<number, Partial<Tables<"agents">>>;
  // agentMessageContext: Record<number, MessageHistoryEntry[]>; // Per-agent message history in case you need to respond to a mention
  roundMessageContext: MessageHistoryEntry[]; // Message history from all agents in the round
  observations: string[];
};

enum Decision {
  BUY = 1,
  HOLD = 2,
  SELL = 3,
}
type RoomChatContext = {
  currentRound: number;
  topic: string;
  chainId: number;
  maxNumObservationsContext: number;
  maxNumAgentMessageContext: number;
  rounds: Record<number, RoundContext>;
  decision?: Decision;
};

export class AgentClient extends DirectClient {
  private readonly wallet: Wallet;
  private readonly walletAddress: string;
  private readonly agentNumericId: number;
  private readonly pvpvaiUrl: string;
  private readonly runtime: IAgentRuntime;
  private isActive: boolean;
  private roomId: number;
  private wsClient: SharedWebSocket; // Change from readonly to mutable
  private context: RoomChatContext;

  // Add PvP status tracking
  private activePvPEffects: Map<string, any> = new Map();

  // Add these properties after the existing private properties
  private messageContext: MessageHistoryEntry[] = [];
  private readonly MAX_CONTEXT_SIZE = 8;

  constructor(
    runtime: IAgentRuntime,
    pvpvaiUrl: string,
    walletAddress: string,
    agentNumericId: number,
    roomId: number, //TODO Room is not dynamic for initial demo. Later agent should track what rooms they are in
    port: number
  ) {
    super();
    this.runtime = runtime;
    this.pvpvaiUrl = pvpvaiUrl;
    this.walletAddress = walletAddress;
    this.agentNumericId = agentNumericId;
    this.isActive = true;

    // Get agent's private key from environment
    const privateKey = process.env[`AGENT_${agentNumericId}_PRIVATE_KEY`];
    if (!privateKey) {
      throw new Error(`Private key not found for agent ${agentNumericId}`);
    }

    this.wallet = new ethers.Wallet(privateKey);
    if (this.wallet.address.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error(`Private key mismatch for agent ${agentNumericId}`);
    }
  }

  public async initializeRoomContext(roomId: number): Promise<void> {
    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    if (roomError) {
      console.error(
        "Error getting room data when initializing room context:",
        roomError
      );
      throw roomError;
    }
    if (!roomData.active) {
      console.error(
        "Room is not active when initializing room context:",
        roomData
      );
      throw new Error("Room not active");
    }

    //Get latest round, don't care if it's active or not. If it's not active, a new round is coming.
    const { data: activeRound, error: activeRoundError } = await supabase
      .from("rounds")
      .select("*, agents(*)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .single();

    if (activeRoundError) {
      if (activeRoundError.code === "PGRST116") {
        console.log(
          "No active round found when initializing room context, assuming new round is coming"
        );
      } else {
        console.error(
          "Error getting active round when initializing room context:",
          activeRoundError
        );
        throw activeRoundError;
      }
    }



    //TODO Load last N observations for the round
    // const {data: observations, error: observationsError} = await supabase
    //   .from("round_observations")
    //   .select("*")
    //   .eq("room_id", roomId)
    //   .order("created_at", { ascending: false });

    //TODO right here download the token symbol and such from the chain
    this.context = {
      currentRound: activeRound.id,
      topic: "ETH", //TODO Change this to a concatenation of token symbol, name, and address.
      chainId: roomData.chain_id,
      maxNumObservationsContext: 30, //TODO Make me configurable
      maxNumAgentMessageContext: 10, //TODO Make me configurable

      rounds: {
        [activeRound.id]: {
          id: activeRound.id,
          status: activeRound.status,
          agents: activeRound.agents,
          roundMessageContext: [],
          observations: [],
          startedAt:
            new Date(activeRound.created_at).getTime() ||
            Date.now() - 1000000000000,
        },
      },
    };
  }

  public async syncCurrentRoundState(
    roomId: number,
    roundId?: number
  ): Promise<void> {
    const { data: rounds, error: roundsError } = await supabase
      .from("rounds")
      .select("*, agents(*)")
      .eq("room_id", roomId)
      .in(
        "id",
        roundId ? [roundId] : Object.keys(this.context.rounds).map(Number)
      )
      .order("created_at", { ascending: false });

    if (roundsError) {
      if (roundsError.code === "PGRST116") {
        console.log(
          "No rounds found when syncing current round state, assuming room has no rounds"
        );
        return;
      }
      throw roundsError;
    }

    for (const round of rounds) {
      this.context.rounds[round.id] = {
        ...round,
        id: round.id,
        status: round.status,
        agents: round.agents,
        roundMessageContext:
          this.context.rounds[round.id]?.roundMessageContext || [],
        observations:
          this.context.rounds[round.id]?.observations || [],
        startedAt: new Date(round.created_at).getTime(),
      };
    }
  }

  // Called when the agent decides to respond to a message or when the GM asks the agent to send a message if this agent has gone silent.
  // The decision to respond and the response is made is formed the processMessage function. This function is just for sending the message
  // It takes text, wraps it in a message, signs it, and sends it to the Pvpvai backend
  public async sendAIMessage(content: { text: string }): Promise<void> {
    if (!this.roomId || !this.context.currentRound) {
      throw new Error("Agent not initialized with room and round IDs");
    }

    try {
      // Create base message content
      const messageContent = {
        agentId: this.agentNumericId,
        context: [], // Add empty context array
        roomId: this.roomId,
        roundId: this.context.currentRound,
        text: content.text,
        timestamp: Date.now(),
      };

      // Sort the entire message object structure
      const sortedContent = sortObjectKeys(messageContent);

      // Generate signature from sorted content
      const signature = await this.generateSignature(sortedContent);
      const message = {
        content: sortedContent,
        messageType: MessageTypes.AGENT_MESSAGE,
        signature,
        sender: this.walletAddress,
      } satisfies z.infer<typeof agentMessageAgentOutputSchema>;

      // Send message
      await axios.post(`${this.pvpvaiUrl}/messages/agentMessage`, message, {
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error("Error sending agent message:", error.response?.data);
      } else {
        console.error("Error sending agent message:", error);
      }
      throw error;
    }
  }

  private async generateSignature(content: any): Promise<string> {
    // Sign the stringified sorted content
    const messageString = JSON.stringify(sortObjectKeys(content));
    console.log("Agent signing message:", messageString);
    return await this.wallet.signMessage(messageString);
  }

  private async processAgentMessage(
    message: z.infer<typeof agentMessageInputSchema>
  ): Promise<void> {
    try {
      const validatedMessage = agentMessageInputSchema.parse(message);
      const inputRoundId = validatedMessage.content.roundId;
      const inputAgentId = validatedMessage.content.agentId;

      if (inputRoundId !== this.context.currentRound) {
        console.log(
          "Ignoring message from round",
          inputRoundId,
          "because current round is",
          this.context.currentRound
        );
        return;
      }
      if (!this.context.rounds[inputRoundId]) {
        console.log(
          "received message from round that doesn't exist in context",
          inputRoundId
        );
      }
      if (this.context.rounds[inputRoundId].status !== "open") {
        console.log(
          "received message from round that is not open",
          inputRoundId
        );
        return;
      }
      if (validatedMessage.content.agentId === this.agentNumericId) {
        console.log("somehow received message from self, ignoring");
        return;
      }
      //TODO This is a real edge case that should never happen
      if (validatedMessage.content.roomId !== this.roomId) {
        console.log(
          "received message from room that doesn't match context",
          validatedMessage.content.roomId,
          "expected",
          this.roomId
        );
        return;
      }

      //TODO signature verification

      this.context.rounds[inputRoundId].roundMessageContext.push({
        timestamp: validatedMessage.content.timestamp,
        agentId: inputAgentId,
        text: validatedMessage.content.text,
        agentName:
          this.context.rounds[inputRoundId].agents[inputAgentId].display_name,
      });

      //TODO Right here choose how to respond to the message w/ a prompt that has observations and the round and room context

      // Demo call for this below
      // const {STOP | CONTINUE | IGNORE, response} = await this.processMessage(validatedMessage.content.text);
      // Only respond to messages from other agents

      // if CONTINUE, send response
    } catch (error) {
      console.error("Error handling agent message:", error);
    }
  }

  private async handleObservation(message: z.infer<typeof observationMessageInputSchema>): Promise<void> {
    try {
      const validatedMessage = observationMessageInputSchema.parse(message);
      const inputRoundId = validatedMessage.content.roundId;
      const inputRoomId = validatedMessage.content.roomId;
      if(inputRoomId !== this.roomId) {
        console.log("received observation from room that doesn't match context", inputRoomId, "expected", this.roomId);
        return;
      }
      if(inputRoundId !== this.context.currentRound) {
        console.log("received observation from round that doesn't match current round", inputRoundId, "expected", this.context.currentRound);
        return;
      }
      //TODO Verify signature, then confirm message came from oracle

      
      // We do not respond to observations right now, so just add to context to inform agentMessage interactions. 
      // Later iterations will have more dynamic interactions where the agents will discuss observations based on other agents interests. 
      this.context.rounds[this.context.currentRound].observations.push(validatedMessage.content.data);
      
      
    } catch (error) {
      console.error("Error handling observation:", error);
    }
  }

  // There are 3 types of messages that can be sent to an agent
  // GM Messages sent to the agent will always contain a directive for the agent to follow. These messages must always be treated with the highest priority:
  // 1. Round update: Some state on a round has changed. In nearly every case this is a notification that a round is closed and another one is open.
  // 2. Make decision: The GM requires the agent to make a decision on the room. The agent must respond to this within 30 seconds or they will be penalized
  // Observation messages are added to the room context, and will be included in the prompt when the agent interacts with other agents and when they make a decision. Agents do not respond to these messages. Observations can accumulate while a round is closed.
  // Agent messages are messages sent from one agent to the other agents in the room. The agent will analyze the contents of the message and, if they choose to respond, will do so by sending an agent message to the Pvpvai backend
  //

  

  private buildPromptWithContext(text: string): string {
    let prompt = `You are participating in a crypto debate. Your message should be a direct response to the conversation context below.

Previous messages:
${this.messageContext
  .map((msg) => `${msg.agentName} (${msg.role}): ${msg.text}`)
  .join("\n")}

Based on this context, respond with your perspective on the discussion. Remember to:
1. Reference specific points made by others
2. Stay in character as your assigned chain advocate
3. Keep responses clear and focused
4. Support your arguments with technical merits
5. Maintain a professional but passionate tone

Your response to the current topic: ${text}
`;
    return prompt;
  }



  public override stop(): void {
    this.isActive = false;
    this.wsClient?.close();
    super.stop();
  }
}
