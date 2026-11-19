/* Techride — all sound is synthesised with the Web Audio API (no audio files). */
(function () {
  'use strict';
  const TR = window.TR;
  const { clamp } = TR.util;

  const A = (TR.audio = {
    ctx: null,
    ready: false,
    sfxVol: 0.8,
    musicVol: 0.45,
    _thrust: null,
    _music: null,
    _coinStep: 0,
    _coinAt: 0,
  });

  let master, sfxBus, musicBus, noiseBuf;

  // Browsers only allow sound after a click/keypress, so this is called from
  // the first input the player gives.
  A.unlock = function () {
    if (A.ready) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      A.ctx = new AC();
    } catch (e) {
      return;
    }
    const ctx = A.ctx;
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -14;
    master.knee.value = 18;
    master.ratio.value = 5;
    master.attack.value = 0.004;
    master.release.value = 0.2;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);

    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    A.ready = true;
    A.setVolumes(A.sfxVol, A.musicVol);
    buildThrust();
    startMusic();
  };

  A.setVolumes = function (sfx, music) {
    A.sfxVol = sfx;
    A.musicVol = music;
    if (!A.ready) return;
    const t = A.ctx.currentTime;
    sfxBus.gain.setTargetAtTime(sfx * 0.9, t, 0.03);
    musicBus.gain.setTargetAtTime(music * 0.5, t, 0.08);
  };

  A.suspend = function () {
    if (A.ready && A.ctx.state === 'running') A.ctx.suspend();
  };
  A.resume = function () {
    if (A.ready && A.ctx.state === 'suspended') A.ctx.resume();
  };

  /* ---------- building blocks ---------- */
  function tone(o) {
    const ctx = A.ctx;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
    const vol = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(o.bus || sfxBus);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
  }

  function noise(o) {
    const ctx = A.ctx;
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = o.type || 'bandpass';
    filt.Q.value = o.q || 1;
    filt.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) filt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
    const g = ctx.createGain();
    const vol = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(o.bus || sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.03);
  }

  /* ---------- sound effects ---------- */
  const COIN_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const SFX = {
    coin() {
      // quick pickups climb a scale, which makes a full row feel great
      const now = A.ctx.currentTime;
      if (now - A._coinAt > 0.45) A._coinStep = 0;
      A._coinAt = now;
      const semi = COIN_SCALE[Math.min(A._coinStep, COIN_SCALE.length - 1)];
      A._coinStep++;
      const f = 880 * Math.pow(2, semi / 12);
      tone({ type: 'triangle', f0: f, dur: 0.09, vol: 0.16 });
      tone({ type: 'sine', f0: f * 1.5, dur: 0.16, vol: 0.1, delay: 0.045 });
    },
    click() {
      tone({ type: 'triangle', f0: 620, f1: 880, dur: 0.06, vol: 0.14 });
    },
    back() {
      tone({ type: 'triangle', f0: 620, f1: 420, dur: 0.07, vol: 0.12 });
    },
    deny() {
      tone({ type: 'square', f0: 180, f1: 140, dur: 0.14, vol: 0.09 });
    },
    buy() {
      [0, 4, 7, 12].forEach((s, i) =>
        tone({ type: 'triangle', f0: 660 * Math.pow(2, s / 12), dur: 0.16, vol: 0.15, delay: i * 0.06 }));
    },
    start() {
      tone({ type: 'sawtooth', f0: 140, f1: 620, dur: 0.32, vol: 0.1 });
      noise({ f0: 500, f1: 4000, dur: 0.35, vol: 0.1, q: 0.8 });
    },
    land() {
      tone({ type: 'sine', f0: 150, f1: 60, dur: 0.1, vol: 0.2 });
      noise({ f0: 900, f1: 300, dur: 0.07, vol: 0.06, type: 'lowpass' });
    },
    hop() {
      tone({ type: 'triangle', f0: 300, f1: 560, dur: 0.1, vol: 0.14 });
    },
    bump() {
      tone({ type: 'sine', f0: 210, f1: 110, dur: 0.07, vol: 0.12 });
    },
    powerup() {
      [0, 4, 7, 12, 16].forEach((s, i) =>
        tone({ type: 'square', f0: 440 * Math.pow(2, s / 12), dur: 0.14, vol: 0.07, delay: i * 0.05 }));
      tone({ type: 'sine', f0: 220, f1: 880, dur: 0.4, vol: 0.12 });
    },
    powerdown() {
      tone({ type: 'triangle', f0: 660, f1: 220, dur: 0.3, vol: 0.12 });
    },
    shieldPop() {
      noise({ f0: 2400, f1: 500, dur: 0.3, vol: 0.2, q: 0.7 });
      tone({ type: 'sine', f0: 900, f1: 200, dur: 0.3, vol: 0.16 });
    },
    smash() {
      noise({ f0: 1400, f1: 200, dur: 0.28, vol: 0.26, type: 'lowpass' });
      tone({ type: 'square', f0: 220, f1: 55, dur: 0.22, vol: 0.12 });
    },
    warn() {
      tone({ type: 'square', f0: 880, dur: 0.07, vol: 0.07 });
    },
    lock() {
      tone({ type: 'square', f0: 1320, dur: 0.06, vol: 0.09 });
      tone({ type: 'square', f0: 1320, dur: 0.06, vol: 0.09, delay: 0.1 });
    },
    missile() {
      noise({ f0: 500, f1: 2600, dur: 0.5, vol: 0.14, q: 0.6 });
    },
    charge() {
      tone({ type: 'sawtooth', f0: 110, f1: 660, dur: 1.2, vol: 0.05, attack: 0.5 });
    },
    laser() {
      tone({ type: 'sawtooth', f0: 92, dur: 1.4, vol: 0.1, attack: 0.02 });
      tone({ type: 'square', f0: 184.6, dur: 1.4, vol: 0.04, attack: 0.02 });
      noise({ f0: 3200, dur: 1.4, vol: 0.05, q: 2 });
    },
    close() {
      noise({ f0: 900, f1: 3600, dur: 0.16, vol: 0.09, q: 1.5 });
      tone({ type: 'sine', f0: 990, f1: 1480, dur: 0.12, vol: 0.08 });
    },
    zone() {
      [0, 7, 12].forEach((s, i) =>
        tone({ type: 'triangle', f0: 392 * Math.pow(2, s / 12), dur: 0.3, vol: 0.1, delay: i * 0.09 }));
    },
    crash() {
      noise({ f0: 3000, f1: 120, dur: 0.6, vol: 0.4, type: 'lowpass' });
      tone({ type: 'sawtooth', f0: 320, f1: 40, dur: 0.5, vol: 0.2 });
      tone({ type: 'square', f0: 1400, f1: 200, dur: 0.12, vol: 0.1 });
    },
    thud() {
      tone({ type: 'sine', f0: 120, f1: 45, dur: 0.16, vol: 0.28 });
      noise({ f0: 700, f1: 200, dur: 0.1, vol: 0.1, type: 'lowpass' });
    },
    best() {
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) =>
        tone({ type: 'triangle', f0: 523.25 * Math.pow(2, s / 12), dur: 0.22, vol: 0.13, delay: i * 0.07 }));
    },
    tick() {
      tone({ type: 'triangle', f0: 1200, dur: 0.025, vol: 0.05 });
    },
    letter(n) {
      // each letter of T-E-C-H rings one step higher up a chord
      const f = 587.33 * Math.pow(2, [0, 4, 7, 12][Math.min(3, n || 0)] / 12);
      tone({ type: 'triangle', f0: f, dur: 0.24, vol: 0.17 });
      tone({ type: 'sine', f0: f * 2, dur: 0.32, vol: 0.1, delay: 0.05 });
      tone({ type: 'square', f0: f * 1.5, dur: 0.1, vol: 0.035, delay: 0.1 });
    },
    horn() {
      // two-tone truck horn: one short blast, one long
      for (const [delay, dur] of [[0, 0.16], [0.24, 0.7]])
        for (const f of [311.1, 392]) {
          tone({ type: 'sawtooth', f0: f, dur, vol: 0.1, attack: 0.02, delay });
          tone({ type: 'square', f0: f / 2, dur, vol: 0.05, attack: 0.02, delay });
        }
    },
  };

  A.play = function (name, arg) {
    if (!A.ready || A.sfxVol <= 0 || A.ctx.state !== 'running') return;
    const fn = SFX[name];
    if (fn) fn(arg);
  };

  /* ---------- jetpack: a looping filtered-noise roar that follows the throttle ---------- */
  function buildThrust() {
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 420;
    filt.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0;
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.value = 58;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 220;
    src.connect(filt);
    filt.connect(g);
    g.connect(sfxBus);
    rumble.connect(rf);
    rf.connect(rg);
    rg.connect(sfxBus);
    src.start();
    rumble.start();
    A._thrust = { g, rg, filt };
  }

  A.setThrust = function (level) {
    if (!A.ready || !A._thrust) return;
    const t = A.ctx.currentTime;
    const l = clamp(level, 0, 1.6);
    A._thrust.g.gain.setTargetAtTime(0.11 * l, t, 0.04);
    A._thrust.rg.gain.setTargetAtTime(0.07 * l, t, 0.05);
    A._thrust.filt.frequency.setTargetAtTime(380 + 420 * l, t, 0.08);
  };

  /* ---------- music: a small generative synth loop ---------- */
  const BPM = 108;
  const STEP = 60 / BPM / 4; // sixteenth note
  // A minor: Am  F  C  G   (root midi notes, chord tones as semitone offsets)
  const BARS = [
    { root: 45, tones: [0, 3, 7, 12] },
    { root: 41, tones: [0, 4, 7, 12] },
    { root: 48, tones: [0, 4, 7, 12] },
    { root: 43, tones: [0, 4, 7, 11] },
  ];
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function startMusic() {
    const ctx = A.ctx;
    const M = (A._music = { step: 0, next: ctx.currentTime + 0.1, intensity: 0, target: 0 });
    // shared echo for the arpeggio
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(musicBus);
    M.delay = delay;

    M.timer = setInterval(() => {
      if (ctx.state !== 'running') return;
      // if the tab was asleep, jump ahead rather than playing a burst of notes
      if (M.next < ctx.currentTime - 0.2) M.next = ctx.currentTime + 0.05;
      while (M.next < ctx.currentTime + 0.14) {
        scheduleStep(M, M.step, M.next);
        M.step = (M.step + 1) % 64;
        M.next += STEP;
      }
      M.intensity += (M.target - M.intensity) * 0.08;
    }, 40);
  }

  function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function scheduleStep(M, step, t) {
    if (A.musicVol <= 0) return;
    const ctx = A.ctx;
    const bar = BARS[(step >> 4) % 4];
    const s = step % 16;
    const k = M.intensity; // 0 in menus, 1 in a run

    // pad: one soft chord per bar
    if (s === 0) {
      [0, 1, 2].forEach((i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(bar.root + 12 + bar.tones[i]);
        o.detune.value = (i - 1) * 7;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 620;
        const g = ctx.createGain();
        env(g, t, 0.05, 0.5, STEP * 16.5);
        o.connect(f);
        f.connect(g);
        g.connect(musicBus);
        o.start(t);
        o.stop(t + STEP * 17);
      });
    }

    // arpeggio
    if (s % 2 === 0 || k > 0.5) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(bar.root + 24 + bar.tones[ARP[s]]);
      const g = ctx.createGain();
      env(g, t, s % 2 === 0 ? 0.07 : 0.035, 0.004, STEP * 1.6);
      o.connect(g);
      g.connect(musicBus);
      g.connect(M.delay);
      o.start(t);
      o.stop(t + STEP * 2);
    }

    if (k > 0.15) {
      // bass
      if (s % 2 === 0) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(bar.root - 12 + (s === 6 || s === 14 ? 12 : 0));
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(700, t);
        f.frequency.exponentialRampToValueAtTime(140, t + STEP * 1.7);
        const g = ctx.createGain();
        env(g, t, 0.16 * k, 0.005, STEP * 1.8);
        o.connect(f);
        f.connect(g);
        g.connect(musicBus);
        o.start(t);
        o.stop(t + STEP * 2);
      }
      // kick
      if (s % 4 === 0) {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        const g = ctx.createGain();
        env(g, t, 0.34 * k, 0.002, 0.16);
        o.connect(g);
        g.connect(musicBus);
        o.start(t);
        o.stop(t + 0.2);
      }
      // hat, with an accent on the off-beat
      if (s % 2 === 0) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7500;
        const g = ctx.createGain();
        env(g, t, (s % 4 === 2 ? 0.07 : 0.03) * k, 0.001, 0.045);
        src.connect(f);
        f.connect(g);
        g.connect(musicBus);
        src.start(t, Math.random() * 0.5);
        src.stop(t + 0.06);
      }
      // snare-ish clap
      if (s === 4 || s === 12) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1900;
        f.Q.value = 0.8;
        const g = ctx.createGain();
        env(g, t, 0.11 * k, 0.001, 0.13);
        src.connect(f);
        f.connect(g);
        g.connect(musicBus);
        src.start(t, Math.random() * 0.5);
        src.stop(t + 0.16);
      }
    }
  }

  // 0 = calm (menus), 1 = full beat (in a run)
  A.setMusicIntensity = function (v) {
    if (A._music) A._music.target = v;
  };
})();
