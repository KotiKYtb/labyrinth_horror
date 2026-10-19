/* LABYRINTHE — monde 3D, brouillard de mémoire, objets */
(function () {
  'use strict';
  const LH = window.LH;
  const CELL = LH.CELL;
  const WALL_H = LH.WALL_H;
  const WALL_T = LH.WALL_T;

  function colorOf(hex, amount) {
    const c = LH.hexToRgb(LH.shade(hex, amount || 0));
    return [c.r / 255, c.g / 255, c.b / 255];
  }

  function makeGlowTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.72)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  class World {
    constructor(renderer) {
      this.renderer = renderer;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 240);
      this.camOffset = new THREE.Vector3(0, 33, 18.5);
      this.camFocus = new THREE.Vector3();
      this.camLook = new THREE.Vector3();
      this.shakeAmount = 0;
      this.time = 0;
      this.maze = null;
      this.cellAlphas = null;
      this.lastAlphas = null;
      this.relics = [];
      this.matches = [];
      this.exit = null;
      this.levelGroup = null;
      this.playerGroup = null;
      this.torchLight = null;
      this.ambientLight = null;
      this.glowTex = makeGlowTexture();
      this.dust = null;
      this.dustData = null;
      this.uniforms = null;
      this.ready = false;
      this.camera.position.set(0, 35, 20);
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    clearLevel() {
      if (this.levelGroup) {
        this.scene.remove(this.levelGroup);
        this.levelGroup.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        });
        this.levelGroup = null;
      }
      this.relics = [];
      this.matches = [];
      this.exit = null;
      this.phantom = null;
      this.playerGroup = null;
      this.torchLight = null;
      this.ambientLight = null;
      this.maze = null;
      this.cellSurface = null;
      this.dust = null;
      this.dustData = null;
      this.ready = false;
      this.scene.fog = null;
    }

    // ------------------------------------------------------------------ niveau
    buildLevel(maze, theme, levelCfg) {
      this.clearLevel();
      this.maze = maze;
      this.theme = theme;
      this.levelCfg = levelCfg;
      this.scene.background = new THREE.Color(theme.fog);
      this.scene.fog = new THREE.FogExp2(theme.fog, theme.density * 0.8);

      const group = new THREE.Group();
      this.levelGroup = group;
      this.scene.add(group);

      this.ambientLight = new THREE.AmbientLight(theme.ambient, theme.ambientIntensity);
      group.add(this.ambientLight);

      this.buildMazeGeometry(maze, theme, group);

      // ciel nocturne, étoiles, lune
      this.buildSky(group);

      // poussière
      this.buildDust(group, theme);

      this.ready = true;
    }

    cellCenter(cx, cy) {
      return {
        x: (cx + 0.5 - this.maze.cols / 2) * CELL,
        z: (cy + 0.5 - this.maze.rows / 2) * CELL
      };
    }

    surfaceAt(x, z) {
      if (!this.cellSurface || !this.maze) return 'stone';
      const c = this.worldToCell(x, z);
      const cx = LH.clamp(c.cx, 0, this.maze.cols - 1);
      const cy = LH.clamp(c.cy, 0, this.maze.rows - 1);
      return this.cellSurface[cy * this.maze.cols + cx] || 'stone';
    }

    worldToCell(x, z) {
      return {
        cx: Math.floor(x / CELL + this.maze.cols / 2),
        cy: Math.floor(z / CELL + this.maze.rows / 2)
      };
    }

    buildMazeGeometry(maze, theme, group) {
      const cols = maze.cols, rows = maze.rows;
      const n = cols * rows;
      const positions = [];
      const normals = [];
      const colors = [];
      const floorAlpha = [];
      const cellRanges = new Array(n);
      const wallPos = [];
      const wallNor = [];
      const wallCol = [];
      const wallAlpha = [];
      const wallRanges = [];
      const cellWalls = Array.from({ length: n }, () => []);
      this.cellWalls = cellWalls;
      this.cellRanges = cellRanges;
      this.wallRanges = wallRanges;

      const rng = LH.mulberry32(maze.seed ^ 0x9e3779b9);
      const palettes = {
        cave: ['dirt', 'leaves', 'twig', 'grass', 'stone'],
        asylum: ['tile', 'tile', 'dirt', 'water'],
        chapel: ['stone', 'stone', 'dirt', 'water'],
        flesh: ['flesh', 'flesh', 'water', 'stone'],
        abyss: ['stone', 'dirt', 'water', 'leaves']
      };
      const surfacePalette = palettes[(theme.face || 'cave')] || palettes.cave;
      this.cellSurface = new Array(n);
      const tmp = new THREE.BoxGeometry(1, 1, 1);
      const m4 = new THREE.Matrix4();
      const euler = new THREE.Euler();
      const quat = new THREE.Quaternion();
      const vec = new THREE.Vector3();
      const mat = new THREE.Matrix4();

      const pushBox = (target, w, h, d, x, y, z, rgb, rotY, rotX, rotZ) => {
        euler.set(rotX || 0, rotY || 0, rotZ || 0);
        quat.setFromEuler(euler);
        mat.compose(vec.set(x, y, z), quat, { x: w, y: h, z: d });
        const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
        g.applyMatrix4(mat);
        const pos = g.attributes.position.array;
        const nor = g.attributes.normal.array;
        for (let i = 0; i < pos.length; i++) {
          target.pos.push(pos[i]);
          target.nor.push(nor[i]);
        }
        const count = pos.length / 3;
        for (let i = 0; i < count; i++) target.col.push(rgb[0], rgb[1], rgb[2]);
        g.dispose();
        return count;
      };

      const floorTarget = { pos: positions, nor: normals, col: colors };
      const wallTarget = { pos: wallPos, nor: wallNor, col: wallCol };
      const cellWorld = [];
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const ci = maze.idx(cx, cy);
          const w = this.cellCenter(cx, cy);
          cellWorld[ci] = w;
          this.cellSurface[ci] = surfacePalette[(rng() * surfacePalette.length) | 0];
          const start = positions.length / 3;
          const vary = (rng() - 0.5) * 0.1;
          const floorRgb = colorOf(theme.floor, 0.09 + (rng() - 0.5) * 0.12 + vary);
          const fCount = pushBox(floorTarget, CELL - 0.035, 0.22, CELL - 0.035, w.x, -0.11, w.z, floorRgb, 0);

          // décor
          const decorCount = 2 + ((rng() * 3) | 0);
          for (let k = 0; k < decorCount; k++) {
            const pick = rng();
            const ox = (rng() - 0.5) * (CELL - 1.5);
            const oz = (rng() - 0.5) * (CELL - 1.5);
            if (pick < 0.34) {
              const s = 0.14 + rng() * 0.26;
              pushBox(floorTarget, s * 1.5, s * 0.7, s, w.x + ox, s * 0.36 - 0.01, w.z + oz,
                colorOf(theme.decor, -0.28 + rng() * 0.16), rng() * 3.14);
            } else if (pick < 0.5) {
              const splats = 2 + ((rng() * 3) | 0);
              for (let s = 0; s < splats; s++) {
                const sw = 0.35 + rng() * 0.55;
                const sd = 0.3 + rng() * 0.5;
                pushBox(floorTarget, sw, 0.022, sd,
                  w.x + ox + (rng() - 0.5) * 1.1, 0.014,
                  w.z + oz + (rng() - 0.5) * 1.1,
                  colorOf(theme.blood, -0.32 + rng() * 0.18), rng() * 3.14);
              }
            } else if (pick < 0.62) {
              const bone = colorOf(0xb9ad93, -0.15 + rng() * 0.2);
              pushBox(floorTarget, 0.55, 0.06, 0.11, w.x + ox, 0.05, w.z + oz, bone, rng() * 3.14);
              pushBox(floorTarget, 0.09, 0.06, 0.36, w.x + ox + 0.18, 0.05, w.z + oz, bone, rng() * 1.5);
            } else if (pick < 0.7) {
              const cRgb = colorOf(0xc9bda3, 0);
              pushBox(floorTarget, 0.13, 0.5, 0.13, w.x + ox, 0.3, w.z + oz, cRgb, 0);
              pushBox(floorTarget, 0.07, 0.16, 0.07, w.x + ox, 0.62, w.z + oz, [1.0, 0.52, 0.14], 0);
            } else if (pick < 0.78) {
              pushBox(floorTarget, 0.8, 0.02, 0.8, w.x + ox, 0.015, w.z + oz,
                colorOf(theme.decor, 0.12), rng() * 3.14);
            }
          }
          const range = { start, count: positions.length / 3 - start, ci };
          cellRanges[ci] = range;
          for (let i = 0; i < range.count; i++) floorAlpha.push(0);

          // murs : Nord et Ouest de chaque cellule, Sud dernière ligne, Est dernière colonne
          const addWall = (dir, otherCi) => {
            const wallStart = wallPos.length / 3;
            let x = w.x, z = w.z, ww, dd, rotY = 0;
            if (dir === 'N') { z -= CELL / 2; ww = CELL + WALL_T; dd = WALL_T; }
            else if (dir === 'S') { z += CELL / 2; ww = CELL + WALL_T; dd = WALL_T; }
            else if (dir === 'W') { x -= CELL / 2; ww = WALL_T; dd = CELL + WALL_T; }
            else { x += CELL / 2; ww = WALL_T; dd = CELL + WALL_T; }
            const base = colorOf(theme.wall, 0.04 + (rng() - 0.5) * 0.14);
            const top = colorOf(theme.wall, 0.28 + rng() * 0.07);
            pushBox(wallTarget, ww, WALL_H, dd, x, WALL_H / 2, z, base, rotY, 0, 0);
            pushBox(wallTarget, ww + 0.04, 0.09, dd + 0.04, x, WALL_H + 0.045, z, top, rotY, 0, 0);
            const count = wallPos.length / 3 - wallStart;
            const wr = { start: wallStart, count, a: ci, b: otherCi };
            wallRanges.push(wr);
            cellWalls[ci].push(wallRanges.length - 1);
            if (otherCi != null) cellWalls[otherCi].push(wallRanges.length - 1);
            for (let i = 0; i < count; i++) wallAlpha.push(0);
          };

          if (maze.hasWall(cx, cy, LH.MAZE_N)) addWall('N', cy > 0 ? maze.idx(cx, cy - 1) : null);
          if (maze.hasWall(cx, cy, LH.MAZE_W)) addWall('W', cx > 0 ? maze.idx(cx - 1, cy) : null);
          if (cy === rows - 1 && maze.hasWall(cx, cy, LH.MAZE_S)) addWall('S', null);
          if (cx === cols - 1 && maze.hasWall(cx, cy, LH.MAZE_E)) addWall('E', null);
        }
      }
      tmp.dispose();

      this.cellWorld = cellWorld;

      // ---------------------------------------------------------------- shaders
      const mkGeo = (pos, nor, col, alpha) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
        geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(col), 3));
        geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(alpha), 1));
        geo.computeBoundingSphere();
        return geo;
      };

      this.floorGeo = mkGeo(positions, normals, colors, floorAlpha);
      this.wallGeo = mkGeo(wallPos, wallNor, wallCol, wallAlpha);
      this.floorAlphaAttr = this.floorGeo.getAttribute('aAlpha');
      this.wallAlphaAttr = this.wallGeo.getAttribute('aAlpha');
      this.floorAlphaArray = this.floorAlphaAttr.array;
      this.wallAlphaArray = this.wallAlphaAttr.array;

      const uniforms = {
        uLightPos: { value: new THREE.Vector3() },
        uLightColor: { value: new THREE.Color(theme.torch) },
        uLightRange: { value: theme.torchRange },
        uLightIntensity: { value: 1.3 },
        uAmbient: { value: new THREE.Color(theme.ambient).lerp(new THREE.Color(0xffffff), 0.25).multiplyScalar(theme.ambientIntensity * 1.12) },
        uFogColor: { value: new THREE.Color(theme.fog) },
        uFogDensity: { value: theme.density },
        uCamPos: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uMoonDir: { value: new THREE.Vector3(0.42, 0.78, -0.46).normalize() },
        uMoonColor: { value: new THREE.Color(0x93aad8) },
        uMoonIntensity: { value: 0.34 },
        uMemRange: { value: ((this.levelCfg && this.levelCfg.reveal) || 3) * LH.CELL }
      };
      this.uniforms = uniforms;
      this.ambientBase = uniforms.uAmbient.value.clone();

      const vert = `
        attribute vec3 aColor;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vNormalW = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `;
      const frag = `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        uniform vec3 uLightPos;
        uniform vec3 uLightColor;
        uniform float uLightRange;
        uniform float uLightIntensity;
        uniform vec3 uAmbient;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uCamPos;
        uniform float uTime;
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;
        uniform float uMoonIntensity;
        uniform float uMemRange;

        float dither(vec2 p) {
          return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
        }

        void main() {
          float d = dither(gl_FragCoord.xy);
          if (vAlpha < d * 0.98) discard;
          vec3 L = uLightPos - vWorld;
          float dist = length(L);
          vec3 N = normalize(vNormalW);
          vec3 Ln = L / max(dist, 0.0001);
          float diff = max(dot(N, Ln), 0.0);
          diff = 0.18 + 0.82 * diff;
          float att = clamp(1.0 - dist / uLightRange, 0.0, 1.0);
          att = att * att;
          float mem = clamp(1.0 - dist / (uMemRange * 1.25), 0.2, 1.0);
          vec3 baseAmbient = uAmbient * (0.35 + 0.65 * mem);
          float moonNdl = max(dot(N, uMoonDir), 0.0);
          vec3 moonLit = uMoonColor * uMoonIntensity * (0.4 + 0.6 * moonNdl) * (0.5 + 0.5 * mem);
          vec3 lit = baseAmbient + moonLit + uLightColor * diff * att * uLightIntensity;
          vec3 col = vColor * lit;
          float grain = fract(sin(dot(floor(vWorld.xz * 3.0) + floor(vWorld.y * 3.0) * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
          col *= 0.86 + 0.28 * grain;
          float camDist = distance(vWorld, uCamPos);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * camDist * camDist);
          col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
          col = mix(col, uFogColor, (1.0 - vAlpha) * 0.55);
          gl_FragColor = vec4(col, 1.0);
        }
      `;

      const mazeMat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.FrontSide
      });
      this.mazeMat = mazeMat;

      const floorMesh = new THREE.Mesh(this.floorGeo, mazeMat);
      floorMesh.frustumCulled = false;
      floorMesh.renderOrder = 0;
      const wallMesh = new THREE.Mesh(this.wallGeo, mazeMat);
      wallMesh.frustumCulled = false;
      wallMesh.renderOrder = 1;
      group.add(floorMesh);
      group.add(wallMesh);
      this.floorMesh = floorMesh;
      this.wallMesh = wallMesh;

      this.lastAlphas = new Float32Array(n);
      this.cellAlphas = new Float32Array(n);
    }

    applyCellAlphas(alphas) {
      if (!this.floorAlphaArray) return;
      const dirtyWalls = new Set();
      let dirtyFloor = false;
      for (let ci = 0; ci < alphas.length; ci++) {
        const a = alphas[ci];
        if (Math.abs(a - this.cellAlphas[ci]) > 0.003) {
          this.cellAlphas[ci] = a;
          const range = this.cellRanges[ci];
          if (range) {
            for (let i = range.start; i < range.start + range.count; i++) this.floorAlphaArray[i] = a;
            dirtyFloor = true;
          }
          const cw = this.cellWalls[ci];
          for (let k = 0; k < cw.length; k++) dirtyWalls.add(cw[k]);
        }
      }
      if (dirtyFloor) this.floorAlphaAttr.needsUpdate = true;
      if (dirtyWalls.size) {
        for (const wi of dirtyWalls) {
          const wr = this.wallRanges[wi];
          if (!wr) continue;
          const av = Math.max(this.cellAlphas[wr.a], wr.b != null ? this.cellAlphas[wr.b] : 0);
          for (let i = wr.start; i < wr.start + wr.count; i++) this.wallAlphaArray[i] = av;
        }
        this.wallAlphaAttr.needsUpdate = true;
      }
    }

    setAllAlphas(a) {
      if (!this.cellAlphas) return;
      const arr = new Float32Array(this.cellAlphas.length).fill(a);
      this.cellAlphas = new Float32Array(this.cellAlphas.length);
      this.applyCellAlphas(arr);
    }

    // ------------------------------------------------------------------ joueur
    addPlayer(x, z, theme) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      const coatMat = new THREE.MeshLambertMaterial({ color: 0x151416 });
      const skinMat = new THREE.MeshLambertMaterial({ color: 0x9d8b76 });
      const darkMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0b });

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.58, 1.25, 8), coatMat);
      body.position.y = 0.78;
      group.add(body);

      const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.43, 10, 8), coatMat);
      shoulders.position.y = 1.36;
      shoulders.scale.set(1.05, 0.65, 0.9);
      group.add(shoulders);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 10), skinMat);
      head.position.y = 1.68;
      group.add(head);

      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.13, 12), darkMat);
      hat.position.y = 1.9;
      group.add(hat);

      const armGeo = new THREE.BoxGeometry(0.16, 0.75, 0.16);
      const armL = new THREE.Mesh(armGeo, coatMat);
      armL.position.set(-0.4, 0.95, -0.05);
      armL.rotation.z = 0.16;
      group.add(armL);
      const armR = new THREE.Mesh(armGeo, coatMat);
      armR.position.set(0.4, 0.95, -0.08);
      armR.rotation.z = -0.2;
      group.add(armR);

      // lanterne
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd29a })
      );
      lantern.position.set(0.5, 0.8, -0.45);
      group.add(lantern);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex,
        color: theme.torch,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      glow.scale.set(2.4, 2.4, 1);
      glow.position.copy(lantern.position);
      group.add(glow);

      // halo au sol
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(4.8, 32),
        new THREE.MeshBasicMaterial({
          map: this.glowTex,
          color: theme.torch,
          transparent: true,
          opacity: 0.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.04;
      group.add(pool);

      // ombre
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.7, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.03;
      group.add(shadow);

      const light = new THREE.PointLight(theme.torch, 2.0, theme.torchRange * 1.25, 1.7);
      light.position.set(0, 2.6, 0);
      group.add(light);

      this.levelGroup.add(group);
      this.playerGroup = group;
      this.playerHead = head;
      this.playerLantern = lantern;
      this.playerGlow = glow;
      this.playerPool = pool;
      this.torchLight = light;
      this.playerAngle = 0;
      this.torchBaseIntensity = 2.0;
      return group;
    }

    updatePlayerTransform(x, z, angle, moving, movingSpeed) {
      if (!this.playerGroup) return;
      this.playerGroup.position.x = x;
      this.playerGroup.position.z = z;
      const target = angle;
      let diff = target - this.playerAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerAngle += diff * 0.18;
      this.playerGroup.rotation.y = this.playerAngle;
      const bob = moving ? Math.sin(this.time * (movingSpeed > 6 ? 13 : 8)) * 0.045 : Math.sin(this.time * 2.2) * 0.012;
      this.playerGroup.position.y = bob;
      if (this.playerLantern) {
        this.playerLantern.position.y = 0.8 + bob;
        this.playerGlow.position.y = 0.8 + bob;
      }
    }

    setTorch(intensity, range) {
      if (this.torchLight) {
        this.torchLight.intensity = intensity;
        this.torchLight.distance = range * 1.25;
      }
      if (this.uniforms) {
        this.uniforms.uLightIntensity.value = intensity * 1.35;
        this.uniforms.uLightRange.value = range * 1.1;
      }
    }

    setTorchColor(color) {
      if (this.torchLight) this.torchLight.color.setHex(color);
      if (this.uniforms) this.uniforms.uLightColor.value.setHex(color);
    }

    setAmbientFactor(f) {
      if (this.uniforms && this.ambientBase) {
        this.uniforms.uAmbient.value.copy(this.ambientBase).multiplyScalar(f);
      }
    }

    // ------------------------------------------------------------------ reliques
    addRelic(cellIndex, tint) {
      const cx = cellIndex % this.maze.cols, cy = (cellIndex / this.maze.cols) | 0;
      const p = this.cellCenter(cx, cy);
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);

      const color = tint || 0xb388ff;
      const orb = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.3, 1),
        new THREE.MeshBasicMaterial({ color })
      );
      orb.position.y = 1.15;
      group.add(orb);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex,
        color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      halo.scale.set(2.6, 2.6, 1);
      halo.position.y = 1.15;
      group.add(halo);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.035, 6, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.3;
      group.add(ring);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.4, 2.4, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.13,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })
      );
      beam.position.y = 1.2;
      group.add(beam);

      const light = new THREE.PointLight(color, 1.1, 8, 2);
      light.position.y = 1.3;
      group.add(light);

      this.levelGroup.add(group);
      const relic = { group, orb, halo, ring, beam, cell: cellIndex, collected: false, phase: Math.random() * 6.28, x: p.x, z: p.z, color };
      this.relics.push(relic);
      return relic;
    }

    collectRelic(relic) {
      relic.collected = true;
      relic.group.visible = false;
    }

    updateRelics(dt) {
      for (const r of this.relics) {
        if (r.collected) continue;
        r.phase += dt;
        const bob = Math.sin(r.phase * 2.1) * 0.16;
        r.orb.position.y = 1.15 + bob;
        r.orb.rotation.y += dt * 1.4;
        r.orb.rotation.x += dt * 0.5;
        r.halo.position.y = 1.15 + bob;
        r.halo.material.opacity = 0.62 + Math.sin(r.phase * 3) * 0.2;
        r.ring.rotation.z += dt * 1.2;
        r.ring.scale.setScalar(1 + Math.sin(r.phase * 2.4) * 0.1);
        r.beam.material.opacity = 0.1 + Math.sin(r.phase * 2.7) * 0.035;
      }
    }

    // ------------------------------------------------------------------ allumettes
    addMatch(cellIndex) {
      const cx = cellIndex % this.maze.cols, cy = (cellIndex / this.maze.cols) | 0;
      const p = this.cellCenter(cx, cy);
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);

      const wood = new THREE.MeshLambertMaterial({ color: 0x6b5537 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.22), new THREE.MeshLambertMaterial({ color: 0x5a2320 }));
      box.position.y = 0.07;
      group.add(box);
      for (let i = 0; i < 4; i++) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 5), wood);
        stick.rotation.z = Math.PI / 2 + (i - 1.5) * 0.12;
        stick.position.set(0, 0.17 + i * 0.028, (i - 1.5) * 0.05);
        group.add(stick);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff5a2a }));
        head.position.set(0.16, 0.17 + i * 0.028, (i - 1.5) * 0.05);
        group.add(head);
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xffa347, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      group.add(glow);

      this.levelGroup.add(group);
      const match = { group, glow, cell: cellIndex, collected: false, phase: Math.random() * 6.28, x: p.x, z: p.z };
      this.matches.push(match);
      return match;
    }

    collectMatch(m) {
      m.collected = true;
      m.group.visible = false;
    }

    updateMatches(dt) {
      for (const m of this.matches) {
        if (m.collected) continue;
        m.phase += dt;
        m.group.rotation.y += dt * 0.5;
        m.glow.position.y = 0.24 + Math.sin(m.phase * 2.4) * 0.05;
        m.glow.material.opacity = 0.35 + Math.sin(m.phase * 3) * 0.15;
        m.group.visible = (this.cellAlphas ? this.cellAlphas[m.cell] : 1) > 0.12;
      }
    }

    // ------------------------------------------------------------------ sortie
    addExit(cellIndex, theme) {
      const cx = cellIndex % this.maze.cols, cy = (cellIndex / this.maze.cols) | 0;
      const p = this.cellCenter(cx, cy);
      const group = new THREE.Group();
      group.position.set(p.x, 0, p.z);

      const stone = new THREE.MeshLambertMaterial({ color: LH.shade(theme.wall, 0.1) });
      const pillarGeo = new THREE.BoxGeometry(0.48, 3.3, 0.48);
      const left = new THREE.Mesh(pillarGeo, stone); left.position.set(-1.45, 1.65, 0); group.add(left);
      const right = new THREE.Mesh(pillarGeo, stone); right.position.set(1.45, 1.65, 0); group.add(right);
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.5, 0.6), stone);
      top.position.y = 3.35; group.add(top);

      const lockedColor = 0x7c241f;
      const openColor = 0x8fe9c5;

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.35, 40),
        new THREE.MeshBasicMaterial({
          color: lockedColor, transparent: true, opacity: 0.22,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.06;
      group.add(disc);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.85, 11, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: openColor, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide
        })
      );
      beam.position.y = 5.5;
      beam.renderOrder = 900;
      group.add(beam);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: lockedColor, transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
      }));
      glow.position.y = 1.4;
      glow.scale.set(4.5, 4.5, 1);
      glow.renderOrder = 901;
      group.add(glow);

      const light = new THREE.PointLight(openColor, 0, 8, 2);
      light.position.y = 2.2;
      group.add(light);

      this.levelGroup.add(group);
      this.exit = {
        group, disc, beam, glow, light, cell: cellIndex,
        unlocked: false, phase: 0, x: p.x, z: p.z, lockedColor, openColor
      };
    }

    unlockExit() {
      if (!this.exit) return;
      this.exit.unlocked = true;
      this.exit.disc.material.color.setHex(this.exit.openColor);
      this.exit.glow.material.color.setHex(this.exit.openColor);
      this.exit.light.color.setHex(this.exit.openColor);
      this.exit.disc.material.opacity = 0.42;
    }

    updateExit(dt) {
      const e = this.exit;
      if (!e) return;
      e.phase += dt;
      const pulse = 0.5 + Math.sin(e.phase * 2.2) * 0.5;
      if (e.unlocked) {
        e.beam.material.opacity = 0.045 + pulse * 0.055;
        e.glow.material.opacity = 0.32 + pulse * 0.2;
        e.light.intensity = 0.9 + pulse * 0.7;
        e.disc.material.opacity = 0.34 + pulse * 0.16;
        e.disc.scale.setScalar(1 + pulse * 0.05);
      } else {
        e.disc.material.opacity = 0.12 + pulse * 0.08;
        e.glow.material.opacity = 0.15 + pulse * 0.1;
        e.light.intensity = 0.15 + pulse * 0.15;
      }
    }

    // ------------------------------------------------------------------ ciel & lune
    buildSky(group) {
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(150, 24, 16),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
          uniforms: {
            uTop: { value: new THREE.Color(0x04060e) },
            uMid: { value: new THREE.Color(0x0a0e1c) },
            uBottom: { value: new THREE.Color(0x121521) }
          },
          vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'varying vec3 vP; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; void main(){ float h = clamp(normalize(vP).y, -1.0, 1.0); vec3 c = h > 0.0 ? mix(uMid, uTop, pow(h, 0.7)) : mix(uMid, uBottom, clamp(-h * 4.0, 0.0, 1.0)); gl_FragColor = vec4(c, 1.0); }'
        })
      );
      sky.renderOrder = -100;
      sky.frustumCulled = false;
      group.add(sky);
      this.sky = sky;

      const count = 420;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const h = 0.08 + Math.random() * 0.9;
        const r = 140;
        const rr = Math.sqrt(1 - h * h);
        pos[i * 3] = Math.cos(a) * rr * r;
        pos[i * 3 + 1] = h * r;
        pos[i * 3 + 2] = Math.sin(a) * rr * r;
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: 0xcdd8ff, size: 1.1, transparent: true, opacity: 0.85,
        depthWrite: false, fog: false, sizeAttenuation: false
      }));
      stars.renderOrder = -99;
      stars.frustumCulled = false;
      group.add(stars);
      this.stars = stars;

      const moonDir = new THREE.Vector3(0.42, 0.78, -0.46).normalize();
      const moonPos = moonDir.clone().multiplyScalar(120);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0x9fb6e6, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      halo.scale.set(60, 60, 1);
      halo.position.copy(moonPos);
      halo.renderOrder = -98;
      group.add(halo);
      const disc = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xf2f6ff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      disc.scale.set(16, 16, 1);
      disc.position.copy(moonPos);
      disc.renderOrder = -97;
      group.add(disc);
      this.moon = { halo, disc, pos: moonPos };

      const moonLight = new THREE.DirectionalLight(0x9db3e0, 0.5);
      moonLight.position.copy(moonPos);
      moonLight.target.position.set(0, 0, 0);
      group.add(moonLight);
      group.add(moonLight.target);
      this.moonLight = moonLight;
    }

    setMoonFactor(f) {
      if (this.uniforms) this.uniforms.uMoonIntensity.value = 0.34 * f;
      if (this.moonLight) this.moonLight.intensity = 0.5 * f;
    }

    // ------------------------------------------------------------------ poussière
    buildDust(group, theme) {
      const count = 520;
      const positions = new Float32Array(count * 3);
      const data = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 70;
        positions[i * 3 + 1] = Math.random() * 12;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
        data[i * 3] = Math.random() * 0.3 + 0.1;
        data[i * 3 + 1] = Math.random() * 0.2 + 0.05;
        data[i * 3 + 2] = Math.random() * 6.28;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: theme.torch, size: 0.075, transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
      });
      const points = new THREE.Points(geo, mat);
      group.add(points);
      this.dust = points;
      this.dustData = data;
      this.dustCount = count;
    }

    updateDust(dt, focus) {
      if (!this.dust) return;
      const pos = this.dust.geometry.getAttribute('position');
      const arr = pos.array;
      const data = this.dustData;
      for (let i = 0; i < this.dustCount; i++) {
        const i3 = i * 3;
        arr[i3 + 1] += data[i3 + 1] * dt;
        arr[i3] += Math.sin(this.time * 0.4 + data[i3 + 2]) * dt * 0.12;
        arr[i3 + 2] += Math.cos(this.time * 0.3 + data[i3 + 2]) * dt * 0.1;
        if (arr[i3 + 1] > 11) arr[i3 + 1] = 0.2;
        // recentre autour du joueur
        if (arr[i3] - focus.x > 35) arr[i3] -= 70;
        if (arr[i3] - focus.x < -35) arr[i3] += 70;
        if (arr[i3 + 2] - focus.z > 35) arr[i3 + 2] -= 70;
        if (arr[i3 + 2] - focus.z < -35) arr[i3 + 2] += 70;
      }
      pos.needsUpdate = true;
    }

    // ------------------------------------------------------------------ caméra
    focusCamera(x, z, dt, immediate) {
      if (this.fp) {
        const sx = (Math.random() - 0.5) * this.shakeAmount * 0.5;
        const sy = (Math.random() - 0.5) * this.shakeAmount * 0.3;
        const bob = Math.sin(this.time * 2.4) * 0.025;
        const eyeY = 1.62 + bob + sy;
        this.camera.position.set(x + sx, eyeY, z);
        const yaw = this.fpYaw || 0;
        const pitch = this.fpPitch || 0;
        const cp = Math.cos(pitch);
        const dx = -Math.sin(yaw) * cp;
        const dy = Math.sin(pitch);
        const dz = -Math.cos(yaw) * cp;
        this.camera.lookAt(x + dx * 8 + sx, eyeY + dy * 8, z + dz * 8);
        this.shakeAmount = Math.max(0, this.shakeAmount - dt * 12);
        return;
      }
      const target = this.camFocus;
      if (immediate || !this.ready) {
        target.set(x, 0, z);
      } else {
        target.x = LH.damp(target.x, x, 7, dt);
        target.z = LH.damp(target.z, z, 7, dt);
        target.y = LH.damp(target.y, 0, 7, dt);
      }
      this.camLook.copy(target);
      this.camLook.z -= 1.6;
      const sx = (Math.sin(this.time * 0.7) * 0.05) + (Math.random() - 0.5) * this.shakeAmount;
      const sy = (Math.cos(this.time * 0.53) * 0.04) + (Math.random() - 0.5) * this.shakeAmount;
      const sz = (Math.random() - 0.5) * this.shakeAmount * 0.6;
      this.camera.position.set(
        target.x + this.camOffset.x + sx,
        target.y + this.camOffset.y + sy,
        target.z + this.camOffset.z + sz
      );
      this.camera.lookAt(this.camLook);
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 12);
    }

    flashPhantom(x, z, ttl) {
      if (!this.levelGroup) return;
      if (!this.phantom) {
        const mat = new THREE.MeshLambertMaterial({ color: 0x6a5f58, transparent: true, opacity: 0, depthWrite: false });
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.62, 2.3, 9), mat);
        body.position.y = 1.2;
        group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat);
        head.position.y = 2.5;
        group.add(head);
        group.visible = false;
        this.levelGroup.add(group);
        this.phantom = { group, mat, ttl: 0 };
      }
      this.phantom.group.position.set(x, 0, z);
      this.phantom.group.rotation.y = Math.random() * 6.28;
      this.phantom.ttl = ttl;
    }

    updatePhantom(dt) {
      const p = this.phantom;
      if (!p) return;
      if (p.ttl > 0) {
        p.ttl -= dt;
        p.mat.opacity = Math.min(0.8, p.ttl * 4);
        p.group.visible = true;
      } else {
        p.group.visible = false;
        p.mat.opacity = 0;
      }
    }

    setFirstPerson(on) {
      this.fp = !!on;
      this.camera.fov = this.fp ? 74 : 50;
      this.camera.updateProjectionMatrix();
      if (this.playerGroup) this.playerGroup.children.forEach((c) => { if (!c.isLight) c.visible = !this.fp; });
    }

    shake(amount) {
      this.shakeAmount = Math.max(this.shakeAmount, amount);
    }

    update(dt, time) {
      this.time = time;
      this.updateRelics(dt);
      this.updateMatches(dt);
      this.updateExit(dt);
      this.updatePhantom(dt);
      if (this.maze && this.mazeMat) {
        this.uniforms.uCamPos.value.copy(this.camera.position);
        this.uniforms.uTime.value = time;
        const p = this.playerGroup ? this.playerGroup.position : this.camFocus;
        this.uniforms.uLightPos.value.set(p.x, 2.6, p.z);
        this.updateDust(dt, this.camFocus);
      }
    }

    render() {
      this.renderer.render(this.scene, this.camera);
    }
  }

  LH.World = World;
})();
