import {
  BUILDING_DEFS,
  UNIT_DEFS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type BuildingKind,
  type ClientCommand,
  type EntityState,
  type GameSnapshot,
  type PlayerColor,
  type PlayerState,
  type ProductionItem,
  type ProjectileEvent,
  type RoomPhase,
  type UnitKind,
} from "../shared/protocol.js";

interface Result<T = void> {
  ok: boolean;
  error: string;
  player?: T;
}

export interface GameState {
  roomCode: string;
  phase: RoomPhase;
  tick: number;
  players: PlayerState[];
  entities: EntityState[];
  production: ProductionItem[];
  projectiles: ProjectileEvent[];
  explosions: { id: string; x: number; y: number; ageMs: number }[];
  winnerId?: string;
  nextId: number;
}

const STARTING_RESOURCES = 620;
const RESOURCE_PER_SECOND_PER_REFINERY = 18;
const RESOURCE_PER_SECOND_PER_HARVESTER = 8;
const EVENT_TTL_MS = 700;
const PLAYER_COLORS: PlayerColor[] = ["red", "blue"];

export function createGame(roomCode: string): GameState {
  return {
    roomCode,
    phase: "lobby",
    tick: 0,
    players: [],
    entities: [],
    production: [],
    projectiles: [],
    explosions: [],
    nextId: 1,
  };
}

export function addPlayer(game: GameState, playerId: string, name: string): Result<PlayerState> {
  if (game.players.some((player) => player.id === playerId)) {
    return { ok: false, error: "Player already joined" };
  }

  if (game.players.length >= PLAYER_COLORS.length) {
    return { ok: false, error: "Room is full" };
  }

  const color = PLAYER_COLORS[game.players.length];
  const player: PlayerState = {
    id: playerId,
    name,
    color,
    resources: STARTING_RESOURCES,
    ready: false,
    connected: true,
  };
  game.players.push(player);
  createStartingBase(game, player);

  return { ok: true, error: "", player };
}

export function addBotPlayer(game: GameState, playerId: string, name = "AI Commander"): Result<PlayerState> {
  const result = addPlayer(game, playerId, name);
  if (!result.ok || !result.player) return result;

  result.player.isBot = true;
  result.player.ready = true;
  result.player.connected = true;

  return result;
}

export function setPlayerReady(game: GameState, playerId: string, ready: boolean): Result {
  const player = findPlayer(game, playerId);
  if (!player) return { ok: false, error: "Player not found" };
  player.ready = ready;
  if (game.players.length === 2 && game.players.every((candidate) => candidate.ready)) {
    game.phase = "playing";
  }
  return { ok: true, error: "" };
}

export function setPlayerConnected(game: GameState, playerId: string, connected: boolean): Result {
  const player = findPlayer(game, playerId);
  if (!player) return { ok: false, error: "Player not found" };
  player.connected = connected;
  return { ok: true, error: "" };
}

export function queueUnit(game: GameState, playerId: string, kind: UnitKind): Result {
  const player = findPlayer(game, playerId);
  if (!player) return { ok: false, error: "Player not found" };

  const definition = UNIT_DEFS[kind];
  if (player.resources < definition.cost) {
    return { ok: false, error: "Not enough ore" };
  }

  const factory = game.entities.find(
    (entity) => entity.ownerId === playerId && entity.kind === "factory" && entity.hp > 0,
  );
  if (!factory) {
    return { ok: false, error: "Factory required" };
  }

  player.resources -= definition.cost;
  game.production.push({
    id: createId(game, "prod"),
    playerId,
    kind,
    remainingMs: definition.buildTimeMs,
    totalMs: definition.buildTimeMs,
  });

  return { ok: true, error: "" };
}

export function issueCommand(game: GameState, playerId: string, command: ClientCommand): Result {
  const selected = command.entityIds
    .map((id) => game.entities.find((entity) => entity.id === id))
    .filter((entity): entity is EntityState => Boolean(entity));

  if (selected.length === 0) {
    return { ok: false, error: "No units selected" };
  }

  if (selected.some((entity) => entity.ownerId !== playerId || entity.role !== "unit")) {
    return { ok: false, error: "Can only command own units" };
  }

  if (command.type === "attack") {
    const target = game.entities.find((entity) => entity.id === command.targetId);
    if (!target) {
      return { ok: false, error: "Target not found" };
    }
    if (target.ownerId === playerId) {
      return { ok: false, error: "Cannot attack friendly targets" };
    }
    for (const entity of selected) {
      entity.order = { type: "attack", targetId: target.id };
    }
    return { ok: true, error: "" };
  }

  const x = clamp(command.x, 0, WORLD_WIDTH);
  const y = clamp(command.y, 0, WORLD_HEIGHT);
  for (const [index, entity] of selected.entries()) {
    const offset = spreadOffset(index, selected.length);
    entity.order = { type: "move", x: x + offset.x, y: y + offset.y };
  }
  return { ok: true, error: "" };
}

export function stepGame(game: GameState, deltaMs: number): void {
  if (game.phase === "gameover") return;

  game.tick += 1;
  grantIncome(game, deltaMs);
  processProduction(game, deltaMs);
  processOrders(game, deltaMs);
  removeDeadEntities(game);
  ageEvents(game, deltaMs);
  updateVictory(game);
}

export function runBotTurn(game: GameState, botPlayerId: string): void {
  if (game.phase !== "playing") return;

  const bot = findPlayer(game, botPlayerId);
  if (!bot?.isBot) return;

  const activeProduction = game.production.filter((item) => item.playerId === botPlayerId).length;
  if (activeProduction < 2) {
    for (const kind of chooseBotBuildOrder(game, botPlayerId)) {
      if (queueUnit(game, botPlayerId, kind).ok) break;
    }
  }

  const target =
    game.entities.find((entity) => entity.ownerId !== botPlayerId && entity.kind === "hq") ??
    game.entities.find((entity) => entity.ownerId !== botPlayerId);
  if (!target) return;

  const attackers = game.entities.filter(
    (entity) =>
      entity.ownerId === botPlayerId &&
      entity.role === "unit" &&
      entity.kind !== "harvester" &&
      (entity.order.type === "idle" || hasMissingAttackTarget(game, entity)),
  );

  if (attackers.length > 0) {
    issueCommand(game, botPlayerId, {
      type: "attack",
      entityIds: attackers.map((entity) => entity.id),
      targetId: target.id,
    });
  }
}

export function snapshotGame(game: GameState): GameSnapshot {
  return {
    roomCode: game.roomCode,
    phase: game.phase,
    tick: game.tick,
    players: game.players.map((player) => ({ ...player, resources: Math.floor(player.resources) })),
    entities: game.entities.map((entity) => ({ ...entity, order: { ...entity.order } })),
    production: game.production.map((item) => ({ ...item })),
    projectiles: game.projectiles.map((projectile) => ({ ...projectile, from: { ...projectile.from }, to: { ...projectile.to } })),
    explosions: game.explosions.map((explosion) => ({ ...explosion })),
    winnerId: game.winnerId,
    message: game.winnerId ? `${findPlayer(game, game.winnerId)?.name ?? "A player"} wins` : undefined,
  };
}

function createStartingBase(game: GameState, player: PlayerState): void {
  const isRed = player.color === "red";
  const anchor = isRed ? { x: 310, y: WORLD_HEIGHT - 320 } : { x: WORLD_WIDTH - 310, y: 320 };
  const direction = isRed ? 1 : -1;

  addBuilding(game, player.id, "hq", anchor.x, anchor.y);
  addBuilding(game, player.id, "factory", anchor.x + direction * 170, anchor.y - direction * 35);
  addBuilding(game, player.id, "refinery", anchor.x - direction * 45, anchor.y - direction * 145);
  addUnit(game, player.id, "harvester", anchor.x - direction * 130, anchor.y - direction * 195);
  addUnit(game, player.id, "rifle", anchor.x + direction * 98, anchor.y + direction * 94);
  addUnit(game, player.id, "tank", anchor.x + direction * 172, anchor.y + direction * 118);
}

function addBuilding(game: GameState, ownerId: string, kind: BuildingKind, x: number, y: number): EntityState {
  const definition = BUILDING_DEFS[kind];
  const entity: EntityState = {
    id: createId(game, kind),
    ownerId,
    kind,
    role: "building",
    x,
    y,
    radius: definition.radius,
    hp: definition.hp,
    maxHp: definition.hp,
    speed: 0,
    range: kind === "hq" ? 160 : 0,
    damage: kind === "hq" ? 12 : 0,
    cooldownMs: 1000,
    cooldownRemainingMs: 0,
    buildTimeMs: 0,
    order: { type: "idle" },
  };
  game.entities.push(entity);
  return entity;
}

function addUnit(game: GameState, ownerId: string, kind: UnitKind, x: number, y: number): EntityState {
  const definition = UNIT_DEFS[kind];
  const entity: EntityState = {
    id: createId(game, kind),
    ownerId,
    kind,
    role: "unit",
    x,
    y,
    radius: definition.radius,
    hp: definition.hp,
    maxHp: definition.hp,
    speed: definition.speed,
    range: definition.range,
    damage: definition.damage,
    cooldownMs: definition.cooldownMs,
    cooldownRemainingMs: 0,
    buildTimeMs: definition.buildTimeMs,
    order: { type: "idle" },
  };
  game.entities.push(entity);
  return entity;
}

function processProduction(game: GameState, deltaMs: number): void {
  const completed: ProductionItem[] = [];
  for (const item of game.production) {
    item.remainingMs -= deltaMs;
    if (item.remainingMs <= 0) {
      completed.push(item);
    }
  }

  game.production = game.production.filter((item) => item.remainingMs > 0);

  for (const item of completed) {
    const factory = game.entities.find(
      (entity) => entity.ownerId === item.playerId && entity.kind === "factory" && entity.hp > 0,
    );
    const spawn = factory ?? game.entities.find((entity) => entity.ownerId === item.playerId && entity.kind === "hq");
    if (!spawn) continue;
    const jitter = spreadOffset(game.tick, 8);
    addUnit(game, item.playerId, item.kind, spawn.x + 78 + jitter.x, spawn.y + 48 + jitter.y);
  }
}

function processOrders(game: GameState, deltaMs: number): void {
  for (const entity of game.entities) {
    entity.cooldownRemainingMs = Math.max(0, entity.cooldownRemainingMs - deltaMs);
    if (entity.role !== "unit") continue;

    if (entity.order.type === "move") {
      moveToward(entity, entity.order, deltaMs);
    }

    const order = entity.order;
    if (order.type === "attack") {
      const target = game.entities.find((candidate) => candidate.id === order.targetId);
      if (!target || target.hp <= 0) {
        entity.order = { type: "idle" };
        continue;
      }

      const distance = distanceBetween(entity, target);
      if (distance > entity.range) {
        moveToward(entity, target, deltaMs);
      } else if (entity.cooldownRemainingMs <= 0) {
        target.hp -= entity.damage;
        entity.cooldownRemainingMs = entity.cooldownMs;
        game.projectiles.push({
          id: createId(game, "shot"),
          from: { x: entity.x, y: entity.y },
          to: { x: target.x, y: target.y },
          ownerId: entity.ownerId,
          ageMs: 0,
        });
        if (target.hp <= 0) {
          game.explosions.push({ id: createId(game, "boom"), x: target.x, y: target.y, ageMs: 0 });
        }
      }
    }
  }
}

function moveToward(entity: EntityState, target: { x: number; y: number }, deltaMs: number): void {
  const distance = distanceBetween(entity, target);
  if (distance < 2) {
    if (entity.order.type === "move") entity.order = { type: "idle" };
    return;
  }

  const step = Math.min(distance, (entity.speed * deltaMs) / 1000);
  entity.x += ((target.x - entity.x) / distance) * step;
  entity.y += ((target.y - entity.y) / distance) * step;
  entity.x = clamp(entity.x, entity.radius, WORLD_WIDTH - entity.radius);
  entity.y = clamp(entity.y, entity.radius, WORLD_HEIGHT - entity.radius);
}

function removeDeadEntities(game: GameState): void {
  game.entities = game.entities.filter((entity) => entity.hp > 0);
}

function updateVictory(game: GameState): void {
  if (game.players.length < 2) return;
  const livingHqOwners = new Set(
    game.entities.filter((entity) => entity.kind === "hq" && entity.hp > 0).map((entity) => entity.ownerId),
  );
  const alivePlayers = game.players.filter((player) => livingHqOwners.has(player.id));

  if (alivePlayers.length === 1) {
    game.phase = "gameover";
    game.winnerId = alivePlayers[0].id;
  }
}

function grantIncome(game: GameState, deltaMs: number): void {
  for (const player of game.players) {
    const refineries = game.entities.filter((entity) => entity.ownerId === player.id && entity.kind === "refinery").length;
    const harvesters = game.entities.filter((entity) => entity.ownerId === player.id && entity.kind === "harvester").length;
    player.resources +=
      ((refineries * RESOURCE_PER_SECOND_PER_REFINERY + harvesters * RESOURCE_PER_SECOND_PER_HARVESTER) * deltaMs) / 1000;
  }
}

function hasMissingAttackTarget(game: GameState, entity: EntityState): boolean {
  const order = entity.order;
  if (order.type !== "attack") return false;

  return !game.entities.some((targetEntity) => targetEntity.id === order.targetId);
}

function chooseBotBuildOrder(game: GameState, botPlayerId: string): UnitKind[] {
  const botUnits = game.entities.filter((entity) => entity.ownerId === botPlayerId && entity.role === "unit");
  const harvesters = botUnits.filter((entity) => entity.kind === "harvester").length;
  if (harvesters < 2) return ["harvester", "rifle", "tank"];

  return ["tank", "rifle", "artillery", "harvester"];
}

function ageEvents(game: GameState, deltaMs: number): void {
  for (const projectile of game.projectiles) projectile.ageMs += deltaMs;
  for (const explosion of game.explosions) explosion.ageMs += deltaMs;
  game.projectiles = game.projectiles.filter((projectile) => projectile.ageMs <= EVENT_TTL_MS);
  game.explosions = game.explosions.filter((explosion) => explosion.ageMs <= EVENT_TTL_MS);
}

function findPlayer(game: GameState, playerId: string): PlayerState | undefined {
  return game.players.find((player) => player.id === playerId);
}

function createId(game: GameState, prefix: string): string {
  const id = `${prefix}-${game.nextId}`;
  game.nextId += 1;
  return id;
}

function spreadOffset(index: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 0, y: 0 };
  const angle = (index / total) * Math.PI * 2;
  return {
    x: Math.cos(angle) * 32,
    y: Math.sin(angle) * 32,
  };
}

function distanceBetween(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
