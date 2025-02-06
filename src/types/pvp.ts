// PvP action types have been largely moved to the schemas file. Only enums remain.

// High level description of the type of action being taken
export enum PvpActionCategories {
  DIRECT_ACTION = 'DIRECT_ACTION', // Direct/single use actions
  STATUS_EFFECT = 'STATUS_EFFECT', // Status effects that last a duration of time
}
export enum PvpActions {
  ATTACK = 'ATTACK',
  SILENCE = 'SILENCE',
  DEAFEN = 'DEAFEN',
  POISON = 'POISON',
  BLIND = 'BLIND',
  DECEIVE = 'DECEIVE',
  AMNESIA = 'AMNESIA'
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
