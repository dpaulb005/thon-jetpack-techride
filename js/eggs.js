/* Techride — easter eggs. None of this is mentioned anywhere in the game.
 *
 *   Type on the main menu (it arms the next run):
 *     CLAUDE    the autopilot flies the run for you. It does not count.
 *     HALFAPPS  donations turn into wings, pretzels and tacos
 *     COOKED    Michelle mode: the floor is on fire, everything is cooked
 *     SASHA     money pours out of the bank; the run goes on Sasha's tab
 *     OVERLORD  Marilyn is watching: you wear her TECH hat and she has notes
 *     OLIVIA    cross-country pace from the first step
 *     ANNA      she has the aux: donations are songs, by the million
 *     ADITHYA   too tuff: the shield grows back. It does not count.
 *     STORE or CHARLOTTE   the store's loading bar. It reaches 99%.
 *     PAYDAY    everyone finally pays Sasha back: +1,000 donations to spend
 *   Leave the menu alone for 46 seconds: the bot sits down, the one thing
 *     it is not allowed to do, and jumps up when you come back.
 *   Click the logo ten times: unlocks TECHBOT MK I, the cardboard original.
 *
 *   Things that turn up during a run (the cameos in game.js): the Overlord
 *   drops in from above in a saucer to watch, Olivia overtakes you on foot,
 *   and one of Sasha's payment requests flies past (catch it for +5).
 *   Charlotte's store is in the background, shutter down, opening soon.
 *
 *   Elsewhere: The Warrior stands in the crowd now and then (art.js), The
 *   Director's F-150 matches the comfort set and after 9 PM it is half apps
 *   hour (game.js), and the results screen and the Top 10 have a few things
 *   to say (ui.js). The Overlord is always above first place in the Top 10. */
(function () {
  'use strict';
  const TR = window.TR;
  const G = TR.game, A = TR.audio, ui = TR.ui, save = TR.save, EGG = TR.eggs;

  const onMenu = () => G.state === 'menu' && !ui.modal;

  /* ---------- typed codes ---------- */
  const CODES = {
    CLAUDE: ['claude', 'AIDAN MODE ARMED', 'Press play. Claude will take it from here.', '#ffb86b'],
    HALFAPPS: ['apps', 'HALF APPS ARMED', 'Next run: every donation is an appetiser.', '#7dff7a'],
    COOKED: ['cooked', 'MICHELLE MODE ARMED', 'Next run: everything is cooked.', '#ff9a3d'],
    SASHA: ['sasha', "SASHA'S BANK ACCOUNT", 'Paying for everyone. Again.', '#ff8fa3'],
    OVERLORD: ['overlord', 'THE OVERLORD HAS LOGGED ON', 'Next run: she is watching. Wear the hat.', '#7dff4a'],
    OLIVIA: ['olivia', 'OLIVIA MODE ARMED', 'Next run: cross-country pace. No stopping.', '#9fe8ff'],
    ANNA: ['anna', 'ANNA HAS THE AUX', 'Next run: 1,000,000 songs added to the queue.', '#b388ff'],
    ADITHYA: ['adithya', 'SYSTEMS LEAD ONLINE', 'Next run: too tuff to stay down.', '#38d6ff'],
    // these two only play the gag; they do not change the next run
    STORE: [null, 'THE STORE', 'Launching any minute now.', '#ffd23f'],
    CHARLOTTE: [null, 'THE STORE', 'Launching any minute now.', '#ffd23f'],
    PAYDAY: ['payday', 'PAYDAY', 'Everyone paid Sasha back. +1,000 to spend in the Hangar.', '#ffd23f'],
  };
  let typed = '';
  window.addEventListener('keydown', (e) => {
    if (!onMenu() || e.ctrlKey || e.metaKey || e.altKey || !/^[a-zA-Z]$/.test(e.key)) return;
    typed = (typed + e.key.toUpperCase()).slice(-12);
    for (const word in CODES) {
      if (!typed.endsWith(word)) continue;
      const c = CODES[word];
      typed = '';
      if (c[0] === 'payday') {
        // a cheat, plainly: money for the Hangar
        save.data.bank += 1000;
        save.write();
        document.getElementById('menu-bank').textContent = Math.floor(save.data.bank).toLocaleString('en-US');
        A.play('buy');
      } else if (c[0]) EGG.next = c[0];
      ui.banner(c[1], c[2], c[3]);
      A.play('powerup');
      if (c[0] === 'sasha') ui.sashaDrain();
      if (!c[0]) ui.storeLoading();
    }
  });

  /* ---------- sitting down ---------- */
  EGG.idleFor = 46; // seconds
  let lastInput = performance.now();
  function poke() {
    lastInput = performance.now();
    if (!EGG.sit) return;
    EGG.sit = false;
    G.standUp();
    ui.banner('NO SITTING', 'You saw nothing.', '#ffd23f');
    A.play('deny');
  }
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'])
    window.addEventListener(ev, poke, { passive: true });
  setInterval(() => {
    if (!onMenu() || document.hidden) {
      lastInput = performance.now();
      EGG.sit = false;
    } else if (!EGG.sit && performance.now() - lastInput > EGG.idleFor * 1000) EGG.sit = true;
  }, 250);

  /* ---------- the cardboard original ---------- */
  const logo = document.querySelector('.logo');
  let clicks = 0, lastClick = 0;
  if (logo)
    logo.addEventListener('click', () => {
      const now = performance.now();
      clicks = now - lastClick < 1500 ? clicks + 1 : 1;
      lastClick = now;
      A.play('tick');
      logo.animate([{ transform: 'rotate(-2deg) scale(1.03)' }, { transform: 'none' }], { duration: 160 });
      if (clicks < 10) return;
      clicks = 0;
      const d = save.data, fresh = !d.owned.includes('cardboard');
      if (fresh) d.owned.push('cardboard');
      d.skin = 'cardboard';
      save.write();
      ui.banner(fresh ? 'SECRET UNLOCKED' : 'TECHBOT MK I', 'The original: cardboard, foil and green tape.', '#39e03a');
      A.play('buy');
      if (fresh) G.confetti();
    });

  // for whoever opens the console
  try {
    console.log('%c JETPACK TECHRIDE ', 'background:#a6e22e;color:#0b1030;font-weight:bold;font-size:14px',
      '\nMade by David Brown. Built with Claude (Aidan approves).\nThere are secrets in here. The logo is a good place to start.');
  } catch (e) { /* no console, no problem */ }
})();
