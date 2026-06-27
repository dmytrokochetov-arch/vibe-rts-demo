import { io, type Socket } from "socket.io-client";
import {
  BUILDING_DEFS,
  UNIT_DEFS,
  type BuildableStructureKind,
  type ClientCommand,
  type ClientToServerEvents,
  type EntityState,
  type GameSnapshot,
  type ServerToClientEvents,
  type UnitKind,
} from "../shared/protocol";
import { Renderer, type DragRect } from "./renderer";
import "./styles.css";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface ClientState {
  socket: GameSocket;
  isReady: boolean;
  playerId?: string;
  roomCode?: string;
  snapshot?: GameSnapshot;
  selectedIds: Set<string>;
  dragStart?: { x: number; y: number };
  dragButton?: number;
  dragRect?: DragRect;
  lastRightClickAt: number;
  renderer: Renderer;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root");

app.innerHTML = `
  <main class="shell">
    <section class="topbar">
      <div class="brand">Vibe RTS</div>
      <div class="status-pill" data-status>Disconnected</div>
      <div class="room-pill">ROOM <strong data-room>----</strong></div>
      <div class="stat">ORE <strong data-ore>0</strong></div>
      <div class="stat">POWER <strong>100%</strong></div>
      <div class="stat">UNITS <strong data-units>0</strong></div>
    </section>

    <canvas class="battlefield" data-canvas></canvas>

    <section class="lobby-panel" data-lobby>
      <div class="lobby-card">
        <h1>Two Player RTS Demo</h1>
        <p>Create a room, share the code, then both players press ready.</p>
        <label>
          Commander
          <input data-name maxlength="18" value="Commander" />
        </label>
        <div class="lobby-actions">
          <button data-create>Create Room</button>
          <button data-bot disabled>Add Bot</button>
          <div class="join-row">
            <input data-join-code maxlength="4" placeholder="CODE" />
            <button data-join>Join</button>
          </div>
        </div>
        <button class="ready-button" data-ready disabled>Ready</button>
        <div class="error" data-error></div>
      </div>
    </section>

    <section class="victory-overlay hidden" data-victory>
      <div class="victory-card">
        <div class="victory-icon" data-victory-icon>V</div>
        <h2 data-victory-title>Victory</h2>
        <p data-victory-copy>Enemy HQ destroyed.</p>
        <button data-new-match>New Match</button>
      </div>
    </section>

    <section class="command-panel">
      <div class="minimap" data-minimap></div>
      <div class="production">
        <button data-unit="harvester"><span>Harv</span><strong>${UNIT_DEFS.harvester.cost}</strong></button>
        <button data-unit="rifle"><span>Rifle</span><strong>${UNIT_DEFS.rifle.cost}</strong></button>
        <button data-unit="tank"><span>Tank</span><strong>${UNIT_DEFS.tank.cost}</strong></button>
        <button data-unit="artillery"><span>Arty</span><strong>${UNIT_DEFS.artillery.cost}</strong></button>
        <button data-structure="turret"><span>Tur</span><strong>${BUILDING_DEFS.turret.cost}</strong></button>
      </div>
      <div class="selection" data-selection>No units selected</div>
      <div class="event-log" data-log></div>
    </section>
  </main>
`;

const canvas = app.querySelector<HTMLCanvasElement>("[data-canvas]");
if (!canvas) throw new Error("Missing canvas");
const canvasElement = canvas;

const state: ClientState = {
  socket: io(),
  isReady: false,
  selectedIds: new Set(),
  lastRightClickAt: 0,
  renderer: new Renderer(canvasElement),
};

const elements = {
  status: required("[data-status]"),
  room: required("[data-room]"),
  ore: required("[data-ore]"),
  units: required("[data-units]"),
  lobby: required("[data-lobby]"),
  name: required<HTMLInputElement>("[data-name]"),
  joinCode: required<HTMLInputElement>("[data-join-code]"),
  create: required<HTMLButtonElement>("[data-create]"),
  bot: required<HTMLButtonElement>("[data-bot]"),
  join: required<HTMLButtonElement>("[data-join]"),
  ready: required<HTMLButtonElement>("[data-ready]"),
  error: required("[data-error]"),
  selection: required("[data-selection]"),
  log: required("[data-log]"),
  productionButtons: [...app.querySelectorAll<HTMLButtonElement>("[data-unit]")],
  structureButtons: [...app.querySelectorAll<HTMLButtonElement>("[data-structure]")],
  victory: required("[data-victory]"),
  victoryIcon: required("[data-victory-icon]"),
  victoryTitle: required("[data-victory-title]"),
  victoryCopy: required("[data-victory-copy]"),
  newMatch: required<HTMLButtonElement>("[data-new-match]"),
};

wireSocket();
wireLobby();
wireCanvas();
requestAnimationFrame(frame);

function wireSocket(): void {
  state.socket.on("connect", () => {
    elements.status.textContent = "Connected";
  });

  state.socket.on("disconnect", () => {
    elements.status.textContent = "Disconnected";
  });

  state.socket.on("roomState", (snapshot, playerId) => {
    state.playerId = playerId;
    setSnapshot(snapshot);
    elements.ready.disabled = false;
    showError("");
    addLog(`Joined room ${snapshot.roomCode}`);
  });

  state.socket.on("gameSnapshot", (snapshot) => {
    setSnapshot(snapshot);
  });

  state.socket.on("playerError", (message) => {
    showError(message);
  });

  state.socket.on("gameOver", (snapshot) => {
    setSnapshot(snapshot);
    const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
    addLog(`${winner?.name ?? "A player"} wins`);
  });
}

function wireLobby(): void {
  elements.create.addEventListener("click", () => {
    state.socket.emit("createRoom", playerName(), (result) => handleJoinResult(result));
  });

  elements.join.addEventListener("click", () => {
    state.socket.emit("joinRoom", elements.joinCode.value, playerName(), (result) => handleJoinResult(result));
  });

  elements.bot.addEventListener("click", () => {
    state.socket.emit("addBot", (result) => {
      if (!result.ok) {
        showError(result.error ?? "Could not add bot");
        return;
      }
      elements.bot.disabled = true;
      addLog("Bot joined");
      showError("");
    });
  });

  elements.ready.addEventListener("click", () => {
    state.socket.emit("ready");
    state.isReady = true;
    elements.ready.disabled = true;
    addLog("Ready");
  });

  for (const button of elements.productionButtons) {
    button.addEventListener("click", () => {
      state.socket.emit("queueUnit", button.dataset.unit as UnitKind);
    });
  }

  for (const button of elements.structureButtons) {
    button.addEventListener("click", () => {
      state.socket.emit("buildStructure", button.dataset.structure as BuildableStructureKind);
    });
  }

  elements.newMatch.addEventListener("click", () => {
    window.location.reload();
  });
}

function wireCanvas(): void {
  canvasElement.addEventListener("contextmenu", (event) => event.preventDefault());

  canvasElement.addEventListener("pointerdown", (event) => {
    const point = { x: event.clientX, y: event.clientY };
    if (event.button === 0) {
      event.preventDefault();
      canvasElement.setPointerCapture(event.pointerId);
      state.dragStart = point;
      state.dragButton = event.button;
      state.dragRect = undefined;
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      const now = window.performance.now();
      if (now - state.lastRightClickAt <= 900) {
        state.lastRightClickAt = 0;
        clearSelection();
        resetDragSelection();
        return;
      }
      state.lastRightClickAt = now;
      canvasElement.setPointerCapture(event.pointerId);
      state.dragStart = point;
      state.dragButton = event.button;
      state.dragRect = undefined;
    }
  });

  canvasElement.addEventListener("pointermove", (event) => {
    if (!state.dragStart) return;
    const current = { x: event.clientX, y: event.clientY };
    state.dragRect = normalizeRect(state.dragStart, current);
    state.renderer.setDragRect(state.dragRect);
  });

  canvasElement.addEventListener("pointerup", (event) => {
    if (!state.dragStart) return;
    event.preventDefault();
    const end = { x: event.clientX, y: event.clientY };
    const dragRect = normalizeRect(state.dragStart, end);
    const isClick = dragRect.width < 6 && dragRect.height < 6;
    if (state.dragButton === 0) {
      if (isClick) issueContextCommand(end);
    } else if (isClick) {
      const entity = state.renderer.ownedUnitAt(end.x, end.y, state.playerId);
      if (entity) selectSingle(end);
    } else {
      selectMany(dragRect);
    }
    resetDragSelection();
    if (canvasElement.hasPointerCapture(event.pointerId)) {
      canvasElement.releasePointerCapture(event.pointerId);
    }
  });

  canvasElement.addEventListener("pointercancel", resetDragSelection);
  canvasElement.addEventListener("lostpointercapture", resetDragSelection);
}

function handleJoinResult(result: { ok: boolean; roomCode?: string; error?: string }): void {
  if (!result.ok) {
    showError(result.error ?? "Could not join room");
    return;
  }
  state.roomCode = result.roomCode;
  elements.lobby.classList.add("compact");
  elements.bot.disabled = false;
  showError("");
}

function setSnapshot(snapshot: GameSnapshot): void {
  state.snapshot = snapshot;
  state.roomCode = snapshot.roomCode;
  state.renderer.setSnapshot(snapshot, state.playerId);
  state.selectedIds = new Set(
    [...state.selectedIds].filter((id) =>
      snapshot.entities.some((entity) => entity.id === id && entity.kind !== "harvester"),
    ),
  );
  state.renderer.setSelection(state.selectedIds);
  updateHud(snapshot);
  if (snapshot.phase === "playing") elements.lobby.classList.add("hidden");
  if (snapshot.phase === "gameover") {
    elements.lobby.classList.add("hidden");
    updateVictoryOverlay(snapshot);
  } else {
    elements.victory.classList.add("hidden");
  }
  if (snapshot.phase === "lobby" && state.playerId) {
    elements.lobby.classList.add("compact");
    elements.ready.disabled = state.isReady;
  }
}

function updateHud(snapshot: GameSnapshot): void {
  const player = snapshot.players.find((candidate) => candidate.id === state.playerId);
  const hasBot = snapshot.players.some((candidate) => candidate.isBot);
  elements.room.textContent = snapshot.roomCode;
  elements.ore.textContent = String(player?.resources ?? 0);
  elements.units.textContent = String(snapshot.entities.filter((entity) => entity.ownerId === state.playerId && entity.role === "unit").length);
  elements.status.textContent =
    snapshot.phase === "gameover"
      ? "Game Over"
      : snapshot.phase === "playing"
        ? "In Battle"
        : hasBot
          ? "Bot Ready"
          : `${snapshot.players.length}/2 Commanders`;
  elements.bot.disabled = !state.playerId || snapshot.phase !== "lobby" || snapshot.players.length >= 2;

  const selected = selectedEntities();
  elements.selection.textContent =
    selected.length === 0
      ? "No units selected"
      : selected.length === 1
        ? `${selected[0].kind.toUpperCase()} ${Math.ceil(selected[0].hp)}/${selected[0].maxHp}`
        : `${selected.length} units selected`;

  const affordable = new Set<UnitKind>();
  for (const kind of Object.keys(UNIT_DEFS) as UnitKind[]) {
    if ((player?.resources ?? 0) >= UNIT_DEFS[kind].cost) affordable.add(kind);
  }
  for (const button of elements.productionButtons) {
    const kind = button.dataset.unit as UnitKind;
    button.disabled = !affordable.has(kind) || snapshot.phase !== "playing";
  }
  for (const button of elements.structureButtons) {
    const kind = button.dataset.structure as BuildableStructureKind;
    button.disabled = (player?.resources ?? 0) < (BUILDING_DEFS[kind].cost ?? 0) || snapshot.phase !== "playing";
  }
}

function issueContextCommand(point: { x: number; y: number }): void {
  const snapshot = state.snapshot;
  if (!snapshot || state.selectedIds.size === 0) return;
  const selectedIds = [...state.selectedIds];
  const target = state.renderer.entityAt(point.x, point.y);
  let command: ClientCommand;
  if (target && target.ownerId !== state.playerId) {
    command = { type: "attack", entityIds: selectedIds, targetId: target.id };
    addLog(`Attack ${target.kind}`);
  } else {
    const world = state.renderer.screenToWorld(point.x, point.y);
    command = { type: "move", entityIds: selectedIds, x: world.x, y: world.y };
    addLog("Move order");
  }
  state.socket.emit("command", command);
}

function selectSingle(point: { x: number; y: number }): void {
  const entity = state.renderer.ownedUnitAt(point.x, point.y, state.playerId);
  state.selectedIds.clear();
  if (entity && entity.kind !== "harvester") {
    state.selectedIds.add(entity.id);
  }
  state.renderer.setSelection(state.selectedIds);
}

function selectMany(rect: DragRect): void {
  state.selectedIds = new Set(
    state.renderer
      .entitiesInRect(rect)
      .filter((entity) => entity.ownerId === state.playerId && entity.role === "unit" && entity.kind !== "harvester")
      .map((entity) => entity.id),
  );
  state.renderer.setSelection(state.selectedIds);
}

function clearSelection(): void {
  state.selectedIds.clear();
  state.renderer.setSelection(state.selectedIds);
  updateHudIfPossible();
}

function selectedEntities(): EntityState[] {
  if (!state.snapshot) return [];
  return state.snapshot.entities.filter((entity) => state.selectedIds.has(entity.id));
}

function frame(): void {
  state.renderer.render();
  requestAnimationFrame(frame);
}

function playerName(): string {
  return elements.name.value.trim() || "Commander";
}

function showError(message: string): void {
  elements.error.textContent = message;
}

function updateHudIfPossible(): void {
  if (state.snapshot) updateHud(state.snapshot);
}

function updateVictoryOverlay(snapshot: GameSnapshot): void {
  const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);
  const didWin = snapshot.winnerId === state.playerId;
  elements.victory.classList.toggle("defeat", !didWin);
  elements.victoryIcon.textContent = didWin ? "V" : "X";
  elements.victoryTitle.textContent = didWin ? "Victory" : "Defeat";
  elements.victoryCopy.textContent = `${winner?.name ?? "A commander"} destroyed the enemy HQ.`;
  elements.victory.classList.remove("hidden");
}

function addLog(message: string): void {
  const line = document.createElement("div");
  line.textContent = message;
  elements.log.prepend(line);
  while (elements.log.children.length > 5) {
    elements.log.lastElementChild?.remove();
  }
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): DragRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function resetDragSelection(): void {
  state.dragStart = undefined;
  state.dragButton = undefined;
  state.dragRect = undefined;
  state.renderer.setDragRect(undefined);
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = app?.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
}
