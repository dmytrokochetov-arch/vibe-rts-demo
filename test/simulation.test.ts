import { describe, expect, test } from "vitest";
import { UNIT_DEFS, type ClientCommand } from "../src/shared/protocol";
import {
  addPlayer,
  createGame,
  issueCommand,
  queueUnit,
  snapshotGame,
  stepGame,
} from "../src/server/simulation";

describe("authoritative RTS simulation", () => {
  test("adds two players with opposing HQs and starting forces", () => {
    const game = createGame("TEST");

    const red = addPlayer(game, "p1", "Red");
    const blue = addPlayer(game, "p2", "Blue");

    expect(red.ok).toBe(true);
    expect(blue.ok).toBe(true);
    expect(snapshotGame(game).players.map((player) => player.color)).toEqual(["red", "blue"]);
    expect(game.entities.filter((entity) => entity.kind === "hq")).toHaveLength(2);
    expect(game.entities.filter((entity) => entity.role === "unit")).toHaveLength(6);
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
    stepGame(game, redTank!.cooldownMs);

    expect(result.ok).toBe(true);
    expect(game.phase).toBe("gameover");
    expect(game.winnerId).toBe("p1");
  });
});

