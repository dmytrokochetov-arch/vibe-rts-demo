export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1600;
export const TICK_MS = 100;
export const MAX_PLAYERS = 2;

export type PlayerColor = "red" | "blue";
export type RoomPhase = "lobby" | "playing" | "gameover";
export type UnitKind = "harvester" | "rifle" | "tank" | "artillery";
export type BuildingKind = "hq" | "factory" | "refinery";
export type EntityKind = UnitKind | BuildingKind;
export type EntityRole = "unit" | "building";
export type Order =
  | { type: "idle" }
  | { type: "move"; x: number; y: number }
  | { type: "attack"; targetId: string };

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  resources: number;
  ready: boolean;
  connected: boolean;
}

export interface EntityState {
  id: string;
  ownerId: string;
  kind: EntityKind;
  role: EntityRole;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  range: number;
  damage: number;
  cooldownMs: number;
  cooldownRemainingMs: number;
  buildTimeMs: number;
  order: Order;
}

export interface ProductionItem {
  id: string;
  playerId: string;
  kind: UnitKind;
  remainingMs: number;
  totalMs: number;
}

export interface ProjectileEvent {
  id: string;
  from: Vec2;
  to: Vec2;
  ownerId: string;
  ageMs: number;
}

export interface ExplosionEvent {
  id: string;
  x: number;
  y: number;
  ageMs: number;
}

export interface GameSnapshot {
  roomCode: string;
  phase: RoomPhase;
  tick: number;
  players: PlayerState[];
  entities: EntityState[];
  production: ProductionItem[];
  projectiles: ProjectileEvent[];
  explosions: ExplosionEvent[];
  winnerId?: string;
  message?: string;
}

export type ClientCommand =
  | { type: "move"; entityIds: string[]; x: number; y: number }
  | { type: "attack"; entityIds: string[]; targetId: string };

export interface JoinResult {
  ok: boolean;
  roomCode?: string;
  playerId?: string;
  color?: PlayerColor;
  error?: string;
}

export interface ServerToClientEvents {
  roomState: (snapshot: GameSnapshot, playerId: string) => void;
  gameSnapshot: (snapshot: GameSnapshot) => void;
  playerError: (message: string) => void;
  gameOver: (snapshot: GameSnapshot) => void;
}

export interface ClientToServerEvents {
  createRoom: (name: string, callback: (result: JoinResult) => void) => void;
  joinRoom: (roomCode: string, name: string, callback: (result: JoinResult) => void) => void;
  ready: () => void;
  queueUnit: (kind: UnitKind) => void;
  command: (command: ClientCommand) => void;
  restart: () => void;
}

export interface UnitDefinition {
  label: string;
  cost: number;
  hp: number;
  speed: number;
  range: number;
  damage: number;
  cooldownMs: number;
  buildTimeMs: number;
  radius: number;
}

export interface BuildingDefinition {
  label: string;
  hp: number;
  radius: number;
}

export const UNIT_DEFS: Record<UnitKind, UnitDefinition> = {
  harvester: {
    label: "Harvester",
    cost: 120,
    hp: 150,
    speed: 85,
    range: 90,
    damage: 5,
    cooldownMs: 900,
    buildTimeMs: 4500,
    radius: 18,
  },
  rifle: {
    label: "Rifle Squad",
    cost: 80,
    hp: 70,
    speed: 115,
    range: 150,
    damage: 10,
    cooldownMs: 550,
    buildTimeMs: 2500,
    radius: 13,
  },
  tank: {
    label: "Tank",
    cost: 180,
    hp: 220,
    speed: 78,
    range: 185,
    damage: 32,
    cooldownMs: 950,
    buildTimeMs: 5200,
    radius: 22,
  },
  artillery: {
    label: "Artillery",
    cost: 260,
    hp: 130,
    speed: 55,
    range: 310,
    damage: 52,
    cooldownMs: 1800,
    buildTimeMs: 7200,
    radius: 20,
  },
};

export const BUILDING_DEFS: Record<BuildingKind, BuildingDefinition> = {
  hq: { label: "HQ", hp: 900, radius: 52 },
  factory: { label: "Factory", hp: 520, radius: 44 },
  refinery: { label: "Refinery", hp: 430, radius: 38 },
};

