// src/clients/shared-websocket.ts
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
  private readonly HEARTBEAT_TIMEOUT = 10000;  // Match server's 10s timeout
  private reconnectAttempts = 0;
  private isActive = true;
  private lastHeartbeatResponse = Date.now();

  constructor(private config: WebSocketConfig) {}

  public async connect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
    }

    // Use /ws endpoint as specified in server code
    const wsUrl = new URL(this.config.endpoint);
    wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
    wsUrl.pathname = '/ws';  // Changed from /socket to /ws

    this.ws = new WebSocket(wsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${this.config.auth.walletAddress}`,
      },
      handshakeTimeout: 5000,
      perMessageDeflate: false,
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
        console.log('WebSocket connection established');
        
        try {
          await this.subscribeToRoom();
          await this.verifyConnection();
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

  public async verifyConnection(): Promise<boolean> {
    if (!this.ws || !this.config.roomId) return false;

    return new Promise((resolve, reject) => {
      let verified = false;
      
      // Increase timeout to 30 seconds for more reliable verification
      const timeout = setTimeout(() => {
        if (!verified) {
          reject(new Error('Connection verification timeout'));
        }
      }, 30000);

      const handleMessage = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          // Check for both types of confirmation messages
          if ((message.messageType === WsMessageTypes.SYSTEM_NOTIFICATION &&
               message.content.text === 'Subscribed to room') ||
              (message.messageType === WsMessageTypes.PARTICIPANTS)) {
            verified = true;
            clearTimeout(timeout);
            this.ws?.removeListener('message', handleMessage);
            resolve(true);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      this.ws.on('message', handleMessage);

      // Send both subscription and participants request
      this.subscribeToRoom().catch(reject);
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          messageType: WsMessageTypes.PARTICIPANTS,
          content: {
            roomId: this.config.roomId,
            timestamp: Date.now()
          }
        }));
      }
    });
  }

  private async subscribeToRoom(): Promise<void> {
    if (!this.ws) return;

    const subscribeMessage = {
      messageType: WsMessageTypes.SUBSCRIBE_ROOM,
      content: {
        roomId: this.config.roomId,
        timestamp: Date.now(),
        agentId: this.config.auth.agentId,
        walletAddress: this.config.auth.walletAddress
      }
    };

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(subscribeMessage), (error) => {
          if (error) reject(error);
          else resolve();
        });
      } else {
        reject(new Error('WebSocket not connected when trying to subscribe'));
      }
    });
  }

  private setupHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Match server's heartbeat implementation
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // Check if we missed last heartbeat response
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
      
      switch (message.messageType) {
        case WsMessageTypes.HEARTBEAT:
          this.handleHeartbeat();
          this.send({
            messageType: WsMessageTypes.HEARTBEAT,
            content: {}
          });
          break;

        case WsMessageTypes.SYSTEM_NOTIFICATION:
          // Pass to configured handler
          this.config.handlers.onMessage(data);
          break;

        default:
          // Pass other messages to configured handler
          this.config.handlers.onMessage(data);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  private handleDisconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    if (this.isActive) {
      setTimeout(() => {
        this.connect().catch(this.config.handlers.onError);
      }, backoff);
    }

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
