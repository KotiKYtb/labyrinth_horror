/* LABYRINTHE — moteur audio procédural (WebAudio) */
(function () {
  'use strict';
  const LH = window.LH;

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.ready = false;
      this.volume = 0.75;
      this.muted = false;
      this.ambient = null;
      this.noiseBuf = null;
      this.shaper = null;
      this.tensionValue = 0;
      this.reverb = null;
    }

    init() {
      if (this.ready) { this.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ctx = new AC();
        this.ctx = ctx;

        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;

        this.limiter = ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -10;
        this.limiter.knee.value = 8;
        this.limiter.ratio.value = 12;
        this.limiter.attack.value = 0.003;
        this.limiter.release.value = 0.25;

        this.master.connect(this.limiter);
        this.limiter.connect(ctx.destination);

        this.sfx = ctx.createGain();
        this.sfx.gain.value = 0.9;
        this.sfx.connect(this.master);

        this.music = ctx.createGain();
        this.music.gain.value = 0.7;
        this.music.connect(this.master);

        // Réverbération artisanale
        this.reverb = ctx.createConvolver();
        const irLen = Math.floor(ctx.sampleRate * 2.6);
        const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = ir.getChannelData(ch);
          for (let i = 0; i < irLen; i++) {
            const t = i / irLen;
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.1) * 0.7;
          }
        }
        this.reverb.buffer = ir;
        this.reverbSend = ctx.createGain();
        this.reverbSend.gain.value = 0.42;
        this.reverbSend.connect(this.reverb);
        this.reverb.connect(this.master);

        // Bruit blanc
        const nLen = Math.floor(ctx.sampleRate * 2);
        const nb = ctx.createBuffer(1, nLen, ctx.sampleRate);
        const nd = nb.getChannelData(0);
        for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
        this.noiseBuf = nb;

        // Distorsion
        const curve = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
          const x = (i * 2) / 1024 - 1;
          curve[i] = ((3 + 18) * x * 20 * Math.PI / 180) / (Math.PI + 18 * Math.abs(x));
        }
        this.shaper = ctx.createWaveShaper();
        this.shaper.curve = curve;
        this.shaper.oversample = '2x';

        this.ready = true;
      } catch (e) {
        console.warn('Audio indisponible', e);
      }
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }
    suspend() {
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    }

    setVolume(v) {
      this.volume = LH.clamp(v, 0, 1);
      if (this.master) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
      }
    }
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }

    _panner(pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = LH.clamp(pan || 0, -1, 1);
      return p;
    }

    _noiseSource(rate) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = rate || 1;
      return src;
    }

    _send(node, amount) {
      const g = this.ctx.createGain();
      g.gain.value = amount;
      node.connect(g);
      g.connect(this.reverb);
      return g;
    }

    // ------------------------------------------------------------------ AMBIANCE
    startAmbience(cfg) {
      if (!this.ready) return;
      this.stopAmbience(0.1);
      const ctx = this.ctx;
      const now = ctx.currentTime;

      const bus = ctx.createGain();
      bus.gain.value = 0.0001;
      bus.connect(this.music);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cfg.filter || 400;
      lp.Q.value = 1.4;
      lp.connect(bus);

      const drones = [];
      const base = cfg.drone || 45;
      const ratios = [1, 1.498, 0.502, 2.01];
      const gains = [0.16, 0.08, 0.11, 0.025];
      for (let i = 0; i < ratios.length; i++) {
        const o = ctx.createOscillator();
        o.type = i === 3 ? 'triangle' : 'sawtooth';
        o.frequency.value = base * ratios[i];
        o.detune.value = (Math.random() * 2 - 1) * 14;
        const g = ctx.createGain();
        g.gain.value = gains[i];
        o.connect(g); g.connect(lp);
        o.start(now);
        drones.push(o);
      }

      // Souffle / vent
      const wind = this._noiseSource(0.65);
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 380;
      windFilter.Q.value = 0.6;
      const windGain = ctx.createGain();
      windGain.gain.value = cfg.wind || 0.06;
      wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(bus);
      wind.start(now);

      // LFO très lente sur le filtre
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.045;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 90;
      lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
      lfo.start(now);

      // LFO sur le volume du vent
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.11;
      const lfo2g = ctx.createGain();
      lfo2g.gain.value = (cfg.wind || 0.06) * 0.6;
      lfo2.connect(lfo2g); lfo2g.connect(windGain.gain);
      lfo2.start(now);

      bus.gain.setTargetAtTime(0.26, now, 2.2);

      this.ambient = { bus, lp, drones, wind, windGain, lfo, lfo2, filterBase: cfg.filter || 400 };
    }

    stopAmbience(fade) {
      if (!this.ambient || !this.ctx) return;
      const a = this.ambient;
      this.ambient = null;
      const now = this.ctx.currentTime;
      const f = fade == null ? 1.6 : fade;
      try {
        a.bus.gain.cancelScheduledValues(now);
        a.bus.gain.setTargetAtTime(0.0001, now, f / 3);
        setTimeout(() => {
          try {
            a.drones.forEach((o) => o.stop());
            a.wind.stop();
            a.lfo.stop(); a.lfo2.stop();
            a.bus.disconnect();
          } catch (e) { /* déjà arrêté */ }
        }, f * 1000 + 220);
      } catch (e) { /* noop */ }
    }

    setTension(t) {
      this.tensionValue = LH.clamp(t, 0, 1);
      if (!this.ambient) return;
      const now = this.ctx.currentTime;
      const a = this.ambient;
      a.lp.frequency.setTargetAtTime(a.filterBase + this.tensionValue * 320, now, 0.4);
      a.bus.gain.setTargetAtTime(0.26 + this.tensionValue * 0.13, now, 0.5);
    }

    // ------------------------------------------------------------------ PAS
    footstep(intensity, pan) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const vol = LH.clamp(intensity, 0.05, 1.4);
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      const p = this._panner(pan || 0);
      const bp = ctx.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.value = 480 + Math.random() * 500;
      bp.Q.value = 0.7;
      const src = this._noiseSource(0.8 + Math.random() * 0.4);
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(bp); bp.connect(g); g.connect(out);
      out.connect(p); p.connect(this.sfx);
      this._send(p, 0.06);

      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(0.11 * vol, now + 0.006);
      out.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      g.gain.setValueAtTime(0.5 + Math.random() * 0.3, now);
      src.start(now); src.stop(now + 0.2);

      // impact sourd
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(92, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.11);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, now);
      og.gain.exponentialRampToValueAtTime(0.05 * vol, now + 0.008);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      osc.connect(og); og.connect(p);
      osc.start(now); osc.stop(now + 0.15);
    }

    creak(pan) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const base = 80 + Math.random() * 120;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.linearRampToValueAtTime(base * (0.6 + Math.random() * 0.9), now + 0.9);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.035, now + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
      const p = this._panner(pan || 0);
      osc.connect(bp); bp.connect(g); g.connect(p); p.connect(this.sfx);
      this._send(p, 0.4);
      osc.start(now); osc.stop(now + 1.05);
    }

    // ------------------------------------------------------------------ CŒUR
    heartbeat(intensity) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const vol = LH.clamp(intensity, 0, 1);
      const p = this._panner(0);
      p.connect(this.sfx);
      const thump = (delay, amp, freq) => {
        const t = now + delay;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.16);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(amp, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(g); g.connect(p);
        osc.start(t); osc.stop(t + 0.25);
      };
      thump(0, 0.16 * vol, 62);
      thump(0.18, 0.1 * vol, 55);
    }

    // ------------------------------------------------------------------ CRIS
    scream(pan, distance, opts) {
      if (!this.ready) return;
      opts = opts || {};
      const ctx = this.ctx, now = ctx.currentTime;
      const d = distance == null ? 8 : distance;
      const vol = LH.clamp(opts.gain != null ? opts.gain : 1.05 - d / 26, 0.08, 1.1);
      const dur = opts.dur || (1.0 + Math.random() * 0.55);
      const p = this._panner(pan);
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      const shaper = this.shaper;
      const tone = ctx.createBiquadFilter();
      tone.type = 'bandpass';
      tone.frequency.value = 900;
      tone.Q.value = 1.1;

      out.connect(p); p.connect(this.sfx);
      this._send(p, opts.reverb != null ? opts.reverb : 0.5);

      shaper.connect(tone); tone.connect(out);

      const cluster = ctx.createGain();
      cluster.gain.value = 0.8;
      cluster.connect(shaper);

      const base = opts.base || (430 + Math.random() * 320);
      [1, 1.47, 2.11].forEach((mult, i) => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'sawtooth' : 'square';
        o.frequency.setValueAtTime(base * mult, now);
        o.frequency.exponentialRampToValueAtTime(base * mult * 0.32, now + dur);
        o.detune.value = (Math.random() * 2 - 1) * 40;
        const g = ctx.createGain();
        g.gain.value = [0.16, 0.09, 0.04][i];
        o.connect(g); g.connect(cluster);
        // vibrato
        const vib = ctx.createOscillator();
        vib.frequency.value = 12 + Math.random() * 12;
        const vg = ctx.createGain();
        vg.gain.value = 30;
        vib.connect(vg); vg.connect(o.detune);
        vib.start(now); vib.stop(now + dur + 0.1);
        o.start(now); o.stop(now + dur + 0.1);
      });

      // souffle vocal
      const src = this._noiseSource(1 + Math.random() * 0.5);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1500, now);
      bp.frequency.exponentialRampToValueAtTime(500, now + dur);
      bp.Q.value = 2.4;
      const ng = ctx.createGain();
      ng.gain.value = 0.35;
      src.connect(bp); bp.connect(ng); ng.connect(shaper);
      src.start(now); src.stop(now + dur + 0.1);

      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(0.3 * vol, now + 0.06);
      out.gain.setValueAtTime(0.3 * vol, now + dur * 0.45);
      out.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    }

    ambientScream(pan, distance) {
      this.scream(pan, distance + 4, { gain: 0.5, dur: 1.3 + Math.random() * 0.7, reverb: 0.85, base: 300 + Math.random() * 260 });
    }

    growl(pan, distance) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const vol = LH.clamp(1 - distance / 22, 0.06, 0.8);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70 + Math.random() * 30, now);
      o.frequency.exponentialRampToValueAtTime(42, now + 1.2);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12 * vol, now + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
      const p = this._panner(pan);
      o.connect(lp); lp.connect(g); g.connect(p); p.connect(this.sfx);
      this._send(p, 0.5);
      o.start(now); o.stop(now + 1.4);
    }

    whisper(pan) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const src = this._noiseSource(1.1);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 3.2;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      const trem = ctx.createOscillator();
      trem.frequency.value = 6 + Math.random() * 5;
      const tg = ctx.createGain();
      tg.gain.value = 0.02;
      trem.connect(tg); tg.connect(g.gain);
      const p = this._panner(pan);
      src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(p); p.connect(this.sfx);
      this._send(p, 0.7);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.045, now + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.3);
      src.start(now); src.stop(now + 2.4);
      trem.start(now); trem.stop(now + 2.4);
    }

    // ------------------------------------------------------------------ ÉVÉNEMENTS
    sting() {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      out.connect(this.sfx);
      out.connect(this.master);

      // cluster strident
      [220, 233, 311, 466].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * (1 + i * 0.5), now);
        o.frequency.exponentialRampToValueAtTime(f * 0.55, now + 0.9);
        const g = ctx.createGain();
        g.gain.value = 0.12;
        o.connect(g); g.connect(out);
        o.start(now); o.stop(now + 1.0);
      });
      // bruit blanc agressif
      const src = this._noiseSource(1.4);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 900;
      const ng = ctx.createGain();
      ng.gain.value = 0.5;
      src.connect(hp); hp.connect(ng); ng.connect(out);
      src.start(now); src.stop(now + 1.1);

      // sub
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(80, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 1.3);
      const sg = ctx.createGain();
      sg.gain.value = 0.5;
      sub.connect(sg); sg.connect(out);
      sub.start(now); sub.stop(now + 1.35);

      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(0.55, now + 0.02);
      out.gain.exponentialRampToValueAtTime(0.28, now + 0.5);
      out.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
    }

    resonance(pan, strength) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const vol = LH.clamp(strength == null ? 0.5 : strength, 0.05, 1);
      const p = this._panner(pan || 0);
      p.connect(this.sfx);
      this._send(p, 0.65);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(760 + Math.random() * 60, now);
      o.frequency.exponentialRampToValueAtTime(1180, now + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.05 * vol, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      o.connect(g); g.connect(p);
      o.start(now); o.stop(now + 1.55);
    }

    // ------------------------------------------------------- pas par matière
    footstepSurface(kind, intensity, pan) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const vol = LH.clamp(intensity, 0.05, 1.5);
      const p = this._panner(pan || 0);
      p.connect(this.sfx);
      this._send(p, 0.08);

      const burst = (dur, freq, q, amp, type, rate) => {
        const src = this._noiseSource(rate || (0.8 + Math.random() * 0.5));
        const f = ctx.createBiquadFilter();
        f.type = type || 'bandpass';
        f.frequency.value = freq;
        f.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(amp * vol, now + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        src.connect(f); f.connect(g); g.connect(p);
        src.start(now); src.stop(now + dur + 0.05);
        return f;
      };
      const thump = (freq, amp, dur) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, now);
        o.frequency.exponentialRampToValueAtTime(freq * 0.55, now + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(amp * vol, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.02);
        o.connect(g); g.connect(p);
        o.start(now); o.stop(now + dur + 0.05);
      };

      switch (kind) {
        case 'grass':
          burst(0.16, 2600, 0.7, 0.11, 'highpass', 1.3);
          burst(0.1, 4200, 1.2, 0.05, 'highpass');
          thump(70, 0.02, 0.09);
          break;
        case 'leaves':
          // froissement sec : crépitements
          for (let i = 0; i < 4; i++) {
            setTimeout(() => this._crack(0.05, 2200 + Math.random() * 2200, 0.06 * vol, pan), i * 22);
          }
          burst(0.2, 3200, 0.9, 0.08, 'highpass', 1.2);
          break;
        case 'twig':
          this._crack(0.045, 1800 + Math.random() * 1600, 0.16 * vol, pan);
          burst(0.03, 5200, 1.5, 0.1, 'highpass');
          thump(120, 0.03, 0.06);
          break;
        case 'dirt':
          burst(0.12, 520, 0.7, 0.07, 'lowpass');
          burst(0.07, 1800, 1.0, 0.03, 'bandpass');
          thump(80, 0.035, 0.11);
          break;
        case 'tile':
          burst(0.09, 1600, 1.6, 0.09, 'bandpass');
          burst(0.05, 3600, 1.0, 0.05, 'highpass');
          thump(110, 0.03, 0.07);
          break;
        case 'water':
          {
            const f = burst(0.24, 900, 1.2, 0.09, 'bandpass', 0.7);
            f.frequency.setValueAtTime(1400, now);
            f.frequency.exponentialRampToValueAtTime(420, now + 0.24);
            for (let i = 0; i < 2; i++) this._crack(0.03, 900 + Math.random() * 700, 0.04 * vol, pan);
          }
          break;
        case 'flesh':
          {
            const f = burst(0.3, 300, 1.8, 0.1, 'bandpass', 0.6);
            f.frequency.setValueAtTime(420, now);
            f.frequency.exponentialRampToValueAtTime(180, now + 0.3);
            thump(60, 0.04, 0.16);
          }
          break;
        default: // pierre / roche
          burst(0.12, 700, 0.8, 0.08, 'lowpass');
          thump(90, 0.045, 0.12);
      }
    }

    _crack(dur, freq, amp, pan) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const src = this._noiseSource(1.6 + Math.random() * 0.8);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(amp, now + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      const p = this._panner(pan || 0);
      src.connect(bp); bp.connect(g); g.connect(p); p.connect(this.sfx);
      src.start(now); src.stop(now + dur + 0.04);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq * 0.9, now);
      o.frequency.exponentialRampToValueAtTime(freq * 0.5, now + dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, now);
      og.gain.exponentialRampToValueAtTime(amp * 0.5, now + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(og); og.connect(p);
      o.start(now); o.stop(now + dur + 0.04);
    }

    deathSting() {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.value = 0.0001;
      out.connect(this.sfx);
      out.connect(this.master);

      // shaper saturé
      const sh = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i * 2) / 1024 - 1;
        curve[i] = Math.tanh(x * 6) * 0.9;
      }
      sh.curve = curve;
      sh.connect(out);

      // shriek : cluster suraigu descendant + FM
      [780, 1170, 1560, 2340, 3120].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i % 2 ? 'square' : 'sawtooth';
        o.frequency.setValueAtTime(f, now);
        o.frequency.exponentialRampToValueAtTime(f * 0.42, now + 1.5);
        const g = ctx.createGain();
        g.gain.value = 0.1 / (1 + i * 0.3);
        const fm = ctx.createOscillator();
        fm.frequency.value = 40 + i * 13;
        const fmg = ctx.createGain();
        fmg.gain.value = 260;
        fm.connect(fmg); fmg.connect(o.frequency);
        fm.start(now); fm.stop(now + 1.7);
        o.connect(g); g.connect(sh);
        o.start(now); o.stop(now + 1.7);
      });

      // sifflement strident
      const whine = ctx.createOscillator();
      whine.type = 'sine';
      whine.frequency.setValueAtTime(2600, now);
      whine.frequency.exponentialRampToValueAtTime(4400, now + 0.3);
      whine.frequency.exponentialRampToValueAtTime(1200, now + 1.6);
      const wg = ctx.createGain();
      wg.gain.setValueAtTime(0.0001, now);
      wg.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
      wg.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
      whine.connect(wg); wg.connect(out);
      whine.start(now); whine.stop(now + 1.75);

      // souffle hurlé
      const src = this._noiseSource(1.7);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 700;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      src.connect(hp); hp.connect(ng); ng.connect(out);
      src.start(now); src.stop(now + 1.6);

      // sub cosmique
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(90, now);
      sub.frequency.exponentialRampToValueAtTime(24, now + 1.8);
      const sg = ctx.createGain();
      sg.gain.value = 0.55;
      sub.connect(sg); sg.connect(out);
      sub.start(now); sub.stop(now + 1.9);

      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(0.62, now + 0.015);
      out.gain.setValueAtTime(0.62, now + 0.5);
      out.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);
    }

    matchStrike() {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      // frottement
      const src = this._noiseSource(1.4);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, now);
      bp.frequency.exponentialRampToValueAtTime(3200, now + 0.16);
      bp.Q.value = 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      src.connect(bp); bp.connect(g); g.connect(this.sfx);
      src.start(now); src.stop(now + 0.28);
      // embrasement
      const f = this._noiseSource(0.9);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, now + 0.16);
      lp.frequency.exponentialRampToValueAtTime(2400, now + 0.34);
      const fg = ctx.createGain();
      fg.gain.setValueAtTime(0.0001, now + 0.16);
      fg.gain.exponentialRampToValueAtTime(0.1, now + 0.2);
      fg.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
      f.connect(lp); lp.connect(fg); fg.connect(this.sfx);
      this._send(fg, 0.4);
      f.start(now); f.stop(now + 0.8);
      // petite note de récompense
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(520, now + 0.1);
      o.frequency.exponentialRampToValueAtTime(880, now + 0.4);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, now + 0.1);
      og.gain.exponentialRampToValueAtTime(0.05, now + 0.14);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      o.connect(og); og.connect(this.sfx);
      o.start(now + 0.1); o.stop(now + 0.75);
    }

    lampFizzle() {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const src = this._noiseSource(1.2);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 1200 + i * 200;
        const g = ctx.createGain();
        const t = now + i * 0.07;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09 - i * 0.012, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        src.connect(hp); hp.connect(g); g.connect(this.sfx);
        src.start(t); src.stop(t + 0.12);
      }
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220, now);
      o.frequency.exponentialRampToValueAtTime(38, now + 1.1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 500;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, now);
      og.gain.exponentialRampToValueAtTime(0.1, now + 0.08);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      o.connect(lp); lp.connect(og); og.connect(this.sfx);
      o.start(now); o.stop(now + 1.25);
    }

    pickup() {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const notes = [392, 523.25, 659.25];
      notes.forEach((f, i) => {
        const t = now + i * 0.1;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        const p = this._panner(0);
        o.connect(g); g.connect(p); p.connect(this.sfx);
        this._send(p, 0.5);
        o.start(t); o.stop(t + 0.95);
      });
      const src = this._noiseSource(1.6);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 4;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.06, now + 0.03);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      src.connect(bp); bp.connect(ng); ng.connect(this.sfx);
      src.start(now); src.stop(now + 0.65);
    }

    unlock() {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(55, now);
      o.frequency.exponentialRampToValueAtTime(165, now + 1.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
      const p = this._panner(0);
      o.connect(lp); lp.connect(g); g.connect(p); p.connect(this.sfx);
      this._send(p, 0.7);
      o.start(now); o.stop(now + 1.75);
      const src = this._noiseSource(0.8);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.05, now + 0.4);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      src.connect(bp); bp.connect(ng); ng.connect(this.sfx);
      src.start(now); src.stop(now + 1.7);
    }

    blackout() {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        const t = now + i * 0.07;
        const src = this._noiseSource(1);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 1400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        src.connect(hp); hp.connect(g); g.connect(this.sfx);
        src.start(t); src.stop(t + 0.1);
      }
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, now);
      o.frequency.exponentialRampToValueAtTime(40, now + 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      o.connect(g); g.connect(this.sfx);
      o.start(now); o.stop(now + 0.95);
    }

    death() {
      if (!this.ready) return;
      this.sting();
      const ctx = this.ctx, now = ctx.currentTime + 0.15;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, now);
      o.frequency.exponentialRampToValueAtTime(22, now + 2.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.3, now + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
      o.connect(lp); lp.connect(g); g.connect(this.sfx);
      o.start(now); o.stop(now + 2.7);
    }

    click() {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(600, now);
      o.frequency.exponentialRampToValueAtTime(300, now + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.035, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      o.connect(g); g.connect(this.sfx);
      o.start(now); o.stop(now + 0.09);
    }

    win() {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const notes = [261.63, 329.63, 392, 523.25];
      notes.forEach((f, i) => {
        const t = now + i * 0.16;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.11, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        const p = this._panner(0);
        o.connect(g); g.connect(p); p.connect(this.sfx);
        this._send(p, 0.8);
        o.start(t); o.stop(t + 1.7);
      });
    }
  }

  LH.AudioEngine = AudioEngine;
})();
