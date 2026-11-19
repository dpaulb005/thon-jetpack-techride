/* Techride — start-up, input, window scaling and the frame loop. */
(function () {
  'use strict';
  const TR = window.TR;
  const G = TR.game, A = TR.audio, ui = TR.ui;
  const W = TR.W, H = TR.H;

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const uiLayer = document.getElementById('ui');
  const ctx = canvas.getContext('2d', { alpha: false });
  let pixelScale = 1; // device pixels per game unit

  function resize() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    const cw = Math.max(1, Math.floor(W * s)), ch = Math.max(1, Math.floor(H * s));
    stage.style.width = cw + 'px';
    stage.style.height = ch + 'px';
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    // draw at the screen's real resolution (capped so 4K laptops stay smooth)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    pixelScale = canvas.width / W;
    uiLayer.style.transform = 'scale(' + cw / W + ')';
  }

  /* ---------- input ---------- */
  const THRUST_KEYS = { Space: 1, ArrowUp: 1, KeyW: 1 };
  const held = new Set();
  let pointerHeld = false;
  const syncThrust = () => {
    G.input.thrust = pointerHeld || held.size > 0;
  };

  window.addEventListener('keydown', (e) => {
    A.unlock();
    const typing = e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox';
    if (typing) {
      if (e.code === 'Enter') {
        ui.commitScore();
        A.play('buy');
        e.preventDefault();
      } else if (e.code === 'Escape') e.target.blur();
      return;
    }
    if (THRUST_KEYS[e.code] || e.code === 'Enter') {
      e.preventDefault();
      if (G.state === 'playing') {
        if (THRUST_KEYS[e.code]) held.add(e.code);
      } else if (!e.repeat) {
        if (G.state === 'menu' && !ui.modal) ui.play();
        else if (G.state === 'over' && ui.canRestart()) ui.play();
        else if (G.state === 'paused' && e.code === 'Enter') G.resume();
      }
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (ui.modal) ui.closeModal();
      else if (G.state === 'playing') G.pause();
      else if (G.state === 'paused') G.resume();
    } else if (e.code === 'KeyM') ui.toggleMute();
    syncThrust();
  });
  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
    syncThrust();
  });

  stage.addEventListener('pointerdown', (e) => {
    A.unlock();
    if (e.target.closest('button, input, .panel, .menu-panel')) return;
    if (G.state === 'playing') {
      pointerHeld = true;
      syncThrust();
      e.preventDefault();
    }
  });
  const release = () => {
    pointerHeld = false;
    syncThrust();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // Never leave the bot flying (or the run going) while the player is away.
  function away() {
    held.clear();
    release();
    if (G.state === 'playing') G.pause();
  }
  window.addEventListener('blur', away);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      away();
      A.suspend();
    } else A.resume();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  /* ---------- frame loop ---------- */
  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    G.update(dt);
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    G.render(ctx, pixelScale);
    ui.update(dt);
    requestAnimationFrame(frame);
  }

  function boot() {
    TR.save.load();
    resize();
    ui.init();
    ui.menu();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // Wait for the typeface so nothing is drawn in a fallback font first.
  const fonts = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('700 20px "Chakra Petch"'), document.fonts.load('600 20px "Chakra Petch"')])
    : Promise.resolve();
  Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).then(boot, boot);
})();
