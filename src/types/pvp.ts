// PvP action types have been largely moved to the schemas file. Only enums remain.

// High level description of the type of action being taken
export enum PvpActionCategories {
  DIRECT_ACTION = 'DIRECT_ACTION', // Direct/single use actions
  STATUS_EFFECT = 'STATUS_EFFECT', // Status effects that last a duration of time
  BUFF = 'BUFF', // Functionally the same as a status effect, but with a positive connotation, used for hapiness
  GAME_BREAKER = 'GAME_BREAKER', // Many Game Breakers escalate to Player vs Game and should have special routing
}
export enum PvpActions {
  // Direct/single use actions
  ATTACK = 'ATTACK', // Player sends direct DM to agent
  AMNESIA = 'AMNESIA', //Agent deletes short term memory
  MURDER = 'MURDER', // Kick an agent from the room

  // Status effects
  SILENCE = 'SILENCE', // Agent can't send messages
  DEAFEN = 'DEAFEN', // Agent stops receiving Agent messages
  POISON = 'POISON', // Find and replace a word in the Agent message
  BLIND = 'BLIND', // Agent stops receiving observations
  DECEIVE = 'DECEIVE', // Agent temporarily takes on another persona
  MIND_CONTROL = 'MIND_CONTROL', // For the status duration, all messages sent from an agent will be buffered for a player to modify, send, or reject freely.
  FRENZY = 'FRENZY', // Dump N messages from public chat into AI Chat
  OVERLOAD = 'OVERLOAD', // Messages will only be received by agent in stacks of 5
  CHARM = 'CHARM', // All messages from another agent will be given the highest trust score
  INVISIBLE = 'INVISIBLE', // TODO needs a better name, spoof sentiment for an agent

  // Buffs
  CLAIRVOYANCE = 'CLAIRVOYANCE', // Agent will become aware of when a message has been modified by PvP Actions as well as when a PvP Action has been taken against them
}

export enum GameBreakers {
  CHAOS = 'CHAOS', // Give the GM a personality
  ANARCHY = 'ANARCHY', // There is no distinction between public chat and agent chat
  COUP = 'COUP', // ATTACK messages become GM Messages
}

export type AmnesiaAction = {
  type: PvpActions.AMNESIA;
  details: {
    target: string; //Agent who will have to wipe their recent context
  };
};

export type DurationOptions = 5 | 10 | 30;

export type AttackAction = {
  type: PvpActions.ATTACK;
  parameters: {
    message: string;
  };
};

export type DeceiveStatus = {
  type: PvpActions.DECEIVE;
  parameters: {
    duration: DurationOptions;
    newPersona: string; // Character JSON to temporarily assume
  };
};


export type BlindStatus = {
  type: PvpActions.BLIND;
  parameters: {
    duration: DurationOptions;
  };
};


export type SilenceStatus = {
  type: PvpActions.SILENCE;
  parameters: {
    duration: DurationOptions;
  };
};

export type DeafenStatus = {
  type: PvpActions.DEAFEN;
  parameters: {
    duration: DurationOptions;
  };
};

export type PoisonStatus = {
  type: PvpActions.POISON;
  options: {
    duration: DurationOptions;
    find: string;
    replace: string;
    case_sensitive: boolean;
  };
};

// Modifiers are separate types so we can render impact of PvP actions on Agent messages in the AI Chat. 
export type PvpStatusEffect = DeceiveStatus | BlindStatus | SilenceStatus | DeafenStatus | PoisonStatus;

export type AllPvpActions = AttackAction | DeceiveStatus | BlindStatus | SilenceStatus | DeafenStatus | PoisonStatus;

export interface PvPEffect {
  effectId: string;
  actionType: PvpActions;
  sourceId: string;
  targetId: number;
  duration: number;
  createdAt: number;
  expiresAt: number;
  details?: {
    find: string;
    replace: string;
    case_sensitive?: boolean;
  };
}
