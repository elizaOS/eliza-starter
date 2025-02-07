import WebSocket from 'ws';
import { WsMessageTypes } from '../types/ws.ts';
import { sortObjectKeys } from './sortObjectKeys.ts'; 

export interface WebSocketConfig {
  endpoint: string;
  roomId: number;
  auth: {
    walletAddress: string;
    agentId: number;
  };
  handlers: {
    onMessage: (data: WebSocket.Data) => void;
    onError?: (error: Error) => void;
    onClose?: () => void;
  };
}

export class SharedWebSocket {
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // Match server's 30s interval
  private readonly HEARTBEAT_TIMEOUT = 30000;  // Match server's timeout
  private reconnectAttempts = 0;
  private isActive = true;
  private lastHeartbeatResponse = Date.now();

  constructor(private config: WebSocketConfig) {}

  public async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    
    if (this.ws) {
      this.ws.close();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const wsUrl = new URL(this.config.endpoint);
    wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
    wsUrl.pathname = '/ws';

    this.ws = new WebSocket(wsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${this.config.auth.walletAddress}`,
      }
    });

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject('WebSocket not initialized');

      const connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          this.ws?.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);

      this.ws.on('open', async () => {
        clearTimeout(connectionTimeout);
        try {
          await this.subscribeToRoom();
          this.setupHeartbeat();
          this.reconnectAttempts = 0;
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.ws.on('message', (data) => this.handleMessage(data));
      this.ws.on('close', () => this.handleDisconnect());
      this.ws.on('error', (error) => {
        clearTimeout(connectionTimeout);
        this.config.handlers.onError?.(error as Error);
        reject(error);
      });
    });
  }

  private async subscribeToRoom(): Promise<void> {
    if (!this.ws) return;

    const subscribeMessage = {
      messageType: WsMessageTypes.SUBSCRIBE_ROOM,
      content: {
        roomId: this.config.roomId,
        timestamp: Date.now()
      }
    };

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(subscribeMessage));
    }
  }

  private setupHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const timeSinceLastResponse = Date.now() - this.lastHeartbeatResponse;
      if (timeSinceLastResponse > this.HEARTBEAT_TIMEOUT) {
        this.ws.close(1000, 'Heartbeat timeout');
        return;
      }

      this.ws.send(JSON.stringify({
        messageType: WsMessageTypes.HEARTBEAT,
        content: {}
      }));

    }, this.HEARTBEAT_INTERVAL);
  }

  public handleHeartbeat(): void {
    this.lastHeartbeatResponse = Date.now();
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.messageType === WsMessageTypes.HEARTBEAT) {
        this.handleHeartbeat();
        return;
      }

      this.config.handlers.onMessage(data);
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  private handleDisconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (!this.isActive) return;

    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    setTimeout(() => {
      if (this.isActive) {
        this.connect().catch(error => {
          console.error('Reconnect failed:', error);
          this.config.handlers.onError?.(error);
        });
      }
    }, backoff);

    this.config.handlers.onClose?.();
  }

  public close(): void {
    this.isActive = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  public send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(sortObjectKeys(message)));
    }
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}