/* LABYRINTHE — génération procédurale du labyrinthe */
(function () {
  'use strict';
  const LH = window.LH;

  const N = 1, E = 2, S = 4, W = 8;
  const DX = { 1: 0, 2: 1, 4: 0, 8: -1 };
  const DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
  const OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };

  class Maze {
    constructor(cols, rows, seed) {
      this.cols = cols;
      this.rows = rows;
      this.seed = seed >>> 0;
      this.walls = new Uint8Array(cols * rows).fill(N | E | S | W);
      this.rng = LH.mulberry32(this.seed);
      this.generate();
    }

    idx(x, y) { return y * this.cols + x; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
    wallsAt(x, y) { return this.walls[y * this.cols + x]; }
    hasWall(x, y, dir) { return (this.walls[y * this.cols + x] & dir) !== 0; }

    generate() {
      const { cols, rows } = this;
      const visited = new Uint8Array(cols * rows);
      const stack = [0];
      visited[0] = 1;
      const rng = this.rng;
      while (stack.length) {
        const cur = stack[stack.length - 1];
        const cx = cur % cols, cy = (cur / cols) | 0;
        const options = [];
        if (cy > 0 && !visited[cur - cols]) options.push([cx, cy - 1, N]);
        if (cx < cols - 1 && !visited[cur + 1]) options.push([cx + 1, cy, E]);
        if (cy < rows - 1 && !visited[cur + cols]) options.push([cx, cy + 1, S]);
        if (cx > 0 && !visited[cur - 1]) options.push([cx - 1, cy, W]);
        if (options.length) {
          const [nx, ny, dir] = options[(rng() * options.length) | 0];
          this.carve(cx, cy, nx, ny, dir);
          visited[ny * cols + nx] = 1;
          stack.push(ny * cols + nx);
        } else {
          stack.pop();
        }
      }
    }

    carve(x, y, nx, ny, dir) {
      this.walls[y * this.cols + x] &= ~dir;
      this.walls[ny * this.cols + nx] &= ~OPP[dir];
    }

    // Ouvre des boucles : on casse une partie des impasses. Moins de boucles = plus dur.
    braid(amount) {
      const rng = this.rng;
      const dead = this.deadEnds();
      // mélange
      for (let i = dead.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = dead[i]; dead[i] = dead[j]; dead[j] = t;
      }
      for (const ci of dead) {
        if (rng() > amount) continue;
        const x = ci % this.cols, y = (ci / this.cols) | 0;
        const opts = [];
        if (x > 0 && this.hasWall(x, y, W)) opts.push([x - 1, y, W]);
        if (x < this.cols - 1 && this.hasWall(x, y, E)) opts.push([x + 1, y, E]);
        if (y > 0 && this.hasWall(x, y, N)) opts.push([x, y - 1, N]);
        if (y < this.rows - 1 && this.hasWall(x, y, S)) opts.push([x, y + 1, S]);
        if (!opts.length) continue;
        const [nx, ny, dir] = opts[(rng() * opts.length) | 0];
        this.carve(x, y, nx, ny, dir);
      }
    }

    deadEnds() {
      const out = [];
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const w = this.walls[y * this.cols + x];
          let count = 0;
          if (w & N) count++; if (w & E) count++; if (w & S) count++; if (w & W) count++;
          if (count === 3) out.push(y * this.cols + x);
        }
      }
      return out;
    }

    bfs(startIdx) {
      const n = this.cols * this.rows;
      const dist = new Int32Array(n).fill(-1);
      const queue = new Int32Array(n);
      let head = 0, tail = 0;
      dist[startIdx] = 0;
      queue[tail++] = startIdx;
      while (head < tail) {
        const cur = queue[head++];
        const x = cur % this.cols, y = (cur / this.cols) | 0;
        const d = dist[cur] + 1;
        const w = this.walls[cur];
        if (!(w & N) && dist[cur - this.cols] < 0) { dist[cur - this.cols] = d; queue[tail++] = cur - this.cols; }
        if (!(w & E) && dist[cur + 1] < 0) { dist[cur + 1] = d; queue[tail++] = cur + 1; }
        if (!(w & S) && dist[cur + this.cols] < 0) { dist[cur + this.cols] = d; queue[tail++] = cur + this.cols; }
        if (!(w & W) && dist[cur - 1] < 0) { dist[cur - 1] = d; queue[tail++] = cur - 1; }
      }
      return dist;
    }

    farthestFrom(startIdx) {
      const dist = this.bfs(startIdx);
      let best = startIdx, bd = -1;
      for (let i = 0; i < dist.length; i++) {
        if (dist[i] > bd) { bd = dist[i]; best = i; }
      }
      return { index: best, distance: bd, dist };
    }

    // Chemin BFS (retourne une liste d'index de cellules, départ exclu, arrivée incluse)
    findPath(fromIdx, toIdx) {
      if (fromIdx === toIdx) return [];
      const n = this.cols * this.rows;
      const prev = new Int32Array(n).fill(-1);
      const seen = new Uint8Array(n);
      const queue = new Int32Array(n);
      let head = 0, tail = 0;
      queue[tail++] = fromIdx; seen[fromIdx] = 1;
      let found = false;
      while (head < tail) {
        const cur = queue[head++];
        if (cur === toIdx) { found = true; break; }
        const x = cur % this.cols, y = (cur / this.cols) | 0;
        const w = this.walls[cur];
        const push = (ni) => { if (!seen[ni]) { seen[ni] = 1; prev[ni] = cur; queue[tail++] = ni; } };
        if (!(w & N)) push(cur - this.cols);
        if (!(w & E)) push(cur + 1);
        if (!(w & S)) push(cur + this.cols);
        if (!(w & W)) push(cur - 1);
      }
      if (!found) return [];
      const path = [];
      let cur = toIdx;
      while (cur !== fromIdx && cur >= 0) {
        path.push(cur);
        cur = prev[cur];
      }
      path.reverse();
      return path;
    }

    // Ligne de vue entre deux points exprimés en coordonnées de grille (cellule = 1 unité)
    lineOfSight(x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 0.0001) return true;
      const steps = Math.max(1, Math.ceil(len * 10));
      let px = x0, py = y0;
      let pcx = Math.floor(px), pcy = Math.floor(py);
      for (let i = 1; i <= steps; i++) {
        const nx = x0 + (dx * i) / steps;
        const ny = y0 + (dy * i) / steps;
        const cx = Math.floor(nx), cy = Math.floor(ny);
        if (cx !== pcx || cy !== pcy) {
          if (!this.passage(pcx, pcy, cx, cy)) return false;
          pcx = cx; pcy = cy;
        }
      }
      return true;
    }

    passage(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      if (dx === 1 && dy === 0) return !this.hasWall(ax, ay, E);
      if (dx === -1 && dy === 0) return !this.hasWall(ax, ay, W);
      if (dx === 0 && dy === 1) return !this.hasWall(ax, ay, S);
      if (dx === 0 && dy === -1) return !this.hasWall(ax, ay, N);
      if (Math.abs(dx) + Math.abs(dy) === 2) {
        // Passage en diagonale : on exige un couloir dégagé (conservateur)
        if (dx === 1 && dy === 1) {
          return (!this.hasWall(ax, ay, E) && !this.hasWall(bx, ay, S)) ||
                 (!this.hasWall(ax, ay, S) && !this.hasWall(ax, by, E));
        }
        if (dx === 1 && dy === -1) {
          return (!this.hasWall(ax, ay, E) && !this.hasWall(bx, ay, N)) ||
                 (!this.hasWall(ax, ay, N) && !this.hasWall(ax, by, E));
        }
        if (dx === -1 && dy === 1) {
          return (!this.hasWall(ax, ay, W) && !this.hasWall(bx, ay, S)) ||
                 (!this.hasWall(ax, ay, S) && !this.hasWall(ax, by, W));
        }
        if (dx === -1 && dy === -1) {
          return (!this.hasWall(ax, ay, W) && !this.hasWall(bx, ay, N)) ||
                 (!this.hasWall(ax, ay, N) && !this.hasWall(ax, by, W));
        }
      }
      return false;
    }
  }

  LH.Maze = Maze;
  LH.MAZE_N = N; LH.MAZE_E = E; LH.MAZE_S = S; LH.MAZE_W = W;
})();
