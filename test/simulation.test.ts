import { describe, expect, test } from "vitest";
import { MAX_PLAYERS, UNIT_DEFS, WORLD_HEIGHT, WORLD_WIDTH, type ClientCommand } from "../src/shared/protocol";
import {
  addBotPlayer,
  addPlayer,
  buildStructure,
  createGame,
  issueCommand,
  queueUnit,
  runBotTurn,
  setPlayerReady,
  snapshotGame,
  stepGame,
} from "../src/server/simulation";

describe("authoritative RTS simulation", () => {
  test("adds four FFA players with distinct colors and corner bases", () => {
    const game = createGame("TEST");

    const red = addPlayer(game, "p1", "Red");
    const blue = addPlayer(game, "p2", "Blue");
    const green = addPlayer(game, "p3", "Green");
    const yellow = addPlayer(game, "p4", "Yellow");
    const full = addPlayer(game, "p5", "Overflow");

    expect(red.ok).toBe(true);
    expect(blue.ok).toBe(true);
    expect(green.ok).toBe(true);
    expect(yellow.ok).toBe(true);
    expect(full.ok).toBe(false);
    expect(MAX_PLAYERS).toBe(4);
    expect(snapshotGame(game).players.map((player) => player.color)).toEqual(["red", "blue", "green", "yellow"]);
    expect(game.entities.filter((entity) => entity.kind === "hq")).toHaveLength(4);
    expect(game.entities.filter((entity) => entity.role === "unit")).toHaveLength(12);

    const hqs = game.entities.filter((entity) => entity.kind === "hq");
    expect(hqs.some((hq) => hq.x < WORLD_WIDTH / 2 && hq.y > WORLD_HEIGHT / 2)).toBe(true);
    expect(hqs.some((hq) => hq.x > WORLD_WIDTH / 2 && hq.y < WORLD_HEIGHT / 2)).toBe(true);
    expect(hqs.some((hq) => hq.x < WORLD_WIDTH / 2 && hq.y < WORLD_HEIGHT / 2)).toBe(true);
    expect(hqs.some((hq) => hq.x > WORLD_WIDTH / 2 && hq.y > WORLD_HEIGHT / 2)).toBe(true);
  });

  test("spends resources and spawns queued units after build time", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");

    const before = snapshotGame(game).players[0].resources;
    const result = queueUnit(game, "p1", "tank");

    expect(result.ok).toBe(true);
    expect(snapshotGame(game).players[0].resources).toBe(before - UNIT_DEFS.tank.cost);
    expect(game.production).toHaveLength(1);

    stepGame(game, UNIT_DEFS.tank.buildTimeMs);

    expect(game.production).toHaveLength(0);
    expect(game.entities.filter((entity) => entity.ownerId === "p1" && entity.kind === "tank")).toHaveLength(2);
  });

  test("does not create resources without harvester deliveries", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    game.entities = game.entities.filter((entity) => entity.kind !== "harvester");
    const startingResources = game.players[0].resources;

    stepGame(game, 15000);

    expect(game.players[0].resources).toBe(startingResources);
  });

  test("harvesters automatically gather ore and deliver it to base", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    game.players[0].resources = 0;

    for (let index = 0; index < 80; index += 1) {
      stepGame(game, 500);
    }

    expect(game.players[0].resources).toBeGreaterThan(0);
  });

  test("harvesters ignore player commands and keep harvesting", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    const harvester = game.entities.find((entity) => entity.ownerId === "p1" && entity.kind === "harvester");
    expect(harvester).toBeDefined();

    const result = issueCommand(game, "p1", {
      type: "move",
      entityIds: [harvester!.id],
      x: 1200,
      y: 900,
    });

    expect(result.ok).toBe(false);
    stepGame(game, 500);
    expect(harvester!.harvestMode).toBeDefined();
    expect(harvester!.order.type).toBe("idle");
  });

  test("moves owned units toward commanded locations", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    const tank = game.entities.find((entity) => entity.ownerId === "p1" && entity.kind === "tank");
    expect(tank).toBeDefined();
    const startX = tank!.x;

    const command: ClientCommand = { type: "move", entityIds: [tank!.id], x: startX + 500, y: tank!.y };
    const result = issueCommand(game, "p1", command);
    stepGame(game, 1000);

    expect(result.ok).toBe(true);
    expect(tank!.x).toBeGreaterThan(startX + 40);
  });

  test("move commands stay inside the playable map", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    const tank = game.entities.find((entity) => entity.ownerId === "p1" && entity.kind === "tank");
    expect(tank).toBeDefined();

    const result = issueCommand(game, "p1", { type: "move", entityIds: [tank!.id], x: 99999, y: -99999 });
    stepGame(game, 20000);

    expect(result.ok).toBe(true);
    expect(tank!.x).toBeLessThanOrEqual(WORLD_WIDTH - tank!.radius);
    expect(tank!.y).toBeGreaterThanOrEqual(tank!.radius);
  });

  test("rejects commands for enemy units", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    addPlayer(game, "p2", "Blue");
    const enemyTank = game.entities.find((entity) => entity.ownerId === "p2" && entity.kind === "tank");
    expect(enemyTank).toBeDefined();

    const result = issueCommand(game, "p1", {
      type: "move",
      entityIds: [enemyTank!.id],
      x: 800,
      y: 800,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/own units/i);
  });

  test("resolves attacks and ends the game when an HQ is destroyed", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    addPlayer(game, "p2", "Blue");
    const redTank = game.entities.find((entity) => entity.ownerId === "p1" && entity.kind === "tank");
    const blueHq = game.entities.find((entity) => entity.ownerId === "p2" && entity.kind === "hq");
    expect(redTank).toBeDefined();
    expect(blueHq).toBeDefined();
    redTank!.x = blueHq!.x - 80;
    redTank!.y = blueHq!.y;
    blueHq!.hp = redTank!.damage;

    const result = issueCommand(game, "p1", {
      type: "attack",
      entityIds: [redTank!.id],
      targetId: blueHq!.id,
    });
    stepGame(game, 100);

    expect(result.ok).toBe(true);
    expect(game.phase).toBe("gameover");
    expect(game.winnerId).toBe("p1");
  });

  test("adds three ready bots and starts a four-player FFA when the human is ready", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Human");
    const bot1 = addBotPlayer(game, "bot-TEST-1");
    const bot2 = addBotPlayer(game, "bot-TEST-2");
    const bot3 = addBotPlayer(game, "bot-TEST-3");

    expect(bot1.ok).toBe(true);
    expect(bot2.ok).toBe(true);
    expect(bot3.ok).toBe(true);
    expect(game.players.filter((player) => player.isBot)).toHaveLength(3);
    expect(game.phase).toBe("lobby");
    setPlayerReady(game, "p1", true);
    expect(game.phase).toBe("playing");

    runBotTurn(game, "bot-TEST-1");

    expect(game.production.some((item) => item.playerId === "bot-TEST-1")).toBe(true);
    expect(
      game.entities
        .filter((entity) => entity.ownerId === "bot-TEST-1" && entity.role === "unit")
        .some((entity) => entity.order.type === "attack"),
    ).toBe(false);

    game.tick = 220;
    runBotTurn(game, "bot-TEST-1");

    expect(
      game.entities
        .filter((entity) => entity.ownerId === "bot-TEST-1" && entity.role === "unit")
        .some((entity) => entity.order.type === "attack"),
    ).toBe(true);
  });

  test("four-player FFA continues until only one HQ remains", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    addPlayer(game, "p2", "Blue");
    addPlayer(game, "p3", "Green");
    addPlayer(game, "p4", "Yellow");
    for (const player of game.players) {
      setPlayerReady(game, player.id, true);
    }

    for (const hq of game.entities.filter((entity) => entity.kind === "hq" && entity.ownerId !== "p1").slice(0, 2)) {
      hq.hp = 0;
    }
    stepGame(game, 100);

    expect(game.phase).toBe("playing");
    expect(game.winnerId).toBeUndefined();

    const lastEnemyHq = game.entities.find((entity) => entity.kind === "hq" && entity.ownerId === "p4");
    expect(lastEnemyHq).toBeDefined();
    lastEnemyHq!.hp = 0;
    stepGame(game, 100);

    expect(game.phase).toBe("gameover");
    expect(game.winnerId).toBe("p1");
  });

  test("idle units automatically attack enemies in range", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    addPlayer(game, "p2", "Blue");
    const redTank = game.entities.find((entity) => entity.ownerId === "p1" && entity.kind === "tank");
    const blueRifle = game.entities.find((entity) => entity.ownerId === "p2" && entity.kind === "rifle");
    expect(redTank).toBeDefined();
    expect(blueRifle).toBeDefined();
    blueRifle!.x = redTank!.x + redTank!.range - 20;
    blueRifle!.y = redTank!.y;
    const startingHp = blueRifle!.hp;

    stepGame(game, redTank!.cooldownMs);

    expect(blueRifle!.hp).toBeLessThan(startingHp);
  });

  test("builds turrets that automatically attack enemies in range", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    addPlayer(game, "p2", "Blue");
    const player = game.players[0];
    player.resources = 1000;
    const result = buildStructure(game, "p1", "turret");
    const turret = game.entities.find((entity) => entity.ownerId === "p1" && entity.kind === "turret");
    const enemy = game.entities.find((entity) => entity.ownerId === "p2" && entity.kind === "rifle");
    expect(result.ok).toBe(true);
    expect(turret).toBeDefined();
    expect(enemy).toBeDefined();
    enemy!.x = turret!.x + turret!.range - 20;
    enemy!.y = turret!.y;
    const startingHp = enemy!.hp;

    stepGame(game, turret!.cooldownMs);

    expect(enemy!.hp).toBeLessThan(startingHp);
  });

  test("artillery damages enemies around the target impact", () => {
    const game = createGame("TEST");
    addPlayer(game, "p1", "Red");
    addPlayer(game, "p2", "Blue");
    game.players[0].resources = 1000;
    queueUnit(game, "p1", "artillery");
    stepGame(game, UNIT_DEFS.artillery.buildTimeMs);
    const artillery = game.entities.find((entity) => entity.ownerId === "p1" && entity.kind === "artillery");
    const target = game.entities.find((entity) => entity.ownerId === "p2" && entity.kind === "tank");
    const nearby = game.entities.find((entity) => entity.ownerId === "p2" && entity.kind === "rifle");
    expect(artillery).toBeDefined();
    expect(target).toBeDefined();
    expect(nearby).toBeDefined();
    if (!artillery) return;
    if (!target) return;
    if (!nearby) return;
    artillery.x = target.x - 140;
    artillery.y = target.y;
    nearby.x = target.x + 36;
    nearby.y = target.y;
    const nearbyStartingHp = nearby.hp;

    const result = issueCommand(game, "p1", { type: "attack", entityIds: [artillery.id], targetId: target.id });
    stepGame(game, artillery.cooldownMs);

    expect(result.ok).toBe(true);
    expect(nearby.hp).toBeLessThan(nearbyStartingHp);
  });
});
