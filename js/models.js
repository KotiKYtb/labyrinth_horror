/* LABYRINTHE — modèles 3D détaillés : créatures et reliques */
(function () {
  'use strict';
  const LH = window.LH;

  // ------------------------------------------------------------- outil de fusion
  function Part() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }
  const M = new THREE.Matrix4();
  const E = new THREE.Euler();
  const Q = new THREE.Quaternion();
  const V = new THREE.Vector3();
  const SC = new THREE.Vector3();

  function mat(x, y, z, rx, ry, rz, sx, sy, sz) {
    E.set(rx || 0, ry || 0, rz || 0);
    Q.setFromEuler(E);
    V.set(x || 0, y || 0, z || 0);
    SC.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
    return M.compose(V, Q, SC).clone();
  }

  Part.prototype.add = function (geo, color, matrix, jitter) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) g.applyMatrix4(matrix);
    if (jitter) {
      const p = g.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const h = LH.hash2(Math.round(p[i] * 37), Math.round(p[i + 1] * 23 + p[i + 2] * 11), 7);
        const j = (h - 0.5) * jitter;
        p[i] *= 1 + j;
        p[i + 2] *= 1 + j;
      }
      g.computeVertexNormals();
    }
    const c = LH.hexToRgb(color);
    const pa = g.attributes.position.array;
    const na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i++) { this.pos.push(pa[i]); this.nor.push(na[i]); }
    const n = pa.length / 3;
    for (let i = 0; i < n; i++) this.col.push(c.r / 255, c.g / 255, c.b / 255);
    if (g !== geo) g.dispose();
    return this;
  };

  Part.prototype.build = function () {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    geo.computeBoundingSphere();
    return geo;
  };

  // ------------------------------------------------------------- créature
  LH.Monster.prototype.buildMesh = function () {
    const S = this.skin;
    const scale = this.cfg.scale || 1;
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: 1, side: THREE.DoubleSide
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: S.eye, transparent: true, opacity: 1 });

    const flesh = LH.shade(S.body, -0.22);
    const cloth = LH.shade(S.cloth, -0.52);
    const bone = LH.shade(S.head, -0.3);

    const add = (part, geo, color, m, jitter) => part.add(geo, color, m, jitter);

    // ---- corps : robe déchirée, cage thoracique, épine, épaules
    const body = new Part();
    const robePts = [
      new THREE.Vector2(0.001, 0), new THREE.Vector2(0.46, 0.02), new THREE.Vector2(0.58, 0.7),
      new THREE.Vector2(0.5, 1.35), new THREE.Vector2(0.38, 1.9), new THREE.Vector2(0.28, 2.25),
      new THREE.Vector2(0.15, 2.46), new THREE.Vector2(0.001, 2.5)
    ];
    add(body, new THREE.LatheGeometry(robePts, 20), cloth, mat(0, 0, 0, 0, 0, 0), 0.11);

    for (let i = 0; i < 7; i++) {
      const r = 0.43 - i * 0.028;
      const rib = new THREE.TorusGeometry(r, 0.024, 5, 16, Math.PI * (0.85 + i * 0.02));
      add(body, rib, bone, mat(0, 1.02 + i * 0.2, 0.02, Math.PI / 2, 0, Math.PI * 0.08));
      add(body, rib.clone(), bone, mat(0, 1.02 + i * 0.2, -0.02, Math.PI / 2, 0, Math.PI * 1.08));
    }
    for (let i = 0; i < 8; i++) {
      const h = 0.16 + i * 0.02;
      add(body, new THREE.ConeGeometry(0.045, h * 2, 5), bone,
        mat(0, 0.75 + i * 0.21, 0.4 - i * 0.03, Math.PI / 2 + 0.18, 0, 0));
    }
    // omoplates
    add(body, new THREE.SphereGeometry(0.16, 8, 6), bone, mat(-0.34, 2.12, 0.16, 0.4, 0, 0.3, 1, 0.7, 0.6));
    add(body, new THREE.SphereGeometry(0.16, 8, 6), bone, mat(0.34, 2.12, 0.16, 0.4, 0, -0.3, 1, 0.7, 0.6));
    // épaules
    add(body, new THREE.SphereGeometry(0.19, 10, 8), flesh, mat(-0.43, 2.24, 0), 0.1);
    add(body, new THREE.SphereGeometry(0.19, 10, 8), flesh, mat(0.43, 2.24, 0), 0.1);
    // lambeaux de tissu
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(body, new THREE.ConeGeometry(0.16, 0.7 + (i % 3) * 0.16, 4), cloth,
        mat(Math.sin(a) * 0.42, 0.5 - (i % 3) * 0.06, Math.cos(a) * 0.42, Math.PI, 0, 0), 0.16);
    }

    const bodyMesh = new THREE.Mesh(body.build(), bodyMat);
    group.add(bodyMesh);

    // ---- tête : crâne, orbites creuses, mâchoire dentée, membres fins
    const head = new THREE.Group();
    head.position.set(0, 2.6, 0);
    group.add(head);
    const hp = new Part();
    add(hp, new THREE.SphereGeometry(0.26, 16, 14), bone, mat(0, 0, 0, 0, 0, 0, 0.88, 1.18, 1.0), 0.05);
    add(hp, new THREE.BoxGeometry(0.4, 0.07, 0.13), bone, mat(0, 0.11, -0.2, 0.25, 0, 0));   // arcade
    add(hp, new THREE.SphereGeometry(0.09, 8, 6), bone, mat(-0.19, -0.05, -0.14, 0, 0, 0)); // pommette
    add(hp, new THREE.SphereGeometry(0.09, 8, 6), bone, mat(0.19, -0.05, -0.14, 0, 0, 0));
    add(hp, new THREE.BoxGeometry(0.3, 0.1, 0.2), bone, mat(0, -0.28, -0.09, -0.12, 0, 0));  // mâchoire
    for (let t = 0; t < 5; t++) {
      add(hp, new THREE.ConeGeometry(0.017, 0.07, 4), bone, mat(-0.11 + t * 0.055, -0.23, -0.16, Math.PI, 0, 0));
      add(hp, new THREE.ConeGeometry(0.015, 0.06, 4), bone, mat(-0.1 + t * 0.05, -0.31, -0.17, 0, 0, 0));
    }
    for (let t = -2; t <= 2; t++) {
      add(hp, new THREE.ConeGeometry(0.026, 0.17 - Math.abs(t) * 0.03, 5), bone,
        mat(t * 0.085, 0.28, 0.06, 0.5, 0, -t * 0.3));
    }
    const headMesh = new THREE.Mesh(hp.build(), bodyMat);
    head.add(headMesh);

    // orbites noires + yeux incandescents
    const eyePart = new Part();
    add(eyePart, new THREE.SphereGeometry(0.085, 8, 8), 0x050304, mat(-0.11, 0.03, -0.19, 0, 0, 0, 1, 1.25, 0.7));
    add(eyePart, new THREE.SphereGeometry(0.085, 8, 8), 0x050304, mat(0.11, 0.03, -0.19, 0, 0, 0, 1, 1.25, 0.7));
    const eyesBlack = new THREE.Mesh(eyePart.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1 }));
    head.add(eyesBlack);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
    eyeL.position.set(-0.11, 0.03, -0.235);
    head.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
    eyeR.position.set(0.11, 0.03, -0.235);
    head.add(eyeR);

    // mèches / tentacules
    const tendrils = new THREE.Group();
    head.add(tendrils);
    const tp = new Part();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const len = 0.35 + LH.hash2(i, 3, 11) * 0.55;
      add(tp, new THREE.ConeGeometry(0.028, len, 5), cloth,
        mat(Math.sin(a) * 0.2, 0.24, Math.cos(a) * 0.2, Math.PI + 0.2, a, 0));
    }
    tendrils.add(new THREE.Mesh(tp.build(), bodyMat));

    // ---- bras articulés (épaule -> coude -> main griffue)
    const buildArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.44, 2.22, 0);
      group.add(shoulder);
      const up = new Part();
      add(up, new THREE.SphereGeometry(0.12, 8, 7), flesh, mat(0, 0, 0));
      add(up, new THREE.CylinderGeometry(0.085, 0.062, 0.78, 7), flesh, mat(0, -0.4, 0), 0.06);
      shoulder.add(new THREE.Mesh(up.build(), bodyMat));

      const elbow = new THREE.Group();
      elbow.position.set(0, -0.8, 0);
      shoulder.add(elbow);
      const lo = new Part();
      add(lo, new THREE.SphereGeometry(0.075, 7, 6), flesh, mat(0, 0, 0));
      add(lo, new THREE.CylinderGeometry(0.06, 0.04, 0.72, 7), flesh, mat(0, -0.36, 0), 0.06);
      add(lo, new THREE.SphereGeometry(0.07, 8, 7), bone, mat(0, -0.74, 0.01, 0, 0, 0, 1, 0.7, 1.2));
      for (let f = -1; f <= 1; f++) {
        const tilt = f * 0.3;
        add(lo, new THREE.CylinderGeometry(0.022, 0.016, 0.26, 5), bone,
          mat(f * 0.055, -0.9, 0, 0.35, 0, tilt));
        add(lo, new THREE.ConeGeometry(0.02, 0.24, 4), bone,
          mat(f * 0.1, -1.08, -0.09, 1.25, 0, tilt));
      }
      elbow.add(new THREE.Mesh(lo.build(), bodyMat));
      return { shoulder, elbow };
    };
    const armL = buildArm(-1);
    const armR = buildArm(1);

    // ---- lueurs
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.world.glowTex, color: S.eye, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    eyeGlow.scale.set(1.4, 1.4, 1);
    eyeGlow.position.set(0, 2.95, 0);
    group.add(eyeGlow);

    const groundGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 24),
      new THREE.MeshBasicMaterial({
        map: this.world.glowTex, color: S.eye, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    groundGlow.rotation.x = -Math.PI / 2;
    groundGlow.position.y = 0.06;
    group.add(groundGlow);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    group.add(shadow);

    group.scale.setScalar(scale);

    // références utilisées par l'animation
    this.group = group;
    this.bodyMat = bodyMat;
    this.clothMat = bodyMat;
    this.headMat = bodyMat;
    this.eyeMat = eyeMat;
    this.eyesBlack = eyesBlack;
    this.eyeGlow = eyeGlow;
    this.groundGlow = groundGlow;
    this.aura = null;
    this.armL = armL.shoulder;
    this.elbowL = armL.elbow;
    this.armR = armR.shoulder;
    this.elbowR = armR.elbow;
    this.head = head;
    this.torso = bodyMesh;
    this.tendrils = tendrils;
    this.veil = tendrils;
  };

  // ------------------------------------------------------------- relique
  LH.World.prototype.addRelic = function (cellIndex, tint) {
    const cx = cellIndex % this.maze.cols, cy = (cellIndex / this.maze.cols) | 0;
    const p = this.cellCenter(cx, cy);
    const color = tint || 0xb388ff;
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);

    const stone = new THREE.MeshLambertMaterial({ color: 0x3b3630 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.52, 0.36, 8), stone);
    base.position.y = 0.18;
    group.add(base);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 8), stone);
    cap.position.y = 0.46;
    group.add(cap);
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.02, 4, 24), new THREE.MeshBasicMaterial({ color }));
    rune.rotation.x = Math.PI / 2;
    rune.position.y = 0.56;
    group.add(rune);

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.9 })
    );
    crystal.scale.set(0.8, 1.6, 0.8);
    crystal.position.y = 1.15;
    group.add(crystal);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.set(2.6, 2.6, 1);
    halo.position.y = 1.15;
    group.add(halo);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.03, 6, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.7;
    group.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.4, 2.4, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      })
    );
    beam.position.y = 2.2;
    group.add(beam);

    this.levelGroup.add(group);
    const relic = {
      group, orb: crystal, halo, ring, beam, cell: cellIndex, collected: false,
      phase: Math.random() * 6.28, x: p.x, z: p.z, color
    };
    this.relics.push(relic);
    return relic;
  };
})();
