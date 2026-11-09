// Automated play-through of the web build in headless Chrome, on an emulated
// 2x (Retina-style) screen. Needs a test build being served on port 8000:
//
//   make web CFLAGS="-Iinclude -Wall -O2 -DGAME_TEST" \
//     TEST_EXPORTS=',"_web_test_powerup","_web_test_spawn","_web_test_probe"'
//   make serve            (in another terminal)
//   node tools/playtest.mjs /tmp/playtest-output
//
// Delete out/*.wasm.o and run plain `make web` afterwards for the real game.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'playtest-output';
mkdirSync(OUT, { recursive: true });
const PORT = 9361, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1280,900',
   `--user-data-dir=${OUT}/profile`, 'about:blank'], { stdio: 'ignore' });
let url;
for (let i = 0; i < 60 && !url; i++) {
  try { url = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
  await sleep(200);
}
const ws = new WebSocket(url); let id = 0; const pending = new Map(); const problems = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) pending.get(m.id)?.(m.result || m.error);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) problems.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url);
};
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); writeFileSync(`${OUT}/${n}.jpg`, Buffer.from(r.data, 'base64')); };
const stats = async () => JSON.parse(await ev('Module.ccall("web_stats","string",[],[])'));
const probe = async () => JSON.parse(await ev('Module.ccall("web_test_probe","string",[],[])'));
const spawnHazard = k => ev(`Module.ccall("web_test_spawn",null,["number"],[${k}])`);
const powerup = k => ev(`Module.ccall("web_test_powerup",null,["number"],[${k}])`);
const SPACE = { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
const keyDown = () => send('Input.dispatchKeyEvent', { type: 'keyDown', ...SPACE, text: ' ' });
const keyUp = () => send('Input.dispatchKeyEvent', { type: 'keyUp', ...SPACE });
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); ok ? pass++ : fail++; };
const newRun = async () => { await ev(`nav('home')`); await sleep(300); await ev(`nav('play')`); await sleep(1200); };
const waitFor = async (pred, ms) => { const end = Date.now() + ms; let s; while (Date.now() < end) { s = await stats(); if (pred(s)) return s; await sleep(60); } return s; };
const ended = x => x.dying === 1 || x.playing === 0;

await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8000/' });
let ready = false;
for (let i = 0; i < 200 && !ready; i++) { await sleep(100); ready = await ev('typeof gameReady !== "undefined" && gameReady === true && !!call("web_saves_ready","number")'); }
check('game loads and saves are ready', ready);
await shot('01_home');

for (const page of ['home','characters','powerups','hazards','backgrounds','assets','leaderboard','settings']) {
  await ev(`nav('${page}')`); await sleep(400);
  check('page ' + page, await ev(`document.getElementById('${page}').classList.contains('active')`));
}
for (const t of ['Characters','Animations','Power-ups','Collectibles','Hazards','Missiles','Backgrounds','Cosmetics','Effects','Source Sheets']) {
  await ev(`nav('assets'); libTab='${t}'; renderAssets()`); await sleep(250);
  const n = await ev(`document.querySelectorAll('#assetContent .asset-card').length`);
  check('library tab ' + t, n > 0, n + ' cards');
}
await sleep(1500);
const broken = await ev(`[...document.querySelectorAll('#app img')].filter(i => i.complete && i.src && i.naturalWidth === 0).map(i => i.src)`);
check('no broken images', broken.length === 0, broken.slice(0, 3).join(' '));

// sharp canvas, and the mouse still lands on the game's buttons
await ev(`pickCharacter(0); pickCosmetic(0); call('web_set_background', null, ['number'], [0]); call('web_set_difficulty', null, ['number'], [0])`);
await newRun();
const dims = JSON.parse(await ev(`(()=>{const c=document.getElementById('canvas'),r=c.getBoundingClientRect();return JSON.stringify({bw:c.width,bh:c.height,cw:r.width,ch:r.height,x:r.left,y:r.top})})()`));
check('canvas uses the full 2x resolution', dims.bw >= dims.cw * 1.9, JSON.stringify(dims));
const clickGame = async (gx, gy) => {
  const x = dims.x + gx * dims.cw / 1000, y = dims.y + (gy + 64) * dims.ch / 564;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(80);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
};
await spawnHazard(0);
let s = await waitFor(ended, 5000);
check('zapper hit ends the run', ended(s));
await sleep(500); await shot('02_crash'); await sleep(1400); await shot('03_end_screen');
await clickGame(500, 365); await sleep(1200);
s = await stats();
check('PLAY AGAIN click lands', s.playing !== 0 && s.dying === 0 && s.distance < 500, 'distance=' + s.distance);
await spawnHazard(0); await waitFor(ended, 5000); await sleep(1900);
await clickGame(200, 365); await sleep(900);
check('MENU click returns to the site', await ev(`document.getElementById('home').classList.contains('active')`));

// movement
await newRun();
await powerup(0); await waitFor(x => x.powerup === 1, 1500);   // shield keeps random hazards out of this
s = await stats();
check('runs on the floor', s.anim === 'run' && s.onFloor === 1, s.anim);
check('feet on the floor line', Math.abs(s.runnerBottom - 450) <= 4, 'bottom=' + s.runnerBottom);
check('runner sprite box sized to a 100px body', s.runnerHeight >= 105 && s.runnerHeight <= 165, 'box=' + s.runnerHeight);
await shot('04_run');
const d0 = (await stats()).distance; await sleep(1000); const d1 = (await stats()).distance;
check('world speed', d1 - d0 >= 140 && d1 - d0 <= 240, (d1 - d0) + ' m/s');
await keyDown(); let sawJump = false;
s = await waitFor(x => { if (x.anim === 'jump') sawJump = true; return x.anim === 'fly' && x.onFloor === 0; }, 2000);
check('takeoff plays jump', sawJump);
check('thrust flies', s.anim === 'fly' && s.onFloor === 0, s.anim);
await sleep(250); await shot('05_fly'); await keyUp();
s = await waitFor(x => x.onFloor === 1, 3000); check('falls to the floor', s.onFloor === 1);
s = await waitFor(x => x.anim === 'run', 1500); check('lands and runs again', s.anim === 'run', s.anim);
await spawnHazard(0); await sleep(2200); s = await stats();
check('shield blocks a zapper', s.dying === 0 && s.playing !== 0);

// missile despawn
await newRun(); await powerup(0); await waitFor(x => x.powerup === 1, 1500);
await spawnHazard(4); await sleep(250);
const seen = (await stats()).rockets;
s = await waitFor(x => x.rockets === 0, 4000);
check('missile flies by and is gone', seen >= 1 && s.rockets === 0, 'seen=' + seen);

// the newer hazards
const NEW = [[5,'dual laser'],[6,'moving laser'],[7,'rotating laser'],[8,'homing rocket'],[9,'crate'],[10,'falling block']];
for (const [k, name] of NEW) {
  await newRun(); await spawnHazard(k);
  const a = await probe(); await sleep(350); const b = await probe();
  if (k === 6) check('moving laser slides', a.alive && b.alive && Math.abs(b.y - a.y) > 15, `${a.y} -> ${b.y}`);
  if (k === 7) { check('rotating laser spins', a.alive && b.alive && b.rot - a.rot > 0.3, `${a.rot} -> ${b.rot}`); await shot('06_rotating'); }
  if (k === 8) check('homing rocket steers', a.alive && b.alive && b.y < a.y - 8, `${a.y} -> ${b.y}`);
  s = await waitFor(ended, 6000);
  check(name + ' hit ends the run', ended(s));
}

// TECH ULTRA BOT
await newRun(); await powerup(3);
s = await waitFor(x => x.powerup === 1 && x.powerupType === 3, 1500);
check('TUB activates', s.powerupType === 3);
await sleep(180); await shot('07_tub_transform'); await sleep(800); await shot('08_tub');
for (const [k, name] of [[0,'zapper'],[1,'drone'],[2,'mine'],[4,'rocket'],...NEW]) {
  const before = (await stats()).tubSmashes;
  await spawnHazard(k);
  s = await waitFor(x => x.tubSmashes > before || x.dying === 1 || !x.powerup, 3500);
  if (!s.powerup) { await powerup(3); await waitFor(x => x.powerup === 1, 1500); await sleep(600); await spawnHazard(k); s = await waitFor(x => x.tubSmashes > before || x.dying === 1, 3500); }
  check('TUB smashes ' + name, s.tubSmashes > before && s.dying === 0, 'smashes=' + s.tubSmashes);
}
s = await waitFor(x => x.powerup === 0, 11000); check('TUB wears off', s.powerup === 0);
await sleep(200); await spawnHazard(3);
s = await waitFor(ended, 4000); check('after TUB, spikes hit again', ended(s));

// backgrounds, accessories, the Lion
await ev(`call('web_set_background', null, ['number'], [1]); pickCosmetic(9)`);
await newRun(); s = await stats();
check('arena: still on the floor', Math.abs(s.runnerBottom - 450) <= 4, 'bottom=' + s.runnerBottom);
await sleep(900); await shot('09_arena');
await ev(`pickCharacter(1); pickCosmetic(3)`);
await newRun(); s = await stats();
check('Nittany Lion runs on the floor', s.anim === 'run' && Math.abs(s.runnerBottom - 450) <= 4);
await sleep(900); await shot('10_lion');
await ev(`pickCosmetic(0); pickCharacter(0); call('web_set_background', null, ['number'], [0])`);

// smoothness on this machine
await ev(`nav('home')`); await sleep(300); await ev(`nav('play')`); await sleep(1000);
await powerup(0);
const fps = JSON.parse(await ev(`new Promise(res => { let n = 0, worst = 0, last = performance.now(); const t0 = last;
  (function f(now) { n++; if (now) { worst = Math.max(worst, now - last); last = now; }
    if (performance.now() - t0 < 4000) requestAnimationFrame(f);
    else res(JSON.stringify({ fps: Math.round(n / 4), worstFrameMs: Math.round(worst) })); })(); })`));
check('frame rate', fps.fps >= 55, JSON.stringify(fps));
await ev(`nav('home')`); await sleep(400);
check('leaving the game returns home', await ev(`document.getElementById('home').classList.contains('active')`));
check('no console errors or missing files', problems.length === 0, problems.slice(0, 5).join(' | '));
console.log(`\n${pass} passed, ${fail} failed`);
await send('Browser.close').catch(() => {}); await sleep(400); chrome.kill('SIGKILL');
process.exit(fail ? 1 : 0);
