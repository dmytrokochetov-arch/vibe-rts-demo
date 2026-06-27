import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type EntityState,
  type GameSnapshot,
  type PlayerColor,
  type PlayerState,
  type Vec2,
} from "../shared/protocol";

export interface DragRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Camera {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

interface Palette {
  accent: string;
  dark: string;
  fill: string;
  light: string;
  shadow: string;
}

interface OreField {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
}

interface TerrainDecoration {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  type: "barrier" | "rocks" | "scorch" | "wreck";
}

interface TerrainPad {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface TerrainRoad {
  from: Vec2;
  to: Vec2;
  width: number;
}

interface TerrainRidge {
  points: readonly Vec2[];
}

const PLAYER_PALETTES: Record<PlayerColor, Palette> = {
  red: {
    accent: "#ff8a65",
    dark: "#8f2d2d",
    fill: "#d84a4a",
    light: "#ffd0bd",
    shadow: "rgba(72, 14, 14, 0.58)",
  },
  blue: {
    accent: "#62d3ff",
    dark: "#24539d",
    fill: "#3b82f6",
    light: "#c8f2ff",
    shadow: "rgba(14, 31, 72, 0.58)",
  },
};

const NEUTRAL_PALETTE: Palette = {
  accent: "#d7ca82",
  dark: "#57534e",
  fill: "#898773",
  light: "#f4edc3",
  shadow: "rgba(18, 18, 15, 0.5)",
};

const TERRAIN_SEED = 7331;
const MIN_HIT_RADIUS = 10;
const TERRAIN_ROADS: readonly TerrainRoad[] = [
  {
    from: { x: WORLD_WIDTH * 0.08, y: WORLD_HEIGHT * 0.58 },
    to: { x: WORLD_WIDTH * 0.92, y: WORLD_HEIGHT * 0.46 },
    width: 26,
  },
  {
    from: { x: WORLD_WIDTH * 0.12, y: WORLD_HEIGHT * 0.76 },
    to: { x: WORLD_WIDTH * 0.36, y: WORLD_HEIGHT * 0.68 },
    width: 18,
  },
  {
    from: { x: WORLD_WIDTH * 0.66, y: WORLD_HEIGHT * 0.3 },
    to: { x: WORLD_WIDTH * 0.88, y: WORLD_HEIGHT * 0.24 },
    width: 18,
  },
];
const TERRAIN_PADS: readonly TerrainPad[] = [
  { x: WORLD_WIDTH * 0.16, y: WORLD_HEIGHT * 0.18, width: 180, height: 106, rotation: 0.04 },
  { x: WORLD_WIDTH * 0.84, y: WORLD_HEIGHT * 0.82, width: 188, height: 110, rotation: 0.04 },
  { x: WORLD_WIDTH * 0.52, y: WORLD_HEIGHT * 0.48, width: 132, height: 84, rotation: -0.08 },
  { x: WORLD_WIDTH * 0.74, y: WORLD_HEIGHT * 0.27, width: 112, height: 76, rotation: 0.12 },
];
const TERRAIN_DECORATIONS: readonly TerrainDecoration[] = [
  { type: "scorch", x: WORLD_WIDTH * 0.38, y: WORLD_HEIGHT * 0.26, scale: 0.76, rotation: 0.4 },
  { type: "scorch", x: WORLD_WIDTH * 0.62, y: WORLD_HEIGHT * 0.72, scale: 0.88, rotation: -0.25 },
  { type: "rocks", x: WORLD_WIDTH * 0.18, y: WORLD_HEIGHT * 0.54, scale: 1.05, rotation: -0.4 },
  { type: "rocks", x: WORLD_WIDTH * 0.7, y: WORLD_HEIGHT * 0.44, scale: 0.9, rotation: 0.2 },
  { type: "barrier", x: WORLD_WIDTH * 0.31, y: WORLD_HEIGHT * 0.39, scale: 0.86, rotation: -0.26 },
  { type: "barrier", x: WORLD_WIDTH * 0.75, y: WORLD_HEIGHT * 0.66, scale: 0.78, rotation: -0.12 },
  { type: "wreck", x: WORLD_WIDTH * 0.52, y: WORLD_HEIGHT * 0.22, scale: 0.76, rotation: 0.55 },
];
const TERRAIN_RIDGES: readonly TerrainRidge[] = [
  {
    points: [
      { x: WORLD_WIDTH * 0.02, y: WORLD_HEIGHT * 0.37 },
      { x: WORLD_WIDTH * 0.14, y: WORLD_HEIGHT * 0.3 },
      { x: WORLD_WIDTH * 0.25, y: WORLD_HEIGHT * 0.32 },
      { x: WORLD_WIDTH * 0.35, y: WORLD_HEIGHT * 0.43 },
      { x: WORLD_WIDTH * 0.31, y: WORLD_HEIGHT * 0.52 },
      { x: WORLD_WIDTH * 0.12, y: WORLD_HEIGHT * 0.5 },
    ],
  },
  {
    points: [
      { x: WORLD_WIDTH * 0.63, y: WORLD_HEIGHT * 0.1 },
      { x: WORLD_WIDTH * 0.86, y: WORLD_HEIGHT * 0.14 },
      { x: WORLD_WIDTH * 0.95, y: WORLD_HEIGHT * 0.31 },
      { x: WORLD_WIDTH * 0.85, y: WORLD_HEIGHT * 0.43 },
      { x: WORLD_WIDTH * 0.68, y: WORLD_HEIGHT * 0.37 },
    ],
  },
  {
    points: [
      { x: WORLD_WIDTH * 0.42, y: WORLD_HEIGHT * 0.67 },
      { x: WORLD_WIDTH * 0.66, y: WORLD_HEIGHT * 0.61 },
      { x: WORLD_WIDTH * 0.82, y: WORLD_HEIGHT * 0.73 },
      { x: WORLD_WIDTH * 0.74, y: WORLD_HEIGHT * 0.92 },
      { x: WORLD_WIDTH * 0.48, y: WORLD_HEIGHT * 0.88 },
    ],
  },
];

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly selection = new Set<string>();
  private camera: Camera = { offsetX: 0, offsetY: 0, zoom: 1 };
  private dragRect?: DragRect;
  private localPlayerId?: string;
  private snapshot?: GameSnapshot;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = getCanvasContext(canvas);
    this.resizeCanvas();
    this.updateCamera();
  }

  setSnapshot(snapshot: GameSnapshot, localPlayerId?: string): void {
    this.snapshot = snapshot;
    this.localPlayerId = localPlayerId;
  }

  setSelection(ids: Set<string>): void {
    this.selection.clear();

    for (const id of ids) {
      this.selection.add(id);
    }
  }

  setDragRect(rect?: DragRect): void {
    this.dragRect = rect;
  }

  screenToWorld(clientX: number, clientY: number): Vec2 {
    this.resizeCanvas();
    this.updateCamera();

    const point = this.clientToCanvas(clientX, clientY);

    return {
      x: clamp((point.x - this.camera.offsetX) / this.camera.zoom, 0, WORLD_WIDTH),
      y: clamp((point.y - this.camera.offsetY) / this.camera.zoom, 0, WORLD_HEIGHT),
    };
  }

  entityAt(clientX: number, clientY: number): EntityState | undefined {
    return this.pickEntity(clientX, clientY, () => true);
  }

  ownedUnitAt(clientX: number, clientY: number, ownerId?: string): EntityState | undefined {
    if (!ownerId) {
      return undefined;
    }

    return this.pickEntity(
      clientX,
      clientY,
      (entity) => entity.ownerId === ownerId && entity.role === "unit" && entity.kind !== "harvester",
      true,
    );
  }

  entitiesInRect(rect: DragRect): EntityState[] {
    if (!this.snapshot) {
      return [];
    }

    this.resizeCanvas();
    this.updateCamera();

    const worldRect = this.dragRectToWorldRect(rect);

    return this.snapshot.entities.filter((entity) => circleIntersectsRect(entity, selectionHitRadius(entity), worldRect));
  }

  render(): void {
    this.resizeCanvas();
    this.updateCamera();
    this.clear();

    this.withWorldTransform(() => {
      this.drawTerrain();
      this.drawOreFields();

      if (this.snapshot) {
        const playerById = new Map(this.snapshot.players.map((player) => [player.id, player]));
        this.drawBasePads(this.snapshot, playerById);
        this.drawCommandPaths(this.snapshot);
        this.drawProjectiles(this.snapshot, playerById);
        this.drawEntities(this.snapshot, playerById);
        this.drawExplosions(this.snapshot);
      }

      this.drawWorldBorder();
    });

    if (!this.snapshot) {
      this.drawWaitingState();
    }

    if (this.dragRect) {
      this.drawDragRect(this.dragRect);
    }
  }

  private canvasToWorld(point: Vec2): Vec2 {
    return {
      x: (point.x - this.camera.offsetX) / this.camera.zoom,
      y: (point.y - this.camera.offsetY) / this.camera.zoom,
    };
  }

  private clear(): void {
    const size = this.canvasSize();

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, size.width, size.height);
    this.ctx.fillStyle = "#0f1517";
    this.ctx.fillRect(0, 0, size.width, size.height);
  }

  private clientToCanvas(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  private pickEntity(
    clientX: number,
    clientY: number,
    predicate: (entity: EntityState) => boolean,
    preferUnits = false,
  ): EntityState | undefined {
    if (!this.snapshot || !this.isInsideWorld(clientX, clientY)) {
      return undefined;
    }

    const world = this.screenToWorld(clientX, clientY);
    let bestEntity: EntityState | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const entity of this.snapshot.entities) {
      if (!predicate(entity)) {
        continue;
      }

      const distance = Math.hypot(entity.x - world.x, entity.y - world.y);
      const hitRadius = selectionHitRadius(entity) + MIN_HIT_RADIUS / this.camera.zoom;

      if (distance > hitRadius) {
        continue;
      }

      const unitBias = entity.role === "unit" ? (preferUnits ? -100 : -12) : 0;
      const score = distance - hitRadius + unitBias;

      if (score < bestScore) {
        bestScore = score;
        bestEntity = entity;
      }
    }

    return bestEntity;
  }

  private clientRectToCanvasRect(rect: DragRect): DragRect {
    const start = this.clientToCanvas(rect.x, rect.y);
    const end = this.clientToCanvas(rect.x + rect.width, rect.y + rect.height);

    return normalizeRect({
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
    });
  }

  private canvasSize(): { width: number; height: number } {
    const rect = this.canvas.getBoundingClientRect();

    return {
      width: Math.max(1, rect.width || this.canvas.clientWidth || window.innerWidth || 1),
      height: Math.max(1, rect.height || this.canvas.clientHeight || window.innerHeight || 1),
    };
  }

  private dragRectToWorldRect(rect: DragRect): DragRect {
    const canvasRect = this.clientRectToCanvasRect(rect);
    const start = this.canvasToWorld({ x: canvasRect.x, y: canvasRect.y });
    const end = this.canvasToWorld({
      x: canvasRect.x + canvasRect.width,
      y: canvasRect.y + canvasRect.height,
    });

    return normalizeRect({
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
    });
  }

  private drawArtillery(radius: number, palette: Palette): void {
    const ctx = this.ctx;

    ctx.fillStyle = "rgba(7, 10, 12, 0.46)";
    roundedRectPath(ctx, -radius * 0.74, -radius * 0.34, radius * 1.28, radius * 0.82, 4);
    ctx.fill();
    ctx.fillStyle = palette.dark;
    roundedRectPath(ctx, -radius * 0.62, -radius * 0.38, radius * 1.05, radius * 0.74, 5);
    ctx.fill();
    ctx.fillStyle = palette.fill;
    roundedRectPath(ctx, -radius * 0.42, -radius * 0.26, radius * 0.7, radius * 0.52, 4);
    ctx.fill();

    ctx.strokeStyle = palette.dark;
    ctx.lineCap = "round";
    ctx.lineWidth = 8 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(radius * 0.02, -radius * 0.02);
    ctx.lineTo(radius * 1.72, -radius * 0.44);
    ctx.stroke();
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 3 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(radius * 0.18, -radius * 0.04);
    ctx.lineTo(radius * 1.75, -radius * 0.43);
    ctx.stroke();

    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(-radius * 0.32, radius * 0.36, radius * 0.22, 0, Math.PI * 2);
    ctx.arc(radius * 0.28, radius * 0.36, radius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 2.2 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.56, radius * 0.26);
    ctx.lineTo(-radius * 1.08, radius * 0.78);
    ctx.moveTo(-radius * 0.42, radius * 0.2);
    ctx.lineTo(-radius * 1.12, radius * 0.28);
    ctx.stroke();

    ctx.fillStyle = palette.accent;
    ctx.fillRect(radius * 1.58, -radius * 0.52, radius * 0.22, radius * 0.14);
  }

  private drawBuilding(entity: EntityState, palette: Palette): void {
    const ctx = this.ctx;
    const size = entity.radius * 1.72;

    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.fillStyle = palette.shadow;
    roundedRectPath(ctx, -size / 2 + 5, -size / 2 + 7, size, size, 7);
    ctx.fill();
    ctx.fillStyle = palette.dark;
    roundedRectPath(ctx, -size / 2, -size / 2, size, size, 7);
    ctx.fill();

    if (entity.kind === "hq") {
      ctx.fillStyle = palette.fill;
      polygon(ctx, [
        { x: -size * 0.42, y: -size * 0.22 },
        { x: -size * 0.14, y: -size * 0.46 },
        { x: size * 0.24, y: -size * 0.39 },
        { x: size * 0.45, y: -size * 0.08 },
        { x: size * 0.34, y: size * 0.34 },
        { x: -size * 0.24, y: size * 0.42 },
        { x: -size * 0.48, y: size * 0.12 },
      ]);
      ctx.fill();
      ctx.strokeStyle = palette.light;
      ctx.lineWidth = 2 / this.camera.zoom;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.34);
      ctx.lineTo(0, -size * 0.68);
      ctx.moveTo(-size * 0.1, -size * 0.55);
      ctx.lineTo(size * 0.11, -size * 0.55);
      ctx.stroke();
    } else if (entity.kind === "factory") {
      ctx.fillStyle = palette.fill;
      roundedRectPath(ctx, -size * 0.42, -size * 0.32, size * 0.84, size * 0.58, 5);
      ctx.fill();
      ctx.fillStyle = palette.accent;

      for (let index = 0; index < 3; index += 1) {
        ctx.fillRect(-size * 0.32 + index * size * 0.24, -size * 0.46, size * 0.14, size * 0.2);
      }

      ctx.fillStyle = "rgba(13, 16, 18, 0.42)";
      ctx.fillRect(-size * 0.22, size * 0.02, size * 0.44, size * 0.24);
    } else if (entity.kind === "refinery") {
      ctx.fillStyle = palette.fill;
      roundedRectPath(ctx, -size * 0.36, -size * 0.34, size * 0.72, size * 0.68, 6);
      ctx.fill();
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(-size * 0.18, -size * 0.02, size * 0.17, 0, Math.PI * 2);
      ctx.arc(size * 0.18, -size * 0.02, size * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(13, 16, 18, 0.38)";
      ctx.fillRect(-size * 0.36, size * 0.24, size * 0.72, size * 0.09);
    } else {
      ctx.fillStyle = palette.fill;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.dark;
      roundedRectPath(ctx, -size * 0.22, -size * 0.2, size * 0.44, size * 0.4, 5);
      ctx.fill();
      ctx.strokeStyle = palette.light;
      ctx.lineCap = "round";
      ctx.lineWidth = 7 / this.camera.zoom;
      ctx.beginPath();
      ctx.moveTo(size * 0.06, -size * 0.04);
      ctx.lineTo(size * 0.62, -size * 0.34);
      ctx.stroke();
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2.5 / this.camera.zoom;
      ctx.beginPath();
      ctx.moveTo(size * 0.12, -size * 0.06);
      ctx.lineTo(size * 0.62, -size * 0.34);
      ctx.stroke();
    }

    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 2 / this.camera.zoom;
    roundedRectPath(ctx, -size / 2, -size / 2, size, size, 7);
    ctx.stroke();
    ctx.restore();
  }

  private drawBasePads(snapshot: GameSnapshot, playerById: ReadonlyMap<string, PlayerState>): void {
    const ctx = this.ctx;

    for (const entity of snapshot.entities) {
      if (entity.role !== "building") {
        continue;
      }

      const palette = paletteForEntity(entity, playerById);
      const width = entity.radius * (entity.kind === "hq" ? 3.05 : 2.55);
      const height = entity.radius * (entity.kind === "hq" ? 2.55 : 2.12);

      ctx.save();
      ctx.translate(entity.x, entity.y);
      ctx.rotate(entity.kind === "factory" ? -0.08 : entity.kind === "refinery" ? 0.1 : 0);
      ctx.globalAlpha = 0.36;
      ctx.fillStyle = "rgba(11, 16, 18, 0.58)";
      roundedRectPath(ctx, -width / 2 + 4, -height / 2 + 6, width, height, 8);
      ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = palette.accent;
      roundedRectPath(ctx, -width / 2, -height / 2, width, height, 8);
      ctx.fill();
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = palette.light;
      ctx.lineWidth = 1.4 / this.camera.zoom;
      roundedRectPath(ctx, -width / 2, -height / 2, width, height, 8);
      ctx.stroke();
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = "rgba(236, 254, 255, 0.72)";
      ctx.beginPath();
      ctx.moveTo(-width * 0.36, 0);
      ctx.lineTo(width * 0.36, 0);
      ctx.moveTo(0, -height * 0.34);
      ctx.lineTo(0, height * 0.34);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawCommandPaths(snapshot: GameSnapshot): void {
    if (this.selection.size === 0) {
      return;
    }

    const ctx = this.ctx;
    const entitiesById = new Map(snapshot.entities.map((entity) => [entity.id, entity]));

    ctx.save();
    ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.setLineDash([8 / this.camera.zoom, 7 / this.camera.zoom]);

    for (const entity of snapshot.entities) {
      if (!this.selection.has(entity.id)) {
        continue;
      }

      if (entity.order.type === "move") {
        ctx.strokeStyle = "rgba(238, 231, 167, 0.82)";
        ctx.beginPath();
        ctx.moveTo(entity.x, entity.y);
        ctx.lineTo(entity.order.x, entity.order.y);
        ctx.stroke();
        drawMoveMarker(ctx, entity.order, this.camera.zoom);
      }

      if (entity.order.type === "attack") {
        const target = entitiesById.get(entity.order.targetId);

        if (!target) {
          continue;
        }

        ctx.strokeStyle = "rgba(255, 128, 116, 0.84)";
        ctx.beginPath();
        ctx.moveTo(entity.x, entity.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawDragRect(rect: DragRect): void {
    const canvasRect = this.clientRectToCanvasRect(rect);
    const ratio = this.canvas.width / this.canvasSize().width;
    const ctx = this.ctx;
    const x = canvasRect.x + 0.5;
    const y = canvasRect.y + 0.5;
    const width = Math.max(0, canvasRect.width - 1);
    const height = Math.max(0, canvasRect.height - 1);
    const corner = Math.min(18, Math.max(8, Math.min(width, height) * 0.28));

    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "rgba(34, 211, 238, 0.18)";
    ctx.fillRect(canvasRect.x, canvasRect.y, canvasRect.width, canvasRect.height);

    ctx.setLineDash([]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(2, 6, 23, 0.86)";
    ctx.strokeRect(x, y, width, height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(236, 254, 255, 0.98)";
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(x, y, width, height);

    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(103, 232, 249, 1)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + corner);
    ctx.lineTo(x, y);
    ctx.lineTo(x + corner, y);
    ctx.moveTo(x + width - corner, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + corner);
    ctx.moveTo(x + width, y + height - corner);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width - corner, y + height);
    ctx.moveTo(x + corner, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + height - corner);
    ctx.stroke();
    ctx.restore();
  }

  private drawEntities(snapshot: GameSnapshot, playerById: ReadonlyMap<string, PlayerState>): void {
    const entities = [...snapshot.entities].sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "building" ? -1 : 1;
      }

      return left.y - right.y;
    });

    for (const entity of entities) {
      const palette = paletteForEntity(entity, playerById);
      const isSelected = this.selection.has(entity.id);

      if (entity.kind === "turret") {
        this.drawRange(entity, palette);
      }

      if (isSelected) {
        this.drawRange(entity, palette);
      }

      if (entity.role === "building") {
        this.drawBuilding(entity, palette);
      } else {
        this.drawUnit(entity, palette);
      }

      this.drawHealthBar(entity);
      this.drawOwnerChevron(entity, palette);

      if (isSelected) {
        this.drawSelectionRing(entity);
      }
    }
  }

  private drawExplosions(snapshot: GameSnapshot): void {
    const ctx = this.ctx;

    for (const explosion of snapshot.explosions) {
      const progress = clamp(explosion.ageMs / 650, 0, 1);
      const maxRadius = explosion.radius ?? 52;
      const radius = 10 + progress * maxRadius;
      const alpha = 1 - progress;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffdd79";
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = explosion.radius && explosion.radius > 60 ? "rgba(255, 204, 102, 0.92)" : "#ff7a4f";
      ctx.lineWidth = (explosion.radius && explosion.radius > 60 ? 3 : 4) / this.camera.zoom;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (explosion.radius && explosion.radius > 60) {
        ctx.fillStyle = "rgba(255, 184, 77, 0.12)";
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawHarvester(radius: number, palette: Palette): void {
    const ctx = this.ctx;

    ctx.fillStyle = palette.dark;
    polygon(ctx, [
      { x: -radius * 0.86, y: -radius * 0.5 },
      { x: radius * 0.34, y: -radius * 0.56 },
      { x: radius * 0.72, y: -radius * 0.22 },
      { x: radius * 0.62, y: radius * 0.5 },
      { x: -radius * 0.72, y: radius * 0.54 },
    ]);
    ctx.fill();
    ctx.fillStyle = palette.fill;
    roundedRectPath(ctx, -radius * 0.52, -radius * 0.34, radius * 0.86, radius * 0.68, 4);
    ctx.fill();

    ctx.fillStyle = "rgba(15, 23, 23, 0.52)";
    roundedRectPath(ctx, -radius * 0.34, -radius * 0.22, radius * 0.42, radius * 0.44, 3);
    ctx.fill();

    ctx.fillStyle = "#45d6a5";
    roundedRectPath(ctx, -radius * 0.28, -radius * 0.17, radius * 0.34, radius * 0.34, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(218, 255, 240, 0.48)";
    ctx.fillRect(-radius * 0.2, -radius * 0.12, radius * 0.11, radius * 0.24);

    ctx.strokeStyle = palette.light;
    ctx.lineCap = "round";
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(radius * 0.3, -radius * 0.16);
    ctx.lineTo(radius * 0.88, -radius * 0.38);
    ctx.moveTo(radius * 0.31, radius * 0.16);
    ctx.lineTo(radius * 0.9, radius * 0.38);
    ctx.stroke();

    ctx.fillStyle = "#45d6a5";
    ctx.beginPath();
    ctx.moveTo(radius * 0.74, -radius * 0.34);
    ctx.lineTo(radius * 1.24, -radius * 0.16);
    ctx.lineTo(radius * 1.02, 0);
    ctx.lineTo(radius * 1.24, radius * 0.16);
    ctx.lineTo(radius * 0.74, radius * 0.34);
    ctx.lineTo(radius * 0.88, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = 1.6 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(radius * 1.02, -radius * 0.14);
    ctx.lineTo(radius * 1.02, radius * 0.14);
    ctx.stroke();
  }

  private drawHealthBar(entity: EntityState): void {
    if (entity.hp >= entity.maxHp) {
      return;
    }

    const ctx = this.ctx;
    const width = Math.max(entity.radius * 1.8, 34 / this.camera.zoom);
    const height = 5 / this.camera.zoom;
    const x = entity.x - width / 2;
    const y = entity.y - entity.radius - 14 / this.camera.zoom;
    const ratio = clamp(entity.hp / entity.maxHp, 0, 1);

    ctx.save();
    ctx.fillStyle = "rgba(7, 10, 14, 0.72)";
    roundedRectPath(ctx, x, y, width, height, 2 / this.camera.zoom);
    ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? "#67e8a5" : ratio > 0.25 ? "#facc15" : "#fb7185";
    roundedRectPath(ctx, x, y, width * ratio, height, 2 / this.camera.zoom);
    ctx.fill();
    ctx.restore();
  }

  private drawOreCrystal(x: number, y: number, size: number): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.fillStyle = "#42d6a4";
    ctx.strokeStyle = "rgba(218, 255, 240, 0.86)";
    ctx.lineWidth = 1.2 / this.camera.zoom;
    polygon(ctx, [
      { x, y: y - size },
      { x: x + size * 0.58, y },
      { x, y: y + size },
      { x: x - size * 0.58, y },
    ]);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(235, 255, 248, 0.48)";
    polygon(ctx, [
      { x, y: y - size * 0.72 },
      { x: x + size * 0.24, y },
      { x, y: y + size * 0.56 },
      { x: x - size * 0.12, y },
    ]);
    ctx.fill();
    ctx.restore();
  }

  private drawOreFields(): void {
    const fields = createOreFields();

    for (const field of fields) {
      this.ctx.save();
      this.ctx.fillStyle = "rgba(82, 211, 172, 0.06)";
      this.ctx.beginPath();
      this.ctx.ellipse(field.x, field.y, field.radiusX, field.radiusY, 0, 0, Math.PI * 2);
      this.ctx.fill();

      for (let index = 0; index < 10; index += 1) {
        const angle = hashFloat(index, field.x, TERRAIN_SEED) * Math.PI * 2;
        const distance = Math.sqrt(hashFloat(index, field.y, TERRAIN_SEED + 9));
        const x = field.x + Math.cos(angle) * field.radiusX * 0.82 * distance;
        const y = field.y + Math.sin(angle) * field.radiusY * 0.82 * distance;
        const size = 7 + hashFloat(index, field.radiusX, TERRAIN_SEED + 17) * 8;

        this.drawOreCrystal(x, y, size);
      }

      this.ctx.restore();
    }
  }

  private drawOwnerChevron(entity: EntityState, palette: Palette): void {
    const ctx = this.ctx;
    const y = entity.y + entity.radius + 9 / this.camera.zoom;
    const width = entity.role === "building" ? 15 : 10;
    const height = entity.role === "building" ? 7 : 5;
    const isLocal = entity.ownerId === this.localPlayerId;

    ctx.save();
    ctx.fillStyle = isLocal ? palette.light : palette.accent;
    ctx.globalAlpha = isLocal ? 0.95 : 0.68;
    polygon(ctx, [
      { x: entity.x - width, y },
      { x: entity.x, y: y + height },
      { x: entity.x + width, y },
      { x: entity.x, y: y + height * 0.55 },
    ]);
    ctx.fill();
    ctx.restore();
  }

  private drawProjectiles(snapshot: GameSnapshot, playerById: ReadonlyMap<string, PlayerState>): void {
    const ctx = this.ctx;

    for (const projectile of snapshot.projectiles) {
      const owner = playerById.get(projectile.ownerId);
      const palette = owner ? PLAYER_PALETTES[owner.color] : NEUTRAL_PALETTE;
      const progress = clamp(projectile.ageMs / 260, 0, 1);
      const x = lerp(projectile.from.x, projectile.to.x, progress);
      const y = lerp(projectile.from.y, projectile.to.y, progress);
      const previousX = lerp(projectile.from.x, projectile.to.x, Math.max(0, progress - 0.12));
      const previousY = lerp(projectile.from.y, projectile.to.y, Math.max(0, progress - 0.12));

      ctx.save();
      ctx.strokeStyle = palette.light;
      ctx.lineCap = "round";
      ctx.lineWidth = 3 / this.camera.zoom;
      ctx.beginPath();
      ctx.moveTo(previousX, previousY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(x, y, 4.2 / this.camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawRange(entity: EntityState, palette: Palette): void {
    if (entity.range <= entity.radius) {
      return;
    }

    const ctx = this.ctx;

    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, entity.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawRifleSquad(radius: number, palette: Palette): void {
    const ctx = this.ctx;
    const positions = [
      { x: -radius * 0.52, y: radius * 0.2, stance: -0.14 },
      { x: radius * 0.38, y: radius * 0.24, stance: 0.18 },
      { x: -radius * 0.05, y: -radius * 0.38, stance: 0.04 },
    ];

    for (const position of positions) {
      ctx.strokeStyle = palette.shadow;
      ctx.lineCap = "round";
      ctx.lineWidth = 4.2 / this.camera.zoom;
      ctx.beginPath();
      ctx.moveTo(position.x - radius * 0.1, position.y + radius * 0.24);
      ctx.lineTo(position.x - radius * 0.2, position.y + radius * 0.48);
      ctx.moveTo(position.x + radius * 0.1, position.y + radius * 0.24);
      ctx.lineTo(position.x + radius * 0.26, position.y + radius * 0.44);
      ctx.stroke();

      ctx.fillStyle = palette.fill;
      roundedRectPath(ctx, position.x - radius * 0.15, position.y - radius * 0.08, radius * 0.3, radius * 0.42, 3);
      ctx.fill();

      ctx.strokeStyle = palette.light;
      ctx.lineWidth = 1.5 / this.camera.zoom;
      ctx.beginPath();
      ctx.moveTo(position.x - radius * 0.14, position.y + radius * 0.02);
      ctx.lineTo(position.x + radius * 0.14, position.y + radius * 0.02);
      ctx.stroke();

      ctx.fillStyle = palette.light;
      ctx.beginPath();
      ctx.arc(position.x, position.y - radius * 0.2, radius * 0.14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.arc(position.x + radius * 0.03, position.y - radius * 0.23, radius * 0.13, Math.PI * 1.02, Math.PI * 2.1);
      ctx.fill();

      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = 2 / this.camera.zoom;
      ctx.beginPath();
      ctx.moveTo(position.x + radius * 0.18, position.y + radius * 0.04);
      ctx.lineTo(position.x + radius * 0.72, position.y - radius * (0.08 + position.stance));
      ctx.stroke();

      ctx.strokeStyle = palette.light;
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.beginPath();
      ctx.moveTo(position.x + radius * 0.18, position.y - radius * 0.02);
      ctx.lineTo(position.x + radius * 0.62, position.y - radius * (0.1 + position.stance));
      ctx.stroke();
    }
  }

  private drawSelectionRing(entity: EntityState): void {
    const ctx = this.ctx;
    const radius = entity.radius + 7;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 245, 157, 0.95)";
    ctx.lineWidth = 2.2 / this.camera.zoom;
    ctx.beginPath();
    ctx.ellipse(entity.x, entity.y, radius * 1.2, radius * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawTank(radius: number, palette: Palette): void {
    const ctx = this.ctx;

    ctx.fillStyle = palette.dark;
    roundedRectPath(ctx, -radius * 0.92, -radius * 0.58, radius * 1.84, radius * 1.16, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(8, 12, 14, 0.5)";
    roundedRectPath(ctx, -radius * 0.82, -radius * 0.47, radius * 1.64, radius * 0.24, 4);
    ctx.fill();
    roundedRectPath(ctx, -radius * 0.82, radius * 0.22, radius * 1.64, radius * 0.24, 4);
    ctx.fill();

    ctx.fillStyle = palette.fill;
    polygon(ctx, [
      { x: -radius * 0.66, y: -radius * 0.38 },
      { x: radius * 0.56, y: -radius * 0.34 },
      { x: radius * 0.76, y: -radius * 0.06 },
      { x: radius * 0.54, y: radius * 0.34 },
      { x: -radius * 0.7, y: radius * 0.34 },
      { x: -radius * 0.82, y: radius * 0.04 },
    ]);
    ctx.fill();

    ctx.strokeStyle = "rgba(232, 242, 225, 0.18)";
    ctx.lineWidth = 1 / this.camera.zoom;
    for (let index = 0; index < 5; index += 1) {
      const x = -radius * 0.62 + index * radius * 0.31;

      ctx.beginPath();
      ctx.moveTo(x, -radius * 0.5);
      ctx.lineTo(x + radius * 0.1, -radius * 0.28);
      ctx.moveTo(x, radius * 0.5);
      ctx.lineTo(x + radius * 0.1, radius * 0.28);
      ctx.stroke();
    }

    ctx.strokeStyle = palette.light;
    ctx.lineCap = "round";
    ctx.lineWidth = 6.5 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(radius * 0.2, -radius * 0.02);
    ctx.lineTo(radius * 1.28, -radius * 0.14);
    ctx.stroke();

    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = 2.4 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(radius * 0.48, -radius * 0.07);
    ctx.lineTo(radius * 1.32, -radius * 0.16);
    ctx.stroke();

    ctx.fillStyle = palette.accent;
    roundedRectPath(ctx, -radius * 0.26, -radius * 0.25, radius * 0.56, radius * 0.5, 5);
    ctx.fill();

    ctx.fillStyle = palette.light;
    ctx.beginPath();
    ctx.arc(radius * 0.04, -radius * 0.02, radius * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTerrainDetails(): void {
    for (const ridge of TERRAIN_RIDGES) {
      this.drawTerrainRidge(ridge);
    }

    for (const road of TERRAIN_ROADS) {
      this.drawTerrainRoad(road);
    }

    for (const pad of TERRAIN_PADS) {
      this.drawTerrainPad(pad);
    }

    for (const decoration of TERRAIN_DECORATIONS) {
      if (decoration.type === "scorch") {
        this.drawScorchMark(decoration);
      } else if (decoration.type === "rocks") {
        this.drawRockCluster(decoration);
      } else if (decoration.type === "barrier") {
        this.drawBarrierCluster(decoration);
      } else {
        this.drawWreckDecoration(decoration);
      }
    }
  }

  private drawTerrainRoad(road: TerrainRoad): void {
    const ctx = this.ctx;
    const angle = Math.atan2(road.to.y - road.from.y, road.to.x - road.from.x);
    const normalX = Math.cos(angle + Math.PI / 2);
    const normalY = Math.sin(angle + Math.PI / 2);

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(4, 7, 8, 0.34)";
    ctx.lineWidth = road.width + 10;
    ctx.beginPath();
    ctx.moveTo(road.from.x + normalX * 5, road.from.y + normalY * 5);
    ctx.lineTo(road.to.x + normalX * 5, road.to.y + normalY * 5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(72, 82, 74, 0.54)";
    ctx.lineWidth = road.width;
    ctx.beginPath();
    ctx.moveTo(road.from.x, road.from.y);
    ctx.lineTo(road.to.x, road.to.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(174, 183, 156, 0.18)";
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(road.from.x - normalX * road.width * 0.33, road.from.y - normalY * road.width * 0.33);
    ctx.lineTo(road.to.x - normalX * road.width * 0.33, road.to.y - normalY * road.width * 0.33);
    ctx.stroke();
    ctx.strokeStyle = "rgba(10, 15, 15, 0.24)";
    ctx.beginPath();
    ctx.moveTo(road.from.x + normalX * road.width * 0.38, road.from.y + normalY * road.width * 0.38);
    ctx.lineTo(road.to.x + normalX * road.width * 0.38, road.to.y + normalY * road.width * 0.38);
    ctx.stroke();
    ctx.strokeStyle = "rgba(227, 232, 204, 0.13)";
    ctx.lineWidth = 1.4 / this.camera.zoom;
    ctx.setLineDash([24 / this.camera.zoom, 20 / this.camera.zoom]);
    ctx.beginPath();
    ctx.moveTo(road.from.x, road.from.y);
    ctx.lineTo(road.to.x, road.to.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawTerrainPad(pad: TerrainPad): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(pad.x, pad.y);
    ctx.rotate(pad.rotation);
    ctx.fillStyle = "rgba(4, 7, 8, 0.28)";
    roundedRectPath(ctx, -pad.width / 2 + 8, -pad.height / 2 + 12, pad.width, pad.height, 9);
    ctx.fill();
    ctx.fillStyle = "rgba(118, 132, 111, 0.34)";
    roundedRectPath(ctx, -pad.width / 2, -pad.height / 2, pad.width, pad.height, 9);
    ctx.fill();
    ctx.fillStyle = "rgba(213, 220, 190, 0.07)";
    roundedRectPath(ctx, -pad.width / 2 + 7, -pad.height / 2 + 6, pad.width - 14, pad.height * 0.28, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(235, 241, 215, 0.14)";
    ctx.lineWidth = 1.4 / this.camera.zoom;
    roundedRectPath(ctx, -pad.width / 2, -pad.height / 2, pad.width, pad.height, 9);
    ctx.stroke();
    ctx.strokeStyle = "rgba(6, 10, 11, 0.28)";
    ctx.beginPath();
    ctx.moveTo(-pad.width / 2 + 10, pad.height / 2 - 3);
    ctx.lineTo(pad.width / 2 - 8, pad.height / 2 - 3);
    ctx.stroke();
    ctx.strokeStyle = "rgba(23, 31, 31, 0.18)";
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(-pad.width * 0.34, -pad.height * 0.5);
    ctx.lineTo(-pad.width * 0.18, pad.height * 0.5);
    ctx.moveTo(pad.width * 0.12, -pad.height * 0.5);
    ctx.lineTo(pad.width * 0.06, pad.height * 0.5);
    ctx.moveTo(-pad.width * 0.5, -pad.height * 0.08);
    ctx.lineTo(pad.width * 0.5, -pad.height * 0.16);
    ctx.moveTo(-pad.width * 0.5, pad.height * 0.28);
    ctx.lineTo(pad.width * 0.5, pad.height * 0.18);
    ctx.stroke();
    ctx.restore();
  }

  private drawTerrainRidge(ridge: TerrainRidge): void {
    const ctx = this.ctx;
    const shadowPoints = ridge.points.map((point) => ({ x: point.x + 15, y: point.y + 18 }));
    const highlightPoints = ridge.points.map((point) => ({ x: point.x - 8, y: point.y - 10 }));

    ctx.save();
    ctx.fillStyle = "rgba(4, 7, 7, 0.18)";
    polygon(ctx, shadowPoints);
    ctx.fill();
    ctx.fillStyle = "rgba(43, 64, 46, 0.42)";
    polygon(ctx, ridge.points);
    ctx.fill();
    ctx.strokeStyle = "rgba(218, 229, 181, 0.1)";
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(highlightPoints[0].x, highlightPoints[0].y);

    for (const point of highlightPoints.slice(1, 4)) {
      ctx.lineTo(point.x, point.y);
    }

    ctx.stroke();
    ctx.strokeStyle = "rgba(5, 9, 9, 0.24)";
    ctx.lineWidth = 3 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(ridge.points[ridge.points.length - 1].x + 8, ridge.points[ridge.points.length - 1].y + 8);

    for (const point of ridge.points.slice(2, -1).reverse()) {
      ctx.lineTo(point.x + 8, point.y + 8);
    }

    ctx.stroke();
    ctx.restore();
  }

  private drawScorchMark(decoration: TerrainDecoration): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(decoration.x, decoration.y);
    ctx.rotate(decoration.rotation);
    ctx.scale(decoration.scale, decoration.scale);
    ctx.fillStyle = "rgba(6, 8, 8, 0.42)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(74, 52, 36, 0.32)";
    ctx.beginPath();
    ctx.ellipse(-5, 1, 28, 13, 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(226, 142, 88, 0.2)";
    ctx.lineWidth = 1.3 / this.camera.zoom;
    ctx.beginPath();
    ctx.arc(7, -1, 19, 0.2, Math.PI * 1.2);
    ctx.stroke();
    ctx.restore();
  }

  private drawRockCluster(decoration: TerrainDecoration): void {
    const ctx = this.ctx;
    const rocks = [
      { x: -22, y: 2, width: 18, height: 11 },
      { x: -4, y: -8, width: 14, height: 13 },
      { x: 16, y: 5, width: 22, height: 12 },
      { x: 4, y: 16, width: 12, height: 8 },
    ];

    ctx.save();
    ctx.translate(decoration.x, decoration.y);
    ctx.rotate(decoration.rotation);
    ctx.scale(decoration.scale, decoration.scale);

    for (const rock of rocks) {
      ctx.fillStyle = "rgba(89, 96, 82, 0.64)";
      polygon(ctx, [
        { x: rock.x - rock.width * 0.5, y: rock.y + rock.height * 0.2 },
        { x: rock.x - rock.width * 0.18, y: rock.y - rock.height * 0.5 },
        { x: rock.x + rock.width * 0.38, y: rock.y - rock.height * 0.42 },
        { x: rock.x + rock.width * 0.52, y: rock.y + rock.height * 0.22 },
        { x: rock.x + rock.width * 0.12, y: rock.y + rock.height * 0.52 },
      ]);
      ctx.fill();
      ctx.strokeStyle = "rgba(226, 233, 208, 0.16)";
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawBarrierCluster(decoration: TerrainDecoration): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(decoration.x, decoration.y);
    ctx.rotate(decoration.rotation);
    ctx.scale(decoration.scale, decoration.scale);

    for (let index = -1; index <= 1; index += 1) {
      const x = index * 24;

      ctx.fillStyle = "rgba(11, 14, 15, 0.42)";
      roundedRectPath(ctx, x - 10, -4, 21, 16, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(151, 154, 137, 0.7)";
      roundedRectPath(ctx, x - 11, -7, 21, 15, 3);
      ctx.fill();
      ctx.strokeStyle = "rgba(231, 236, 212, 0.2)";
      ctx.lineWidth = 1 / this.camera.zoom;
      roundedRectPath(ctx, x - 11, -7, 21, 15, 3);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawWreckDecoration(decoration: TerrainDecoration): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(decoration.x, decoration.y);
    ctx.rotate(decoration.rotation);
    ctx.scale(decoration.scale, decoration.scale);
    ctx.fillStyle = "rgba(8, 11, 12, 0.46)";
    roundedRectPath(ctx, -35, -12, 68, 28, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(54, 60, 54, 0.78)";
    polygon(ctx, [
      { x: -34, y: -14 },
      { x: 18, y: -18 },
      { x: 34, y: -5 },
      { x: 24, y: 13 },
      { x: -26, y: 15 },
      { x: -38, y: 2 },
    ]);
    ctx.fill();
    ctx.fillStyle = "rgba(102, 69, 47, 0.62)";
    polygon(ctx, [
      { x: -7, y: -11 },
      { x: 12, y: -8 },
      { x: 17, y: 5 },
      { x: -12, y: 8 },
    ]);
    ctx.fill();
    ctx.strokeStyle = "rgba(223, 226, 204, 0.18)";
    ctx.lineWidth = 1.4 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(-28, -3);
    ctx.lineTo(-10, 8);
    ctx.lineTo(2, -4);
    ctx.moveTo(18, -12);
    ctx.lineTo(31, -22);
    ctx.stroke();
    ctx.restore();
  }

  private drawTerrain(): void {
    const ctx = this.ctx;
    const cellSize = 160;

    ctx.save();
    ctx.fillStyle = "#26342b";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    for (let y = 0; y <= Math.ceil(WORLD_HEIGHT / cellSize); y += 1) {
      for (let x = 0; x <= Math.ceil(WORLD_WIDTH / cellSize); x += 1) {
        const value = hashFloat(x, y, TERRAIN_SEED);
        ctx.fillStyle = value > 0.62 ? "rgba(111, 127, 87, 0.08)" : "rgba(21, 30, 27, 0.05)";
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    ctx.strokeStyle = "rgba(213, 220, 171, 0.06)";
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.beginPath();

    for (let x = 0; x <= WORLD_WIDTH; x += cellSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_HEIGHT);
    }

    for (let y = 0; y <= WORLD_HEIGHT; y += cellSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_WIDTH, y);
    }

    ctx.stroke();
    this.drawTerrainDetails();
    ctx.restore();
  }

  private drawUnit(entity: EntityState, palette: Palette): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.fillStyle = palette.shadow;
    ctx.beginPath();
    ctx.ellipse(4, 6, entity.radius * 1.05, entity.radius * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();

    if (entity.kind === "rifle") {
      this.drawRifleSquad(entity.radius, palette);
    } else if (entity.kind === "tank") {
      this.drawTank(entity.radius, palette);
    } else if (entity.kind === "artillery") {
      this.drawArtillery(entity.radius, palette);
    } else {
      this.drawHarvester(entity.radius, palette);
    }

    ctx.restore();
  }

  private drawWaitingState(): void {
    const size = this.canvasSize();
    const ctx = this.ctx;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(237, 243, 240, 0.72)";
    ctx.font = "600 14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Waiting for room snapshot", size.width / 2, Math.max(92, size.height * 0.16));
    ctx.restore();
  }

  private drawWorldBorder(): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.strokeStyle = "rgba(244, 241, 210, 0.42)";
    ctx.lineWidth = 3 / this.camera.zoom;
    ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.restore();
  }

  private isInsideWorld(clientX: number, clientY: number): boolean {
    this.resizeCanvas();
    this.updateCamera();

    const point = this.clientToCanvas(clientX, clientY);

    return (
      point.x >= this.camera.offsetX &&
      point.x <= this.camera.offsetX + WORLD_WIDTH * this.camera.zoom &&
      point.y >= this.camera.offsetY &&
      point.y <= this.camera.offsetY + WORLD_HEIGHT * this.camera.zoom
    );
  }

  private resizeCanvas(): void {
    const size = this.canvasSize();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(size.width * ratio);
    const height = Math.round(size.height * ratio);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private updateCamera(): void {
    const size = this.canvasSize();
    const topInset = Math.min(82, size.height * 0.14);
    const bottomInset = Math.min(104, size.height * 0.18);
    const sideInset = Math.min(16, size.width * 0.03);
    const availableWidth = Math.max(1, size.width - sideInset * 2);
    const availableHeight = Math.max(1, size.height - topInset - bottomInset);
    const zoom = Math.min(availableWidth / WORLD_WIDTH, availableHeight / WORLD_HEIGHT);

    this.camera = {
      offsetX: sideInset + (availableWidth - WORLD_WIDTH * zoom) / 2,
      offsetY: topInset + (availableHeight - WORLD_HEIGHT * zoom) / 2,
      zoom,
    };
  }

  private withWorldTransform(draw: () => void): void {
    const ratio = this.canvas.width / this.canvasSize().width;

    this.ctx.save();
    this.ctx.setTransform(
      ratio * this.camera.zoom,
      0,
      0,
      ratio * this.camera.zoom,
      ratio * this.camera.offsetX,
      ratio * this.camera.offsetY,
    );
    draw();
    this.ctx.restore();
  }
}

function circleIntersectsRect(center: Vec2, radius: number, rect: DragRect): boolean {
  const closestX = clamp(center.x, rect.x, rect.x + rect.width);
  const closestY = clamp(center.y, rect.y, rect.y + rect.height);

  return (center.x - closestX) ** 2 + (center.y - closestY) ** 2 <= radius ** 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createOreFields(): OreField[] {
  return [
    { x: WORLD_WIDTH * 0.19, y: WORLD_HEIGHT * 0.2, radiusX: 118, radiusY: 66 },
    { x: WORLD_WIDTH * 0.78, y: WORLD_HEIGHT * 0.78, radiusX: 126, radiusY: 72 },
    { x: WORLD_WIDTH * 0.52, y: WORLD_HEIGHT * 0.48, radiusX: 136, radiusY: 78 },
    { x: WORLD_WIDTH * 0.32, y: WORLD_HEIGHT * 0.76, radiusX: 104, radiusY: 62 },
    { x: WORLD_WIDTH * 0.74, y: WORLD_HEIGHT * 0.27, radiusX: 102, radiusY: 60 },
  ];
}

function drawMoveMarker(ctx: CanvasRenderingContext2D, point: Vec2, zoom: number): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(252, 245, 165, 0.96)";
  ctx.lineWidth = 1.5 / zoom;
  ctx.beginPath();
  ctx.moveTo(point.x - 10, point.y);
  ctx.lineTo(point.x + 10, point.y);
  ctx.moveTo(point.x, point.y - 10);
  ctx.lineTo(point.x, point.y + 10);
  ctx.stroke();
  ctx.restore();
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha: false });

  if (!ctx) {
    throw new Error("Canvas 2D rendering context is unavailable.");
  }

  return ctx;
}

function hashFloat(a: number, b: number, seed: number): number {
  const value = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453123;

  return value - Math.floor(value);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function normalizeRect(rect: DragRect): DragRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

function paletteForEntity(entity: EntityState, playerById: ReadonlyMap<string, PlayerState>): Palette {
  const player = playerById.get(entity.ownerId);

  return player ? PLAYER_PALETTES[player.color] : NEUTRAL_PALETTE;
}

function selectionHitRadius(entity: EntityState): number {
  if (entity.role === "building") {
    return entity.radius * 1.08;
  }

  if (entity.kind === "artillery" || entity.kind === "harvester") {
    return entity.radius * 1.85;
  }

  if (entity.kind === "tank") {
    return entity.radius * 1.65;
  }

  return entity.radius * 1.45;
}

function polygon(ctx: CanvasRenderingContext2D, points: readonly Vec2[]): void {
  if (points.length === 0) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }

  ctx.closePath();
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}
