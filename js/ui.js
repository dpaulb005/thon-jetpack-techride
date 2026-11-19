/* Techride — menus, HUD and results. Plain DOM over the canvas. */
(function () {
  'use strict';
  const TR = window.TR;
  const art = TR.art, A = TR.audio, G = TR.game, save = TR.save;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const ui = (TR.ui = { modal: null });
  const el = {};
  const hudCache = {};
  let results = null, resultsAt = 0, countT = 0, lastTick = -1;
  let clock = 0;

  const CAUSES = {
    gate: ['TRIPPED ON A LIVE CABLE', 'CABLE MANAGEMENT 1, ROBOT 0', 'WHO LEFT THAT PLUGGED IN?',
      'SASHA SAID NOT TO TOUCH THAT', 'CLAUDE WROTE THAT CABLE', 'THE OVERLORD IS DISAPPOINTED'],
    drone: ['PHOTOBOMBED BY A DRONE', 'THE LIVESTREAM GOT YOU', 'DARSH DODGES THOSE IN STYLE', 'SAY HI TO SASHA ON STREAM',
      'OLIVIA WOULD HAVE OUTRUN THAT'],
    missile: ['MERCH MISSILE TO THE FACE', 'FREE T-SHIRT! (AT 60 MPH)', 'COOKED. MICHELLE CALLED IT.', 'STILL FASTER THAN THE STORE'],
    laser: ['YOU JOINED THE LASER SHOW', 'THE LIGHTING CREW SAYS SORRY', 'AIDAN: "CLAUDE CAN FIX THIS"',
      'ADITHYA: "WORKS ON MY MACHINE"', 'ANNA QUEUED ONE SONG TOO MANY'],
  };
  const TIPS = [
    'No sitting. No sleeping. No unplugging the robot.',
    'TECH tip: have you tried turning it off and on again?',
    'Every donation counts. Grab them all.',
    'Cable management is a lifestyle.',
    'Hydrate. Yes, even you, robot.',
    'If it glows red, it was probably our fault.',
    '46 hours. Zero chairs. One jetpack.',
    'Aidan says: just ask Claude.',
    'Written by a robot, about a robot. Aidan could not be happier.',
    'Darsh dressed better than you today. Darsh always does.',
    'Sasha did not approve this tip.',
    'Michelle cannot help right now. Michelle is cooked.',
    "After this: Applebee's. Half apps wait for no one.",
    'The comfort set is not an outfit. It is a uniform.',
    'Respect The Warrior.',
    'The Warrior has not blinked since hour one.',
    'The first TECHBOT was cardboard, foil and green tape. It still runs.',
    'Legendary skin: the full comfort set. Starter pack: just the hoodie.',
    'For the table: pretzels, boneless wings, wonton tacos. All of them.',
    'The Final Boss has entered the dance floor. He brought a laptop.',
    'Made by David Brown. Complaints go to Sasha.',
    'All decisions are final. Signed, the Overlord.',
    'Charlotte says the store will be done next week. She has said it for six months.',
    'Olivia could run this tunnel for 1,000 miles without stopping. You get 46 hours.',
    'Retreat attendance: everyone but Olivia. She had a race.',
    'Anna has added 1,000,000 songs to this playlist. It was already 46 hours long.',
    'Do not hand Anna the aux. (Someone handed Anna the aux.)',
    'Adithya cannot come to the phone. He works at Google now. Full time. He will mention it.',
    'Systems lead status: tuff as heck.',
  ];
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  // results line: [hours below this, the options]
  const HOUR_QUIPS = [
    [2, ['The opening ceremony lasted longer.', 'Michelle lasted longer, and Michelle is cooked.', 'Still quicker than the store launch.']],
    [8, ['Barely warmed up. The dancers are unimpressed.', 'Darsh has not even picked an outfit yet.']],
    [16, ['Respectable. Your feet disagree.', 'Respectable. Aidan is asking Claude how to do better.', 'Olivia does this much before breakfast.']],
    [24, ['Deep into the night shift. Somebody get this bot a snack.', 'Deep into the night shift. Half apps cannot come soon enough.']],
    [36, ['Past halfway, powered entirely by vibes.', 'Past halfway. Officially cooked, still standing.', 'Past halfway. The Overlord is mildly impressed.']],
    [46, ['So close. The finish line could taste it.', 'So close. Sasha is pretending not to be impressed.']],
  ];
  function hourQuip(h) {
    if (h >= 46) return 'All 46 hours! You may now sit down. (You are a robot. You do not sit.)';
    return 'You stayed standing for ' + h + ' of 46 hours. ' + pickOne(HOUR_QUIPS.find((q) => h < q[0])[1]);
  }
  const show = (node, on) => node.classList.toggle('hidden', !on);
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');

  function drawCoinIcons(root) {
    for (const c of $$('canvas.coin-ico', root)) {
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      art.drawCoin(g, c.width / 2, c.height / 2, 0, c.width);
    }
  }
  function drawPowerIcon(c, type) {
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.save();
    g.translate(c.width / 2, c.height / 2);
    art.drawPowerIcon(g, type, c.width * 0.8, art.POWERUPS[type].color);
    g.restore();
  }

  ui.applyVolume = function () {
    const d = save.data;
    A.setVolumes(d.muted ? 0 : d.sfx, d.muted ? 0 : d.music);
    el.sound.classList.toggle('muted', !!d.muted);
  };
  ui.toggleMute = function () {
    save.data.muted = !save.data.muted;
    save.write();
    ui.applyVolume();
  };

  /* ---------- screens ---------- */
  function refreshMenu() {
    $('#menu-best').textContent = fmt(save.data.best);
    $('#menu-bank').textContent = fmt(save.data.bank);
    $('#menu-tip').textContent = pickOne(TIPS);
  }

  ui.menu = function () {
    commitScore();
    results = null;
    closeModal(true);
    for (const s of ['results', 'pause']) show(el.screens[s], false);
    show(el.hud, false);
    ui.hint(false);
    show(el.screens.menu, true);
    refreshMenu();
    G.toMenu();
  };

  ui.play = function () {
    commitScore();
    results = null;
    closeModal(true);
    for (const s of ['results', 'pause', 'menu']) show(el.screens[s], false);
    for (const k in hudCache) delete hudCache[k];
    $('#hud-best').textContent = fmt(save.data.best);
    show(el.hud, true);
    G.start();
  };

  function openModal(name) {
    A.play('click');
    ui.modal = name;
    if (name === 'hangar') buildHangar();
    if (name === 'board') buildBoard(-1);
    if (name === 'settings') syncSettings();
    show(el.screens[name], true);
  }
  function closeModal(silent) {
    if (!ui.modal) return;
    if (!silent) A.play('back');
    show(el.screens[ui.modal], false);
    ui.modal = null;
    refreshMenu();
  }
  ui.closeModal = closeModal;

  /* ---------- hangar ---------- */
  function buildHangar() {
    const d = save.data;
    $('#hangar-bank').textContent = fmt(d.bank);
    const box = $('#skins');
    box.innerHTML = '';
    const list = art.SKINS.filter((s) => !s.secret || d.owned.includes(s.id));
    box.classList.toggle('scroll', list.length > 9);
    for (const s of list) {
      const owned = d.owned.includes(s.id), equipped = d.skin === s.id;
      const card = document.createElement('div');
      card.className = 'skin' + (equipped ? ' equipped' : '') + (owned ? '' : ' locked') + (s.tag === 'LEGENDARY' ? ' legendary' : '');
      if (s.tag) {
        const tag = document.createElement('i');
        tag.className = 'tag';
        tag.textContent = s.tag;
        card.append(tag);
      }
      const cv = document.createElement('canvas');
      cv.width = 192;
      cv.height = 240;
      cv.dataset.skin = s.id;
      const name = document.createElement('b');
      name.textContent = s.name;
      const blurb = document.createElement('p');
      blurb.textContent = s.blurb;
      const btn = document.createElement('button');
      btn.className = 'btn' + (owned && !equipped ? ' btn-primary' : '');
      if (equipped) {
        btn.textContent = 'EQUIPPED';
        btn.disabled = true;
      } else if (owned) btn.textContent = 'EQUIP';
      else {
        const ic = document.createElement('canvas');
        ic.className = 'coin-ico';
        ic.width = ic.height = 44;
        btn.append(ic, document.createTextNode(fmt(s.cost)));
        if (d.bank < s.cost) btn.style.opacity = '0.6';
      }
      btn.addEventListener('click', () => {
        if (owned) {
          d.skin = s.id;
          A.play('click');
        } else if (d.bank >= s.cost) {
          d.bank -= s.cost;
          d.owned.push(s.id);
          d.skin = s.id;
          A.play('buy');
        } else {
          A.play('deny');
          card.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 180 });
          return;
        }
        save.write();
        buildHangar();
      });
      card.append(cv, name, blurb, btn);
      box.append(card);
    }
    drawCoinIcons(box);
    drawSkins();
  }
  function drawSkins() {
    for (const cv of $$('#skins canvas[data-skin]')) {
      const g = cv.getContext('2d');
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, 96, 120);
      const eq = cv.dataset.skin === save.data.skin;
      const skin = art.skin(cv.dataset.skin);
      const sc = skin.tall ? 0.98 : 1.08; // a tall character still has to fit the card
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(48, 116, 26, 4, 0, 0, Math.PI * 2);
      g.fill();
      art.drawRobot(g, {
        x: 50, y: 115 - 40 * sc, scale: sc, phase: eq ? clock * 9 : 0.6, ground: 1, thrust: 0, vy: 0, t: clock,
        ant: Math.sin(clock * 3) * 2, blink: clock % 3.2 < 0.12,
      }, skin);
    }
  }

  /* ---------- top 10 ---------- */
  function buildBoard(highlight) {
    const box = $('#board');
    box.innerHTML = '';
    const b = save.data.board;
    // above first place, always, and not up for discussion
    const top = document.createElement('div');
    top.className = 'line overlord';
    for (const [cls, text] of [['rk', '0'], ['nm', 'THE OVERLORD'], ['ds', '\u221e m'], ['md', 'MARILYN']]) {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      top.append(s);
    }
    box.append(top);
    if (!b.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'Nobody on the board yet. Stay up for one hour (50 m) to sign it.';
      box.append(e);
      return;
    }
    b.forEach((r, i) => {
      const line = document.createElement('div');
      line.className = 'line' + (i === highlight ? ' me' : '');
      const cells = [['rk', i + 1], ['nm', r.name], ['ds', fmt(r.dist) + ' m'], ['md', r.diff || '']];
      for (const [cls, text] of cells) {
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = text; // textContent: names are shown as typed, never as markup
        line.append(s);
      }
      box.append(line);
    });
  }

  /* ---------- settings ---------- */
  function fillRange(inp) {
    inp.style.setProperty('--fill', inp.value * 100 + '%');
  }
  function syncSettings() {
    const d = save.data;
    $$('#set-diff button').forEach((b) => b.classList.toggle('on', +b.dataset.v === d.difficulty));
    $('#set-sfx').value = d.sfx;
    $('#set-music').value = d.music;
    fillRange($('#set-sfx'));
    fillRange($('#set-music'));
    $('#set-shake').checked = d.shake;
    $('#set-effects').checked = d.effects;
    $('#set-hitboxes').checked = d.hitboxes;
    const r = $('#set-reset');
    r.textContent = 'RESET PROGRESS';
    r.dataset.armed = '';
  }

  /* ---------- HUD ---------- */
  ui.hint = (on) => show(el.hint, on);

  ui.banner = function (title, sub, color) {
    const b = el.banner;
    b.style.left = G.state === 'menu' ? '32%' : ''; // clear of the menu panel
    b.style.setProperty('--bc', color || '#38d6ff');
    b.firstElementChild.textContent = title;
    b.lastElementChild.textContent = sub || '';
    b.classList.remove('show');
    void b.offsetWidth; // restart the animation
    b.classList.add('show');
  };

  ui.coinPulse = function () {
    const c = el.coinChip;
    c.classList.remove('pulse');
    void c.offsetWidth;
    c.classList.add('pulse');
  };

  ui.showPause = (on) => show(el.screens.pause, on);

  function setText(key, node, value) {
    if (hudCache[key] !== value) {
      hudCache[key] = value;
      node.textContent = value;
    }
  }

  function updateHud(w) {
    setText('dist', el.dist, fmt(w.dist));
    setText('coins', el.coins, fmt(w.coins));
    // whichever ride the bot is on
    const ride = w.ride ? w.ride.type : '';
    const rp = el.pills.ride;
    if (hudCache.ride !== ride) {
      hudCache.ride = ride;
      show(rp.node, !!ride);
      if (ride) {
        rp.node.style.setProperty('--pc', art.POWERUPS[ride].color);
        rp.label.textContent = art.POWERUPS[ride].name;
        drawPowerIcon(rp.icon, ride);
      }
    }
    if (ride) {
      rp.bar.style.transform = 'scaleX(' + Math.max(0, w.ride.t / w.ride.dur).toFixed(3) + ')';
      rp.node.classList.toggle('low', w.ride.t < 2);
    }
    // the T-E-C-H letters collected so far
    if (hudCache.tech !== w.tech) {
      el.techTiles.forEach((n, i) => {
        const on = w.have[i];
        if (on && !n.classList.contains('on') && hudCache.tech != null) n.animate(
          [{ transform: 'scale(1.7) rotate(-10deg)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' });
        n.classList.toggle('on', on);
      });
      el.tech.classList.toggle('full', w.tech >= 4);
      hudCache.tech = w.tech;
    }
    const h = Math.floor(w.dist / G.HOUR_M);
    setText('hour', el.hour, h > 46 ? 'OVERTIME +' + (h - 46) + 'h' : 'HOUR ' + h + ' / 46');
    for (const k of ['shield', 'magnet', 'rush', 'ultra']) {
      const pill = el.pills[k];
      const on = k === 'shield' ? w.shield : w[k] > 0;
      if (hudCache['p' + k] !== on) {
        hudCache['p' + k] = on;
        show(pill.node, on);
      }
      if (on && k !== 'shield') {
        pill.bar.style.transform = 'scaleX(' + Math.max(0, w[k] / G.DUR[k]).toFixed(3) + ')';
        const low = w[k] < 2;
        if (hudCache['l' + k] !== low) {
          hudCache['l' + k] = low;
          pill.node.classList.toggle('low', low);
        }
      }
    }
  }

  /* ---------- results ---------- */
  ui.showResults = function (res) {
    results = res;
    resultsAt = performance.now();
    countT = 0;
    lastTick = -1;
    show(el.hud, false);
    show(el.screens.pause, false);
    show(el.screens.results, true);
    show($('#res-ribbon'), res.newBest);
    let title = CAUSES[res.cause] ? pickOne(CAUSES[res.cause]) : 'RUN COMPLETE', quip = hourQuip(res.hours || 0);
    let label = 'RAISED';
    // --- easter eggs ---
    const exact46 = res.coins === 46;
    if (res.egg === 'claude') {
      title = 'CLAUDE DID THAT';
      quip = res.hours >= 46 ? 'Aidan mode: Claude did all 46 hours for you. It does not count, and Aidan will never stop talking about it.'
        : 'Aidan mode: Claude stayed up ' + (res.hours || 0) + ' of 46 hours for you. It does not count, but Aidan is very proud.';
    } else if (res.time < 10) {
      title = 'SPEEDRUN';
      quip = 'Out in ' + res.time.toFixed(1) + ' seconds. Michelle called it: cooked.';
    } else if (res.egg === 'cooked') title = 'COOKED.';
    else if (res.egg === 'overlord') {
      title = 'THE OVERLORD IS DISPLEASED';
      quip = 'The Overlord reviewed your ' + (res.hours || 0) + ' hours and has notes. Many notes.';
      label = 'TRIBUTE';
    } else if (res.egg === 'adithya') {
      title = 'TOO TUFF';
      quip = 'Systems lead mode: the shield kept growing back and you still went down in hour ' + (res.hours || 0)
        + '. It does not count. Adithya has a real job to get to.';
    } else if (res.egg === 'anna') {
      label = 'SONGS ADDED';
      quip = 'Anna added ' + fmt(res.coins) + ' million songs to the playlist. It now runs for about '
        + fmt(Math.max(1, Math.round(res.coins * 6.7))) + ' years.';
    } else if (res.egg === 'olivia')
      quip = 'Olivia pace for ' + (res.hours || 0) + ' of 46 hours. She would still be running. She skipped retreat for less.';
    if (res.egg === 'sasha') {
      label = 'ON SASHA';
      quip = 'Sasha covered all ' + fmt(res.coins) + ' donations. Venmo her back. Seriously.';
    } else if (res.egg === 'apps') label = 'APPS EATEN';
    if (exact46) {
      title = 'EXACTLY 46';
      quip = '46 donations for 46 hours. You did that on purpose. Right?';
      G.confetti();
    }
    $('.panel-results').classList.toggle('gold', exact46);
    $('#res-coins').closest('div').querySelector('small').textContent = label;
    $('#res-title').textContent = title;
    $('#res-quip').textContent = quip;
    $('#res-dist').textContent = '0';
    $('#res-coins').textContent = '+' + fmt(res.coins) + (res.egg === 'anna' ? 'M' : '');
    $('#res-close').textContent = res.closeCalls;
    $('#res-smash').textContent = res.smashed;
    $('#res-best').textContent = fmt(save.data.best);
    const row = $('#res-name-row');
    show(row, res.qualifies);
    if (res.qualifies) {
      row.firstElementChild.textContent = 'You made the Top 10 — sign it:';
      const inp = $('#res-name');
      inp.value = save.data.name || '';
      inp.disabled = false;
      $('#res-save').disabled = false;
      setTimeout(() => inp.focus(), 350);
    }
    if (res.newBest) {
      G.confetti();
      A.play('best');
    }
  };

  // what the board has to say to certain names
  const SIGNED = {
    SASHA: 'Venmo requests sent to everyone.',
    DARSH: 'Fit check passed.',
    AIDAN: 'Claude says hi.',
    MICHELLE: 'Cooked, but on the board.',
    BRANDON: 'The Final Boss has entered the chat.',
    DAVID: 'The maker of the game. Everybody bow.',
    CLAUDE: 'I would never. (Aidan might.)',
    WARRIOR: 'He did not blink.',
    MARILYN: 'All hail the Overlord.',
    OVERLORD: 'You are not her. Nice try.',
    CHARLOTTE: 'The store is almost done. Promise.',
    OLIVIA: 'Ran here. Did not stop. Skipped retreat for this.',
    ANNA: '1,000,000 songs added to the queue.',
    ADITHYA: 'Systems lead. Google, full time. Tuff as heck.',
  };
  function commitScore() {
    if (!results || !results.qualifies || results.saved) return;
    results.saved = true;
    const inp = $('#res-name');
    const name = (inp.value.trim() || save.data.name || 'DANCER').toUpperCase().slice(0, 12);
    save.data.name = name;
    const rank = save.addScore({ name, dist: results.dist, coins: results.coins, diff: results.diff, date: Date.now() });
    inp.value = name;
    inp.disabled = true;
    inp.blur();
    $('#res-save').disabled = true;
    const reply = SIGNED[name.split(/\s+/)[0]];
    $('#res-name-row').firstElementChild.textContent = 'Signed — you are #' + (rank + 1) + ' on the board.' + (reply ? ' ' + reply : '');
    results.rank = rank;
  }
  ui.commitScore = commitScore;
  // short guard so a held key at the moment of the crash doesn't restart instantly
  ui.canRestart = () => results && performance.now() - resultsAt > 550;

  /* ---------- Sasha's bank account ----------
   * She pays for everything and nobody Venmos her back. Purely for show: the
   * real total is put back afterwards. */
  let draining = false;
  ui.sashaDrain = function () {
    if (draining) return;
    draining = true;
    const stat = $('#menu-bank'), box = stat.closest('.stat');
    const start = save.data.bank, t0 = performance.now(), DUR = 3400, OUT = 460;
    const items = ['HALF APPS FOR 12', 'PARKING', 'T-SHIRT ORDER', '"I WILL VENMO YOU"', 'RIDE HOME ×6', 'PIZZA ×9', 'GROUP GIFT', 'SNACK RUN'];
    let n = 0;
    box.classList.add('draining');
    const iv = setInterval(() => {
      const line = document.createElement('i');
      line.className = 'venmo';
      line.textContent = '−$' + (6 + Math.random() * 52).toFixed(2) + '  ' + items[n++ % items.length];
      box.append(line);
      setTimeout(() => line.remove(), 1300);
      A.play('tick');
    }, 300);
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / DUR);
      stat.textContent = fmt(start - OUT * k);
      if (k < 1) return requestAnimationFrame(tick);
      clearInterval(iv);
      setTimeout(() => {
        stat.textContent = fmt(save.data.bank);
        box.classList.remove('draining');
        draining = false;
        if (G.state === 'menu') ui.banner('VENMO REQUESTS SENT: 14', 'Paid back so far: 0.', '#ff8fa3');
      }, 1300);
    };
    tick();
  };

  /* ---------- Charlotte's store ----------
   * It has been nearly finished for six months. The bar gets to 99%. */
  let storeBusy = false;
  ui.storeLoading = function () {
    if (storeBusy) return;
    storeBusy = true;
    const pop = document.createElement('div');
    pop.className = 'store-pop';
    pop.innerHTML = '<b>THE STORE</b><i><u></u></i><span></span><small></small>';
    el.screens.menu.append(pop);
    const bar = $('u', pop), pct = $('span', pop), note = $('small', pop);
    const t0 = performance.now();
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      // races to 99, then crawls and never arrives
      const v = s < 2.6 ? 99 * (1 - Math.pow(1 - s / 2.6, 3)) : Math.min(99.9, 99 + (s - 2.6) * 0.09);
      bar.style.width = v + '%';
      pct.textContent = 'Launching\u2026 ' + v.toFixed(s < 2.6 ? 0 : 1) + '%';
      note.textContent = s < 2.6 ? '' : s < 5.4 ? 'Almost done! \u2014 Charlotte' : 'Time remaining: 1 week. (It has said that for 6 months.)';
      if (s < 9.5 && G.state === 'menu') return requestAnimationFrame(tick);
      pop.remove();
      storeBusy = false;
    };
    tick();
  };

  /* ---------- per-frame ---------- */
  ui.update = function (dt) {
    clock += dt;
    const w = G.w;
    if (w && !w.attract && (G.state === 'playing' || G.state === 'dying')) updateHud(w);
    if (ui.modal === 'hangar') drawSkins();
    if (results && countT < 1) {
      countT = Math.min(1, countT + dt / 0.9);
      const v = Math.floor(results.dist * TR.util.easeOut(countT));
      $('#res-dist').textContent = fmt(v);
      const tick = Math.floor(countT * 14);
      if (tick !== lastTick) {
        lastTick = tick;
        A.play('tick');
      }
    }
  };

  /* ---------- wiring ---------- */
  ui.init = function () {
    el.hud = $('#hud');
    el.hint = $('#hint');
    el.banner = $('#banner');
    el.dist = $('#hud-dist');
    el.coins = $('#hud-coins');
    el.hour = $('#hud-hour');
    el.coinChip = $('#hud-coins-chip');
    el.tech = $('#hud-tech');
    el.techTiles = $$('b', el.tech);
    el.sound = $('#btn-sound');
    el.screens = {};
    for (const s of ['menu', 'hangar', 'board', 'help', 'settings', 'pause', 'results']) el.screens[s] = $('#screen-' + s);
    el.pills = {};
    for (const p of $$('.pill')) {
      const k = p.dataset.power;
      if (k !== 'ride') {
        p.style.setProperty('--pc', art.POWERUPS[k].color);
        drawPowerIcon($('canvas', p), k);
      }
      el.pills[k] = { node: p, bar: $('u', p), label: $('b', p), icon: $('canvas', p) };
    }
    drawCoinIcons(document);
    for (const c of $$('canvas[data-icon]')) drawPowerIcon(c, c.dataset.icon);

    const click = (sel, fn) => $(sel).addEventListener('click', fn);
    click('#btn-play', () => ui.play());
    for (const b of $$('[data-open]')) b.addEventListener('click', () => openModal(b.dataset.open));
    for (const b of $$('[data-close]')) b.addEventListener('click', () => closeModal());
    // clicking the dimmed area around a panel closes it
    for (const s of ['hangar', 'board', 'help', 'settings'])
      el.screens[s].addEventListener('pointerdown', (e) => {
        if (e.target === el.screens[s]) closeModal();
      });
    click('#btn-pause', () => G.pause());
    click('#btn-sound', () => ui.toggleMute());
    click('#pause-resume', () => G.resume());
    click('#pause-restart', () => ui.play());
    click('#pause-menu', () => ui.menu());
    click('#res-again', () => ui.play());
    click('#res-menu', () => ui.menu());
    click('#res-save', () => {
      commitScore();
      A.play('buy');
    });

    for (const b of $$('#set-diff button'))
      b.addEventListener('click', () => {
        save.data.difficulty = +b.dataset.v;
        save.write();
        A.play('click');
        syncSettings();
      });
    for (const [id, key] of [['#set-sfx', 'sfx'], ['#set-music', 'music']]) {
      const inp = $(id);
      inp.addEventListener('input', () => {
        save.data[key] = +inp.value;
        save.data.muted = false;
        fillRange(inp);
        ui.applyVolume();
      });
      inp.addEventListener('change', () => {
        save.write();
        if (key === 'sfx') A.play('coin');
      });
    }
    for (const key of ['shake', 'effects', 'hitboxes'])
      $('#set-' + key).addEventListener('change', (e) => {
        save.data[key] = e.target.checked;
        save.write();
        A.play('click');
      });
    click('#set-fullscreen', () => {
      A.play('click');
      const d = document;
      if (d.fullscreenElement) d.exitFullscreen();
      else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {});
    });
    click('#set-reset', (e) => {
      const b = e.currentTarget;
      if (!b.dataset.armed) {
        // two clicks to wipe: no browser pop-up needed
        b.dataset.armed = '1';
        b.textContent = 'CLICK AGAIN TO CONFIRM';
        A.play('deny');
        setTimeout(() => {
          if (b.dataset.armed) syncSettings();
        }, 3000);
        return;
      }
      save.reset();
      A.play('back');
      syncSettings();
      ui.applyVolume();
    });
    // subtle hover blip on every button
    for (const b of $$('#ui .btn, #ui .icon-btn')) b.addEventListener('pointerenter', () => A.play('tick'));
    ui.applyVolume();
  };
})();
