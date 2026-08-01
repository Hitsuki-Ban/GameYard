(() => {
  "use strict";
  const PLO = window.PLO;
  const { CONFIG, makeCell } = PLO;
  const { clamp, mod, deepCloneGrid } = PLO.util;
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let globalCellId = 1;
  let globalProjectileId = 1;

  const cellTemplate = (cell) => ({ kind: cell.kind, color: cell.color });
  const keyOf = (x, y) => y * CONFIG.COLS + x;
  const inside = (x, y) => x >= 0 && x < CONFIG.COLS && y >= 0 && y < CONFIG.ROWS;

  function createEmptyGrid() {
    return Array.from({ length: CONFIG.ROWS }, () => Array(CONFIG.COLS).fill(null));
  }

  function findClearData(grid) {
    const visited = Array.from({ length: CONFIG.ROWS }, () => Array(CONFIG.COLS).fill(false));
    const clearKeys = new Set();
    const groups = [];

    for (let y = 0; y < CONFIG.ROWS; y++) {
      for (let x = 0; x < CONFIG.COLS; x++) {
        const root = grid[y][x];
        if (!root || root.kind !== "normal" || visited[y][x]) continue;
        const color = root.color;
        const queue = [[x, y]];
        const group = [];
        visited[y][x] = true;
        while (queue.length) {
          const [cx, cy] = queue.pop();
          group.push([cx, cy]);
          for (const [dx, dy] of DIRS) {
            const nx = cx + dx,
              ny = cy + dy;
            if (!inside(nx, ny) || visited[ny][nx]) continue;
            const next = grid[ny][nx];
            if (next && next.kind === "normal" && next.color === color) {
              visited[ny][nx] = true;
              queue.push([nx, ny]);
            }
          }
        }
        if (group.length >= 3) {
          groups.push(group);
          for (const [gx, gy] of group) clearKeys.add(keyOf(gx, gy));
        }
      }
    }

    if (!clearKeys.size) return null;

    // Pulse cells are engulfed by a neighboring clear. Chained pulse cells are also engulfed.
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let y = 0; y < CONFIG.ROWS; y++) {
        for (let x = 0; x < CONFIG.COLS; x++) {
          const cell = grid[y][x];
          const key = keyOf(x, y);
          if (!cell || cell.kind !== "pulse" || clearKeys.has(key)) continue;
          for (const [dx, dy] of DIRS) {
            const nx = x + dx,
              ny = y + dy;
            if (inside(nx, ny) && clearKeys.has(keyOf(nx, ny))) {
              clearKeys.add(key);
              expanded = true;
              break;
            }
          }
        }
      }
    }

    const cells = [];
    let regular = 0,
      pulse = 0;
    for (const key of clearKeys) {
      const x = key % CONFIG.COLS;
      const y = Math.floor(key / CONFIG.COLS);
      const cell = grid[y][x];
      if (!cell) continue;
      cells.push({ x, y, cell });
      if (cell.kind === "pulse") pulse++;
      else regular++;
    }
    return { cells, regular, pulse, groups: groups.length };
  }

  function collapseGrid(grid, animate = false) {
    let moved = 0;
    for (let x = 0; x < CONFIG.COLS; x++) {
      let write = CONFIG.ROWS - 1;
      for (let y = CONFIG.ROWS - 1; y >= 0; y--) {
        const cell = grid[y][x];
        if (!cell) continue;
        if (write !== y) {
          grid[write][x] = cell;
          grid[y][x] = null;
          if (animate) {
            cell.fallFrom = y;
            cell.fallDistance = write - y;
          }
          moved = Math.max(moved, write - y);
        }
        write--;
      }
      while (write >= 0) grid[write--][x] = null;
    }
    return moved;
  }

  function simulateResolution(sourceGrid, maxChains = 12) {
    const grid = deepCloneGrid(sourceGrid);
    let chain = 0,
      regular = 0,
      pulse = 0,
      cleared = 0;
    while (chain < maxChains) {
      const data = findClearData(grid);
      if (!data) break;
      chain++;
      regular += data.regular;
      pulse += data.pulse;
      cleared += data.cells.length;
      for (const { x, y } of data.cells) grid[y][x] = null;
      collapseGrid(grid, false);
    }
    return { grid, chain, regular, pulse, cleared };
  }

  function groupPotential(grid) {
    const visited = Array.from({ length: CONFIG.ROWS }, () => Array(CONFIG.COLS).fill(false));
    let pairs = 0,
      adjacency = 0,
      pulseEdges = 0;
    for (let y = 0; y < CONFIG.ROWS; y++) {
      for (let x = 0; x < CONFIG.COLS; x++) {
        const cell = grid[y][x];
        if (!cell) continue;
        if (cell.kind === "pulse") {
          for (const [dx, dy] of DIRS) {
            const nx = x + dx,
              ny = y + dy;
            if (inside(nx, ny) && grid[ny][nx]?.kind === "normal") pulseEdges++;
          }
          continue;
        }
        if (visited[y][x]) continue;
        const queue = [[x, y]];
        visited[y][x] = true;
        let size = 0;
        while (queue.length) {
          const [cx, cy] = queue.pop();
          size++;
          for (const [dx, dy] of DIRS) {
            const nx = cx + dx,
              ny = cy + dy;
            if (!inside(nx, ny) || visited[ny][nx]) continue;
            const n = grid[ny][nx];
            if (n?.kind === "normal" && n.color === cell.color) {
              visited[ny][nx] = true;
              queue.push([nx, ny]);
            }
          }
        }
        if (size === 2) pairs++;
        adjacency += Math.max(0, size - 1);
      }
    }
    return { pairs, adjacency, pulseEdges };
  }

  function gridMetrics(grid) {
    const heights = [];
    let holes = 0,
      roughness = 0,
      hidden = 0,
      total = 0;
    for (let x = 0; x < CONFIG.COLS; x++) {
      let top = CONFIG.ROWS;
      let seen = false;
      for (let y = 0; y < CONFIG.ROWS; y++) {
        const cell = grid[y][x];
        if (cell) {
          total++;
          if (y < CONFIG.HIDDEN_ROWS) hidden++;
          if (!seen) {
            top = y;
            seen = true;
          }
        } else if (seen) holes++;
      }
      heights[x] = CONFIG.ROWS - top;
    }
    for (let x = 1; x < CONFIG.COLS; x++) roughness += Math.abs(heights[x] - heights[x - 1]);
    const centerHeight = heights[CONFIG.CENTER_COL];
    const maxHeight = Math.max(...heights);
    const danger = clamp((centerHeight - 6) / 7, 0, 1);
    return { heights, holes, roughness, hidden, total, centerHeight, maxHeight, danger };
  }

  class PieceStream {
    constructor(rng) {
      this.rng = rng;
      this.history = [];
      this.drought = Array(CONFIG.COLORS).fill(0);
      this.pulsePity = 0;
      this.script = [];
    }

    setScript(pairs) {
      this.script = pairs.map((pair) => pair.map((c) => ({ ...c })));
    }

    nextColor() {
      const recentCounts = Array(CONFIG.COLORS).fill(0);
      for (const c of this.history.slice(-8)) recentCounts[c]++;
      const weights = Array.from({ length: CONFIG.COLORS }, (_, c) => {
        const droughtBoost = 1 + Math.min(2.2, this.drought[c] * 0.16);
        const recentPenalty = 1 / (1 + recentCounts[c] * 0.75);
        const repeatPenalty = this.history.at(-1) === c && this.history.at(-2) === c ? 0.28 : 1;
        return droughtBoost * recentPenalty * repeatPenalty;
      });
      const color = this.rng.weighted(weights);
      this.history.push(color);
      if (this.history.length > 24) this.history.shift();
      for (let i = 0; i < CONFIG.COLORS; i++)
        this.drought[i] = i === color ? 0 : this.drought[i] + 1;
      return color;
    }

    nextPair() {
      if (this.script.length) return this.script.shift().map((c) => ({ ...c }));
      const chance = Math.min(
        CONFIG.PULSE_MAX_CHANCE,
        CONFIG.PULSE_BASE_CHANCE +
          Math.max(0, this.pulsePity - CONFIG.PULSE_PITY_START) * CONFIG.PULSE_PITY_STEP,
      );
      const hasPulse = this.rng.chance(chance);
      if (hasPulse) this.pulsePity = 0;
      else this.pulsePity++;
      const pulseIndex = hasPulse ? this.rng.int(0, 1) : -1;
      return [0, 1].map((i) =>
        i === pulseIndex
          ? { kind: "pulse", color: -1 }
          : { kind: "normal", color: this.nextColor() },
      );
    }
  }

  class Board {
    constructor(owner, game, rng, options = {}) {
      this.owner = owner;
      this.game = game;
      this.rng = rng;
      this.spawnDisabled = !!options.spawnDisabled;
      this.grid = createEmptyGrid();
      this.stream = new PieceStream(rng.fork(0x51a7));
      this.nextQueue = [];
      this.active = null;
      this.resolution = null;
      this.spawnDelay = 0;
      this.pendingLines = 0;
      this.pendingPurge = 0;
      this.riseVisual = null;
      this.stabilizeTimer = 0;
      this.lastChain = 0;
      this.lastClearWasCounter = false;
      this.sequence = 0;
      this.dead = false;
      this.shake = 0;
      this.softDropTick = 0;
      this.ensureQueue();
    }

    reset() {
      this.grid = createEmptyGrid();
      this.stream = new PieceStream(this.rng.fork(++this.sequence + 0x71));
      this.nextQueue = [];
      this.active = null;
      this.resolution = null;
      this.spawnDelay = 0;
      this.pendingLines = 0;
      this.pendingPurge = 0;
      this.riseVisual = null;
      this.stabilizeTimer = 0;
      this.lastChain = 0;
      this.lastClearWasCounter = false;
      this.dead = false;
      this.shake = 0;
      this.ensureQueue();
    }

    seedTutorial() {
      this.grid = createEmptyGrid();
      this.grid[CONFIG.ROWS - 1][1] = makeCell("pulse", -1, { id: globalCellId++ });
      this.grid[CONFIG.ROWS - 1][2] = makeCell("normal", 0, { id: globalCellId++ });
      this.grid[CONFIG.ROWS - 1][3] = makeCell("normal", 0, { id: globalCellId++ });
      this.stream.setScript([
        [
          { kind: "normal", color: 1 },
          { kind: "normal", color: 0 },
        ],
        [
          { kind: "normal", color: 0 },
          { kind: "normal", color: 0 },
        ],
        [
          { kind: "normal", color: 2 },
          { kind: "normal", color: 0 },
        ],
        [
          { kind: "normal", color: 3 },
          { kind: "normal", color: 3 },
        ],
      ]);
      this.nextQueue = [];
      this.ensureQueue();
    }

    ensureQueue() {
      while (this.nextQueue.length < 4) this.nextQueue.push(this.stream.nextPair());
    }

    spawn() {
      if (this.spawnDisabled || this.dead || this.game.ended) return false;
      this.ensureQueue();
      const pair = this.nextQueue.shift();
      this.ensureQueue();
      this.active = {
        a: { ...pair[0] },
        b: { ...pair[1] },
        x: CONFIG.CENTER_COL,
        y: CONFIG.HIDDEN_ROWS,
        rot: 2,
        gravity: 0,
        lock: 0,
        lockResets: 0,
        id: ++this.sequence,
        landingPulse: 0,
        squish: 0,
      };
      if (this.collides(this.active.x, this.active.y, this.active.rot)) {
        this.active = null;
        this.lose("spawn-blocked");
        return false;
      }
      this.game.bus.emit("spawn", { player: this.owner, board: this, pair });
      return true;
    }

    activePositions(x = this.active?.x, y = this.active?.y, rot = this.active?.rot) {
      if (!this.active) return [];
      const offsets = CONFIG.ROT_OFFSETS[mod(rot, 4)];
      return [
        { x: x + offsets[0][0], y: y + offsets[0][1], cell: this.active.a, index: 0 },
        { x: x + offsets[1][0], y: y + offsets[1][1], cell: this.active.b, index: 1 },
      ];
    }

    collides(x, y, rot) {
      if (!this.active) return true;
      for (const pos of this.activePositions(x, y, rot)) {
        if (pos.x < 0 || pos.x >= CONFIG.COLS || pos.y >= CONFIG.ROWS || pos.y < 0) return true;
        if (this.grid[pos.y][pos.x]) return true;
      }
      return false;
    }

    move(dx, dy, silent = false) {
      if (!this.active || this.resolution || this.dead) return false;
      const nx = this.active.x + dx,
        ny = this.active.y + dy;
      if (this.collides(nx, ny, this.active.rot)) return false;
      this.active.x = nx;
      this.active.y = ny;
      if (dx && this.active.lockResets < 12) {
        this.active.lock = 0;
        this.active.lockResets++;
      }
      if (!silent) this.game.bus.emit("pieceMove", { player: this.owner, dx, dy });
      return true;
    }

    rotate(direction = 1) {
      if (!this.active || this.resolution || this.dead) return false;
      const targetRot = mod(this.active.rot + direction, 4);
      const kicks = [
        [0, 0],
        [-1, 0],
        [1, 0],
        [-2, 0],
        [2, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [kx, ky] of kicks) {
        if (!this.collides(this.active.x + kx, this.active.y + ky, targetRot)) {
          this.active.rot = targetRot;
          this.active.x += kx;
          this.active.y += ky;
          if (this.active.lockResets < 12) {
            this.active.lock = 0;
            this.active.lockResets++;
          }
          this.game.bus.emit("pieceRotate", { player: this.owner, direction });
          return true;
        }
      }
      return false;
    }

    getDropDistance() {
      if (!this.active) return 0;
      let d = 0;
      while (!this.collides(this.active.x, this.active.y + d + 1, this.active.rot)) d++;
      return d;
    }

    hardDrop(assist = false) {
      if (!this.active || this.resolution || this.dead) return false;
      if (assist && this.game.tutorial?.active && this.game.tutorial.stage <= 3) {
        const targetX = 4;
        if (!this.collides(targetX, this.active.y, 2)) {
          this.active.x = targetX;
          this.active.rot = 2;
        }
      }
      const distance = this.getDropDistance();
      this.active.y += distance;
      this.owner.score += distance * 2;
      this.active.squish = 1;
      this.game.bus.emit("hardDrop", {
        player: this.owner,
        distance,
        positions: this.activePositions(),
      });
      this.lockPiece();
      return true;
    }

    lockPiece() {
      if (!this.active || this.dead) return;
      const positions = this.activePositions();
      for (const pos of positions) {
        if (!inside(pos.x, pos.y)) {
          this.active = null;
          this.lose("lock-out");
          return;
        }
        this.grid[pos.y][pos.x] = makeCell(pos.cell.kind, pos.cell.color, {
          id: globalCellId++,
          wobble: this.rng.next() * Math.PI * 2,
        });
      }
      const locked = this.active;
      this.active = null;
      this.game.bus.emit("pieceLock", { player: this.owner, positions, piece: locked });
      this.startResolution(false);
    }

    startResolution(counter = false) {
      if (this.dead || this.game.ended) return;
      if (this.resolution) return;
      this.resolution = {
        phase: "scan",
        timer: 0,
        total: 0,
        chain: 0,
        counter: !!counter,
        clear: null,
        moved: 0,
      };
      this.advanceResolution();
    }

    advanceResolution() {
      const r = this.resolution;
      if (!r) return;
      const clear = findClearData(this.grid);
      if (!clear) {
        this.finishResolution();
        return;
      }
      r.chain++;
      r.clear = clear;
      r.phase = "flash";
      r.total = CONFIG.CLEAR_FLASH_MS + Math.min(110, (r.chain - 1) * 24);
      r.timer = r.total;
      for (const { cell } of clear.cells) cell.flash = 1;
      this.owner.onClearStart(clear, r.chain, r.counter);
      this.game.bus.emit("clearStart", {
        player: this.owner,
        board: this,
        clear,
        chain: r.chain,
        counter: r.counter,
      });
    }

    performClear() {
      const r = this.resolution;
      if (!r?.clear) return;
      const clear = r.clear;
      for (const { x, y } of clear.cells) this.grid[y][x] = null;
      this.owner.onClearResolved(clear, r.chain, r.counter);
      this.game.bus.emit("clearResolved", {
        player: this.owner,
        board: this,
        clear,
        chain: r.chain,
        counter: r.counter,
      });
      const moved = collapseGrid(this.grid, true);
      r.moved = moved;
      if (moved > 0) {
        r.phase = "fall";
        r.total = CONFIG.FALL_SETTLE_MS + Math.min(100, moved * 9);
        r.timer = r.total;
      } else {
        r.phase = "scan";
        r.timer = 0;
        r.clear = null;
        this.advanceResolution();
      }
    }

    finishResolution() {
      const r = this.resolution;
      if (!r) return;
      this.lastChain = r.chain;
      this.lastClearWasCounter = r.counter && r.chain > 0;
      if (r.chain > 0) this.owner.onResolutionComplete(r.chain, r.counter);
      this.game.bus.emit("resolutionComplete", {
        player: this.owner,
        board: this,
        chain: r.chain,
        counter: r.counter,
      });
      this.resolution = null;
      for (const row of this.grid)
        for (const cell of row)
          if (cell) {
            cell.fallFrom = null;
            cell.fallDistance = 0;
            cell.flash = 0;
          }

      if (this.pendingPurge > 0) {
        const count = this.pendingPurge;
        this.pendingPurge = 0;
        this.purgeCells(count, true);
        return;
      }
      if (this.pendingLines > 0) {
        const lines = this.pendingLines;
        this.pendingLines = 0;
        this.applyRiseLines(lines, true);
        return;
      }
      if (this.checkCenterTop()) {
        this.lose("center-top");
        return;
      }
      if (!this.active && !this.spawnDisabled) this.spawnDelay = CONFIG.SPAWN_DELAY_MS;
    }

    update(dt, softDrop = false) {
      if (this.dead || this.game.ended) return;
      const ms = dt * 1000;
      this.shake = Math.max(0, this.shake - dt * 4.8);
      this.stabilizeTimer = Math.max(0, this.stabilizeTimer - dt);
      if (this.riseVisual) {
        this.riseVisual.timer -= ms;
        if (this.riseVisual.timer <= 0) this.riseVisual = null;
      }

      if (this.resolution) {
        const r = this.resolution;
        r.timer -= ms;
        if (r.phase === "flash" && r.clear) {
          const p = clamp(r.timer / r.total, 0, 1);
          for (const { cell } of r.clear.cells) cell.flash = p;
          if (r.timer <= 0) this.performClear();
        } else if (r.phase === "fall") {
          if (r.timer <= 0) {
            for (const row of this.grid)
              for (const cell of row)
                if (cell) {
                  cell.fallFrom = null;
                  cell.fallDistance = 0;
                }
            r.phase = "scan";
            r.clear = null;
            this.advanceResolution();
          }
        }
        return;
      }

      if (!this.active) {
        if (this.spawnDisabled) return;
        this.spawnDelay -= ms;
        if (this.spawnDelay <= 0) this.spawn();
        return;
      }

      const interval = this.gravityInterval(softDrop);
      this.active.gravity += ms;
      let safety = 0;
      while (this.active && this.active.gravity >= interval && safety++ < 4) {
        this.active.gravity -= interval;
        if (this.move(0, 1, true)) {
          if (softDrop) {
            this.owner.score += 1;
            this.softDropTick++;
            if (this.softDropTick % 3 === 0) this.game.bus.emit("softDrop", { player: this.owner });
          }
          this.active.lock = 0;
        } else {
          this.active.lock += interval;
          break;
        }
      }
      if (!this.active) return;
      if (this.collides(this.active.x, this.active.y + 1, this.active.rot)) {
        this.active.lock += ms;
        if (this.active.lock >= CONFIG.LOCK_DELAY_MS) this.lockPiece();
      } else this.active.lock = 0;
    }

    gravityInterval(softDrop) {
      if (softDrop) return CONFIG.SOFT_DROP_MS;
      const elapsed = this.game.elapsed || 0;
      const modeRamp = this.game.mode === "blitz" ? 0.84 : 1;
      const ramp = Math.pow(0.965, elapsed / 18);
      const scale = this.owner.isHuman ? 1 : this.game.difficultyConfig.gravityScale;
      return Math.max(CONFIG.MIN_GRAVITY_MS, CONFIG.BASE_GRAVITY_MS * ramp * scale * modeRamp);
    }

    receiveLines(lines) {
      lines = Math.max(0, Math.floor(lines));
      if (!lines || this.dead) return;
      if (this.resolution || this.active) {
        this.pendingLines += lines;
        this.game.bus.emit("attackQueued", { player: this.owner, lines });
      } else this.applyRiseLines(lines, true);
    }

    makeRiseRow() {
      const row = [];
      for (let x = 0; x < CONFIG.COLS; x++) {
        const weights = Array(CONFIG.COLORS).fill(1);
        if (x >= 2 && row[x - 1].color === row[x - 2].color) weights[row[x - 1].color] = 0;
        const above = this.grid[CONFIG.ROWS - 1]?.[x];
        if (above?.kind === "normal") weights[above.color] *= 0.82;
        const color = this.rng.weighted(weights);
        row.push(
          makeCell("normal", color, { id: globalCellId++, wobble: this.rng.next() * Math.PI * 2 }),
        );
      }
      return row;
    }

    applyRiseLines(lines, counterSource = true) {
      if (this.dead || lines <= 0) return;
      if (this.active || this.resolution) {
        this.pendingLines += lines;
        this.game.bus.emit("attackQueued", { player: this.owner, lines });
        return;
      }
      const discarded = [];
      for (let n = 0; n < lines; n++) {
        for (let x = 0; x < CONFIG.COLS; x++)
          if (this.grid[0][x]) discarded.push({ x, cell: this.grid[0][x] });
        for (let y = 0; y < CONFIG.ROWS - 1; y++) this.grid[y] = this.grid[y + 1];
        this.grid[CONFIG.ROWS - 1] = this.makeRiseRow();
      }
      this.riseVisual = { lines, timer: 320 + lines * 35, total: 320 + lines * 35 };
      this.shake = Math.min(1, this.shake + 0.25 + lines * 0.1);
      this.owner.pressureReceived += lines;
      this.game.bus.emit("rise", { player: this.owner, board: this, lines, discarded });

      if (discarded.some((d) => d.x === CONFIG.CENTER_COL)) {
        this.lose("rise-center-out");
        return;
      }
      this.startResolution(counterSource);
    }

    purgeCells(count, fromQueue = false) {
      count = Math.max(0, Math.floor(count));
      if (!count || this.dead) return 0;
      if (this.resolution && !fromQueue) {
        this.pendingPurge += count;
        return count;
      }
      const order = [3, 2, 4, 1, 5, 0, 6];
      const removed = [];
      let remaining = count;
      while (remaining > 0) {
        let didRemove = false;
        for (const x of order) {
          let target = -1;
          for (let y = 0; y < CONFIG.ROWS; y++) {
            if (this.grid[y][x]) {
              target = y;
              break;
            }
          }
          if (target >= 0) {
            removed.push({ x, y: target, cell: this.grid[target][x] });
            this.grid[target][x] = null;
            remaining--;
            didRemove = true;
            if (remaining <= 0) break;
          }
        }
        if (!didRemove) break;
      }
      const actual = removed.length;
      if (actual) {
        collapseGrid(this.grid, true);
        this.stabilizeTimer = 0.4;
        this.game.bus.emit("purge", { player: this.owner, board: this, removed });
        this.startResolution(false);
      }
      return actual;
    }

    checkCenterTop() {
      return !!(this.grid[0][CONFIG.CENTER_COL] || this.grid[1][CONFIG.CENTER_COL]);
    }

    dangerRatio() {
      let top = CONFIG.ROWS;
      for (let y = 0; y < CONFIG.ROWS; y++)
        if (this.grid[y][CONFIG.CENTER_COL]) {
          top = y;
          break;
        }
      const visibleHeight = CONFIG.ROWS - top;
      return clamp((visibleHeight - 5) / 8, 0, 1);
    }

    getGhostPositions() {
      if (!this.active) return [];
      const d = this.getDropDistance();
      return this.activePositions(this.active.x, this.active.y + d, this.active.rot);
    }

    lose(reason) {
      if (this.dead || this.game.ended) return;
      this.dead = true;
      this.active = null;
      this.game.onPlayerLoss(this.owner, reason);
    }
  }

  class Player {
    constructor(game, options) {
      this.game = game;
      this.id = options.id;
      this.name = options.name;
      this.isHuman = !!options.isHuman;
      this.profile = options.profile || null;
      this.cp = 0;
      this.displayCp = 0;
      this.score = 0;
      this.maxChain = 0;
      this.lastChain = 0;
      this.recentChainTimer = 0;
      this.pressureSent = 0;
      this.pressureReceived = 0;
      this.attackCount = 0;
      this.defenseCount = 0;
      this.flow = 0;
      this.flowTimer = 0;
      this.moveRepeat = { dir: 0, held: 0, repeat: 0 };
      this.board = new Board(this, game, options.rng, { spawnDisabled: options.spawnDisabled });
      this.ai = options.ai ? new AIController(this, options.ai) : null;
    }

    reset() {
      this.cp = 0;
      this.displayCp = 0;
      this.score = 0;
      this.maxChain = 0;
      this.lastChain = 0;
      this.recentChainTimer = 0;
      this.pressureSent = 0;
      this.pressureReceived = 0;
      this.attackCount = 0;
      this.defenseCount = 0;
      this.flow = 0;
      this.flowTimer = 0;
      this.moveRepeat = { dir: 0, held: 0, repeat: 0 };
      this.board.reset();
      this.ai?.reset();
    }

    update(dt, input) {
      this.recentChainTimer = Math.max(0, this.recentChainTimer - dt);
      this.flowTimer = Math.max(0, this.flowTimer - dt);
      if (this.flowTimer <= 0) this.flow = Math.max(0, this.flow - dt * 0.35);
      this.displayCp += (this.cp - this.displayCp) * (1 - Math.pow(0.0001, dt));

      if (this.isHuman) this.updateHuman(dt, input);
      else this.ai?.update(dt);

      const soft = this.isHuman && input?.isDown("softDrop") && this.game.state === "playing";
      this.board.update(dt, soft);
    }

    updateHuman(dt, input) {
      if (!input || this.game.state !== "playing" || this.game.ended) return;

      if (input.consume("attack")) this.castAttack();
      if (input.consume("defense")) this.castDefense();

      if (!this.board.active || this.board.resolution) return;
      if (input.consume("rotateCW")) {
        if (!this.board.rotate(1))
          this.game.bus.emit("invalid", { player: this, action: "rotate" });
      }
      if (input.consume("rotateCCW")) {
        if (!this.board.rotate(-1))
          this.game.bus.emit("invalid", { player: this, action: "rotate" });
      }
      if (input.consume("hardDrop")) {
        const assist = !!this.game.tutorial?.active;
        this.board.hardDrop(assist);
        return;
      }

      const leftFirst = input.consume("left");
      const rightFirst = input.consume("right");
      if (leftFirst !== rightFirst) this.board.move(leftFirst ? -1 : 1, 0);

      let dir = 0;
      if (input.isDown("left") && !input.isDown("right")) dir = -1;
      if (input.isDown("right") && !input.isDown("left")) dir = 1;
      const firstForHeld = (dir === -1 && leftFirst) || (dir === 1 && rightFirst);
      if (dir !== this.moveRepeat.dir) {
        this.moveRepeat = { dir, held: 0, repeat: 0 };
        if (dir && !firstForHeld) this.board.move(dir, 0);
      }
      if (!dir) {
        this.moveRepeat = { dir: 0, held: 0, repeat: 0 };
      } else {
        this.moveRepeat.held += dt;
        if (this.moveRepeat.held > 0.135) {
          this.moveRepeat.repeat += dt;
          while (this.moveRepeat.repeat > 0.045) {
            this.moveRepeat.repeat -= 0.045;
            this.board.move(dir, 0);
          }
        }
      }
    }

    onClearStart(clear, chain, _counter) {
      this.maxChain = Math.max(this.maxChain, chain);
      this.flow = clamp(this.flow + 0.14 + chain * 0.055, 0, 1);
      this.flowTimer = 3.1;
      this.game.hitStop = Math.max(
        this.game.hitStop,
        this.game.settings.reducedMotion
          ? 0
          : Math.min(0.105, 0.022 + chain * 0.013 + clear.pulse * 0.025),
      );
    }

    onClearResolved(clear, chain, counter) {
      const chainBonus = 10 * Math.max(0, chain - 1);
      const energy = clear.regular * CONFIG.REGULAR_CP + clear.pulse * CONFIG.PULSE_CP + chainBonus;
      this.cp = clamp(this.cp + energy, 0, CONFIG.MAX_CP);
      const multiplier = 1 + (chain - 1) * 0.55 + (counter ? 0.18 : 0);
      this.score += Math.round(
        (clear.regular * 120 + clear.pulse * 2800 + chainBonus * 8) * multiplier,
      );
      this.game.bus.emit("energy", {
        player: this,
        amount: energy,
        cp: this.cp,
        clear,
        chain,
        counter,
      });
      if (this.game.tutorial?.active && this.isHuman && clear.pulse > 0)
        this.game.tutorialOnPulseClear();
    }

    onResolutionComplete(chain, counter) {
      this.lastChain = chain;
      if (chain > 0) this.recentChainTimer = 3.5;
      if (chain >= 2) this.score += chain * chain * 350;
      if (counter && chain > 0) this.score += chain * 500;
    }

    castAttack() {
      if (this.game.state !== "playing" || this.game.ended) return false;
      if (this.cp < CONFIG.CAST_MIN_CP) {
        this.game.bus.emit("invalid", { player: this, action: "attack" });
        return false;
      }
      const spent = Math.floor(this.cp);
      this.cp = 0;
      const activeChain =
        this.board.resolution?.chain || (this.recentChainTimer > 0 ? this.lastChain : 0);
      let lines = 1 + Math.floor((spent - CONFIG.CAST_MIN_CP) / 125);
      if (activeChain >= 3) lines++;
      lines = clamp(lines, 1, 7);
      this.attackCount++;
      const target = this.game.otherPlayer(this);
      this.game.launchAttack(this, target, lines, spent, activeChain);
      if (this.game.tutorial?.active && this.isHuman) this.game.tutorialOnAttack();
      return true;
    }

    castDefense() {
      if (this.game.state !== "playing" || this.game.ended) return false;
      if (this.cp < CONFIG.CAST_MIN_CP) {
        this.game.bus.emit("invalid", { player: this, action: "defense" });
        return false;
      }
      const spent = Math.floor(this.cp);
      this.cp = 0;
      this.defenseCount++;
      this.game.resolveDefense(this, spent);
      if (this.game.tutorial?.active && this.isHuman) this.game.tutorialOnDefense();
      return true;
    }
  }

  class AIController {
    constructor(player, options) {
      this.player = player;
      this.game = player.game;
      this.profile = options.profile;
      this.difficulty = options.difficulty;
      this.rng = options.rng;
      this.target = null;
      this.activeId = -1;
      this.thinkTimer = 0;
      this.stepTimer = 0;
      this.castCooldown = 0;
      this.alignedTimer = 0;
    }

    reset() {
      this.target = null;
      this.activeId = -1;
      this.thinkTimer = 0;
      this.stepTimer = 0;
      this.castCooldown = 0;
      this.alignedTimer = 0;
    }

    update(dt) {
      if (this.game.state !== "playing" || this.game.ended || this.player.board.dead) return;
      this.castCooldown = Math.max(0, this.castCooldown - dt);
      this.updateCasting();
      const board = this.player.board;
      if (!board.active || board.resolution) return;
      if (board.active.id !== this.activeId) {
        this.activeId = board.active.id;
        this.target = null;
        this.thinkTimer = this.difficulty.decisionDelay / 1000 + this.rng.next() * 0.12;
        this.alignedTimer = 0;
      }
      if (this.thinkTimer > 0) {
        this.thinkTimer -= dt;
        if (this.thinkTimer <= 0) this.target = this.choosePlacement();
        return;
      }
      if (!this.target) this.target = this.choosePlacement();
      this.stepTimer -= dt;
      if (this.stepTimer > 0) return;
      this.stepTimer = (this.difficulty.aiStep / 1000) * (0.85 + this.rng.next() * 0.3);

      const a = board.active;
      if (!a || !this.target) return;
      if (a.rot !== this.target.rot) {
        const cw = mod(this.target.rot - a.rot, 4);
        board.rotate(cw === 3 ? -1 : 1);
        return;
      }
      if (a.x !== this.target.x) {
        board.move(Math.sign(this.target.x - a.x), 0);
        return;
      }
      this.alignedTimer += this.stepTimer;
      if (this.alignedTimer >= (this.difficulty.decisionDelay / 1000) * 0.65) board.hardDrop(false);
    }

    updateCasting() {
      if (this.castCooldown > 0 || this.player.cp < CONFIG.CAST_MIN_CP) return;
      if (this.game.tutorial?.active) return;
      const boardDanger = this.player.board.dangerRatio();
      const incoming = this.game.getIncomingLines(this.player) + this.player.board.pendingLines;
      if (
        incoming > 0 &&
        (boardDanger >= this.profile.defendDanger || incoming >= 3 || this.player.cp >= 500)
      ) {
        if (this.player.castDefense()) this.castCooldown = 0.55 + this.rng.next() * 0.6;
        return;
      }
      const opponent = this.game.otherPlayer(this.player);
      let threshold = this.profile.attackAt;
      if (this.profile.id === "mirror") {
        threshold =
          opponent.board.dangerRatio() > 0.55 ? 100 : opponent.cp > this.player.cp ? 280 : 170;
      }
      if (opponent.board.dangerRatio() > 0.72) threshold = Math.min(threshold, 100);
      if (
        this.player.cp >= threshold &&
        (this.rng.next() < 0.035 * this.profile.attackBias || this.player.cp >= threshold + 90)
      ) {
        if (this.player.castAttack()) this.castCooldown = 0.45 + this.rng.next() * 0.55;
      }
    }

    choosePlacement() {
      const board = this.player.board;
      const active = board.active;
      if (!active) return null;
      const candidates = [];
      for (let rot = 0; rot < 4; rot++) {
        for (let x = -1; x <= CONFIG.COLS; x++) {
          const placement = this.dropPlacement(board.grid, active, x, rot);
          if (!placement) continue;
          const grid = deepCloneGrid(board.grid);
          for (const pos of placement.cells)
            grid[pos.y][pos.x] = { ...cellTemplate(pos.cell), id: 1 };
          const sim = simulateResolution(grid);
          const metrics = gridMetrics(sim.grid);
          const potential = groupPotential(sim.grid);
          const p = this.profile;
          let score = 0;
          score += sim.regular * 17;
          score += sim.pulse * 150 * p.pulseWeight;
          score += sim.chain * sim.chain * 52 * p.chainWeight;
          score += potential.pairs * 10 * p.chainWeight;
          score += potential.adjacency * 2.2;
          score += potential.pulseEdges * 7 * p.pulseWeight;
          score -= metrics.holes * 15;
          score -= metrics.roughness * 2.4;
          score -= metrics.maxHeight * 2.2;
          score -= metrics.centerHeight * 7.5 * p.centerPenalty;
          score -= metrics.hidden * 160;
          score -= Math.pow(metrics.danger, 2) * 320 * p.centerPenalty;
          score += (metrics.heights[0] + metrics.heights[6]) * 1.8;
          if (placement.cells.some((c) => c.cell.kind === "pulse")) {
            for (const pc of placement.cells.filter((c) => c.cell.kind === "pulse")) {
              for (const [dx, dy] of DIRS) {
                const nx = pc.x + dx,
                  ny = pc.y + dy;
                if (inside(nx, ny) && sim.grid[ny][nx]?.kind === "normal")
                  score += 15 * p.pulseWeight;
              }
            }
          }
          score += this.rng.gaussian(0, this.difficulty.noise);
          candidates.push({ x, rot, y: placement.y, score, simChain: sim.chain });
        }
      }
      if (!candidates.length)
        return { x: CONFIG.CENTER_COL, rot: active.rot, y: 0, score: -Infinity };
      candidates.sort((a, b) => b.score - a.score);
      const shortlist = candidates.slice(0, this.difficulty.name === "SOFT" ? 4 : 2);
      return this.rng.pick(shortlist);
    }

    dropPlacement(grid, active, x, rot) {
      const offsets = CONFIG.ROT_OFFSETS[rot];
      const collisionAt = (y) => {
        for (let i = 0; i < 2; i++) {
          const px = x + offsets[i][0],
            py = y + offsets[i][1];
          if (px < 0 || px >= CONFIG.COLS || py >= CONFIG.ROWS || py < 0 || grid[py][px])
            return true;
        }
        return false;
      };
      let y = CONFIG.HIDDEN_ROWS;
      if (collisionAt(y)) return null;
      while (!collisionAt(y + 1)) y++;
      const cells = [
        { x: x + offsets[0][0], y: y + offsets[0][1], cell: active.a },
        { x: x + offsets[1][0], y: y + offsets[1][1], cell: active.b },
      ];
      if (cells.some((c) => c.y < 0)) return null;
      return { x, y, rot, cells };
    }
  }

  class GameSession {
    constructor(options) {
      this.mode = options.mode || "duel";
      this.difficultyIndex = clamp(options.difficulty ?? 1, 0, CONFIG.DIFFICULTY.length - 1);
      this.difficultyConfig = CONFIG.DIFFICULTY[this.difficultyIndex];
      this.seed = options.seed ?? Date.now();
      this.rng = new PLO.RNG(this.seed);
      this.bus = options.bus || new PLO.EventBus();
      this.audio = options.audio || null;
      this.settings = options.settings || {};
      this.state = "countdown";
      this.countdown = 1.65;
      this.countdownMark = 2;
      this.elapsed = 0;
      this.timeLeft = this.mode === "blitz" ? CONFIG.BLITZ_SECONDS : Infinity;
      this.ended = false;
      this.winner = null;
      this.endReason = "";
      this.projectiles = [];
      this.hitStop = 0;
      this.globalIntensity = 0;
      this.profile = this.chooseProfile(options.rank || 0);
      const playerRng = this.rng.fork(0x1234);
      const cpuRng = this.rng.fork(0xabcd);
      this.player = new Player(this, { id: "player", isHuman: true, rng: playerRng });
      this.cpu = new Player(this, {
        id: "cpu",
        name: this.profile.label,
        isHuman: false,
        rng: cpuRng,
        spawnDisabled: this.mode === "lab",
        profile: this.profile,
        ai:
          this.mode === "lab"
            ? null
            : { profile: this.profile, difficulty: this.difficultyConfig, rng: cpuRng.fork(0x987) },
      });
      this.players = [this.player, this.cpu];
      this.tutorial = options.tutorial
        ? { active: true, stage: 0, timer: 0, sentDefenseLesson: false, complete: false }
        : null;
      if (this.tutorial) this.player.board.seedTutorial();
      if (this.mode === "lab") this.seedLabTarget();
      this.player.board.spawn();
      if (this.mode !== "lab") this.cpu.board.spawn();
      this.bus.emit("sessionCreated", { game: this });
    }

    chooseProfile(rank) {
      if (this.difficultyIndex === 3) return CONFIG.PROFILES[4];
      const pool = CONFIG.PROFILES.slice(0, 4);
      return pool[(Math.max(0, rank) + this.difficultyIndex) % pool.length];
    }

    seedLabTarget() {
      const b = this.cpu.board;
      b.grid = createEmptyGrid();
      for (let y = CONFIG.ROWS - 1; y >= CONFIG.ROWS - 5; y--) {
        for (let x = 0; x < CONFIG.COLS; x++) {
          if (this.rng.chance(0.18)) continue;
          const color = (x + y * 2) % CONFIG.COLORS;
          b.grid[y][x] = makeCell("normal", color, { id: globalCellId++ });
        }
      }
    }

    otherPlayer(player) {
      return player === this.player ? this.cpu : this.player;
    }

    update(dt, input) {
      dt = Math.min(dt, 0.05);
      if (this.ended) return;
      if (this.hitStop > 0 && !this.settings.reducedMotion) {
        this.hitStop = Math.max(0, this.hitStop - dt);
        this.updateProjectiles(dt * 0.2);
        return;
      }
      if (this.state === "countdown") {
        this.countdown -= dt;
        const mark = Math.ceil(this.countdown);
        if (mark !== this.countdownMark && mark >= 0) {
          this.countdownMark = mark;
          this.bus.emit("countdown", { value: mark });
        }
        if (this.countdown <= 0) {
          this.state = "playing";
          this.bus.emit("matchStart", { game: this });
        }
        return;
      }
      if (this.state !== "playing") return;

      this.elapsed += dt;
      if (this.mode === "blitz") {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.endByBlitzScore();
          return;
        }
      }

      this.player.update(dt, input);
      this.cpu.update(dt, input);
      this.updateProjectiles(dt);
      this.updateTutorial(dt);
      this.globalIntensity = clamp(
        Math.max(
          this.player.flow,
          this.cpu.flow,
          this.player.board.dangerRatio(),
          this.cpu.board.dangerRatio() * 0.8,
        ),
        0,
        1,
      );
    }

    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.elapsed += dt * 1000;
        if (p.elapsed < p.duration) continue;
        this.projectiles.splice(i, 1);
        if (p.lines > 0 && !p.target.board.dead) {
          p.target.board.receiveLines(p.lines);
          this.bus.emit("attackImpact", { projectile: p, player: p.target, lines: p.lines });
        } else this.bus.emit("attackDissipate", { projectile: p });
      }
    }

    launchAttack(from, target, lines, spent, chain = 0) {
      const projectile = {
        id: globalProjectileId++,
        from,
        target,
        lines,
        originalLines: lines,
        spent,
        chain,
        elapsed: 0,
        duration: CONFIG.ATTACK_TRAVEL_MS + lines * 25,
        canceled: 0,
      };
      this.projectiles.push(projectile);
      from.pressureSent += lines;
      this.bus.emit("attackLaunch", { projectile, from, target, lines, spent, chain });
      return projectile;
    }

    getIncomingLines(player) {
      return this.projectiles.reduce((sum, p) => sum + (p.target === player ? p.lines : 0), 0);
    }

    resolveDefense(player, spent) {
      let units = Math.max(1, Math.floor(spent / 90));
      const incoming = this.projectiles
        .filter((p) => p.target === player && p.lines > 0)
        .sort((a, b) => a.duration - a.elapsed - (b.duration - b.elapsed));
      let canceled = 0;
      for (const p of incoming) {
        if (units <= 0) break;
        const used = Math.min(units, p.lines);
        p.lines -= used;
        p.canceled += used;
        units -= used;
        canceled += used;
        if (p.lines === 0) this.bus.emit("projectileCanceled", { projectile: p, player });
      }
      if (units > 0 && player.board.pendingLines > 0) {
        const used = Math.min(units, player.board.pendingLines);
        player.board.pendingLines -= used;
        units -= used;
        canceled += used;
      }
      const purgeCount = units * 4;
      const purged = purgeCount ? player.board.purgeCells(purgeCount) : 0;
      player.board.stabilizeTimer = Math.max(player.board.stabilizeTimer, 0.4);
      this.bus.emit("defense", {
        player,
        spent,
        canceled,
        purged,
        units: Math.max(1, Math.floor(spent / 90)),
      });
    }

    onPlayerLoss(player, reason) {
      if (this.ended) return;
      const other = this.otherPlayer(player);
      if (this.mode === "lab" && player === this.cpu) {
        player.board.reset();
        player.board.spawnDisabled = true;
        player.board.dead = false;
        this.seedLabTarget();
        this.bus.emit("labTargetReset", { player });
        return;
      }
      this.endMatch(other, reason);
    }

    endByBlitzScore() {
      const value = (p) => p.score + p.pressureSent * 1300 - p.board.dangerRatio() * 3500;
      const pv = value(this.player),
        cv = value(this.cpu);
      this.endMatch(pv >= cv ? this.player : this.cpu, "time");
    }

    endMatch(winner, reason = "topout") {
      if (this.ended) return;
      this.ended = true;
      this.state = "ended";
      this.winner = winner;
      this.endReason = reason;
      this.bus.emit("matchEnd", { game: this, winner, loser: this.otherPlayer(winner), reason });
    }

    tutorialInput(action) {
      const t = this.tutorial;
      if (!t?.active) return;
      if (t.stage === 0 && (action === "left" || action === "right")) {
        t.stage = 1;
        t.timer = 0;
        this.bus.emit("tutorialStage", { stage: 1 });
      } else if (t.stage === 1 && (action === "rotateCW" || action === "rotateCCW")) {
        t.stage = 2;
        t.timer = 0;
        this.bus.emit("tutorialStage", { stage: 2 });
      } else if (t.stage === 2 && action === "hardDrop") {
        t.stage = 3;
        t.timer = 0;
        this.bus.emit("tutorialStage", { stage: 3 });
      }
    }

    tutorialOnPulseClear() {
      const t = this.tutorial;
      if (!t?.active || t.stage > 4) return;
      t.stage = 4;
      t.timer = 0;
      this.bus.emit("tutorialStage", { stage: 4 });
    }

    tutorialOnAttack() {
      const t = this.tutorial;
      if (!t?.active || t.stage !== 4) return;
      t.stage = 5;
      t.timer = 1.15;
      this.bus.emit("tutorialStage", { stage: 5 });
    }

    tutorialOnDefense() {
      const t = this.tutorial;
      if (!t?.active || t.stage !== 6) return;
      t.active = false;
      t.complete = true;
      t.stage = 7;
      this.bus.emit("tutorialComplete", {});
    }

    updateTutorial(dt) {
      const t = this.tutorial;
      if (!t?.active) return;
      t.timer += t.stage === 5 ? -dt : dt;
      if (t.stage === 5 && t.timer <= 0 && !t.sentDefenseLesson) {
        t.sentDefenseLesson = true;
        this.player.cp = Math.max(this.player.cp, 100);
        const p = this.launchAttack(this.cpu, this.player, 2, 100, 0);
        p.duration = 1250;
        t.stage = 6;
        t.timer = 0;
        this.bus.emit("tutorialStage", { stage: 6 });
      }
    }

    snapshot() {
      const packPlayer = (p) => ({
        id: p.id,
        cp: p.cp,
        score: p.score,
        maxChain: p.maxChain,
        lastChain: p.lastChain,
        pressureSent: p.pressureSent,
        pressureReceived: p.pressureReceived,
        danger: p.board.dangerRatio(),
        pending: p.board.pendingLines,
        grid: p.board.grid.map((row) =>
          row.map((c) => (c ? { kind: c.kind, color: c.color } : null)),
        ),
        active: p.board.active
          ? {
              x: p.board.active.x,
              y: p.board.active.y,
              rot: p.board.active.rot,
              a: { ...p.board.active.a },
              b: { ...p.board.active.b },
            }
          : null,
      });
      return {
        version: CONFIG.VERSION,
        seed: this.seed,
        mode: this.mode,
        state: this.state,
        elapsed: this.elapsed,
        timeLeft: this.timeLeft,
        player: packPlayer(this.player),
        cpu: packPlayer(this.cpu),
        projectiles: this.projectiles.map((p) => ({
          from: p.from.id,
          target: p.target.id,
          lines: p.lines,
          elapsed: p.elapsed,
          duration: p.duration,
        })),
        tutorial: this.tutorial ? { ...this.tutorial } : null,
      };
    }
  }

  PLO.logic = {
    findClearData,
    collapseGrid,
    simulateResolution,
    gridMetrics,
    groupPotential,
    createEmptyGrid,
  };
  PLO.PieceStream = PieceStream;
  PLO.Board = Board;
  PLO.Player = Player;
  PLO.AIController = AIController;
  PLO.GameSession = GameSession;
})();
