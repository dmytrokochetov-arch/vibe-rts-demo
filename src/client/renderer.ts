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
    if (!this.snapshot || !this.isInsideWorld(clientX, clientY)) {
      return undefined;
    }

    const world = this.screenToWorld(clientX, clientY);
    let bestEntity: EntityState | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entity of this.snapshot.entities) {
      const distance = Math.hypot(entity.x - world.x, entity.y - world.y);
      const hitRadius = entity.radius + MIN_HIT_RADIUS / this.camera.zoom;

      if (distance > hitRadius) {
        continue;
      }

      const unitBias = entity.role === "unit" ? -4 : 0;
      const score = distance - entity.radius + unitBias;

      if (score < bestDistance) {
        bestDistance = score;
        bestEntity = entity;
      }
    }

    return bestEntity;
  }

  entitiesInRect(rect: DragRect): EntityState[] {
    if (!this.snapshot) {
      return [];
    }

    this.resizeCanvas();
    this.updateCamera();

    const worldRect = this.dragRectToWorldRect(rect);

    return this.snapshot.entities.filter((entity) => circleIntersectsRect(entity, entity.radius, worldRect));
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

    ctx.fillStyle = palette.dark;
    roundedRectPath(ctx, -radius * 0.66, -radius * 0.46, radius * 1.32, radius * 0.92, 5);
    ctx.fill();
    ctx.fillStyle = palette.fill;
    roundedRectPath(ctx, -radius * 0.45, -radius * 0.32, radius * 0.9, radius * 0.64, 4);
    ctx.fill();
    ctx.strokeStyle = palette.light;
    ctx.lineCap = "round";
    ctx.lineWidth = 5 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(radius * 0.1, -radius * 0.02);
    ctx.lineTo(radius * 1.35, -radius * 0.5);
    ctx.stroke();
    ctx.fillStyle = palette.accent;
    ctx.fillRect(-radius * 0.82, radius * 0.42, radius * 0.44, radius * 0.18);
    ctx.fillRect(radius * 0.38, radius * 0.42, radius * 0.44, radius * 0.18);
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
    } else {
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
    }

    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 2 / this.camera.zoom;
    roundedRectPath(ctx, -size / 2, -size / 2, size, size, 7);
    ctx.stroke();
    ctx.restore();
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
    const ctx = this.ctx;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(103, 232, 249, 0.1)";
    ctx.strokeStyle = "rgba(207, 250, 254, 0.92)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(canvasRect.x, canvasRect.y, canvasRect.width, canvasRect.height);
    ctx.strokeRect(canvasRect.x + 0.5, canvasRect.y + 0.5, canvasRect.width, canvasRect.height);
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

      if (isSelected) {
        this.drawSelectionRing(entity);
        this.drawRange(entity, palette);
      }

      if (entity.role === "building") {
        this.drawBuilding(entity, palette);
      } else {
        this.drawUnit(entity, palette);
      }

      this.drawHealthBar(entity);
      this.drawOwnerChevron(entity, palette);
    }
  }

  private drawExplosions(snapshot: GameSnapshot): void {
    const ctx = this.ctx;

    for (const explosion of snapshot.explosions) {
      const progress = clamp(explosion.ageMs / 650, 0, 1);
      const radius = 10 + progress * 52;
      const alpha = 1 - progress;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffdd79";
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ff7a4f";
      ctx.lineWidth = 4 / this.camera.zoom;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawHarvester(radius: number, palette: Palette): void {
    const ctx = this.ctx;

    ctx.fillStyle = palette.dark;
    polygon(ctx, [
      { x: -radius * 0.8, y: -radius * 0.4 },
      { x: radius * 0.42, y: -radius * 0.58 },
      { x: radius * 0.8, y: -radius * 0.18 },
      { x: radius * 0.66, y: radius * 0.5 },
      { x: -radius * 0.62, y: radius * 0.54 },
    ]);
    ctx.fill();
    ctx.fillStyle = palette.fill;
    roundedRectPath(ctx, -radius * 0.44, -radius * 0.34, radius * 0.78, radius * 0.68, 4);
    ctx.fill();
    ctx.fillStyle = "#45d6a5";
    ctx.beginPath();
    ctx.moveTo(radius * 0.32, -radius * 0.3);
    ctx.lineTo(radius * 1.02, 0);
    ctx.lineTo(radius * 0.32, radius * 0.3);
    ctx.closePath();
    ctx.fill();
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
      this.ctx.fillStyle = "rgba(82, 211, 172, 0.09)";
      this.ctx.beginPath();
      this.ctx.ellipse(field.x, field.y, field.radiusX, field.radiusY, 0, 0, Math.PI * 2);
      this.ctx.fill();

      for (let index = 0; index < 18; index += 1) {
        const angle = hashFloat(index, field.x, TERRAIN_SEED) * Math.PI * 2;
        const distance = Math.sqrt(hashFloat(index, field.y, TERRAIN_SEED + 9));
        const x = field.x + Math.cos(angle) * field.radiusX * 0.82 * distance;
        const y = field.y + Math.sin(angle) * field.radiusY * 0.82 * distance;
        const size = 8 + hashFloat(index, field.radiusX, TERRAIN_SEED + 17) * 12;

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
      { x: -radius * 0.4, y: radius * 0.18 },
      { x: radius * 0.3, y: radius * 0.24 },
      { x: -radius * 0.02, y: -radius * 0.34 },
    ];

    for (const position of positions) {
      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.fill;
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette.light;
      ctx.lineWidth = 1.3 / this.camera.zoom;
      ctx.beginPath();
      ctx.moveTo(position.x + radius * 0.12, position.y);
      ctx.lineTo(position.x + radius * 0.58, position.y - radius * 0.12);
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
    roundedRectPath(ctx, -radius * 0.74, -radius * 0.48, radius * 1.48, radius * 0.96, 7);
    ctx.fill();
    ctx.fillStyle = palette.fill;
    roundedRectPath(ctx, -radius * 0.48, -radius * 0.34, radius * 0.96, radius * 0.68, 5);
    ctx.fill();
    ctx.strokeStyle = palette.light;
    ctx.lineCap = "round";
    ctx.lineWidth = 4.5 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(radius * 0.18, 0);
    ctx.lineTo(radius * 1.08, -radius * 0.1);
    ctx.stroke();
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTerrain(): void {
    const ctx = this.ctx;
    const cellSize = 120;

    ctx.save();
    ctx.fillStyle = "#26342b";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    for (let y = 0; y <= Math.ceil(WORLD_HEIGHT / cellSize); y += 1) {
      for (let x = 0; x <= Math.ceil(WORLD_WIDTH / cellSize); x += 1) {
        const value = hashFloat(x, y, TERRAIN_SEED);
        ctx.fillStyle = value > 0.58 ? "rgba(111, 127, 87, 0.14)" : "rgba(21, 30, 27, 0.1)";
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    ctx.strokeStyle = "rgba(213, 220, 171, 0.11)";
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
    const zoom = Math.min(size.width / WORLD_WIDTH, size.height / WORLD_HEIGHT);

    this.camera = {
      offsetX: (size.width - WORLD_WIDTH * zoom) / 2,
      offsetY: (size.height - WORLD_HEIGHT * zoom) / 2,
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
    { x: WORLD_WIDTH * 0.19, y: WORLD_HEIGHT * 0.2, radiusX: 150, radiusY: 88 },
    { x: WORLD_WIDTH * 0.78, y: WORLD_HEIGHT * 0.78, radiusX: 165, radiusY: 95 },
    { x: WORLD_WIDTH * 0.52, y: WORLD_HEIGHT * 0.48, radiusX: 185, radiusY: 110 },
    { x: WORLD_WIDTH * 0.32, y: WORLD_HEIGHT * 0.76, radiusX: 120, radiusY: 78 },
    { x: WORLD_WIDTH * 0.74, y: WORLD_HEIGHT * 0.27, radiusX: 118, radiusY: 74 },
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
