import axios from 'axios';
import { EventEmitter } from 'events';
import {
  SystemState,
  PvPActionType,
  SystemMessageType,
  SystemMessage
} from './types.ts';

export class SystemClient {
  private readonly endpoint: string;
  private readonly roomId: number;
  private readonly creatorId: string;
  private readonly eventEmitter: EventEmitter;
  private isActive = true;

  private systemState: SystemState = {
    activeAgents: [],
    activeEffects: [],
    systemStatus: {
      isHealthy: true,
      lastUpdate: Date.now()
    }
  };

  constructor(endpoint: string, roomId: number, creatorId: string) {
    this.endpoint = endpoint;
    this.roomId = roomId;
    this.creatorId = creatorId;
    this.eventEmitter = new EventEmitter();
  }

  public async executePvPAction(
    sourceId: string,
    actionType: PvPActionType,
    targetId: string,
    duration: number,
    roundId: number
  ): Promise<void> {
    const timestamp = Date.now();
    
    // Format according to backend's expectations
    const message = {
      messageType: 'pvp_action',
      signature: this.generateSignature(`${sourceId}:${actionType}:${targetId}`, timestamp),
      sender: sourceId,
      content: {
        timestamp,
        roomId: this.roomId,
        roundId,
        agentId: parseInt(sourceId),
        pvp_action: {
          type: actionType,
          actionType: 'STATUS_EFFECT', // or appropriate type based on the action
          targets: [parseInt(targetId)],
          parameters: {
            duration
          }
        }
      }
    };

    try {
      const response = await axios.post<{ success: boolean; error?: string }>(
        `${this.endpoint}/messages/agentMessage`,
        message,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to execute PvP action');
      }
    } catch (error) {
      console.error('Error executing PvP action:', error);
      throw error;
    }
  }

  public async observeWalletBalances(roundId: number, walletBalances: any): Promise<void> {
    const timestamp = Date.now();
    const observation = {
      messageType: 'observation',
      signature: this.generateSignature('wallet_balances', timestamp),
      sender: `SYSTEM_${this.roomId}`,
      content: {
        agentId: 0, // System agent ID
        timestamp,
        roomId: this.roomId,
        roundId,
        observationType: 'wallet-balances',
        data: walletBalances
      }
    };

    try {
      await axios.post(
        `${this.endpoint}/messages/observations`,
        observation,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error('Error sending wallet balance observation:', error);
      throw error;
    }
  }

  public async observePriceData(roundId: number, priceData: any): Promise<void> {
    const timestamp = Date.now();
    const observation = {
      messageType: 'observation',
      signature: this.generateSignature('price_data', timestamp),
      sender: `SYSTEM_${this.roomId}`,
      content: {
        agentId: 0, // System agent ID
        timestamp,
        roomId: this.roomId,
        roundId,
        observationType: 'price-data',
        data: priceData
      }
    };

    try {
      await axios.post(
        `${this.endpoint}/messages/observations`,
        observation,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error('Error sending price data observation:', error);
      throw error;
    }
  }

  // System event notifications through WebSocket only
  private async notifySystemEvent(type: SystemMessageType, payload: any): Promise<void> {
    const event = {
      type,
      timestamp: Date.now(),
      payload
    };
    
    // Emit event locally
    this.eventEmitter.emit(type.toLowerCase(), event);
    
    // Update system state if needed
    if (type === 'STATE_UPDATE') {
      this.updateSystemState(payload);
    }
  }

  private updateSystemState(newState: Partial<SystemState>): void {
    this.systemState = {
      ...this.systemState,
      ...newState,
      systemStatus: {
        ...this.systemState.systemStatus,
        lastUpdate: Date.now()
      }
    };
    this.eventEmitter.emit('state_update', this.systemState);
  }

  // Helper to track active PvP effects
  private updatePvPEffects(action: any): void {
    const { sourceId, targetId, actionType, duration } = action;
    const timestamp = Date.now();

    // Add new effect
    this.systemState.activeEffects.push({
      actionType,
      sourceId,
      targetId,
      duration,
      timestamp
    });

    // Remove expired effects
    this.systemState.activeEffects = this.systemState.activeEffects.filter(
      effect => (effect.timestamp + effect.duration) > Date.now()
    );

    this.updateSystemState({ activeEffects: this.systemState.activeEffects });
  }

  private generateSignature(content: string, timestamp: number): string {
    return Buffer.from(`SYSTEM_${this.roomId}:${content}:${timestamp}`).toString('base64');
  }

  public on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  public off(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  public stop(): void {
    this.isActive = false;
    this.eventEmitter.removeAllListeners();
  }
}