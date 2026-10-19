/* LABYRINTHE — jump scares, grain, indicateurs directionnels */
(function () {
  'use strict';
  const LH = window.LH;

  function makeNoiseTile() {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const img = g.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const v = Math.random() * 255;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = Math.random() * 60;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  // --------------------------------------------------------------- visages
  function drawFace(themeName, seed) {
    const size = 1000;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const rng = LH.mulberry32(seed);
    const cx = size / 2, cy = size * 0.48;

    const palettes = {
      cave: { skinA: '#c8bda6', skinB: '#7d7261', skinC: '#3f392f', blood: '#5d1612', eye: '#f4ead7' },
      asylum: { skinA: '#d8dbd0', skinB: '#8e998e', skinC: '#454d46', blood: '#4a1a18', eye: '#f2f5ee' },
      chapel: { skinA: '#cfc5c6', skinB: '#8a7a84', skinC: '#453b46', blood: '#55151e', eye: '#f7eede' },
      flesh: { skinA: '#d6a291', skinB: '#9c5a4c', skinC: '#4a1c18', blood: '#7d0e0e', eye: '#ffe8d6' },
      abyss: { skinA: '#c3cfda', skinB: '#7d8b9d', skinC: '#303946', blood: '#35133d', eye: '#e8f4ff' },
      death: { skinA: '#efe6d4', skinB: '#94897a', skinC: '#2b241d', blood: '#8c0a0a', eye: '#ffffff' }
    };
    const pal = palettes[themeName] || palettes.cave;

    // fond
    g.fillStyle = '#020202';
    g.fillRect(0, 0, size, size);
    const bg = g.createRadialGradient(cx, cy, 30, cx, cy, size * 0.7);
    bg.addColorStop(0, 'rgba(58,18,14,0.55)');
    bg.addColorStop(0.5, 'rgba(20,8,7,0.5)');
    bg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);

    // fumée
    for (let i = 0; i < 26; i++) {
      const x = rng() * size, y = rng() * size;
      const r = 80 + rng() * 240;
      const smoke = g.createRadialGradient(x, y, 0, x, y, r);
      smoke.addColorStop(0, 'rgba(62,22,18,0.09)');
      smoke.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = smoke;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // crâne / visage
    const headW = 250 + (themeName === 'abyss' ? 10 : 0);
    const headH = 345 + (themeName === 'flesh' ? 15 : 0);
    const phase = rng() * 10;
    g.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const jag = 1 + 0.035 * Math.sin(a * 7 + phase) + 0.022 * Math.sin(a * 13 + phase * 2.4);
      let x = cx + Math.sin(a) * headW * jag;
      let y = cy + Math.cos(a) * headH * jag;
      const down = Math.cos(a);
      if (down > 0) {
        x = cx + (x - cx) * (1 - 0.34 * down);
        y = cy + (y - cy) * (1 + 0.02 * down);
      }
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    const skinGrad = g.createLinearGradient(0, cy - headH, 0, cy + headH);
    skinGrad.addColorStop(0, pal.skinA);
    skinGrad.addColorStop(0.45, pal.skinB);
    skinGrad.addColorStop(0.8, pal.skinC);
    skinGrad.addColorStop(1, '#241f1b');
    g.fillStyle = skinGrad;
    g.fill();

    g.save();
    g.clip();
    // ombres latérales
    const side = g.createLinearGradient(cx - headW, 0, cx + headW, 0);
    side.addColorStop(0, 'rgba(0,0,0,0.55)');
    side.addColorStop(0.3, 'rgba(0,0,0,0.05)');
    side.addColorStop(0.55, 'rgba(255,255,255,0.06)');
    side.addColorStop(0.8, 'rgba(0,0,0,0.3)');
    side.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = side;
    g.fillRect(cx - headW, cy - headH, headW * 2, headH * 2);

    // joues creusées
    for (const sx of [-1, 1]) {
      const gx = cx + sx * 150, gy = cy + 130;
      const rr = g.createRadialGradient(gx, gy, 10, gx, gy, 130);
      rr.addColorStop(0, 'rgba(20,14,11,0.35)');
      rr.addColorStop(1, 'rgba(20,14,11,0)');
      g.fillStyle = rr;
      g.fillRect(gx - 140, gy - 140, 280, 280);
    }
    g.restore();

    // yeux
    const eyeY = cy - 85;
    const eyeX = cx - 112;
    const variants = {
      cave: { eyeW: 62, eyeH: 38, tilt: 0.1, mouthW: 165, mouthH: 120 },
      asylum: { eyeW: 55, eyeH: 42, tilt: -0.05, mouthW: 190, mouthH: 140 },
      chapel: { eyeW: 68, eyeH: 34, tilt: 0.18, mouthW: 150, mouthH: 165 },
      flesh: { eyeW: 60, eyeH: 46, tilt: 0.02, mouthW: 235, mouthH: 150 },
      abyss: { eyeW: 70, eyeH: 30, tilt: 0.22, mouthW: 140, mouthH: 185 },
      death: { eyeW: 84, eyeH: 30, tilt: 0.28, mouthW: 215, mouthH: 205 }
    };
    const v = variants[themeName] || variants.cave;

    for (const sx of [-1, 1]) {
      const ex = cx + sx * 112;
      // orbite sombre
      const socket = g.createRadialGradient(ex, eyeY, 8, ex, eyeY, 95);
      socket.addColorStop(0, 'rgba(5,3,3,0.98)');
      socket.addColorStop(0.55, 'rgba(12,7,6,0.9)');
      socket.addColorStop(1, 'rgba(20,12,10,0)');
      g.fillStyle = socket;
      g.beginPath();
      g.ellipse(ex, eyeY, 100, 78, sx * v.tilt, 0, Math.PI * 2);
      g.fill();

      g.save();
      g.translate(ex, eyeY);
      g.rotate(sx * v.tilt);
      g.beginPath();
      g.ellipse(0, 0, v.eyeW, v.eyeH, 0, 0, Math.PI * 2);
      g.fillStyle = '#050304';
      g.fill();
      // reflet vitreux
      g.beginPath();
      g.ellipse(-v.eyeW * 0.22, -v.eyeH * 0.25, 5.5, 4.5, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(240,236,220,0.85)';
      g.fill();
      // pupille
      g.beginPath();
      g.ellipse(2, 3, 3.5, 5, 0, 0, Math.PI * 2);
      g.fillStyle = '#000';
      g.fill();
      // veinures rouges
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        const a = rng() * Math.PI * 2;
        g.moveTo(Math.cos(a) * v.eyeW, Math.sin(a) * v.eyeH);
        g.quadraticCurveTo(
          Math.cos(a + 0.5) * (v.eyeW + 40), Math.sin(a + 0.5) * (v.eyeH + 25),
          Math.cos(a + 0.2) * (v.eyeW + 75), Math.sin(a + 0.2) * (v.eyeH + 50)
        );
        g.strokeStyle = 'rgba(74,14,12,0.5)';
        g.lineWidth = 1.6 + rng() * 1.8;
        g.stroke();
      }
      g.restore();

      // larmes noires
      if (rng() > 0.35) {
        g.beginPath();
        g.moveTo(ex - 8, eyeY + 25);
        g.bezierCurveTo(ex - 16, eyeY + 90, ex + 4, eyeY + 150, ex - 4, eyeY + 230);
        g.strokeStyle = 'rgba(10,5,5,0.6)';
        g.lineWidth = 4 + rng() * 5;
        g.stroke();
      }
    }

    // nez
    g.beginPath();
    g.moveTo(cx, cy - 20);
    g.quadraticCurveTo(cx - 14, cy + 45, cx - 30, cy + 95);
    g.quadraticCurveTo(cx, cy + 112, cx + 26, cy + 92);
    g.quadraticCurveTo(cx + 10, cy + 40, cx, cy - 20);
    g.closePath();
    const noseGrad = g.createLinearGradient(cx, cy, cx + 40, cy + 100);
    noseGrad.addColorStop(0, 'rgba(38,28,23,0.35)');
    noseGrad.addColorStop(1, 'rgba(8,5,4,0.8)');
    g.fillStyle = noseGrad;
    g.fill();

    // bouche béante
    const my = cy + 185;
    const mw = v.mouthW, mh = v.mouthH;
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const jag = 1 + 0.1 * Math.sin(a * 5 + phase) + 0.05 * Math.sin(a * 11 + phase * 3);
      const x = cx + Math.sin(a) * mw * jag;
      const y = my + Math.cos(a) * mh * jag;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    const mouthGrad = g.createRadialGradient(cx, my, 8, cx, my, mh * 1.2);
    mouthGrad.addColorStop(0, '#250505');
    mouthGrad.addColorStop(0.55, '#110204');
    mouthGrad.addColorStop(1, '#020101');
    g.fillStyle = mouthGrad;
    g.fill();

    // dents
    g.save();
    g.beginPath();
    g.ellipse(cx, my, mw * 0.92, mh * 0.9, 0, 0, Math.PI * 2);
    g.clip();
    const teethCount = 7 + ((rng() * 4) | 0);
    for (let i = 0; i < teethCount; i++) {
      const t = i / teethCount;
      const x = cx - mw * 0.85 + t * mw * 1.7 + (rng() - 0.5) * 8;
      const w = (mw * 1.7) / teethCount * (0.45 + rng() * 0.5);
      const h = 20 + rng() * 36;
      g.beginPath();
      g.moveTo(x, my - mh * 0.78);
      g.lineTo(x + w, my - mh * 0.78);
      g.lineTo(x + w * 0.5, my - mh * 0.78 + h);
      g.closePath();
      g.fillStyle = `rgba(${205 + rng() * 30},${195 + rng() * 25},${170 + rng() * 20},0.9)`;
      g.fill();
      // dents du bas
      const h2 = 18 + rng() * 30;
      g.beginPath();
      g.moveTo(x + w * 0.15, my + mh * 0.8);
      g.lineTo(x + w * 0.9, my + mh * 0.8);
      g.lineTo(x + w * 0.5, my + mh * 0.8 - h2);
      g.closePath();
      g.fillStyle = `rgba(${180 + rng() * 30},${168 + rng() * 25},${145 + rng() * 20},0.82)`;
      g.fill();
    }
    // sang dans la bouche
    g.fillStyle = 'rgba(86,6,6,0.45)';
    g.beginPath();
    g.ellipse(cx, my + mh * 0.35, mw * 0.7, mh * 0.28, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // coulures
    for (let i = 0; i < 4; i++) {
      const x = cx - mw * 0.6 + rng() * mw * 1.2;
      const len = 30 + rng() * 140;
      const drip = g.createLinearGradient(x, my, x, my + len);
      drip.addColorStop(0, 'rgba(74,6,6,0.75)');
      drip.addColorStop(1, 'rgba(40,3,3,0)');
      g.fillStyle = drip;
      g.fillRect(x, my + mh * 0.2, 3 + rng() * 7, len);
    }

    // fissures
    for (let i = 0; i < 10; i++) {
      let x = cx + (rng() - 0.5) * 380;
      let y = cy - 220 + rng() * 330;
      g.beginPath();
      g.moveTo(x, y);
      const segs = 2 + ((rng() * 4) | 0);
      for (let k = 0; k < segs; k++) {
        x += (rng() - 0.5) * 44;
        y += 18 + rng() * 42;
        g.lineTo(x, y);
      }
      g.strokeStyle = 'rgba(20,12,10,0.5)';
      g.lineWidth = 1 + rng() * 2;
      g.stroke();
    }

    // texture / grain
    for (let i = 0; i < 3800; i++) {
      const x = rng() * size, y = rng() * size;
      g.fillStyle = `rgba(${rng() > 0.5 ? 255 : 0},${rng() > 0.5 ? 255 : 0},${rng() > 0.5 ? 255 : 0},${rng() * 0.035})`;
      g.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
    }

    // vignette
    const vig = g.createRadialGradient(cx, cy, size * 0.25, cx, cy, size * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.7, 'rgba(0,0,0,0.35)');
    vig.addColorStop(1, 'rgba(0,0,0,0.96)');
    g.fillStyle = vig;
    g.fillRect(0, 0, size, size);

    return c.toDataURL('image/jpeg', 0.86);
  }

  class Scares {
    constructor() {
      this.active = false;
      this.events = [];
      this.faces = {};
      this.lastGrain = 0;
      this.canvas = null;
      this.ctx = null;
      this.dpr = 1;
      this.grainEl = null;
      this.timer = null;
    }

    init() {
      this.overlay = LH.el('scare');
      this.img = LH.el('scare-img');
      this.flashEl = LH.el('flash');
      this.grainEl = LH.el('grain');
      this.canvas = LH.el('fx');
      this.ctx = this.canvas.getContext('2d');
      this.grainEl.style.backgroundImage = `url(${makeNoiseTile()})`;

      const themes = ['cave', 'asylum', 'chapel', 'flesh', 'abyss'];
      themes.forEach((t, i) => {
        this.faces[t] = drawFace(t, 1000 + i * 77);
      });
      this.faces.death = drawFace('death', 4242);

      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      if (!this.canvas) return;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(window.innerWidth * this.dpr);
      this.canvas.height = Math.floor(window.innerHeight * this.dpr);
      this.canvas.style.width = window.innerWidth + 'px';
      this.canvas.style.height = window.innerHeight + 'px';
    }

    setGrain(enabled) {
      if (this.grainEl) this.grainEl.style.display = enabled ? 'block' : 'none';
    }

    trigger(themeName, opts) {
      opts = opts || {};
      if (this.active && !opts.force) return false;
      this.active = true;
      const kind = opts.kind === 'death' ? 'death' : 'light';
      const duration = opts.duration || (kind === 'death' ? 1900 : 430);
      const src = this.faces[themeName] || this.faces.cave;
      this.overlay.classList.remove('active', 'light', 'death');
      void this.overlay.offsetWidth;
      this.img.src = src;
      this.overlay.style.setProperty('--sr', ((Math.random() - 0.5) * (kind === 'death' ? 9 : 4)).toFixed(2) + 'deg');
      this.overlay.style.setProperty('--sx', Math.random() > 0.5 ? '-1' : '1');
      this.overlay.style.setProperty('--scare-dur', duration + 'ms');
      this.overlay.classList.add('active', kind);
      this.flash(kind === 'death' ? '#c30000' : (opts.flashColor || '#8d0d0d'), kind === 'death' ? 0.7 : 0.3, kind === 'death' ? 700 : 260);
      if (window.LH.game && window.LH.game.world && opts.shake) {
        window.LH.game.world.shake(opts.shake);
      }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.overlay.classList.remove('active', 'light', 'death');
        this.active = false;
      }, duration);
      return true;
    }

    triggerDeath(themeName) {
      return this.trigger('death', { kind: 'death', force: true, duration: 1900 });
    }

    flash(color, strength, duration) {
      if (!this.flashEl) return;
      this.flashEl.style.transition = 'none';
      this.flashEl.style.background = color;
      this.flashEl.style.opacity = String(strength);
      void this.flashEl.offsetWidth;
      this.flashEl.style.transition = `opacity ${duration}ms ease-out`;
      this.flashEl.style.opacity = '0';
    }

    addEvent(angle, label, type, opts) {
      opts = opts || {};
      const existing = this.events.find((e) => e.label === label && e.age < 0.5);
      if (existing) return;
      this.events.push({
        angle,
        label,
        type: type || 'scream',
        age: 0,
        ttl: opts.ttl || 2.6,
        strength: opts.strength != null ? opts.strength : 1,
        distance: opts.distance || 0
      });
      if (this.events.length > 8) this.events.shift();
    }

    clearEvents() {
      this.events.length = 0;
    }

    update(dt, playerScreen, compass) {
      if (!this.ctx) return;
      const w = window.innerWidth, h = window.innerHeight;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (let i = this.events.length - 1; i >= 0; i--) {
        this.events[i].age += dt;
        if (this.events[i].age > this.events[i].ttl) this.events.splice(i, 1);
      }

      const cx = playerScreen ? playerScreen.x : w / 2;
      const cy = playerScreen ? playerScreen.y : h / 2 + 20;
      const radius = Math.min(w, h) * 0.34;

      const hasAnything = this.events.length > 0 || (compass && compass.active);
      if (hasAnything) {
        ctx.save();
        ctx.strokeStyle = 'rgba(220,210,195,0.17)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 9]);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const colors = {
        scream: '#ff5a45',
        monster: '#ff3427',
        whisper: '#aab7ff',
        relic: '#c18cff',
        exit: '#8fe9c5',
        step: '#d8c9b0'
      };

      for (const e of this.events) {
        const progress = e.age / e.ttl;
        const fade = progress < 0.12 ? progress / 0.12 : 1 - (progress - 0.12) / 0.88;
        const col = colors[e.type] || colors.scream;
        const x = cx + Math.sin(e.angle) * radius;
        const y = cy - Math.cos(e.angle) * radius;
        ctx.save();
        ctx.globalAlpha = LH.clamp(fade, 0, 1) * 0.9;
        ctx.translate(x, y);
        ctx.rotate(e.angle);
        const s = 0.8 + (e.strength || 1) * 0.35;
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -9 * s);
        ctx.lineTo(6.5 * s, 3 * s);
        ctx.lineTo(0, 0.6 * s);
        ctx.lineTo(-6.5 * s, 3 * s);
        ctx.closePath();
        ctx.fill();
        ctx.rotate(-e.angle);
        ctx.globalAlpha = LH.clamp(fade, 0, 1) * 0.85;
        ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = e.angle > Math.PI / 2 && e.angle < (Math.PI * 3) / 2 ? 'top' : 'bottom';
        const labelY = (e.angle > Math.PI / 2 && e.angle < (Math.PI * 3) / 2) ? 14 : -14;
        ctx.fillStyle = col;
        ctx.fillText(e.label, 0, labelY);
        ctx.restore();
      }

      if (compass && compass.active) {
        const pulse = 0.6 + Math.sin((performance.now() / 1000) * 3) * 0.25;
        const x = cx + Math.sin(compass.angle) * radius;
        const y = cy - Math.cos(compass.angle) * radius;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.translate(x, y);
        ctx.rotate(compass.angle);
        ctx.fillStyle = '#8fe9c5';
        ctx.shadowColor = '#8fe9c5';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(7, 0);
        ctx.lineTo(0, 7);
        ctx.lineTo(-7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.rotate(-compass.angle);
        ctx.shadowBlur = 0;
        ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#c3ffe6';
        ctx.fillText('SORTIE ' + Math.round(compass.distance) + 'm', 0, -14);
        ctx.restore();
      }

      // grain animé
      if (this.grainEl && this.grainEl.style.display !== 'none') {
        this.lastGrain += dt;
        if (this.lastGrain > 0.075) {
          this.lastGrain = 0;
          this.grainEl.style.backgroundPosition =
            `${(Math.random() * 128) | 0}px ${(Math.random() * 128) | 0}px`;
        }
      }
    }
  }

  LH.Scares = Scares;
})();
