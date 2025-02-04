import { AgentRuntime, generateText, stringToUuid, type UUID } from '@elizaos/core';
import type { ExtendedAgentRuntime, PVPVAISettings } from './types/index.ts';

class DebateOrchestrator {
  private agents: ExtendedAgentRuntime[] = [];
  private gameMaster?: ExtendedAgentRuntime;
  private isDebating = false;
  private currentTopicId: UUID;
  private roomId?: number;
  private roundId?: number;

  constructor(runtimes: ExtendedAgentRuntime[]) {
    this.currentTopicId = stringToUuid('debate-topic') as UUID;
    
    // Sort runtimes to ensure GM is processed first
    runtimes.forEach(runtime => {
      const character = runtime.character as any;
      if (character.agentRole?.type === 'GM') {
        this.gameMaster = runtime;
      } else {
        this.agents.push(runtime);
      }
    });

    console.log('DebateOrchestrator initialized with:', {
      gameMaster: this.gameMaster?.character?.name,
      agents: this.agents.map(a => a.character?.name)
    });
  }

  public async startDebate() {
    try {
      this.isDebating = true;

      if (!this.gameMaster) {
        throw new Error('GameMaster not found!');
      }

      // Initialize GM client
      const gmClient = this.gameMaster.clients?.pvpvai;
      if (!gmClient) {
        throw new Error('GM client not initialized');
      }

      console.log('Initializing GameMaster client...');
      await gmClient.initialize();

      // Get and verify room/round IDs
      const settings = (this.gameMaster.character as any).settings?.pvpvai;
      this.roomId = settings?.roomId;
      this.roundId = settings?.roundId;

      console.log('Room and Round IDs:', { roomId: this.roomId, roundId: this.roundId });

      if (!this.roomId || !this.roundId) {
        throw new Error('Room/Round initialization failed - missing IDs');
      }

      // Initialize agent clients with room/round IDs
      console.log('Initializing agent clients...');
      for (const agent of this.agents) {
        try {
          const client = agent.clients?.pvpvai?.getClient();
          if (!client) {
            console.error(`No PvPvAI client found for agent ${agent.character?.name}`);
            continue;
          }

          if ('setRoomAndRound' in client) {
            client.setRoomAndRound(this.roomId, this.roundId);
            console.log(`Initialized agent ${agent.character?.name} with room ${this.roomId} and round ${this.roundId}`);
          }

          // Update agent's settings
          const agentSettings = (agent.character as any).settings?.pvpvai;
          if (agentSettings) {
            agentSettings.roomId = this.roomId;
            agentSettings.roundId = this.roundId;
          }
        } catch (error) {
          console.error(`Failed to initialize agent ${agent.character?.name}:`, error);
        }
      }

      // Wait for initialization
      console.log('Waiting for initializations to complete...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Start debate loop
      await this.debateLoop();
    } catch (error) {
      console.error('Error in startDebate:', error);
      throw error;
    }
  }

  private async debateLoop() {
    console.log(`Starting debate loop with ${this.agents.length} agents`);
    
    while (this.isDebating) {
      for (const agent of this.agents) {
        if (!this.isDebating) break;

        try {
          const pvpvaiClient = agent.clients?.pvpvai;
          if (!pvpvaiClient) {
            console.error(`Missing PvPvAI client for agent ${agent.character?.name}`);
            continue;
          }

          const character = agent.character as any;
          const chainName = character.agentRole?.name || 'Unknown';
          console.log(`Agent ${chainName} generating response...`);

          // Get recent messages for context
          const recentMessages = await agent.messageManager.getMemories({ 
            roomId: stringToUuid(this.roomId?.toString() || ''),
            count: 5 
          });

          // Generate response
          const response = await generateText({
            runtime: agent as AgentRuntime,
            context: this.buildPrompt(agent, recentMessages),
            modelClass: 'large',
          });

          console.log(`Generated response for ${chainName}:`, response);

          // Store message in agent's memory
          await agent.messageManager.createMemory({
            content: {
              text: response,
              inReplyTo: this.currentTopicId
            },
            roomId: stringToUuid(this.roomId?.toString() || ''),
            userId: stringToUuid(character.settings?.pvpvai?.creatorId?.toString() || ''),
            agentId: stringToUuid(character.settings?.pvpvai?.agentId?.toString() || '')
          });

          // Send message through PvPvAI client
          try {
            await pvpvaiClient.sendAIMessage(response);
            console.log(`Agent ${chainName} message sent successfully`);
          } catch (error) {
            console.error(`Failed to send message for ${chainName}:`, error);
          }

          // Wait between agent messages
          await new Promise(resolve => setTimeout(resolve, 5000));

        } catch (error) {
          console.error(`Error in debate loop for agent ${agent.character?.name}:`, error);
        }
      }

      // Wait between rounds
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  private buildPrompt(agent: ExtendedAgentRuntime, recentMessages: any[]): string {
    const character = agent.character as any;
    const chainName = character.agentRole?.name;
    const messageHistory = recentMessages.map(m => m.content.text).join('\n');

    return `You are ${chainName}, ${character.agentRole.description}.
Previous messages:
${messageHistory}

Based on your role and perspective, provide a response that:
1. Stays in character as a ${character.agentRole.description}
2. Addresses points made in previous messages
3. Promotes your chain's strengths
4. Respectfully challenges other chains' weaknesses
5. Keep responses concise (2-3 sentences)

Your response should maintain a professional but passionate tone. Avoid personal attacks and focus on technical merits.

Response:`;
  }

  public stopDebate() {
    console.log('Stopping debate...');
    this.isDebating = false;
  }
}

export { DebateOrchestrator };