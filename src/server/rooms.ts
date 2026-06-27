import type { Server, Socket } from "socket.io";
import {
  MAX_PLAYERS,
  TICK_MS,
  type ClientCommand,
  type ClientToServerEvents,
  type BuildableStructureKind,
  type JoinResult,
  type ServerToClientEvents,
  type UnitKind,
} from "../shared/protocol.js";
import {
  addBotPlayer,
  addPlayer,
  buildStructure,
  createGame,
  issueCommand,
  queueUnit,
  runBotTurn,
  setPlayerConnected,
  setPlayerReady,
  snapshotGame,
  stepGame,
  type GameState,
} from "./simulation.js";

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

interface RoomRuntime {
  game: GameState;
  playerSockets: Map<string, string>;
  loop?: NodeJS.Timeout;
}

const rooms = new Map<string, RoomRuntime>();
const socketPlayers = new Map<string, { roomCode: string; playerId: string }>();

export function getRoomCount(): number {
  return rooms.size;
}

export function registerRoomHandlers(io: GameServer): void {
  io.on("connection", (socket) => {
    socket.on("createRoom", (name, callback) => {
      const roomCode = createRoomCode();
      const runtime: RoomRuntime = {
        game: createGame(roomCode),
        playerSockets: new Map(),
      };
      rooms.set(roomCode, runtime);
      joinRuntime(io, socket, runtime, roomCode, name, callback);
    });

    socket.on("joinRoom", (roomCodeInput, name, callback) => {
      const roomCode = roomCodeInput.trim().toUpperCase();
      const runtime = rooms.get(roomCode);
      if (!runtime) {
        callback({ ok: false, error: "Room not found" });
        return;
      }
      joinRuntime(io, socket, runtime, roomCode, name, callback);
    });

    socket.on("addBot", (callback) => {
      const context = socketPlayers.get(socket.id);
      if (!context) {
        callback({ ok: false, error: "Create a room first" });
        return;
      }
      const runtime = rooms.get(context.roomCode);
      if (!runtime) {
        callback({ ok: false, error: "Room not found" });
        return;
      }
      if (runtime.game.players.length >= MAX_PLAYERS) {
        callback({ ok: false, error: "Room is full" });
        return;
      }

      const botNumber = runtime.game.players.filter((player) => player.isBot).length + 1;
      const result = addBotPlayer(runtime.game, `bot-${context.roomCode}-${botNumber}`, `AI Commander ${botNumber}`);
      if (!result.ok) {
        callback({ ok: false, error: result.error });
        return;
      }

      callback({ ok: true, roomCode: context.roomCode, playerId: context.playerId, color: result.player?.color });
      emitRoomState(io, runtime, context.roomCode);
      maybeStartLoop(io, runtime, context.roomCode);
    });

    socket.on("ready", () => {
      const context = socketPlayers.get(socket.id);
      if (!context) return;
      const runtime = rooms.get(context.roomCode);
      if (!runtime) return;
      setPlayerReady(runtime.game, context.playerId, true);
      emitRoomState(io, runtime, context.roomCode);
      maybeStartLoop(io, runtime, context.roomCode);
    });

    socket.on("queueUnit", (kind: UnitKind) => {
      const context = socketPlayers.get(socket.id);
      if (!context) return;
      const runtime = rooms.get(context.roomCode);
      if (!runtime) return;
      const result = queueUnit(runtime.game, context.playerId, kind);
      if (!result.ok) socket.emit("playerError", result.error);
      emitRoomState(io, runtime, context.roomCode);
    });

    socket.on("buildStructure", (kind: BuildableStructureKind) => {
      const context = socketPlayers.get(socket.id);
      if (!context) return;
      const runtime = rooms.get(context.roomCode);
      if (!runtime) return;
      const result = buildStructure(runtime.game, context.playerId, kind);
      if (!result.ok) socket.emit("playerError", result.error);
      emitRoomState(io, runtime, context.roomCode);
    });

    socket.on("command", (command: ClientCommand) => {
      const context = socketPlayers.get(socket.id);
      if (!context) return;
      const runtime = rooms.get(context.roomCode);
      if (!runtime) return;
      const result = issueCommand(runtime.game, context.playerId, command);
      if (!result.ok) socket.emit("playerError", result.error);
    });

    socket.on("restart", () => {
      const context = socketPlayers.get(socket.id);
      if (!context) return;
      const runtime = rooms.get(context.roomCode);
      if (!runtime) return;
      const players = runtime.game.players.map((player) => ({
        id: player.id,
        name: player.name,
        isBot: player.isBot,
        ready: false,
        connected: player.connected,
      }));
      if (runtime.loop) clearInterval(runtime.loop);
      runtime.game = createGame(context.roomCode);
      runtime.playerSockets.clear();
      for (const player of players) {
        if (player.isBot) {
          addBotPlayer(runtime.game, player.id, player.name);
        } else {
          addPlayer(runtime.game, player.id, player.name);
        }
        setPlayerReady(runtime.game, player.id, false);
        setPlayerConnected(runtime.game, player.id, player.connected);
        const playerSocketId = [...socketPlayers.entries()].find(
          ([, value]) => value.playerId === player.id && value.roomCode === context.roomCode,
        )?.[0];
        if (playerSocketId) runtime.playerSockets.set(player.id, playerSocketId);
      }
      emitRoomState(io, runtime, context.roomCode);
    });

    socket.on("disconnect", () => {
      const context = socketPlayers.get(socket.id);
      if (!context) return;
      socketPlayers.delete(socket.id);
      const runtime = rooms.get(context.roomCode);
      if (!runtime) return;
      setPlayerConnected(runtime.game, context.playerId, false);
      runtime.playerSockets.delete(context.playerId);
      emitRoomState(io, runtime, context.roomCode);
      cleanupEmptyRoom(context.roomCode, runtime);
    });
  });
}

function joinRuntime(
  io: GameServer,
  socket: GameSocket,
  runtime: RoomRuntime,
  roomCode: string,
  name: string,
  callback: (result: JoinResult) => void,
): void {
  if (runtime.game.players.length >= MAX_PLAYERS) {
    callback({ ok: false, error: "Room is full" });
    return;
  }

  const playerId = socket.id;
  const result = addPlayer(runtime.game, playerId, cleanName(name));
  if (!result.ok) {
    callback({ ok: false, error: result.error });
    return;
  }

  socket.join(roomCode);
  runtime.playerSockets.set(playerId, socket.id);
  socketPlayers.set(socket.id, { roomCode, playerId });
  callback({ ok: true, roomCode, playerId, color: result.player?.color });
  emitRoomState(io, runtime, roomCode);
}

function maybeStartLoop(io: GameServer, runtime: RoomRuntime, roomCode: string): void {
  if (runtime.loop || runtime.game.phase !== "playing") return;
  runtime.loop = setInterval(() => {
    for (const player of runtime.game.players) {
      if (player.isBot) runBotTurn(runtime.game, player.id);
    }
    stepGame(runtime.game, TICK_MS);
    const snapshot = snapshotGame(runtime.game);
    io.to(roomCode).emit("gameSnapshot", snapshot);
    if (snapshot.phase === "gameover") {
      io.to(roomCode).emit("gameOver", snapshot);
      if (runtime.loop) clearInterval(runtime.loop);
      runtime.loop = undefined;
    }
  }, TICK_MS);
}

function emitRoomState(io: GameServer, runtime: RoomRuntime, roomCode: string): void {
  const snapshot = snapshotGame(runtime.game);
  for (const [playerId, socketId] of runtime.playerSockets) {
    io.to(socketId).emit("roomState", snapshot, playerId);
  }
  io.to(roomCode).emit("gameSnapshot", snapshot);
}

function cleanupEmptyRoom(roomCode: string, runtime: RoomRuntime): void {
  if (runtime.game.players.some((player) => player.connected && !player.isBot)) return;
  if (runtime.loop) clearInterval(runtime.loop);
  rooms.delete(roomCode);
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 18) : "Commander";
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    for (let index = 0; index < 4; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-4);
}
