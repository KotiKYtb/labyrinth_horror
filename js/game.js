/* LABYRINTHE — boucle de jeu, progression, interface */
(function () {
  'use strict';
  const LH = window.LH;
  const CELL = LH.CELL;
  const SAVE_KEY = 'labyrinthe_horror_save_v1';

  class Game {
    constructor() {
      this.state = 'menu';
      this.levelIndex = 0;
      this.levelCfg = null;
      this.maze = null;
      this.monsters = [];
      this.relicsCollected = 0;
      this.totalRelics = 0;
      this.exitUnlocked = false;
      this.levelTime = 0;
      this.globalTime = 0;
      this.graceTimer = 0;
      this.graceActive = false;
      this.blackoutTimer = 0;
      this.deathTimer = 0;
      this.keys = {};
      this.touch = { x: 0, y: 0, active: false, sprint: false };
      this.lastHudTimer = -1;
      this.lastThreat = 0;
      this.heartTimer = 0;
      this.lastAlertSubtitle = -99;
      this.lastScareAt = -99;
      this.lastForgetSound = -99;
      this.menuTime = 0;
      this.audioReady = false;
      this.player = this.makePlayer();
      this.save = this.loadSave();
      this.scares = new LH.Scares();
      this.scares.init();
      this.audio = new LH.AudioEngine();
      this.initRenderer();
      this.world = new LH.World(this.renderer);
      this.world.resize();
      this.scares.setGrain(this.save.settings.grain);
      this.bindUI();
      this.bindInput();
      this.applySettings();
      this.updateAudioHint('none');
      this.buildMenuScene();
      this.showScreen('menu');
      this.lastFrame = performance.now();
      this.raf = this.animate.bind(this);
      requestAnimationFrame(this.raf);
      document.body.classList.add('booted');
    }

    // ------------------------------------------------------------------ init
    get canHunt() {
      return this.state === 'playing';
    }

    makePlayer() {
      return {
        x: 0, z: 0, angle: 0, yaw: 0, pitch: 0, speed: 0, moving: false,
        sprinting: false, crouch: false, stamina: 100, staminaRegenDelay: 0,
        stepTimer: 0.2, dead: false, lamp: 100, lampOn: true
      };
    }

    initRenderer() {
      const canvas = LH.el('scene');
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setClearColor(0x050505, 1);
      this.renderer.autoClear = true;
    }

    loadSave() {
      const def = {
        unlocked: 1,
        best: {},
        completed: [],
        settings: { volume: 0.72, grain: true, shake: true, muted: false, firstPerson: true }
      };
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return def;
        const data = JSON.parse(raw);
        return {
          unlocked: Math.max(1, Math.min(5, data.unlocked || 1)),
          best: data.best || {},
          completed: Array.isArray(data.completed) ? data.completed : [],
          settings: Object.assign({}, def.settings, data.settings || {})
        };
      } catch (e) {
        return def;
      }
    }

    persist() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
      } catch (e) { /* stockage indisponible */ }
    }

    initAudio() {
      if (!this.audioReady) {
        this.audio.init();
        if (this.audio.ready) {
          this.audioReady = true;
          this.audio.setVolume(this.save.settings.volume);
          this.audio.setMuted(this.save.settings.muted);
          this.audio.onStateChange = (s) => this.updateAudioHint(s);
        }
      }
      this.audio.resume();
      this.updateAudioHint(this.audio.ctx ? this.audio.ctx.state : 'none');
    }

    // Badge « ACTIVER LE SON » : visible tant que le navigateur n'a pas autorisé l'audio.
    updateAudioHint(state) {
      const hint = LH.el('audio-hint');
      if (!hint) return;
      if (this.audio && this.audio.supported === false) {
        hint.classList.add('visible', 'unsupported');
        hint.textContent = 'AUDIO INDISPONIBLE';
        return;
      }
      hint.classList.remove('unsupported');
      const st = state || (this.audio.ctx ? this.audio.ctx.state : 'none');
      // Une pause volontaire met le contexte en veille : ce n'est pas un blocage.
      const onPurpose = this.state === 'paused' || this.state === 'dying';
      const running = st === 'running';
      const show = !this.save.settings.muted && !running && !onPurpose;
      hint.classList.toggle('visible', show);
      hint.textContent = this.audioReady && !running
        ? 'SON EN PAUSE — CLIQUER POUR ACTIVER'
        : 'ACTIVER LE SON';
    }

    applySettings() {
      if (this.audio.master) {
        this.audio.setVolume(this.save.settings.volume);
        this.audio.setMuted(this.save.settings.muted);
      }
      this.scares.setGrain(this.save.settings.grain);
      const vol = LH.el('volume-range');
      if (vol) vol.value = Math.round(this.save.settings.volume * 100);
      const grain = LH.el('grain-toggle');
      if (grain) grain.checked = !!this.save.settings.grain;
      const shake = LH.el('shake-toggle');
      if (shake) shake.checked = !!this.save.settings.shake;
      this.updateMuteButton();
    }

    // ------------------------------------------------------------------ menus
    showScreen(name) {
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('visible'));
      const el = LH.el(name);
      if (el) el.classList.add('visible');
      document.body.classList.toggle('ui-open', name !== 'none');
    }

    hideScreens() {
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('visible'));
      document.body.classList.remove('ui-open');
    }

    renderLevelCards() {
      const grid = LH.el('level-grid');
      if (!grid) return;
      grid.innerHTML = '';
      LH.LEVELS.forEach((cfg, i) => {
        const unlocked = i + 1 <= this.save.unlocked;
        const done = this.save.completed.includes(cfg.id);
        const best = this.save.best[cfg.id];
        const card = document.createElement('button');
        card.className = 'level-card' + (unlocked ? '' : ' locked') + (done ? ' done' : '');
        card.type = 'button';
        card.disabled = !unlocked;
        card.innerHTML = `
          <span class="lc-numeral">${cfg.numeral}</span>
          <span class="lc-name">${cfg.name}</span>
          <span class="lc-diff">${LH.DIFFICULTY_LABEL[i]}</span>
          <span class="lc-meta">${unlocked ? (best ? 'MEILLEUR · ' + LH.fmtTime(best) : 'NON EXPLORÉ') : 'SCELLÉ'}</span>
          <span class="lc-lock">${unlocked ? (done ? '✦' : '→') : '✕'}</span>
        `;
        if (unlocked) {
          card.addEventListener('click', () => {
            this.initAudio();
            this.audio.click();
            this.startLevel(i);
          });
        }
        grid.appendChild(card);
      });
    }

    openMenu() {
      this.state = 'menu';
      this.audio.stopAmbience(1.0);
      this.audio.setTension(0);
      this.hideHUD();
      this.scares.clearEvents();
      this.scares.overlay.classList.remove('active');
      this.scares.active = false;
      this.world.clearLevel();
      this.buildMenuScene();
      this.renderLevelCards();
      this.showScreen('menu');
      document.body.dataset.state = 'menu';
    }

    buildMenuScene() {
      this.world.clearLevel();
      this.world.setFirstPerson(false);
      const maze = new LH.Maze(13, 13, 20261017);
      maze.braid(0.5);
      const theme = Object.assign({}, LH.LEVELS[0].theme, {
        fog: 0x030303,
        density: 0.02,
        ambient: 0x38302a,
        ambientIntensity: 0.75
      });
      this.world.buildLevel(maze, theme, LH.LEVELS[0]);
      this.world.setAllAlphas(0.82);
      this.menuMaze = maze;
      this.menuTime = 0;
      this.updateMenu(0.016);
    }

    updateMenu(dt) {
      this.menuTime += dt;
      const t = this.menuTime;
      const r = 21;
      const a = t * 0.055;
      this.world.camera.position.set(Math.sin(a) * r, 26, Math.cos(a) * r);
      this.world.camera.lookAt(0, 0, 0);
      this.world.update(dt, this.globalTime);
      if (this.world.uniforms) {
        this.world.uniforms.uLightPos.value.set(Math.sin(t * 0.35) * 13, 7.5, Math.cos(t * 0.3) * 13);
        this.world.uniforms.uLightIntensity.value = 2.1;
        this.world.uniforms.uCamPos.value.copy(this.world.camera.position);
      }
      this.world.render();
      if (this.scares) this.scares.update(dt, null, null);
    }

    // ------------------------------------------------------------------ niveau
    startLevel(index) {
      this.initAudio();
      const cfg = LH.LEVELS[index];
      if (!cfg) return;
      this.levelIndex = index;
      this.levelCfg = cfg;
      this.state = 'intro';
      document.body.dataset.state = 'intro';
      this.hideHUD();
      this.scares.clearEvents();
      this.scares.active = false;
      this.scares.overlay.classList.remove('active');

      this.player = this.makePlayer();
      this.monsters = [];
      this.relicsCollected = 0;
      this.exitUnlocked = false;
      this.levelTime = 0;
      this.blackoutTimer = 0;
      this.deathTimer = 0;
      this.threat = 0;
      this.lastHudTimer = -1;
      this.lastAlertSubtitle = -99;
      this.lastScareAt = -99;
      this.lastForgetSound = -99;
      this.lastLockedMsg = -99;
      this.heartTimer = 0;
      this.resonanceTimer = 0;
      this.playerGlowPulse = 0;
      this.timers = null;
      this.deathCause = null;
      this.world.camOffset.set(0, 33, 18.5);
      this.world.shakeAmount = 0;

      const maze = new LH.Maze(cfg.cols, cfg.rows, cfg.seed);
      maze.braid(cfg.braid);
      this.maze = maze;
      this.world.buildLevel(maze, cfg.theme, cfg);
      this.buildCollision();
      this.placeObjectives();
      this.totalRelics = cfg.relics;
      this.spawnPlayer();
      this.spawnMonsters();
      this.resetMemory();
      this.world.setTorchColor(cfg.theme.torch);
      this.world.setTorch(2.0, cfg.theme.torchRange);
      this.world.setAmbientFactor(1);
      this.world.setMoonFactor(1);
      this.matchesCollected = 0;
      this.world.setFirstPerson(this.save.settings.firstPerson);
      this.world.fpYaw = this.player.yaw;
      this.toldForget = false;
      this.toldDanger = false;
      this.scares.setGrain(this.save.settings.grain);

      // découverte initiale
      this.updateMemory(0.016);
      this.world.applyCellAlphas(this.visualAlpha);
      this.world.focusCamera(this.player.x, this.player.z, 0, true);

      // interface d'intro
      LH.el('intro-numeral').textContent = cfg.numeral;
      LH.el('intro-title').textContent = cfg.name;
      LH.el('intro-sub').textContent = cfg.subtitle;
      LH.el('intro-story').textContent = cfg.story;
      LH.el('intro-objective').textContent = cfg.objective;
      LH.el('intro-diff').textContent = LH.DIFFICULTY_LABEL[index];
      LH.el('intro-relics').textContent = String(cfg.relics);
      LH.el('intro-monsters').textContent = String(cfg.monsters.length);
      LH.el('intro-memory').textContent = cfg.memory.toFixed(0) + ' s';
      LH.el('intro-matches').textContent = String(cfg.matches || 5);
      LH.el('intro-mark').textContent = cfg.numeral;

      this.renderRelicTracker();
      this.showScreen('intro');
      this.audio.startAmbience(cfg.ambience);
      this.audio.setTension(0);
      this.updateMuteButton();
    }

    placeObjectives() {
      const maze = this.maze;
      const n = maze.cols * maze.rows;
      const cfg = this.levelCfg;
      const spawnIdx = maze.idx(Math.floor(maze.cols / 2), Math.floor(maze.rows / 2));
      this.spawnIdx = spawnIdx;
      const far = maze.farthestFrom(spawnIdx);
      let exitIdx = far.index;
      if (exitIdx === spawnIdx) exitIdx = n - 1;
      this.exitIdx = exitIdx;
      const distFromSpawn = far.dist;

      // reliques : cellules éloignées et espacées
      const candidates = [];
      for (let i = 0; i < n; i++) {
        if (i === spawnIdx || i === exitIdx) continue;
        if (distFromSpawn[i] < 5) continue;
        candidates.push(i);
      }
      candidates.sort((a, b) => {
        const da = distFromSpawn[a], db = distFromSpawn[b];
        if (db !== da) return db - da;
        return LH.hash2(a % maze.cols, (a / maze.cols) | 0, maze.seed) - 0.5;
      });
      const relicCells = [];
      const minSep = Math.max(3, Math.floor(maze.cols / 5));
      for (const ci of candidates) {
        if (relicCells.length >= cfg.relics) break;
        const cx = ci % maze.cols, cy = (ci / maze.cols) | 0;
        let ok = true;
        for (const rc of relicCells) {
          const rx = rc % maze.cols, ry = (rc / maze.cols) | 0;
          if (Math.abs(cx - rx) + Math.abs(cy - ry) < minSep) { ok = false; break; }
        }
        if (ok) relicCells.push(ci);
      }
      // complète si nécessaire
      for (const ci of candidates) {
        if (relicCells.length >= cfg.relics) break;
        if (!relicCells.includes(ci)) relicCells.push(ci);
      }
      this.relicCells = relicCells;

      for (const ci of relicCells) {
        this.world.addRelic(ci, 0xb388ff);
      }
      this.world.addExit(exitIdx, cfg.theme);

      // allumettes : réserves de lampe, réparties dans le labyrinthe
      const matchCount = cfg.matches || 5;
      const matchCells = [];
      const candidate = candidates.slice().reverse(); // moins loin en priorité
      for (const ci of candidate) {
        if (matchCells.length >= matchCount) break;
        if (relicCells.includes(ci)) continue;
        const cx = ci % maze.cols, cy = (ci / maze.cols) | 0;
        let ok = true;
        for (const mc of matchCells) {
          const mx = mc % maze.cols, my = (mc / maze.cols) | 0;
          if (Math.abs(cx - mx) + Math.abs(cy - my) < 3) { ok = false; break; }
        }
        if (ok) matchCells.push(ci);
      }
      for (const ci of candidates) {
        if (matchCells.length >= matchCount) break;
        if (!matchCells.includes(ci) && !relicCells.includes(ci)) matchCells.push(ci);
      }
      this.matchCells = matchCells;
      for (const ci of matchCells) this.world.addMatch(ci);

      // spawn des monstres
      const monsterSpawns = [];
      const minDist = distFromSpawn[exitIdx] || 1;
      const pool = [];
      for (let i = 0; i < n; i++) {
        if (i === spawnIdx || i === exitIdx) continue;
        if (relicCells.includes(i)) continue;
        if (distFromSpawn[i] > minDist * 0.32 && distFromSpawn[i] < minDist * 0.92) pool.push(i);
      }
      for (let m = 0; m < cfg.monsters.length; m++) {
        let chosen = null;
        for (let tries = 0; tries < 60; tries++) {
          const ci = pool[(Math.random() * pool.length) | 0];
          if (ci == null) break;
          const cx = ci % maze.cols, cy = (ci / maze.cols) | 0;
          let ok = true;
          for (const sc of monsterSpawns) {
            const sx = sc % maze.cols, sy = (sc / maze.cols) | 0;
            if (Math.abs(cx - sx) + Math.abs(cy - sy) < 4) { ok = false; break; }
          }
          if (ok && distFromSpawn[ci] > 6) { chosen = ci; break; }
        }
        if (chosen == null) chosen = pool[(Math.random() * pool.length) | 0] || (n - 1);
        monsterSpawns.push(chosen);
      }
      this.monsterSpawns = monsterSpawns;
    }

    spawnPlayer() {
      const sx = this.spawnIdx % this.maze.cols, sy = (this.spawnIdx / this.maze.cols) | 0;
      const p = this.world.cellCenter(sx, sy);
      this.player = this.makePlayer();
      this.player.x = p.x;
      this.player.z = p.z;
      this.playerCellIndex = this.spawnIdx;
      this.world.addPlayer(p.x, p.z, this.levelCfg.theme);
      this.world.focusCamera(p.x, p.z, 0, true);
    }

    spawnMonsters() {
      this.monsters = [];
      this.levelCfg.monsters.forEach((mcfg, i) => {
        const m = new LH.Monster(this, mcfg, this.monsterSpawns[i], i, this.levelCfg);
        m.group.visible = false;
        this.monsters.push(m);
      });
    }

    buildCollision() {
      const maze = this.maze;
      const boxes = [];
      const addBox = (cx, cy, side, ci, otherCi) => {
        const c = this.world.cellCenter(cx, cy);
        const half = CELL / 2;
        const t = LH.WALL_T;
        let b;
        if (side === 'N') {
          b = { minX: c.x - half - t / 2, maxX: c.x + half + t / 2, minZ: c.z - half - t / 2, maxZ: c.z - half + t / 2 };
        } else if (side === 'S') {
          b = { minX: c.x - half - t / 2, maxX: c.x + half + t / 2, minZ: c.z + half - t / 2, maxZ: c.z + half + t / 2 };
        } else if (side === 'W') {
          b = { minX: c.x - half - t / 2, maxX: c.x - half + t / 2, minZ: c.z - half - t / 2, maxZ: c.z + half + t / 2 };
        } else {
          b = { minX: c.x + half - t / 2, maxX: c.x + half + t / 2, minZ: c.z - half - t / 2, maxZ: c.z + half + t / 2 };
        }
        b.id = boxes.length;
        b.cells = [ci, otherCi];
        boxes.push(b);
      };
      for (let cy = 0; cy < maze.rows; cy++) {
        for (let cx = 0; cx < maze.cols; cx++) {
          const ci = maze.idx(cx, cy);
          if (maze.hasWall(cx, cy, LH.MAZE_N)) addBox(cx, cy, 'N', ci, cy > 0 ? maze.idx(cx, cy - 1) : null);
          if (maze.hasWall(cx, cy, LH.MAZE_W)) addBox(cx, cy, 'W', ci, cx > 0 ? maze.idx(cx - 1, cy) : null);
          if (cy === maze.rows - 1 && maze.hasWall(cx, cy, LH.MAZE_S)) addBox(cx, cy, 'S', ci, null);
          if (cx === maze.cols - 1 && maze.hasWall(cx, cy, LH.MAZE_E)) addBox(cx, cy, 'E', ci, null);
        }
      }
      const byCell = new Map();
      for (const b of boxes) {
        for (const c of b.cells) {
          if (c == null) continue;
          if (!byCell.has(c)) byCell.set(c, []);
          byCell.get(c).push(b);
        }
      }
      this.wallBoxes = boxes;
      this.wallsByCell = byCell;
    }

    resolveCircle(x, z, r) {
      if (!this.wallsByCell) return { x, z };
      const c = this.world.worldToCell(x, z);
      const seen = this._seenBoxes || (this._seenBoxes = new Set());
      seen.clear();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = LH.clamp(c.cx + dx, 0, this.maze.cols - 1);
          const cy = LH.clamp(c.cy + dy, 0, this.maze.rows - 1);
          const list = this.wallsByCell.get(this.maze.idx(cx, cy));
          if (!list) continue;
          for (const b of list) {
            if (seen.has(b.id)) continue;
            seen.add(b.id);
            for (let iter = 0; iter < 2; iter++) {
              const closestX = LH.clamp(x, b.minX, b.maxX);
              const closestZ = LH.clamp(z, b.minZ, b.maxZ);
              let dxv = x - closestX;
              let dzv = z - closestZ;
              const d2 = dxv * dxv + dzv * dzv;
              if (d2 < r * r) {
                if (d2 > 0.000001) {
                  const d = Math.sqrt(d2);
                  const push = (r - d) / d;
                  x += dxv * push;
                  z += dzv * push;
                } else {
                  // centre à l'intérieur : sortie par le côté le plus proche
                  const left = x - b.minX, right = b.maxX - x;
                  const top = z - b.minZ, bottom = b.maxZ - z;
                  const m = Math.min(left, right, top, bottom);
                  if (m === left) x = b.minX - r;
                  else if (m === right) x = b.maxX + r;
                  else if (m === top) z = b.minZ - r;
                  else z = b.maxZ + r;
                }
              }
            }
          }
        }
      }
      return { x, z };
    }

    resetMemory() {
      const n = this.maze.cols * this.maze.rows;
      this.cellMemory = new Float32Array(n);
      this.cellEdge = new Float32Array(n);
      this.visualAlpha = new Float32Array(n);
      this.revealTimer = 0;
      this.lastRevealCount = 0;
    }

    beginPlay() {
      if (this.state !== 'intro') return;
      this.initAudio();
      this.state = 'playing';
      document.body.dataset.state = 'playing';
      this.hideScreens();
      this.showHUD();
      this.levelTime = 0;
      this.graceTimer = this.levelCfg.grace;
      this.graceActive = true;
      this.player.dead = false;
      this.audio.resume();
      this.audio.setTension(0);
      this.scares.clearEvents();
      this.toast('NIVEAU ' + this.levelCfg.numeral + ' — ' + this.levelCfg.name, 'level');
      this.subtitle(this.levelCfg.objective, 4.5);
      this.revealTimer = 0;
      this.lastFrame = performance.now();
      this.scares.flash('#000000', 0.85, 900);
      if (this.save.settings.firstPerson) {
        const el = this.renderer.domElement;
        if (el.requestPointerLock) el.requestPointerLock();
      }
    }

    // ------------------------------------------------------------------ boucle
    animate(now) {
      requestAnimationFrame(this.raf);
      let dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      if (!isFinite(dt) || dt < 0) dt = 0;
      this.adaptResolution(dt);
      dt = Math.min(dt, 0.05);
      this.globalTime += dt;

      if (this.state === 'playing') {
        this.update(dt);
      } else if (this.state === 'dying') {
        this.updateDying(dt);
      } else if (this.state === 'menu' || this.state === 'ending') {
        this.updateMenu(dt);
        return;
      } else {
        if (this.maze && this.world.ready && this.levelCfg) {
          this.world.update(dt, this.globalTime);
          this.world.focusCamera(this.player.x, this.player.z, dt, false);
        }
        if (this.scares) this.scares.update(this.state === 'paused' ? 0 : dt, null, null);
        this.world.render();
        return;
      }

      if (this.world.ready) {
        this.world.update(dt, this.globalTime);
        this.world.focusCamera(this.player.x, this.player.z, dt, false);
        this.updateTorchVisual(dt);
        const px = this.playerScreen();
        let compass = null;
        if (this.exitUnlocked && this.world.exit) {
          const e = this.world.exit;
          compass = {
            active: true,
            angle: this.relAngle(e.x, e.z),
            distance: LH.dist2(this.player.x, this.player.z, e.x, e.z)
          };
        }
        this.scares.update(dt, px, compass);
        this.world.render();
      }
    }

    update(dt) {
      this.levelTime += dt;
      if (this.graceTimer > 0) {
        this.graceTimer -= dt;
        this.graceActive = this.graceTimer > 0;
      }
      this.updatePlayer(dt);
      this.updateMemory(dt);
      for (const m of this.monsters) m.update(dt);
      if (this.state !== 'playing') {
        this.updateHud();
        return;
      }
      this.updateObjectives(dt);
      this.updateEvents(dt);
      this.updateThreat(dt);
      this.updateHud();
      this.updateTorch(dt);
    }

    updateDying(dt) {
      this.deathTimer -= dt;
      this.world.camOffset.y = LH.damp(this.world.camOffset.y, 18, 2.4, dt);
      this.world.camOffset.z = LH.damp(this.world.camOffset.z, 10, 2.4, dt);
      this.player.stepTimer = 1;
      this.updateMemory(0);
      for (const m of this.monsters) m.update(dt);
      if (this.deathTimer <= 0 && this.state === 'dying') {
        this.state = 'dead';
        document.body.dataset.state = 'dead';
        this.showDeath();
      }
      this.world.camOffset.y = 18;
    }

    updatePlayer(dt) {
      const p = this.player;
      const k = this.keys;
      let fx = 0, fz = 0;
      if (this.save.settings.firstPerson) {
        if (k.KeyQ) p.yaw += 2.4 * dt;
        if (k.KeyE) p.yaw -= 2.4 * dt;
        if (k.PageUp || k.KeyR) p.pitch += 1.7 * dt;
        if (k.PageDown || k.KeyF) p.pitch -= 1.7 * dt;
        p.pitch = LH.clamp(p.pitch, -1.15, 1.15);
        const fwd = ((k.KeyW || k.ArrowUp) ? 1 : 0) - ((k.KeyS || k.ArrowDown) ? 1 : 0) + (this.touch.active ? -this.touch.y : 0);
        const str = ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0) + (this.touch.active ? this.touch.x : 0);
        fx = -Math.sin(p.yaw) * fwd + Math.cos(p.yaw) * str;
        fz = -Math.cos(p.yaw) * fwd - Math.sin(p.yaw) * str;
      } else {
        if (k.KeyW || k.ArrowUp) fz -= 1;
        if (k.KeyS || k.ArrowDown) fz += 1;
        if (k.KeyA || k.ArrowLeft) fx -= 1;
        if (k.KeyD || k.ArrowRight) fx += 1;
        if (this.touch.active) { fx += this.touch.x; fz += this.touch.y; }
      }
      const len = Math.hypot(fx, fz);
      if (len > 0.01) { fx /= Math.max(1, len); fz /= Math.max(1, len); }
      const moving = len > 0.01;
      p.crouch = !!(k.ControlLeft || k.ControlRight || k.KeyC);
      const wantSprint = (k.ShiftLeft || k.ShiftRight || this.touch.sprint) && !p.crouch && moving && p.stamina > 2;
      p.sprinting = !!wantSprint;
      if (p.sprinting) {
        p.stamina -= 27 * dt;
        p.staminaRegenDelay = 1.0;
        if (p.stamina <= 0) { p.stamina = 0; p.sprinting = false; }
      } else {
        if (p.staminaRegenDelay > 0) p.staminaRegenDelay -= dt;
        else p.stamina = Math.min(100, p.stamina + (p.crouch ? 24 : 15) * dt);
      }
      const speed = p.sprinting ? 7.4 : p.crouch ? 2.1 : 4.95;
      p.moving = moving;
      p.speed = moving ? speed : 0;
      if (moving) {
        p.angle = Math.atan2(-fx, -fz);
        const nx = p.x + fx * speed * dt;
        const nz = p.z + fz * speed * dt;
        const res = this.resolveCircle(nx, nz, LH.PLAYER_R);
        p.x = res.x; p.z = res.z;
        p.stepTimer -= dt;
        if (p.stepTimer <= 0) {
          const interval = p.sprinting ? 0.27 : p.crouch ? 0.8 : 0.44;
          p.stepTimer = interval;
          const surface = this.world.surfaceAt ? this.world.surfaceAt(p.x, p.z) : 'stone';
          const pan = (Math.random() - 0.5) * 0.18;
          this.audio.footstepSurface(surface, p.sprinting ? 1.15 : p.crouch ? 0.3 : 0.72, pan);
          let mult = p.sprinting ? 1.55 : p.crouch ? 0.26 : 0.82;
          if (!p.crouch && (surface === 'leaves' || surface === 'twig') && Math.random() < 0.3) {
            this.audio.footstepSurface('twig', p.sprinting ? 1.35 : 0.95, pan);
            mult *= 1.7;
          }
          for (const m of this.monsters) {
            m.hear(p.x, p.z, m.cfg.hear * mult);
          }
        }
      } else {
        p.stepTimer = Math.min(p.stepTimer, 0.1);
      }
      this.playerCellIndex = this.cellIndexOf(p.x, p.z);
      this.world.updatePlayerTransform(p.x, p.z, p.angle, moving, speed);
      this.world.fpYaw = p.yaw;
      this.world.fpPitch = p.pitch;
    }

    cellIndexOf(x, z) {
      const c = this.world.worldToCell(x, z);
      return this.maze.idx(LH.clamp(c.cx, 0, this.maze.cols - 1), LH.clamp(c.cy, 0, this.maze.rows - 1));
    }

    updateMemory(dt) {
      const cfg = this.levelCfg;
      const p = this.player;
      const cols = this.maze.cols, rows = this.maze.rows;
      const pgx = p.x / CELL + cols / 2;
      const pgz = p.z / CELL + rows / 2;
      this.revealTimer -= dt;
      if (this.revealTimer <= 0) {
        this.revealTimer = 0.09;
        const radius = cfg.reveal;
        const pcx = Math.floor(pgx), pcy = Math.floor(pgz);
        const rr = Math.ceil(radius);
        for (let cy = pcy - rr; cy <= pcy + rr; cy++) {
          if (cy < 0 || cy >= rows) continue;
          for (let cx = pcx - rr; cx <= pcx + rr; cx++) {
            if (cx < 0 || cx >= cols) continue;
            const w = this.world.cellCenter(cx, cy);
            const d = LH.dist2(p.x, p.z, w.x, w.z);
            if (d > radius * CELL + 0.6) continue;
            const ci = this.maze.idx(cx, cy);
            this.cellMemory[ci] = cfg.memory;
            const f = LH.clamp(d / (radius * CELL), 0, 1);
            this.cellEdge[ci] = 0.75 + 0.25 * (1 - LH.smoothstep(0.4, 1, f));
          }
        }
      }
      let forgotten = 0;
      const t = this.levelTime;
      for (let i = 0; i < this.cellMemory.length; i++) {
        let target = 0;
        if (this.cellMemory[i] > 0) {
          this.cellMemory[i] = Math.max(0, this.cellMemory[i] - dt);
          if (this.cellMemory[i] > 0) target = this.cellEdge[i] || 1;
          else forgotten++;
          if (this.cellMemory[i] > 0 && this.cellMemory[i] < 2.1) {
            target *= 0.35 + 0.65 * Math.abs(Math.sin(t * 8 + i * 0.7));
          }
        }
        const cur = this.visualAlpha[i];
        const speed = target > cur ? 7 : 1.35;
        let next = cur + LH.clamp(target - cur, -speed * dt, speed * dt);
        if (next < 0.012) next = 0;
        this.visualAlpha[i] = next;
      }
      if (forgotten > 20 && t - this.lastForgetSound > 7) {
        this.lastForgetSound = t;
        this.audio.whisper((Math.random() - 0.5) * 1.4);
      }
      if (!this.toldForget && forgotten > 0 && this.levelIndex === 0) {
        this.toldForget = true;
        this.subtitle('Tu oublies déjà les couloirs derrière toi...', 4.2);
      }
      this.world.applyCellAlphas(this.visualAlpha);

      // visibilité des reliques et de la sortie
      for (const r of this.world.relics) {
        if (r.collected) continue;
        r.group.visible = this.visualAlpha[r.cell] > 0.14;
      }
      if (this.world.exit) {
        const vis = this.visualAlpha[this.world.exit.cell] > 0.12 || this.exitUnlocked;
        this.world.exit.group.visible = vis;
      }
    }

    updateObjectives(dt) {
      const p = this.player;
      // reliques
      for (const r of this.world.relics) {
        if (r.collected) continue;
        if (LH.dist2(p.x, p.z, r.x, r.z) < 1.55) {
          this.collectRelic(r);
        }
      }
      // sortie
      if (this.world.exit) {
        const e = this.world.exit;
        const d = LH.dist2(p.x, p.z, e.x, e.z);
        if (d < 1.75) {
          if (this.exitUnlocked) {
            this.winLevel();
            return;
          } else if (this.levelTime - this.lastLockedMsg > 4) {
            this.lastLockedMsg = this.levelTime;
            const missing = this.totalRelics - this.relicsCollected;
            this.toast(`La sortie est scellée — ${missing} relique${missing > 1 ? 's' : ''} manquante${missing > 1 ? 's' : ''}`, 'bad');
            this.subtitle('Quelque chose manque...', 2.6);
            this.audio.growl(0, 6);
          }
        }
      }
      // allumettes
      for (const m of this.world.matches) {
        if (m.collected) continue;
        if (LH.dist2(p.x, p.z, m.x, m.z) < 1.4) {
          this.world.collectMatch(m);
          this.matchesCollected++;
          this.addLampFuel(34);
          this.audio.matchStrike();
          this.scares.addEvent(LH.angleTo(p.x, p.z, m.x, m.z), 'ALLUMETTE', 'relic', { ttl: 2, strength: 0.9 });
          this.scares.flash('#ffa347', 0.16, 320);
          this.toast(`Allumettes — lampe ${Math.round(this.player.lamp)}%`, 'good');
          this.updateHud();
        }
      }
      // résonance des reliques
      this.resonanceTimer = (this.resonanceTimer || 0) - dt;
      if (this.resonanceTimer <= 0) {
        this.resonanceTimer = 2.4;
        let best = null, bd = 1e9;
        for (const r of this.world.relics) {
          if (r.collected) continue;
          const d = LH.dist2(p.x, p.z, r.x, r.z);
          if (d < bd) { bd = d; best = r; }
        }
        if (best && bd < 9 * CELL) {
          const angle = this.relAngle(best.x, best.z);
          this.scares.addEvent(angle, 'RÉSONANCE', 'relic', { ttl: 2.2, strength: 0.65 });
          this.audio.resonance(Math.sin(angle) * 0.7, LH.clamp(1 - bd / (9 * CELL), 0.15, 1));
        }
      }
    }

    collectRelic(relic) {
      this.world.collectRelic(relic);
      this.relicsCollected++;
      this.audio.pickup();
      this.scares.addEvent(this.relAngle(relic.x, relic.z), 'RELIQUE', 'relic',
        { ttl: 2.2, strength: 1 });
      this.scares.flash('#b388ff', 0.28, 300);
      this.toast(`Relique récupérée — ${this.relicsCollected} / ${this.totalRelics}`, 'good');
      this.updateRelicTracker();
      if (this.relicsCollected >= this.totalRelics && !this.exitUnlocked) {
        this.exitUnlocked = true;
        this.world.unlockExit();
        this.audio.unlock();
        this.toast('LA SORTIE EST OUVERTE', 'good');
        this.subtitle('La sortie s\'est réveillée. Suis la lumière.', 4);
        this.scares.flash('#65ffc3', 0.22, 700);
        if (this.world.exit) {
          this.world.exit.glow.material.depthTest = false;
          this.world.exit.beam.material.depthTest = false;
        }
      }
    }

    updateThreat(dt) {
      const p = this.player;
      let nearest = 999;
      let chasing = false;
      let threat = 0;
      for (const m of this.monsters) {
        const d = LH.dist2(p.x, p.z, m.x, m.z);
        if (d < nearest) nearest = d;
        if (m.state === 'chase') chasing = true;
        const t = m.state === 'chase'
          ? LH.clamp(1 - d / 26, 0, 1) * 1.25
          : LH.clamp(1 - d / 14, 0, 1) * 0.62;
        if (t > threat) threat = t;
      }
      this.threat = LH.damp(this.threat || 0, LH.clamp(threat, 0, 1), 4, dt);
      if (this.save.settings.shake && this.threat > 0.3) this.world.shake(this.threat * 0.09);
      const threatEl = LH.el('threat');
      if (threatEl) threatEl.style.opacity = (this.threat * 0.55).toFixed(3);
      this.audio.setTension(this.threat);
      this.heartTimer -= dt;
      if (this.threat > 0.22 && this.heartTimer <= 0) {
        this.heartTimer = LH.lerp(1.35, 0.52, this.threat);
        this.audio.heartbeat(LH.clamp(this.threat + 0.25, 0, 1));
      }
      this.nearestMonster = nearest;
      this.chasing = chasing;
      if (!this.toldDanger && this.threat > 0.3) {
        this.toldDanger = true;
        this.subtitle(this.chasing ? 'Il te poursuit. Cours.' : 'Quelque chose rôde tout près.', 3.2);
      }
    }

    addLampFuel(amount) {
      const p = this.player;
      const wasOut = !p.lampOn || p.lamp <= 0;
      p.lamp = LH.clamp(p.lamp + amount, 0, 100);
      p.lampOn = true;
      if (wasOut) {
        this.subtitle('La lampe repart. Ne la gaspille pas.', 3);
      }
      this.updateHud();
    }

    lampDied() {
      const p = this.player;
      p.lampOn = false;
      this.audio.lampFizzle();
      this.toast('LA LAMPE S\'ÉTEINT', 'bad');
      this.subtitle('Plus de flamme. Seul le clair de lune t\'éclaire.', 4.5);
      this.scares.flash('#000000', 0.55, 1100);
      if (this.world.playerGlow) this.world.playerGlow.material.opacity = 0;
      if (this.world.playerPool) this.world.playerPool.material.opacity = 0.05;
    }

    updateTorch(dt) {
      const p = this.player;
      if (p.lamp > 0 && p.lampOn) {
        p.lamp = Math.max(0, p.lamp - this.levelCfg.lampDrain * dt);
        if (p.lamp <= 0) this.lampDied();
      }
      const lit = p.lampOn && p.lamp > 0;
      let base = lit ? 2.0 : 0;
      let range = lit ? this.levelCfg.theme.torchRange : 0.5;
      const blackout = this.blackoutTimer > 0;
      if (blackout) {
        this.blackoutTimer -= dt;
        base *= 0.3;
        range *= 0.42;
      }
      if (lit && p.lamp < 20) base *= 0.35 + Math.random() * 0.6;
      if (this.threat > 0.5 && !this.stutterTimer && Math.random() < 0.012) this.stutterTimer = 0.18;
      if (this.stutterTimer > 0) {
        this.stutterTimer -= dt;
        base *= 0.25;
      }
      const flicker = 0.88 + Math.sin(this.levelTime * 17) * 0.04 + Math.sin(this.levelTime * 31.7) * 0.03 + Math.random() * 0.03;
      this.world.setTorch(base * flicker, range);
      this.world.setAmbientFactor(blackout ? 0.24 : 1);
      this.world.setMoonFactor(lit ? 1 : 1.45);
    }

    updateTorchVisual(dt) {
      if (this.playerGlowPulse == null) this.playerGlowPulse = 0;
      this.playerGlowPulse += dt;
      const lit = this.player.lampOn && this.player.lamp > 0;
      if (this.world.playerGlow) {
        const s = 2.2 + Math.sin(this.playerGlowPulse * 4) * 0.15 + (this.blackoutTimer > 0 ? -0.7 : 0);
        this.world.playerGlow.scale.set(s, s, 1);
        this.world.playerGlow.material.opacity = lit ? 0.9 : 0;
      }
      if (this.world.playerPool) {
        this.world.playerPool.material.opacity = lit ? 0.2 : 0.05;
      }
      if (this.world.playerLantern) {
        this.world.playerLantern.visible = lit;
      }
    }

    updateEvents(dt) {
      if (!this.timers) this.initTimers();
      const t = this.timers;

      t.scream -= dt;
      if (t.scream <= 0) {
        t.scream = LH.rand(this.levelCfg.screamEvery[0], this.levelCfg.screamEvery[1]);
        this.playAmbientScream();
      }
      t.whisper -= dt;
      if (t.whisper <= 0) {
        t.whisper = LH.rand(this.levelCfg.whisperEvery[0], this.levelCfg.whisperEvery[1]);
        this.playWhisper();
      }
      t.scare -= dt;
      if (t.scare <= 0) {
        t.scare = LH.rand(this.levelCfg.scareEvery[0], this.levelCfg.scareEvery[1]);
        this.playJumpScare();
      }
      t.creak -= dt;
      if (t.creak <= 0) {
        t.creak = LH.rand(9, 19);
        this.audio.creak((Math.random() - 0.5) * 1.3);
      }
      if (this.levelIndex >= 1) {
        t.phantom -= dt;
        if (t.phantom <= 0) {
          t.phantom = LH.rand(8, 16) * (this.threat > 0.2 ? 0.5 : 1);
          this.spawnPhantom();
        }
      }
      if (this.levelCfg.blackoutEvery) {
        t.blackout -= dt;
        if (t.blackout <= 0) {
          t.blackout = LH.rand(this.levelCfg.blackoutEvery[0], this.levelCfg.blackoutEvery[1]);
          this.startBlackout();
        }
      }
    }

    initTimers() {
      const c = this.levelCfg;
      this.timers = {
        scream: LH.rand(c.screamEvery[0], c.screamEvery[1]) * 0.8,
        whisper: LH.rand(c.whisperEvery[0], c.whisperEvery[1]) * 0.6,
        scare: LH.rand(c.scareEvery[0], c.scareEvery[1]) * 0.7,
        creak: LH.rand(7, 14),
        phantom: LH.rand(10, 16),
        blackout: c.blackoutEvery ? LH.rand(c.blackoutEvery[0], c.blackoutEvery[1]) : 99999
      };
    }

    playAmbientScream() {
      const angle = Math.random() * Math.PI * 2;
      const dist = LH.rand(4, 15) * CELL;
      const pan = Math.sin(angle) * 0.88;
      this.audio.ambientScream(pan, dist / CELL);
      this.scares.addEvent(angle, 'CRI', 'scream', {
        ttl: 2.8,
        strength: LH.clamp(1.4 - dist / (20 * CELL), 0.4, 1.2),
        distance: dist
      });
      this.scares.flash('#000000', 0, 1);
    }

    spawnPhantom() {
      const n = this.maze.cols * this.maze.rows;
      const p = this.player;
      for (let k = 0; k < 30; k++) {
        const ci = (Math.random() * n) | 0;
        if (this.visualAlpha[ci] < 0.9) continue;
        const c = this.world.cellCenter(ci % this.maze.cols, (ci / this.maze.cols) | 0);
        const d = LH.dist2(p.x, p.z, c.x, c.z);
        if (d < 5 || d > 13) continue;
        this.world.flashPhantom(c.x, c.z, 0.45 + Math.random() * 0.3);
        this.audio.creak((c.x - p.x) * 0.05);
        return;
      }
    }

    playWhisper() {
      const angle = Math.random() * Math.PI * 2;
      this.audio.whisper(Math.sin(angle) * 0.75);
      this.scares.addEvent(angle, 'CHUCHOTEMENT', 'whisper', { ttl: 2.6, strength: 0.5 });
      const lines = this.levelCfg.whispers;
      this.subtitle(LH.pick(lines), 4.2);
    }

    playJumpScare() {
      if (this.scares.active) return;
      this.lastScareAt = this.levelTime;
      this.audio.sting();
      this.scares.trigger(this.levelCfg.theme.face, {
        kind: 'light',
        duration: 430,
        shake: this.save.settings.shake ? 0.7 : 0
      });
      if (this.save.settings.shake) this.world.shake(0.7);
    }

    startBlackout() {
      if (this.blackoutTimer > 0) return;
      this.blackoutTimer = LH.rand(3.2, 5.2);
      this.audio.blackout();
      this.toast('LA LAMPE FAIBLIT', 'bad');
      this.subtitle('Le noir t\'avale...', 3);
      this.scares.flash('#000000', 0.6, 1200);
    }

    onMonsterAlert(monster) {
      const angle = this.relAngle(monster.x, monster.z);
      const d = LH.dist2(this.player.x, this.player.z, monster.x, monster.z);
      this.audio.scream(Math.sin(angle) * 0.85, d, { gain: 1.0 });
      this.scares.addEvent(angle, 'CRI', 'monster', { ttl: 3.1, strength: 1.25, distance: d });
      if (d < 9 && Math.random() < 0.6) this.playJumpScare();
      this.scares.flash('#5a0000', 0.14, 500);
      if (this.levelTime - this.lastAlertSubtitle > 14 && d < 26) {
        this.lastAlertSubtitle = this.levelTime;
        this.subtitle(LH.pick([
          'Il t\'a vu.',
          'Il arrive.',
          'Ne reste pas immobile.',
          'Cours. Maintenant.'
        ]), 2.6);
      }
    }

    killPlayer(monster) {
      if (this.state !== 'playing') return;
      this.state = 'dying';
      document.body.dataset.state = 'dying';
      this.player.dead = true;
      this.deathTimer = 2.0;
      if (monster) monster.startAttack();
      this.audio.deathSting();
      this.scares.triggerDeath(this.levelCfg.theme.face);
      if (this.save.settings.shake) this.world.shake(3);
      this.scares.flash('#8d0000', 0.8, 1400);
      this.hideHUD();
      this.deathCause = monster ? monster.name : 'L\'obscurité';
    }

    showDeath() {
      const best = this.save.best[this.levelCfg.id];
      LH.el('result-kicker').textContent = 'FIN DE LA DESCENTE';
      LH.el('result-title').textContent = 'MORT';
      LH.el('result-title').className = 'result-title dead';
      LH.el('result-sub').textContent = '« ' + (this.deathCause || 'Quelque chose') + ' t\'a trouvé. »';
      LH.el('result-stats').innerHTML = `
        <div><span>NIVEAU</span><strong>${this.levelCfg.numeral} — ${this.levelCfg.name}</strong></div>
        <div><span>TEMPS</span><strong>${LH.fmtTime(this.levelTime)}</strong></div>
        <div><span>RELIQUES</span><strong>${this.relicsCollected} / ${this.totalRelics}</strong></div>
        <div><span>MEILLEUR</span><strong>${best ? LH.fmtTime(best) : '—'}</strong></div>
      `;
      LH.el('btn-next').style.display = 'none';
      LH.el('btn-retry').style.display = '';
      LH.el('result').classList.add('visible');
      this.showScreen('result');
    }

    winLevel() {
      if (this.state !== 'playing') return;
      this.state = 'won';
      document.body.dataset.state = 'won';
      this.hideHUD();
      this.audio.stopAmbience(1.6);
      this.audio.win();
      this.scares.flash('#65ffc3', 0.2, 900);
      const id = this.levelCfg.id;
      const best = this.save.best[id];
      if (!best || this.levelTime < best) this.save.best[id] = this.levelTime;
      if (!this.save.completed.includes(id)) this.save.completed.push(id);
      this.save.unlocked = Math.max(this.save.unlocked, Math.min(5, this.levelIndex + 2));
      this.persist();

      const isLast = this.levelIndex >= LH.LEVELS.length - 1;
      LH.el('result-kicker').textContent = isLast ? 'FIN DE LA DESCENTE' : 'NIVEAU TERMINÉ';
      LH.el('result-title').textContent = isLast ? 'SORTIE' : 'SAUVE';
      LH.el('result-title').className = 'result-title win';
      LH.el('result-sub').textContent = isLast
        ? LH.ENDING[this.levelIndex]
        : 'Tu as retrouvé la sortie. Le labyrinthe, lui, se souvient de toi.';
      LH.el('result-stats').innerHTML = `
        <div><span>NIVEAU</span><strong>${this.levelCfg.numeral} — ${this.levelCfg.name}</strong></div>
        <div><span>TEMPS</span><strong>${LH.fmtTime(this.levelTime)}</strong></div>
        <div><span>RELIQUES</span><strong>${this.relicsCollected} / ${this.totalRelics}</strong></div>
        <div><span>MEILLEUR</span><strong>${LH.fmtTime(this.save.best[id])}</strong></div>
      `;
      LH.el('btn-retry').style.display = 'none';
      const nextBtn = LH.el('btn-next');
      nextBtn.style.display = '';
      nextBtn.textContent = isLast ? 'VOIR LA FIN' : 'NIVEAU SUIVANT';
      this.nextAction = isLast ? 'ending' : 'next';
      this.renderLevelCards();
      this.showScreen('result');
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      document.body.dataset.state = 'paused';
      this.audio.setTension(0);
      this.showScreen('pause');
      this.audio.suspend();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.audio.resume();
      this.state = 'playing';
      document.body.dataset.state = 'playing';
      this.hideScreens();
      this.lastFrame = performance.now();
    }

    restartLevel() {
      this.audio.resume();
      const i = this.levelIndex;
      this.hideScreens();
      this.startLevel(i);
    }

    nextLevel() {
      if (this.nextAction === 'ending') {
        this.showEnding();
        return;
      }
      this.hideScreens();
      this.audio.resume();
      this.startLevel(this.levelIndex + 1);
    }

    showEnding() {
      this.state = 'ending';
      document.body.dataset.state = 'ending';
      LH.el('ending-text').textContent = LH.ENDING[LH.ENDING.length - 1];
      this.hideScreens();
      this.showScreen('ending');
      this.world.clearLevel();
      this.buildMenuScene();
      this.audio.stopAmbience(2);
    }

    // ------------------------------------------------------------------ HUD
    showHUD() {
      LH.el('hud').classList.remove('hidden');
      LH.el('hud').classList.add('active');
      LH.el('hud-level').textContent = 'NIVEAU ' + this.levelCfg.numeral;
      LH.el('hud-name').textContent = this.levelCfg.name;
      LH.el('hud-diff').textContent = LH.DIFFICULTY_LABEL[this.levelIndex];
      this.lastHudTimer = -1;
      this.updateRelicTracker();
      this.updateHud();
      const hint = LH.el('hud-hint');
      hint.classList.remove('fade');
      clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => hint.classList.add('fade'), 14000);
      LH.el('noise-state').textContent = 'DISCRET';
    }

    hideHUD() {
      LH.el('hud').classList.remove('active');
      LH.el('hud').classList.add('hidden');
    }

    renderRelicTracker() {
      const track = LH.el('relic-track');
      if (!track) return;
      track.innerHTML = '';
      for (let i = 0; i < this.totalRelics; i++) {
        const s = document.createElement('span');
        s.className = 'relic-slot';
        s.innerHTML = '◆';
        track.appendChild(s);
      }
      this.updateRelicTracker();
    }

    updateRelicTracker() {
      const track = LH.el('relic-track');
      if (!track) return;
      const slots = track.children;
      for (let i = 0; i < slots.length; i++) {
        slots[i].classList.toggle('filled', i < this.relicsCollected);
      }
      const obj = LH.el('objective');
      if (obj) {
        obj.textContent = this.exitUnlocked
          ? 'SORTIE OUVERTE — SUIS LA LUMIÈRE'
          : `RELIQUES ${this.relicsCollected} / ${this.totalRelics}`;
        obj.classList.toggle('open', this.exitUnlocked);
      }
    }

    updateHud() {
      const s = Math.floor(this.levelTime);
      if (s !== this.lastHudTimer) {
        this.lastHudTimer = s;
        LH.el('timer').textContent = LH.fmtTime(this.levelTime);
      }
      const fill = LH.el('stamina-fill');
      if (fill) fill.style.width = Math.max(0, Math.min(100, this.player.stamina)) + '%';
      const noise = LH.el('noise-state');
      if (noise) {
        const v = this.player.sprinting ? 'BRUYANT' : this.player.crouch ? 'SILENCIEUX' : this.player.moving ? 'NORMAL' : 'IMMOBILE';
        if (noise.textContent !== v) {
          noise.textContent = v;
          noise.className = 'noise-value ' + (v === 'BRUYANT' ? 'loud' : v === 'SILENCIEUX' ? 'quiet' : '');
        }
      }
      const lampFill = LH.el('lamp-fill');
      if (lampFill) {
        const lit = this.player.lamp > 0 && this.player.lampOn;
        lampFill.style.width = Math.max(0, Math.min(100, this.player.lamp)) + '%';
        lampFill.className = lit ? (this.player.lamp < 25 ? 'low' : '') : 'out';
      }
      const lampLabel = LH.el('lamp-state');
      if (lampLabel) {
        const lit = this.player.lamp > 0 && this.player.lampOn;
        const txt = !lit ? 'ÉTEINTE' : this.player.lamp < 25 ? 'FAIBLE' : 'ALLUMÉE';
        if (lampLabel.textContent !== txt) lampLabel.textContent = txt;
      }
      const mc = LH.el('match-count');
      if (mc) mc.textContent = String(this.matchesCollected || 0);
    }

    toggleLamp() {
      const p = this.player;
      if (p.lamp <= 0) {
        this.toast('Lampe à sec — trouve des allumettes', 'bad');
        return;
      }
      p.lampOn = !p.lampOn;
      this.audio.click();
      this.toast(p.lampOn ? 'Lampe allumée' : 'Lampe éteinte — tu économises', p.lampOn ? 'good' : '');
    }

    toast(text, kind) {
      const area = LH.el('toasts');
      if (!area) return;
      const el = document.createElement('div');
      el.className = 'toast ' + (kind || '');
      el.textContent = text;
      area.appendChild(el);
      while (area.children.length > 3) area.removeChild(area.firstChild);
      setTimeout(() => el.classList.add('out'), 2800);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3600);
    }

    subtitle(text, duration) {
      const el = LH.el('subtitle');
      if (!el) return;
      el.textContent = text;
      el.classList.add('visible');
      clearTimeout(this.subTimer);
      this.subTimer = setTimeout(() => el.classList.remove('visible'), (duration || 3) * 1000);
    }

    adaptResolution(rawDt) {
      this.perfAcc = (this.perfAcc || 0) + rawDt;
      this.perfN = (this.perfN || 0) + 1;
      if (this.perfAcc < 1.5) return;
      const avg = this.perfAcc / this.perfN;
      this.perfAcc = 0;
      this.perfN = 0;
      const cur = this.renderer.getPixelRatio();
      const max = Math.min(window.devicePixelRatio || 1, 1.5);
      let next = cur;
      if (avg > 0.024) next = Math.max(0.6, cur - 0.15);
      else if (avg < 0.017) next = Math.min(max, cur + 0.1);
      if (Math.abs(next - cur) > 0.01) this.renderer.setPixelRatio(next);
    }

    relAngle(tx, tz) {
      const p = this.player;
      const a = LH.angleTo(p.x, p.z, tx, tz);
      return this.save.settings.firstPerson ? a + p.yaw : a;
    }

    setView(firstPerson) {
      this.save.settings.firstPerson = !!firstPerson;
      this.persist();
      this.updateViewButton();
    }

    updateViewButton() {
      const fp = !!this.save.settings.firstPerson;
      const b = LH.el('btn-view');
      if (b) {
        b.textContent = 'PREMIÈRE PERSONNE' + (fp ? ' ✓' : '');
        b.classList.toggle('on', fp);
      }
      const t = LH.el('fp-toggle');
      if (t) t.checked = fp;
    }

    playerScreen() {
      if (this.save.settings.firstPerson) {
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      }
      if (!this.world || !this.world.camera) return null;
      const v = new THREE.Vector3(this.player.x, 1.2, this.player.z).project(this.world.camera);
      return {
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight
      };
    }

    updateMuteButton() {
      this.updateViewButton();
      const btn = LH.el('hud-mute');
      if (btn) {
        btn.textContent = this.save.settings.muted ? 'SON OFF' : 'SON ON';
        btn.classList.toggle('muted', !!this.save.settings.muted);
      }
      const mb = LH.el('btn-sound');
      if (mb) {
        mb.textContent = this.save.settings.muted ? 'SON : COUPÉ' : 'SON : ACTIVÉ';
        mb.classList.toggle('muted', !!this.save.settings.muted);
      }
    }

    toggleMute() {
      this.save.settings.muted = !this.save.settings.muted;
      this.audio.setMuted(this.save.settings.muted);
      if (!this.save.settings.muted) this.initAudio();
      this.updateMuteButton();
      this.updateAudioHint(this.audio.ctx ? this.audio.ctx.state : 'none');
      this.persist();
    }

    // ------------------------------------------------------------------ input
    bindInput() {
      window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
        this.keys[e.code] = true;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.state === 'playing') this.pause();
          else if (this.state === 'paused') this.resume();
          else if (this.state === 'intro') this.openMenu();
        }
        if (e.code === 'KeyM') this.toggleMute();
        if (e.code === 'KeyL' && this.state === 'playing') this.toggleLamp();
        if (e.code === 'Enter' && this.state === 'intro') this.beginPlay();
      });
      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });
      window.addEventListener('blur', () => {
        this.keys = {};
        if (this.state === 'playing') this.pause();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') this.pause();
      });
      window.addEventListener('resize', () => {
        this.world.resize();
        this.scares.resize();
      });
      document.addEventListener('mousemove', (e) => {
        if (this.state === 'playing' && this.save.settings.firstPerson && document.pointerLockElement) {
          this.player.yaw -= e.movementX * 0.0022;
          this.player.pitch = LH.clamp(this.player.pitch - e.movementY * 0.0022, -1.15, 1.15);
        }
      });
      this.renderer.domElement.addEventListener('click', () => {
        if (this.state === 'playing' && this.save.settings.firstPerson && this.renderer.domElement.requestPointerLock) {
          this.renderer.domElement.requestPointerLock();
        }
      });
      this.bindTouch();
    }

    bindTouch() {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (!isTouch) return;
      const controls = LH.el('touch-controls');
      if (controls) controls.classList.add('enabled');
      document.body.classList.add('touch-device');
      const base = LH.el('touch-stick-base');
      const stick = LH.el('touch-stick');
      const sprintBtn = LH.el('touch-sprint');
      if (base) {
        let activeId = null;
        const onStart = (e) => {
          e.preventDefault();
          const t = e.changedTouches ? e.changedTouches[0] : e;
          activeId = t.identifier;
          this.touch.active = true;
          this.updateTouch(e);
        };
        const onMove = (e) => {
          if (activeId == null) return;
          e.preventDefault();
          this.updateTouch(e);
        };
        const onEnd = () => {
          activeId = null;
          this.touch.active = false;
          this.touch.x = 0; this.touch.y = 0;
          if (stick) stick.style.transform = 'translate(-50%, -50%)';
        };
        this.updateTouch = (e) => {
          const rect = base.getBoundingClientRect();
          let t = null;
          if (e.changedTouches) {
            for (const touch of e.changedTouches) if (touch.identifier === activeId) t = touch;
          }
          if (!t) t = e;
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          let dx = (t.clientX - cx) / (rect.width / 2);
          let dy = (t.clientY - cy) / (rect.height / 2);
          const len = Math.hypot(dx, dy);
          if (len > 1) { dx /= len; dy /= len; }
          this.touch.x = dx;
          this.touch.y = dy;
          if (stick) stick.style.transform = `translate(calc(-50% + ${dx * 32}px), calc(-50% + ${dy * 32}px))`;
        };
        base.addEventListener('touchstart', onStart, { passive: false });
        base.addEventListener('touchmove', onMove, { passive: false });
        base.addEventListener('touchend', onEnd);
        base.addEventListener('touchcancel', onEnd);
      }
      if (sprintBtn) {
        sprintBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.touch.sprint = true; sprintBtn.classList.add('held'); }, { passive: false });
        sprintBtn.addEventListener('touchend', () => { this.touch.sprint = false; sprintBtn.classList.remove('held'); });
        sprintBtn.addEventListener('touchcancel', () => { this.touch.sprint = false; sprintBtn.classList.remove('held'); });
      }
    }

    bindUI() {
      const click = (id, fn) => {
        const el = LH.el(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
          e.preventDefault();
          this.initAudio();
          if (this.audio.ready) this.audio.click();
          fn();
        });
      };

      click('btn-play', () => {
        this.initAudio();
        let idx = 0;
        for (let i = 0; i < LH.LEVELS.length; i++) {
          if (!this.save.completed.includes(LH.LEVELS[i].id)) { idx = i; break; }
          if (i === LH.LEVELS.length - 1) idx = 0;
        }
        const lv = LH.LEVELS[idx];
        if ((this.save.unlocked || 1) <= idx) idx = Math.min(idx, (this.save.unlocked || 1) - 1);
        this.startLevel(idx);
      });

      click('btn-levels', () => {
        this.initAudio();
        this.renderLevelCards();
        this.showScreen('levels');
      });
      click('btn-howto', () => { this.initAudio(); this.showScreen('howto'); });
      click('btn-options', () => { this.initAudio(); this.showScreen('options'); });
      click('btn-options-back', () => this.showScreen(this.state === 'menu' ? 'menu' : 'pause'));
      click('btn-levels-back', () => this.showScreen('menu'));
      click('btn-howto-back', () => this.showScreen('menu'));
      click('btn-sound', () => { this.initAudio(); this.toggleMute(); });
      click('btn-sound-test', () => { this.initAudio(); this.audio.soundTest(); });
      click('btn-view', () => { this.setView(!this.save.settings.firstPerson); });
      const fpToggle = LH.el('fp-toggle');
      if (fpToggle) fpToggle.addEventListener('change', () => this.setView(fpToggle.checked));

      click('intro-start', () => this.beginPlay());
      click('intro-back', () => { this.audio.stopAmbience(0.6); this.openMenu(); });

      click('btn-pause', () => this.pause());
      click('btn-resume', () => this.resume());
      click('btn-pause-restart', () => this.restartLevel());
      click('btn-pause-quit', () => { this.hideScreens(); this.audio.resume(); this.openMenu(); });
      click('btn-pause-options', () => this.showScreen('options'));
      click('hud-mute', () => { this.initAudio(); this.toggleMute(); });

      click('btn-retry', () => this.restartLevel());
      click('btn-next', () => this.nextLevel());
      click('btn-result-menu', () => { this.audio.resume(); this.openMenu(); });

      click('btn-ending-menu', () => this.openMenu());
      click('btn-ending-replay', () => { this.audio.resume(); this.startLevel(0); });

      click('btn-reset', () => {
        if (window.confirm('Effacer toute la progression ? Cette action est définitive.')) {
          this.save = {
            unlocked: 1, best: {}, completed: [],
            settings: { volume: 0.72, grain: true, shake: true, muted: false, firstPerson: true }
          };
          this.persist();
          this.applySettings();
          this.renderLevelCards();
          this.toast('Progression effacée', 'bad');
        }
      });

      const vol = LH.el('volume-range');
      if (vol) {
        vol.addEventListener('input', () => {
          this.save.settings.volume = vol.value / 100;
          this.audio.setVolume(this.save.settings.volume);
          this.persist();
        });
      }
      const grain = LH.el('grain-toggle');
      if (grain) {
        grain.addEventListener('change', () => {
          this.save.settings.grain = grain.checked;
          this.scares.setGrain(grain.checked);
          this.persist();
        });
      }
      const shake = LH.el('shake-toggle');
      if (shake) {
        shake.addEventListener('change', () => {
          this.save.settings.shake = shake.checked;
          if (!shake.checked && this.world) this.world.shakeAmount = 0;
          this.persist();
        });
      }

      // Déblocage audio : tout geste réveille le contexte (les navigateurs le suspendent
      // tant qu'aucune interaction n'a eu lieu). On garde les écouteurs actifs pour
      // rattraper les suspensions d'iOS/Safari après un changement d'onglet.
      const unlock = () => { this.initAudio(); };
      ['pointerdown', 'keydown', 'touchstart'].forEach((type) => {
        document.addEventListener(type, unlock, { capture: true, passive: true });
      });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.audio.resume();
          this.updateAudioHint(this.audio.ctx ? this.audio.ctx.state : 'none');
        }
      });
      window.addEventListener('focus', () => this.audio.resume());

      const hint = LH.el('audio-hint');
      if (hint) {
        hint.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.save.settings.muted) {
            this.save.settings.muted = false;
            this.audio.setMuted(false);
            this.updateMuteButton();
            this.persist();
          }
          this.initAudio();
          if (this.audio.ready) this.audio.soundTest();
          this.updateAudioHint(this.audio.ctx ? this.audio.ctx.state : 'none');
        });
      }
    }
  }

  window.addEventListener('load', () => {
    LH.game = new Game();
  });
})();
