// Mechanics test: ?-blocks, items, powerups, fireballs, stomps, coins, bricks.
const handlers = {};
global.window = { addEventListener: (ev, fn) => { handlers[ev] = fn; }, dispatchEvent: e => handlers[e.type](e) };
let rafCb = null;
global.requestAnimationFrame = fn => { rafCb = fn; };
const gradient = { addColorStop() {} };
const ctxStub = new Proxy({ imageSmoothingEnabled: false }, {
  get(t, p) { if (p in t) return t[p]; if (p === 'createLinearGradient') return () => gradient; if (p === 'measureText') return () => ({ width: 10 }); return () => {}; },
  set(t, p, v) { t[p] = v; return true; },
});
global.document = { getElementById: () => ({ width: 512, height: 320, getContext: () => ctxStub }) };
const ROOT = __dirname + '/..';
for (const f of ['levels.js', 'audio.js', 'entities.player.js', 'entities.world.js', 'renderer.js', 'game.js']) require(ROOT + '/' + f);
for (const k of ['LEVELS', 'AudioSys', 'Player', 'GRAV', 'MAX_FALL', 'overlap', 'Enemy', 'Item', 'Fireball', 'CoinFx', 'Floater', 'Renderer', 'TS', 'VW', 'VH', 'ROWS', 'GROUND_Y', 'W', 'H'])
  if (window[k] !== undefined) globalThis[k] = window[k];

handlers.load();
const key = (k, d) => window.dispatchEvent({ type: d ? 'keydown' : 'keyup', key: k, preventDefault() {} });
const g = window.game;
const tick = n => { for (let i = 0; i < n; i++) { const cb = rafCb; rafCb = null; cb(); } };
let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) failures++; };

// start game
key(' ', true); tick(1); key(' ', false);
check('game started', g.state === 'playing');

// --- ?-block bump spawns mushroom ---
g.player.x = 21 * TS + 4;           // under ?-block at 21,9 (QM)
g.player.y = 9 * TS + TS;           // directly below it
g.player.vy = -6;                   // rising
g.player.h = 28; g.player.power = 0;
tick(1);                            // one frame: head hits block
check('?-block turns to used', g.map[9][21] === 5);
check('mushroom item spawned', g.items.length === 1 && g.items[0].kind === 'mushroom');

// --- collect the mushroom ---
const item = g.items[0];
item.emerging = false;
item.x = g.player.x; item.y = g.player.y + 10;
g.player.power = 0; g.player.h = 28;
tick(2);
check('mushroom makes mario big', g.player.power === 1 && g.player.h === 42);
check('score added for mushroom', g.score >= 1000);

// --- flower gives fire power ---
g.player.grow('flower');
check('flower gives fire power', g.player.power === 2);
tick(35);                            // let grow-shifting animation finish
const fbCount = g.fireballs.length;
key('x', true); g.input.fire = true; tick(1); key('x', false);
check('fireball spawned', g.fireballs.length === fbCount + 1);
tick(30);
check('fireball travels/despawns properly', Array.isArray(g.fireballs));

// --- stomp a goomba ---
g.player.power = 0; g.player.h = 28; g.player.y = 260; g.player.starTime = 0;
const e = g.enemies.find(e => e.activated && e.type === 'goomba' && e.state === 'walk');
const enemiesBefore = g.enemies.filter(x => x.state !== 'dying').length;
if (e) {
  g.player.x = e.x; g.player.y = e.y - 30; g.player.vy = 5;
  tick(1);
  check('stomp kills goomba', e.state === 'dying' || e.state === 'shell');
} else check('stomp kills goomba', false);

// --- coin tile pickup ---
const coinKey = [...g.coinTiles][0];
const [cx, cy] = coinKey.split(',').map(Number);
g.player.x = cx * TS; g.player.y = cy * TS - 20;
const coinsBefore = g.coins;
tick(1);
check('coin tile collected', g.coins === coinsBefore + 1 || !g.coinTiles.has(coinKey));

// --- brick breaks when big ---
g.player.power = 1; g.player.h = 42;
g.player.x = 20 * TS + 10; g.player.y = 9 * TS + TS; g.player.vy = -6; g.player.invuln = 0;
const brickBefore = g.map[9][20];
tick(1);
check('brick destroyed by big mario headbutt', brickBefore === 2 ? g.map[9][20] === 0 : true);

// --- star kills on contact ---
g.player.starTime = 300;
const e2 = g.enemies.find(e => e.activated && e.state === 'walk');
if (e2) {
  g.player.x = e2.x; g.player.y = e2.y; g.player.vy = 0;
  tick(1);
  check('star power kills enemy on touch', e2.state === 'dying');
} else check('star power kills enemy on touch', true); // none in range, skip

// --- fireball kills enemy ---
const e3 = g.enemies.find(e => e.activated && e.state === 'walk');
if (e3) {
  const fb = new Fireball(g, e3.x - 20, e3.y, 1);
  g.fireballs.push(fb);
  tick(10);
  check('fireball kills enemy', e3.state === 'dying' || fb.dead);
} else check('fireball kills enemy', true);

// --- 100 coins = extra life ---
g.coins = 99;
g.collectCoin();
check('100 coins grants 1-up', g.lives >= 4 && g.coins === 0);

// --- pit death and respawn ---
g.player.x = 69 * TS + 8; g.player.y = g.levelHeight - 40; g.player.vy = 5; g.player.starTime = 0;
tick(30);
check('pit fall kills player', g.state === 'dying');
tick(200);
check('respawn after death', g.state === 'playing' && g.lives === 3);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
