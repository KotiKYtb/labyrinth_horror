/* LABYRINTHE — utilitaires */
(function () {
  'use strict';
  const LH = (window.LH = window.LH || {});

  LH.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  LH.lerp = (a, b, t) => a + (b - a) * t;
  LH.smoothstep = (a, b, x) => {
    const t = LH.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  LH.moveTowards = (cur, target, delta) => {
    if (cur < target) return Math.min(cur + delta, target);
    return Math.max(cur - delta, target);
  };
  LH.damp = (cur, target, lambda, dt) => LH.lerp(cur, target, 1 - Math.exp(-lambda * dt));
  LH.rand = (a, b) => a + Math.random() * (b - a);
  LH.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  LH.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  LH.dist2 = (x0, z0, x1, z1) => {
    const dx = x1 - x0, dz = z1 - z0;
    return Math.sqrt(dx * dx + dz * dz);
  };
  LH.angleTo = (fromX, fromZ, toX, toZ) => Math.atan2(toX - fromX, -(toZ - fromZ));

  // PRNG déterministe (mulberry32)
  LH.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  LH.hash2 = function (x, y, seed) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  LH.fmtTime = function (seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };

  LH.el = (id) => document.getElementById(id);

  LH.hexToRgb = function (hex) {
    return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
  };
  LH.rgbToHex = (r, g, b) =>
    (LH.clamp(Math.round(r), 0, 255) << 16) | (LH.clamp(Math.round(g), 0, 255) << 8) | LH.clamp(Math.round(b), 0, 255);

  LH.shade = function (hex, amount) {
    const c = LH.hexToRgb(hex);
    const f = amount >= 0 ? 1 : 0;
    const a = Math.abs(amount);
    return LH.rgbToHex(
      c.r + (f * 255 - c.r) * a,
      c.g + (f * 255 - c.g) * a,
      c.b + (f * 255 - c.b) * a
    );
  };

  LH.tint = function (hex, tintHex, amount) {
    const a = LH.hexToRgb(hex), b = LH.hexToRgb(tintHex);
    return LH.rgbToHex(
      a.r + (b.r - a.r) * amount,
      a.g + (b.g - a.g) * amount,
      a.b + (b.b - a.b) * amount
    );
  };

  LH.debounce = function (fn, wait) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  // Petit son de confirmation, permet de débloquer l'audio au premier clic
  LH.now = () => performance.now() / 1000;
})();
