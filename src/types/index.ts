export interface AdditionalAgentConfig {
  role: string;
  name: string;
  description: string;
}

export interface EnvironmentConfig {
  type: string;
  description: string;
  rules: string[];
}

// Message Types

export interface Message {
    sender_name: string;
    sender_role: string;
    text: string;
    timestamp: number;
    room_id?: number;  
    round_id?: number; 
  }
  
  export interface AgentMessage extends Message {
    room_id: number;
    round_id: number;
  }
  
  export interface SystemMessage extends Message {
    type: 'notification' | 'error' | 'info';
  }
  
  export interface GMMessage extends Message {
    action_type: string;
    targets?: string[];
    additional_data?: any;
  }
  
  export interface PVPMessage extends Message {
    action_type: 'Silence' | 'Deafen' | 'Attack' | 'Poison';
    instigator: string;
    targets: string[];
    additional_data?: any;
  }
  