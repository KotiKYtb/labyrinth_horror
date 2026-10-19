/* LABYRINTHE — créatures autonomes */
(function () {
  'use strict';
  const LH = window.LH;

  const SKINS = {
    1: { body: 0x17130f, head: 0x7d6f5e, eye: 0xff7b35, cloth: 0x241d17 },
    2: { body: 0x252c29, head: 0xc6cbc1, eye: 0xff392d, cloth: 0x8f978f },
    3: { body: 0x1e1722, head: 0x93838c, eye: 0xffc24a, cloth: 0x38263c },
    4: { body: 0x250b0b, head: 0x8e4a41, eye: 0xff4d2b, cloth: 0x3d1112 },
    5: { body: 0x080d15, head: 0x93a6b8, eye: 0xa6e2ff, cloth: 0x131c2b }
  };

  class Monster {
    constructor(game, cfg, spawnIdx, index, level) {
      this.game = game;
      this.cfg = cfg;
      this.maze = game.maze;
      this.world = game.world;
      this.index = index;
      this.level = level;
      this.name = cfg.name;

      const cx = spawnIdx % this.maze.cols, cy = (spawnIdx / this.maze.cols) | 0;
      const spawn = this.world.cellCenter(cx, cy);
      this.x = spawn.x;
      this.z = spawn.z;
      this.vx = 0;
      this.vz = 0;
      this.cell = spawnIdx;
      this.state = 'patrol';
      this.targetCell = spawnIdx;
      this.targetPos = new THREE.Vector3(spawn.x, 0, spawn.z);
      this.lastSeen = new THREE.Vector3(spawn.x, 0, spawn.z);
      this.path = [];
      this.repathTimer = 0;
      this.lostTimer = 0;
      this.searchTimer = 0;
      this.searchCount = 0;
      this.waitTimer = 0;
      this.stuckTimer = 0;
      this.lastMoveCheck = { x: spawn.x, z: spawn.z, t: 0 };
      this.walkPhase = Math.random() * 10;
      this.screamCd = 0;
      this.attack = false;
      this.perceptionTimer = 0;
      this.seesPlayer = false;
      this.stepTimer = Math.random() * 0.5;

      this.skin = SKINS[level.id] || SKINS[1];
      this.buildMesh();
      this.group.position.set(this.x, 0, this.z);
      this.world.levelGroup.add(this.group);
      this.targetCell = this.pickPatrolTarget();
      this.path = [];
    }

    buildMesh() {
      const scale = this.cfg.scale || 1;
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshLambertMaterial({
        color: this.skin.body, transparent: true, opacity: 1
      });
      const clothMat = new THREE.MeshLambertMaterial({
        color: this.skin.cloth, transparent: true, opacity: 0.9
      });
      const headMat = new THREE.MeshLambertMaterial({
        color: this.skin.head, transparent: true, opacity: 1, emissive: new THREE.Color(this.skin.head).multiplyScalar(0.06)
      });
      const eyeMat = new THREE.MeshBasicMaterial({ color: this.skin.eye, transparent: true, opacity: 1 });
      const darkMat = new THREE.MeshBasicMaterial({ color: 0x030303, transparent: true, opacity: 1 });

      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.62, 1.75, 9), clothMat);
      torso.position.y = 1.0;
      group.add(torso);

      const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, 0.7, 8), bodyMat);
      hips.position.y = 0.32;
      group.add(hips);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), headMat);
      head.position.y = 2.05;
      head.scale.set(0.88, 1.1, 0.9);
      group.add(head);

      // yeux
      const eyeGeo = new THREE.SphereGeometry(0.055, 8, 8);
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-0.11, 2.08, -0.27);
      group.add(eyeL);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(0.11, 2.08, -0.27);
      group.add(eyeR);

      // bouche
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), darkMat);
      mouth.position.set(0, 1.9, -0.28);
      mouth.scale.set(1.3, 1.8, 0.4);
      group.add(mouth);

      // bras démesurés
      const armGeo = new THREE.BoxGeometry(0.13, 1.35, 0.13);
      const armL = new THREE.Mesh(armGeo, bodyMat);
      armL.position.set(-0.47, 1.1, 0);
      armL.rotation.z = 0.1;
      group.add(armL);
      const armR = new THREE.Mesh(armGeo, bodyMat);
      armR.position.set(0.47, 1.1, 0);
      armR.rotation.z = -0.1;
      group.add(armR);

      // mains / griffes
      const clawGeo = new THREE.BoxGeometry(0.1, 0.34, 0.06);
      const clawL = new THREE.Mesh(clawGeo, bodyMat);
      clawL.position.set(0, -0.78, -0.06);
      armL.add(clawL);
      const clawR = new THREE.Mesh(clawGeo, bodyMat);
      clawR.position.set(0, -0.78, -0.06);
      armR.add(clawR);

      // crête / voile
      const veil = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 6, 1, true), clothMat);
      veil.position.y = 1.55;
      veil.rotation.y = Math.PI / 6;
      group.add(veil);

      // halo des yeux
      const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.world.glowTex,
        color: this.skin.eye,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      eyeGlow.scale.set(1.5, 1.5, 1);
      eyeGlow.position.set(0, 2.42, 0);
      group.add(eyeGlow);

      // lueur au sol
      const groundGlow = new THREE.Mesh(
        new THREE.CircleGeometry(1.25, 24),
        new THREE.MeshBasicMaterial({
          map: this.world.glowTex,
          color: this.skin.eye,
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      groundGlow.rotation.x = -Math.PI / 2;
      groundGlow.position.y = 0.06;
      group.add(groundGlow);

      // aura
      const aura = new THREE.PointLight(this.skin.eye, 1.1, 7.5, 2);
      aura.position.set(0, 2.1, 0);
      group.add(aura);

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.65, 18),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.03;
      group.add(shadow);

      group.scale.setScalar(scale);
      this.group = group;
      this.bodyMat = bodyMat;
      this.clothMat = clothMat;
      this.headMat = headMat;
      this.eyeMat = eyeMat;
      this.eyeGlow = eyeGlow;
      this.groundGlow = groundGlow;
      this.aura = aura;
      this.armL = armL;
      this.armR = armR;
      this.head = head;
      this.torso = torso;
      this.veil = veil;
    }

    get speed() {
      const base = this.state === 'chase' ? this.cfg.chase : this.state === 'investigate' ? this.cfg.patrol * 1.5 : this.state === 'search' ? this.cfg.patrol * 1.15 : this.cfg.patrol;
      const boost = 1 + (this.game.relicsCollected || 0) * (this.game.levelCfg.escalation || 0);
      return base * boost;
    }

    cellOf(x, z) {
      const c = this.world.worldToCell(x, z);
      return this.maze.idx(LH.clamp(c.cx, 0, this.maze.cols - 1), LH.clamp(c.cy, 0, this.maze.rows - 1));
    }

    pickPatrolTarget() {
      const n = this.maze.cols * this.maze.rows;
      const playerCell = this.game.playerCellIndex != null ? this.game.playerCellIndex : 0;
      for (let tries = 0; tries < 20; tries++) {
        const idx = (Math.random() * n) | 0;
        if (idx !== this.cell && idx !== playerCell) return idx;
      }
      return (Math.random() * n) | 0;
    }

    pickSearchTarget() {
      const base = this.cellOf(this.lastSeen.x, this.lastSeen.z);
      const dist = this.maze.bfs(base);
      const options = [];
      for (let i = 0; i < dist.length; i++) {
        if (dist[i] >= 1 && dist[i] <= 4) options.push(i);
      }
      if (!options.length) return this.pickPatrolTarget();
      return options[(Math.random() * options.length) | 0];
    }

    hear(x, z, radius) {
      if (this.attack) return;
      const d = LH.dist2(this.x, this.z, x, z);
      if (d > radius) return;
      if (this.state === 'chase') return;
      // localisation approximative
      const jitter = 1.0 + Math.random() * 1.6;
      const angle = Math.random() * Math.PI * 2;
      this.lastSeen.set(x + Math.cos(angle) * jitter, 0, z + Math.sin(angle) * jitter);
      this.targetPos.copy(this.lastSeen);
      this.targetCell = this.cellOf(this.lastSeen.x, this.lastSeen.z);
      this.state = 'investigate';
      this.repathTimer = 0;
      this.searchTimer = 0;
      this.waitTimer = 0;
    }

    enterChase() {
      if (this.state !== 'chase') {
        this.state = 'chase';
        this.repathTimer = 0;
        this.lostTimer = 0;
        if (this.screamCd <= 0) {
          this.screamCd = 7 + Math.random() * 5;
          this.game.onMonsterAlert(this);
        }
      }
    }

    update(dt) {
      this.screamCd = Math.max(0, this.screamCd - dt);
      if (!this.game.canHunt || this.game.player.dead) {
        this.animate(dt, 0);
        return;
      }
      const p = this.game.player;
      const dist = LH.dist2(this.x, this.z, p.x, p.z);
      const gx = this.x / LH.CELL + this.maze.cols / 2;
      const gz = this.z / LH.CELL + this.maze.rows / 2;
      const pgx = p.x / LH.CELL + this.maze.cols / 2;
      const pgz = p.z / LH.CELL + this.maze.rows / 2;

      this.losTimer = (this.losTimer || 0) - dt;
      if (this.losTimer <= 0 || this.cachedLos === undefined) {
        this.losTimer = 0.12;
        this.cachedLos = this.maze.lineOfSight(gx, gz, pgx, pgz);
      }
      let los = this.cachedLos;
      if (this.cfg.seer && dist < this.cfg.sight * 0.6) los = true;
      const canSee = dist < this.cfg.sight && los;
      this.seesPlayer = canSee;

      if (canSee) {
        this.enterChase();
        this.lastSeen.set(p.x, 0, p.z);
        this.lostTimer = 0;
      } else if (this.state === 'chase') {
        this.lostTimer += dt;
        if (this.lostTimer > (this.cfg.seer ? 2.2 : 1.35)) {
          this.state = 'investigate';
          this.targetPos.copy(this.lastSeen);
          this.targetCell = this.cellOf(this.lastSeen.x, this.lastSeen.z);
          this.repathTimer = 0;
          this.searchTimer = 0;
        }
      }

      // Attaque
      if (dist < 1.35 && this.state === 'chase' && !this.game.graceActive) {
        this.game.killPlayer(this);
        return;
      }

      // Cibles selon l'état
      if (this.state === 'chase') {
        this.targetPos.set(p.x, 0, p.z);
        this.targetCell = this.cellOf(p.x, p.z);
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 0.28;
          this.recomputePath(this.targetCell);
        }
      } else if (this.state === 'investigate') {
        const d = LH.dist2(this.x, this.z, this.targetPos.x, this.targetPos.z);
        if (d < 1.15) {
          this.state = 'search';
          this.searchTimer = 6.5 + Math.random() * 4;
          this.searchCount = 3;
          this.targetCell = this.pickSearchTarget();
          this.targetPos.copy(this.cellPos(this.targetCell));
          this.repathTimer = 0;
        } else {
          this.repathTimer -= dt;
          if (this.repathTimer <= 0) {
            this.repathTimer = 0.6;
            this.recomputePath(this.targetCell);
          }
        }
      } else if (this.state === 'search') {
        this.searchTimer -= dt;
        const d = LH.dist2(this.x, this.z, this.targetPos.x, this.targetPos.z);
        if (d < 1.0) {
          this.searchCount--;
          if (this.searchCount <= 0 || this.searchTimer <= 0) {
            this.state = 'patrol';
            this.targetCell = this.pickPatrolTarget();
            this.targetPos.copy(this.cellPos(this.targetCell));
            this.repathTimer = 0;
          } else {
            this.targetCell = this.pickSearchTarget();
            this.targetPos.copy(this.cellPos(this.targetCell));
            this.repathTimer = 0;
          }
        }
        if (this.searchTimer <= 0) {
          this.state = 'patrol';
          this.targetCell = this.pickPatrolTarget();
          this.targetPos.copy(this.cellPos(this.targetCell));
          this.repathTimer = 0;
        }
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 0.7;
          this.recomputePath(this.targetCell);
        }
      } else {
        // patrouille
        const d = LH.dist2(this.x, this.z, this.targetPos.x, this.targetPos.z);
        if (d < 0.85) {
          this.targetCell = this.pickPatrolTarget();
          this.targetPos.copy(this.cellPos(this.targetCell));
          this.repathTimer = 0;
        }
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 0.75;
          this.recomputePath(this.targetCell);
        }
      }

      this.move(dt);
      this.separate(dt);
      this.animate(dt, this.state === 'chase' ? 1 : 0.45);
      this.playSteps(dt, dist);
      this.updateVisibility(dist, los, dt);
    }

    playSteps(dt, dist) {
      if (!this.game.audio || !this.game.audio.ready) return;
      this.stepTimer -= dt;
      if (this.stepTimer > 0) return;
      const speed = this.speed || 2;
      this.stepTimer = LH.clamp(2.0 / speed, 0.26, 1.2);
      if (dist > 30) return;
      const rel = LH.angleTo(this.game.player.x, this.game.player.z, this.x, this.z);
      const ang = this.game.save.settings.firstPerson ? rel + this.game.player.yaw : rel;
      const pan = Math.sin(ang) * 0.85;
      const vol = LH.clamp(1 - dist / 30, 0.04, 0.8) * (this.state === 'chase' ? 1 : 0.65);
      const surf = this.world.surfaceAt ? this.world.surfaceAt(this.x, this.z) : 'dirt';
      this.game.audio.footstepSurface(this.state === 'chase' ? surf : (surf === 'tile' ? 'tile' : 'dirt'), vol, pan);
    }

    recomputePath(toCell) {
      const from = this.cellOf(this.x, this.z);
      if (from === toCell) { this.path = []; return; }
      const p = this.maze.findPath(from, toCell);
      this.path = p;
      if (!p.length) {
        // repli
        this.path = [toCell];
      }
    }

    cellPos(idx) {
      const cx = idx % this.maze.cols, cy = (idx / this.maze.cols) | 0;
      return this.world.cellCenter(cx, cy);
    }

    move(dt) {
      // point de passage
      let tx, tz;
      if (this.path.length) {
        const next = this.path[0];
        const c = this.cellPos(next);
        tx = c.x; tz = c.z;
        if (LH.dist2(this.x, this.z, tx, tz) < 0.8) {
          this.cell = next;
          this.path.shift();
          if (this.path.length) {
            const c2 = this.cellPos(this.path[0]);
            tx = c2.x; tz = c2.z;
          } else {
            tx = this.targetPos.x; tz = this.targetPos.z;
          }
        }
      } else {
        tx = this.targetPos.x;
        tz = this.targetPos.z;
      }

      let dx = tx - this.x, dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) { dx /= d; dz /= d; } else { dx = 0; dz = 0; }

      // fluide mais jamais figé
      const desiredSpeed = this.speed;
      const wobble = Math.sin(this.game.globalTime * 1.7 + this.index * 2.1) * 0.22;
      const desiredVx = dx * desiredSpeed + -dz * wobble;
      const desiredVz = dz * desiredSpeed + dx * wobble;
      this.vx = LH.damp(this.vx, desiredVx, 5.5, dt);
      this.vz = LH.damp(this.vz, desiredVz, 5.5, dt);

      let nx = this.x + this.vx * dt;
      let nz = this.z + this.vz * dt;
      const resolved = this.game.resolveCircle(nx, nz, LH.MONSTER_R);
      nx = resolved.x; nz = resolved.z;

      // détection de blocage
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.7) {
        const moved = LH.dist2(this.x, this.z, this.lastMoveCheck.x, this.lastMoveCheck.z);
        if (moved < 0.18) {
          this.repathTimer = 0;
          this.vx = (Math.random() - 0.5) * 2;
          this.vz = (Math.random() - 0.5) * 2;
        }
        this.lastMoveCheck.x = this.x;
        this.lastMoveCheck.z = this.z;
        this.stuckTimer = 0;
      }

      this.x = nx;
      this.z = nz;
      this.cell = this.cellOf(this.x, this.z);
      this.group.position.x = this.x;
      this.group.position.z = this.z;
      if (this.vx * this.vx + this.vz * this.vz > 0.01) {
        const ang = Math.atan2(-this.vx, -this.vz);
        let diff = ang - this.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * Math.min(1, dt * 8);
      }
    }

    separate(dt) {
      for (const other of this.game.monsters) {
        if (other === this) continue;
        const dx = this.x - other.x, dz = this.z - other.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 1.5) {
          const push = (1.5 - d) * dt * 2.2;
          this.x += (dx / d) * push;
          this.z += (dz / d) * push;
        }
      }
    }

    animate(dt, intensity) {
      const chasing = this.state === 'chase';
      this.walkPhase += dt * (chasing ? 10 : 4.6);
      const t = this.game.globalTime;
      const sway = Math.sin(this.walkPhase);
      const breathe = 1 + Math.sin(t * 1.6 + this.index * 2) * 0.02;

      this.group.position.y = 0.04 + Math.abs(Math.sin(this.walkPhase * 0.9)) * 0.05;

      // bras : épaule + coude
      if (this.armL && this.armR) {
        this.armL.rotation.x = sway * 0.5 * intensity - 0.15;
        this.armR.rotation.x = -sway * 0.5 * intensity - 0.15;
        this.armL.rotation.z = 0.16 + sway * 0.06;
        this.armR.rotation.z = -0.16 + sway * 0.06;
        if (this.elbowL) {
          this.elbowL.rotation.x = 0.5 + Math.max(0, sway) * 0.6 + (chasing ? 0.35 : 0);
          this.elbowR.rotation.x = 0.5 + Math.max(0, -sway) * 0.6 + (chasing ? 0.35 : 0);
        }
      }
      // respiration + balancement du buste
      if (this.torso) this.torso.scale.set(breathe, 1, breathe);
      if (this.head) {
        this.head.rotation.z = Math.sin(this.walkPhase * 0.4) * 0.1;
        this.head.rotation.y = Math.sin(t * 0.7 + this.index) * 0.16;
        this.head.rotation.x = chasing ? -0.16 : Math.sin(t * 1.1 + this.index) * 0.05;
      }
      if (this.tendrils) {
        this.tendrils.rotation.x = Math.sin(t * 1.3 + this.index) * 0.14;
        this.tendrils.rotation.z = Math.cos(t * 0.9 + this.index) * 0.14;
      }
      if (this.eyeGlow) {
        this.eyeGlow.material.opacity = 0.5 + Math.sin(t * 4 + this.index) * 0.15 + (chasing ? 0.2 : 0);
      }
    }

    updateVisibility(dist, los, dt) {
      const cellAlpha = this.world.cellAlphas ? this.world.cellAlphas[this.cell] : 0;
      const inMemory = cellAlpha > 0.18;
      const close = dist < 8.5 && los;
      const bodyVisible = inMemory || close;
      const eyesVisible = los && dist < 18;
      this.group.visible = bodyVisible || eyesVisible;
      if (!this.group.visible) return;
      const step = dt || 0.016;
      const bodyTarget = inMemory ? 0.97 : (close ? 0.6 : 0);
      this.bodyMat.opacity = LH.damp(this.bodyMat.opacity, bodyTarget, 8, step);
      this.clothMat.opacity = LH.damp(this.clothMat.opacity, bodyTarget, 8, step);
      this.headMat.opacity = LH.damp(this.headMat.opacity, bodyTarget, 8, step);
      this.eyeMat.opacity = eyesVisible ? 1 : 0;
      this.eyeGlow.material.opacity = eyesVisible ? 0.6 + Math.sin(this.game.globalTime * 4 + this.index) * 0.15 : 0;
      if (this.groundGlow) this.groundGlow.material.opacity = eyesVisible ? 0.13 + Math.sin(this.game.globalTime * 3 + this.index) * 0.04 : 0;
      if (this.aura) this.aura.intensity = eyesVisible ? (this.state === 'chase' ? 1.7 : 0.9) : 0;
      const vis = this.bodyMat.opacity > 0.02 || eyesVisible;
      this.group.visible = vis;
    }

    startAttack() {
      this.attack = true;
      this.state = 'chase';
    }
  }

  LH.Monster = Monster;
})();
